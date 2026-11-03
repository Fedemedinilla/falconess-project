import { ceilDiv, floorDiv, U32_RANGE, uPm, uRange } from "@falconess/rng";
import type { Course, RaceEntry, RacePhase, SegmentType } from "@falconess/schema";
import { POSITIONS, RACE_RULES, SEGMENT_TYPES, STYLES } from "@falconess/schema";
import { compileRule, createPulseState, initPulseLane, type PulseState } from "../rules/index.js";
import type { RaceConstants, Ruleset } from "../rulesets/index.js";
import { flightOf, planFlights } from "./flight.js";
import { type CourseGeometry, MAX_SEGMENTS } from "./geometry.js";
import {
  accelVu,
  activationPm,
  agilityCruiseVu,
  boostThrustVu,
  chainThrustVu,
  coolTick,
  cruiseVu,
  drainCoefficients,
  exhaustSpeedVu,
  fatiguePm,
  groundDetourPm,
  heatCapMh,
  heatTolerancePm,
  hpMaxMicro,
  jumpNeedMe,
  landingKeepPm,
  liftFactorPm,
  overheatDamage,
  paceCentrePm,
  planErrWindowPm,
  powerVariant,
  pulseThrustVu,
  segmentFactor,
  staminaDivisor,
  styleDamagePm,
  variantPower,
} from "./physics.js";
import {
  engineUnits,
  MODE_OFF,
  PH_FINAL,
  POS_PACK,
  POS_STALK,
  positionCode,
  ruleCode,
  SEG_CLIMB,
  SEG_CURVES,
  SEG_DESCENT,
  SEG_JUMP,
  SEG_WATER,
  STYLE_DIVE,
  STYLE_GLIDE,
  STYLE_GROUND,
  styleCode,
} from "./units.js";

/**
 * Race state as struct of arrays (docs/race-engine.md 1.2, 3.3, 22). One arena is sized once for
 * the maxima of the schema (8 lanes, 24 segments, 8 skills) and reused through `opts.arena`;
 * `reset` zero-fills it. Every per-runner scalar lives in a typed array indexed by lane; anything
 * that can exceed 2^31 (positions, hp, accumulators, plan positions, finish times) lives in a
 * Float64Array, where integers are exact below 2^53. Internal TS types, not data formats.
 */

/** Planned flights per runner (ruleset v3 draft, design7 R2). */
export const FLIGHTS_MAX = 8;
/** Arena capacity: the schema's lane bound. */
export const MAX_LANES = 8;
/** Arena capacity: the schema's active-skill bound (`RaceEntry.skills`). */
export const MAX_SKILLS = 8;
/** Pre-drawn `u` values per skill (activations k = 0..2, section 17.1). */
export const ACTIVATION_SLOTS = 3;
/** Draw slots before the skill slots: three pace phases and the plan error (17.1). */
export const SKILL_SLOT_BASE = 4;
/** An immunity without `untilMeters` covers the whole race (8.3 `INF`). */
export const IMMUNE_WHOLE_RACE = Number.MAX_SAFE_INTEGER;

// --- runner flag bits (1.2) ------------------------------------------------------------------------
export const F_EXHAUSTED = 1;
export const F_BROKEN = 2;
export const F_AIRBORNE = 4;
export const F_PENDING_JUMP = 8;
export const F_DASH = 16;
export const F_FINISHED = 32;
export const F_DNF = 64;
export const F_FINAL_ENTERED = 128;
export const F_PLAN_ACTIVE = 256;
export const F_REPLAN = 512;
/** The tick's single overheat flag (8.3), kept until the next non-stalled tick recomputes it. */
export const F_OVER = 1024;

// --- replan causes, `SprintPlanCause` order (11.1) -------------------------------------------------
export const CAUSE_PHASE = 0;
export const CAUSE_REFUND = 1;
export const CAUSE_JUMP = 2;
export const CAUSE_BROKEN = 3;

// --- frozen skill column bits (15) -----------------------------------------------------------------
export const SK_ONCE = 1;
export const SK_DISABLED = 2;
export const SK_GUARD = 4;
export const SK_HAS_SEGMENT = 8;
export const SK_HAS_POSITION = 16;
export const SK_HAS_HEAT = 32;
export const SK_HAS_ENERGY = 64;
/** `trigger.phase` code: start, middle, final as `PH_*`, `any` = 3. */
export const SK_PHASE_ANY = 3;

/** Drain coefficient variants `dK[q]` (section 6): q = (final ? 2 : 0) + (glide lead ? 1 : 0). */
export const DK_LEAD = 1;
export const DK_FINAL = 2;

// --- flat index helpers ----------------------------------------------------------------------------
/** Index of (lane, PW variant b). */
export function ib(i: number, b: number): number {
  return i * 2 + b;
}
/** Index of (lane, segment). */
export function is(i: number, s: number): number {
  return i * MAX_SEGMENTS + s;
}
/** Index of (lane, PW variant b, segment). */
export function ibs(i: number, b: number, s: number): number {
  return (i * 2 + b) * MAX_SEGMENTS + s;
}
/** Index of (lane, PW variant b, phase, segment). */
export function ibps(i: number, b: number, ph: number, s: number): number {
  return ((i * 2 + b) * 3 + ph) * MAX_SEGMENTS + s;
}
/** Index of (lane, phase, segment). */
export function ips(i: number, ph: number, s: number): number {
  return (i * 3 + ph) * MAX_SEGMENTS + s;
}
/** Index of (lane, skill j). */
export function ik(i: number, j: number): number {
  return i * MAX_SKILLS + j;
}
/** Index of (lane, skill j, activation k). */
export function ikk(i: number, j: number, k: number): number {
  return (i * MAX_SKILLS + j) * ACTIVATION_SLOTS + k;
}

const N = MAX_LANES;
const NS = MAX_LANES * MAX_SEGMENTS;
const NK = MAX_LANES * MAX_SKILLS;

