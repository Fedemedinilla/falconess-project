import type { Rng } from "@falconess/rng";
import type { TrainingKind } from "@falconess/schema";
import type { Draft, SimContext } from "./context.js";

const TRAINING_KINDS: readonly TrainingKind[] = [
  "train:agility",
  "train:stamina",
  "train:technique",
  "train:risk-flight",
  "train:simulator",
];

export function hangarManufacturers(ctx: SimContext, d: Draft): string[] {
  const out: string[] = [];
  for (const frameId of d.hangar) {
    const m = ctx.content.getFrame(frameId).manufacturer;
    if (!out.includes(m)) out.push(m);
  }
  return out;
}

export function bondLevel(ctx: SimContext, bond: number): number {
  return Math.floor(bond / ctx.ruleset.season.bondLevelStep);
}

/**
 * Roll which crews show up this turn and for which trainings (BRIEF §8, hangar). Order is fixed
 * (hangar order, then training kind order) so the draw sequence is reproducible.
 */
export function rollCrewPresence(ctx: SimContext, d: Draft, rng: Rng): void {
  const presence: Record<string, string[]> = {};
  for (const kind of TRAINING_KINDS) presence[kind] = [];
  for (const mfrId of hangarManufacturers(ctx, d)) {
    const m = ctx.content.getManufacturer(mfrId);
    const p =
      ctx.ruleset.season.crewPresenceBase +
      ctx.ruleset.season.crewPresencePerBondLevel * bondLevel(ctx, d.bond[mfrId] ?? 0);
    if (!rng.chancePermille("training", p)) continue;
    for (const kind of TRAINING_KINDS) {
      if (m.crew.stats.includes(ctx.ruleset.trainingStat[kind])) presence[kind]?.push(mfrId);
    }
  }
  d.crewPresence = presence;
}

export function addBond(ctx: SimContext, d: Draft, mfrId: string, delta: number): void {
  const cur = d.bond[mfrId] ?? 0;
  d.bond[mfrId] = Math.max(0, Math.min(ctx.ruleset.season.bondMax, cur + delta));
}
