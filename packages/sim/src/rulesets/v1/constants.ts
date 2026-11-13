/**
 * Ruleset v1: every tunable number of the simulation, with its intention in docs/formulas.md.
 * Change only with a `pnpm sim:batch` report attached to the PR. Never delete a ruleset.
 * Multipliers are per-mille (1000 = ×1.0); distances and speeds ×1000 inside the race engine.
 */
import type { Aptitude, Difficulty, Grade, Mood, StatName, TrainingKind } from "@falconess/schema";

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

/**
 * Training failure model (ADR-0006). "linear": failBase + floor(fatigue / failPerFatigue) ‰, the
 * simulator never fails, a risk flight fails at riskFlightFail and injures at riskFlightInjury.
 * "curve": 0 ‰ up to fatigue failCurveStart, then failCurveMax × ((f − start) / (100 − start))²
 * (vigor 60 → 0 ‰, vigor 0 → 600 ‰); see docs/formulas.md.
 */
export type FailModel = "linear" | "curve";

const SEASON_V1 = {
  turns: 48,
  statMin: 1,
  statMax: 1200,
  fatigueMax: 100,
  /** Training at this fatigue or more rests instead. Above fatigueMax: never (v2). */
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
    /** A week spent injured. A chosen rest uses restRecovery. */
    rest: -40,
    outing: -10,
  } as const satisfies Record<TrainingKind | "workshop" | "rest" | "outing", number>,
  /** Per-mille failure chances. Simple training adds floor(fatigue / 4). */
  failModel: "linear" as FailModel,
  failBase: 50,
  failPerFatigue: 4,
  riskFlightFail: 120,
  riskFlightInjury: 30,
  /** Curve model only (FailModel). */
  failCurveStart: 40,
  failCurveMax: 600,
  /** Curve model: the simulator fails at this ‰ of the curve. */
  simulatorFailPm: 0,
  /**
   * Curve model: a failed training is an injury with injuryShareOfFail ‰ when it is a risk flight
   * or the fatigue before it is at least injuryFromFatigue (vigor 20 or less in v2).
   */
  injuryFromFatigue: 101,
  injuryShareOfFail: 250,
  injuryTurns: 2,
  /** Share of the gain lost on a failed training (‰) and the mood it costs. */
  failLossPm: 500,
  failMoodLoss: 1,
  /** Fatigue a chosen rest removes: one option = no draw; several = weighted pick (stream training). */
  restRecovery: [40] as readonly number[],
  restRecoveryWeights: [1] as readonly number[],
  restMoodUpChance: 500,
  /**
   * Mood drift on a training week: −1 mood with moodDriftBase + moodDriftPerStreak × max(0,
   * streak − moodDriftFreeStreak) ‰, where streak counts consecutive training weeks including this
   * one. Both 0 = no draw (v1).
   */
  moodDriftBase: 0,
  moodDriftPerStreak: 0,
  moodDriftFreeStreak: 2,
  /** A goal race finished at this place or worse costs 1 mood. Above the field size: never (v1). */
  raceLossMoodAt: 9,
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
export type SeasonConstants = Omit<
  Widen<typeof SEASON_V1>,
  "failModel" | "gradeThresholds" | "gradeCapOnGoalFailure"
> & {
  readonly failModel: FailModel;
  readonly gradeThresholds: ReadonlyArray<readonly [Grade, number]>;
  readonly gradeCapOnGoalFailure: Grade;
  /**
   * Skill points a goal race pays by place (index 0 = 1st), like Umamusume; absent = none (v1,
   * v2). Ruleset v3 sets it (owner 2026-11-10).
   */
  readonly skillPointsByPlace?: readonly number[];
  /**
   * Diminishing returns on training (Umamusume: «el excedente sobre 1200 cuenta a la mitad»): each
   * `[from, pm]` makes the part of a gain that lands at or above stat `from` count `pm` ‰, the
   * highest band that applies; thresholds ascending. Absent = every point counts (v1, v2). Ruleset
   * v3 sets it (owner 2026-11-10: «es muy fácil maxear todos los stats»).
   */
  readonly growthBands?: ReadonlyArray<readonly [number, number]>;
  /**
   * ADR-0012: the most any stat can reach on each difficulty (Star Savior's caps: Normal 900, so no
   * 3-star black box; Exigente the ruleset's `statMax`). Absent = `statMax` everywhere (v1, v2).
   */
  readonly statCapByDifficulty?: Readonly<Record<Difficulty, number>>;
  /**
   * ADR-0012: the Copa's rival built on the player's Falconess. Her stat total is the field's
   * mean total at the race × `floorPm` ‰ plus `excessPm` ‰ of whatever the player has above that;
   * her stats keep the player's shares. Absent = no such rival (v1, v2).
   */
  readonly mirrorRival?: { readonly floorPm: number; readonly excessPm: number };
  /**
   * ADR-0013: inheritance with luck (Umamusume's sparks and inspirations). Absent = v1/v2's fixed
   * box (best stat, stars by thresholds) and the start bonus only.
   */
  readonly inheritance?: InheritanceConstants;
  /**
   * ADR-0016 (owner 2026-11-13, «3 + 1»): crews like Umamusume's support cards. A crew that shows
   * up stands at ONE of its trainings (drawn from its own Rng), adds `basePm` ‰ there below
   * `minBond`, and `syncPm` ‰ from `minBond` on («sintonía», the friendship training). Absent =
   * v1/v2: every matching training, the maker's flat `trainingBonus`.
   */
  readonly crewSync?: CrewSyncConstants;
};

