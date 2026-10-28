/**
 * Constants as accepted with ADR-0003 (docs/race-engine.md section 26); physics tests pin to this,
 * balance tunes rulesets/v1.
 *
 * Test support only, never exported from the package index and never read by the season, the
 * batch or the goldens. A deep-frozen literal copy of `RULESET_V1` as it stood when the engine was
 * accepted: the worked values of 11.4, the sanity tables of 25.4, the prototype cross-checks, the
 * property thresholds, the rule-term tables and the physics and controller unit tests were all
 * measured on these numbers, so they keep passing while a balance pass moves
 * `packages/sim/src/rulesets/v1/constants.ts`. Tests whose subject is the live ruleset (the
 * season, the goldens, the batch, content validation) stay on `RULESET_V1`.
 *
 * Never edit a value here to follow a balance change. `season` is the one exception to the copy:
 * `Ruleset.season` is typed as the literal v1 object (`typeof SEASON`), so a frozen copy would
 * stop typechecking at the first season tune; the race engine reads only its stat clamps.
 */
import type { FieldConstants, RaceConstants, Ruleset } from "../../rulesets/index.js";
import { SEASON } from "../../rulesets/v1/constants.js";

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

const SPEC_RACE = deepFreeze<RaceConstants>({
  // time and units
  ticksPerSecond: 15,

  // cruise and acceleration
  vBase: 20_000,
  kA: 350,
  kAcc: 400,
  vStart: 3_000,
  kStartDash: 24_000,
  dashUntilPm: 850,
  kDecel: 3_000,
  pwCruiseWeight: 1_000,
  pwBoostWeight: 1_000,
  stylePace: {
    dive: [1_000, 1_000, 1_000],
    hover: [1_000, 1_000, 1_000],
    glide: [1_000, 1_000, 1_000],
    ground: [1_000, 1_000, 1_000],
  },

  // hp
  kHp: 1_000,
  kS: 1_200,
  hpBase: 435,
  hpPerKm: 400,
  fatigueBase: 1_500,
  fatigueCourage: 400,
  exhaustSpeedPm: 850,
  glideLeadDrainPm: 980,

  // segment factors
  kClimb: 150,
  kDescent: 100,
  kWater: 1_000,
  kWind: 1_000,
  kCurves: 200,
  segFactorMin: 500,
  segFactorMax: 1_500,

  // boost, energy, heat, durability
  kBoost: 3_000,
  kE: 1_000,
  kH: 2_000,
  kCool: 1_000,
  coolDissWeight: 0,
  dissRef: 60,
  biomeCool: { desert: 1_000, mountain: 1_000, coast: 1_000, urban: 1_000, tundra: 1_000 },
  heatToleranceCourage: 300,
  heatPenaltyMult: 920,
  overheatDurPerTick: 1_000,
  massThrustDurMult: 2_000,
  groundDamagePm: 500,
  overheatFloorPm: 250,
  durabilityZeroPowerMult: 750,
  brokenSpeedPm: 1_000, // added with ADR-0003 D56 at its neutral value: the spec breaks wings through the PW
  surplusHeatPm: 800,
  regenOverflowHeatPm: 900,
  freeBoostMaxTicks: 12,

  // pulses
  pulseTicks: 12,
  pulseCooldownTicks: 30,
  pulseBoostMult: 1_350,
  pulseCostMult: 1_200,

  // jumps and obstacles
  kCrash: 25,
  kJumpPenaltyTicks: 20,
  crashSpeedMult: 400,
  groundDetourMult: 1_100,
  waterHitPerDrag: 50,
  landBasePm: 800,
  landTechPm: 120,

  // manufacturer rules
  regenPerTick: 500,
  repairablePerFlatSegment: 2,
  telemetryActivationBonus: 150,
  telemetryPowerCap: 1_100,

  // rule terms (13.1)
  massThrustCoolPm: { desert: 500, mountain: 1_250, coast: 1_000, urban: 500, tundra: 1_250 },
  regenLandLossPm: 2_000,
  pulseAirPm: [1_000, 1_000, 1_200, 1_000, 600, 1_000, 1_000],
  pulseBiomePm: { desert: 1_150, mountain: 1_000, coast: 1_000, urban: 1_000, tundra: 1_000 },
  telemetryDrainPm: 900,
  telemetryAccelPm: 850,
  repairableRuggedPm: 500,
  repairableCurvesPm: 1_500,

  // skills
  activationNumerator: 90,
  activationFloor: 200,
  maxSkills: 8,
  maxSkillActivations: 3,

  // Intelligence and variance
  paceHalfWidth: 43,
  paceCentreSpan: 43,
  planErrorMax: 150,
  rngBlock: 32,

  // sprint plan
  finalSprintReserveMeters: 60,
  sprintLevelStepMms: 100,
  maxReplans: 4,

  // style controllers and style terms (9.8)
  style: {
    diveKeep: 500,
    hoverKeep: 500,
    glideKeep: 600,
    groundPreShare: 600,
    packLo: 250,
    packHi: 750,
    hoverAttackAt: 700,
    styleHoldTicks: 12,
    diveStoopPm: 1_400,
    hoverDraftPm: 1_020,
    glideStartAccelPm: 1_100,
  },

  // log and guards
  log: {
    denseFirstTicks: 15,
    sampleEveryTicks: 15,
    denseLastMeters: 25,
  },
  dnfTicksPerMeter: 8,
  dnfTicksBase: 2_400,
  maxCourseMeters: 10_000,
  maxRunners: 8,
  maxEffectiveStat: 2_000,
});

const SPEC_FIELD = deepFreeze<FieldConstants>({
  rivalBase: 95,
  rivalPerTurn: 9,
  rivalNoise: 200,
  rivalStatJitter: 100,
  rivalTurnsPerSkill: 12,
  rivalMaxSkills: 3,
  rivalPwBandPm: 50,
  rivalMinPool: 1,
  rivalWeights: {
    glide: [240, 210, 170, 180, 200],
    dive: [250, 180, 170, 220, 180],
    hover: [220, 200, 170, 170, 240],
    ground: [200, 230, 220, 190, 160],
  },
});

export const SPEC_RULESET: Ruleset = Object.freeze({
  version: "v1",
  season: SEASON,
  race: SPEC_RACE,
  field: SPEC_FIELD,
  aptitudeMult: deepFreeze<Ruleset["aptitudeMult"]>({
    S: 1100,
    A: 1050,
    B: 1000,
    C: 950,
    D: 900,
    E: 850,
    F: 800,
    G: 700,
  }),
  moodMult: deepFreeze<Ruleset["moodMult"]>([950, 980, 1000, 1050, 1100]),
  trainingStat: deepFreeze<Ruleset["trainingStat"]>({
    "train:agility": "agility",
    "train:stamina": "stamina",
    "train:technique": "technique",
    "train:risk-flight": "courage",
    "train:simulator": "intelligence",
  }),
  trainingSecondary: deepFreeze<Ruleset["trainingSecondary"]>({
    "train:agility": "technique",
    "train:stamina": "courage",
    "train:technique": "agility",
    "train:risk-flight": null,
    "train:simulator": "technique",
  }),
});