/** Per-race tables of docs/race-engine.md 3.3, built before tick 0 and read-only in the loop. */
export type RaceTables = {
  /** The wings' style: their physics (9.8). */
  readonly style: Int32Array;
  /** The race position: the controller row, its keep, hold and plan point (9.4, ADR-0008). */
  readonly position: Int32Array;
  readonly rule: Int32Array;
  /** `PW₁` (‰), for the `durabilityBroken` event. */
  readonly pwBroken: Int32Array;
  readonly pwc: Int32Array;
  readonly pwb: Int32Array;
  readonly vA: Int32Array;
  readonly f: Int32Array;
  readonly vC: Int32Array;
  readonly vMin: Int32Array;
  readonly acc: Int32Array;
  /** Glide's launch (9.8): acceleration in the start phase; equals `acc` for other styles. */
  readonly accStart: Int32Array;
  readonly B: Int32Array;
  readonly Bp: Int32Array;
  readonly Bpc: Int32Array;
  readonly Bon: Float64Array;
  readonly unit: Float64Array;
  readonly sMax: Float64Array;
  readonly costOn: Int32Array;
  /** Energy the final plan window can actually spend, me, per PW variant (9.3; `SURPLUS`). */
  readonly capFinal: Float64Array;
  /** The pack position's even level, vu, per PW variant (9.3; 0 in other positions). */
  readonly groundLevel: Float64Array;
  /** Where hpMax runs out at cruise from the gun, pu, per PW variant (9.3 `exhaust0`). */
  readonly exhaust0: Float64Array;
  readonly hpMax: Float64Array;
  readonly stamDiv: Int32Array;
  readonly fat: Int32Array;
  readonly dK: Int32Array;
  readonly tol: Int32Array;
  readonly D: Int32Array;
  readonly heatCap: Int32Array;
  readonly capLim: Int32Array;
  readonly coolTick: Int32Array;
  readonly dmgTick: Int32Array;
  readonly regenTick: Int32Array;
  readonly Emax: Int32Array;
  readonly durMax: Int32Array;
  readonly liftF: Int32Array;
  readonly landPm: Int32Array;
  /** Ground only (table 3.3); 1000 for every other style (they never detour). */
  readonly detour: Int32Array;
  readonly kickAt: Float64Array;
  /** Where the first plan is made: `finalStart`, stalk `hoverAttack` (11.1). */
  readonly planPoint: Float64Array;
  /** Energy a jump segment needs (`need[j]`), 0 on other segments. */
  readonly need: Int32Array;
  /** Jump reserve per segment, me (14.4): what the jumps still ahead need; 0 for ground. */
  readonly jr: Int32Array;
  /** The jump reserve at the gun, me: `R` of the course's first jump (14.4); 0 for ground. */
  readonly jrStart: Int32Array;
  // ruleset v3 draft (design7 «Despegar y caer»): the flight plan, all zero without `flight`
  /** Planned flights per runner (≤ FLIGHTS_MAX). */
  readonly flN: Int32Array;
  /** pu: takeoff point and end point (descent starts) of flight k, index i × FLIGHTS_MAX + k. */
  readonly flA: Float64Array;
  readonly flB: Float64Array;
  readonly flBand: Int32Array;
  /** 1 = takes off at the edge of a descent (cornisa): climbing costs `cornisaPm`. */
  readonly flCorn: Uint8Array;
  /** 1 = flight k flows into k + 1 without touching down (R9: band 1 inside a canyon). */
  readonly flChain: Uint8Array;
  /** me planned for the climb and for holding the band over [flA, flB). */
  readonly flClimb: Int32Array;
  readonly flHold: Int32Array;
  /** me: the whole plan's reserve at the gun. */
  readonly flRes0: Int32Array;
  /**
   * R3c (feel round 3): me of her ceiling plan priced at her dirty air (climb + hold × dirtyPm),
   * which the energy she keeps for later (`keepOk`) already covers; 0 = the rule is off for her.
   */
  readonly keepFlight: Int32Array;
  /** 1 = the jump segment is covered by a planned flight (no lift, no jump reserve), (lane, seg). */
  readonly jumpCovered: Uint8Array;
  /** me per band of climb at liftF. */
  readonly climbMe: Int32Array;
  /** vu added to the body speed by a dive from band b (index i × 4 + b). */
  readonly diveV: Int32Array;
  /** Air cruise (L1b: `airPacePm` of her pace draw), same index as vC. */
  readonly vCAir: Int32Array;
  /** liftF folded with her wing's holdPm (S1), for the hold of every tick (`holdLift`). */
  readonly liftH: Int32Array;
  /** L1 (step 1.2): the air of flight k, ‰ of the air cruise, index i × FLIGHTS_MAX + k. */
  readonly airOff: Int32Array;
  /** L3: ‰ of the hold in dirty air for her technique; L4: dirty ticks before a knock (courage). */
  readonly dirtyPm: Int32Array;
  readonly knockAt: Int32Array;
  readonly pulseFrame: Uint8Array;
  readonly airPm: Int32Array;
  readonly stoop: Int32Array;
  readonly styleDmg: Int32Array;
  /** `RuleTerms.heatPenalty` (8.3): false for mass-thrust. */
  readonly heatPenalty: Uint8Array;
  /** Telemetry's defensive clamp `heat ≤ D` (8.1). */
  readonly clampHeat: Uint8Array;
  /** Overheat licence holder (9.3). */
  readonly licensed: Uint8Array;
  readonly heatImmune: Uint8Array;
  readonly immuneUntil: Float64Array;
  readonly armor: Uint8Array;
  readonly armorExtra: Int32Array;
  readonly packRegen: Int32Array;
  readonly heatToEnergyPm: Int32Array;
  readonly repairMd: Int32Array;
  /** Activation bonus per phase (15.2): phase trait + `any` trait + the rule's bonus (telemetry). */
  readonly actBonus: Int32Array;
  readonly pace: Int32Array;
  readonly paceCentre: Int32Array;
  readonly planErrWindow: Int32Array;
  readonly planErr: Int32Array;
  readonly pAct: Int32Array;
  readonly pSkill: Int32Array;
  readonly u: Int32Array;
  readonly luckyIdx: Int32Array;
  readonly nSkills: Int32Array;
  readonly skFlags: Int32Array;
  readonly skPhase: Int32Array;
  readonly skSeg: Int32Array;
  readonly skPosLo: Int32Array;
  readonly skPosHi: Int32Array;
  readonly skHeat: Float64Array;
  readonly skEnergy: Float64Array;
  /** `speedMms × 15` vu. */
  readonly skSpeed: Int32Array;
  readonly skAccel: Int32Array;
  readonly skRefund: Int32Array;
  readonly skCool: Int32Array;
  readonly skDur: Int32Array;
};

