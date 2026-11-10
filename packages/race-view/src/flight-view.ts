import { RACE_FRAME_FLAGS, type RaceEvent, type RaceLog } from "@falconess/schema";
import { altitudeBand } from "./altitude.js";

/**
 * The flight of a ruleset v3 race, tick by tick, for the side view of the web (the approved mock
 * of design7, `.work/design7/mock`): the band and the line of every runner at every tick, the
 * phase of her flight, the jumps, the ground thruster hops and her position, all read from the log
 * only. The log keeps one frame row per second, so the per-tick picture comes from the events,
 * which carry the exact ticks: a band is reached at `bandReached`, a descent runs from `diveStart`
 * to `touchdown` one band every `(touchdown − diveStart) / fromBand` ticks, a line changes at
 * `lineSwitch`, dirty air runs from `airDirty` on to off. Positions are the frame rows plus every
 * event's `posMm`. `flightTrackProblems` checks the rebuilt bands and lines against every frame
 * row's flags. Text-free: the web names everything.
 *
 * Time is in frame rows: row T is the state after tick T − 1, so an event of tick t shows from
 * row t + 1 (the frame rule of the log, 20.4).
 */

type Ev<K extends RaceEvent["kind"]> = Extract<RaceEvent, { kind: K }>;

/** Phase of a runner at a row: what her body is doing (the mock's poses). */
export const FLIGHT_PHASE = {
  ground: 0,
  climb: 1,
  hold: 2,
  dive: 3,
  jump: 4,
  surge: 5,
  stumble: 6,
  knocked: 7,
  falling: 8,
} as const;
export type FlightPhase = (typeof FLIGHT_PHASE)[keyof typeof FLIGHT_PHASE];

export type TakeoffStyle = Ev<"takeoff">["style"];

/** Fall ticks per band of each takeoff gesture, for the drawing of a descent the log only dates. */
const DOWN_TICKS: Record<TakeoffStyle, number> = {
  lance: 2,
  column: 3,
  ramp: 4,
  turbine: 3,
  neutral: 3,
};

/** Ground thruster hops (owner 2026-11-09): a hop lasts HOP_TICKS, the next waits HOP_GAP. */
export const HOP_TICKS = 9;
export const HOP_GAP = 12;
/** A frame interval counts as boosting when at least this share of its ticks boosted (‰). */
const HOP_DUTY_PM = 300;

export type FlightTrack = {
  lane: number;
  /** Her takeoff gesture: the style of her first takeoff, else her ledger's. */
  style: TakeoffStyle;
  /** Rows 0..T: band 0-3, line 0 inside / 1 outside, dirty air 0/1, phase. */
  band: Uint8Array;
  line: Uint8Array;
  dirty: Uint8Array;
  drafting: Uint8Array;
  boosting: Uint8Array;
  phase: Uint8Array;
  /** Altitude keyframes [row, band], the transitions as long as the log's climb and fall. */
  altKeys: [number, number][];
  /** Jump arcs [from row, to row] (jumpOk → landing with no takeoff in between). */
  jumps: [number, number][];
  /** Ground thruster hops [from row, to row]. */
  hops: [number, number][];
  /** Position keyframes: rows ascending, mm. */
  posRows: number[];
  posMm: number[];
  /** Speed keyframes: rows ascending, mm/s. */
  vRows: number[];
  vMms: number[];
  /** Energy keyframes (frame rows), me. */
  energyRows: number[];
  energy: number[];
  /** Body (hp) keyframes, ‰ of her hpMax. */
  hpRows: number[];
  hpPm: number[];
  /** Her events in log order. */
  events: RaceEvent[];
  finishRow: number;
  place: number;
};

export type FlightModel = {
  /** Last row (the log's ticks). */
  rows: number;
  lengthMm: number;
  finalStartMm: number;
  tracks: FlightTrack[];
};

/** A v3 log: one with flight events, or a ruleset that names v3. */
export function isFlightLog(log: RaceLog): boolean {
  if (log.rulesetVersion.startsWith("v3")) return true;
  return (log.events ?? []).some((e) => e.kind === "takeoff");
}

/** Keyframes merged: rows ascending, the later value wins on a shared row. */
function keyframes(pairs: [number, number][]): { rows: number[]; values: number[] } {
  pairs.sort((a, b) => a[0] - b[0]);
  const rows: number[] = [];
  const values: number[] = [];
  for (const [r, v] of pairs) {
    if (rows.length > 0 && rows[rows.length - 1] === r) values[values.length - 1] = v;
    else {
      rows.push(r);
      values.push(v);
    }
  }
  return { rows, values };
}

