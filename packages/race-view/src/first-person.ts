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
export const FPV_BAND_M = 5;
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
  /** Metres ahead of her (> 0; ≤ 0 beside or behind her when asked for). */
  aheadM: number;
  lateralM: number;
  /** Altitude in bands (fractional) and her band. */
  alt: number;
  band: number;
  /** 0 inside, 1 outside (eased). */
  line: number;
  phase: FlightPhase;
  /** 1 while she races, fading to 0 over FPV_FINISHED_ROWS once she crossed the line. */
  presence: number;
};

/** Rows a rival who finished stays in view (her position stops at the line in the log). */
export const FPV_FINISHED_ROWS = 15;

/**
 * The rivals ahead of `lane` within `rangeM`, the farthest first (the drawing order). With
 * `backM` > 0 (she looks around) also those beside her and up to `backM` behind (`aheadM` ≤ 0).
 */
export function fpvRivals(
  model: FlightModel,
  lane: number,
  row: number,
  rangeM = 160,
  backM = 0,
): FpvRival[] {
  const me = model.tracks[lane];
  if (me === undefined) return [];
  const r = clamp(row, 0, model.rows);
  const mine = positionAt(me, r) / 1000;
  const out: FpvRival[] = [];
  for (const t of model.tracks) {
    if (t.lane === lane) continue;
    const aheadM = positionAt(t, r) / 1000 - mine;
    if (aheadM > rangeM || (backM > 0 ? aheadM < -backM : aheadM <= 0.4)) continue;
    const presence = clamp(1 - (r - t.finishRow) / FPV_FINISHED_ROWS, 0, 1);
    if (presence <= 0) continue;
    out.push({
      lane: t.lane,
      aheadM,
      lateralM: lateralAt(model, t, r),
      alt: altitudeAt(t, r),
      band: rowOf(t.band, r),
      line: lineAt(t, r),
      phase: phaseAt(t, r),
      presence,
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
  /** What her body is doing (the side view's phases). */
  phase: FlightPhase;
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
    phase: phaseAt(t, r),
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

// --- looking around (2026-11-10) --------------------------------------------------------------------
// The player turns her head by dragging on the view: to the sides and a little backwards (her
// neck stops at ±FPV_LOOK_YAW_MAX_DEG), a little up and down. After FPV_LOOK_IDLE_MS without a
// touch her eyes ease back to the track over FPV_LOOK_RETURN_MS. Only the camera turns: the race
// and its numbers do not depend on it.

/** Her neck's reach: yaw (+ right) and pitch (+ up), degrees. */
export const FPV_LOOK_YAW_MAX_DEG = 110;
export const FPV_LOOK_PITCH_MAX_DEG = 15;
/** A drag across the whole view turns her head this many degrees. */
export const FPV_LOOK_DRAG_DEG = 180;
/** Untouched this long, her eyes ease back to the track over FPV_LOOK_RETURN_MS. */
export const FPV_LOOK_IDLE_MS = 5000;
export const FPV_LOOK_RETURN_MS = 1500;
/** The spin a flick leaves fades by this factor per second, and stops below FPV_LOOK_STOP_DEG_S. */
export const FPV_LOOK_FRICTION = 5;
export const FPV_LOOK_STOP_DEG_S = 4;

/** Where she looks, degrees: yaw + right of the track, pitch + up. */
export type FpvLook = { yaw: number; pitch: number };

/** The look within her neck's reach. */
export function clampLook(l: FpvLook): FpvLook {
  return {
    yaw: clamp(l.yaw, -FPV_LOOK_YAW_MAX_DEG, FPV_LOOK_YAW_MAX_DEG),
    pitch: clamp(l.pitch, -FPV_LOOK_PITCH_MAX_DEG, FPV_LOOK_PITCH_MAX_DEG),
  };
}

/**
 * The look after dragging (dx, dy) px from `from` on a view `widthPx` wide. The finger drags the
 * world: a drag to the left turns her head to the right, a drag down lifts her eyes.
 */
export function lookDrag(from: FpvLook, dxPx: number, dyPx: number, widthPx: number): FpvLook {
  const k = FPV_LOOK_DRAG_DEG / Math.max(1, widthPx);
  return clampLook({ yaw: from.yaw - dxPx * k, pitch: from.pitch + dyPx * k });
}

/** A smooth ease in and out of [0, 1] (smootherstep). */
export function lookEase(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/** The look `ms` into the return to the track from `from` (instant when `returnMs` ≤ 0). */
export function lookReturn(from: FpvLook, ms: number, returnMs = FPV_LOOK_RETURN_MS): FpvLook {
  const k = returnMs <= 0 ? 1 : lookEase(ms / returnMs);
  return { yaw: from.yaw * (1 - k), pitch: from.pitch * (1 - k) };
}

/** Her head's state between frames: the look, a flick's spin (deg/s), a drag and the clocks (ms). */
export type FpvLookState = FpvLook & {
  spin: number;
  drag: { x: number; y: number; from: FpvLook; at: number } | null;
  /** When the last touch ended (null: never touched, or back on the track). */
  releasedAt: number | null;
  /** The return to the track under way: where it started and when. */
  back: { from: FpvLook; at: number } | null;
};

export const FPV_LOOK_REST: FpvLookState = {
  yaw: 0,
  pitch: 0,
  spin: 0,
  drag: null,
  releasedAt: null,
  back: null,
};

/** A finger or the mouse goes down at (x, y) at `now` ms: no more spin, no return home. */
export function lookPress(s: FpvLookState, x: number, y: number, now: number): FpvLookState {
  return {
    ...s,
    spin: 0,
    drag: { x, y, from: { yaw: s.yaw, pitch: s.pitch }, at: now },
    back: null,
  };
}

/** It moves to (x, y): the look follows the drag; the spin is the latest yaw speed (deg/s). */
export function lookMove(
  s: FpvLookState,
  x: number,
  y: number,
  now: number,
  widthPx: number,
): FpvLookState {
  if (s.drag === null) return s;
  const l = lookDrag(s.drag.from, x - s.drag.x, y - s.drag.y, widthPx);
  const dt = (now - (s.drag.at ?? now)) / 1000;
  const v = dt > 0 ? (l.yaw - s.yaw) / dt : s.spin;
  const spin = dt > 0 ? s.spin * 0.4 + v * 0.6 : s.spin;
  return {
    ...s,
    ...l,
    spin,
    drag: { ...s.drag, at: now },
  };
}

/** It lifts at `now`: the idle clock starts; a flick keeps spinning unless motion is reduced. */
export function lookRelease(s: FpvLookState, now: number, reduced: boolean): FpvLookState {
  if (s.drag === null) return s;
  // a finger that stopped before lifting leaves no spin
  const still = now - s.drag.at > 80;
  return {
    ...s,
    drag: null,
    spin: reduced || still ? 0 : clamp(s.spin, -720, 720),
    releasedAt: now,
  };
}

/** One frame at `now` ms, `dt` s after the last: the spin fades, and the idle look goes home. */
export function lookTick(
  s: FpvLookState,
  now: number,
  dt: number,
  reduced: boolean,
  idleMs = FPV_LOOK_IDLE_MS,
  returnMs = FPV_LOOK_RETURN_MS,
): FpvLookState {
  if (s.drag !== null) return s;
  let out = s;
  if (s.spin !== 0 && s.back === null) {
    const yaw = clamp(s.yaw + s.spin * dt, -FPV_LOOK_YAW_MAX_DEG, FPV_LOOK_YAW_MAX_DEG);
    let spin = s.spin * Math.exp(-FPV_LOOK_FRICTION * dt);
    if (Math.abs(spin) < FPV_LOOK_STOP_DEG_S || Math.abs(yaw) >= FPV_LOOK_YAW_MAX_DEG) spin = 0;
    out = { ...out, yaw, spin };
  }
  if (out.releasedAt === null) return out;
  if (out.back === null) {
    if (now - out.releasedAt < idleMs) return out;
    if (out.yaw === 0 && out.pitch === 0) return { ...out, releasedAt: null, spin: 0 };
    out = { ...out, spin: 0, back: { from: { yaw: out.yaw, pitch: out.pitch }, at: now } };
  }
  const back = out.back;
  if (back === null) return out;
  const ms = now - back.at;
  const rm = reduced ? 0 : returnMs;
  if (ms >= rm) return { ...FPV_LOOK_REST };
  return { ...out, ...lookReturn(back.from, ms, rm) };
}

/**
 * A point of the camera's frame (x right, z ahead along her heading) seen by eyes turned `yawDeg`
 * (+ right): [x across the view, z into the view].
 */
export function lookRotate(x: number, z: number, yawDeg: number): [number, number] {
  const a = (yawDeg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [x * c - z * s, x * s + z * c];
}

/**
 * A polygon of points [x, y, z] (z into the view) cut to what lies at or beyond the near plane
 * `near` (Sutherland–Hodgman against one plane); empty when all of it is behind her eyes.
 */
export function clipNear(points: readonly (readonly [number, number, number])[], near: number) {
  const out: [number, number, number][] = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    if (a === undefined || b === undefined) continue;
    const ina = a[2] >= near;
    const inb = b[2] >= near;
    if (ina) out.push([a[0], a[1], a[2]]);
    if (ina !== inb) {
      const t = (near - a[2]) / (b[2] - a[2]);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, near]);
    }
  }
  return out;
}
