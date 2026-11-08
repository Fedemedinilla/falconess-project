import { ceilDiv, floorDiv } from "@falconess/rng";
import type { SprintPlanReason } from "@falconess/schema";
import type { RaceConstants } from "../rulesets/index.js";
import { jrNow } from "./flight.js";
import type { CourseGeometry } from "./geometry.js";
import {
  DK_FINAL,
  F_EXHAUSTED,
  ib,
  ibps,
  type RaceState,
  type RaceTables,
  routeDist,
  thrustable,
} from "./state.js";
import { PH_FINAL, SEG_JUMP, STYLE_GROUND, sub0 } from "./units.js";

/**
 * Final sprint plan of docs/race-engine.md 11: the sustained boost level (an average thrust, vu)
 * that spends the perceived energy over a window ending at `kickAt`, cut where hp is projected to
 * run out, chosen top-down in 0.1 m/s steps by net metres gained with heat and hp priced, clean
 * candidates first and the highest clean level on ties. The plan spends only over thrust-capable
 * distance (a flyer never thrusts on a jump segment) and places no on-tick inside a jump. Every
 * walk is an integer loop over the segments; nothing allocates.
 */

/** What one plan decided (the `sprintPlan` event of 20.4 reads it); reused, never allocated per plan. */
export type PlanReport = {
  reason: SprintPlanReason;
  /** `fl(energy × (1000 + planErr), 1000)`, me: the tank the runner perceives (before the reserve). */
  energyPerceived: number;
  /** `fl(hp × (1000 + planErr), 1000)`, µhp. */
  hpPerceived: number;
  /** `jr[seg]` at plan time, me. */
  jumpReserve: number;
  /** Planned level, vu (0 for NONE). */
  level: number;
  startPos: number;
  endPos: number;
  /** Candidates evaluated by the top-down loop. */
  candidates: number;
  /** Planned on-ticks of the chosen candidate. */
  onTicks: number;
  clean: boolean;
};

export function createPlanReport(): PlanReport {
  return {
    reason: "planned",
    energyPerceived: 0,
    hpPerceived: 0,
    jumpReserve: 0,
    level: 0,
    startPos: 0,
    endPos: 0,
    candidates: 0,
    onTicks: 0,
    clean: true,
  };
}

/** `vF[s] = vC[b][PH_FINAL][s]` (vu): every plan walk prices the rest of the race at final cruise. */
function vF(T: RaceTables, i: number, b: number, s: number): number {
  return Math.max(1, T.vC[ibps(i, b, PH_FINAL, s)] ?? 1);
}

/** `drainF(v) = fl(r × r × dK[final], 10^6)`, `r = fl(v × 1000, VBASE)` µhp per tick. */
function drainF(v: number, vBase: number, dkF: number): number {
  const r = floorDiv(v * 1000, vBase);
  return floorDiv(r * r * dkF, 1_000_000);
}

/** `thrustDist(x0, x1)`: route distance (pu) of the thrust-capable overlaps of `[x0, x1)`. */
export function thrustDist(
  G: CourseGeometry,
  T: RaceTables,
  i: number,
  x0: number,
  x1: number,
): number {
  let d = 0;
  for (let s = 0; s < G.S; s++) {
    if (!thrustable(G, T, i, s)) continue;
    const a = Math.max(x0, G.segStart[s] ?? 0);
    const z = Math.min(x1, G.segEnd[s] ?? 0);
    if (z > a) d += routeDist(G, T, i, s, z - a);
  }
  return d;
}

/** `thrustTicks(x0, x1)`: Σ `ceilDiv(route(overlap), vF)` over the thrust-capable overlaps. */
function thrustTicks(
  G: CourseGeometry,
  T: RaceTables,
  i: number,
  b: number,
  x0: number,
  x1: number,
): number {
  let tk = 0;
  for (let s = 0; s < G.S; s++) {
    if (!thrustable(G, T, i, s)) continue;
    const a = Math.max(x0, G.segStart[s] ?? 0);
    const z = Math.min(x1, G.segEnd[s] ?? 0);
    if (z > a) tk += ceilDiv(routeDist(G, T, i, s, z - a), vF(T, i, b, s));
  }
  return tk;
}

/** `cruiseHp(x0, x1)`: hp the overlaps of every segment cost at final cruise (jump ticks drain too). */
function cruiseHp(
  G: CourseGeometry,
  T: RaceTables,
  i: number,
  b: number,
  vBase: number,
  dkF: number,
  x0: number,
  x1: number,
): number {
  let h = 0;
  for (let s = 0; s < G.S; s++) {
    const a = Math.max(x0, G.segStart[s] ?? 0);
    const z = Math.min(x1, G.segEnd[s] ?? 0);
    if (z <= a) continue;
    const v = vF(T, i, b, s);
    h += ceilDiv(routeDist(G, T, i, s, z - a), v) * drainF(v, vBase, dkF);
  }
  return h;
}