/** Dynamic per-runner state of docs/race-engine.md 1.2 plus the ledger of 20.5. */
export type RaceState = {
  readonly pos: Float64Array;
  readonly prevPos: Float64Array;
  readonly disp: Float64Array;
  readonly vCore: Int32Array;
  readonly vOut: Int32Array;
  /** `vOut` of the previous non-stalled tick (9.3 licence projection). */
  readonly vOutPrev: Int32Array;
  readonly hp: Float64Array;
  readonly energy: Int32Array;
  readonly heat: Int32Array;
  readonly dur: Int32Array;
  readonly seg: Int32Array;
  readonly stall: Int32Array;
  readonly flags: Uint16Array;
  readonly replanCause: Int32Array;
  /** Pulse state, the shared free-first-boost mask and the level accumulator (12, 9.5). */
  readonly pulse: PulseState;
  readonly mode: Int32Array;
  readonly modeLevel: Int32Array;
  readonly holdLeft: Int32Array;
  readonly planLevel: Int32Array;
  readonly planStartPos: Float64Array;
  readonly planEndPos: Float64Array;
  readonly planCount: Int32Array;
  readonly freeLeft: Int32Array;
  readonly freeSeg: Int32Array;
  readonly guardLeft: Int32Array;
  readonly skillSpeed: Int32Array;
  readonly skillAccel: Int32Array;
  /** Skill effects still running (frame flag `skill effect active`). */
  readonly activeSkills: Int32Array;
  readonly acts: Int32Array;
  readonly activeLeft: Int32Array;
  readonly armed: Uint8Array;
  readonly missLogged: Uint8Array;
  readonly finishMilli: Float64Array;
  readonly b: Uint8Array;
  // the decision of the current tick (step B7)
  readonly boostOn: Uint8Array;
  readonly isPulseTick: Uint8Array;
  readonly freeTick: Uint8Array;
  readonly burstChain: Uint8Array;
  /** Frame flags of the runner's last tick (20.4). */
  readonly tickFlags: Int32Array;
  /** Boost on-ticks since the previous frame row. */
  readonly boostRow: Int32Array;
  // rank snapshot (9.1)
  readonly key: Float64Array;
  readonly ahead: Int32Array;
  readonly posFrac: Int32Array;
  // results (19)
  readonly place: Int32Array;
  readonly deadHeat: Uint8Array;
  readonly timeTicks: Int32Array;
  /** mm; −1 = none yet. */
  readonly marginMm: Float64Array;
  readonly vFinishMms: Int32Array;
  /** gap[A × 8 + B] (mm) at the instant A crossed (19). */
  readonly gap: Float64Array;
  // ledger (20.5)
  readonly phaseTicks: Int32Array;
  readonly boostTicks: Int32Array;
  readonly pulses: Int32Array;
  readonly stallTicks: Int32Array;
  readonly energySpent: Float64Array;
  readonly energyRegen: Float64Array;
  readonly energyRefunded: Float64Array;
  readonly energyFromHeat: Float64Array;
  readonly energyLift: Float64Array;
  readonly overheatTicks: Int32Array;
  readonly durabilityLost: Float64Array;
  readonly durabilityRepaired: Float64Array;
  /** mm; −1 = never emptied. */
  readonly hpEmptyMm: Float64Array;
  readonly draftTicks: Int32Array;
  readonly landingLossMms: Int32Array;
  readonly jumpsOk: Int32Array;
  readonly jumpsFailed: Int32Array;
  readonly detours: Int32Array;
  // ruleset v3 draft (design7): flight state and its ledger, all zero without `flight`
  /** Altitude band 0-3 as drawn (R1). */
  readonly alt: Int32Array;
  /** 0 ground (or a plain jump), 1 climbing, 2 holding the band, 3 descending. */
  readonly flPhase: Int32Array;
  /** Next planned flight to take off. */
  readonly flK: Int32Array;
  /** Current flight + 1 (0 = none). */
  readonly flCur: Int32Array;
  readonly altTarget: Int32Array;
  readonly altTimer: Int32Array;
  /** Band the descent started from (the dive's band). */
  readonly fromBand: Int32Array;
  /** 0 plan, 1 energy. */
  readonly fallCause: Int32Array;
  /** me still reserved for planned flights (added to every `jr` read). */
  readonly flRes: Int32Array;
  /** me of the current flight's hold still inside `flRes`. */
  readonly flHoldLeft: Int32Array;
  /** band × pu flown while holding, and the me already billed for it. */
  readonly holdPu: Float64Array;
  readonly holdBilled: Int32Array;
  readonly airTicks: Int32Array;
  readonly flights: Int32Array;
  readonly dives: Int32Array;
  readonly grandDives: Int32Array;
  readonly diveGainMm: Float64Array;
  readonly hpRested: Float64Array;
  readonly energyClimb: Float64Array;
  readonly energyHold: Float64Array;
  readonly noLift: Int32Array;
  readonly jumpsCovered: Int32Array;
  /** vu of dive surge still on top of the body speed (`diveSurge` knob only). */
  readonly surge: Int32Array;
  // ruleset v3 stage 1 (diseno-v3-vuelo.md): the struggle up there, the log and the held skill
  /** Position at the end of tick t − 1 (step A), for the dirty air and the passes. */
  readonly pos0: Float64Array;
  /** L3: 1 = in dirty air this tick, 2 = also within `fightM` (L4) (step A, t − 1 snapshot). */
  readonly dirty: Uint8Array;
  /** L4: ticks of dirty air in a row, and 1 once she has tried to go over (once per race). */
  readonly dirtyRun: Int32Array;
  readonly escaped: Uint8Array;
  /** 1 = the current flight was knocked down (its dive is lost: touchdown cause knock). */
  readonly knocked: Uint8Array;
  /** 1 = the current flight already counted as below its plan (RISK-1). */
  readonly belowCounted: Uint8Array;
  /** Tick (+ 1) the current dirty run began, for the `airDirty` event (0 = none). */
  readonly dirtySince: Int32Array;
  /** Highest band reached in the current flight, and its ticks per band climbed (S1, S2). */
  readonly flApex: Int32Array;
  readonly climbTk: Int32Array;
  /** Ledger of stage 1. */
  readonly passesAir: Int32Array;
  readonly passesDive: Int32Array;
  readonly peakMms: Int32Array;
  readonly apexMax: Int32Array;
  readonly dirtyTicks: Int32Array;
  readonly holdExtra: Float64Array;
  readonly overs: Int32Array;
  readonly knocks: Int32Array;
  readonly falls: Int32Array;
  readonly belowPlan: Int32Array;
  /** `pass` candidates (lane i over lane j), index i × MAX_LANES + j: start tick + 1 (0 = none). */
  readonly passSince: Int32Array;
  /** Bit 1: passer in the air at the start; bit 2: passer in her dive surge. */
  readonly passKind: Uint8Array;
  /** L7: 1 = the skill fired in the air and is held; ticks held. Index ik(i, j). */
  readonly skHeld: Uint8Array;
  readonly skHeldTicks: Int32Array;
  /** L7: skills she holds now (0 = the timers tick as in v2). */
  readonly heldN: Uint8Array;
};

/**
 * Preallocated memory for one race (docs/race-engine.md 22). `reset(n, G)` zero-fills it and
 * returns it ready for `n` runners on `G`; `simulateRace` then builds the tables and the initial
 * state. Reusing one arena never changes a result (property P7).
 */
export type RaceArena = {
  readonly tables: RaceTables;
  readonly state: RaceState;
  /** The pre-drawn block (17.1): `n × R.rngBlock` u32 values, lane by lane, slot by slot. */
  U: Float64Array;
  n: number;
  reset(n: number, G: CourseGeometry): RaceArena;
};

function i32(len: number): Int32Array {
  return new Int32Array(len);
}
function f64(len: number): Float64Array {
  return new Float64Array(len);
}
function u8(len: number): Uint8Array {
  return new Uint8Array(len);
}

