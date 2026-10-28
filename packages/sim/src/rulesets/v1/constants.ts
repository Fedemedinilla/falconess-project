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
  kWind: 1_000, // ‰ weight of signed wind (1 + wind)
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
  biomeCool: { desert: 1_000, mountain: 1_000, coast: 1_000, urban: 1_000, tundra: 1_000 }, // ‰, new knob; 1000 = brief
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
  massThrustCoolPm: { desert: 50, mountain: 1_250, coast: 1_000, urban: 500, tundra: 1_250 }, // ‰ of coolTick, Steinhaus (ADR-0005: desert 500 → 50; urban stays 500, no v1 course)
  regenLandLossPm: 2_000, // ‰ of the landing loss, Lumière (light airframe)
  pulseAirPm: [1_000, 1_000, 2_500, 1_000, 600, 1_000, 1_000], // ‰ burst thrust per segment type (SEGMENT_TYPES order), Kōryū (ADR-0005: descent 1200 → 2500)
  pulseBiomePm: { desert: 1_450, mountain: 1_000, coast: 1_000, urban: 1_000, tundra: 1_000 }, // ‰ burst thrust per biome, Kōryū (ADR-0005: desert 1150 → 1450)
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
