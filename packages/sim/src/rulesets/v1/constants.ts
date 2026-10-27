/**
 * Ruleset v1: every tunable number of the simulation, with its intention in docs/formulas.md.
 * Change only with a `pnpm sim:batch` report attached to the PR. Never delete a ruleset.
 * Multipliers are per-mille (1000 = ×1.0); distances and speeds ×1000 inside the race engine.
 */
import type { Aptitude, Grade, Mood, StatName, TrainingKind } from "@falconess/schema";

export const RULESET_VERSION = "v1" as const;

export const APTITUDE_MULT: Readonly<Record<Aptitude, number>> = {
  S: 1100,
  A: 1050,
  B: 1000,
  C: 950,
  D: 900,
  E: 850,
  F: 800,
  G: 700,
};

/** Mood −2 … +2 → index 0 … 4. */
export const MOOD_MULT: readonly [number, number, number, number, number] = [
  950, 980, 1000, 1050, 1100,
];
export function moodMult(mood: Mood): number {
  return MOOD_MULT[mood + 2] ?? 1000;
}

export const SEASON = {
  turns: 48,
  statMin: 1,
  statMax: 1200,
  fatigueMax: 100,
  forcedRestAt: 80,
  /**
   * Training gain base per facility level 1–5. Calibrated so the reference policy ends a season
   * with stats in 550–800 (BRIEF §8); first pass, pending `sim:season-batch` with the real engine.
   */
  trainBase: [44, 52, 60, 68, 76] as const,
  /** Secondary stat gain as per-mille of the primary gain. */
  secondaryGain: 500,
  usesPerFacilityLevel: 4,
  maxFacilityLevel: 5,
  /** Per-mille scale of the two stats a risk flight trains. */
  riskFlightCourage: 1200,
  riskFlightAgility: 500,
  simulatorSkillPoints: 5,
  fatigueCost: {
    "train:agility": 20,
    "train:stamina": 20,
    "train:technique": 20,
    "train:risk-flight": 30,
    "train:simulator": 10,
    workshop: 5,
    rest: -40,
    outing: -10,
  } as const satisfies Record<TrainingKind | "workshop" | "rest" | "outing", number>,
  /** Per-mille failure chances. Simple training adds floor(fatigue / 4). */
  failBase: 50,
  failPerFatigue: 4,
  riskFlightFail: 120,
  riskFlightInjury: 30,
  injuryTurns: 2,
  restMoodUpChance: 500,
  /** Bond gained with each crew present at a training; outing gives a flat bond. */
  bondPerTraining: 4,
  bondPerOuting: 5,
  bondMax: 100,
  bondLevelStep: 20,
  crewPresenceBase: 350,
  crewPresencePerBondLevel: 50,
  /** Chance that a weighted event fires on a turn where at least one is eligible. */
  eventChance: 600,
  maxLearnedSkills: 6,
  maxParts: 4,
  rerollBaseScrap: 40,
  /** Scrap earned per race by place (index 0 = 1st). */
  scrapByPlace: [60, 40, 30, 20, 15, 10, 10, 10] as const,
  /** Inheritance: +stars × statInheritPerStar on the inherited stat. */
  statInheritPerStar: 7,
  aptitudeInheritChance: [300, 550, 800] as const,
  /** Grade thresholds on the season score; see docs/formulas.md. */
  gradeThresholds: [
    ["SS", 4500],
    ["S", 4100],
    ["A", 3700],
    ["B", 2900],
    ["C", 2500],
    ["D", 2100],
    ["E", 1700],
    ["F", 1300],
    ["G", 0],
  ] as const satisfies ReadonlyArray<readonly [Grade, number]>,
  gradeCapOnGoalFailure: "C" as Grade,
  /** Season score weights. */
  scoreWinBonus: 50,
  scorePodiumBonus: 20,
  scorePerSkill: 20,
} as const;

/** Which stat each training kind primarily trains (for crew presence and growth). */
export const TRAINING_STAT: Readonly<Record<TrainingKind, StatName>> = {
  "train:agility": "agility",
  "train:stamina": "stamina",
  "train:technique": "technique",
  "train:risk-flight": "courage",
  "train:simulator": "intelligence",
};

/** Secondary stat each training also raises (at SEASON.secondaryGain). Risk flight has its own split. */
export const TRAINING_SECONDARY: Readonly<Record<TrainingKind, StatName | null>> = {
  "train:agility": "technique",
  "train:stamina": "courage",
  "train:technique": "agility",
  "train:risk-flight": null,
  "train:simulator": "technique",
};

/** Stub race field: rival power ≈ rivalsPerEntry × (rivalBase + rivalPerTurn × turn) ± rivalNoise. */
export const STUB_RACE = {
  rivalBase: 95,
  rivalPerTurn: 9,
  rivalNoise: 200,
  styleMatchBonus: 60,
  powerToWeightBonus: 200,
} as const;

/** Race constants (BRIEF §6). Used from phase 2; documented now so the batch can start from them. */
export const RACE = {
  ticksPerSecond: 15,
  /** m/s ×1000 */
  vBase: 20_000,
  kA: 350,
  /** m/s² ×1000 */
  kAcc: 400,
  kHp: 1000,
  kS: 1200,
  /** m/s ×1000 */
  kBoost: 3000,
  kE: 1000,
  kH: 2000,
  kCool: 1000,
  kCrash: 25,
  kJumpPenaltyTicks: 20,
  heatPenaltyMult: 920,
  durabilityZeroPowerMult: 750,
  pulseTicks: 12,
  pulseCooldownTicks: 30,
  pulseBoostMult: 1350,
  pulseCostMult: 1200,
  groundDetourMult: 1250,
  finalSprintReserveMeters: 60,
  /** Activation probability = max(1 − 90 / I_eff, 0.2). */
  activationNumerator: 90,
  activationFloor: 200,
  telemetryActivationBonus: 150,
  telemetryPowerCap: 1100,
  regenPerTick: 500,
  repairablePerFlatSegment: 2,
} as const;
