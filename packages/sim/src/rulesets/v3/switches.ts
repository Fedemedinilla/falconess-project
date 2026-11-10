/**
 * The invariance switches of ruleset v3 (ADR-0011 §7, ADR-0010 B8). Each `FLIGHT_OFF_*` turns a
 * step of the prototype off; with it, v3 reproduces the race of that earlier prototype commit
 * byte for byte (the INV-5 … INV-15 references of `pnpm balance:barandas`, `invariance.json`).
 * They exist only for that proof and for the sim's own invariance tests: no season, no CLI and no
 * page plays a switched ruleset. The old wing tables and the round-4 rival rows are the values
 * those switches restore.
 */
import { RULESET_V3, type RulesetV3 } from "../index.js";
import type { FieldConstants, RaceConstants } from "../v1/constants.js";
import { FIELD as FIELD_V2 } from "../v2/constants.js";
import { type FlightConstants, NEUTRAL_WING, type WingFlight } from "./constants.js";

/**
 * S1 (§3): Lanza (Picada) vertical, climbs ×1.25, keeps 960 ‰ of her speed, dives ×1.25; Columna
 * (Suspensión) in steps, climbs ×0.9, holds ×0.8 (×0.7 until feel round 1: with her pace in the air,
 * holding cheap and drafting made her too strong), her wake tows her ×1.02 (her rebufo); Rampa
 * (Planeo) a long diagonal, holds ×0.8, keeps all her speed. Round 5: the climb starts at the
 * ground (F7), so the ticks per band go 3 / 6 / 12 → 2 / 4 / 8 and the time to the ceiling stays
 * 0.4 / 0.8 / 1.6 s; each wing falls at its own pace (F2: 2 / 3 / 4 ticks per band). Turbina
 * (Rasante, F8): a skim driven by the frame's thrusters, only to the low band, cheap, quick to
 * lift and keeping all her speed; no dive (band 1).
 */
export const WINGS_V3: readonly [WingFlight, WingFlight, WingFlight, WingFlight] = [
  {
    style: "lance",
    climbTicks: 2,
    climbCostPm: 1250,
    liftSpeedPm: 960,
    holdPm: 1000,
    diveWingPm: 1250,
    diveTicks: 2,
    draftPm: 1005,
    maxBand: 3,
    airPm: 0,
  },
  {
    style: "column",
    climbTicks: 4,
    climbCostPm: 900,
    liftSpeedPm: 980,
    holdPm: 800,
    diveWingPm: 1000,
    diveTicks: 3,
    draftPm: 1020,
    maxBand: 3,
    airPm: 6,
  },
  {
    style: "ramp",
    climbTicks: 8,
    climbCostPm: 1000,
    liftSpeedPm: 1000,
    holdPm: 800,
    diveWingPm: 1000,
    diveTicks: 4,
    draftPm: 1005,
    maxBand: 3,
    airPm: 0,
  },
  {
    style: "turbine",
    climbTicks: 3,
    climbCostPm: 500,
    liftSpeedPm: 1000,
    holdPm: 600,
    diveWingPm: 1000,
    diveTicks: 3,
    draftPm: 1005,
    maxBand: 1,
    airPm: 0,
  },
];
/** STY-2's reference with neutral wings: one shape for all (4 ticks per band up, 3 down). */
export const NEUTRAL_WINGS_V3N: readonly [WingFlight, WingFlight, WingFlight, WingFlight] = [
  { ...NEUTRAL_WING, style: "lance", climbTicks: 4 },
  { ...NEUTRAL_WING, style: "column", climbTicks: 4 },
  { ...NEUTRAL_WING, style: "ramp", climbTicks: 4 },
  { ...NEUTRAL_WING, style: "turbine", climbTicks: 4 },
];
/** The wing table of round 4 (4f9b899): band 1 at once, 3 / 6 / 12 ticks per band, 3 to fall. */
export const WINGS_R4: readonly [WingFlight, WingFlight, WingFlight, WingFlight] = [
  { ...WINGS_V3[0], climbTicks: 3, diveTicks: 3, airPm: 0 },
  { ...WINGS_V3[1], climbTicks: 6, diveTicks: 3, airPm: 0 },
  { ...WINGS_V3[2], climbTicks: 12, diveTicks: 3, airPm: 0 },
  { ...NEUTRAL_WING, style: "turbine" },
];
export const NEUTRAL_WINGS: readonly [WingFlight, WingFlight, WingFlight, WingFlight] = [
  { ...NEUTRAL_WING, style: "lance" },
  { ...NEUTRAL_WING, style: "column" },
  { ...NEUTRAL_WING, style: "ramp" },
  { ...NEUTRAL_WING, style: "turbine" },
];
/**
 * The neutral reference of STY-2 and STY-3 from round 5: every flying wing climbs 4 ticks per band
 * (the Columna's, the mean time to the ceiling) and falls 3, the Turbina row stays the Turbina. The
 * wing's line and tow (`airPm`, `draftPm`) are its physics, not its takeoff style, and stay, as the
 * hover draft stayed outside the style table in round 4.
 */
