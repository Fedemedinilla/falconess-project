/**
 * What a flow timer counts on (plan §2.3): the time, a delay and the next animation frame. The page
 * gives its own (`flowTimer.ts`); a test gives a fake one. Each `after`/`frame` returns what
 * cancels it.
 */
export type TimerClock = {
  readonly now: () => number;
  readonly after: (ms: number, fire: () => void) => () => void;
  readonly frame: (fire: () => void) => () => void;
};

/** A timer that can stop where it is and go on later with the time it had left. */
export type PausableTimer = {
  /** Stops the count (nothing once it fired or was cancelled). */
  readonly pause: () => void;
  /** Goes on with the time left (nothing unless paused). */
  readonly resume: () => void;
  /** It never fires. */
  readonly cancel: () => void;
  /** The time left, ms (0 once it fired or was cancelled). */
  readonly remaining: () => number;
};

export type TimerOptions = {
  /**
   * Start counting at the next animation frame, not at once: a CSS animation mounted in the same
   * commit starts at that frame too, so the timer never runs ahead of it on a slow commit.
   */
  readonly fromFrame?: boolean;
};

type State = "frame" | "running" | "paused" | "done";

/**
 * Fires `fire` once, `ms` after it starts (at once, or at the next frame with `fromFrame`),
 * unless cancelled; `pause` keeps the time left, `resume` goes on with it (a hidden tab, 6.11).
 * Pure: everything it reads comes from `clock`.
 */
export function createPausableTimer(
  ms: number,
  fire: () => void,
  clock: TimerClock,
  options: TimerOptions = {},
): PausableTimer {
  let state: State = "running";
  let left = Math.max(0, ms);
  let startedAt = 0;
  /** A pause before its first frame waits for a frame again when it resumes. */
  let waitsFrame = options.fromFrame === true;
  let stop: (() => void) | undefined;
  const run = (): void => {
    state = "running";
    waitsFrame = false;
    startedAt = clock.now();
    stop = clock.after(left, () => {
      state = "done";
      stop = undefined;
      left = 0;
      fire();
    });
  };
  const start = (): void => {
    if (waitsFrame) {
      state = "frame";
      stop = clock.frame(run);
    } else run();
  };
  start();
  return {
    pause: () => {
      if (state !== "running" && state !== "frame") return;
      stop?.();
      stop = undefined;
      if (state === "running") left = Math.max(0, left - (clock.now() - startedAt));
      state = "paused";
    },
    resume: () => {
      if (state === "paused") start();
    },
    cancel: () => {
      stop?.();
      stop = undefined;
      left = 0;
      state = "done";
    },
    remaining: () =>
      state === "running"
        ? Math.max(0, left - (clock.now() - startedAt))
        : state === "done"
          ? 0
          : left,
  };
}