function createTables(): RaceTables {
  const NPS = NS * 3;
  return {
    style: i32(N),
    position: i32(N),
    rule: i32(N),
    pwBroken: i32(N),
    pwc: i32(N * 2),
    pwb: i32(N * 2),
    vA: i32(N),
    f: i32(NS),
    vC: i32(NPS * 2),
    vMin: i32(NPS * 2),
    acc: i32(NS * 2),
    accStart: i32(NS * 2),
    B: i32(N * 2),
    Bp: i32(N * 2),
    Bpc: i32(N * 2),
    Bon: f64(N * 2),
    unit: f64(N * 2),
    sMax: f64(N * 2),
    costOn: i32(N),
    capFinal: f64(N * 2),
    groundLevel: f64(N * 2),
    exhaust0: f64(N * 2),
    hpMax: f64(N),
    stamDiv: i32(N),
    fat: i32(N),
    dK: i32(N * 4),
    tol: i32(N),
    D: i32(N),
    heatCap: i32(N),
    capLim: i32(N),
    coolTick: i32(N),
    dmgTick: i32(N),
    regenTick: i32(N),
    Emax: i32(N),
    durMax: i32(N),
    liftF: i32(N),
    landPm: i32(N),
    detour: i32(N),
    kickAt: f64(N),
    planPoint: f64(N),
    need: i32(NS),
    jr: i32(NS),
    jrStart: i32(N),
    flN: i32(N),
    flA: f64(N * FLIGHTS_MAX),
    flB: f64(N * FLIGHTS_MAX),
    flBand: i32(N * FLIGHTS_MAX),
    flCorn: u8(N * FLIGHTS_MAX),
    flChain: u8(N * FLIGHTS_MAX),
    flClimb: i32(N * FLIGHTS_MAX),
    flHold: i32(N * FLIGHTS_MAX),
    flRes0: i32(N),
    keepFlight: i32(N),
    jumpCovered: u8(NS),
    climbMe: i32(N),
    diveV: i32(N * 4),
    vCAir: i32(N * 2 * 3 * MAX_SEGMENTS),
    liftH: i32(N),
    airOff: i32(N * FLIGHTS_MAX),
    dirtyPm: i32(N),
    knockAt: i32(N),
    pulseFrame: u8(N),
    airPm: i32(NS),
    stoop: i32(NPS),
    styleDmg: i32(N),
    heatPenalty: u8(N),
    clampHeat: u8(N),
    licensed: u8(N),
    heatImmune: u8(N),
    immuneUntil: f64(N),
    armor: u8(N),
    armorExtra: i32(N),
    packRegen: i32(N),
    heatToEnergyPm: i32(N),
    repairMd: i32(N),
    actBonus: i32(N * 3),
    pace: i32(N * 3),
    paceCentre: i32(N),
    planErrWindow: i32(N),
    planErr: i32(N),
    pAct: i32(N),
    pSkill: i32(NK),
    u: i32(NK * ACTIVATION_SLOTS),
    luckyIdx: i32(N),
    nSkills: i32(N),
    skFlags: i32(NK),
    skPhase: i32(NK),
    skSeg: i32(NK),
    skPosLo: i32(NK),
    skPosHi: i32(NK),
    skHeat: f64(NK),
    skEnergy: f64(NK),
    skSpeed: i32(NK),
    skAccel: i32(NK),
    skRefund: i32(NK),
    skCool: i32(NK),
    skDur: i32(NK),
  };
}

function createState(): RaceState {
  return {
    pos: f64(N),
    prevPos: f64(N),
    disp: f64(N),
    vCore: i32(N),
    vOut: i32(N),
    vOutPrev: i32(N),
    hp: f64(N),
    energy: i32(N),
    heat: i32(N),
    dur: i32(N),
    seg: i32(N),
    stall: i32(N),
    flags: new Uint16Array(N),
    replanCause: i32(N),
    pulse: createPulseState(N),
    mode: i32(N),
    modeLevel: i32(N),
    holdLeft: i32(N),
    planLevel: i32(N),
    planStartPos: f64(N),
    planEndPos: f64(N),
    planCount: i32(N),
    freeLeft: i32(N),
    freeSeg: i32(N),
    guardLeft: i32(N),
    skillSpeed: i32(N),
    skillAccel: i32(N),
    activeSkills: i32(N),
    acts: i32(NK),
    activeLeft: i32(NK),
    armed: u8(NK),
    missLogged: u8(NK),
    finishMilli: f64(N),
    b: u8(N),
    boostOn: u8(N),
    isPulseTick: u8(N),
    freeTick: u8(N),
    burstChain: u8(N),
    tickFlags: i32(N),
    boostRow: i32(N),
    key: f64(N),
    ahead: i32(N),
    posFrac: i32(N),
    place: i32(N),
    deadHeat: u8(N),
    timeTicks: i32(N),
    marginMm: f64(N),
    vFinishMms: i32(N),
    gap: f64(N * N),
    phaseTicks: i32(N * 3),
    boostTicks: i32(N * 3),
    pulses: i32(N),
    stallTicks: i32(N),
    energySpent: f64(N),
    energyRegen: f64(N),
    energyRefunded: f64(N),
    energyFromHeat: f64(N),
    energyLift: f64(N),
    overheatTicks: i32(N),
    durabilityLost: f64(N),
    durabilityRepaired: f64(N),
    hpEmptyMm: f64(N),
    draftTicks: i32(N),
    landingLossMms: i32(N),
    jumpsOk: i32(N),
    jumpsFailed: i32(N),
    detours: i32(N),
    alt: i32(N),
    flPhase: i32(N),
    flK: i32(N),
    flCur: i32(N),
    altTarget: i32(N),
    altTimer: i32(N),
    fromBand: i32(N),
    fallCause: i32(N),
    flRes: i32(N),
    flHoldLeft: i32(N),
    holdPu: f64(N),
    holdBilled: i32(N),
    airTicks: i32(N),
    flights: i32(N),
    dives: i32(N),
    grandDives: i32(N),
    diveGainMm: f64(N),
    hpRested: f64(N),
    energyClimb: f64(N),
    energyHold: f64(N),
    noLift: i32(N),
    jumpsCovered: i32(N),
    surge: i32(N),
    pos0: f64(N),
    dirty: u8(N),
    dirtyRun: i32(N),
    escaped: u8(N),
    knocked: u8(N),
    belowCounted: u8(N),
    dirtySince: i32(N),
    flApex: i32(N),
    climbTk: i32(N),
    passesAir: i32(N),
    passesDive: i32(N),
    peakMms: i32(N),
    apexMax: i32(N),
    dirtyTicks: i32(N),
    holdExtra: f64(N),
    overs: i32(N),
    knocks: i32(N),
    falls: i32(N),
    belowPlan: i32(N),
    passSince: i32(N * N),
    passKind: u8(N * N),
    skHeld: u8(N * MAX_SKILLS),
    skHeldTicks: i32(N * MAX_SKILLS),
    heldN: u8(N),
  };
}

type Fillable = { fill(value: number): unknown };

function isTypedArray(v: unknown): v is Fillable {
  return ArrayBuffer.isView(v) && !(v instanceof DataView);
}

