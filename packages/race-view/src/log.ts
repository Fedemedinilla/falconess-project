/**
 * Lookups over a RaceLog that every reader of a race needs (docs/race-engine.md section 20). They
 * read the log only and never recompute physics: crossing times interpolate the sampled frames,
 * spans pair the log's own events. Integer arithmetic throughout, so every reader prints the same
 * digits.
 */
import type {
  RaceEntry,
  RaceEvent,
  RaceGeometry,
  RaceLog,
  RaceResult,
  RunnerDerived,
  SegmentType,
} from "@falconess/schema";

/** Ticks per second of engine v1 (`RaceLog.tickHz`). */
export const TICK_HZ = 15;

/** Segment types in schema order: legends list the types of a course in this order. */
export const SEGMENT_ORDER: readonly SegmentType[] = [
  "flat",
  "climb",
  "descent",
  "jump",
  "water",
  "canyon",
  "curves",
];

/** Race phases by index (`phaseTicks`, `cruiseMms`, `pace`): start, middle, final. */
export const PHASES = ["start", "middle", "final"] as const;
export type PhaseName = (typeof PHASES)[number];

/** Integer division rounded half up (both operands non-negative). */
export function roundDiv(num: number, den: number): number {
  return Math.floor((2 * num + den) / (2 * den));
}

/** One runner as the views see her: entry, explanation row and result. */
export type Runner = {
  readonly entry: RaceEntry;
  readonly derived: RunnerDerived | undefined;
  readonly result: RaceResult;
};

/** The runners in place order (the order of `results`). */
export function runnersInPlaceOrder(log: RaceLog): Runner[] {
  const entryByLane = new Map(log.entries.map((e) => [e.laneIndex, e]));
  const derivedByLane = new Map(log.derived.map((d) => [d.lane, d]));
  return log.results.map((result) => {
    const entry = entryByLane.get(result.lane);
    if (!entry) throw new Error(`RaceLog has a result for lane ${result.lane} but no entry`);
    return { entry, derived: derivedByLane.get(result.lane), result };
  });
}

/** The phase of a position (section 2): a runner on a boundary belongs to the later phase. */
export function phaseIndexAt(geometry: RaceGeometry, mm: number): 0 | 1 | 2 {
  if (mm < geometry.startEndMm) return 0;
  if (mm < geometry.finalStartMm) return 1;
  return 2;
}

/**
 * Milli-ticks at which the runner crossed 10 %, 20 % … 100 % of the course: linear interpolation
 * between the two sampled frame rows around each mark; the 100 % mark is the log's exact
 * `finishMilli`. `null` for a mark the runner never reached (DNF). Empty without frames.
 */
export function crossingMilliTicks(log: RaceLog, lane: number): (number | null)[] {
  const frames = log.frames;
  const pos = frames?.runners[lane]?.posMm;
  if (!frames || !pos) return [];
  const result = log.results.find((r) => r.lane === lane);
  const out: (number | null)[] = [];
  for (let k = 1; k <= 10; k++) {
    if (k === 10 && result && result.finishMilli !== null) {
      out.push(result.finishMilli);
      continue;
    }
    const mark = Math.floor((k * log.geometry.lengthMm) / 10);
    const i = pos.findIndex((p) => p >= mark);
    const t1 = frames.tick[i];
    const p1 = pos[i];
    if (i < 0 || t1 === undefined || p1 === undefined) {
      out.push(null);
      continue;
    }
    const t0 = frames.tick[i - 1];
    const p0 = pos[i - 1];
    if (i === 0 || t0 === undefined || p0 === undefined || p1 === p0) {
      out.push(t1 * 1000);
      continue;
    }
    out.push(roundDiv(1000 * (t0 * (p1 - p0) + (mark - p0) * (t1 - t0)), p1 - p0));
  }
  return out;
}

/** Overheat spans `[onTick, offTick)` of one runner, from the `overheat` events. */
export function overheatSpans(
  events: readonly RaceEvent[],
  lane: number,
  endTick: number,
): [number, number][] {
  const spans: [number, number][] = [];
  let on: number | null = null;
  for (const e of events) {
    if (e.lane !== lane || e.kind !== "overheat") continue;
    if (e.on && on === null) on = e.tick;
    else if (!e.on && on !== null) {
      spans.push([on, e.tick]);
      on = null;
    }
  }
  if (on !== null) spans.push([on, endTick]);
  return spans;
}

/** The segment types a course has, in `SEGMENT_ORDER` (for a legend). */
export function segmentTypesPresent(geometry: RaceGeometry): SegmentType[] {
  return SEGMENT_ORDER.filter((t) => geometry.segments.some((s) => s.type === t));
}