/** Linear sample of keyframes at a fractional row (clamped to the ends). */
export function sampleKeys(rows: readonly number[], values: readonly number[], at: number): number {
  const n = rows.length;
  if (n === 0) return 0;
  if (at <= (rows[0] ?? 0)) return values[0] ?? 0;
  if (at >= (rows[n - 1] ?? 0)) return values[n - 1] ?? 0;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if ((rows[m] ?? 0) <= at) lo = m;
    else hi = m;
  }
  const r0 = rows[lo] ?? 0;
  const r1 = rows[hi] ?? 0;
  const v0 = values[lo] ?? 0;
  const v1 = values[hi] ?? 0;
  return r1 <= r0 ? v1 : v0 + ((v1 - v0) * (at - r0)) / (r1 - r0);
}

/** The bands of one lane at every row, from her events. */
function bandsOf(events: readonly RaceEvent[], rows: number, style: TakeoffStyle): Uint8Array {
  const band = new Uint8Array(rows + 1);
  // set points: [row, band], applied in order; a descent sets one point per band
  const set: [number, number][] = [];
  let diveStart: Ev<"diveStart"> | null = null;
  for (const e of events) {
    switch (e.kind) {
      case "jumpOk":
        set.push([e.tick + 1, 1]);
        break;
      case "landing":
        set.push([e.tick + 1, 0]);
        break;
      case "bandReached":
        set.push([e.tick + 1, e.band]);
        break;
      case "lineChange":
        // knocked down: she sinks one band at her wings' fall
        if (e.cause === "knock") set.push([e.tick + 1 + DOWN_TICKS[style], e.toBand]);
        break;
      case "diveStart":
        diveStart = e;
        break;
      case "touchdown": {
        const d = diveStart;
        if (d !== null && d.tick <= e.tick && e.tick > d.tick) {
          const per = (e.tick - d.tick) / d.fromBand;
          for (let k = 1; k < d.fromBand; k++)
            set.push([d.tick + 1 + Math.round(per * k), d.fromBand - k]);
        }
        set.push([e.tick + 1, 0]);
        diveStart = null;
        break;
      }
      default:
        break;
    }
  }
  set.sort((a, b) => a[0] - b[0]);
  let cur = 0;
  let k = 0;
  for (let r = 0; r <= rows; r++) {
    while (k < set.length && (set[k]?.[0] ?? 0) <= r) cur = set[k++]?.[1] ?? cur;
    band[r] = cur;
  }
  return band;
}

/** The line (0 inside, 1 outside) at every row: `lineSwitch` in the air, inside on the ground. */
function linesOf(events: readonly RaceEvent[], band: Uint8Array, rows: number): Uint8Array {
  const line = new Uint8Array(rows + 1);
  const sw = events.filter((e): e is Ev<"lineSwitch"> => e.kind === "lineSwitch");
  let k = 0;
  let cur = 0;
  for (let r = 0; r <= rows; r++) {
    while (k < sw.length && (sw[k]?.tick ?? 0) + 1 <= r) cur = sw[k++]?.to ?? cur;
    if ((band[r] ?? 0) === 0) cur = 0;
    line[r] = cur;
  }
  return line;
}

/** Dirty air at every row, from `airDirty` on to off. */
function dirtyOf(events: readonly RaceEvent[], band: Uint8Array, rows: number): Uint8Array {
  const dirty = new Uint8Array(rows + 1);
  let on = -1;
  const close = (to: number) => {
    for (let r = Math.max(0, on); r < Math.min(rows + 1, to); r++) dirty[r] = 1;
  };
  for (const e of events) {
    if (e.kind !== "airDirty") continue;
    if (e.on && on < 0) on = e.tick + 1;
    else if (!e.on && on >= 0) {
      close(e.tick + 1);
      on = -1;
    }
  }
  if (on >= 0) close(rows + 1);
  for (let r = 0; r <= rows; r++) if ((band[r] ?? 0) === 0) dirty[r] = 0;
  return dirty;
}

/** A frame column stepped to every row (the value of the latest row at or before it). */
function stepColumn(
  ticks: readonly number[],
  col: readonly number[],
  rows: number,
  f: (v: number) => number,
): Uint8Array {
  const out = new Uint8Array(rows + 1);
  let j = 0;
  for (let r = 0; r <= rows; r++) {
    while (j + 1 < ticks.length && (ticks[j + 1] ?? 0) <= r) j++;
    out[r] = f(col[j] ?? 0);
  }
  return out;
}

