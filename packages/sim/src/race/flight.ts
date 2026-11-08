/**
 * PROTOTYPE of the ruleset v3 draft (design7 «Despegar y caer», .work/design7/diseno-v3.md):
 * altitude bands, flight plans by race position, climb and hold paid with energy, rest in the
 * air and the dive that turns height into speed. Stage 1 (R1-R7) and, behind `stage`, the cheap
 * part of stage 2 (R2 lead and pack, R8, R9, R10).
 *
 * It lives here and not in packages/sim/src/rulesets/ because that folder is protected (CLAUDE.md)
 * until the owner approves ADR-0009: the engine switches on `flightOf(ruleset)`, so v1 and v2,
 * which carry no `flight` constants, never reach a line of this file.
 */
import { ceilDiv, floorDiv } from "@falconess/rng";
import type { FieldConstants, RaceConstants, Ruleset } from "../rulesets/index.js";
import { RULESET_V2 } from "../rulesets/index.js";
import type { CourseGeometry } from "./geometry.js";
import { FLIGHTS_MAX, is, type RaceState, type RaceTables } from "./state.js";
import {
  POS_CLOSER,
  POS_LEAD,
  POS_PACK,
  POS_STALK,
  SEG_CANYON,
  SEG_CLIMB,
  SEG_DESCENT,
  SEG_FLAT,
  SEG_JUMP,
  SEG_WATER,
  STYLE_GROUND,
} from "./units.js";

