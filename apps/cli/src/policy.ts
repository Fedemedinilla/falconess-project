import type {
  ActiveSkill,
  FalconessStats,
  RunInput,
  SeasonState,
  TrainingKind,
  WorkshopOp,
} from "@falconess/schema";
import {
  actionBlock,
  learnCap,
  lowestStat,
  RULESET_V1,
  resolveFrameBuild,
  type SimContext,
  trainingRisk,
} from "@falconess/sim";

/**
 * Hangar of the reference seasons (`sim:season-batch` and S7 of `sim:batch`): one generic frame per
 * style, so `startSeason` equips the one matching each Falconess's preferred style.
 */
export const REFERENCE_HANGAR: readonly string[] = ["shiden", "mule", "nimbus", "falke"];

/** Rest at this fatigue or above (below the season's forced rest at 80). */
export const REST_AT_FATIGUE = 60;

/**
 * Repair when the equipped frame's durability is below this share (‰) of its maximum (risk R8:
 * durability persists between goal races, ADR-0003 D35). Half the maximum leaves room for one
 * more race of normal wear, so the policy spends a turn only on a frame a race actually wore down.
 */
export const REPAIR_BELOW_PM = 500;

/** True when the equipped frame's persisted durability is under `REPAIR_BELOW_PM` of its maximum. */
export function needsRepair(ctx: SimContext, state: SeasonState): boolean {
  const frameId = state.equippedFrame;
  const max = resolveFrameBuild(
    ctx.content,
    frameId,
    state.installedParts,
    state.frameQuirks[frameId] ?? [],
  ).durabilityMax;
  const current = state.frameDurability[frameId] ?? max;
  return current * 1000 < REPAIR_BELOW_PM * max;
}

/**
 * The generic actives worth learning now (ADR-0005 «Pasada 2», decision 2): actives no Falconess
 * owns (`uniqueTo` unset) that are not learned yet and whose trigger can fire on a goal course
 * still ahead (goal turn ≥ the state's turn). A `segment` trigger needs that segment type on one of
 * those courses; phase, position, heat and energy triggers can fire on any course. Cheapest first,
 * ties by id. Empty after the last goal race.
 */
