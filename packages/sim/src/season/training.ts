import type { Rng } from "@falconess/rng";
import { scale } from "@falconess/rng";
import type { SeasonState, StatName, TrainingKind } from "@falconess/schema";
import {
  addDelta,
  changeFatigue,
  changeMood,
  type Draft,
  note,
  type SimContext,
} from "./context.js";
import { statCap } from "./difficulty.js";
import { crewBonusPm } from "./crew-sync.js";
import { addBond } from "./hangar.js";
import {
  moodDriftPm,
  restOptions,
  trainingMoodMultiplier,
  trainingRisk,
  trainingStreak,
} from "./rules.js";

export function facilityLevel(ctx: SimContext, uses: number): number {
  const { usesPerFacilityLevel, maxFacilityLevel } = ctx.ruleset.season;
  return Math.min(maxFacilityLevel, 1 + Math.floor(uses / usesPerFacilityLevel));
}

/** The parts of the state a training's gain reads. */
type GainState = Pick<
  SeasonState,
  "facilityUses" | "crewPresence" | "falconessId" | "mood" | "stats"
> &
  Partial<Pick<SeasonState, "bond">>;

/**
 * gain = floor(base[level] × (1 + Σ crewBonus) × m_train_mood × (1 + growth)): one floor at the
 * end so small bonuses are not lost to chained rounding. All factors per-mille; the mood factor is
 * the ruleset's training table (`trainMoodMult`, ADR-0006). Exported so the UI can preview the
 * number before the player commits (it is deterministic).
 */
export function trainingGain(
  ctx: SimContext,
  d: GainState,
  kind: TrainingKind,
  stat: StatName,
): number {
  const level = facilityLevel(ctx, d.facilityUses[kind]);
  const base = ctx.ruleset.season.trainBase[level - 1] ?? 8;
  const crews = d.crewPresence[kind] ?? [];
  let crewBonus = 0;
  for (const m of crews) crewBonus += crewBonusPm(ctx, m, d.bond?.[m] ?? 0);
  const growth = Math.round(ctx.content.getFalconess(d.falconessId).growth[stat] * 1000);
  const product =
    base * (1000 + crewBonus) * trainingMoodMultiplier(ctx.ruleset, d.mood) * (1000 + growth);
  return Math.max(1, Math.floor(product / 1_000_000_000));
}

export type StatGain = { readonly stat: StatName; readonly gain: number };

/**
 * A raw gain `raw` on a stat at `value` after the ruleset's diminishing returns (`growthBands`):
 * the raw points are spent band by band, each band's points counting its ‰, so a gain that
 * crosses a threshold pays full up to it and the rest at the band's rate. One floor at the end;
 * at least 1. Without bands the raw gain is returned unchanged (v1, v2).
 */
export function softenedGain(ctx: SimContext, value: number, raw: number): number {
  const bands = ctx.ruleset.season.growthBands;
  if (bands === undefined || bands.length === 0) return raw;
  let at = value * 1000; // milli-points
  let left = raw * 1000; // raw milli-points still to spend
  while (left > 0) {
    let pm = 1000;
    let next = Number.POSITIVE_INFINITY;
    for (const [from, rate] of bands) {
      if (at >= from * 1000) pm = rate;
      else if (from * 1000 < next) next = from * 1000;
    }
    const need = next === Number.POSITIVE_INFINITY ? left : Math.ceil(((next - at) * 1000) / pm);
    if (left <= need) {
      at += Math.floor((left * pm) / 1000);
      left = 0;
    } else {
      at = next;
      left -= need;
    }
  }
  return Math.max(1, Math.floor(at / 1000) - value);
}

/**
 * What a successful training adds, the main stat first: the primary and its secondary (at
 * `secondaryGain`), or a risk flight's courage and agility, each after the diminishing returns of
 * its stat (`softenedGain`; the "+N" the player sees). Before the statMax cap; a failure
 * loses `failLossPm` ‰ of each (at least 1).
 */
export function trainingGains(ctx: SimContext, state: GainState, kind: TrainingKind): StatGain[] {
  const S = ctx.ruleset.season;
  const soft = (stat: StatName, raw: number): StatGain => ({
    stat,
    gain: softenedGain(ctx, state.stats[stat], raw),
  });
  if (kind === "train:risk-flight") {
    const g = trainingGain(ctx, state, kind, "courage");
    return [
      soft("courage", scale(g, S.riskFlightCourage)),
      soft("agility", scale(g, S.riskFlightAgility)),
    ];
  }
  const primary = ctx.ruleset.trainingStat[kind];
  const g = trainingGain(ctx, state, kind, primary);
  const out: StatGain[] = [soft(primary, g)];
  const secondary = ctx.ruleset.trainingSecondary[kind];
  if (secondary) out.push(soft(secondary, Math.max(1, scale(g, S.secondaryGain))));
  return out;
}