/**
 * `exhaustPos(x0, budget)`: walking every segment from x0 at final cruise, the position where the
 * hp budget runs out (`L` if never). A ground runner on a jump advances `fl(k × v × 1000, detour)`.
 */
function exhaustPos(
  G: CourseGeometry,
  T: RaceTables,
  i: number,
  b: number,
  vBase: number,
  dkF: number,
  x0: number,
  budget: number,
): number {
  let acc = 0;
  for (let s = 0; s < G.S; s++) {
    const a = Math.max(x0, G.segStart[s] ?? 0);
    const z = Math.min(G.L, G.segEnd[s] ?? 0);
    if (z <= a) continue;
    const v = vF(T, i, b, s);
    const d = drainF(v, vBase, dkF);
    const h = ceilDiv(routeDist(G, T, i, s, z - a), v) * d;
    if (acc + h > budget) {
      const k = floorDiv(budget - acc, Math.max(1, d));
      const adv =
        T.phys[i] === STYLE_GROUND && G.segType[s] === SEG_JUMP
          ? floorDiv(k * v * 1000, T.detour[i] ?? 1000)
          : k * v;
      return Math.min(z, a + adv);
    }
    acc += h;
  }
  return G.L;
}

/**
 * `mapBack(xEnd, X)`: the start position of a spurt of thrust distance X that ends at xEnd, walking
 * the thrust-capable overlaps of `[pos, xEnd)` backwards and skipping jumps; `pos` if it never fits.
 */
export function mapBack(
  G: CourseGeometry,
  T: RaceTables,
  i: number,
  pos: number,
  xEnd: number,
  X: number,
): number {
  let rest = X;
  for (let s = G.S - 1; s >= 0; s--) {
    if (!thrustable(G, T, i, s)) continue;
    const a = Math.max(pos, G.segStart[s] ?? 0);
    const z = Math.min(xEnd, G.segEnd[s] ?? 0);
    if (z <= a) continue;
    const len = routeDist(G, T, i, s, z - a);
    if (rest <= len)
      return T.phys[i] === STYLE_GROUND && G.segType[s] === SEG_JUMP
        ? z - floorDiv(rest * 1000, T.detour[i] ?? 1000)
        : z - rest;
    rest -= len;
  }
  return pos;
}

/**
 * `planSprint` of 11.3 for runner i at its current position (step B6; first plan at the plan point,
 * replans on refund, jump exit and broken wings). Counts the plan, writes `planLevel`,
 * `planStartPos`, `planEndPos` and fills `out` for the `sprintPlan` event. Perception: the plan
 * sees `Ep = fl(energy × (1000 + planErr), 1000) − jr` and `hpP = fl(hp × (1000 + planErr), 1000)`
 * (10); gates never do. Heat is priced at `capLim` for every rule: the overheat licence never
 * enters the plan.
 */