export const NEUTRAL_WINGS_R5: readonly [WingFlight, WingFlight, WingFlight, WingFlight] = [
  {
    ...NEUTRAL_WING,
    climbTicks: 4,
    style: "lance",
    draftPm: WINGS_V3[0].draftPm,
    airPm: WINGS_V3[0].airPm,
  },
  {
    ...NEUTRAL_WING,
    climbTicks: 4,
    style: "column",
    draftPm: WINGS_V3[1].draftPm,
    airPm: WINGS_V3[1].airPm,
  },
  {
    ...NEUTRAL_WING,
    climbTicks: 4,
    style: "ramp",
    draftPm: WINGS_V3[2].draftPm,
    airPm: WINGS_V3[2].airPm,
  },
  WINGS_V3[3],
];

/** The skim-in-a-Salto fix off: v3 is the trim (f08bde5) byte for byte (fix/inv15.ts). */
export const FLIGHT_OFF_JUMPSKIM: Partial<FlightConstants> = { jumpHoldsSkim: false };

/** The trim off: Garra fija's ‰ is the same at every distance (homes, 5f470a2) byte for byte (trim/inv14.ts). */
export const FLIGHT_OFF_TRIM: Partial<FlightConstants> = {
  ...FLIGHT_OFF_JUMPSKIM,
  skillFlightDistance: false,
};

/** A passive's flight effect off (ADR-0009): v3 is the balance polish (6e98e90) byte for byte (homes/inv13.ts). */
export const FLIGHT_OFF_HOMES: Partial<FlightConstants> = {
  ...FLIGHT_OFF_TRIM,
  skillFlight: false,
};

/** The balance polish off: v3 is the kick on low hp (95e469f) byte for byte (polish/inv12.ts). */
export const FLIGHT_OFF_POLISH: Partial<FlightConstants> = {
  ...FLIGHT_OFF_HOMES,
  closerRoomM: 0,
  closerRoomMinM: 0,
  diveCourRel: false,
  leadStartJumps: false,
  hpPlanOwn: false,
  diveDescent: false,
  closerLastFeature: false,
};

/** The kick on low hp off: v3 is stamina pays effort (31f801b) byte for byte (kick/inv11.ts). */
export const FLIGHT_OFF_KICK: Partial<FlightConstants> = {
  ...FLIGHT_OFF_POLISH,
  kickHiPm: [0, 0, 0, 0],
  kickLoPm: [0, 0, 0, 0],
  kickPace: false,
  kickPaceMinPm: 0,
  kickReplanFree: false,
  hpKnock: 30,
  hpDoor: 30,
  hpTrafficSq: false,
  hpHitFloor: false,
  airTechRel: false,
  hpTakeoff: 30,
  hpSkimTakeoff: 20,
  hpDiveBand: 15,
  hpSwitch: 20,
  hpFight: 30,
  hpDirtyPm: 1500,
  hpBoxedPm: 3000,
  hpDistPm: [1000, 150, 60, 0],
};

/** Stamina pays effort and the distance letters off: v3 is the neutral wings (9bfaf58) byte for byte (stamina/inv10.ts). */
export const FLIGHT_OFF_STAMINA: Partial<FlightConstants> = {
  ...FLIGHT_OFF_KICK,
  hpTakeoff: 0,
  hpSkimTakeoff: 0,
  hpDiveBand: 0,
  hpSwitch: 0,
  hpFight: 0,
  hpKnock: 0,
  hpDoor: 0,
  hpDirtyPm: 0,
  hpBoxedPm: 0,
  hpPlanRefStamina: 0,
  hpReplanHp: 0,
  exhaustedStill: false,
  distanceLetters: false,
};

