import { useEffect } from "react";
import {
  createPausableTimer,
  type PausableTimer,
  type TimerClock,
  type TimerOptions,
} from "./timer";
import { useLatest } from "./useLatest";

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
 * A flow timer (plan §2.3): the game's clock for what ends a beat or moves it on, never an
 * animation's end. It fires `onFire` (read when it fires, so a new arrow on each render is fine)
 * `ms` after it starts; with `ms` undefined it is off. It starts again only when `key` changes or
 * it is turned on again: a re-render, a new `onFire` or a new `ms` for the same key keep it going
 * (`ms` is read when it starts). `fromFrame` starts it at the next animation frame.
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
    const timers: PausableTimer[] = at.map((ms, i) =>
      createPausableTimer(ms, () => fire.current(i), PAGE, { fromFrame }),
    );
    return () => {
      for (const t of timers) t.cancel();
    };
  }, [key, on, fromFrame, latest, fire]);
}
