/**
 * The season's rules as pure functions of a ruleset and a state (ADR-0006 D9). The reducer calls
 * these, and so do the web and the CLI to show a chance or a preview before the player commits:
 * nobody copies a formula. Formulas, intention and ranges: docs/formulas.md «Temporada v2».
 */
import type { Mood, RunInputKind, SeasonState, TrainingKind } from "@falconess/schema";
import type { Ruleset } from "../rulesets/index.js";

export type TrainingRisk = {
  /** Chance that the training fails (part of the gains lost, mood down), per-mille. */
  readonly failPm: number;
  /** Part of `failPm` that is an injury (`injuryTurns` weeks out), per-mille. */
  readonly injuryPm: number;
};

/**
 * Failure and injury chance of a training at `fatigue` (the value before training).
 * "linear" (v1): `failBase + floor(fatigue / failPerFatigue)` for simple trainings, the simulator
 * never fails, a risk flight fails at `riskFlightFail` and injures at `riskFlightInjury`.
 * "curve" (v2): 0 up to `failCurveStart`, then `failCurveMax × x² / span²` with one floor; a risk
 * flight adds `riskFlightFail`, the simulator takes `simulatorFailPm` ‰ of the curve; a failure is
 * an injury with `injuryShareOfFail` ‰ when it is a risk flight or `fatigue ≥ injuryFromFatigue`.
 * One roll decides both: injured if roll < injuryPm, failed if roll < failPm.
 */
export function trainingRisk(ruleset: Ruleset, fatigue: number, kind: TrainingKind): TrainingRisk {
  const S = ruleset.season;
  const isRisk = kind === "train:risk-flight";
  const isSim = kind === "train:simulator";
  if (S.failModel === "linear") {
    const failPm = isSim
      ? 0
      : isRisk
        ? S.riskFlightFail
        : S.failBase + Math.floor(fatigue / S.failPerFatigue);
    return { failPm, injuryPm: isRisk ? S.riskFlightInjury : 0 };
  }
  const x = Math.max(0, fatigue - S.failCurveStart);
  const span = S.fatigueMax - S.failCurveStart;
  const curve = Math.floor((S.failCurveMax * x * x) / (span * span));
  const raw = isSim
    ? Math.floor((S.failCurveMax * S.simulatorFailPm * x * x) / (span * span * 1000))
    : isRisk
      ? S.riskFlightFail + curve
      : curve;
  const failPm = Math.min(1000, raw);
  const injuryPm =
    isRisk || fatigue >= S.injuryFromFatigue
      ? Math.floor((failPm * S.injuryShareOfFail) / 1000)
      : 0;
  return { failPm, injuryPm };
}

/** What the player sees (ADR-0006 D2): a bar that drains with training and fills with rest. */
export function vigor(ruleset: Ruleset, fatigue: number): number {
  return ruleset.season.fatigueMax - fatigue;
}

/** Mood multiplier on training gains (v2 ×0.80 … ×1.20; v1 the race table), per-mille. */
export function trainingMoodMultiplier(ruleset: Ruleset, mood: Mood): number {
  return ruleset.trainMoodMult[mood + 2] ?? 1000;
}

/** What turns this week's action into a rest: an injury (any input), or v1's forced rest. */
export type ActionBlock = "injured" | "forced-rest";

export function actionBlock(
  ruleset: Ruleset,
  state: Pick<SeasonState, "injuryTurns" | "fatigue">,
  kind: RunInputKind,
): ActionBlock | undefined {
  if (state.injuryTurns > 0) return "injured";
  if (kind.startsWith("train:") && state.fatigue >= ruleset.season.forcedRestAt)
    return "forced-rest";
  return undefined;
}

/**
 * Training weeks in a row at the end of the log: the weeks whose action was a training that was
 * actually trained. A rest, an outing, the workshop, an injured week or a forced rest cut the
 * streak; an event choice adds no week. After an input that trained, it counts that week.
 */
export function trainingStreak(state: Pick<SeasonState, "log">): number {
  let n = 0;
  for (let i = state.log.length - 1; i >= 0; i--) {
    const e = state.log[i];
    if (!e?.input) continue;
    if (!e.input.kind.startsWith("train:")) break;
    if (e.notes.includes("log.rest.forced") || e.notes.includes("log.injured")) break;
    n += 1;
  }
  return n;
}

/**
 * Chance (‰) that a training week which makes the streak `streak` long costs 1 mood:
 * `moodDriftBase + moodDriftPerStreak × max(0, streak − moodDriftFreeStreak)`, at most 1000.
 * 0 when the ruleset has no drift (v1): then the engine takes no draw.
 */
export function moodDriftPm(ruleset: Ruleset, streak: number): number {
  const S = ruleset.season;
  if (S.moodDriftBase <= 0 && S.moodDriftPerStreak <= 0) return 0;
  const p = S.moodDriftBase + S.moodDriftPerStreak * Math.max(0, streak - S.moodDriftFreeStreak);
  return Math.min(1000, p);
}

/** The drift chance the next training week would roll (the streak it would make). */
export function nextTrainingDriftPm(ruleset: Ruleset, state: Pick<SeasonState, "log">): number {
  return moodDriftPm(ruleset, trainingStreak(state) + 1);
}

export type RestOption = {
  /** Fatigue a rest removes (vigor it gives back). */
  readonly recovery: number;
  readonly weight: number;
  /** weight / total weight, per-mille, rounded. */
  readonly chancePm: number;
};

/** What a chosen rest can recover. One option = no draw (v1); several = a weighted draw (v2). */
export function restOptions(ruleset: Ruleset): RestOption[] {
  const S = ruleset.season;
  const weights = S.restRecovery.map((_, i) => S.restRecoveryWeights[i] ?? 0);
  const total = weights.reduce((a, w) => a + w, 0);
  return S.restRecovery.map((recovery, i) => {
    const weight = weights[i] ?? 0;
    return { recovery, weight, chancePm: total > 0 ? Math.round((weight * 1000) / total) : 0 };
  });
}

/** Whether a goal race finished at `place` (a DNF is last) costs 1 mood. */
export function raceLossCostsMood(ruleset: Ruleset, place: number): boolean {
  return place >= ruleset.season.raceLossMoodAt;
}
