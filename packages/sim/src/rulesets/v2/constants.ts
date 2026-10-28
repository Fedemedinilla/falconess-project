/**
 * Ruleset v2 (ADR-0006, owner's decision after playtest 1): vigor that drains with no forced rest,
 * training failures that climb as vigor runs low, mood that weighs on training, a harder rival
 * field and grade thresholds ×1.1. Everything not listed here is v1's number. The constants come
 * from the design study measured with `pnpm sim:season-batch` (.work/design2/fatiga-animo.md §9).
 * Never delete a ruleset: v1 stays so every v1 run still replays.
 */
import {
  FIELD as FIELD_V1,
  type FieldConstants,
  SEASON as SEASON_V1,
  type SeasonConstants,
} from "../v1/constants.js";

export const RULESET_VERSION = "v2" as const;

/** Mood −2 … +2 → index 0 … 4, applied to race stats. Smaller than v1's: mood now weighs on training. */
export const MOOD_MULT: readonly [number, number, number, number, number] = [
  960, 980, 1000, 1020, 1040,
];

/** Mood −2 … +2 → index 0 … 4, applied to training gains (Umamusume's −20 % … +20 %). */
export const TRAIN_MOOD_MULT: readonly [number, number, number, number, number] = [
  800, 900, 1000, 1100, 1200,
];

export const SEASON: SeasonConstants = {
  ...SEASON_V1,
  /** No forced rest: training is the player's call, failures carry the risk. */
  forcedRestAt: SEASON_V1.fatigueMax + 1,
  fatigueCost: {
    ...SEASON_V1.fatigueCost,
    "train:simulator": 5,
    /** A week spent injured recovers the mean of a chosen rest. */
    rest: -50,
    outing: -20,
  },
  failModel: "curve",
  failCurveStart: 40,
  failCurveMax: 600,
  simulatorFailPm: 500,
  /** Vigor 20 or less: a quarter of the failures are injuries. */
  injuryFromFatigue: 80,
  injuryShareOfFail: 250,
  restRecovery: [30, 50, 70],
  restRecoveryWeights: [1, 2, 1],
  restMoodUpChance: 250,
  moodDriftBase: 20,
  moodDriftPerStreak: 40,
  moodDriftFreeStreak: 2,
  raceLossMoodAt: 6,
  gradeThresholds: [
    ["SS", 4950],
    ["S", 4510],
    ["A", 4070],
    ["B", 3190],
    ["C", 2750],
    ["D", 2310],
    ["E", 1870],
    ["F", 1430],
    ["G", 0],
  ],
};

/** Rival field: weaker at the start, faster growth (study: 75 + 9t → 60 + 11t). */
export const FIELD: FieldConstants = {
  ...FIELD_V1,
  rivalBase: 60,
  rivalPerTurn: 11,
};
