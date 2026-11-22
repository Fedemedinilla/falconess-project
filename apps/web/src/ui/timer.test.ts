import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPausableTimer, type HiddenSource, pauseWhileHidden, type TimerClock } from "./timer";

/** A frame every 16 ms, on vitest's fake timers. */
const FRAME_MS = 16;

const clock: TimerClock = {
  now: () => Date.now(),
  after: (ms, fire) => {
    const t = setTimeout(fire, ms);
    return () => clearTimeout(t);
  },
  frame: (fire) => {
    const t = setTimeout(fire, FRAME_MS);
    return () => clearTimeout(t);
  },
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("createPausableTimer", () => {
  it("fires once, after its time", () => {
    const fire = vi.fn();
    const timer = createPausableTimer(240, fire, clock);
    vi.advanceTimersByTime(239);
    expect(fire).not.toHaveBeenCalled();
    expect(timer.remaining()).toBe(1);
    vi.advanceTimersByTime(1);
    expect(fire).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(fire).toHaveBeenCalledTimes(1);
    expect(timer.remaining()).toBe(0);
  });

  it("a cancelled timer never fires", () => {
    const fire = vi.fn();
    const timer = createPausableTimer(100, fire, clock);
    vi.advanceTimersByTime(50);
    timer.cancel();
    vi.advanceTimersByTime(1000);
    expect(fire).not.toHaveBeenCalled();
    timer.resume();
    vi.advanceTimersByTime(1000);
    expect(fire).not.toHaveBeenCalled();
  });

  it("a pause keeps the time left, and the resume goes on with it", () => {
    const fire = vi.fn();
    const timer = createPausableTimer(1000, fire, clock);
    vi.advanceTimersByTime(400);
    timer.pause();
    expect(timer.remaining()).toBe(600);
    // a hidden tab for three seconds: nothing counts
    vi.advanceTimersByTime(3000);
    expect(fire).not.toHaveBeenCalled();
    expect(timer.remaining()).toBe(600);
    timer.resume();
    vi.advanceTimersByTime(599);
    expect(fire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fire).toHaveBeenCalledTimes(1);
  });

  it("pausing twice or resuming a running timer changes nothing", () => {
    const fire = vi.fn();
    const timer = createPausableTimer(500, fire, clock);
    timer.resume();
    vi.advanceTimersByTime(100);
    timer.pause();
    vi.advanceTimersByTime(100);
    timer.pause();
    expect(timer.remaining()).toBe(400);
    timer.resume();
    timer.resume();
    vi.advanceTimersByTime(400);
    expect(fire).toHaveBeenCalledTimes(1);
  });

  it("a timer that fired takes no pause or resume", () => {
    const fire = vi.fn();
    const timer = createPausableTimer(0, fire, clock);
    vi.advanceTimersByTime(0);
    expect(fire).toHaveBeenCalledTimes(1);
    timer.pause();
    timer.resume();
    vi.advanceTimersByTime(1000);
    expect(fire).toHaveBeenCalledTimes(1);
  });

  it("a negative time fires at once", () => {
    const fire = vi.fn();
    createPausableTimer(-50, fire, clock);
    vi.advanceTimersByTime(0);
    expect(fire).toHaveBeenCalledTimes(1);
  });

  it("from the next frame: its time counts from the frame, not from the call", () => {
    const fire = vi.fn();
    const timer = createPausableTimer(160, fire, clock, { fromFrame: true });
    expect(timer.remaining()).toBe(160);
    vi.advanceTimersByTime(FRAME_MS + 159);
    expect(fire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fire).toHaveBeenCalledTimes(1);
  });

  it("from the next frame: paused before it, it waits for a frame again", () => {
    const fire = vi.fn();
    const timer = createPausableTimer(100, fire, clock, { fromFrame: true });
    vi.advanceTimersByTime(FRAME_MS - 1);
    timer.pause();
    vi.advanceTimersByTime(1000);
    expect(fire).not.toHaveBeenCalled();
    expect(timer.remaining()).toBe(100);
    timer.resume();
    vi.advanceTimersByTime(FRAME_MS + 99);
    expect(fire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fire).toHaveBeenCalledTimes(1);
  });

  it("from the next frame: cancelled before it, it never fires", () => {
    const fire = vi.fn();
    const timer = createPausableTimer(100, fire, clock, { fromFrame: true });
    timer.cancel();
    vi.advanceTimersByTime(1000);
    expect(fire).not.toHaveBeenCalled();
  });
});

/** A page the test hides and shows; `listeners` counts who follows it. */
function fakeTab(hiddenAtStart = false) {
  let hidden = hiddenAtStart;
  const listeners = new Set<() => void>();
  const source: HiddenSource = {
    hidden: () => hidden,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return {
    source,
    listeners,
    set(next: boolean) {
      hidden = next;
      for (const l of [...listeners]) l();
    },
  };
}

describe("pauseWhileHidden (6.11: a hidden tab, critic b's two clocks)", () => {
  it("a hidden tab holds its timers: each goes on with the time it had left once it shows", () => {
    const tab = fakeTab();
    const a = vi.fn();
    const b = vi.fn();
    const timers = [createPausableTimer(500, a, clock), createPausableTimer(2300, b, clock)];
    pauseWhileHidden(timers, tab.source);
    vi.advanceTimersByTime(300);
    tab.set(true);
    // three seconds in another tab: nothing ends out of sight
    vi.advanceTimersByTime(3000);
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
    expect(timers.map((t) => t.remaining())).toEqual([200, 2000]);
    tab.set(false);
    vi.advanceTimersByTime(199);
    expect(a).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(a).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1799);
    expect(b).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("a timer started while the tab is hidden waits for it to show", () => {
    const tab = fakeTab(true);
    const fire = vi.fn();
    const timer = createPausableTimer(240, fire, clock);
    pauseWhileHidden([timer], tab.source);
    vi.advanceTimersByTime(5000);
    expect(fire).not.toHaveBeenCalled();
    expect(timer.remaining()).toBe(240);
    tab.set(false);
    vi.advanceTimersByTime(240);
    expect(fire).toHaveBeenCalledTimes(1);
  });

  it("hidden before its first frame, it waits for a frame again once the tab shows", () => {
    const tab = fakeTab();
    const fire = vi.fn();
    const timer = createPausableTimer(160, fire, clock, { fromFrame: true });
    pauseWhileHidden([timer], tab.source);
    tab.set(true);
    vi.advanceTimersByTime(1000);
    tab.set(false);
    vi.advanceTimersByTime(FRAME_MS + 159);
    expect(fire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fire).toHaveBeenCalledTimes(1);
  });

  it("a timer that fired stays fired through a hide and a show", () => {
    const tab = fakeTab();
    const fire = vi.fn();
    const timer = createPausableTimer(100, fire, clock);
    pauseWhileHidden([timer], tab.source);
    vi.advanceTimersByTime(100);
    tab.set(true);
    tab.set(false);
    vi.advanceTimersByTime(1000);
    expect(fire).toHaveBeenCalledTimes(1);
  });

  it("once it stops following the tab, a hide or a show changes nothing", () => {
    const tab = fakeTab();
    const fire = vi.fn();
    const timer = createPausableTimer(1000, fire, clock);
    const stop = pauseWhileHidden([timer], tab.source);
    expect(tab.listeners.size).toBe(1);
    stop();
    expect(tab.listeners.size).toBe(0);
    tab.set(true);
    vi.advanceTimersByTime(1000);
    expect(fire).toHaveBeenCalledTimes(1);
  });
});