function zeroAll(obj: Readonly<Record<string, unknown>>): void {
  for (const v of Object.values(obj)) if (isTypedArray(v)) v.fill(0);
}

/** A fresh arena for up to 8 runners and 24 segments (docs/race-engine.md 22, 23). */
export function createRaceArena(): RaceArena {
  const arena: RaceArena = {
    tables: createTables(),
    state: createState(),
    U: f64(N * 32),
    n: 0,
    reset(n: number, G: CourseGeometry): RaceArena {
      if (n < 1 || n > MAX_LANES) throw new Error(`arena holds 1..${MAX_LANES} runners, got ${n}`);
      if (G.S > MAX_SEGMENTS) throw new Error(`arena holds ${MAX_SEGMENTS} segments, got ${G.S}`);
      zeroAll(arena.tables);
      zeroAll(arena.state);
      zeroAll(arena.state.pulse);
      arena.tables.luckyIdx.fill(-1);
      arena.U.fill(0);
      arena.n = n;
      return arena;
    },
  };
  return arena;
}

// --- validator (1.4) -------------------------------------------------------------------------------

function checkInt(what: string, v: number, lo: number, hi: number): void {
  if (!Number.isInteger(v) || v < lo || v > hi)
    throw new Error(`simulateRace: ${what} = ${v} outside the integers ${lo}..${hi}`);
}

/**
 * Preconditions of `simulateRace` (docs/race-engine.md 1.4). Throws: a violation is a programming
 * error, never a game branch. Also checks that the pre-drawn block holds every skill slot.
 */
export function validateRace(
  ruleset: Ruleset,
  entries: readonly RaceEntry[],
  course: Course,
  seed: string,
): void {
  const R = ruleset.race;
  if (typeof seed !== "string" || seed.length === 0)
    throw new Error("simulateRace: the seed is an empty string");
  const n = entries.length;
  checkInt("runner count", n, 1, Math.min(R.maxRunners, MAX_LANES));
  const lanes = new Set<number>();
  const ids = new Set<string>();
  const maxSkills = Math.min(R.maxSkills, MAX_SKILLS);
  for (const e of entries) {
    const who = `entry ${e.runnerId}`;
    checkInt(`${who} laneIndex`, e.laneIndex, 0, n - 1);
    if (lanes.has(e.laneIndex)) throw new Error(`simulateRace: lane ${e.laneIndex} is repeated`);
    lanes.add(e.laneIndex);
    if (ids.has(e.runnerId)) throw new Error(`simulateRace: runnerId ${e.runnerId} is repeated`);
    ids.add(e.runnerId);
    if (!RACE_RULES.includes(e.rule)) throw new Error(`simulateRace: ${who} has rule ${e.rule}`);
    if (!STYLES.includes(e.style)) throw new Error(`simulateRace: ${who} has style ${e.style}`);
    if (!POSITIONS.includes(e.position))
      throw new Error(`simulateRace: ${who} has position ${e.position}`);
    for (const [k, v] of Object.entries(e.stats)) checkInt(`${who} ${k}`, v, 1, R.maxEffectiveStat);
    checkInt(`${who} powerToWeight`, e.powerToWeight, 500, 1600);
    checkInt(`${who} energy`, e.energy, 20, 200);
    checkInt(`${who} dissipation`, e.dissipation, 20, 120);
    checkInt(`${who} durabilityMax`, e.durabilityMax, 20, 260);
    checkInt(`${who} durabilityStart`, e.durabilityStart, 0, e.durabilityMax);
    checkInt(`${who} skill count`, e.skills.length, 0, maxSkills);
    for (let j = 1; j < e.skills.length; j++) {
      const prev = e.skills[j - 1];
      const cur = e.skills[j];
      if (prev && cur && !(prev.id < cur.id))
        throw new Error(`simulateRace: ${who} skills are not unique and id-sorted`);
    }
    if (SKILL_SLOT_BASE + ACTIVATION_SLOTS * e.skills.length > R.rngBlock)
      throw new Error(`simulateRace: rngBlock ${R.rngBlock} cannot hold ${who}'s skill slots`);
  }
  checkInt("segment count", course.segments.length, 1, MAX_SEGMENTS);
  let meters = 0;
  for (const s of course.segments) meters += s.length;
  if (meters > R.maxCourseMeters)
    throw new Error(`simulateRace: course ${course.id} is ${meters} m (max ${R.maxCourseMeters})`);
}

// --- pre-drawn block (17.1, 16 #15) ----------------------------------------------------------------

/** What the draws need from the RNG: `Rng.nextU32` of `@falconess/rng`. */
export type U32Source = { nextU32(stream: "race" | "quirks"): number };

/**
 * P1 and P2 of section 18: `n × R.rngBlock` u32 from stream `race`, lane by lane and slot by slot,
 * then one u32 from stream `quirks` per `random-skill-guaranteed` holder in lane order (drawn even
 * with no active skill). The lucky index counts every active, disabled ones included. Nothing else
 * ever draws: the tick loop has zero draws.
 */
export function drawRaceBlock(
  ruleset: Ruleset,
  E: readonly RaceEntry[],
  rng: U32Source,
  A: RaceArena,
): void {
  const block = ruleset.race.rngBlock;
  const n = E.length;
  if (A.U.length < n * block) A.U = new Float64Array(MAX_LANES * block);
  for (let i = 0; i < n; i++)
    for (let slot = 0; slot < block; slot++) A.U[i * block + slot] = rng.nextU32("race");
  for (let i = 0; i < n; i++) {
    const e = E[i];
    A.tables.luckyIdx[i] = -1;
    if (e === undefined || !e.traits.randomSkillGuaranteed) continue;
    const x = rng.nextU32("quirks");
    const nActive = e.skills.length;
    if (nActive > 0) A.tables.luckyIdx[i] = floorDiv(x * nActive, U32_RANGE);
  }
}

// --- per-race tables (3.3) -------------------------------------------------------------------------

const PHASE_CODE: Readonly<Record<RacePhase, number>> = {
  start: 0,
  middle: 1,
  final: 2,
  any: SK_PHASE_ANY,
};

function segCode(type: SegmentType): number {
  return SEGMENT_TYPES.indexOf(type);
}

/**
 * Every table of docs/race-engine.md 3.3 for every runner, from its entry, the geometry, the ruleset
 * and the pre-drawn block. Style terms (9.8) and rule terms (13.1) are folded in here, so the loop
 * reads one scalar per term and never branches on a manufacturer name. Last come the tables that
 * read the others: the jump reserve (14.4), `exhaust0`, `capFinal` and `groundLevel` (9.3).
 */