/** Flight constants of the v3 draft (design7 §3, §10). Units in the comments. */
export type FlightConstants = {
  /** Design stage the draft implements (1 or 2). */
  readonly stage: number;
  /** Positions that follow a flight plan, in POS_* order [lead, pack, stalk, closer]. */
  readonly planned: readonly [boolean, boolean, boolean, boolean];
  /** Energy units per band climbed at liftF 1000 (R3; climbE). */
  readonly climbE: number;
  /** Energy units per band per 100 m held at liftF 1000 (R4; holdE). */
  readonly holdE: number;
  /** ‰ of the climb cost when the takeoff is a cornisa (the edge of a descent, R3). */
  readonly cornisaPm: number;
  /** ‰ of the hp drain while alt ≥ 1 (R6). */
  readonly airDrainPm: number;
  /** mm/s added to the body speed by a dive from band 0..3 (R7; only 2 and 3 dive). */
  readonly diveVMms: readonly [number, number, number, number];
  /** η = diveEtaBasePm + diveEtaCouragePm × min(C, 1200) / 1200 ‰ (R7). */
  readonly diveEtaBasePm: number;
  readonly diveEtaCouragePm: number;
  /** Plan geometry, mm (§4). */
  readonly marginM: number;
  readonly lookM: number;
  readonly cornisaLookM: number;
  readonly stalkFromDiv: number;
  readonly closerMinM: number;
  readonly closerLenDiv: number;
  readonly closerPreFinalM: number;
  readonly jumpLipM: number;
  readonly leadJoinM: number;
  /** The pack's Abanico: L / packFanDiv from the final's start (0 = no Abanico). */
  readonly packFanDiv: number;
  readonly packFanMinM: number;
  /** R9 (stage 2): nobody above band 1 inside a canyon segment. */
  readonly canyonCeiling: boolean;
  /** R9: a high flight that keeps less than this after the canyon dives before it, metres. */
  readonly canyonExitMinM: number;
  readonly canyonDiveBeforeM: number;
  /** R10 (stage 2): ‰ of the curves, water and climb penalty a ground wing pays (1000 = off). */
  readonly groundGripPm: number;
  /** R5: true = the hover draft (×1.02) only on the ground; false = also on the air cruise. */
  readonly draftGroundOnly: boolean;
  /**
   * R3c (feel round 3): when her plan only flies to the ceiling (the great dive of the final,
   * the closer's plan in stage 1), the energy she keeps for later before she boosts (`keepOk`,
   * 9.2) already pays that flight: the gate asks energy − cost − jumps ≥ max(keep, flight at
   * her dirty-air hold) instead of keep + flight reserve. A mid-race flight stays on top of the
   * keep (false = off).
   */
  readonly keepFlown: boolean;
  /** R5: the body speed approaches the air cruise in the air (false = held, like a jump). */
  readonly airCruise: boolean;
  /**
   * R7's form: false = `vCore += Δv` as first written, which adds a cross term Δv·(v − target) /
   * kDecel where she touches down above her ground target (curves, exhausted); true (round 1) =
   * the dive's Δv is a separate surge that decays by kDecel on top of the body speed, so its
   * metres are Δv² / (2 kDecel), the design's number, wherever she touches down.
   */
  readonly diveSurge: boolean;
  // --- step 1.2 «Arriba se lucha» (diseno-v3-vuelo.md §4); each rule is off at its round-2 value
  /** L1: half-width ‰ of each flight's own air (one pre-drawn byte of slot 28 or 30); 0 = off. */
  readonly airWPm: number;
  /** L1: holding costs × (1000 − airHoldK × air) / 1000: a bad air also costs. */
  readonly airHoldK: number;
  /** L1: ‰ the centre of the air moves per 1200 technique above 600; the width never moves. */
  readonly airTechPm: number;
  /**
   * L1b (feel round 1): ‰ of her pace draw of the phase (its distance from her window's centre)
   * the air cruise reads, like the ground cruise reads all of it (0 = R5's centre, round 0).
   */
  readonly airPacePm: number;
  /** L2: hold ‰ per band [ground, low, high, ceiling] (all 1000 = off). */
  readonly bandHoldPm: readonly [number, number, number, number];
  /** L3: dirty air: another runner in her band, 0 < gap ≤ dirtyM metres ahead (0 = off). */
  readonly dirtyM: number;
  /** L3: hold ‰ in dirty air at technique 0; technique 1200 removes dirtyTechPm ‰ of the extra. */
  readonly dirtyHoldPm: number;
  readonly dirtyTechPm: number;
  /** L3: in dirty air the legs do not rest (hp drain ×1.0 instead of airDrainPm). */
  readonly dirtyNoRest: boolean;
  /**
   * L4 (feel round 1): the fight for the line runs only while the runner ahead in her band is
   * within fightM metres, closer than the wake (dirtyM); 0 = the whole wake (round 0).
   */
  readonly fightM: number;
  /**
   * L3 (feel round 2): the wake's reach in the high band (2), the cruise lane of the long
   * flights, mm (0 = dirtyM). A long line leaves a long wake; the ceiling, a short hold before
   * the dive, and the low band keep dirtyM. The fight for the line still runs only within fightM.
   */
  readonly dirtyHighM: number;
  /** L4: ticks of dirty air in a row before she tries to go over, once per race (0 = off). */
  readonly escapeTicks: number;
  /** L4: knocked a band down after knockTicks + knockCourTicks × min(C, 1200) / 1200 (0 = off). */
  readonly knockTicks: number;
  readonly knockCourTicks: number;
  /** L6: a fall forced by the tank lands with her landPm and no dive (false = off). */
  readonly forcedLand: boolean;
  // --- step 1.3 «Cuatro despegues» (§3) and L7
  /** S1: how each wing takes off and holds, by STYLE code [dive, hover, glide, ground]. */
  readonly wings: readonly [WingFlight, WingFlight, WingFlight, WingFlight];
  /** S2: ‰ of the climb ticks from a cornisa, never below cornisaTicksFloor (1000 = off). */
  readonly cornisaTicksPm: number;
  readonly cornisaTicksFloor: number;
  /** L7: a skill that fires in the air is held and released on touchdown, whole (false = off). */
  readonly heldSkill: boolean;
  // --- round 5 (design7 measure/final.md: the design review F1-F11 of race-v3-proto 4f9b899)
  /**
   * F2: the dive is felt in the air: each band she drops adds its share of the dive's Δv to her
   * surge (Δv × bands dropped / fromBand), the last share on touchdown; the descent ticks are the
   * wing's `diveTicks` (false = the whole Δv on touchdown, round 4).
   */
  readonly diveAirShare: boolean;
  /** F7: a takeoff from the ground climbs band 1 in `climbTicks` too (false = band 1 at once). */
  readonly climbFromGround: boolean;
  /** F5: entering a Terreno líquido in flight hits nothing (false = the water hits flyers too). */
  readonly airWaterFree: boolean;
  /** F5: ‰ of the water and climb penalty the air cruise pays below `airTerrainFreeBand` (1000 = the ground's). */
  readonly airTerrainPm: number;
  /** F5: from this band the air cruise pays no water or climb penalty (4 = never). */
  readonly airTerrainFreeBand: number;
  /**
   * F6: in the air, one rule by band and metres for every wing: another runner in her band within
   * the wake (fightM < gap ≤ dirtyM, or dirtyHighM in the high band) tows her (her wing's `draftPm`
   * on the air cruise) and holding there pays the wake's `dirtyPm` (L3); within `fightM` it is
   * dirty air too: no rest and the fight for the line (L4). Nobody is towed by a runner on the
   * ground. false = round 4: the whole wake is dirty and the hover draft reads her place in the field.
   */
  readonly airDraftBand: boolean;
  /**
   * F3: a won line pays: after she goes over (L4) and is not knocked back, her dive gains
   * `overDivePm` ‰ of one more band's share (Δv / fromBand); 0 = off.
   */
  readonly overDivePm: number;
  /**
   * F9 (N1 brought forward from stage 2): on a dive's touchdown, if the start-of-tick snapshot has
   * another unfinished runner on the ground from `nerveBackM` behind to `nerveM` ahead, a nerve
   * test (16 bits of the pre-drawn slot 29, at most `nerveMax` per race): she flinches with
   * p = clamp(nerveBasePm − nerveSlopePm × min(C, 1200) / 1200, nerveMinPm, nerveBasePm) ‰ and
   * opens the wings (no dive, the air share lost, her landing paid); held, the dive × (1000 +
   * nerveBonusPm) ‰. nerveM 0 = off.
   */
  readonly nerveM: number;
  readonly nerveBackM: number;
  readonly nerveBasePm: number;
  readonly nerveSlopePm: number;
  readonly nerveMinPm: number;
  readonly nerveBonusPm: number;
  readonly nerveMax: number;
  /**
   * F8: ground wings take off too, with the Turbina (a skim driven by the frame's thrusters): only
   * the flights of her plan whose band is ≤ her wing's `maxBand` (false = ground wings never fly).
   */
  readonly groundFlies: boolean;
  /**
   * Round 5 (F1): her own air (L1) and its hold term apply from this band up; below it a skim is a
   * ground-effect line, steady at her air cruise (1 = every band, round 4; 2 = the low band skims).
   */
  readonly ownAirFromBand: number;
  /**
   * F3: the line she won is clean air: after an over she holds the new band at the price of the
   * band she left (false = the new band's price, round 4).
   */
  readonly overCleanHold: boolean;
  /** F3: ‰ added to her own air (L1) for the rest of a flight whose line she won (0 = off). */
  readonly overAirPm: number;
  // --- two lines per band (owner, 2026-11-08: «pasar por los costados»)
  /**
   * Two lines per altitude band, inside (0) and outside (1). The wake (dirty air and tow) is only
   * directly behind in the same band and the same line; side by side is clean air. In the same band
   * and line nobody flies through the runner ahead: within `blockMm` her speed is the one ahead's.
   * She leaves the wake by the side (a lateral move that costs metres, `switchMm`), over (a band up,
   * energy, L4) or is knocked down. On the ground there are no lines (false = round 5).
   */
  readonly lines: boolean;
  /** Same band and line, the runner ahead within blockMm mm: she cannot fly through her. */
  readonly blockMm: number;
  /** Ticks blocked behind the one ahead before she moves to the other line: sideTicksMax − span × min(I, 1200) / 1200. */
  readonly sideTicksMin: number;
  readonly sideTicksMax: number;
  /** mm of the other line she checks ahead before she moves: sideLookMm × min(I, 1200) / 1200. */
  readonly sideLookMm: number;
  /** Gap she needs alongside in the other line: slotBaseMm − slotCourMm × min(C, 1200) / 1200 mm. */
  readonly slotBaseMm: number;
  readonly slotCourMm: number;
  /** mm of path a lateral move costs at technique 600 (×1000 ‰ there); × (techHiPm − (hi − lo) × T / 1200). */
  readonly switchMm: number;
  readonly switchTechHiPm: number;
  readonly switchTechLoPm: number;
  /** Ticks the lateral move takes (its metres are paid over them). */
  readonly moveTicks: number;
  /** ‰ of the distance the outside line adds: outPm − outAgiPm × min(A, 1200) / 1200. */
  readonly outPm: number;
  readonly outAgiPm: number;
  /** Ticks in the outside line before she cuts back inside, with the inside clear backMm behind. */
  readonly backTicks: number;
  readonly backMm: number;
  /**
   * Closing the door: the runner ahead sees one that just moved to her other line (≤ moveTicks
   * ago) within doorMm behind, and moves into that line in front of her with p = doorBasePm +
   * doorIntPm × min(I, 1200) / 1200 ‰ (one byte of the pre-drawn slot 31 per decision, at most 4
   * per race, one door per flight). Both pay: she the lateral move, the passer doorLossMm mm.
   */
  readonly doorMm: number;
  readonly doorBasePm: number;
  readonly doorIntPm: number;
  readonly doorLossMm: number;
  /**
   * A line won by the side pays like one won over (F3): after a pass by the side in this flight her
   * dive gains `sideDivePm` ‰ of one band's share (0 = off). Not cumulative with F3's.
   */
  readonly sideDivePm: number;
  // --- stage 3 «Todas vuelan» (owner, 2026-11-08: a Falconess that does not fly is behind)
  /**
   * Everyone flies: the lead skims (band 1) early and over every Colina, Terreno líquido and Salto;
   * the pack skims the long flats and the Pasillos; the low band («a ras») pays `skimTerrainPm` of
   * the water and climb penalty, rests the legs at `skimDrainPm` and holds at `skimHoldPm` of the
   * band's price. false = the two lines of 2026-11-08 byte for byte (INV-8); every knob below is
   * read only when it is on.
   */
  readonly allFly: boolean;
  /** Lead: an early skim from the start's end for max(leadEarlyMinM, L / leadEarlyDiv) (0 = none). */
  readonly leadEarlyDiv: number;
  readonly leadEarlyMinM: number;
  /** Lead: skims every Colina, Terreno líquido and Salto (false = only the early skim; probes). */
  readonly leadObstacles: boolean;
  /** Pack: skims every flat at least packFlatMinM metres long between the start's end and the final (0 = none). */
  readonly packFlatMinM: number;
  /** ‰ of the water and climb penalty the low band pays (the air above pays `airTerrainPm`). */
  readonly skimTerrainPm: number;
  /** ‰ of the hp drain at the low band (ground effect; the bands above rest at `airDrainPm`). */
  readonly skimDrainPm: number;
  /** ‰ of the low band's hold (replaces bandHoldPm[1] while allFly is on). */
  readonly skimHoldPm: number;
  /** ‰ added to the air cruise at the low band (ground effect: the skim is a little faster than the legs). */
  readonly skimCruisePm: number;
  /** ‰ of the climb a takeoff to the low band pays (a skim lifts cheap). */
  readonly skimClimbPm: number;
  /** Race constants while allFly is on: the jump's landing at technique 0 (R8, «saltar barato»; 0 = the stage's). */
  readonly skimLandBasePm: number;
  /** ‰ of a Salto's liftRequired a low-band flight pays when it crosses it (a skim still lifts over the lip). */
  readonly skimJumpPm: number;
  /** ‰ of the Terreno líquido hit a low-band flight takes (a skim splashes; the bands above stay dry). */
  readonly skimWaterPm: number;
  /** mm/s a takeoff from the ground to the low band adds to the body speed (the skim's lift push). */
  readonly skimLiftMms: number;
  /** A skim (ground to the low band) is a shallow lift: she keeps all her speed whatever her wing's liftSpeedPm. */
  readonly skimKeepSpeed: boolean;
  // --- neutral wings (owner, 2026-11-08: wings lose their stats; .work/design7/measure/neutral-final.md)
  /**
   * Every frame races on one neutral profile (`neutralFrame`): no manufacturer rule, no frame
   * passive, no part or quirk effect; the Falconess's own passive (her signature frame's, now
   * her skill) is the only passive. Read by `freezeEntry` (content side). false = the frame's stats.
   */
  readonly neutralFrames: boolean;
  /** The neutral frame profile: PW ‰, energy, dissipation and durability (content units). */
  readonly neutralFrame: {
    readonly powerToWeight: number;
    readonly energy: number;
    readonly dissipation: number;
    readonly durability: number;
  };
  /** No wear: overheat, crashes and water never cost durability and wings never break. */
  readonly noWear: boolean;
  /**
   * The wing's style is only its gesture (the wing table): on the ground every runner races the
   * same physics (no dive stoop, no hover draft, no glide start or lead terms, the Rasante jumps
   * like everyone instead of going round). false = the style's ground physics of v2.
   */
  readonly neutralStyles: boolean;
  /** ‰ added to the air cruise from the high band up (the line up there is quicker; 0 = off). */
  readonly highCruisePm: number;
  /**
   * 0 = a skim (low band) climbs over the runner ahead after `escapeTicks`, like every band.
   * Otherwise a skim keeps to her lines and only the lead climbs over the low traffic, after this
   * many ticks of dirty air in a row (calmer bands; without it the Punta of the steps fell from
   * 24 to 13 % at 750).
   */
  readonly skimEscapeTicks: number;
  /** Pack: also skims every Salto that ends before the final (±20 m, like the lead) (false = off). */
  readonly packJumps: boolean;
  /**
   * The Planeo's two ground terms belong to the lead position instead of the glide wing: neutral
   * wings move them from the wing to the position the Planeo used to run (ADR-0008: Punta = the
   * old Planeo): glideLeadDrainPm while nobody is ahead, and `leadStartAccelPm` ‰ of the start's
   * acceleration (the Planeo's 1100 made the Punta win 44 % of the steps at 300; false = off).
   */
  readonly leadGlidePos: boolean;
  readonly leadStartAccelPm: number;
};

