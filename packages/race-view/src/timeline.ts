/**
 * The race over time, one cell per time slice and runner (ROADMAP D14 timeline): what the runner
 * was doing in that slice, from the frame flags, the exact `boost` on-tick counts and the
 * `overheat` events. The CLI prints a cell as a character, the web as a colored block.
 */
import { RACE_FRAME_FLAGS, type RaceLog } from "@falconess/schema";
import { overheatSpans, TICK_HZ } from "./log.js";

/** States of a slice, highest precedence first. */
export const TIMELINE_CELLS = [
  "finish",
  "dnf",
  "stalled",
  "broken",
  "airborne",
  "overheated",
  "exhausted",
  "pulse",
  "boost",
  "lightBoost",
  "drafting",
  "normal",
  "after",
] as const;
export type TimelineCell = (typeof TIMELINE_CELLS)[number];

/** Seconds per column for at most `maxColumns` columns: whole seconds, aligned with sampling. */
export function secondsPerColumn(ticks: number, maxColumns: number): number {
  return Math.max(1, Math.ceil(Math.ceil(ticks / TICK_HZ) / maxColumns));
}

/** Columns of `seconds` seconds needed to cover the race. */
export function timelineColumns(log: RaceLog, seconds: number): number {
  return Math.max(1, Math.ceil(log.ticks / (seconds * TICK_HZ)));
}

/**
 * One cell per time slice of `seconds` seconds, from the frame rows whose tick falls in the slice
 * (or, between sparse rows, the next row, whose `boost` count covers the slice): flags OR-ed,
 * `boost` on-ticks summed against the ticks those rows cover ("boost" at least half of them,
 * "lightBoost" fewer, "pulse" any for a pulse frame). Overheat spans also come from the events,
 * because a short span can fall between two sampled rows. Empty without frames.
 */
export function timelineCells(log: RaceLog, lane: number, seconds: number): TimelineCell[] {
  const frames = log.frames;
  const col = frames?.runners[lane];
  if (!frames || !col) return [];
  const colTicks = seconds * TICK_HZ;
  const nCols = timelineColumns(log, seconds);
  const pulseFrame = (log.derived.find((d) => d.lane === lane)?.pulseMms ?? 0) > 0;
  const spans = overheatSpans(log.events ?? [], lane, log.ticks);
  const finishRow = col.flags.findIndex((f) => (f & RACE_FRAME_FLAGS.finished) !== 0);
  const finishTick = finishRow >= 0 ? frames.tick[finishRow] : undefined;
  const finishCol =
    finishTick === undefined ? nCols : Math.max(0, Math.ceil(finishTick / colTicks) - 1);
  const cells: TimelineCell[] = [];
  for (let c = 0; c < nCols; c++) {
    if (c > finishCol) {
      cells.push("after");
      continue;
    }
    if (c === finishCol) {
      cells.push("finish");
      continue;
    }
    const a = c * colTicks;
    const b = a + colTicks;
    let rows: number[] = [];
    frames.tick.forEach((t, i) => {
      if (t > a && t <= b) rows.push(i);
    });
    if (rows.length === 0) {
      const next = frames.tick.findIndex((t) => t > b);
      rows = [next >= 0 ? next : frames.tick.length - 1];
    }
    let flags = 0;
    let boost = 0;
    let covered = 0;
    for (const i of rows) {
      flags |= col.flags[i] ?? 0;
      boost += col.boost[i] ?? 0;
      covered += (frames.tick[i] ?? 0) - (frames.tick[i - 1] ?? 0);
    }
    // A runner overheated during ticks [on, off) shows it in rows on + 1 … off.
    const hot = spans.some(([on, off]) => on + 1 <= b && off > a);
    const boosted =
      boost > 0 || (flags & (RACE_FRAME_FLAGS.boosting | RACE_FRAME_FLAGS.pulseBurst)) !== 0;
    if (flags & RACE_FRAME_FLAGS.dnf) cells.push("dnf");
    else if (flags & RACE_FRAME_FLAGS.stalled) cells.push("stalled");
    else if (flags & RACE_FRAME_FLAGS.broken) cells.push("broken");
    else if (flags & RACE_FRAME_FLAGS.airborne) cells.push("airborne");
    else if (hot || flags & RACE_FRAME_FLAGS.overheated) cells.push("overheated");
    else if (flags & RACE_FRAME_FLAGS.exhausted) cells.push("exhausted");
    else if (boosted && (pulseFrame || flags & RACE_FRAME_FLAGS.pulseBurst)) cells.push("pulse");
    else if (boosted) cells.push(2 * boost >= covered ? "boost" : "lightBoost");
    else if (flags & RACE_FRAME_FLAGS.drafting) cells.push("drafting");
    else cells.push("normal");
  }
  return cells;
}
