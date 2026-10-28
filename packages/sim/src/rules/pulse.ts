import { floorDiv } from "@falconess/rng";
import type { RaceTraits } from "@falconess/schema";
import { RULE_PULSE, SEGMENT_TYPE_COUNT } from "../race/units.js";
import type { RaceConstants } from "../rulesets/index.js";
import { neutralTerms, type RuleSpec } from "./rule-spec.js";

/**
 * Kōryū (docs/race-engine.md 12): boost comes in bursts of `pulseTicks` (12) at ×`pulseBoostMult`
 * thrust and ×`pulseCostMult` cost, then `pulseCooldownTicks` (30) of cooldown. Rule term (13.1):
 * intake air, burst thrust ×`pulseAirPm[segment type]` × `pulseBiomePm[biome]` (desert 1.15,
 * descent ×1.2, water ×0.6); the plan's `Bon` carries the biome factor.
 */
export const PULSE: RuleSpec = {
  rule: "pulse",
  code: RULE_PULSE,
  compile: (R, biome) => {
    const biomePm = R.pulseBiomePm[biome];
    return {
      ...neutralTerms(RULE_PULSE),
      pulses: true,
      pulseAirPm: R.pulseAirPm.map((pm) => floorDiv(pm * biomePm, 1000)),
      pulseBiomePm: biomePm,
    };
  },
};

/**
 * Per-lane pulse state (section 1.2), struct of arrays sized for the largest field. The engine's
 * race state holds these arrays; the continuous controller (9.5, 9.6) shares `freeMask` and `acc`.
 */
export type PulseState = {
  /** Burst ticks still to run after the current one. */
  readonly pulseLeft: Int32Array;
  /** Cooldown ticks left. */
  readonly pulseCd: Int32Array;
  /** First tick on which a pulse continues the chain. */
  readonly readyAt: Int32Array;
  /** Consecutive pulses (a pulse fired exactly at `readyAt` continues the chain). */
  readonly chain: Int32Array;
  /** Cooldown the running (or last) burst starts when it ends. */
  readonly cdFire: Int32Array;
  /** 1 while the running burst is free (`free-first-boost`). */
  readonly burstFree: Uint8Array;
  /** 1 while the running burst uses the chain thrust `Bpc`. */
  readonly burstChain: Uint8Array;
  /** `free-first-boost` bits still unused, bit k = `SEGMENT_TYPES[k]` (shared with 9.6). */
  readonly freeMask: Int32Array;
  /** Level accumulator of 9.5, vu (shared with the controller). */
  readonly acc: Float64Array;
  /** Per lane: `traits.pulseChainIndex` (0 = none). Fixed for the race. */
  readonly chainIndex: Int32Array;
  /**
   * Per lane × segment type (`lane × 7 + type`): the cooldown a pulse fired on that segment type
   * starts, `min(R.pulseCooldownTicks, traits.pulseCooldown[type] or R.pulseCooldownTicks)`.
   */
  readonly cdBySeg: Int32Array;
};

export function createPulseState(lanes: number): PulseState {
  return {
    pulseLeft: new Int32Array(lanes),
    pulseCd: new Int32Array(lanes),
    readyAt: new Int32Array(lanes),
    chain: new Int32Array(lanes),
    cdFire: new Int32Array(lanes),
    burstFree: new Uint8Array(lanes),
    burstChain: new Uint8Array(lanes),
    freeMask: new Int32Array(lanes),
    acc: new Float64Array(lanes),
    chainIndex: new Int32Array(lanes),
    cdBySeg: new Int32Array(lanes * SEGMENT_TYPE_COUNT),
  };
}

/** Initial pulse state of one lane (1.3) and its fixed per-race parameters from the traits. */
export function initPulseLane(
  R: RaceConstants,
  st: PulseState,
  i: number,
  traits: RaceTraits,
): void {
  st.pulseLeft[i] = 0;
  st.pulseCd[i] = 0;
  st.readyAt[i] = 0;
  st.chain[i] = 0;
  st.cdFire[i] = R.pulseCooldownTicks;
  st.burstFree[i] = 0;
  st.burstChain[i] = 0;
  st.freeMask[i] = traits.freeFirstBoostMask;
  st.acc[i] = 0;
  st.chainIndex[i] = traits.pulseChainIndex;
  for (let k = 0; k < SEGMENT_TYPE_COUNT; k++) {
    const trait = traits.pulseCooldown[k] ?? 0;
    st.cdBySeg[i * SEGMENT_TYPE_COUNT + k] = Math.min(
      R.pulseCooldownTicks,
      trait > 0 ? trait : R.pulseCooldownTicks,
    );
  }
}