/** ADR-0016: a crew's bonus by its bond. */
export type CrewSyncConstants = {
  readonly basePm: number;
  readonly minBond: number;
  readonly syncPm: number;
};

/** ADR-0013: how a black box is rolled at season end and how it inspires a child. */
export type InheritanceConstants = {
  /**
   * The box's stat: drawn among the five, each weighted by how far it is above `statFloor`
   * (at least 1), so the best stat is the likeliest but not certain.
   */
  readonly statFloor: number;
  /**
   * Its stars: `[from, [1★, 2★, 3★] ‰]` by the drawn stat's value, the highest `from` that
   * applies (ascending). Normal's cap (900) keeps a box under 3★ when 3★ starts at 1000.
   */
  readonly starsByValue: ReadonlyArray<readonly [number, readonly [number, number, number]]>;
  /** Weeks a parent may inspire her again (besides the season's start, which always does). */
  readonly inspirationTurns: readonly number[];
  /** Chance of an inspiration by the box's stars (1★, 2★, 3★), ‰. */
  readonly inspirationChancePm: readonly [number, number, number];
};
export const SEASON: SeasonConstants = SEASON_V1;

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

/**
 * Widened (non-literal) view of a constants object: numbers become `number`, tuples keep their
 * length. Lets tests and the balance batch build rulesets with other values (e.g. paceHalfWidth 0)
 * while the literal objects below stay the single source of the v1 numbers.
 */
type Widen<T> = T extends number
  ? number
  : T extends string
    ? string
    : T extends boolean
      ? boolean
      : { readonly [K in keyof T]: Widen<T[K]> };

