import type { RunInput, SeasonState } from "@falconess/schema";
import { lowestStat, resolveFrameBuild, type SimContext } from "@falconess/sim";

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
 * Reference policy (tools/policies in the brief): option 0 on an event, repair a worn frame at the
 * workshop, rest when tired, otherwise train the lowest stat.
 */
export function lowestStatPolicy(ctx: SimContext, state: SeasonState): RunInput {
  if (state.pendingEvent) return { kind: "event:choose", option: 0 };
  if (needsRepair(ctx, state)) return { kind: "workshop", ops: [{ op: "repair" }] };
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