/** What the controller (9.3, 9.5) decided for this tick; reused, never allocated per tick. */
export type PulseInput = {
  /** Current tick. */
  t: number;
  /** The selected mode wants boost this tick (9.4, 9.5). */
  want: boolean;
  /** `canThrust` and the pulse gates of 9.3 (energy for the whole burst, heat or licence). */
  gatesOk: boolean;
  /** `!exhausted && !airborne && !(jump segment && style ≠ ground)`; false ends a running burst. */
  canThrust: boolean;
  /** Mode is PLAN or GROUND_CONSTANT: a fire spends one accumulator unit. */
  levelMode: boolean;
  /** Segment type the runner is on (`SEGMENT_TYPES` index). */
  segType: number;
  /** `Bp[b]` and `Bpc[b]` (vu) of the current PW table, before air and stoop (section 5). */
  bp: number;
  bpc: number;
  /** `unit[b]` of the accumulator (vu). */
  unit: number;
};

/** The pulse part of the tick's decision (fields of `decide`, 9.6). */
export type PulseOutput = {
  boostOn: boolean;
  isPulseTick: boolean;
  /** This burst tick costs no energy. */
  freeTick: boolean;
  /** This burst uses `Bpc` (for the speed step's `raw`). */
  burstChain: boolean;
  /** `Bp` or `Bpc` (vu); the speed step multiplies by `airPm` and the stoop (section 5). */
  thrust: number;
  /** A new pulse fired this tick (event `pulse`; `freeBoost` too when `burstFree`). */
  fired: boolean;
  /** A running burst was aborted this tick because `canThrust` turned false. */
  aborted: boolean;
};

export function createPulseOutput(): PulseOutput {
  return {
    boostOn: false,
    isPulseTick: false,
    freeTick: false,
    burstChain: false,
    thrust: 0,
    fired: false,
    aborted: false,
  };
}

/**
 * The Kōryū state machine of docs/race-engine.md 12 for lane i at step B7 (every non-stalled tick:
 * airborne and hold ticks included, so the cooldown counts down there too). A running burst runs
 * all `pulseTicks` ticks unless `canThrust` turns false; the cooldown is set by the segment type
 * of the fire tick; a pulse fired exactly at `readyAt` continues the chain; every
 * `chainIndex`-th consecutive pulse uses `Bpc`; the first pulse on a `free-first-boost` segment
 * type is free for its whole burst. Writes only lane i of `st` and `out`; draws nothing.
 */
export function pulseStep(
  R: RaceConstants,
  st: PulseState,
  i: number,
  inp: PulseInput,
  out: PulseOutput,
): void {
  out.boostOn = false;
  out.isPulseTick = false;
  out.freeTick = false;
  out.burstChain = false;
  out.thrust = 0;
  out.fired = false;
  out.aborted = false;

  const left = st.pulseLeft[i] ?? 0;
  if (left > 0) {
    // burst in progress
    if (!inp.canThrust) {
      st.pulseLeft[i] = 0;
      st.pulseCd[i] = st.cdFire[i] ?? 0;
      out.aborted = true;
      return;
    }
    burstTick(st, i, inp, out);
    st.pulseLeft[i] = left - 1;
    if (left === 1) st.pulseCd[i] = st.cdFire[i] ?? 0;
    return;
  }

  const cd = st.pulseCd[i] ?? 0;
  if (cd > 0) {
    // cooldown tick
    st.pulseCd[i] = cd - 1;
    if (cd === 1) st.readyAt[i] = inp.t + 1;
    return;
  }

  if (!(inp.want && inp.gatesOk)) return;
  // fire
  const prevChain = st.chain[i] ?? 0;
  const chain = inp.t === st.readyAt[i] && prevChain > 0 ? prevChain + 1 : 1;
  st.chain[i] = chain;
  const chainIndex = st.chainIndex[i] ?? 0;
  st.burstChain[i] = chainIndex > 0 && chain % chainIndex === 0 ? 1 : 0;
  const cdFire = st.cdBySeg[i * SEGMENT_TYPE_COUNT + inp.segType] ?? R.pulseCooldownTicks;
  st.cdFire[i] = cdFire;
  const bit = 1 << inp.segType;
  const mask = st.freeMask[i] ?? 0;
  const free = (mask & bit) !== 0;
  if (free) st.freeMask[i] = mask & ~bit;
  st.burstFree[i] = free ? 1 : 0;
  burstTick(st, i, inp, out);
  st.pulseLeft[i] = R.pulseTicks - 1;
  if (R.pulseTicks === 1) st.pulseCd[i] = cdFire;
  if (inp.levelMode) st.acc[i] = (st.acc[i] ?? 0) - inp.unit;
  out.fired = true;
}

function burstTick(st: PulseState, i: number, inp: PulseInput, out: PulseOutput): void {
  const chained = st.burstChain[i] === 1;
  out.boostOn = true;
  out.isPulseTick = true;
  out.freeTick = st.burstFree[i] === 1;
  out.burstChain = chained;
  out.thrust = chained ? inp.bpc : inp.bp;
}

/**
 * End a running burst outside `pulseStep`: takeoff at jump resolution (14.2) and a failed jump
 * (14.3). The cooldown starts. Returns whether a burst was running.
 */
export function endBurst(st: PulseState, i: number): boolean {
  if ((st.pulseLeft[i] ?? 0) <= 0) return false;
  st.pulseLeft[i] = 0;
  st.pulseCd[i] = st.cdFire[i] ?? 0;
  return true;
}
