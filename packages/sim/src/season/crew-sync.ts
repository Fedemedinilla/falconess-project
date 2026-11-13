/**
 * PROTOTYPE (owner 2026-11-13, «3 + 1»: not in the game yet). Crews like Umamusume's support
 * cards: a crew that shows up stands at ONE of its trainings, drawn, and is seen before choosing;
 * below `minBond` it adds `basePm` ‰ to that training, from `minBond` on («sintonía», the friendship
 * training) `syncPm` ‰. Read from an optional `crewSync` on the season constants; absent = today's
 * rule (every matching training, the maker's `trainingBonus`, bond only raises the presence).
 */
import type { SimContext } from "./context.js";
import type { SeasonConstants } from "../rulesets/v1/constants.js";

export type CrewSync = {
  readonly basePm: number;
  readonly minBond: number;
  readonly syncPm: number;
};

export function crewSyncOf(ctx: SimContext): CrewSync | undefined {
  return (ctx.ruleset.season as SeasonConstants & { readonly crewSync?: CrewSync }).crewSync;
}

/** A crew's bonus at a training, ‰, by its bond (`crewSync`) or its maker's flat bonus. */
export function crewBonusPm(ctx: SimContext, manufacturer: string, bond: number): number {
  const sync = crewSyncOf(ctx);
  if (!sync) return Math.round(ctx.content.getManufacturer(manufacturer).crew.trainingBonus * 1000);
  return bond >= sync.minBond ? sync.syncPm : sync.basePm;
}
