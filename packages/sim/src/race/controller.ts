import { ceilDiv, floorDiv } from "@falconess/rng";
import { createPulseOutput, type PulseInput, type PulseOutput, pulseStep } from "../rules/index.js";
import type { RaceConstants } from "../rulesets/index.js";
import { jrNow } from "./flight.js";
import type { CourseGeometry } from "./geometry.js";
import {
  F_AIRBORNE,
  F_EXHAUSTED,
  F_FINISHED,
  F_PLAN_ACTIVE,
  IMMUNE_WHOLE_RACE,
  ib,
  ibps,
  ips,
  is,
  MAX_LANES,
  type RaceState,
  type RaceTables,
} from "./state.js";
import {
  MODE_DIVE_DESCENT,
  MODE_GLIDE_CHASE,
  MODE_GROUND_CONSTANT,
  MODE_HOLD,
  MODE_HOVER_CATCHUP,
  MODE_KICK,
  MODE_OFF,
  MODE_PLAN,
  MODE_PREHEAT,
  MODE_REGEN,
  MODE_SURPLUS,
  PH_FINAL,
  POS_CLOSER,
  POS_LEAD,
  POS_PACK,
  POS_STALK,
  RULE_MASS_THRUST,
  SEG_DESCENT,
  SEG_JUMP,
  STYLE_GROUND,
} from "./units.js";

/**
 * Rank and position controllers of docs/race-engine.md 9 (step B7): the rank snapshot (9.1), the
 * reserves and keeps (9.2), the gates and the overheat licence (9.3), the modes and their
 * precedence with the position table and the position hold (9.4), the integer level accumulator
 * (9.5) and the continuous decision (9.6); pulse frames hand the decision to `pulseStep` (12). The
 * race position picks the row (ADR-0008); the wing style only enters through its physics (a flyer
 * cannot thrust on a jump). A pure function of the runner's own state, its tables and the rank
 * snapshot; never draws randomness and never allocates.
 */

/** Finished runners rank ahead of every unfinished runner, by finish time (9.1). */
export const KEY_FINISHED = 1e15;

/**
 * Step A of every tick, from positions at the end of the previous tick (9.1): competition
 * ranking (equal keys share a rank, so lane order never changes physics), `ahead` = runners
 * strictly in front, `posFrac = fl(ahead × 1000, n − 1)` (0 leader, 1000 last; 0 when solo).
 * Into preallocated arrays, no allocation.
 */
export function rankSnapshot(S: RaceState, n: number): void {
  const key = S.key;
  for (let i = 0; i < n; i++)
    key[i] =
      ((S.flags[i] ?? 0) & F_FINISHED) !== 0
        ? KEY_FINISHED - (S.finishMilli[i] ?? 0)
        : (S.pos[i] ?? 0);
  // PERF-2: the lanes sorted by key, best first (an insertion sort of last tick's order: almost
  // always one pass); `ahead` = how many keys are strictly greater = the index of the first lane
  // with her key, so equal keys share a rank and the order among them never matters
  const ord = S.rankOrder;
  let fresh = false;
  if (ord[MAX_LANES] !== n) {
    for (let k = 0; k < n; k++) ord[k] = k + 1;
    ord[MAX_LANES] = n;
    fresh = true;
  }
  let moved = false;
  let ties = false;
  for (let k = 1; k < n; k++) {
    const x = ord[k] ?? 1;
    const kx = key[x - 1] ?? 0;
    let m = k - 1;
    const km = key[(ord[m] ?? 1) - 1] ?? 0;
    if (km >= kx) {
      // in place: with no move the compares are the adjacent pairs, so they see every tie
      if (km === kx) ties = true;
      continue;
    }
    moved = true;
    while (m >= 0 && (key[(ord[m] ?? 1) - 1] ?? 0) < kx) {
      ord[m + 1] = ord[m] ?? 1;
      m--;
    }
    ord[m + 1] = x;
  }
  // the same strict order as the last snapshot (slot n + 1: it had no ties): the same ranks
  if (!fresh && !moved && !ties && ord[MAX_LANES + 1] === 1) return;
  const ahead = S.ahead;
  const frac = posFracRow(n);
  let rank = 0;
  let prev = 0;
  let strict = 1;
  for (let k = 0; k < n; k++) {
    const l = (ord[k] ?? 1) - 1;
    const kl = key[l] ?? 0;
    if (k === 0 || kl !== prev) rank = k;
    else strict = 0;
    prev = kl;
    ahead[l] = rank;
    S.posFrac[l] = frac[rank] ?? 0;
  }
  ord[MAX_LANES + 1] = strict;
}

