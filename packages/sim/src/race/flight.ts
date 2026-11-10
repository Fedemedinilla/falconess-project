/**
 * The flight of ruleset v3 (ADR-0011, «Carrera v3: vuelo», stage 1): altitude bands, flight plans
 * by race position, climb and hold paid with energy, rest in the air and the dive that turns
 * height into speed. Its constants live in `rulesets/v3/constants.ts`; the engine switches on
 * `flightOf(ruleset)`, so v1 and v2, which carry no `flight` constants, never reach a line of this
 * file.
 */
import { ceilDiv, floorDiv } from "@falconess/rng";
import { APTITUDES, type Aptitude, DISTANCES, type Distance } from "@falconess/schema";
import type { Ruleset } from "../rulesets/index.js";
import {
  BAND_CEILING,
  BAND_HIGH,
  BAND_LOW,
  type FlightConstants,
  NEUTRAL_WING,
  type WingFlight,
} from "../rulesets/v3/constants.js";
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

export type { FlightConstants, WingFlight } from "../rulesets/v3/constants.js";
export { BAND_CEILING, BAND_HIGH, BAND_LOW } from "../rulesets/v3/constants.js";

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

/** Stamina pays effort (owner 2026-11-09) is on: some maneuver costs hp. */
export function effortCosts(F: FlightConstants): boolean {
  return (
    F.hpTakeoff > 0 ||
    F.hpSkimTakeoff > 0 ||
    F.hpDiveBand > 0 ||
    F.hpSwitch > 0 ||
    F.hpFight > 0 ||
    F.hpKnock > 0 ||
    F.hpDoor > 0 ||
    F.hpDirtyPm > 0 ||
    F.hpBoxedPm > 0
  );
}

/** The four race distances in `DISTANCES` order (owner 2026-11-09). */
export const DIST_SPRINT = 0;
export const DIST_MILE = 1;
export const DIST_MEDIUM = 2;
export const DIST_LONG = 3;

/** A course's distance from its length (mm): sprint ≤ distanceMaxM[0] m, mile ≤ [1], medium ≤ [2], long. */
export function distanceCode(F: FlightConstants, lengthMm: number): number {
  for (let d = 0; d < 3; d++) if (lengthMm <= (F.distanceMaxM[d] ?? 0) * 1000) return d;
  return DIST_LONG;
}

/** The distance's name (`DISTANCES`), for the content side (letters, the pre-race card). */
export function distanceOfLength(F: FlightConstants, lengthMm: number): Distance {
  return DISTANCES[distanceCode(F, lengthMm)] ?? "long";
}

/** ‰ a distance letter worsens its distance's aspect of flight (0 = A, or no letter, or off). */
export function distanceLetterPm(F: FlightConstants, letter: Aptitude | undefined): number {
  if (!F.distanceLetters || letter === undefined) return 0;
  return F.distancePm[APTITUDES.indexOf(letter)] ?? 0;
}