/**
 * Boosting at every row from the frame `boost` column (the on-ticks since the previous row): an
 * interval counts as boosting when its duty is at least HOP_DUTY_PM.
 */
function boostingOf(ticks: readonly number[], boost: readonly number[], rows: number): Uint8Array {
  const out = new Uint8Array(rows + 1);
  for (let j = 1; j < ticks.length; j++) {
    const a = ticks[j - 1] ?? 0;
    const b = ticks[j] ?? 0;
    const on = boost[j] ?? 0;
    if (b <= a || on * 1000 < HOP_DUTY_PM * (b - a)) continue;
    for (let r = a + 1; r <= b && r <= rows; r++) out[r] = 1;
  }
  return out;
}

/** Build the per-row flight of every runner of a v3 log (null without frames or events). */
export function flightModel(log: RaceLog): FlightModel | null {
  const fr = log.frames;
  if (fr === undefined || log.events === undefined || fr.tick.length === 0) return null;
  const rows = log.ticks;
  const byLane: RaceEvent[][] = log.entries.map(() => []);
  for (const e of log.events) byLane[e.lane]?.push(e);
  const placeOf = new Map(log.results.map((r) => [r.lane, r.place]));
  const tracks = log.entries.map((_entry, lane): FlightTrack => {
    const ev = byLane[lane] ?? [];
    const col = fr.runners[lane];
    const hpMax = Math.max(1, log.derived[lane]?.hpMax ?? 1);
    const takeoffs = ev.filter((e): e is Ev<"takeoff"> => e.kind === "takeoff");
    const style: TakeoffStyle =
      takeoffs[0]?.style ??
      log.results.find((r) => r.lane === lane)?.ledger.flight?.style ??
      "neutral";
    const band = bandsOf(ev, rows, style);
    const line = linesOf(ev, band, rows);
    const dirty = dirtyOf(ev, band, rows);
    const drafting = stepColumn(fr.tick, col?.flags ?? [], rows, (f) =>
      (f & RACE_FRAME_FLAGS.drafting) !== 0 ? 1 : 0,
    );
    const boosting = boostingOf(fr.tick, col?.boost ?? [], rows);

    // altitude keyframes: each band change, the transition as long as the log's climb or fall
    const knocks = ev
      .filter((e) => e.kind === "lineChange" && e.cause === "knock")
      .map((e) => e.tick);
    const climbAt = (r: number) => {
      let c = 4;
      for (const e of takeoffs) {
        if (e.tick < r) c = e.climbTicks;
        else break;
      }
      return c;
    };
    const altKeys: [number, number][] = [[0, band[0] ?? 0]];
    let last = 0;
    let prev = band[0] ?? 0;
    for (let r = 1; r <= rows; r++) {
      const b = band[r] ?? 0;
      if (b === prev) continue;
      const up = b > prev;
      let w = up
        ? climbAt(r)
        : knocks.some((q) => r - q >= 0 && r - q <= 8)
          ? 5
          : DOWN_TICKS[style];
      // the log's own descent already steps one band at a time
      if (!up) w = Math.min(w, 4);
      const s0 = Math.max(last, r - w);
      if (s0 > last) altKeys.push([s0, prev]);
      altKeys.push([r, b]);
      last = r;
      prev = b;
    }
    altKeys.push([rows, prev]);

    // jumps: jumpOk → landing with no takeoff in between (an arc, not a band)
    const jumps: [number, number][] = [];
    for (const j of ev) {
      if (j.kind !== "jumpOk") continue;
      const land = ev.find((e) => e.kind === "landing" && e.tick > j.tick);
      if (land === undefined || land.tick - j.tick > 90) continue;
      if (takeoffs.some((e) => e.tick >= j.tick && e.tick <= land.tick)) continue;
      jumps.push([j.tick + 1, land.tick + 1]);
    }

    // phases
    const P = new Uint8Array(rows + 1);
    const F = FLIGHT_PHASE;
    const paint = (a: number, b: number, ph: number, onlyGround = false) => {
      for (let r = Math.max(0, a); r <= b && r <= rows; r++)
        if (!onlyGround || (band[r] ?? 0) === 0) P[r] = ph;
    };
    for (let r = 0; r <= rows; r++) if ((band[r] ?? 0) > 0) P[r] = F.hold;
    for (const [a, b] of jumps) paint(a, b, F.jump);
    for (const e of ev) {
      if (e.kind === "takeoff") {
        const br = ev.filter(
          (q) =>
            q.kind === "bandReached" &&
            q.tick >= e.tick &&
            q.tick <= e.tick + e.climbTicks * (e.band - e.fromBand) + 2,
        );
        const end = (br[br.length - 1]?.tick ?? e.tick + e.climbTicks * (e.band - e.fromBand)) + 1;
        paint(e.tick + 1, end, F.climb);
      } else if (e.kind === "lineChange" && e.cause === "over") {
        const br = ev.find((q) => q.kind === "bandReached" && q.tick > e.tick);
        paint(e.tick + 1, (br?.tick ?? e.tick + 6) + 1, F.climb);
      } else if (e.kind === "lineChange" && e.cause === "knock") {
        paint(e.tick + 1, e.tick + 7, F.knocked);
      } else if (e.kind === "diveStart") {
        const td = ev.find((q) => q.kind === "touchdown" && q.tick >= e.tick);
        const end = td ? td.tick : e.tick + 8;
        paint(e.tick + 1, end, e.cause === "plan" ? F.dive : F.falling);
      } else if (e.kind === "dive") {
        paint(e.tick + 1, e.tick + 1 + e.surgeTicks, F.surge, true);
      } else if (e.kind === "touchdown" && (e.cause !== "plan" || e.lossMms > 0)) {
        paint(e.tick + 1, e.tick + 13, F.stumble, true);
      }
    }

    // ground thruster hops: only on a boosting ground row, grouped, never closer than HOP_GAP
    const hops: [number, number][] = [];
    let nextHop = 0;
    for (let r = 0; r <= rows; r++) {
      if (r < nextHop || (boosting[r] ?? 0) === 0 || (band[r] ?? 0) !== 0 || (P[r] ?? 0) !== 0)
        continue;
      let ok = true;
      for (let u = r; u < r + HOP_TICKS; u++)
        if (u > rows || (band[u] ?? 0) !== 0 || (P[u] ?? 0) !== 0) {
          ok = false;
          break;
        }
      if (!ok) continue;
      hops.push([r, r + HOP_TICKS]);
      nextHop = r + HOP_GAP;
    }

    // keyframes: the frame rows, then the exact numbers events carry
    const pos: [number, number][] = [];
    const v: [number, number][] = [];
    const en: [number, number][] = [];
    const hp: [number, number][] = [];
    fr.tick.forEach((t, j) => {
      pos.push([t, col?.posMm[j] ?? 0]);
      v.push([t, col?.vMms[j] ?? 0]);
      en.push([t, col?.energy[j] ?? 0]);
      hp.push([t, Math.round(((col?.hp[j] ?? 0) * 1000) / hpMax)]);
    });
    const finish = ev.find((e) => e.kind === "finish");
    for (const e of ev) {
      // an event's position is the runner's at the end of its tick: row tick + 1
      if (finish === undefined || e.tick <= finish.tick) pos.push([e.tick + 1, e.posMm]);
      if (e.kind === "hpHit") {
        hp.push([e.tick, Math.round(((e.hp + e.hpLeft) * 1000) / hpMax)]);
        hp.push([e.tick + 1, Math.round((e.hpLeft * 1000) / hpMax)]);
      } else if (e.kind === "dive") v.push([e.tick + 1, e.vBeforeMms + e.gainMms]);
      else if (e.kind === "diveStart") v.push([e.tick + 1, e.vMms]);
      else if (e.kind === "takeoff") v.push([e.tick + 1, e.vAfterMms]);
    }
    const P0 = keyframes(pos);
    // a position never goes back (rounding between a frame row and an event of the same row)
    for (let j = 1; j < P0.values.length; j++)
      P0.values[j] = Math.max(P0.values[j] ?? 0, P0.values[j - 1] ?? 0);
    const V0 = keyframes(v);
    const E0 = keyframes(en);
    const H0 = keyframes(hp);
    return {
      lane,
      style,
      band,
      line,
      dirty,
      drafting,
      boosting,
      phase: P,
      altKeys,
      jumps,
      hops,
      posRows: P0.rows,
      posMm: P0.values,
      vRows: V0.rows,
      vMms: V0.values,
      energyRows: E0.rows,
      energy: E0.values,
      hpRows: H0.rows,
      hpPm: H0.values,
      events: ev,
      finishRow: finish ? finish.tick + 1 : rows,
      place: placeOf.get(lane) ?? log.entries.length,
    };
  });
  return {
    rows,
    lengthMm: log.geometry.lengthMm,
    finalStartMm: log.geometry.finalStartMm,
    tracks,
  };
}