/** `fl(ahead × 1000, n − 1)` for every `ahead` of a field of n (0 for n ≤ 1), built once per n. */
const POS_FRAC: Int32Array[] = [];
function posFracRow(n: number): Int32Array {
  let row = POS_FRAC[n];
  if (row === undefined) {
    row = new Int32Array(Math.max(1, n));
    for (let a = 0; a < n; a++) row[a] = n > 1 ? floorDiv(a * 1000, n - 1) : 0;
    POS_FRAC[n] = row;
  }
  return row;
}

/** "Middle of the pack" (9.1): `R.style.packLo ≤ posFrac ≤ R.style.packHi`. */
export function inPack(R: RaceConstants, S: RaceState, i: number): boolean {
  const pf = S.posFrac[i] ?? 0;
  return pf >= R.style.packLo && pf <= R.style.packHi;
}

/** What the controller reports to the log (events of 20.4); the engine adds tick and position. */
export type ControllerSink = {
  /**
   * The (mode, level) pair changed (9.5); level in vu. Reported on every change: the log keeps
   * only the pairs that hold `R.log.sampleEveryTicks` ticks (ADR-0003 D54).
   */
  boostMode(i: number, mode: number, level: number): void;
  /** A free-first-boost bit was spent on this segment type (9.6, 12). */
  freeBoost(i: number, segType: number): void;
  /** A pulse fired: its chain count, moved thrust (vu, air and stoop included), free flag, cooldown. */
  pulse(i: number, chain: number, thrust: number, free: boolean, cooldown: number): void;
};

/** Per-race scratch of the controller: reused every tick, never allocated in the loop. */
export type Controller = {
  readonly sink: ControllerSink;
  readonly pin: PulseInput;
  readonly pout: PulseOutput;
  /** `selectMode` outputs: the mode's level (vu) and whether it wants boost before the accumulator. */
  level: number;
  want: boolean;
};

export function createController(sink: ControllerSink): Controller {
  return {
    sink,
    pin: {
      t: 0,
      want: false,
      gatesOk: false,
      canThrust: false,
      levelMode: false,
      segType: 0,
      bp: 0,
      bpc: 0,
      unit: 1,
    },
    pout: createPulseOutput(),
    level: 0,
    want: false,
  };
}

/** Energy one boost decision commits (9.2): a whole burst for pulse frames, `kE` otherwise. */
export function costBoost(R: RaceConstants, T: RaceTables, i: number): number {
  return T.pulseFrame[i] === 1 ? R.pulseTicks * (T.costOn[i] ?? 0) : R.kE;
}

/** `keepOk(keepPm) = energy − costBoost − jr[seg] ≥ fl(Emax × keepPm, 1000)` (9.2). */
export function keepOk(
  R: RaceConstants,
  T: RaceTables,
  S: RaceState,
  i: number,
  keepPm: number,
): boolean {
  const keep = Math.floor(((T.Emax[i] ?? 0) * keepPm) / 1000);
  const left = (S.energy[i] ?? 0) - costBoost(R, T, i);
  // R3c (v3): what she keeps for later already pays a ceiling plan (the final's great dive)
  const kf = T.keepFlight[i] ?? 0;
  if (kf > 0 && (S.flRes[i] ?? 0) > 0)
    return left - (T.jr[is(i, S.seg[i] ?? 0)] ?? 0) >= Math.max(keep, kf);
  return left - jrNow(T, S, i, S.seg[i] ?? 0) >= keep;
}

/**
 * The energy gate of 9.3: a free boost, or the energy after the boost covers the jump reserve
 * (and, the kick on low hp, 2026-11-09, the energy her spurt and kick leave locked in the tank).
 */
