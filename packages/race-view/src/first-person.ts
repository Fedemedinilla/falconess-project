import type { RaceGeometry, SegmentType } from "@falconess/schema";
import {
  altitudeAt,
  FLIGHT_PHASE,
  type FlightModel,
  type FlightPhase,
  type FlightTrack,
  hpAt,
  lineAt,
  orderAt,
  phaseAt,
  positionAt,
  rowOf,
  speedAt,
} from "./flight-view.js";

/**
 * The first-person view of a v3 race (2026-11-10): what the runner the camera follows sees from
 * her own eyes, only to feel the speed and the flight. Everything is read from `FlightModel` (the
 * log's positions, bands, lines and events): her eye height and lateral spot, the pitch of her
 * climb or dive, the kick of the field of view in a dive or a boost, the jolt of a landing, the
 * rivals ahead (metres, line, altitude), the track's features coming toward her and the visor's
 * numbers. The track's shape (a Colina rises, a Bajada falls away, Curvas bend) is an abstract
 * picture of the logged geometry, scaled for the eye; it carries no rule. Text-free.
 */

/** Metres of one altitude band, her eyes over the ground, and the half width of the track. */
export const FPV_BAND_M = 4;
export const FPV_EYE_M = 1.4;
export const FPV_TRACK_HALF_M = 4.2;
/** Lateral metres of the inside and the outside line up in the air. */
export const FPV_LINE_M: readonly [number, number] = [-1.7, 1.7];
/** How much of a grade (‰) the picture keeps: a 300 ‰ Colina rises 36 ‰ to the eye. */
export const FPV_SLOPE_SCALE = 0.12;
/** How much of a curve's curvature (1 / radius) the picture keeps. */
export const FPV_CURVE_SCALE = 0.22;
/** A run of Curvas bends one way, then the other, every this many metres. */
export const FPV_CURVE_SWING_M = 50;
/** Rows a landing jolt lasts. */
export const FPV_IMPACT_ROWS = 9;

const clamp = (v: number, a: number, b: number) => Math.min(Math.max(v, a), b);

/** Where the camera is and what her body does at `row`. */
export type FpvCamera = {
  lane: number;
  /** Her position along the track, m. */
  posM: number;
  /** Body speed, mm/s. */
  speedMms: number;
  /** Altitude in bands (fractional; a jump is an arc of one band) and the band she holds. */
  alt: number;
  band: number;
  phase: FlightPhase;
  /** Lateral spot, m (negative inside). */
  lateralM: number;
  /** Eye height over the ground under her, m. */
  eyeM: number;
  /** Nose up (+1, a climb: the horizon drops) to nose down (−1, a dive: the horizon rises). */
  pitch: number;
  /** 0..1: how far the field of view opens (a dive 1, the surge after it, a boost). */
  fovKick: number;
  /** 0..1: how strong the speed lines run. */
  speedFx: number;
  /** 0..1: the jolt of a touchdown or a landing, fading over FPV_IMPACT_ROWS. */
  impact: number;
  finished: boolean;
};

/** Lateral spot of a runner: spread by lane on the ground, on her line up in the air. */
export function lateralAt(model: FlightModel, t: FlightTrack, row: number): number {
  const n = Math.max(2, model.tracks.length);
  const ground = -3 + (6 * t.lane) / (n - 1);
  const ln = lineAt(t, row);
  const air = (FPV_LINE_M[0] ?? -1.7) + ((FPV_LINE_M[1] ?? 1.7) - (FPV_LINE_M[0] ?? -1.7)) * ln;
  const k = clamp(altitudeAt(t, clamp(row, 0, model.rows)), 0, 1);
  return ground + (air - ground) * k;
}

/** The jolt of her latest touchdown (stronger after a dive) or landing at `row`, 0..1. */
export function impactAt(t: FlightTrack, row: number): number {
  let best = 0;
  for (const e of t.events) {
    const at = e.tick + 1;
    if (at > row) break;
    const age = row - at;
    if (age >= FPV_IMPACT_ROWS) continue;
    let k = 0;
    if (e.kind === "touchdown") k = e.cause === "plan" ? 0.7 : 0.85;
    else if (e.kind === "dive") k = 1;
    else if (e.kind === "landing") k = 0.55;
    best = Math.max(best, k * (1 - age / FPV_IMPACT_ROWS));
  }
  return best;
}

