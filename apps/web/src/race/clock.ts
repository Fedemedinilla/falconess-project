/**
 * The replay clock: race time in ticks (15 per second) moved by animation frames at ×1, ×2, ×4 or
 * ×8. The track listens to every frame and draws itself; React listens to a coarse snapshot (a few
 * times per second and on every control change), so a replay never re-renders the page per frame.
 * Framework-free; the frame scheduler is injectable for tests.
 */

export const SPEEDS = [1, 2, 4, 8] as const;
export type Speed = (typeof SPEEDS)[number];

const TICK_HZ = 15;
/** React hears about the running clock at most this often (ms of wall time). */
const COARSE_MS = 120;
/** A frame longer than this (a background tab) advances the race as if it took this long. */
const MAX_FRAME_MS = 100;

export type FrameScheduler = {
  now(): number;
  request(callback: (now: number) => void): number;
  cancel(handle: number): void;
};

const browserScheduler: FrameScheduler = {
  now: () => performance.now(),
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
};

export type ClockSnapshot = {
  readonly playing: boolean;
  readonly speed: Speed;
  /** Race time in whole ticks. */
  readonly tick: number;
  readonly end: number;
  readonly atEnd: boolean;
};

export class ReplayClock {
  readonly end: number;
  readonly #scheduler: FrameScheduler;
  readonly #frameListeners = new Set<(t: number) => void>();
  readonly #listeners = new Set<() => void>();
  #t = 0;
  #speed: Speed = 1;
  #playing = false;
  #handle: number | undefined;
  #lastFrame = 0;
  #lastCoarse = 0;
  #snap: ClockSnapshot;

  constructor(end: number, scheduler: FrameScheduler = browserScheduler) {
    this.end = Math.max(1, end);
    this.#scheduler = scheduler;
    this.#snap = this.#makeSnapshot();
  }

  /** Race time in ticks, fractional. */
  get time(): number {
    return this.#t;
  }

  // --- React store protocol ---------------------------------------------------------------------

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  readonly getSnapshot = (): ClockSnapshot => this.#snap;

  /** Called on every animation frame (and once now) with the race time. */
  onFrame(listener: (t: number) => void): () => void {
    this.#frameListeners.add(listener);
    listener(this.#t);
    return () => {
      this.#frameListeners.delete(listener);
    };
  }

  // --- controls ---------------------------------------------------------------------------------

  play(): void {
    if (this.#playing) return;
    if (this.#t >= this.end) this.#t = 0;
    this.#playing = true;
    this.#lastFrame = this.#scheduler.now();
    this.#schedule();
    this.#publish(true);
  }

  pause(): void {
    if (!this.#playing) return;
    this.#playing = false;
    this.#unschedule();
    this.#publish(true);
  }

  toggle(): void {
    if (this.#playing) this.pause();
    else this.play();
  }

  /** Jump to race time `t` (ticks), clamped to the replay. */
  seek(t: number): void {
    this.#t = Math.max(0, Math.min(this.end, t));
    if (this.#t >= this.end && this.#playing) {
      this.#playing = false;
      this.#unschedule();
    }
    this.#emitFrame();
    this.#publish(true);
  }

  setSpeed(speed: Speed): void {
    if (speed === this.#speed) return;
    this.#speed = speed;
    this.#publish(true);
  }

  /** Stop listening to frames for good (the viewer unmounted). */
  dispose(): void {
    this.#playing = false;
    this.#unschedule();
    this.#frameListeners.clear();
  }

  // --- internals --------------------------------------------------------------------------------

  readonly #step = (now: number): void => {
    this.#handle = undefined;
    if (!this.#playing) return;
    const elapsed = Math.min(MAX_FRAME_MS, Math.max(0, now - this.#lastFrame));
    this.#lastFrame = now;
    this.#t = Math.min(this.end, this.#t + (elapsed * TICK_HZ * this.#speed) / 1000);
    if (this.#t >= this.end) this.#playing = false;
    this.#emitFrame();
    this.#publish(!this.#playing);
    if (this.#playing) this.#schedule();
  };

  #schedule(): void {
    if (this.#handle === undefined) this.#handle = this.#scheduler.request(this.#step);
  }

  #unschedule(): void {
    if (this.#handle !== undefined) this.#scheduler.cancel(this.#handle);
    this.#handle = undefined;
  }

  #emitFrame(): void {
    for (const listener of this.#frameListeners) listener(this.#t);
  }

  #makeSnapshot(): ClockSnapshot {
    return {
      playing: this.#playing,
      speed: this.#speed,
      tick: Math.floor(this.#t),
      end: this.end,
      atEnd: this.#t >= this.end,
    };
  }

  /** A new snapshot for React: now when `force`, else at most every COARSE_MS while running. */
  #publish(force: boolean): void {
    const now = this.#scheduler.now();
    if (!force && now - this.#lastCoarse < COARSE_MS) return;
    const next = this.#makeSnapshot();
    const prev = this.#snap;
    if (
      next.playing === prev.playing &&
      next.speed === prev.speed &&
      next.tick === prev.tick &&
      next.atEnd === prev.atEnd
    )
      return;
    this.#lastCoarse = now;
    this.#snap = next;
    for (const listener of this.#listeners) listener();
  }
}