/** Race constants. BRIEF §6-§7 values kept; units in comments; docs/formulas.md "Carrera". */
const RACE_V1 = {
  // time and units
  ticksPerSecond: 15, // ticks per second; engine units derive from it: 1 pu = 1/225 mm, 1 vu = 1/15 mm/s

  // cruise and acceleration (BRIEF §6)
  vBase: 20_000, // mm/s, course base speed v_base
  kA: 350, // ‰, agility weight: cruise × (1 + kA·A/1200)
  kAcc: 400, // mm/s², k_acc: accel = kAcc × (0.5 + T/1200) × PW × f_seg
  vStart: 3_000, // mm/s, new: speed at the gun
  kStartDash: 24_000, // mm/s², new: start dash, also after a failed jump (recovery dash)
  dashUntilPm: 850, // ‰ of min(vBase, target), new: the dash ends at this speed
  kDecel: 3_000, // mm/s², new: rate limit when the target drops
  pwCruiseWeight: 5, // ‰, new knob: weight of (PW − 1) in cruise, accel and vMin; 1000 = brief (ADR-0005: 1000 → 5, proposed to the owner, proposal 5)
  pwBoostWeight: 250, // ‰, new knob: weight of (PW − 1) in boost thrust; 1000 = brief (ADR-0005: 1000 → 250)
  stylePace: {
    // ‰ per phase [start, middle, final], new knob; 1000 = neutral (balance-pass lever, metric 1)
    dive: [1_000, 1_000, 1_000],
    hover: [1_000, 1_000, 1_000],
    glide: [1_000, 1_000, 1_000],
    ground: [1_000, 1_000, 1_000],
  },

  // hp (BRIEF §6 plus gap decisions)
  kHp: 1_000, // ‰ of 1 hp per tick at v = vBase (k_hp 1.0)
  kS: 1_200, // ‰, stamina weight: drain / (1 + kS·St/1200) (k_s 1.2)
  hpBase: 435, // hp, new: fixed part of hpMax
  hpPerKm: 400, // hp per km of course, new
  fatigueBase: 1_500, // ‰, final-phase drain multiplier at courage 0 (1.5)
  fatigueCourage: 400, // ‰ per 1200 courage subtracted (0.4·C/1200)
  exhaustSpeedPm: 850, // ‰ of vBase × PWc × f_seg, new: body target once hp = 0
  glideLeadDrainPm: 980, // ‰, new: hp drain of a glide holding the lead (revision 2: was 950)

  // segment factors (BRIEF §6 coefficients made explicit)
  kClimb: 150, // ‰ per 1.0 of grade lost on climbs (1 − 0.15·grade)
  kDescent: 100, // ‰ per 1.0 of grade gained on descents (1 + 0.10·grade)
  kWater: 1_000, // ‰ weight of drag (1 − drag)
  kCurves: 200, // ‰, curve penalty at agility 0 (1 − 0.20·(1 − A/1200))
  segFactorMin: 500, // ‰, new: clamp of f_seg (schema bounds of segment-factor)
  segFactorMax: 1_500, // ‰, new

  // boost, energy, heat, durability (BRIEF §6-§7)
  kBoost: 3_000, // mm/s, thrust at PW 1.0 (k_boost)
  kE: 1_000, // me per boosted tick (k_e 1.0)
  kH: 2_000, // mh per boosted tick (k_h 2.0)
  kCool: 1_000, // mh per tick without boost (k_cool 1.0)
  coolDissWeight: 0, // ‰, new knob: cooling ∝ dissipation / dissRef; 0 = brief
  dissRef: 60, // dissipation (content units), new: reference of coolDissWeight
  heatToleranceCourage: 300, // ‰ per 1200 courage, new: heatCap = D × (1 + 0.3·C/1200) (BRIEF tolerance)
  heatPenaltyMult: 920, // ‰ speed while overheated
  overheatDurPerTick: 1_000, // md per overheated tick, new (BRIEF "durability −= 1")
  massThrustDurMult: 2_000, // ‰, new: Steinhaus "durability ×2"
  groundDamagePm: 500, // ‰, new: ground "resiste daño", every durability loss × 0.5
  overheatFloorPm: 250, // ‰ of durabilityMax, new: the overheat licence never projects durability below it
  durabilityZeroPowerMult: 1_000, // ‰ PW once durability reaches 0, before the PW weights (ADR-0005 pass 2: 750 → 1000; at pwCruiseWeight 5 it cost ≈ 0.2 %)
  brokenSpeedPm: 750, // ‰ of cruise, acceleration, vMin and thrust once durability reaches 0, after the PW weights (new, ADR-0005 pass 2, ADR-0003 D56: BRIEF §5 −25 %)
  surplusHeatPm: 800, // ‰ of capLim, new: heat limit of SURPLUS mode
  regenOverflowHeatPm: 900, // ‰ of capLim, new: heat limit of REGEN mode
  freeBoostMaxTicks: 12, // ticks, new: free-first-boost length on continuous frames

  // pulses (BRIEF §6, Kōryū)
  pulseTicks: 12, // ticks per burst
  pulseCooldownTicks: 30, // ticks after a burst
  pulseBoostMult: 1_350, // ‰ of k_boost per burst tick
  pulseCostMult: 1_200, // ‰ of k_e per burst tick

  // jumps and obstacles (BRIEF §6)
  kCrash: 25, // durability lost on a failed jump
  kJumpPenaltyTicks: 20, // lost ticks on a failed jump
  crashSpeedMult: 400, // ‰, new constant for the brief's v = 0.4·v
  groundDetourMult: 1_100, // ‰, ground route length over a jump segment (BRIEF 1.25; deviation D46)
  waterHitPerDrag: 50, // md per ‰ of drag on entering water, new (drag 0.2 → 10 durability)
  landBasePm: 800, // ‰ of vCore kept on landing at technique 0, new (gap D43)
  landTechPm: 120, // ‰ added at technique 1200: landPm = 800 + 120·min(T, 1200)/1200 (T 600 → 860)

  // manufacturer rules (BRIEF §7)
  regenPerTick: 100, // me per tick without boost (Lumière; brief 0.5, ADR-0005: 500 → 100)
  repairablePerFlatSegment: 2, // durability per flat segment entered (Boneyard)
  telemetryActivationBonus: 150, // ‰ added to every skill check (Altair +15 %)
  telemetryPowerCap: 1_100, // ‰ PW cap (applied by resolveFrameBuild)

  // rule terms (new, revision 2; numeric, BRIEF §7 deviation; section 13.1, ADR-0003 D45)
  massThrustCoolPm: 50, // ‰ of coolTick, Steinhaus (ADR-0005: desert 500 → 50; ADR-0007: one value, the desert one)
  regenLandLossPm: 2_000, // ‰ of the landing loss, Lumière (light airframe)
  pulseAirPm: [1_000, 1_000, 2_500, 1_000, 600, 1_000, 1_000], // ‰ burst thrust per segment type (SEGMENT_TYPES order), Kōryū (ADR-0005: descent 1200 → 2500)
  pulseBasePm: 1_450, // ‰ burst thrust on every course, Kōryū (ADR-0005: desert 1150 → 1450; ADR-0007: was pulseBiomePm, collapsed to the desert value)
  telemetryDrainPm: 950, // ‰ of hp drain, Altair (ADR-0005: 900 → 950)
  telemetryAccelPm: 800, // ‰ of acceleration, Altair (ADR-0005: 850 → 800)
  repairableRuggedPm: 0, // ‰ of the landing loss and of the detour's extra length, Boneyard (ADR-0005: 500 → 0)
  repairableCurvesPm: 1_500, // ‰ of the curve penalty, Boneyard

  // skills (BRIEF §6)
  activationNumerator: 90, // p = max(1 − 90/I, 0.2)
  activationFloor: 200, // ‰
  maxSkills: 8, // actives per entry, new
  maxSkillActivations: 3, // activations of a once:false skill, new

  // Intelligence and variance (new; revision 2: fixed width, centre rising with I)
  paceHalfWidth: 43, // ‰ pace judgement half-width W0, the same for every I
  paceCentreSpan: 43, // ‰ the window centre rises from −span/2 at I 0 to +span/2 at I ≥ 1200
  planErrorMax: 150, // ‰ sprint-plan perception half-width at I 0 (0 at I ≥ 1200)
  rngBlock: 32, // u32 drawn per runner before tick 0 (slots in section 17)

  // sprint plan (BRIEF §6)
  finalSprintReserveMeters: 60, // m before the line where energy should reach 0
  sprintLevelStepMms: 100, // mm/s between plan candidates (0.1 m/s)
  maxReplans: 4, // new: replans after the first plan (refund, jump exit, broken wings)

  // style controllers (new; BRIEF §5 styles made exact)
  style: {
    diveKeep: 500, // ‰ of energyMax kept by dive outside the plan
    hoverKeep: 500, // ‰ kept by hover when catching up
    glideKeep: 600, // ‰ kept by glide when chasing the lead
    groundPreShare: 600, // ‰ of energyMax ground spends evenly before the final
    packLo: 250, // ‰ position fraction, start of the middle pack
    packHi: 750, // ‰ end of the middle pack
    hoverAttackAt: 700, // ‰ of course length where hover's sprint plan starts
    styleHoldTicks: 12, // ticks a hover/glide style boost lasts at least
    // style terms (revision 2; section 9.8, ADR-0003 D44)
    diveStoopPm: 1_400, // ‰ dive thrust on descents and in the final phase
    hoverDraftPm: 1_020, // ‰ hover target speed in the middle phase while in the middle pack
    glideStartAccelPm: 1_100, // ‰ glide acceleration in the start phase
  },

  // log and guards (new)
  log: {
    denseFirstTicks: 15, // every tick in the first second
    sampleEveryTicks: 15, // one row per second otherwise
    denseLastMeters: 25, // every tick in each runner's last 25 m
  },
  dnfTicksPerMeter: 8, // DNF guard: maxTicks = 8 × L_m + 2400
  dnfTicksBase: 2_400,
  maxCourseMeters: 10_000, // validator: keeps every product below 2^53
  maxRunners: 8,
  maxEffectiveStat: 2_000, // validator bound for effective stats
} as const;