function energyGate(
  R: RaceConstants,
  T: RaceTables,
  S: RaceState,
  i: number,
  seg: number,
  mode: number,
  freeLeft: number,
  freeBit: number,
): boolean {
  if (freeLeft > 0 || freeBit !== 0) return true;
  const lock = mode === MODE_KICK || mode === MODE_PLAN ? (S.kickLock[i] ?? 0) : 0;
  return (S.energy[i] ?? 0) - costBoost(R, T, i) >= jrNow(T, S, i, seg) + lock;
}

/**
 * Mode of 9.4, first match wins: KICK, PLAN, HOLD, PREHEAT, SURPLUS, REGEN, the position row, OFF.
 * Writes the mode's level and its want into `ctl` (a level mode's want comes from the
 * accumulator, 9.5) and sets the position hold of stalk and lead on continuous frames when their
 * intent fires. The rows keep the mode names of the wing styles they came from (ADR-0008): lead
 * runs `GLIDE_CHASE`, pack `GROUND_CONSTANT`, stalk `HOVER_CATCHUP`, closer `DIVE_DESCENT`.
 * `seg`, `ph` and `b` are the runner's tick-start segment, phase and PW variant.
 */
export function selectMode(
  R: RaceConstants,
  G: CourseGeometry,
  T: RaceTables,
  S: RaceState,
  i: number,
  ph: number,
  ctl: Controller,
): number {
  ctl.level = 0;
  ctl.want = false;
  const pos = S.pos[i] ?? 0;
  if (ph === PH_FINAL && pos >= (T.kickAt[i] ?? 0)) {
    ctl.want = true;
    return MODE_KICK;
  }
  if (((S.flags[i] ?? 0) & F_PLAN_ACTIVE) !== 0) {
    const level = S.planLevel[i] ?? 0;
    if (level > 0 && (S.planStartPos[i] ?? 0) <= pos && pos < (S.planEndPos[i] ?? 0)) {
      ctl.level = level;
      return MODE_PLAN;
    }
    return MODE_HOLD;
  }
  const seg = S.seg[i] ?? 0;
  const b = S.b[i] ?? 0;
  const energy = S.energy[i] ?? 0;
  const Emax = T.Emax[i] ?? 0;
  const jr = jrNow(T, S, i, seg);
  if (ph !== PH_FINAL) {
    if ((T.heatToEnergyPm[i] ?? 0) > 0) {
      const room = Math.max(0, (T.capLim[i] ?? 0) - (S.heat[i] ?? 0));
      // kH = 0 (a test ruleset of 24.2 P3) never fills the room: the ticks it allows are unbounded
      const near =
        R.kH > 0
          ? G.finalStart - pos <= ceilDiv(room, R.kH) * (T.vC[ibps(i, b, ph, seg)] ?? 0)
          : room > 0;
      if (near) {
        ctl.want = true;
        return MODE_PREHEAT;
      }
    }
    if (energy - jr - (T.capFinal[ib(i, b)] ?? 0) >= costBoost(R, T, i)) {
      ctl.want = true;
      return MODE_SURPLUS;
    }
    const regen = T.regenTick[i] ?? 0;
    if (regen > 0 && energy + 2 * regen >= Emax) {
      ctl.want = true;
      return MODE_REGEN;
    }
  }

  // 7. position row (ADR-0008)
  const position = T.position[i] ?? 0;
  if ((position === POS_STALK || position === POS_LEAD) && (S.holdLeft[i] ?? 0) > 0) {
    ctl.want = true; // position hold: intent and keep ignored, gates still apply
    return position === POS_STALK ? MODE_HOVER_CATCHUP : MODE_GLIDE_CHASE;
  }
  let mode = MODE_OFF;
  switch (position) {
    case POS_CLOSER:
      if (ph !== PH_FINAL && G.segType[seg] === SEG_DESCENT) {
        mode = MODE_DIVE_DESCENT;
        ctl.want = keepOk(R, T, S, i, R.style.diveKeep);
      }
      break;
    case POS_STALK:
      if ((S.posFrac[i] ?? 0) > R.style.packHi) {
        mode = MODE_HOVER_CATCHUP;
        ctl.want = keepOk(R, T, S, i, R.style.hoverKeep);
      }
      break;
    case POS_LEAD:
      if (ph !== PH_FINAL && (S.ahead[i] ?? 0) > 0) {
        mode = MODE_GLIDE_CHASE;
        ctl.want = keepOk(R, T, S, i, R.style.glideKeep);
      }
      break;
    case POS_PACK:
      if (
        ph !== PH_FINAL &&
        energy - jr >= Math.floor((Emax * (1000 - R.style.groundPreShare)) / 1000)
      ) {
        mode = MODE_GROUND_CONSTANT;
        ctl.level = T.groundLevel[ib(i, b)] ?? 0;
      }
      break;
    default:
      break;
  }
  if (
    ctl.want &&
    (mode === MODE_HOVER_CATCHUP || mode === MODE_GLIDE_CHASE) &&
    T.pulseFrame[i] !== 1
  )
    S.holdLeft[i] = R.style.styleHoldTicks;
  return mode;
}

