/**
 * ADR-0016 (owner 2026-11-13, «3 + 1»): crews like Umamusume's support cards. A crew that shows
 * up stands at ONE of its trainings, seen before choosing; below `minBond` it adds `basePm` ‰ to
 * that training, from `minBond` on («sintonía», the friendship training) `syncPm` ‰. Without
 * `crewSync` (v1, v2): every matching training, the maker's flat `trainingBonus`.
 */
import type { CrewSyncConstants } from "../rulesets/v1/constants.js";
import type { SimContext } from "./context.js";

export function crewSyncOf(ctx: SimContext): CrewSyncConstants | undefined {
  return ctx.ruleset.season.crewSync;
}

/** Whether a crew with this bond is in sintonía (always false without `crewSync`). */
export function inSync(ctx: SimContext, bond: number): boolean {
  const sync = crewSyncOf(ctx);
  return sync !== undefined && bond >= sync.minBond;
}

/** A crew's bonus at a training, ‰, by its bond (`crewSync`) or its maker's flat bonus. */
export function crewBonusPm(ctx: SimContext, manufacturer: string, bond: number): number {
  const sync = crewSyncOf(ctx);
  if (!sync) return Math.round(ctx.content.getManufacturer(manufacturer).crew.trainingBonus * 1000);
  return bond >= sync.minBond ? sync.syncPm : sync.basePm;
}