/** Neutral wings off: v3 is everyone flies (d3f5623) byte for byte (neutral/inv9.ts). */
export const FLIGHT_OFF_NEUTRAL: Partial<FlightConstants> = {
  ...FLIGHT_OFF_STAMINA,
  wings: WINGS_V3,
  neutralFrames: false,
  noWear: false,
  neutralStyles: false,
  highCruisePm: 0,
  skimEscapeTicks: 0,
  packJumps: false,
  leadGlidePos: false,
  leadStartAccelPm: 1000,
  bandHoldPm: [1000, 1000, 1300, 1300],
  diveVMms: [0, 0, 5_110, 5_430],
  overDivePm: 650,
  skimLiftMms: 300,
  skimCruisePm: 3,
  escapeTicks: 20,
  knockTicks: 30,
};

/** Everyone flies off: v3 is the two lines of 2026-11-08 (84dc112) byte for byte (harness/inv8.ts). */
export const FLIGHT_OFF_ALLFLY: Partial<FlightConstants> = { ...FLIGHT_OFF_NEUTRAL, allFly: false };

/** The two lines off: v3 is round 5 (6bb4615) byte for byte (harness/inv7.ts). */
export const FLIGHT_OFF_LINES: Partial<FlightConstants> = {
  ...FLIGHT_OFF_NEUTRAL,
  allFly: false,
  lines: false,
};

/**
 * The values that turn every rule of steps 1.2 and 1.3 off: v3 with them is the round-2 race
 * (commit 0a7162c), byte for byte (INV-5). Step 1.2 alone is `FLIGHT_OFF_1_3`.
 */
/**
 * Every round-5 rule off: v3 with these values is the round-4 race (commit 4f9b899), byte for byte
 * (harness/inv6.ts). `FLIGHT_OFF_1_3` and `FLIGHT_OFF_1_2` build on it.
 */
export const FLIGHT_OFF_R5: Partial<FlightConstants> = {
  ...FLIGHT_OFF_NEUTRAL,
  allFly: false,
  lines: false,
  planned: [false, false, true, true],
  diveVMms: [0, 0, 5_400, 6_000],
  wings: WINGS_R4,
  cornisaTicksFloor: 3,
  packFanDiv: 10,
  diveAirShare: false,
  climbFromGround: false,
  airWaterFree: false,
  airTerrainPm: 1000,
  airTerrainFreeBand: 4,
  airDraftBand: false,
  overDivePm: 0,
  nerveM: 0,
  groundFlies: false,
  ownAirFromBand: 1,
  overCleanHold: false,
  overAirPm: 0,
};
export const FLIGHT_OFF_1_3: Partial<FlightConstants> = {
  ...FLIGHT_OFF_R5,
  wings: NEUTRAL_WINGS,
  cornisaTicksPm: 1000,
  cornisaTicksFloor: 3,
  heldSkill: false,
};
export const FLIGHT_OFF_1_2: Partial<FlightConstants> = {
  ...FLIGHT_OFF_1_3,
  // feel round 1 moved R6's rest with the struggle (975 → 990): off, it is round 2's again
  airDrainPm: 975,
  keepFlown: false,
  airWPm: 0,
  airPacePm: 0,
  fightM: 0,
  dirtyHighM: 0,
  bandHoldPm: [1000, 1000, 1000, 1000],
  dirtyM: 0,
  escapeTicks: 0,
  knockTicks: 0,
  forcedLand: false,
  diveEtaBasePm: 850,
  diveEtaCouragePm: 300,
};

/** The rival rows of rounds 2-4 (agility 245 / 215): `preset off12` and the round-4 reference. */
export const FIELD_V3_R4: FieldConstants = {
  ...FIELD_V2,
  rivalWeights: {
    ...FIELD_V2.rivalWeights,
    dive: [245, 180, 185, 215, 175],
    hover: [215, 195, 185, 170, 235],
  },
};

/**
 * v3 with single flight or race constants overridden: a switch above, or one constant (the sim's
 * tests and calibration probes). A low-band landing (`skimLandBasePm` > 0, 0 in v3) sets the
 * jump's landing, as in the prototype.
 */
export function rulesetV3With(
  flight: Partial<FlightConstants> = {},
  race: Partial<RaceConstants> = {},
): RulesetV3 {
  const F = { ...RULESET_V3.flight, ...flight };
  const allFly: Partial<RaceConstants> =
    F.allFly && F.skimLandBasePm > 0 ? { landBasePm: F.skimLandBasePm } : {};
  return { ...RULESET_V3, race: { ...RULESET_V3.race, ...allFly, ...race }, flight: F };
}