/** Rival field for season goal races (spec 21.1). */
const FIELD_V1 = {
  rivalBase: 75, // per-stat mean at turn 0; ≈ 0.91 → 0.85 of the reference policy's stats at T12 → T46 (ADR-0005: 95 → 60; Pasada 2: 60 → 75)
  rivalPerTurn: 9, // per-stat mean growth per turn (ADR-0005: 9 → 8; Pasada 2: 8 → 9)
  rivalNoise: 200, // ‰ ± spread of a rival's total power
  rivalStatJitter: 100, // ‰ ± spread per stat
  rivalTurnsPerSkill: 12, // one generic active per 12 turns
  rivalMaxSkills: 3,
  rivalPwBandPm: 50, // ‰ of the player's base frame PW: |PW − pw0| × 1000 ≤ 50 × pw0 (revision 2); 2000 disables
  rivalMinPool: 1, // widen to the nearest frame if the band holds none (picks are with replacement)
  rivalWeights: {
    // ‰ of total power per stat [agility, stamina, technique, courage, intelligence]
    glide: [240, 210, 170, 180, 200],
    dive: [250, 180, 170, 220, 180],
    hover: [220, 200, 170, 170, 240],
    ground: [200, 230, 220, 190, 160],
  },
} as const;
export type RaceConstants = Widen<typeof RACE_V1>;
export type FieldConstants = Widen<typeof FIELD_V1>;
export const RACE: RaceConstants = RACE_V1;
export const FIELD: FieldConstants = FIELD_V1;