/** S1: a wing's takeoff style (diseno-v3-vuelo.md §3). */
export type WingFlight = {
  /** Log name of the style. */
  readonly style: "lance" | "column" | "ramp" | "turbine" | "neutral";
  /** Ticks per band climbed. */
  readonly climbTicks: number;
  /** ‰ of the climb cost. */
  readonly climbCostPm: number;
  /** ‰ of the body speed kept when she leaves the ground. */
  readonly liftSpeedPm: number;
  /** ‰ of the hold cost. */
  readonly holdPm: number;
  /** ‰ of the dive's Δv. */
  readonly diveWingPm: number;
  /** F2: ticks per band descended. */
  readonly diveTicks: number;
  /** F6: ‰ of the air cruise in another's wake in her band (`airDraftBand`). */
  readonly draftPm: number;
  /** F8: the highest band the wing flies to; planned flights above it are not flown. */
  readonly maxBand: number;
  /**
   * Round 5: ‰ added to the centre of her own air on every flight (L1): how well the wing holds a
   * line. It moves the centre, never the width (AIR-4).
   */
  readonly airPm: number;
};

/** The round-2 flight of every wing (6 ticks per band, no cost or dive term): tests and step 1.2. */
export const NEUTRAL_WING: WingFlight = {
  style: "neutral",
  climbTicks: 6,
  climbCostPm: 1000,
  liftSpeedPm: 1000,
  holdPm: 1000,
  diveWingPm: 1000,
  diveTicks: 3,
  draftPm: 1005,
  maxBand: 3,
  airPm: 0,
};
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
/**
 * The neutral wings of 2026-11-08 (owner: wings lose their stats): each style keeps only its
 * gesture, the time to climb a band and to fall one (Lanza 2 / 2, Columna 4 / 3, Rampa 8 / 4,
 * Turbina 3 / 3); every wing pays the same climb and hold, keeps all her speed on the lift, dives
 * the same Δv, is towed ×1.005 and holds the same line. The Turbina flies every band now: a wing
 * limited to the low band cannot be budget-neutral for a closer's great dive.
 */