/**
 * Where the rebuilt bands and lines disagree with the frame rows' flags (LOG-1 for the view):
 * `lane:row band b≠f` or `lane:row line`. Empty when the per-tick picture matches the log.
 */
export function flightTrackProblems(log: RaceLog, model: FlightModel): string[] {
  const out: string[] = [];
  const fr = log.frames;
  if (fr === undefined) return out;
  for (const t of model.tracks) {
    const flags = fr.runners[t.lane]?.flags ?? [];
    fr.tick.forEach((row, j) => {
      const f = flags[j] ?? 0;
      const b = altitudeBand(f);
      // a jump shows as the low band in the flags; the view draws it as an arc
      const inJump = t.jumps.some(([a, z]) => row >= a && row < z);
      if (!inJump && b !== t.band[row]) out.push(`${t.lane}:${row} band ${t.band[row]}≠${b}`);
      const l = (f & RACE_FRAME_FLAGS.lineOut) !== 0 ? 1 : 0;
      if (b > 0 && l !== t.line[row]) out.push(`${t.lane}:${row} line ${t.line[row]}≠${l}`);
    });
  }
  return out;
}

// --- sampling -------------------------------------------------------------------------------

export function positionAt(t: FlightTrack, row: number): number {
  return sampleKeys(t.posRows, t.posMm, row);
}
export function speedAt(t: FlightTrack, row: number): number {
  return sampleKeys(t.vRows, t.vMms, row);
}
export function energyAt(t: FlightTrack, row: number): number {
  return sampleKeys(t.energyRows, t.energy, row);
}
export function hpAt(t: FlightTrack, row: number): number {
  return sampleKeys(t.hpRows, t.hpPm, row);
}
/** The value of a per-row column at a fractional row. */
export function rowOf(a: Uint8Array, row: number): number {
  return a[Math.max(0, Math.min(a.length - 1, Math.floor(row)))] ?? 0;
}
export function phaseAt(t: FlightTrack, row: number): FlightPhase {
  return rowOf(t.phase, row) as FlightPhase;
}

