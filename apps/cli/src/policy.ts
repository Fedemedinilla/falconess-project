import type {
  ActiveSkill,
  Distance,
  FalconessStats,
  Position,
  RunInput,
  SeasonState,
  TrainingKind,
  WorkshopOp,
} from "@falconess/schema";
import {
  actionBlock,
  distanceOfLength,
  flightOf,
  learnCap,
  lowestStat,
  RULESET_V1,
  RULESET_V2,
  type Ruleset,
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
 * What a build asks of each stat the attentive player trains, as ‰ of her Agility (the pillar,
 * 1000): she trains the stat furthest below its share (Agility when none is). 0 = never trained
 * on purpose. Intelligence is not here: it comes from the simulator weeks.
 */
export type BuildTargets = {
  readonly stamina: number;
  readonly technique: number;
  readonly courage: number;
};

/**
 * Stamina the attentive player builds for the longest goal still ahead, ‰ of Agility (owner
 * 2026-11-10: the goals push the build; a Long goal asks for Stamina, a Sprint one barely does).
 */
export const STAMINA_FOR_DISTANCE: Readonly<Record<Distance, number>> = {
  sprint: 450,
  mile: 550,
  medium: 700,
  long: 850,
};

/** The rest of the attentive build: Technique comes half from Agility training, Courage half from Stamina. */
export const ATTENTIVE_TECHNIQUE = 550;
export const ATTENTIVE_COURAGE = 400;

/** Distance order, short to long. */
const DISTANCE_ORDER: readonly Distance[] = ["sprint", "mile", "medium", "long"];

/**
 * The longest distance among her goals still ahead (all goals after the last one), or undefined
 * on a ruleset without distances (v1, v2).
 */
export function longestGoalDistance(ctx: SimContext, state: SeasonState): Distance | undefined {
  const F = flightOf(ctx.ruleset);
  if (F === null) return undefined;
  const goals = ctx.content.getFalconess(state.falconessId).seasonGoals;
  const ahead = goals.filter((g) => g.turn >= state.turn);
  let best = -1;
  for (const g of ahead.length > 0 ? ahead : goals) {
    const course = ctx.content.getCourse(g.courseId);
    const lengthMm = course.segments.reduce((n, seg) => n + seg.length, 0) * 1000;
    best = Math.max(best, DISTANCE_ORDER.indexOf(distanceOfLength(F, lengthMm)));
  }
  return DISTANCE_ORDER[best];
}

/** The build her goals ask for (the intended build): Stamina by the longest goal ahead. */
export function intendedBuild(ctx: SimContext, state: SeasonState): BuildTargets {
  const d = longestGoalDistance(ctx, state) ?? "medium";
  return {
    stamina: STAMINA_FOR_DISTANCE[d],
    technique: ATTENTIVE_TECHNIQUE,
    courage: ATTENTIVE_COURAGE,
  };
}

/** The off-build of the season study: all Agility, no Stamina, whatever her goals ask. */
export function agilityOnlyBuild(): BuildTargets {
  return { stamina: 0, technique: ATTENTIVE_TECHNIQUE, courage: ATTENTIVE_COURAGE };
}

/** The training of the stat furthest below its share of Agility (ties: Agility, Stamina, Technique, Courage). */
export function buildTraining(stats: FalconessStats, build: BuildTargets): TrainingKind {
  const agi = Math.max(1, stats.agility);
  let pick: TrainingKind = "train:agility";
  let worst = 1000; // Agility's own share
  const rows: [TrainingKind, number, number][] = [
    ["train:stamina", stats.stamina, build.stamina],
    ["train:technique", stats.technique, build.technique],
    ["train:risk-flight", stats.courage, build.courage],
  ];
  for (const [kind, value, target] of rows) {
    if (target <= 0) continue;
    // her share of the target, ‰ (1000 = on target), compared on Agility's scale
    const share = Math.floor((value * 1_000_000) / (agi * target));
    if (share < worst) {
      worst = share;
      pick = kind;
    }
  }
  return pick;
}

/** Her best position letter (ties: her preferred position, then lead, pack, stalk, closer). */
export function bestLetterPosition(ctx: SimContext, state: SeasonState): Position {
  const f = ctx.content.getFalconess(state.falconessId);
  const order: Position[] = [f.preferredPosition, "lead", "pack", "stalk", "closer"];
  const rank = (p: Position) => "SABCDEFG".indexOf(state.positionAptitude[p]);
  let best = order[0] ?? "lead";
  for (const p of order) if (rank(p) < rank(best)) best = p;
  return best;
}

/** The action of the last week played (event choices skipped), if any. */
function lastWeekKind(state: SeasonState): string | undefined {
  for (let i = state.log.length - 1; i >= 0; i--) {
    const kind = state.log[i]?.input?.kind;
    if (kind !== undefined && kind !== "event:choose") return kind;
  }
  return undefined;
}

export type AttentiveOptions = {
  /** Rest once vigor adds this to the next training's failure chance, ‰ (vigor ≈ 35). */
  readonly restAtFailPm: number;
  /**
   * Use the simulator from this fatigue (vigor 55 or less), never two weeks running: a lighter week
   * that earns skill points and gives back a little vigor.
   */
  readonly simulatorFromFatigue: number;
  /** Go out when mood is below this. */
  readonly moodFloor: number;
  /**
   * Learn at the workshop on a light week (instead of the simulator) once she can pay this many
   * useful skills: the visit costs the week.
   */
  readonly learnAtOnce: number;
};

/** The attentive player's habits (owner's playtest 2026-11-10: rests at vigor ≈ 20-40, ~12 simulator weeks). */
export const ATTENTIVE: AttentiveOptions = {
  restAtFailPm: 100,
  simulatorFromFatigue: 45,
  moodFloor: 0,
  learnAtOnce: 2,
};

/**
 * Attentive policy («jugadora atenta», owner's feedback 2026-11-10): trains like a sensible human.
 * Option 0 on an event and the same workshop visit as the other policies (repair, learn every
 * useful generic active she can pay). Then: rest when the next training fails `restAtFailPm` ‰ or
 * more (or the ruleset would force a rest); go out when mood is below `moodFloor`; a tired but not
 * exhausted week (fatigue ≥ `simulatorFromFatigue`) goes to the simulator, which restores vigor and
 * earns skill points; otherwise train the stat of `build` furthest below its share of Agility (the
 * pillar). A goal race week runs in her best position letter.
 */
export function attentivePolicy(
  ctx: SimContext,
  state: SeasonState,
  build: BuildTargets = intendedBuild(ctx, state),
  opts: AttentiveOptions = ATTENTIVE,
): RunInput {
  if (state.pendingEvent) return { kind: "event:choose", option: 0 };
  if (needsRepair(ctx, state)) {
    const visit = workshopVisit(ctx, state);
    if (visit) return visit;
  }
  const R = ctx.ruleset;
  const raceWeek = ctx.content
    .getFalconess(state.falconessId)
    .seasonGoals.some((g) => g.turn === state.turn);
  const withPosition = (input: RunInput): RunInput =>
    raceWeek && flightOf(R) !== null && input.kind !== "event:choose" && input.kind !== "start"
      ? { ...input, position: bestLetterPosition(ctx, state) }
      : input;
  const target = buildTraining(state.stats, build);
  // what vigor adds to the chance: a risk flight's fixed chance never sends her to rest
  const risk = trainingRisk(R, state.fatigue, target).failPm - trainingRisk(R, 0, target).failPm;
  if (risk >= opts.restAtFailPm || actionBlock(R, state, target) === "forced-rest")
    return withPosition({ kind: "rest" });
  if (state.mood < opts.moodFloor) return withPosition({ kind: "outing" });
  if (state.fatigue >= opts.simulatorFromFatigue && lastWeekKind(state) !== "train:simulator") {
    // a visit costs the week: she learns on a light week, once she can pay `learnAtOnce` skills
    const visit =
      skillsToLearn(ctx, state).length >= opts.learnAtOnce ? workshopVisit(ctx, state) : undefined;
    return withPosition(visit ?? { kind: "train:simulator" });
  }
  return withPosition({ kind: target });
}

/** The off-build attentive player: same habits, all Agility and no Stamina. */
export function agilityOnlyPolicy(ctx: SimContext, state: SeasonState): RunInput {
  return attentivePolicy(ctx, state, agilityOnlyBuild());
}

/** The season-study policies by name (`sim:season-batch -- --policy`). */
export const POLICIES = {
  referencia: (ctx: SimContext, s: SeasonState) => referencePolicy(ctx, s),
  atenta: (ctx: SimContext, s: SeasonState) => attentivePolicy(ctx, s),
  cuidadosa: (ctx: SimContext, s: SeasonState) => carefulPolicy(ctx, s),
  "solo-agilidad": agilityOnlyPolicy,
  "stat-baja": lowestStatPolicy,
} as const;
export type PolicyName = keyof typeof POLICIES;

/**
 * The reference policy of the run's ruleset (metric 7, B4 of ADR-0010, `sim:season-batch`,
 * `pnpm sim`): ruleset v1 keeps `lowestStatPolicy` and v2 `carefulPolicy` (ADR-0006 «Métrica 7»),
 * so their metrics stay comparable; v3 plays `attentivePolicy` (owner 2026-11-10: the careful
 * player rests so much that rivals tuned to her were trivial for a person playing sensibly).
 */
export function referencePolicy(ctx: SimContext, state: SeasonState): RunInput {
  switch (referencePolicyKind(ctx.ruleset)) {
    case "lowest-stat":
      return lowestStatPolicy(ctx, state);
    case "careful":
      return carefulPolicy(ctx, state);
    case "attentive":
      return attentivePolicy(ctx, state);
  }
}

/** Which policy `referencePolicy` plays on a ruleset (the batch report names it, S7's note). */
export type ReferencePolicyKind = "lowest-stat" | "careful" | "attentive";

export function referencePolicyKind(ruleset: Ruleset): ReferencePolicyKind {
  if (ruleset.version === RULESET_V1.version) return "lowest-stat";
  return ruleset.version === RULESET_V2.version ? "careful" : "attentive";
}
