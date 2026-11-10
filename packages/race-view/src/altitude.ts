import { RACE_FRAME_FLAGS, type RaceLog } from "@falconess/schema";

/**
 * The altitude band of one frame row (ruleset v3, design7 R1): 0 ground, 1 low, 2 high,
 * 3 ceiling, read only from the two bits of `flags`. A view never draws a band the log does not
 * say: v1 and v2 logs have neither bit, so every row reads 0.
 */
export function altitudeBand(flags: number): number {
  return (
    ((flags & RACE_FRAME_FLAGS.altLow) !== 0 ? 1 : 0) +
    ((flags & RACE_FRAME_FLAGS.altHigh) !== 0 ? 2 : 0)
  );
}

/** The band of every frame row of one lane. */
export function altitudeColumn(log: RaceLog, lane: number): number[] {
  return (log.frames?.runners[lane]?.flags ?? []).map(altitudeBand);
}