/**
 * The overheat licence of 9.3: a licensed runner (mass-thrust, or a heat-immunity holder of any
 * rule but telemetry) may boost past the heat gate while its projected durability after the
 * cooling tail stays above `overheatFloorPm` of durabilityMax; an immunity holder only if the tail
 * also ends inside its window. So a licensed runner never breaks its own wings.
 */
export function licenceOk(
  R: RaceConstants,
  T: RaceTables,
  S: RaceState,
  i: number,
  over: boolean,
): boolean {
  if (T.licensed[i] !== 1) return false;
  const heat = S.heat[i] ?? 0;
  const heatCap = T.heatCap[i] ?? 0;
  const cool = T.coolTick[i] ?? 1;
  const projTicks =
    T.pulseFrame[i] === 1
      ? R.pulseTicks + ceilDiv(Math.max(0, heat + R.pulseTicks * R.kH - heatCap), cool)
      : ceilDiv(Math.max(0, heat + R.kH - heatCap), cool);
  const dmg = T.dmgTick[i] ?? 0;
  const durAfter = (S.dur[i] ?? 0) - (over ? dmg : 0) - dmg * projTicks;
  if (!(durAfter > Math.floor(((T.durMax[i] ?? 0) * R.overheatFloorPm) / 1000))) return false;
  if (T.rule[i] === RULE_MASS_THRUST) return true;
  const until = T.immuneUntil[i] ?? IMMUNE_WHOLE_RACE;
  if (until === IMMUNE_WHOLE_RACE) return true;
  return (S.pos[i] ?? 0) + (projTicks + 1) * Math.max(1, S.vOutPrev[i] ?? 0) < until;
}

/**
 * Step B7 for runner i at tick t (9.6, 12): select the mode, reset the accumulator and report a
 * `boostMode` change to the sink when (mode, level) changes, accrue the accumulator in level modes (not on
 * jump-blocked ticks), apply the gates of 9.3 (true values, never perceived), then either run the
 * Kōryū state machine or take the continuous decision with free-first-boost. Writes the tick's
 * `boostOn`, `isPulseTick`, `freeTick`, `burstChain`; the speed step applies thrust, air and stoop.
 * `over` is the tick's overheat flag (step B5).
 */
