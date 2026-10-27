import type { Rng } from "@falconess/rng";
import { scale } from "@falconess/rng";
import type { StatName, TrainingKind } from "@falconess/schema";
import { moodMultiplier } from "../stats.js";
import { addDelta, type Draft, note, type SimContext } from "./context.js";
import { addBond } from "./hangar.js";

export function facilityLevel(ctx: SimContext, uses: number): number {
  const { usesPerFacilityLevel, maxFacilityLevel } = ctx.ruleset.season;
  return Math.min(maxFacilityLevel, 1 + Math.floor(uses / usesPerFacilityLevel));
}

/**
 * gain = floor(base[level] × (1 + Σ crewBonus) × m_mood × (1 + growth)): one floor at the end so
 * small bonuses are not lost to chained rounding. All factors per-mille.
 * Exported so the UI can preview the number before the player commits (it is deterministic).
 */
export function trainingGain(
  ctx: SimContext,
  d: Draft,
  kind: TrainingKind,
  stat: StatName,
): number {
  const level = facilityLevel(ctx, d.facilityUses[kind]);
  const base = ctx.ruleset.season.trainBase[level - 1] ?? 8;
  const crews = d.crewPresence[kind] ?? [];
  let crewBonus = 0;
  for (const m of crews)
    crewBonus += Math.round(ctx.content.getManufacturer(m).crew.trainingBonus * 1000);
  const growth = Math.round(ctx.content.getFalconess(d.falconessId).growth[stat] * 1000);
  const product = base * (1000 + crewBonus) * moodMultiplier(ctx.ruleset, d.mood) * (1000 + growth);
  return Math.max(1, Math.floor(product / 1_000_000_000));
}

function applyStat(ctx: SimContext, d: Draft, stat: StatName, delta: number): void {
  const before = d.stats[stat];
  const after = Math.max(
    ctx.ruleset.season.statMin,
    Math.min(ctx.ruleset.season.statMax, before + delta),
  );
  d.stats[stat] = after;
  if (after !== before) addDelta(d, stat, after - before);
}

export function applyTraining(ctx: SimContext, d: Draft, kind: TrainingKind, rng: Rng): void {
  const S = ctx.ruleset.season;
  const primary = ctx.ruleset.trainingStat[kind];
  const isRisk = kind === "train:risk-flight";
  const isSim = kind === "train:simulator";

  const failP = isSim
    ? 0
    : isRisk
      ? S.riskFlightFail
      : S.failBase + Math.floor(d.fatigue / S.failPerFatigue);
  const roll = rng.nextPermille("training");
  const failed = roll < failP;
  const injured = isRisk && roll < S.riskFlightInjury;

  const gains: Array<[StatName, number]> = [];
  if (isRisk) {
    const g = trainingGain(ctx, d, kind, "courage");
    gains.push(
      ["courage", scale(g, S.riskFlightCourage)],
      ["agility", scale(g, S.riskFlightAgility)],
    );
  } else {
    const g = trainingGain(ctx, d, kind, primary);
    gains.push([primary, g]);
    const secondary = ctx.ruleset.trainingSecondary[kind];
    if (secondary) gains.push([secondary, Math.max(1, scale(g, S.secondaryGain))]);
  }

  if (failed) {
    for (const [stat, g] of gains) applyStat(ctx, d, stat, -Math.max(1, Math.floor(g / 2)));
    d.mood = Math.max(-2, d.mood - 1);
    note(d, injured ? "log.train.injury" : "log.train.fail");
    if (injured) d.injuryTurns = S.injuryTurns;
  } else {
    for (const [stat, g] of gains) applyStat(ctx, d, stat, g);
    if (isSim) d.skillPoints += S.simulatorSkillPoints;
    note(d, "log.train.ok");
  }

  d.facilityUses[kind] += 1;
  d.fatigue = Math.max(0, Math.min(S.fatigueMax, d.fatigue + S.fatigueCost[kind]));
  for (const m of d.crewPresence[kind] ?? []) addBond(ctx, d, m, S.bondPerTraining);
}

export function applyRest(ctx: SimContext, d: Draft, rng: Rng, forced: boolean): void {
  const S = ctx.ruleset.season;
  d.fatigue = Math.max(0, d.fatigue + S.fatigueCost.rest);
  if (rng.chancePermille("training", S.restMoodUpChance)) d.mood = Math.min(2, d.mood + 1);
  note(d, forced ? "log.rest.forced" : "log.rest");
}

export function applyOuting(ctx: SimContext, d: Draft, manufacturer: string | undefined): void {
  const S = ctx.ruleset.season;
  d.fatigue = Math.max(0, d.fatigue + S.fatigueCost.outing);
  d.mood = Math.min(2, d.mood + 1);
  const target = manufacturer ?? ctx.content.getFrame(d.equippedFrame).manufacturer;
  addBond(ctx, d, target, S.bondPerOuting);
  note(d, "log.outing");
}
