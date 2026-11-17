import { useEffect } from "react";
import { createPausableTimer, pauseWhileHidden, type TimerClock, type TimerOptions } from "./timer";
import { useLatest } from "./useLatest";
import { pageVisibility } from "./visibility";

/** The page's clock: `performance.now()`, `setTimeout` and `requestAnimationFrame`. */
const PAGE: TimerClock = {
  now: () => performance.now(),
  after: (ms, fire) => {
    const t = setTimeout(fire, ms);
    return () => clearTimeout(t);
  },
  frame: (fire) => {
    const f = requestAnimationFrame(() => fire());
    return () => cancelAnimationFrame(f);
  },
};

/**
 * Flow timers outside React (a leaving layer's removal): `onFire(i)` at each of `times` (ms from
 * now, or from the next frame with `fromFrame`), paused while the tab is hidden and going on with
 * the time each had left when it shows again (6.11). Returns what cancels them all.
 */
export function startFlowTimers(
  times: readonly number[],
  onFire: (i: number) => void,
  options: TimerOptions = {},
): () => void {
  const timers = times.map((ms, i) => createPausableTimer(ms, () => onFire(i), PAGE, options));
  const unfollow = pauseWhileHidden(timers, pageVisibility());
  return () => {
    unfollow();
    for (const t of timers) t.cancel();
  };
}

/** One flow timer outside React (`startFlowTimers`). */
export function startFlowTimer(
  ms: number,
  onFire: () => void,
  options: TimerOptions = {},
): () => void {
  return startFlowTimers([ms], onFire, options);
}

/**
 * A flow timer (plan §2.3): the game's clock for what ends a beat or moves it on, never an
 * animation's end. It fires `onFire` (read when it fires, so a new arrow on each render is fine)
 * `ms` after it starts; with `ms` undefined it is off. It starts again only when `key` changes or
 * it is turned on again: a re-render, a new `onFire` or a new `ms` for the same key keep it going
 * (`ms` is read when it starts). `fromFrame` starts it at the next animation frame. While the tab
 * is hidden it stands still, and it goes on with the time it had left (6.11).
 */
export function useFlowTimer(
  ms: number | undefined,
  onFire: () => void,
  key: string,
  options: TimerOptions = {},
): void {
  useFlowTimers(ms === undefined ? undefined : [ms], onFire, key, options);
}

/**
 * Several flow timers on one key (a beat's pings, its effects' sounds): `onFire(i)` at each of
 * `times` (ms from the start), with `useFlowTimer`'s rules.
 */
export function useFlowTimers(
  times: readonly number[] | undefined,
  onFire: (i: number) => void,
  key: string,
  options: TimerOptions = {},
): void {
  const fire = useLatest(onFire);
  const latest = useLatest(times);
  const on = times !== undefined;
  const fromFrame = options.fromFrame === true;
  // biome-ignore lint/correctness/useExhaustiveDependencies: restarts with its key, or when turned on or off; the times are read when it starts
  useEffect(() => {
    const at = latest.current;
    if (!at) return;
    return startFlowTimers(at, (i) => fire.current(i), { fromFrame });
  }, [key, on, fromFrame, latest, fire]);
}