export function planSprint(
  R: RaceConstants,
  G: CourseGeometry,
  T: RaceTables,
  S: RaceState,
  i: number,
  out: PlanReport,
): void {
  S.planCount[i] = (S.planCount[i] ?? 0) + 1;
  const pos = S.pos[i] ?? 0;
  const b = S.b[i] ?? 0;
  const seg = S.seg[i] ?? 0;
  const err = T.planErr[i] ?? 0;
  const energy = S.energy[i] ?? 0;
  const jr = jrNow(T, S, i, seg);
  const perceived = floorDiv(energy * (1000 + err), 1000);
  const Ep = Math.max(0, perceived - jr);
  const hpP = floorDiv((S.hp[i] ?? 0) * (1000 + err), 1000);
  out.energyPerceived = perceived;
  out.hpPerceived = hpP;
  out.jumpReserve = jr;
  out.candidates = 0;
  out.onTicks = 0;
  out.clean = true;

  if (((S.flags[i] ?? 0) & F_EXHAUSTED) !== 0) {
    none(S, i, pos, out, "exhausted");
    return;
  }
  const kickAt = T.kickAt[i] ?? 0;
  const Dw0 = thrustDist(G, T, i, pos, kickAt);
  if (Dw0 <= 0) {
    none(S, i, pos, out, "past-reserve");
    return;
  }
  const Bon = T.Bon[ib(i, b)] ?? 0;
  if (Bon === 0) {
    none(S, i, pos, out, "no-thrust");
    return;
  }
  const pulseFrame = T.pulseFrame[i] === 1;
  const costOn = T.costOn[i] ?? 1;
  if (Ep < (pulseFrame ? R.pulseTicks * costOn : costOn)) {
    none(S, i, pos, out, "no-energy");
    return;
  }

  const vBase = R.vBase * R.ticksPerSecond;
  const dkF = T.dK[i * 4 + DK_FINAL] ?? 0;

  // 1. window end: cut where the projected hp runs out (thrust is disabled at hp 0)
  const cbar0 = Math.max(1, floorDiv(Dw0, Math.max(1, thrustTicks(G, T, i, b, pos, kickAt))));
  const extraHp =
    floorDiv(Ep, costOn) * Math.max(0, drainF(cbar0 + Bon, vBase, dkF) - drainF(cbar0, vBase, dkF));
  const hpCruise = cruiseHp(G, T, i, b, vBase, dkF, pos, G.L);
  let wEnd = kickAt;
  let hpLimited = false;
  if (hpCruise + extraHp > hpP) {
    const xE = exhaustPos(G, T, i, b, vBase, dkF, pos, Math.max(0, hpP - extraHp));
    if (xE < wEnd) {
      wEnd = xE;
      hpLimited = true;
    }
  }
  const Dw = thrustDist(G, T, i, pos, wEnd);
  if (Dw <= 0) {
    none(S, i, pos, out, "hp-limited");
    return;
  }
  const cbar = Math.max(1, floorDiv(Dw, Math.max(1, thrustTicks(G, T, i, b, pos, wEnd))));

  // 2. top-down candidates, 0.1 m/s apart
  const drainC = drainF(cbar, vBase, dkF);
  const drainOn = drainF(cbar + Bon, vBase, dkF);
  const vMinF = T.vMin[ibps(i, b, PH_FINAL, G.S - 1)] ?? 0;
  const unit = T.unit[ib(i, b)] ?? 1;
  const regen = T.regenTick[i] ?? 0;
  const cool = T.coolTick[i] ?? 1;
  const capLim = T.capLim[i] ?? 0;
  const heat = S.heat[i] ?? 0;
  const step = R.sprintLevelStepMms * R.ticksPerSecond;
  let nCand = 0;
  let found = false;
  let bS = 0;
  let bX = 0;
  let bOn = 0;
  let bNet = 0;
  let bClean = false;
  for (let s = T.sMax[ib(i, b)] ?? 0; s > 0; s -= step) {
    nCand += 1;
    const v = cbar + s;
    const TwS = ceilDiv(Dw, v); // ticks to cross the window at level s
    const eTB = s * costOn - (Bon - s) * regen; // energy per tick × Bon
    const tbE = eTB > 0 ? floorDiv(Ep * Bon, eTB) : TwS;
    const capped = tbE >= TwS;
    const tb = capped ? TwS : tbE;
    if (tb === 0) continue;
    const X = capped ? Dw : tb * v; // spurt length in thrust distance
    const nOn = pulseFrame ? R.pulseTicks * floorDiv(s * tb, unit) : floorDiv(s * tb, Bon);
    const gainPlan = pulseFrame
      ? nOn * Bon // pulses are whole: quantised gain
      : capped
        ? floorDiv(s * Dw, v)
        : floorDiv(s * Ep * Bon, eTB);
    const hold = floorDiv(Dw - X, cbar); // jump ticks also cool: ignoring them is conservative
    const h1 = sub0(heat, hold * cool); // heat when the spurt starts
    const hOn = capLim >= h1 ? floorDiv(capLim - h1 + tb * cool, R.kH + cool) : 0;
    const clean = nOn <= hOn;
    const gain = clean ? gainPlan : Math.min(gainPlan, hOn * Bon);
    const need =
      hpCruise - (ceilDiv(X, cbar) - tb) * drainC + Math.min(nOn, hOn) * (drainOn - drainC);
    const pen =
      need > hpP ? ceilDiv(need - hpP, Math.max(1, drainC)) * (cbar - Math.min(cbar, vMinF)) : 0;
    const net = gain - pen;
    if (!found || (clean && !bClean) || (clean === bClean && net > bNet)) {
      found = true;
      bS = s;
      bX = X;
      bOn = nOn;
      bNet = net;
      bClean = clean;
    }
  }
  out.candidates = nCand;
  if (!found) {
    none(S, i, pos, out, "no-candidate");
    return;
  }
  S.planLevel[i] = bS;
  S.planStartPos[i] = mapBack(G, T, i, pos, wEnd, bX);
  S.planEndPos[i] = wEnd;
  out.reason = hpLimited ? "hp-limited" : "planned";
  out.level = bS;
  out.startPos = S.planStartPos[i] ?? pos;
  out.endPos = wEnd;
  out.onTicks = bOn;
  out.clean = bClean;
}

/** `NONE(reason)`: no spurt; the runner holds until `KICK`. */
function none(
  S: RaceState,
  i: number,
  pos: number,
  out: PlanReport,
  reason: SprintPlanReason,
): void {
  S.planLevel[i] = 0;
  S.planStartPos[i] = pos;
  S.planEndPos[i] = pos;
  out.reason = reason;
  out.level = 0;
  out.startPos = pos;
  out.endPos = pos;
  out.onTicks = 0;
  out.clean = true;
}
