/**
 * The race at any instant, read from the RaceLog frames for the replay. Presentation only: between
 * two sampled rows positions and gauges are interpolated linearly (the log samples every second,
 * every tick in the first second and in the last 25 m), flags come from the row that covers the
 * instant, and a runner has finished once the clock passes her logged `finishMilli`. Nothing here
 * recomputes physics.
 */
import { overheatSpans } from "@falconess/race-view";
import { RACE_FRAME_FLAGS, type RaceLog } from "@falconess/schema";

/** The flags a runner can show on the track, highest precedence first. */
export const RUNNER_FLAGS = [
  "stalled",
  "broken",
  "airborne",
  "overheated",
  "exhausted",
  "pulse",
  "boost",
  "drafting",
] as const;
export type RunnerFlag = (typeof RUNNER_FLAGS)[number];

export type RunnerSample = {
  readonly lane: number;
  /** mm from the start, never past the line. */
  readonly posMm: number;
  readonly vMms: number;
  /** milli-hp */
  readonly hp: number;
  /** milli-units */
  readonly energy: number;
  readonly heat: number;
  readonly durability: number;
  /** Flag bits (20.4) of the row that covers the instant. */
  readonly bits: number;
  /** Boost on-ticks of that row over the ticks it covers, 0..1. */
  readonly boostDuty: number;
  /** What to draw on the runner. */
  readonly flags: ReadonlySet<RunnerFlag>;
  readonly finished: boolean;
};

/** Index of the last row whose tick is at or before `t` (0 when `t` precedes every row). */
export function rowAtOrBefore(ticks: readonly number[], t: number): number {
  let lo = 0;
  let hi = ticks.length - 1;
  if (hi < 0 || t <= (ticks[0] ?? 0)) return 0;
  if (t >= (ticks[hi] ?? 0)) return hi;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if ((ticks[mid] ?? 0) <= t) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Index of the first row whose tick is at or after `t` (the row that covers the instant). */
export function rowCovering(ticks: readonly number[], t: number): number {
  const i = rowAtOrBefore(ticks, t);
  return (ticks[i] ?? 0) >= t || i === ticks.length - 1 ? i : i + 1;
}

/** `a + (b − a) × f`. */
function lerp(a: number, b: number, f: number): number {
  return a + (b - a) * f;
}

/** Overheat spans per lane, from the events (a short span can fall between two sampled rows). */
export function overheatByLane(log: RaceLog): [number, number][][] {
  return log.entries.map((e) => overheatSpans(log.events ?? [], e.laneIndex, log.ticks));
}

function flagsOf(bits: number, boostDuty: number, hot: boolean): Set<RunnerFlag> {
  const F = RACE_FRAME_FLAGS;
  const out = new Set<RunnerFlag>();
  if (bits & F.stalled) out.add("stalled");
  if (bits & F.broken) out.add("broken");
  if (bits & F.airborne) out.add("airborne");
  if (hot || bits & F.overheated) out.add("overheated");
  if (bits & F.exhausted) out.add("exhausted");
  if (bits & F.pulseBurst) out.add("pulse");
  if (boostDuty >= 0.5 || bits & F.boosting) out.add("boost");
  if (bits & F.drafting) out.add("drafting");
  return out;
}

/**
 * Every runner at race time `t` (ticks, fractional), in lane order. Empty without frames
 * (detail "results"). `spans` is `overheatByLane(log)`, computed once per log.
 */
export function sampleAt(
  log: RaceLog,
  t: number,
  spans: readonly (readonly [number, number][])[] = overheatByLane(log),
): RunnerSample[] {
  const frames = log.frames;
  if (!frames) return [];
  const ticks = frames.tick;
  const i = rowAtOrBefore(ticks, t);
  const j = Math.min(i + 1, ticks.length - 1);
  const t0 = ticks[i] ?? 0;
  const t1 = ticks[j] ?? 0;
  const f = t1 > t0 ? Math.max(0, Math.min(1, (t - t0) / (t1 - t0))) : 0;
  const k = rowCovering(ticks, t);
  const covered = (ticks[k] ?? 0) - (ticks[k - 1] ?? 0);
  const L = log.geometry.lengthMm;
  const finishMilli = new Map(log.results.map((r) => [r.lane, r.finishMilli]));
  return frames.runners.map((col, lane) => {
    const at = (c: readonly number[]) => lerp(c[i] ?? 0, c[j] ?? 0, f);
    const fm = finishMilli.get(lane);
    const finished = fm !== null && fm !== undefined && t * 1000 >= fm;
    const bits = col.flags[k] ?? 0;
    const boostDuty = covered > 0 ? Math.min(1, (col.boost[k] ?? 0) / covered) : 0;
    const hot = (spans[lane] ?? []).some(([on, off]) => t > on && t <= off);
    return {
      lane,
      posMm: finished ? L : Math.min(L, at(col.posMm)),
      vMms: at(col.vMms),
      hp: at(col.hp),
      energy: at(col.energy),
      heat: at(col.heat),
      durability: at(col.durability),
      bits,
      boostDuty,
      flags: finished ? new Set<RunnerFlag>() : flagsOf(bits, boostDuty, hot),
      finished,
    };
  });
}

export type Standing = {
  readonly sample: RunnerSample;
  /** 1 = in front. */
  readonly order: number;
  /** Metres behind the runner in front of the race, in mm (0 for her); null once finished. */
  readonly gapMm: number | null;
  /** Milli-ticks behind the winner at the line, once finished; null before. */
  readonly behindMilli: number | null;
};

/**
 * The order at the instant: finishers by their logged place, then the others by position (lane
 * on a tie). Gaps are distances to whoever is furthest along.
 */
export function standings(log: RaceLog, samples: readonly RunnerSample[]): Standing[] {
  const placeOf = new Map(log.results.map((r) => [r.lane, r.place]));
  const finishOf = new Map(log.results.map((r) => [r.lane, r.finishMilli]));
  const winnerMilli = log.results[0]?.finishMilli ?? null;
  const sorted = [...samples].sort((a, b) => {
    if (a.finished && b.finished) return (placeOf.get(a.lane) ?? 9) - (placeOf.get(b.lane) ?? 9);
    if (a.finished !== b.finished) return a.finished ? -1 : 1;
    return b.posMm - a.posMm || a.lane - b.lane;
  });
  const front = sorted.reduce((m, s) => Math.max(m, s.posMm), 0);
  return sorted.map((sample, k) => {
    const fm = finishOf.get(sample.lane) ?? null;
    return {
      sample,
      order: k + 1,
      gapMm: sample.finished ? null : front - sample.posMm,
      behindMilli: sample.finished && fm !== null && winnerMilli !== null ? fm - winnerMilli : null,
    };
  });
}

/** The replay's length in ticks: until the last runner crossed (or the race stopped). */
export function replayEnd(log: RaceLog): number {
  return Math.max(1, log.ticks);
}