export function decide(
  R: RaceConstants,
  G: CourseGeometry,
  T: RaceTables,
  S: RaceState,
  i: number,
  t: number,
  ph: number,
  over: boolean,
  ctl: Controller,
): void {
  S.boostOn[i] = 0;
  S.isPulseTick[i] = 0;
  S.freeTick[i] = 0;
  S.burstChain[i] = 0;

  const mode = selectMode(R, G, T, S, i, ph, ctl);
  const level = ctl.level;
  let want = ctl.want;
  if (mode >= MODE_KICK && mode <= MODE_REGEN) S.holdLeft[i] = 0;
  const P = S.pulse;
  if (mode !== S.mode[i] || level !== S.modeLevel[i]) {
    P.acc[i] = 0;
    S.mode[i] = mode;
    S.modeLevel[i] = level;
    ctl.sink.boostMode(i, mode, level);
  }
  // PERF-2: no want, no level mode and no pulse state machine: nothing below writes (gates unread)
  const levelMode = mode === MODE_PLAN || mode === MODE_GROUND_CONSTANT;
  const pulseFrame = T.pulseFrame[i] === 1;
  if (!want && !levelMode && !pulseFrame) return;

  const seg = S.seg[i] ?? 0;
  const segType = G.segType[seg] ?? 0;
  const b = S.b[i] ?? 0;
  const style = T.phys[i] ?? 0;
  const flags = S.flags[i] ?? 0;
  const airborne = (flags & F_AIRBORNE) !== 0;
  const onJump = segType === SEG_JUMP && style !== STYLE_GROUND;
  const unit = T.unit[ib(i, b)] ?? 1;
  if (levelMode) {
    // 9.5: no accrual on jump-blocked ticks; the cap is unit + level, so no overflow is lost
    if (!airborne && !onJump) P.acc[i] = Math.min(unit + level, (P.acc[i] ?? 0) + level);
    want = (P.acc[i] ?? 0) >= unit;
  }

  // gates (9.3)
  const canThrust = (flags & F_EXHAUSTED) === 0 && !airborne && !onJump;
  const bit = 1 << segType;
  const freeLeft = S.freeLeft[i] ?? 0;
  // the gates are pure reads: evaluated only when she wants and can thrust (PERF-1)
  let gatesOk = false;
  if (
    want &&
    canThrust &&
    energyGate(R, T, S, i, seg, mode, freeLeft, (P.freeMask[i] ?? 0) & bit)
  ) {
    const capLim = T.capLim[i] ?? 0;
    const capMode =
      mode === MODE_SURPLUS
        ? Math.floor((capLim * R.surplusHeatPm) / 1000)
        : mode === MODE_REGEN
          ? Math.floor((capLim * R.regenOverflowHeatPm) / 1000)
          : capLim;
    const heatAdd = pulseFrame ? R.pulseTicks * R.kH : R.kH;
    const licMode =
      mode === MODE_KICK ||
      mode === MODE_PLAN ||
      (T.heatImmune[i] === 1 && mode >= MODE_DIVE_DESCENT);
    gatesOk = (S.heat[i] ?? 0) + heatAdd <= capMode || (licMode && licenceOk(R, T, S, i, over));
  }

  if (pulseFrame) {
    const pin = ctl.pin;
    pin.t = t;
    pin.want = want;
    pin.gatesOk = gatesOk;
    pin.canThrust = canThrust;
    pin.levelMode = levelMode;
    pin.segType = segType;
    pin.bp = T.Bp[ib(i, b)] ?? 0;
    pin.bpc = T.Bpc[ib(i, b)] ?? 0;
    pin.unit = unit;
    const out = ctl.pout;
    pulseStep(R, P, i, pin, out);
    S.boostOn[i] = out.boostOn ? 1 : 0;
    S.isPulseTick[i] = out.isPulseTick ? 1 : 0;
    S.freeTick[i] = out.freeTick ? 1 : 0;
    S.burstChain[i] = out.burstChain ? 1 : 0;
    if (out.fired) {
      S.pulses[i] = (S.pulses[i] ?? 0) + 1;
      if (out.freeTick) ctl.sink.freeBoost(i, segType);
      const air = Math.floor((out.thrust * (T.airPm[is(i, seg)] ?? 1000)) / 1000);
      const moved = Math.floor((air * (T.stoop[ips(i, ph, seg)] ?? 1000)) / 1000);
      ctl.sink.pulse(i, P.chain[i] ?? 1, moved, out.freeTick, P.cdFire[i] ?? 0);
    }
    return;
  }

  if (!(want && gatesOk)) return;
  S.boostOn[i] = 1;
  if (freeLeft > 0) {
    S.freeTick[i] = 1;
    S.freeLeft[i] = freeLeft - 1;
  } else if (((P.freeMask[i] ?? 0) & bit) !== 0) {
    P.freeMask[i] = (P.freeMask[i] ?? 0) & ~bit;
    S.freeLeft[i] = R.freeBoostMaxTicks - 1;
    S.freeSeg[i] = seg;
    S.freeTick[i] = 1;
    ctl.sink.freeBoost(i, segType);
  }
  if (levelMode) P.acc[i] = (P.acc[i] ?? 0) - unit;
}