export function buildTables(
  ruleset: Ruleset,
  E: readonly RaceEntry[],
  G: CourseGeometry,
  A: RaceArena,
): void {
  const R = ruleset.race;
  const F = flightOf(ruleset);
  const T = A.tables;
  const { vBase: VBASE, kBoost: KBOOST, posPerMm, velPerMms } = engineUnits(R);
  const block = R.rngBlock;
  const W0 = R.paceHalfWidth;
  const pulseCostMe = floorDiv(R.kE * R.pulseCostMult, 1000);

  for (let i = 0; i < E.length; i++) {
    const e = E[i];
    if (e === undefined) continue;
    const tr = e.traits;
    const terms = compileRule(R, e.rule);
    const st = styleCode(e.style);
    const pc = positionCode(e.position);
    const rc = ruleCode(e.rule);
    const { agility, stamina, technique, courage, intelligence } = e.stats;
    T.style[i] = st;
    T.position[i] = pc;
    T.rule[i] = rc;

    // Intelligence: pace judgement per phase and plan perception (10), from slots 0..3
    const c = paceCentrePm(R, intelligence);
    T.paceCentre[i] = c;
    for (let ph = 0; ph < 3; ph++)
      T.pace[i * 3 + ph] = uRange(A.U[i * block + ph] ?? 0, c - W0, c + W0);
    const We = planErrWindowPm(R, intelligence);
    T.planErrWindow[i] = We;
    T.planErr[i] = uRange(A.U[i * block + 3] ?? 0, -We, We);

    // PW variants (broken: PW × durabilityZeroPowerMult, then × brokenSpeedPm after the weights,
    // 8.4), cruise, acceleration, exhaustion speed, thrust
    T.pwBroken[i] = powerVariant(R, e.powerToWeight, 1);
    const vA = agilityCruiseVu(R, VBASE, agility);
    T.vA[i] = vA;
    for (let s = 0; s < G.S; s++) T.f[is(i, s)] = segmentFactor(R, G, s, agility, tr, terms);
    if (F !== null && F.groundGripPm !== 1000 && st === STYLE_GROUND)
      for (let s = 0; s < G.S; s++) {
        // v3 draft R10: ground wings pay groundGripPm of the curves, water and climb penalty
        const type = G.segType[s] ?? 0;
        const f = T.f[is(i, s)] ?? 1000;
        if (f < 1000 && (type === SEG_CURVES || type === SEG_WATER || type === SEG_CLIMB))
          T.f[is(i, s)] = 1000 - floorDiv((1000 - f) * F.groundGripPm, 1000);
      }
    const sp = R.stylePace[e.style];
    for (let b = 0; b < 2; b++) {
      const pw = powerVariant(R, e.powerToWeight, b);
      const pwc = variantPower(R, R.pwCruiseWeight, pw, b);
      const pwb = variantPower(R, R.pwBoostWeight, pw, b);
      T.pwc[ib(i, b)] = pwc;
      T.pwb[ib(i, b)] = pwb;
      for (let s = 0; s < G.S; s++) {
        const f = T.f[is(i, s)] ?? 1000;
        for (let ph = 0; ph < 3; ph++) {
          const pace = T.pace[i * 3 + ph] ?? 0;
          T.vC[ibps(i, b, ph, s)] = cruiseVu(vA, pwc, f, sp[ph] ?? 1000, pace);
          T.vMin[ibps(i, b, ph, s)] = exhaustSpeedVu(R, VBASE, pwc, f, pace);
          // v3 draft R5: the air cruise sits at the centre of her pace window (no draw)
          // L1b (feel round 1): `airPacePm` ‰ of her pace draw of the phase, like the ground
          if (F !== null)
            T.vCAir[ibps(i, b, ph, s)] = cruiseVu(
              vA,
              pwc,
              f,
              sp[ph] ?? 1000,
              c + floorDiv((pace - c) * F.airPacePm, 1000),
            );
        }
        const a = accelVu(R, technique, pwc, f, terms);
        T.acc[ibs(i, b, s)] = a;
        T.accStart[ibs(i, b, s)] =
          st === STYLE_GLIDE ? floorDiv(a * R.style.glideStartAccelPm, 1000) : a;
      }
      const B = boostThrustVu(KBOOST, pwb);
      const Bp = pulseThrustVu(R, KBOOST, pwb);
      T.B[ib(i, b)] = B;
      T.Bp[ib(i, b)] = Bp;
      T.Bpc[ib(i, b)] = chainThrustVu(Bp, tr.pulseChainBonusPm);
    }

    // hp (4, 6)
    T.hpMax[i] = hpMaxMicro(R, G.lengthMm);
    T.stamDiv[i] = staminaDivisor(R, stamina);
    T.fat[i] = fatiguePm(R, courage);
    const [dkN, dkF] = drainCoefficients(R, stamina, courage, terms);
    T.dK[i * 4] = dkN;
    T.dK[i * 4 + DK_LEAD] = floorDiv(dkN * R.glideLeadDrainPm, 1000);
    T.dK[i * 4 + DK_FINAL] = dkF;
    T.dK[i * 4 + DK_FINAL + DK_LEAD] = floorDiv(dkF * R.glideLeadDrainPm, 1000);

    // heat and durability (8)
    const tol = heatTolerancePm(R, courage);
    const D = e.dissipation * 1000;
    const heatCap = heatCapMh(e.dissipation, tol);
    T.tol[i] = tol;
    T.D[i] = D;
    T.heatCap[i] = heatCap;
    T.capLim[i] = terms.capLimRaw ? D : heatCap;
    T.coolTick[i] = coolTick(R, e.dissipation, terms);
    T.dmgTick[i] = overheatDamage(R, e.style, terms);
    T.regenTick[i] = terms.regenMe + tr.regenMe;
    T.Emax[i] = e.energy * 1000;
    T.durMax[i] = e.durabilityMax * 1000;
    T.styleDmg[i] = styleDamagePm(R, e.style);
    T.heatPenalty[i] = terms.heatPenalty ? 1 : 0;
    T.clampHeat[i] = terms.clampHeatAtD ? 1 : 0;
    T.licensed[i] =
      terms.licence === "always" || (terms.licence === "immunity" && tr.heatImmune) ? 1 : 0;
    T.heatImmune[i] = tr.heatImmune ? 1 : 0;
    T.immuneUntil[i] =
      tr.heatImmuneUntilMm === null ? IMMUNE_WHOLE_RACE : tr.heatImmuneUntilMm * posPerMm;
    T.armor[i] = tr.obstacleArmor ? 1 : 0;
    T.armorExtra[i] = tr.obstacleArmorExtraTicks;
    T.packRegen[i] = tr.packRegenMultPm;
    T.heatToEnergyPm[i] = tr.heatToEnergyPm;
    T.repairMd[i] = terms.repairMd;

    // jumps, landing, detour (14)
    const liftF = liftFactorPm(technique, tr.liftBonusPm);
    T.liftF[i] = liftF;
    T.landPm[i] = landingKeepPm(R, technique, terms);
    T.detour[i] = st === STYLE_GROUND ? groundDetourPm(R, terms) : 1000;
    for (let s = 0; s < G.S; s++)
      T.need[is(i, s)] = G.segType[s] === SEG_JUMP ? jumpNeedMe(G.liftReq[s] ?? 0, liftF) : 0;
    let kickAt = G.reserveAt;
    if (st !== STYLE_GROUND)
      for (let s = 0; s < G.S; s++)
        if (G.segType[s] === SEG_JUMP && (G.segEnd[s] ?? 0) > G.reserveAt) {
          kickAt = Math.min(G.reserveAt, G.segStart[s] ?? 0);
          break;
        }
    T.kickAt[i] = Math.max(0, kickAt); // ADR-0003 D53 (reserveAt and segStart are already ≥ 0)
    T.planPoint[i] = pc === POS_STALK ? G.hoverAttack : G.finalStart; // position (ADR-0008)

    // style and rule thrust terms (9.8, 13.1) and the plan's thrust quantities (3.3)
    const pulseFrame = terms.pulses && !tr.noPulse;
    T.pulseFrame[i] = pulseFrame ? 1 : 0;
    for (let s = 0; s < G.S; s++) {
      const type = G.segType[s] ?? 0;
      T.airPm[is(i, s)] = pulseFrame ? (terms.pulseAirPm[type] ?? 1000) : 1000;
      for (let ph = 0; ph < 3; ph++)
        T.stoop[ips(i, ph, s)] =
          st === STYLE_DIVE && (type === SEG_DESCENT || ph === PH_FINAL)
            ? R.style.diveStoopPm
            : 1000;
    }
    const stoopPlan = st === STYLE_DIVE ? R.style.diveStoopPm : 1000;
    T.costOn[i] = pulseFrame ? pulseCostMe : R.kE;
    for (let b = 0; b < 2; b++) {
      const base = pulseFrame
        ? floorDiv((T.Bp[ib(i, b)] ?? 0) * terms.pulseBasePm, 1000)
        : (T.B[ib(i, b)] ?? 0);
      const Bon = floorDiv(base * stoopPlan, 1000);
      const unit = pulseFrame ? Bon * R.pulseTicks : Bon;
      T.Bon[ib(i, b)] = Bon;
      T.unit[ib(i, b)] = unit;
      T.sMax[ib(i, b)] = pulseFrame ? floorDiv(unit, R.pulseTicks + R.pulseCooldownTicks) : Bon;
    }

    // v3 draft R2-R3: the flight plan, before the jump reserve (a covered jump needs no lift)
    if (F !== null)
      planFlights(F, G, T, i, posPerMm, liftF, courage, velPerMms, {
        u28: A.U[i * block + 28] ?? 0,
        u30: A.U[i * block + 30] ?? 0,
        technique,
      });

    // reserves and budgets that read the tables above (14.4, 9.3)
    jumpReserve(G, T, i);
    for (let b = 0; b < 2; b++) budgetTables(R, G, T, i, b, VBASE, pulseCostMe);

    // skills (15): activation, per-phase bonus, pre-drawn u, frozen columns
    const pAct = activationPm(R, intelligence);
    T.pAct[i] = pAct;
    const ab = tr.activationBonusPm;
    T.actBonus[i * 3] = ab.start + ab.any + terms.activationBonusPm;
    T.actBonus[i * 3 + 1] = ab.middle + ab.any + terms.activationBonusPm;
    T.actBonus[i * 3 + 2] = ab.final + ab.any + terms.activationBonusPm;
    T.nSkills[i] = e.skills.length;
    e.skills.forEach((sk, j) => {
      const k = ik(i, j);
      const trg = sk.trigger;
      const ef = sk.effect;
      T.pSkill[k] = sk.disabled ? 0 : floorDiv(pAct * sk.activationBasePm, 1000);
      for (let a = 0; a < ACTIVATION_SLOTS; a++)
        T.u[ikk(i, j, a)] = uPm(A.U[i * block + SKILL_SLOT_BASE + ACTIVATION_SLOTS * j + a] ?? 0);
      T.skFlags[k] =
        (trg.once ? SK_ONCE : 0) |
        (sk.disabled ? SK_DISABLED : 0) |
        (ef.durabilityGuard ? SK_GUARD : 0) |
        (trg.segment !== null ? SK_HAS_SEGMENT : 0) |
        (trg.posLoPm !== null ? SK_HAS_POSITION : 0) |
        (trg.heatAboveMilli !== null ? SK_HAS_HEAT : 0) |
        (trg.energyBelowMilli !== null ? SK_HAS_ENERGY : 0);
      T.skPhase[k] = PHASE_CODE[trg.phase];
      T.skSeg[k] = trg.segment !== null ? segCode(trg.segment) : -1;
      T.skPosLo[k] = trg.posLoPm ?? 0;
      T.skPosHi[k] = trg.posHiPm ?? 0;
      T.skHeat[k] = trg.heatAboveMilli ?? 0;
      T.skEnergy[k] = trg.energyBelowMilli ?? 0;
      T.skSpeed[k] = ef.speedMms * velPerMms;
      T.skAccel[k] = ef.accelMms2;
      T.skRefund[k] = ef.energyRefundMilli;
      T.skCool[k] = ef.heatCoolMilli;
      T.skDur[k] = ef.durationTicks;
    });
  }
}

