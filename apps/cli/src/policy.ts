import type { ActiveSkill, RunInput, SeasonState, WorkshopOp } from "@falconess/schema";
import { learnCap, lowestStat, resolveFrameBuild, type SimContext } from "@falconess/sim";

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

/**
 * Reference policy (tools/policies in the brief): option 0 on an event; a workshop visit to repair
 * a worn frame and to learn every useful generic active the skill points pay for (`skillsToLearn`,
 * one visit does both); rest when tired; otherwise train the lowest stat (BRIEF §12 metric 7).
 */
export function lowestStatPolicy(ctx: SimContext, state: SeasonState): RunInput {
  if (state.pendingEvent) return { kind: "event:choose", option: 0 };
  const learn: WorkshopOp[] = skillsToLearn(ctx, state).map((skillId) => ({
    op: "learn-skill",
    skillId,
  }));
  if (needsRepair(ctx, state)) return { kind: "workshop", ops: [{ op: "repair" }, ...learn] };
  if (learn.length > 0) return { kind: "workshop", ops: learn };
  if (state.fatigue >= REST_AT_FATIGUE) return { kind: "rest" };
  switch (lowestStat(state.stats)) {
    case "agility":
      return { kind: "train:agility" };
    case "stamina":
      return { kind: "train:stamina" };
    case "technique":
      return { kind: "train:technique" };
    case "courage":
      return { kind: "train:risk-flight" };
    case "intelligence":
      return { kind: "train:simulator" };
  }
}