export function usefulGenericActives(ctx: SimContext, state: SeasonState): ActiveSkill[] {
  const courses = ctx.content
    .getFalconess(state.falconessId)
    .seasonGoals.filter((g) => g.turn >= state.turn)
    .map((g) => ctx.content.getCourse(g.courseId));
  if (courses.length === 0) return [];
  const out: ActiveSkill[] = [];
  for (const skill of ctx.content.skills.values()) {
    if (skill.kind !== "active" || skill.uniqueTo !== undefined) continue;
    if (state.learnedSkills.includes(skill.id)) continue;
    const segment = skill.trigger.segment;
    if (segment !== undefined && !courses.some((c) => c.segments.some((s) => s.type === segment)))
      continue;
    out.push(skill);
  }
  return out.sort((a, b) => a.cost - b.cost || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * What the policy learns at the workshop now: the useful generic actives in cheapest-first order
 * while the skill points last, up to the learn cap (`learnCap`: `maxLearnedSkills` plus the
 * build's skill slots, the unique skill included). Empty when the cheapest one is unaffordable or
 * the cap is reached. With the v1 economy (5 points per simulator session, generic actives 60-150)
 * the lowest-stat training ends a season with 25-50 points, so the rule never fires in the
 * reference seasons (ADR-0005 «Pasada 2»).
 */
export function skillsToLearn(ctx: SimContext, state: SeasonState): string[] {
  let points = state.skillPoints;
  let room = learnCap(ctx, state) - state.learnedSkills.length;
  const out: string[] = [];
  for (const skill of usefulGenericActives(ctx, state)) {
    if (room <= 0 || skill.cost > points) break;
    points -= skill.cost;
    room -= 1;
    out.push(skill.id);
  }
  return out;
}

/** The training whose main stat is the lowest (ties: the first in `STAT_ORDER`). */
export function lowestStatTraining(stats: FalconessStats): TrainingKind {
  switch (lowestStat(stats)) {
    case "agility":
      return "train:agility";
    case "stamina":
      return "train:stamina";
    case "technique":
      return "train:technique";
    case "courage":
      return "train:risk-flight";
    case "intelligence":
      return "train:simulator";
  }
}

/** The workshop visit both policies make: repair a worn frame, learn the useful generic actives. */
function workshopVisit(ctx: SimContext, state: SeasonState): RunInput | undefined {
  const learn: WorkshopOp[] = skillsToLearn(ctx, state).map((skillId) => ({
    op: "learn-skill",
    skillId,
  }));
  if (needsRepair(ctx, state)) return { kind: "workshop", ops: [{ op: "repair" }, ...learn] };
  if (learn.length > 0) return { kind: "workshop", ops: learn };
  return undefined;
}

/**
 * Lowest-stat policy (tools/policies in the brief; the reference of ruleset v1): option 0 on an
 * event; a workshop visit to repair a worn frame and to learn every useful generic active the skill
 * points pay for (`skillsToLearn`, one visit does both); rest when tired; otherwise train the
 * lowest stat (BRIEF §12 metric 7). It never goes on an outing: under v1 the forced rest at
 * fatigue 80 is its safety net.
 */
export function lowestStatPolicy(ctx: SimContext, state: SeasonState): RunInput {
  if (state.pendingEvent) return { kind: "event:choose", option: 0 };
  const visit = workshopVisit(ctx, state);
  if (visit) return visit;
  if (state.fatigue >= REST_AT_FATIGUE) return { kind: "rest" };
  return { kind: lowestStatTraining(state.stats) };
}

export type CarefulOptions = {
  /** Rest (or go out) once the next training's failure chance passes this, per-mille. */
  readonly maxFailPm: number;
  /** Go out whenever mood is below this. */
  readonly moodFloor: number;
};

/**
 * The careful player of the v2 study (`.work/design2/fatiga-animo.md` §4, «cuidadosa» f0 m1): rest
 * or go out before the failure chance rises, go out when mood is below +1.
 */
export const CAREFUL: CarefulOptions = { maxFailPm: 0, moodFloor: 1 };

/** Mood at the top of the scale: an outing would add nothing. */
const MOOD_TOP = 2;

/**
 * Careful policy (the reference of ruleset v2, ADR-0006 «Métrica 7»): option 0 on an event and
 * the same workshop visit as `lowestStatPolicy`. Then it looks at the lowest stat's training and
 * its failure chance from the sim (`trainingRisk`, the vigor before training). Over
 * `maxFailPm` (and over what that training risks fresh, so a risk flight's fixed chance never
 * blocks it) it recovers instead: an outing when mood is below the top and the outing's vigor
 * brings the chance back down, else a rest. It also goes out when mood is below `moodFloor`.
 * Otherwise it trains the lowest stat. A training the ruleset would turn into a forced rest
 * (v1 only) is replaced by a rest.
 */
export function carefulPolicy(
  ctx: SimContext,
  state: SeasonState,
  opts: CarefulOptions = CAREFUL,
): RunInput {
  if (state.pendingEvent) return { kind: "event:choose", option: 0 };
  const visit = workshopVisit(ctx, state);
  if (visit) return visit;
  const target = lowestStatTraining(state.stats);
  const R = ctx.ruleset;
  const risk = trainingRisk(R, state.fatigue, target).failPm;
  const fresh = trainingRisk(R, 0, target).failPm;
  if ((risk > opts.maxFailPm && risk > fresh) || actionBlock(R, state, target) === "forced-rest") {
    const after = Math.max(0, state.fatigue + R.season.fatigueCost.outing);
    const riskAfter = trainingRisk(R, after, target).failPm;
    const outingHelps = riskAfter <= opts.maxFailPm || riskAfter <= fresh;
    if (state.mood < MOOD_TOP && outingHelps && after < R.season.forcedRestAt)
      return { kind: "outing" };
    return { kind: "rest" };
  }
  if (state.mood < opts.moodFloor) return { kind: "outing" };
  return { kind: target };
}

/**
 * The reference policy of the run's ruleset (metric 7, `sim:season-batch`, `pnpm sim`; ADR-0006
 * «Consecuencias», Métrica 7: option (a) of the v2 study): ruleset v1 keeps `lowestStatPolicy`,
 * so v1's metrics stay comparable; every later ruleset plays `carefulPolicy`, since without a
 * forced rest a reference player has to look after vigor and mood herself.
 */
export function referencePolicy(ctx: SimContext, state: SeasonState): RunInput {
  return ctx.ruleset.version === RULESET_V1.version
    ? lowestStatPolicy(ctx, state)
    : carefulPolicy(ctx, state);
}