// --- reserves and budgets (14.4, 9.3) ----------------------------------------------------------------

/**
 * Distance `d` (pu) of segment s in the runner's route coordinates (11.3 `route`): a ground runner
 * detours a jump segment at `detour` ‰ of its length; everything else is the distance itself.
 */
export function routeDist(G: CourseGeometry, T: RaceTables, i: number, s: number, d: number) {
  return T.style[i] === STYLE_GROUND && G.segType[s] === SEG_JUMP
    ? floorDiv(d * (T.detour[i] ?? 1000), 1000)
    : d;
}

/**
 * Whether the runner can thrust on segment s (11.3 `thrustable`): never on a jump segment unless
 * it is a ground runner (airborne, or on foot after a crash).
 */
export function thrustable(G: CourseGeometry, T: RaceTables, i: number, s: number): boolean {
  return !(G.segType[s] === SEG_JUMP && T.style[i] !== STYLE_GROUND);
}

/**
 * Jump reserve of 14.4, a backward pass over the jumps (non-ground runners only):
 * `R_j = need_j > Emax ? R_{j+1} : max(need_j, liftReq_j × 1000 + R_{j+1})` (a jump the tank can
 * never make is skipped: it fails anyway and a failure spends no lift energy), and `jr[s]` is the
 * `R_j` of the first jump whose segment index is above s (0 if none). `jrStart` is the `R` of the
 * course's first jump: what the tank must keep for the jumps at the gun.
 */
function jumpReserve(G: CourseGeometry, T: RaceTables, i: number): void {
  if (T.style[i] === STYLE_GROUND) return; // zero-filled by reset
  const Emax = T.Emax[i] ?? 0;
  let ahead = 0;
  for (let s = G.S - 1; s >= 0; s--) {
    T.jr[is(i, s)] = ahead;
    if (G.segType[s] !== SEG_JUMP || T.jumpCovered[is(i, s)] === 1) continue;
    const need = T.need[is(i, s)] ?? 0;
    if (need <= Emax) ahead = Math.max(need, (G.liftReq[s] ?? 0) * 1000 + ahead);
  }
  T.jrStart[i] = ahead;
}