/** The camera of runner `lane` at `row` (fractional). */
export function fpvCamera(model: FlightModel, lane: number, row: number): FpvCamera {
  const t = model.tracks[lane] ?? model.tracks[0];
  if (t === undefined) throw new Error("empty race");
  const r = clamp(row, 0, model.rows);
  const alt = altitudeAt(t, r);
  const phase = phaseAt(t, r);
  const speedMms = speedAt(t, r);
  // pitch: bands per row of her altitude, a climb of a band in 3 rows is full nose up
  const rate =
    (altitudeAt(t, clamp(r + 1, 0, model.rows)) - altitudeAt(t, clamp(r - 1, 0, model.rows))) / 2;
  const pitch = clamp(rate / 0.3, -1, 1);
  const P = FLIGHT_PHASE;
  let fovKick = 0;
  if (phase === P.dive) fovKick = 1;
  else if (phase === P.surge) {
    // the surge fades from the dive's peak
    const dv = [...t.events].reverse().find((e) => e.kind === "dive" && e.tick + 1 <= r);
    const len = dv?.kind === "dive" ? Math.max(1, dv.surgeTicks) : 1;
    const age = dv ? r - (dv.tick + 1) : len;
    fovKick = 0.85 * clamp(1 - age / len, 0.3, 1);
  } else if (rowOf(t.boosting, r) !== 0) fovKick = 0.45;
  else if (phase === P.climb) fovKick = 0.2;
  const kmh = (speedMms * 3.6) / 1000;
  const speedFx = clamp(Math.max((kmh - 45) / 70, fovKick), 0, 1);
  return {
    lane: t.lane,
    posM: positionAt(t, r) / 1000,
    speedMms,
    alt,
    band: rowOf(t.band, r),
    phase,
    lateralM: lateralAt(model, t, r),
    eyeM: FPV_EYE_M + Math.max(0, alt) * FPV_BAND_M,
    pitch,
    fovKick,
    speedFx,
    impact: impactAt(t, r),
    finished: t.finishRow <= r,
  };
}

/** A rival she can see ahead. */
export type FpvRival = {
  lane: number;
  /** Metres ahead of her (> 0). */
  aheadM: number;
  lateralM: number;
  /** Altitude in bands (fractional) and her band. */
  alt: number;
  band: number;
  /** 0 inside, 1 outside (eased). */
  line: number;
  phase: FlightPhase;
};

/** The rivals ahead of `lane` within `rangeM`, the farthest first (the drawing order). */
export function fpvRivals(model: FlightModel, lane: number, row: number, rangeM = 160): FpvRival[] {
  const me = model.tracks[lane];
  if (me === undefined) return [];
  const r = clamp(row, 0, model.rows);
  const mine = positionAt(me, r) / 1000;
  const out: FpvRival[] = [];
  for (const t of model.tracks) {
    if (t.lane === lane) continue;
    const aheadM = positionAt(t, r) / 1000 - mine;
    if (aheadM <= 0.4 || aheadM > rangeM) continue;
    out.push({
      lane: t.lane,
      aheadM,
      lateralM: lateralAt(model, t, r),
      alt: altitudeAt(t, r),
      band: rowOf(t.band, r),
      line: lineAt(t, r),
      phase: phaseAt(t, r),
    });
  }
  return out.sort((a, b) => b.aheadM - a.aheadM || a.lane - b.lane);
}

/** A stretch of the track ahead, in metres from her (clipped to the view). */
export type FpvStretch = { type: SegmentType; fromM: number; toM: number; param: number };

/** The segments between her and `rangeM` ahead, nearest first, clipped to that window. */
export function fpvTrackAhead(geometry: RaceGeometry, posM: number, rangeM: number): FpvStretch[] {
  const out: FpvStretch[] = [];
  for (const s of geometry.segments) {
    const a = s.startMm / 1000 - posM;
    const b = s.endMm / 1000 - posM;
    if (b <= 0 || a >= rangeM) continue;
    out.push({ type: s.type, fromM: Math.max(0, a), toM: Math.min(rangeM, b), param: s.param });
  }
  return out;
}

/** The segment at `m` metres from the start (the last one past the end). */
export function segmentAt(geometry: RaceGeometry, m: number): RaceGeometry["segments"][number] {
  const mm = m * 1000;
  const segs = geometry.segments;
  for (const s of segs) if (mm >= s.startMm && mm < s.endMm) return s;
  const last = segs[segs.length - 1] ?? segs[0];
  if (last === undefined) throw new Error("no segments");
  return mm < 0 ? (segs[0] ?? last) : last;
}