/** Progress 0..1 of the thruster hop at `row`, −1 when none. */
export function hopAt(t: FlightTrack, row: number): number {
  for (const [a, b] of t.hops) {
    if (row < a) return -1;
    if (row <= b) return (row - a) / (b - a);
  }
  return -1;
}

const smooth = (f: number) => f * f * (3 - 2 * f);

/** Her altitude in bands (fractional) at `row`: a jump is an arc of one band. */
export function altitudeAt(t: FlightTrack, row: number): number {
  for (const [a, b] of t.jumps)
    if (row >= a && row <= b) {
      const s = (row - a) / (b - a);
      return 4 * s * (1 - s);
    }
  const K = t.altKeys;
  let lo = 0;
  let hi = K.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if ((K[m]?.[0] ?? 0) <= row) lo = m;
    else hi = m;
  }
  const [t0, a0] = K[lo] ?? [0, 0];
  const [t1, a1] = K[hi] ?? [0, 0];
  if (t1 <= t0) return a1;
  let f = Math.max(0, Math.min(1, (row - t0) / (t1 - t0)));
  if (a1 > a0 && t.style === "column") f = smooth(f);
  else if (a1 < a0) f = f * f * 0.35 + f * 0.65; // the fall accelerates a little
  return a0 + (a1 - a0) * f;
}

/** Her line (0 inside .. 1 outside), eased over the four ticks of a lateral move. */
export function lineAt(t: FlightTrack, row: number): number {
  const r0 = Math.max(0, Math.min(t.line.length - 1, Math.floor(row)));
  // walk back up to 4 rows to ease the move
  const want = t.line[r0] ?? 0;
  let k = 0;
  while (k < 4 && r0 - k - 1 >= 0 && (t.line[r0 - k - 1] ?? 0) === want) k++;
  if (k >= 4 || (t.band[r0] ?? 0) === 0) return want;
  const from = t.line[r0 - k - 1] ?? want;
  const f = Math.min(1, (k + 1 + (row - r0)) / 4);
  return from + (want - from) * f;
}

/** Lanes in race order at `row`: the finished first (by finish row), then by position. */
export function orderAt(model: FlightModel, row: number): number[] {
  return model.tracks
    .map((t) => {
      const done = t.finishRow <= row;
      return { lane: t.lane, done, k: done ? -t.finishRow : positionAt(t, row) };
    })
    .sort((a, b) => (a.done !== b.done ? (a.done ? -1 : 1) : b.k - a.k || a.lane - b.lane))
    .map((x) => x.lane);
}