function applyStat(ctx: SimContext, d: Draft, stat: StatName, delta: number): void {
  const before = d.stats[stat];
  const after = Math.max(
    ctx.ruleset.season.statMin,
    Math.min(statCap(ctx.ruleset, d), before + delta),
  );
  d.stats[stat] = after;
  if (after !== before) addDelta(d, stat, after - before);
}

/**
 * One training week. Draws on stream `training`: the failure roll (always), then the mood drift
 * when the ruleset has one (ADR-0006 D5, D6). The failure and injury chances are `trainingRisk`
 * at the fatigue before training.
 */
export function applyTraining(ctx: SimContext, d: Draft, kind: TrainingKind, rng: Rng): void {
  const S = ctx.ruleset.season;
  const fatigueBefore = d.fatigue;
  const { failPm, injuryPm } = trainingRisk(ctx.ruleset, fatigueBefore, kind);
  const roll = rng.nextPermille("training");
  const failed = roll < failPm;
  const injured = failed && roll < injuryPm;
  const gains = trainingGains(ctx, d, kind);

  if (failed) {
    for (const { stat, gain } of gains)
      applyStat(ctx, d, stat, -Math.max(1, Math.floor((gain * S.failLossPm) / 1000)));
    note(d, injured ? "log.train.injury" : "log.train.fail");
    changeMood(d, -S.failMoodLoss, "failure");
    if (injured) {
      d.injuryTurns = S.injuryTurns;
      if (kind !== "train:risk-flight" && fatigueBefore >= S.injuryFromFatigue)
        note(d, "log.vigor.exhausted");
    }
  } else {
    for (const { stat, gain } of gains) applyStat(ctx, d, stat, gain);
    if (kind === "train:simulator") d.skillPoints += S.simulatorSkillPoints;
    note(d, "log.train.ok");
  }

  d.facilityUses[kind] += 1;
  changeFatigue(ctx, d, S.fatigueCost[kind]);
  for (const m of d.crewPresence[kind] ?? []) addBond(ctx, d, m, S.bondPerTraining);

  const driftPm = moodDriftPm(ctx.ruleset, trainingStreak(d));
  if (driftPm > 0 && rng.chancePermille("training", driftPm)) changeMood(d, -1, "drift");
}

/** Quality note of a drawn rest: the lowest option, the highest, or one in between. */
function restQuality(index: number, options: number): string {
  if (index === 0) return "log.vigor.rest.poor";
  if (index === options - 1) return "log.vigor.rest.great";
  return "log.vigor.rest.normal";
}

/**
 * A rest week, chosen or (v1) forced: recover `restRecovery[i]` with `i` drawn by
 * `restRecoveryWeights` on stream `training` (one option: no draw), then mood +1 with
 * `restMoodUpChance` (ADR-0006 D4).
 */
export function applyRest(ctx: SimContext, d: Draft, rng: Rng, forced: boolean): void {
  const S = ctx.ruleset.season;
  note(d, forced ? "log.rest.forced" : "log.rest");
  const options = restOptions(ctx.ruleset);
  let recovery = options[0]?.recovery ?? -S.fatigueCost.rest;
  if (options.length > 1) {
    const i = rng.pickWeighted(
      "training",
      options.map((o) => o.weight),
    );
    recovery = options[i]?.recovery ?? recovery;
    note(d, restQuality(i, options.length));
  }
  changeFatigue(ctx, d, -recovery);
  if (rng.chancePermille("training", S.restMoodUpChance)) changeMood(d, 1, "rest");
}

export function applyOuting(ctx: SimContext, d: Draft, manufacturer: string | undefined): void {
  const S = ctx.ruleset.season;
  note(d, "log.outing");
  changeFatigue(ctx, d, S.fatigueCost.outing);
  changeMood(d, 1, "outing");
  const target = manufacturer ?? ctx.content.getFrame(d.equippedFrame).manufacturer;
  addBond(ctx, d, target, S.bondPerOuting);
}