/**
 * Curvature (1/m, + bends right) of the picture at `m`: Curvas bend at their radius (`param`, m)
 * scaled by FPV_CURVE_SCALE, one way then the other every FPV_CURVE_SWING_M; elsewhere straight.
 */
export function curvatureAt(geometry: RaceGeometry, m: number): number {
  const s = segmentAt(geometry, m);
  if (s.type !== "curves" || s.param <= 0) return 0;
  const k = geometry.segments.indexOf(s);
  const swing = Math.floor((m - s.startMm / 1000) / FPV_CURVE_SWING_M);
  const sign = (swing + k) % 2 === 0 ? 1 : -1;
  return (sign * FPV_CURVE_SCALE) / s.param;
}

/**
 * The ground's height (m) along the track, one value per metre from 0 to the finish: a Colina
 * climbs and a Bajada falls at its grade (`param` ‰) scaled by FPV_SLOPE_SCALE.
 */
export function groundProfile(geometry: RaceGeometry): Float32Array {
  const n = Math.ceil(geometry.lengthMm / 1000) + 2;
  const out = new Float32Array(n);
  let h = 0;
  for (let m = 1; m < n; m++) {
    const s = segmentAt(geometry, m - 0.5);
    const g = s.type === "climb" ? s.param : s.type === "descent" ? -s.param : 0;
    h += (g / 1000) * FPV_SLOPE_SCALE;
    out[m] = h;
  }
  return out;
}

/** The profile's height at `m` (linear between metres, flat past either end). */
export function groundAt(profile: Float32Array, m: number): number {
  const n = profile.length;
  if (n === 0) return 0;
  if (m <= 0) return profile[0] ?? 0;
  if (m >= n - 1) return profile[n - 1] ?? 0;
  const i = Math.floor(m);
  const a = profile[i] ?? 0;
  const b = profile[i + 1] ?? a;
  return a + (b - a) * (m - i);
}

/** The visor's numbers of runner `lane` at `row` (all from the log). */
export type FpvVisor = {
  kmh: number;
  /** The band she holds, and whether she is in a jump's arc. */
  band: number;
  jump: boolean;
  place: number;
  field: number;
  /** Metres to the finish (0 once there). */
  leftM: number;
  /** Body left, % of her hpMax. */
  hpPct: number;
  /** Her kick, % (null until the final decides it). */
  kickPct: number | null;
  finished: boolean;
};

export function fpvVisor(model: FlightModel, lane: number, row: number): FpvVisor {
  const t = model.tracks[lane] ?? model.tracks[0];
  if (t === undefined) throw new Error("empty race");
  const r = clamp(row, 0, model.rows);
  const kp = [...t.events].reverse().find((e) => e.kind === "sprintPlan" && e.tick <= r);
  return {
    kmh: Math.round((speedAt(t, r) * 3.6) / 1000),
    band: rowOf(t.band, r),
    jump: phaseAt(t, r) === FLIGHT_PHASE.jump,
    place: orderAt(model, r).indexOf(t.lane) + 1,
    field: model.tracks.length,
    leftM: Math.max(0, Math.round((model.lengthMm - positionAt(t, r)) / 1000)),
    hpPct: clamp(Math.round(hpAt(t, r) / 10), 0, 100),
    kickPct: kp?.kind === "sprintPlan" ? Math.min(100, Math.round((kp.kickPm ?? 1000) / 10)) : null,
    finished: t.finishRow <= r,
  };
}

/** Rows worth a look in first person: her first takeoff, her highest hold, a dive and the finish. */
export function fpvKeyRows(
  model: FlightModel,
  lane: number,
): { takeoff: number | null; high: number | null; dive: number | null; finish: number } {
  const t = model.tracks[lane];
  if (t === undefined) return { takeoff: null, high: null, dive: null, finish: model.rows };
  const tk = t.events.find((e) => e.kind === "takeoff");
  const P = FLIGHT_PHASE;
  let high: number | null = null;
  let best = 0;
  for (let r = 0; r <= model.rows; r++) {
    const b = t.band[r] ?? 0;
    if (b > best && t.phase[r] === P.hold) {
      best = b;
      high = r + 4;
    }
  }
  let dive: number | null = null;
  for (let r = 0; r <= model.rows; r++)
    if (t.phase[r] === P.dive) {
      dive = r + 1;
      break;
    }
  return {
    takeoff: tk ? tk.tick + 2 : null,
    high,
    dive,
    finish: t.finishRow,
  };
}