export const WINGS_V3N: readonly [WingFlight, WingFlight, WingFlight, WingFlight] = [
  { ...NEUTRAL_WING, style: "lance", climbTicks: 2, diveTicks: 2 },
  { ...NEUTRAL_WING, style: "column", climbTicks: 4, diveTicks: 3 },
  { ...NEUTRAL_WING, style: "ramp", climbTicks: 8, diveTicks: 4 },
  { ...NEUTRAL_WING, style: "turbine", climbTicks: 3, diveTicks: 3 },
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
const NEUTRAL_WINGS: readonly [WingFlight, WingFlight, WingFlight, WingFlight] = [
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

/** The wing row of a STYLE code. */
export function wingOf(F: FlightConstants, style: number): WingFlight {
  return F.wings[style] ?? NEUTRAL_WING;
}

/** S2: ticks per band climbed; from a cornisa (the ground drops away) fewer, never below the floor. */
export function climbTicksOf(F: FlightConstants, style: number, corn: boolean): number {
  const t = wingOf(F, style).climbTicks;
  if (!corn) return t;
  return Math.min(t, Math.max(F.cornisaTicksFloor, floorDiv(t * F.cornisaTicksPm, 1000)));
}

/** liftF folded with the wing's holdPm: hold × holdPm / 1000 = hold at liftF × 1000 / holdPm. */
export function holdLift(F: FlightConstants, style: number, liftF: number): number {
  return floorDiv(liftF * 1000, Math.max(1, wingOf(F, style).holdPm));
}

/** L2: band × pu with the band's hold multiplier. */
export function bandPu(F: FlightConstants, band: number, pu: number): number {
  return floorDiv(band * pu * bandHoldOf(F, band), 1000);
}

/** L2's hold ‰ of a band; with `allFly` the low band holds at `skimHoldPm`. */
export function bandHoldOf(F: FlightConstants, band: number): number {
  return F.allFly && band === BAND_LOW ? F.skimHoldPm : (F.bandHoldPm[band] ?? 1000);
}

/**
 * L1: the air of one flight, ‰ of the air cruise: centre − W + ⌊byte × (2W + 1) / 256⌋, with the
 * centre ⌊airTechPm × (min(T, 1200) − 600) / 1200⌋. The width 2W reads no stat and no wing (AIR-4).
 */
export function airOffsetPm(F: FlightConstants, byte: number, technique: number): number {
  const W = F.airWPm;
  if (W <= 0) return 0;
  const centre = floorDiv(F.airTechPm * (Math.min(technique, 1200) - 600), 1200);
  return centre - W + floorDiv((byte & 255) * (2 * W + 1), 256);
}

/** A ruleset with flight: the v3 draft. */
export type RulesetV3 = Ruleset & { readonly flight: FlightConstants };

export const BAND_LOW = 1;
export const BAND_HIGH = 2;
export const BAND_CEILING = 3;

/**
 * Stage 1 of the design (§10 E1): only stalk and closer fly. Calibration round 1 (design7
 * measure/round-1.md) moved five values off the design's first guess:
 * - `airDrainPm` 850 → 975: the rest is a cliff amplifier (whoever empties her legs later wins the
 *   long tracks), so ×0.85 gave the stalk 54-74 % of the canyon at 300 and 600;
 * - `diveSurge` on: R7's mm (Δv² / 2 kDecel) whatever the ground target at touchdown;
 *   `vCore += Δv` gave 11 m in the sprint and 15 m in the canyon instead of 6;
 * - `draftGroundOnly` off: the hover draft also reaches a flight (hover stalks lost 5-7 m a sprint);
 * - `stalkFromDiv` 3 → 4: the stalk flies from L/4 (more air, the field stays ≥ 10 % up);
 * - `closerLenDiv` 12 → 30: the closer holds ≥ max(100 m, L/30), so in the canyon her ceiling fits
 *   100 m before the final instead of after the water at 2620 m, where low-stat legs are gone.
 * Round 2 (measure/round-2.md) moved two more:
 * - `diveVMms` high band 4900 → 5400: the stalk flies 45 % of every track at the centre of her pace
 *   window and loses wins to variance, not metres; her dive from high now gives ≈ 4.9 m (was 4.0)
 *   and the great dive stays the biggest (6 m). Stalk + hover in the sprint at 750 went 17.6 → 21 %;
 * - `closerPreFinalM` 100 → 150: more air for the closer (sprint 650-800, canyon 1850-2000) and
 *   Picada + closer in the sprint at 750 back to 34-37 % (was 38-41 %).
 * Feel round 1 (measure/feel-round-1.md) moved R6 with the struggle:
 * - `airDrainPm` 975 → 990: with her pace in the air (L1b) the stalk's mean edge showed (28-30 %
 *   of the long tracks at 600; Suspensión + Acecho 33 % of the canyon at 600-750). Holding height
 *   rests the legs less: flying is not free.
 * Feel round 3 (measure/feel-round-3.md) brings R3c (`keepFlown`): a closer kept for the final
 * both the keep of her pre-final boosts (diveKeep) and her ceiling flight's reserve, so on the
 * ridge she never spent her spare energy on the first descent (Peregrina at T46: 0.04 s ahead of
 * the 3rd rival at 500 m against 0.57 s in v2, coin share 35 %). Now the keep pays the flight,
 * priced at her dirty-air hold so the shared ceiling does not force more falls.
 */
export const FLIGHT_V3_E1: FlightConstants = {
  stage: 1,
  // F1 (round 5): the pack skims the Pasillos at the low band (no Abanico until stage 2)
  planned: [false, true, true, true],
  climbE: 8,
  holdE: 1,
  cornisaPm: 500,
  airDrainPm: 990,
  diveVMms: [0, 0, 5_110, 6_000],
  diveEtaBasePm: 700,
  diveEtaCouragePm: 600,
  marginM: 20,
  lookM: 40,
  cornisaLookM: 150,
  stalkFromDiv: 4,
  closerMinM: 100,
  closerLenDiv: 30,
  closerPreFinalM: 150,
  jumpLipM: 10,
  leadJoinM: 60,
  packFanDiv: 0,
  packFanMinM: 80,
  canyonCeiling: false,
  canyonExitMinM: 150,
  canyonDiveBeforeM: 20,
  groundGripPm: 1_000,
  draftGroundOnly: false,
  keepFlown: true,
  airCruise: true,
  diveSurge: true,
  // step 1.2 (§4): the F2 «FIN» package without the nerve (stage 2), with feel round 1
  // (measure/feel-round-1.md): the air reads 800 ‰ of her pace draw (L1b) and her own air is
  // ±18 ‰ (was ±26 ‰ around the centre: the stalk's σ was 0.66-0.70 of the ground's in the long
  // tracks, AIR-3); the wake reaches 11 m (was 6) and costs ×2.5 at technique 0 (was ×2), but the
  // fight for the line only runs within 5 m (L4, `fightM`), so the struggle shows more and knocks
  // less (RISK-1: 17-18 % of the sprint's flights below plan); she tries to go over after 20
  // ticks (was 30) and courage holds the line longer (knock at 30 + 50·C/1200 ticks: 55 at 600);
  // high and ceiling cost ×1.3 per band·metre (was ×1.25; AIR-2: the stalk's energy in the
  // canyon was ×1.13 of round 2). Feel round 2 (measure/feel-round-2.md): in the high band, the
  // cruise lane, the wake reaches 24 m (`dirtyHighM`): the two stalks of a long track drifted
  // 11-30 m apart and only 20 % of the canyon's long flights had a struggle moment (CONT-1);
  // with 24 m, 26 %, while the ceiling keeps 11 m and the sprint's dirty air stays under 14 %.
  airWPm: 18,
  airHoldK: 10,
  airTechPm: 30,
  airPacePm: 800,
  bandHoldPm: [1000, 1000, 1000, 1300],
  dirtyM: 11,
  dirtyHoldPm: 2500,
  dirtyTechPm: 500,
  dirtyNoRest: true,
  fightM: 5,
  dirtyHighM: 24,
  escapeTicks: 45,
  knockTicks: 45,
  knockCourTicks: 50,
  forcedLand: true,
  // step 1.3 (§3, L7)
  wings: WINGS_V3N,
  cornisaTicksPm: 500,
  cornisaTicksFloor: 2,
  heldSkill: true,
  // round 5 (measure/final.md, the design review F1-F11 of 4f9b899): F2 the dive is felt in the
  // air (its Δv recalibrated with the metres: 5400 / 6000 → 5110 / 5430, so the ledger's great dive
  // stays ≈ 6 m with the air share), F7 band 1 is climbed too, F5 flying keeps dry and the air pays
  // 90 % of the water and climb (one rule, no free band: the Acecho over the canyon's Colina at 750
  // won too much), F6 the tow by band and mm (×1.005; the Columna ×1.02 and her line +6 ‰, the
  // free hover draft of round 4 was worth ≈ 13-16 points of the sprint at 750), F3 a won line holds
  // at the price of the band she left and dives 650 ‰ of one more band (the struggle pays, bounded:
  // CONT-2), F9 the nerve ×1.10 (×1.15 made the Picada closer win the sprint at 750), F8 and F1
  // the Turbina and the pack's Pasillo (decide the owner)
  diveAirShare: true,
  climbFromGround: true,
  airWaterFree: true,
  airTerrainPm: 900,
  airTerrainFreeBand: 4,
  airDraftBand: true,
  overDivePm: 650,
  nerveM: 6,
  nerveBackM: 3,
  nerveBasePm: 400,
  nerveSlopePm: 600,
  nerveMinPm: 50,
  nerveBonusPm: 100,
  nerveMax: 2,
  groundFlies: true,
  ownAirFromBand: 2,
  overCleanHold: true,
  overAirPm: 0,
  // two lines per band (owner, 2026-11-08; .work/design7/measure/lines-final.md)
  lines: true,
  blockMm: 3_500,
  sideTicksMin: 1,
  sideTicksMax: 12,
  sideLookMm: 24_000,
  slotBaseMm: 4_500,
  slotCourMm: 3_000,
  switchMm: 1_200,
  switchTechHiPm: 1400,
  switchTechLoPm: 600,
  moveTicks: 4,
  outPm: 5,
  outAgiPm: 4,
  backTicks: 15,
  backMm: 3_000,
  doorMm: 4_000,
  doorBasePm: 200,
  doorIntPm: 400,
  doorLossMm: 1_000,
  sideDivePm: 650,
  // stage 3 «Todas vuelan» (owner, 2026-11-08; .work/design7/measure/allfly-final.md)
  // The round (allfly/probe.ts, paired.ts, w0all.ts): a skim with no terrain toll was worth 30-60
  // points to the lead on the canyon (its 500 m Colina and the water) and a Salto skimmed for free
  // saved ~30 energy (liftRequired 20 + 15 on the ridge); skims inside the final cut the legs'
  // kick (circuit lead −13 m). So the low band pays 950 ‰ of the climb and water toll (the air
  // above 900 ‰), 700 ‰ of a Salto's lift, half the water hit, rests the legs like any flight, and
  // ends before the final; what it gives is a short lift push (300 mm/s, decays by kDecel), a
  // cruise 3 ‰ above her air cruise and a cheap lift (700 ‰ of the climb). Round 2: a skim keeps all
  // her speed whatever the wing (the Lanza's 960 ‰ on every skim gave the Planeo 1-2 points of the
  // equal sprint and the ridge at 450, WING-0).
  allFly: true,
  leadEarlyDiv: 3,
  leadEarlyMinM: 150,
  leadObstacles: true,
  packFlatMinM: 200,
  skimTerrainPm: 950,
  skimDrainPm: 990,
  skimHoldPm: 1000,
  skimCruisePm: 8,
  skimClimbPm: 700,
  skimLandBasePm: 0,
  skimJumpPm: 700,
  skimWaterPm: 500,
  skimLiftMms: 100,
  skimKeepSpeed: true,
  // neutral wings (owner, 2026-11-08; .work/design7/measure/neutral-final.md): one frame profile
  // (the race fixtures' neutral frame, close to the mean of the 13 frames: PW 1.03, energy 111,
  // dissipation 62), no manufacturer rule, no wear, the style only a gesture
  neutralFrames: true,
  neutralFrame: { powerToWeight: 1000, energy: 100, dissipation: 60, durability: 100 },
  noWear: true,
  neutralStyles: true,
  // balance polish on neutral wings (measure/neutral-final.md, probes neutral/pos.ts): the high
  // band's line is 5 ‰ quicker and holds at 1000 ‰ (the Acecho lost the Columna's and Rampa's
  // cheap hold and fell to 7 % of the sprint at 300); the great dive from the ceiling 5430 → 6000
  // mm/s (the Remate lost the Picada's stoop); a skim lifts with 100 mm/s and cruises +8 ‰ (a
  // premium by the metre, not by the takeoff: the Pelotón of the circuit skims four flats); the
  // Pelotón skims the Saltos too (the ridge has one long flat); the Planeo's ground terms go to
  // the Punta (lead drain, 1030 ‰ of the start's acceleration); calmer bands: only the lead climbs
  // over the low traffic (after 90 ticks), and the over and the knock wait 45 ticks (3.4-3.9
  // band changes per sprint race → 1.7)
  highCruisePm: 5,
  skimEscapeTicks: 90,
  packJumps: true,
  leadGlidePos: true,
  leadStartAccelPm: 1030,
};

/** Neutral wings off: v3 is everyone flies (d3f5623) byte for byte (neutral/inv9.ts). */
export const FLIGHT_OFF_NEUTRAL: Partial<FlightConstants> = {
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

/** Stage 2 (§10 E2): every position flies, the canyon has a ceiling, ground wings grip. */
export const FLIGHT_V3_E2: FlightConstants = {
  ...FLIGHT_V3_E1,
  stage: 2,
  planned: [true, true, true, true],
  packFanDiv: 10,
  canyonCeiling: true,
  groundGripPm: 950,
};

/**
 * Race constants the v3 draft changes over v2, by stage. maxReplans 4 → 6: flights replan.
 * Round 1 brings R8's landing (880 / 60) into stage 1: a flight crosses a jump with no landing,
 * so with today's landing (800 / 120) covering one jump was worth 15-20 m and the lead and pack
 * fell to 5-9 % of the ridge at 300-450. The ground route goes half way (1100 → 1050); stage 2
 * takes it to 1000 together with the grip. Round 2: covering a jump in flight was still worth
 * 8-10 paired metres in the ridge, so a landing keeps 900 ‰ at technique 0 (930 at 600) and the
 * ground route goes to 1025: hover in the ridge at 450 went 30 → 28 %, ground 16-17 → 20 %.
 */
const RACE_V3_E1: Partial<RaceConstants> = {
  maxReplans: 6,
  landBasePm: 900,
  landTechPm: 60,
  groundDetourMult: 1_025,
};
const RACE_V3_E2: Partial<RaceConstants> = {
  ...RACE_V3_E1,
  groundDetourMult: 1_000,
};

/**
 * Rival field of the draft. Round 2 brought stage 3's rival technique (design §3 R11: 170 → 185 ‰)
 * forward for the two rival classes that fly in stage 1, Picada (closers) and Suspensión (stalks).
 * Round 5 (F10): their agility stays v2's (the owner: agility is the pillar, never the lever to fix
 * a Falconess); the +15 ‰ of technique comes from courage and intelligence (Picada) and from
 * stamina and intelligence (Suspensión). Peregrina is fixed by her own kit (L7). Glide and ground
 * rivals keep v2's rows.
 */
/** The rival rows of rounds 2-4 (agility 245 / 215): `preset off12` and the round-4 reference. */
export const FIELD_V3_R4: FieldConstants = {
  ...RULESET_V2.field,
  rivalWeights: {
    ...RULESET_V2.field.rivalWeights,
    dive: [245, 180, 185, 215, 175],
    hover: [215, 195, 185, 170, 235],
  },
};
const FIELD_V3: FieldConstants = {
  ...RULESET_V2.field,
  rivalWeights: {
    ...RULESET_V2.field.rivalWeights,
    dive: [250, 180, 185, 210, 175],
    hover: [220, 190, 185, 170, 235],
  },
};

/**
 * The v3 draft at a design stage: v2's season, field and race constants with flight on top.
 * `flight` and `race` override single constants (calibration sweeps).
 */
export function rulesetV3(
  stage = 1,
  flight: Partial<FlightConstants> = {},
  race: Partial<RaceConstants> = {},
): RulesetV3 {
  const F = { ...(stage >= 2 ? FLIGHT_V3_E2 : FLIGHT_V3_E1), ...flight };
  const raceStage = stage >= 2 ? RACE_V3_E2 : RACE_V3_E1;
  // stage 3 (allFly): a jump lands cheaper (R8, «saltar barato»)
  const allFly: Partial<RaceConstants> =
    F.allFly && F.skimLandBasePm > 0 ? { landBasePm: F.skimLandBasePm } : {};
  return {
    ...RULESET_V2,
    version: "v3",
    field: FIELD_V3,
    race: { ...RULESET_V2.race, ...raceStage, ...allFly, ...race },
    flight: F,
  };
}

/** The draft's default stage (1). */
export const RULESET_V3: RulesetV3 = rulesetV3(1);

/** The flight constants of a ruleset, or null (v1, v2): the engine's only switch. */
export function flightOf(ruleset: Ruleset): FlightConstants | null {
  if (!("flight" in ruleset)) return null;
  const f = ruleset.flight;
  return isFlightConstants(f) ? f : null;
}

function isFlightConstants(f: unknown): f is FlightConstants {
  return typeof f === "object" && f !== null && "climbE" in f && "planned" in f;
}

// --- the plan (R2, §4) -----------------------------------------------------------------------------

const isObstacle = (t: number) => t === SEG_CLIMB || t === SEG_WATER || t === SEG_JUMP;

/** A planned flight; `chain` = it flows into the next one without touching down (R9 split). */
type Flight = { a: number; b: number; band: number; corn: boolean; chain?: boolean };

/** Push an end point past any obstacle starting within `look` of it (+ margin), capped. */
function extendEnd(G: CourseGeometry, end: number, look: number, margin: number, cap: number) {
  let e = end;
  for (let guard = 0; guard < 8; guard++) {
    let moved = false;
    for (let s = 0; s < G.S; s++) {
      if (!isObstacle(G.segType[s] ?? 0)) continue;
      const a = G.segStart[s] ?? 0;
      const b = G.segEnd[s] ?? 0;
      if (a < e + look && b > e - 1 && b + margin > e) {
        e = b + margin;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return Math.min(e, cap);
}

function touches(G: CourseGeometry, a: number, b: number, pred: (t: number) => boolean): boolean {
  for (let s = 0; s < G.S; s++)
    if (pred(G.segType[s] ?? 0) && (G.segStart[s] ?? 0) < b && (G.segEnd[s] ?? 0) > a) return true;
  return false;
}

/** Stalk: band 2 from L/3 (or the cornisa of a descent starting ≤ 150 m before) to 0.7 L. */
function stalkPlan(F: FlightConstants, G: CourseGeometry, m: number): Flight[] {
  let a = Math.max(G.startEnd, floorDiv(G.L, F.stalkFromDiv));
  let corn = false;
  for (let s = 0; s < G.S; s++) {
    if (G.segType[s] !== SEG_DESCENT) continue;
    const sa = G.segStart[s] ?? 0;
    if (sa <= a && sa >= a - F.cornisaLookM * m) {
      a = sa;
      corn = true;
    }
  }
  const b = extendEnd(G, G.hoverAttack, F.lookM * m, F.marginM * m, G.reserveAt);
  return b > a ? [{ a, b, band: BAND_HIGH, corn }] : [];
}

/** Closer: the ceiling around the final's last feature, then the great dive (§4). */
function closerPlan(F: FlightConstants, G: CourseGeometry, m: number): Flight[] {
  const fs = G.finalStart;
  const minLen = Math.max(F.closerMinM * m, floorDiv(G.L, F.closerLenDiv));
  const cap = G.reserveAt;
  const finish = (a: number, featureEnd: number, corn: boolean): Flight | null => {
    let b = Math.max(a + minLen, featureEnd + F.marginM * m, fs);
    b = extendEnd(G, b, F.lookM * m, F.marginM * m, Number.MAX_SAFE_INTEGER);
    return b <= cap ? { a, b, band: BAND_CEILING, corn } : null;
  };
  // 1. the edge of the last descent that ends inside the final
  let pick: Flight | null = null;
  for (let s = G.S - 1; s >= 0 && pick === null; s--) {
    if (G.segType[s] !== SEG_DESCENT) continue;
    const sb = G.segEnd[s] ?? 0;
    if (sb > fs) pick = finish(G.segStart[s] ?? 0, sb, true);
    break;
  }
  // 2. the lip of the last jump of the final
  if (pick === null)
    for (let s = G.S - 1; s >= 0; s--) {
      if (G.segType[s] !== SEG_JUMP) continue;
      const sa = G.segStart[s] ?? 0;
      if (sa >= fs) pick = finish(Math.max(0, sa - F.jumpLipM * m), G.segEnd[s] ?? 0, false);
      break;
    }
  if (pick !== null) return [pick];
  // 3. 100 m before the final; if that stretch touches a canyon or an obstacle, after the last
  // one of the final; if that cannot touch down before L − 60 m, 100 m before the final anyway
  const a3 = Math.max(0, fs - F.closerPreFinalM * m);
  const plain: Flight = {
    a: a3,
    b: Math.max(a3 + minLen, fs),
    band: BAND_CEILING,
    corn: false,
  };
  const blocked = (t: number) => t === SEG_CANYON || isObstacle(t);
  if (!touches(G, plain.a, plain.b, blocked)) return plain.b <= cap ? [plain] : [];
  let last = -1;
  for (let s = 0; s < G.S; s++)
    if (blocked(G.segType[s] ?? 0) && (G.segEnd[s] ?? 0) > fs) last = G.segEnd[s] ?? 0;
  if (last >= 0) {
    const a = last + F.marginM * m;
    const late = finish(a, a, false);
    if (late !== null && late.b - late.a >= minLen) return [late];
  }
  return plain.b <= cap ? [{ ...plain, b: Math.min(plain.b, cap) }] : [];
}

/** Lead (stage 2): band 1 over every climb, water and jump, 20 m each side; joins gaps < 60 m. */
function leadPlan(F: FlightConstants, G: CourseGeometry, m: number): Flight[] {
  const raw: { a: number; b: number }[] = [];
  // stage 3 (allFly): clean air at the front, a skim from the start's end
  if (F.allFly && F.leadEarlyDiv > 0) {
    const a = G.startEnd;
    const len = Math.max(F.leadEarlyMinM * m, floorDiv(G.L, F.leadEarlyDiv));
    raw.push({ a, b: Math.min(G.finalStart, a + len) });
  }
  const obstacles = !F.allFly || F.leadObstacles || F.planned[POS_LEAD];
  // stage 3 (allFly): the final belongs to the legs (and the closers' dive): skims end before it
  const end = F.allFly ? G.finalStart : G.reserveAt;
  for (let s = 0; s < G.S && obstacles; s++) {
    if (!isObstacle(G.segType[s] ?? 0)) continue;
    const a = Math.max(0, (G.segStart[s] ?? 0) - F.marginM * m);
    if (F.allFly && a >= end) continue;
    raw.push({ a, b: Math.min(end, (G.segEnd[s] ?? 0) + F.marginM * m) });
  }
  raw.sort((x, y) => x.a - y.a);
  const out: Flight[] = [];
  for (const { a, b } of raw) {
    if (b <= a) continue;
    const last = out[out.length - 1];
    if (last && a - last.b < F.leadJoinM * m) last.b = Math.max(last.b, b);
    else out.push({ a, b, band: BAND_LOW, corn: false });
  }
  return out;
}

/**
 * Pack: band 1 along every canyon (the Pasillo; stage 1 from round 5, F1), and from stage 2 the
 * Abanico from the final's start (L/10, ≥ 80 m).
 */
function packPlan(F: FlightConstants, G: CourseGeometry, m: number): Flight[] {
  const raw: Flight[] = [];
  for (let s = 0; s < G.S; s++)
    if (G.segType[s] === SEG_CANYON)
      raw.push({
        a: G.segStart[s] ?? 0,
        b: Math.min(G.reserveAt, G.segEnd[s] ?? 0),
        band: BAND_LOW,
        corn: false,
      });
  const fa = G.finalStart;
  // stage 3 (allFly): the pack skims the long flats between the start's end and the final
  if (F.allFly && F.packFlatMinM > 0)
    for (let s = 0; s < G.S; s++) {
      if (G.segType[s] !== SEG_FLAT) continue;
      const a = Math.max(G.segStart[s] ?? 0, G.startEnd);
      const b = Math.min(G.segEnd[s] ?? 0, fa, G.reserveAt);
      if (b - a >= F.packFlatMinM * m) raw.push({ a, b, band: BAND_LOW, corn: false });
    }
  if (F.allFly && F.packJumps)
    for (let s = 0; s < G.S; s++) {
      if (G.segType[s] !== SEG_JUMP) continue;
      const a = Math.max(G.startEnd, (G.segStart[s] ?? 0) - 20 * m);
      const b = Math.min((G.segEnd[s] ?? 0) + 20 * m, fa, G.reserveAt);
      // only a Salto she reaches after the start (one she meets in the start is jumped)
      if ((G.segEnd[s] ?? 0) <= fa && (G.segStart[s] ?? 0) - 20 * m >= G.startEnd)
        raw.push({ a, b, band: BAND_LOW, corn: false });
    }
  if (F.packFanDiv > 0) {
    const len = Math.max(F.packFanMinM * m, floorDiv(G.L, F.packFanDiv));
    raw.push({
      a: fa,
      b: extendEnd(G, fa + len, F.lookM * m, F.marginM * m, G.reserveAt),
      band: BAND_LOW,
      corn: false,
    });
  }
  raw.sort((x, y) => x.a - y.a);
  const out: Flight[] = [];
  for (const f of raw) {
    if (f.b <= f.a) continue;
    const last = out[out.length - 1];
    if (last && f.a <= last.b) last.b = Math.max(last.b, f.b);
    else out.push({ ...f });
  }
  return out;
}

/**
 * R9: nobody holds above band 1 inside a canyon. A high flight that reaches a canyon drops to band
 * 1 at its edge (no dive, no loss) and climbs back at its exit, paying the climb, as three chained
 * flights; if it would end inside the canyon, or keep less than `canyonExitMinM` after it, it dives
 * `canyonDiveBeforeM` before the canyon instead. One that takes off inside flies low to the exit.
 */
function ceilingCut(F: FlightConstants, G: CourseGeometry, m: number, fl: Flight[]): Flight[] {
  const out: Flight[] = [];
  for (const f of fl) {
    if (f.band <= BAND_LOW) {
      out.push(f);
      continue;
    }
    let cur: Flight | null = { ...f };
    for (let s = 0; s < G.S && cur !== null; s++) {
      if (G.segType[s] !== SEG_CANYON) continue;
      const ca = G.segStart[s] ?? 0;
      const cb = G.segEnd[s] ?? 0;
      // a flight that ends less than `canyonDiveBeforeM` before the canyon would dive inside it
      if (cb <= cur.a || ca >= cur.b + F.canyonDiveBeforeM * m) continue;
      if (ca <= cur.a) {
        // takes off inside: low until the exit, then up to her band (or low to the end)
        if (cur.b - cb >= F.canyonExitMinM * m) {
          out.push({ a: cur.a, b: cb, band: BAND_LOW, corn: cur.corn, chain: true });
          cur = { ...cur, a: cb, corn: false };
        } else cur = { ...cur, band: BAND_LOW, b: Math.min(cur.b, cb) };
      } else if (cur.b <= cb || cur.b - cb < F.canyonExitMinM * m) {
        const b = ca - F.canyonDiveBeforeM * m;
        cur = b > cur.a ? { ...cur, b } : null;
      } else {
        const drop = Math.max(cur.a + 1, ca - F.canyonDiveBeforeM * m);
        out.push({ ...cur, b: drop, chain: true });
        out.push({ a: drop, b: cb, band: BAND_LOW, corn: false, chain: true });
        cur = { ...cur, a: cb, corn: false };
      }
    }
    if (cur !== null) out.push(cur);
    else {
      const last = out[out.length - 1];
      if (last) last.chain = false;
    }
  }
  return out;
}

/**
 * The runner's flight plan before tick 0 (R2): a pure function of the geometry, her own position,
 * her wings and her stats, the same the pre-race card can show. Writes `flN`, `flA`, `flB`,
 * `flBand`, `flCorn`, the planned costs (R3, R4) and the reserve `flRes0`, and marks the jumps a
 * planned flight covers (no lift, no jump reserve). Reads no other runner. Ground wings fly only
 * with `groundFlies` (F8), and only the flights within their wing's `maxBand`.
 */
export function planFlights(
  F: FlightConstants,
  G: CourseGeometry,
  T: RaceTables,
  i: number,
  posPerMm: number,
  liftF: number,
  courage: number,
  velPerMms: number,
  air: { u28: number; u30: number; technique: number },
): void {
  const wing = wingOf(F, T.style[i] ?? 0);
  T.climbMe[i] = ceilDiv(F.climbE * 1000 * wing.climbCostPm, Math.max(1, liftF));
  // L5: η = diveEtaBasePm + diveEtaCouragePm × min(C, 1200) / 1200; S1: × the wing's diveWingPm
  const eta = F.diveEtaBasePm + floorDiv(F.diveEtaCouragePm * Math.min(courage, 1200), 1200);
  for (let b = 0; b < 4; b++)
    T.diveV[i * 4 + b] =
      floorDiv((F.diveVMms[b] ?? 0) * eta * wing.diveWingPm, 1_000_000) * velPerMms;
  // L1: the air of flight k, one byte of slot 28 (k < 4) or 30 (k ≥ 4), drawn before tick 0
  for (let k = 0; k < FLIGHTS_MAX; k++) {
    const u = k < 4 ? air.u28 : air.u30;
    T.airOff[i * FLIGHTS_MAX + k] =
      airOffsetPm(F, (u >>> (8 * (k % 4))) & 255, air.technique) + (F.airWPm > 0 ? wing.airPm : 0);
  }
  // L3: dirty air costs × (1000 + extra − extra × dirtyTechPm × min(T, 1200) / 1.2e6) / 1000
  const extra = Math.max(0, F.dirtyHoldPm - 1000);
  T.dirtyPm[i] =
    1000 + extra - floorDiv(extra * F.dirtyTechPm * Math.min(air.technique, 1200), 1_200_000);
  // L4: courage holds the line
  T.knockAt[i] = F.knockTicks + floorDiv(F.knockCourTicks * Math.min(courage, 1200), 1200);
  const liftH = holdLift(F, T.style[i] ?? 0, liftF);
  T.liftH[i] = liftH;
  T.flN[i] = 0;
  T.flRes0[i] = 0;
  if (T.style[i] === STYLE_GROUND && !F.groundFlies) return;
  const pc = T.position[i] ?? 0;
  // stage 3 (allFly): the lead and the pack fly too
  if (!F.planned[pc] && !(F.allFly && (pc === POS_LEAD || pc === POS_PACK))) return;
  const m = posPerMm * 1000;
  let fl =
    pc === POS_STALK
      ? stalkPlan(F, G, m)
      : pc === POS_CLOSER
        ? closerPlan(F, G, m)
        : pc === POS_LEAD
          ? leadPlan(F, G, m)
          : pc === POS_PACK
            ? packPlan(F, G, m)
            : [];
  if (F.canyonCeiling) fl = ceilingCut(F, G, m, fl);
  // F8: a wing never plans above its `maxBand` (the Turbina skims only the low band's flights)
  fl = fl.filter((f) => f.b > f.a && f.band <= wing.maxBand).slice(0, FLIGHTS_MAX);
  let res = 0;
  fl.forEach((f, k) => {
    const x = i * FLIGHTS_MAX + k;
    T.flA[x] = f.a;
    T.flB[x] = f.b;
    T.flBand[x] = f.band;
    T.flCorn[x] = f.corn ? 1 : 0;
    T.flChain[x] = f.chain && k + 1 < Math.min(fl.length, FLIGHTS_MAX) ? 1 : 0;
    const prev = k > 0 && fl[k - 1]?.chain ? (fl[k - 1]?.band ?? 0) : 0;
    const climb = floorDiv(
      floorDiv(
        Math.max(0, f.band - prev) * (T.climbMe[i] ?? 0) * (f.corn ? F.cornisaPm : 1000),
        1000,
      ) * (F.allFly && f.band === BAND_LOW ? F.skimClimbPm : 1000),
      1000,
    );
    const hold = holdMe(F, bandPu(F, f.band, f.b - f.a), posPerMm, liftH);
    let jumps = 0;
    for (let s = 0; s < G.S; s++)
      if (G.segType[s] === SEG_JUMP && (G.segStart[s] ?? 0) >= f.a && (G.segEnd[s] ?? 0) <= f.b) {
        T.jumpCovered[is(i, s)] = 1;
        // stage 3 (allFly): a skim pays skimJumpPm of the Salto's lift; reserved with its climb
        if (F.allFly && f.band === BAND_LOW)
          jumps += floorDiv((G.liftReq[s] ?? 0) * 1000 * F.skimJumpPm, 1000);
      }
    T.flClimb[x] = climb + jumps;
    T.flHold[x] = hold;
    res += climb + jumps + hold;
  });
  T.flN[i] = fl.length;
  T.flRes0[i] = res;
  // R3c: a plan whose every flight goes to the ceiling is the final's great dive: the energy she
  // keeps for later pays it, with its hold at her dirty-air price (the ceiling is shared)
  let keepMe = 0;
  if (F.keepFlown && fl.length > 0 && fl.every((f) => f.band === BAND_CEILING))
    for (let k = 0; k < fl.length; k++) {
      const x = i * FLIGHTS_MAX + k;
      keepMe += (T.flClimb[x] ?? 0) + ceilDiv((T.flHold[x] ?? 0) * (T.dirtyPm[i] ?? 1000), 1000);
    }
  T.keepFlight[i] = keepMe;
}

/** me to hold `bandPu` (band × pu) at liftF (R4): holdE energy per band per 100 m at liftF 1000. */
export function holdMe(F: FlightConstants, bandPu: number, posPerMm: number, liftF: number) {
  return floorDiv(bandPu * F.holdE * 10_000, posPerMm * 1000 * Math.max(1, liftF));
}

/** `jr` of the gates and the plan, plus the energy still reserved for planned flights (R3). */
export function jrNow(T: RaceTables, S: RaceState, i: number, seg: number): number {
  return (T.jr[is(i, seg)] ?? 0) + (S.flRes[i] ?? 0);
}