/** The flight constants of a ruleset, or null (v1, v2): the engine's only switch. */
export function flightOf(ruleset: Ruleset): FlightConstants | null {
  return ruleset.flight ?? null;
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
  // polish: every dive keeps closerRoomMinM to the line
  const cap =
    F.closerRoomMinM > 0 ? Math.min(G.reserveAt, G.L - F.closerRoomMinM * m) : G.reserveAt;
  const finish = (a: number, featureEnd: number, corn: boolean): Flight | null => {
    let b = Math.max(a + minLen, featureEnd + F.marginM * m, fs);
    b = extendEnd(G, b, F.lookM * m, F.marginM * m, Number.MAX_SAFE_INTEGER);
    if (b <= cap) return { a, b, band: BAND_CEILING, corn };
    // polish: too close to the line to dive past it: the great dive goes before that feature
    if (F.closerRoomMinM > 0) {
      const fl = roomPlan(F, G, m, minLen, cap, a - F.lookM * m);
      return fl[0] ?? null;
    }
    return null;
  };
  // 1. the edge of the last descent that ends inside the final (polish: unless a Salto of the
  // final starts after it: the last feature is the one she dives from)
  let pick: Flight | null = null;
  let lastJump = -1;
  if (F.closerLastFeature)
    for (let s = 0; s < G.S; s++)
      if (G.segType[s] === SEG_JUMP && (G.segStart[s] ?? 0) >= fs) lastJump = G.segStart[s] ?? 0;
  for (let s = G.S - 1; s >= 0 && pick === null; s--) {
    if (G.segType[s] === SEG_DESCENT && (G.segStart[s] ?? 0) < lastJump) break;
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
  if (F.closerRoomM > 0) return roomPlan(F, G, m, minLen, cap, G.L - F.closerRoomM * m);
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

/**
 * Polish (closerRoomM): the great dive `closerRoomM` before the line. An obstacle or canyon the
 * flight overlaps, or that starts within `lookM` after the dive, is flown over (the dive moves past
 * it) while the dive keeps `cap`; otherwise the whole flight moves before that feature.
 */
function roomPlan(
  F: FlightConstants,
  G: CourseGeometry,
  m: number,
  minLen: number,
  cap: number,
  b0: number,
) {
  const blocked = (t: number) => t === SEG_CANYON || isObstacle(t);
  let b = Math.min(cap, b0);
  for (let guard = 0, again = true; guard < 8 && again; guard++) {
    again = false;
    for (let s = 0; s < G.S; s++) {
      const sa = G.segStart[s] ?? 0;
      const sb = (G.segEnd[s] ?? 0) + F.marginM * m;
      if (!blocked(G.segType[s] ?? 0) || sa >= b + F.lookM * m || sb <= b - minLen) continue;
      if (sa >= b - minLen && sb <= cap) b = Math.max(b, sb);
      else {
        b = sa - F.lookM * m;
        again = true;
        break;
      }
    }
  }
  const a = Math.max(G.startEnd, b - minLen);
  return b > a ? [{ a, b, band: BAND_CEILING, corn: false }] : [];
}

/** Lead (stage 2): band 1 over every climb, water and jump, 20 m each side; joins gaps < 60 m. */
function leadPlan(F: FlightConstants, G: CourseGeometry, m: number): Flight[] {
  const raw: { a: number; b: number }[] = [];
  // stage 3 (allFly): clean air at the front, a skim from the start's end
  if (F.allFly && F.leadEarlyDiv > 0) {
    let a = G.startEnd;
    // polish: past an obstacle the start's end falls in (she lands it on her legs first)
    if (F.leadStartJumps)
      for (let s = 0; s < G.S; s++)
        if (G.segType[s] === SEG_JUMP && (G.segStart[s] ?? 0) <= a && (G.segEnd[s] ?? 0) > a)
          a = (G.segEnd[s] ?? 0) + F.marginM * m;
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
    // polish: a Salto she meets in the start is jumped on her legs (like the pack's)
    if (F.leadStartJumps && a < G.startEnd && G.segType[s] === SEG_JUMP) continue;
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
  air: {
    u28: number;
    u30: number;
    technique: number;
    dist?: number;
    dPm?: number;
    /** The Technique the air's centre reads (airTechRel); absent = `technique`. */
    airTech?: number;
    /** The Courage the dive's η reads (diveCourRel); absent = `courage`. */
    diveCour?: number;
    /** ADR-0009: her passive's dive (trait `diveSkill`); absent = none. */
    diveSkill?: { fromBand: number; pm: number };
  },
): void {
  const wing = wingOf(F, T.style[i] ?? 0);
  // distance letters (2026-11-09): ‰ off her distance, on that distance's aspect of flight
  const dPm = air.dPm ?? 0;
  const dist = air.dist ?? 0;
  const sprintPm = dPm !== 0 && dist === DIST_SPRINT ? dPm : 0;
  const climb0 = ceilDiv(F.climbE * 1000 * wing.climbCostPm, Math.max(1, liftF));
  // the sprint is the takeoff's and the dive's power: the climb costs more, the dive gives less
  T.climbMe[i] = sprintPm !== 0 ? ceilDiv(climb0 * (1000 + sprintPm), 1000) : climb0;
  // L5: η = diveEtaBasePm + diveEtaCouragePm × min(C, 1200) / 1200; S1: × the wing's diveWingPm
  const cEta = air.diveCour ?? courage;
  const eta0 = F.diveEtaBasePm + floorDiv(F.diveEtaCouragePm * Math.min(cEta, 1200), 1200);
  const diveCut = Math.min(900, floorDiv(sprintPm * F.distanceDivePm, 1000));
  const eta = diveCut !== 0 ? floorDiv(eta0 * (1000 - diveCut), 1000) : eta0;
  const ds = F.skillFlight ? air.diveSkill : undefined;
  T.diveSkillFrom[i] = ds !== undefined && ds.pm > 0 ? ds.fromBand : 0;
  T.diveSkillPm[i] = ds !== undefined && ds.pm > 0 ? ds.pm : 0;
  for (let b = 0; b < 4; b++) {
    const mms0 = floorDiv((F.diveVMms[b] ?? 0) * eta * wing.diveWingPm, 1_000_000);
    // ADR-0009: her passive's dive (Garra fija) from its band up, ‰ more Δv
    const mms =
      ds !== undefined && ds.pm > 0 && b >= ds.fromBand
        ? floorDiv(mms0 * (1000 + ds.pm), 1000)
        : mms0;
    T.diveV[i * 4 + b] = mms * velPerMms;
  }
  // L1: the air of flight k, one byte of slot 28 (k < 4) or 30 (k ≥ 4), drawn before tick 0
  for (let k = 0; k < FLIGHTS_MAX; k++) {
    const u = k < 4 ? air.u28 : air.u30;
    T.airOff[i * FLIGHTS_MAX + k] =
      airOffsetPm(F, (u >>> (8 * (k % 4))) & 255, air.airTech ?? air.technique) +
      (F.airWPm > 0 ? wing.airPm : 0);
  }
  // L3: dirty air costs × (1000 + extra − extra × dirtyTechPm × min(T, 1200) / 1.2e6) / 1000
  const extra = Math.max(0, F.dirtyHoldPm - 1000);
  T.dirtyPm[i] =
    1000 + extra - floorDiv(extra * F.dirtyTechPm * Math.min(air.technique, 1200), 1_200_000);
  // L4: courage holds the line (the mile off her distance: she loses it sooner)
  const knock0 = F.knockTicks + floorDiv(F.knockCourTicks * Math.min(courage, 1200), 1200);
  T.knockAt[i] = dPm !== 0 && dist === DIST_MILE ? floorDiv(knock0 * (1000 - dPm), 1000) : knock0;
  // the medium is the cost of holding altitude, the long its long flights (half): her hold lift
  // shrinks by the letter's ‰, so holding (R4) costs that much more
  const holdPm =
    dPm !== 0 && dist === DIST_MEDIUM
      ? dPm
      : dPm !== 0 && dist === DIST_LONG
        ? floorDiv(dPm, 2)
        : 0;
  const liftH0 = holdLift(F, T.style[i] ?? 0, liftF);
  const liftH = holdPm !== 0 ? floorDiv(liftH0 * 1000, 1000 + holdPm) : liftH0;
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

/**
 * Stamina pays effort: the hits (hp at stamina 0) of her planned takeoffs and dives, the way the
 * engine charges them (a takeoff from the ground to a high band `hpTakeoff`, to the low band or a
 * chained climb `hpSkimTakeoff`, a flight that ends in a dive from band ≥ 2 `hpDiveBand` × band).
 */
export function plannedHitsHp(F: FlightConstants, T: RaceTables, i: number): number {
  const n = T.flN[i] ?? 0;
  let hp = 0;
  let prevBand = 0;
  let prevChain = false;
  for (let k = 0; k < n; k++) {
    const x = i * FLIGHTS_MAX + k;
    const band = T.flBand[x] ?? 0;
    const chain = T.flChain[x] === 1 && k + 1 < n;
    if (!prevChain) hp += band > BAND_LOW ? F.hpTakeoff : F.hpSkimTakeoff;
    else if (band > prevBand) hp += F.hpSkimTakeoff;
    if (!chain && band >= 2) hp += F.hpDiveBand * band;
    prevBand = band;
    prevChain = chain;
  }
  return hp;
}

/** me to hold `bandPu` (band × pu) at liftF (R4): holdE energy per band per 100 m at liftF 1000. */
export function holdMe(F: FlightConstants, bandPu: number, posPerMm: number, liftF: number) {
  return floorDiv(bandPu * F.holdE * 10_000, posPerMm * 1000 * Math.max(1, liftF));
}

/** `jr` of the gates and the plan, plus the energy still reserved for planned flights (R3). */
export function jrNow(T: RaceTables, S: RaceState, i: number, seg: number): number {
  return (T.jr[is(i, seg)] ?? 0) + (S.flRes[i] ?? 0);
}
