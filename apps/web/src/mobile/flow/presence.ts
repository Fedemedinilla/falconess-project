/**
 * The layers on the page (plan §1.9), apart from React: the one in front ("in") and the ones on
 * their way out ("out"), each with the latest data it had while in front, so a leaving layer goes
 * on showing what it showed. LayerHost renders this list; a timer per leaving entry ends it
 * (`expire`), never an animation's end. Pure.
 */
import type { Layer } from "./types";

/** One layer on the page. Its React key is `${key}#${gen}`: a key that comes back is a new instance. */
export type Presence = {
  readonly key: string;
  readonly gen: number;
  /** The latest data seen while it was in front. */
  readonly layer: Layer;
  readonly phase: "in" | "out";
  /** When it came in, or when it started leaving (`performance.now()`). */
  readonly since: number;
};

/** At most this many layers leave at once: the oldest goes when another starts leaving. */
export const MAX_LEAVING = 2;

/**
 * The list once `top` is the flow's layer (`undefined`: none), at `now`:
 * - the same key as the one in front: that one keeps going with `top`'s data;
 * - another key, or none: the one in front starts leaving where it stands (or goes at once when
 *   `outMs` gives it no time), and `top` comes in after it, with a gen of its own;
 * - nothing new: the same list (`===`).
 */
export function presenceStep(
  prev: readonly Presence[],
  top: Layer | undefined,
  now: number,
  outMs: (layer: Layer) => number,
): readonly Presence[] {
  const front = prev.find((e) => e.phase === "in");
  if (top && front?.key === top.key)
    return front.layer === top ? prev : prev.map((e) => (e === front ? { ...e, layer: top } : e));
  if (!top && !front) return prev;
  let next = prev.flatMap((e): Presence[] => {
    if (e !== front) return [e];
    return outMs(e.layer) > 0 ? [{ ...e, phase: "out", since: now }] : [];
  });
  const leaving = next.filter((e) => e.phase === "out");
  if (leaving.length > MAX_LEAVING) {
    const gone = new Set(leaving.slice(0, leaving.length - MAX_LEAVING));
    next = next.filter((e) => !gone.has(e));
  }
  if (!top) return next;
  const gen = Math.max(-1, ...prev.filter((e) => e.key === top.key).map((e) => e.gen)) + 1;
  return [...next, { key: top.key, gen, layer: top, phase: "in", since: now }];
}

/** The leaving entry `key#gen` is gone (its time is up); anything else stays as it is. */
export function expire(prev: readonly Presence[], key: string, gen: number): readonly Presence[] {
  const i = prev.findIndex((e) => e.key === key && e.gen === gen && e.phase === "out");
  return i < 0 ? prev : prev.filter((_, j) => j !== i);
}
