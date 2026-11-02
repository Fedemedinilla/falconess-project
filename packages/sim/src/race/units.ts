import {
  BOOST_MODES,
  type BoostMode,
  POSITIONS,
  type Position,
  RACE_RULES,
  type RaceRule,
  SEGMENT_TYPES,
  type SegmentType,
  STYLES,
  type Style,
} from "@falconess/schema";
import type { RaceConstants } from "../rulesets/index.js";
import { RULESET_V1 } from "../rulesets/index.js";

/**
 * Engine units of docs/race-engine.md 1.1. Position in pu = 1/225 mm, speed in vu = 1/15 mm/s, so
 * one tick at speed v (vu) moves exactly v pu and an acceleration of a mm/s² changes the speed by
 * exactly a vu per tick. Both scales derive from the tick rate, never hard-coded: vu per mm/s =
 * tps, pu per mm = tps × tps. hp in µhp; energy, heat and durability in milli-units.
 */
export type EngineUnits = {
  /** Ticks per second. */
  readonly tps: number;
  /** vu per mm/s (= tps). */
  readonly velPerMms: number;
  /** pu per mm (= tps × tps). */
  readonly posPerMm: number;
  /** `R.vBase` in vu. */
  readonly vBase: number;
  /** `R.kBoost` in vu. */
  readonly kBoost: number;
  /** `R.vStart` in vu. */
  readonly vStart: number;
};

export function engineUnits(R: RaceConstants): EngineUnits {
  const tps = R.ticksPerSecond;
  return {
    tps,
    velPerMms: tps,
    posPerMm: tps * tps,
    vBase: R.vBase * tps,
    kBoost: R.kBoost * tps,
    vStart: R.vStart * tps,
  };
}

/** v1 scales (15 ticks per second; `RaceLog.tickHz` is the literal 15). */
export const VEL_PER_MMS = engineUnits(RULESET_V1.race).velPerMms;
export const POS_PER_MM = engineUnits(RULESET_V1.race).posPerMm;
/** µhp per hp. */
export const MICRO_HP = 1_000_000;

/** `max(0, x − d)` (0.1). */
export function sub0(x: number, d: number): number {
  return Math.max(0, x - d);
}

/** `min(cap, x + d)` (0.1). */
export function addCap(x: number, d: number, cap: number): number {
  return Math.min(cap, x + d);
}

// --- phases (0.1) -------------------------------------------------------------------------------
export const PH_START = 0;
export const PH_MIDDLE = 1;
export const PH_FINAL = 2;
export const PHASE_NAMES = ["start", "middle", "final"] as const;

// --- segment types, `SEGMENT_TYPES` order (0.1) ---------------------------------------------------
export const SEG_FLAT = 0;
export const SEG_CLIMB = 1;
export const SEG_DESCENT = 2;
export const SEG_JUMP = 3;
export const SEG_WATER = 4;
export const SEG_CANYON = 5;
export const SEG_CURVES = 6;
export const SEGMENT_TYPE_COUNT = 7;

export function segmentTypeCode(type: SegmentType): number {
  return SEGMENT_TYPES.indexOf(type);
}

// --- styles, `STYLES` order ------------------------------------------------------------------------
export const STYLE_DIVE = 0;
export const STYLE_HOVER = 1;
export const STYLE_GLIDE = 2;
export const STYLE_GROUND = 3;

export function styleCode(style: Style): number {
  return STYLES.indexOf(style);
}

// --- race positions, `POSITIONS` order (ADR-0008: they decide how she spends energy, 9.4) -----
export const POS_LEAD = 0;
export const POS_PACK = 1;
export const POS_STALK = 2;
export const POS_CLOSER = 3;

export function positionCode(position: Position): number {
  return POSITIONS.indexOf(position);
}

// --- rules, `RACE_RULES` order (3.4: RULE_NONE = 5) ------------------------------------------------
export const RULE_MASS_THRUST = 0;
export const RULE_REGEN = 1;
export const RULE_PULSE = 2;
export const RULE_TELEMETRY = 3;
export const RULE_REPAIRABLE = 4;
export const RULE_NONE = 5;

export function ruleCode(rule: RaceRule): number {
  return RACE_RULES.indexOf(rule);
}

// --- controller modes, `BOOST_MODES` order (9.4; precedence rows 1-7, OFF last in precedence) -----
export const MODE_OFF = 0;
export const MODE_KICK = 1;
export const MODE_PLAN = 2;
export const MODE_HOLD = 3;
export const MODE_PREHEAT = 4;
export const MODE_SURPLUS = 5;
export const MODE_REGEN = 6;
export const MODE_DIVE_DESCENT = 7;
export const MODE_HOVER_CATCHUP = 8;
export const MODE_GLIDE_CHASE = 9;
export const MODE_GROUND_CONSTANT = 10;

export function modeCode(mode: BoostMode): number {
  return BOOST_MODES.indexOf(mode);
}

export function modeName(code: number): BoostMode {
  const m = BOOST_MODES[code];
  if (m === undefined) throw new Error(`unknown mode code ${code}`);
  return m;
}