/** hp drained per tick at constant speed v (section 6): `fl(r × r × dK, 10^6)`, `r = fl(v × 1000, VBASE)`. */
function drainAt(v: number, vBase: number, dK: number): number {
  const r = floorDiv(v * 1000, vBase);
  return floorDiv(r * r * dK, 1_000_000);
}

/**
 * 9.3 for PW variant b: `exhaust0` (where hpMax runs out at cruise from the gun, walking the
 * pieces of the course split at segment boundaries, `startEnd` and `finalStart`), then
 * `capFinal` (energy the final window `[planPoint, min(kickAt, exhaust0))` can absorb over its
 * thrust-capable ticks: heat-aware from cold for continuous frames, max cadence for pulse frames)
 * and, in the pack position, `groundLevel`: the level that spends `groundPreShare` of the tank,
 * less the jump reserve at the gun, evenly over the thrust-capable ticks before the final
 * (ADR-0008; for ground wings, which never jump, the reserve is 0 and every tick can thrust).
 */
function budgetTables(
  R: RaceConstants,
  G: CourseGeometry,
  T: RaceTables,
  i: number,
  b: number,
  vBase: number,
  pulseCostMe: number,
): void {
  const ground = T.style[i] === STYLE_GROUND;
  const hpMax = T.hpMax[i] ?? 0;
  const dkN = T.dK[i * 4] ?? 0;
  const dkF = T.dK[i * 4 + DK_FINAL] ?? 0;

  // exhaust0
  let exhaust = G.L;
  let h = 0;
  walk: for (let s = 0; s < G.S; s++) {
    const s0 = G.segStart[s] ?? 0;
    const s1 = G.segEnd[s] ?? 0;
    for (let ph = 0; ph < 3; ph++) {
      const p0 = ph === 0 ? 0 : ph === 1 ? G.startEnd : G.finalStart;
      const p1 = ph === 0 ? G.startEnd : ph === 1 ? G.finalStart : G.L;
      const a = Math.max(s0, p0);
      const z = Math.min(s1, p1);
      if (z <= a) continue;
      const v = T.vC[ibps(i, b, ph, s)] ?? 1;
      const dr = drainAt(v, vBase, ph === PH_FINAL ? dkF : dkN);
      const tk = ceilDiv(routeDist(G, T, i, s, z - a), v);
      if (h + tk * dr > hpMax) {
        const k = floorDiv(hpMax - h, Math.max(1, dr));
        const adv =
          ground && G.segType[s] === SEG_JUMP ? floorDiv(k * v * 1000, T.detour[i] ?? 1000) : k * v;
        exhaust = Math.min(z, a + adv);
        break walk;
      }
      h += tk * dr;
    }
  }
  T.exhaust0[ib(i, b)] = exhaust;

  // capFinal over the thrust-capable ticks of the final window
  const x0 = T.planPoint[i] ?? 0;
  const x1 = Math.min(T.kickAt[i] ?? 0, exhaust);
  let cap = 0;
  if (x1 > x0) {
    let fin = 0;
    for (let s = 0; s < G.S; s++) {
      if (!thrustable(G, T, i, s)) continue;
      const a = Math.max(x0, G.segStart[s] ?? 0);
      const z = Math.min(x1, G.segEnd[s] ?? 0);
      if (z <= a) continue;
      fin += ceilDiv(routeDist(G, T, i, s, z - a), T.vC[ibps(i, b, PH_FINAL, s)] ?? 1);
    }
    if (T.pulseFrame[i] === 1)
      cap = floorDiv(fin * R.pulseTicks, R.pulseTicks + R.pulseCooldownTicks) * pulseCostMe;
    else {
      const cool = T.coolTick[i] ?? 1;
      const heatOn = floorDiv((T.capLim[i] ?? 0) + fin * cool, R.kH + cool);
      cap = Math.min(fin, heatOn) * R.kE;
    }
  }
  T.capFinal[ib(i, b)] = cap;

  // groundLevel over the thrust-capable pieces of [0, finalStart) (the pack position, ADR-0008)
  if (T.position[i] !== POS_PACK) return;
  let pre = 0;
  for (let s = 0; s < G.S; s++) {
    if (!thrustable(G, T, i, s)) continue; // a flyer's jump: no thrust, no accrual (9.5)
    const s0 = G.segStart[s] ?? 0;
    const s1 = G.segEnd[s] ?? 0;
    for (let ph = 0; ph < 2; ph++) {
      const a = Math.max(s0, ph === 0 ? 0 : G.startEnd);
      const z = Math.min(s1, ph === 0 ? G.startEnd : G.finalStart);
      if (z <= a) continue;
      pre += ceilDiv(routeDist(G, T, i, s, z - a), T.vC[ibps(i, b, ph, s)] ?? 1);
    }
  }
  const share = Math.max(
    0,
    floorDiv((T.Emax[i] ?? 0) * R.style.groundPreShare, 1000) - (T.jrStart[i] ?? 0),
  );
  T.groundLevel[ib(i, b)] = Math.min(
    T.sMax[ib(i, b)] ?? 0,
    floorDiv((T.Bon[ib(i, b)] ?? 0) * share, Math.max(1, pre) * (T.costOn[i] ?? 1)),
  );
}

// --- initial state (1.3) ---------------------------------------------------------------------------

/**
 * The state before tick 0 (docs/race-engine.md 1.3): at the gun, `vStart` with the start dash, full
 * hp and energy, cold, durability from the entry (0 = broken from the start), segment 0, every
 * timer 0. The segment-0 pre-step (water hit, pending jump, detour event) is the engine's (P4).
 */
export function initState(ruleset: Ruleset, E: readonly RaceEntry[], A: RaceArena): void {
  const R = ruleset.race;
  const T = A.tables;
  const S = A.state;
  const { vStart } = engineUnits(R);
  for (let i = 0; i < E.length; i++) {
    const e = E[i];
    if (e === undefined) continue;
    const dur = e.durabilityStart * 1000;
    S.vCore[i] = vStart;
    S.hp[i] = T.hpMax[i] ?? 0;
    S.energy[i] = T.Emax[i] ?? 0;
    S.dur[i] = dur;
    S.flags[i] = F_DASH | (dur === 0 ? F_BROKEN : 0);
    S.b[i] = dur === 0 ? 1 : 0;
    S.mode[i] = MODE_OFF;
    S.marginMm[i] = -1;
    S.hpEmptyMm[i] = -1;
    S.flRes[i] = T.flRes0[i] ?? 0;
    initPulseLane(R, S.pulse, i, e.traits);
    for (let j = 0; j < MAX_SKILLS; j++) S.armed[ik(i, j)] = 1;
  }
}
