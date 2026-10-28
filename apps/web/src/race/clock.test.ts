import { describe, expect, it } from "vitest";
import { type FrameScheduler, ReplayClock } from "./clock";

/** A frame scheduler driven by hand: `frame(ms)` advances the wall clock and runs one frame. */
function fakeFrames() {
  let now = 0;
  let next = 1;
  const pending = new Map<number, (now: number) => void>();
  const scheduler: FrameScheduler = {
    now: () => now,
    request: (cb) => {
      const handle = next++;
      pending.set(handle, cb);
      return handle;
    },
    cancel: (handle) => {
      pending.delete(handle);
    },
  };
  const frame = (ms: number) => {
    now += ms;
    const callbacks = [...pending.values()];
    pending.clear();
    for (const cb of callbacks) cb(now);
  };
  return { scheduler, frame, pending };
}

describe("ReplayClock", () => {
  it("moves 15 ticks per second at ×1 and twice as fast at ×2", () => {
    const { scheduler, frame } = fakeFrames();
    const clock = new ReplayClock(600, scheduler);
    clock.play();
    for (let i = 0; i < 10; i++) frame(100);
    expect(clock.time).toBeCloseTo(15, 6);
    clock.setSpeed(2);
    for (let i = 0; i < 10; i++) frame(100);
    expect(clock.time).toBeCloseTo(45, 6);
  });

  it("caps a long frame (a background tab) instead of jumping ahead", () => {
    const { scheduler, frame } = fakeFrames();
    const clock = new ReplayClock(600, scheduler);
    clock.play();
    frame(5000);
    expect(clock.time).toBeCloseTo(1.5, 6);
  });

  it("stops at the end and plays again from the start", () => {
    const { scheduler, frame, pending } = fakeFrames();
    const clock = new ReplayClock(30, scheduler);
    clock.setSpeed(8);
    clock.play();
    for (let i = 0; i < 20; i++) frame(50);
    expect(clock.time).toBe(30);
    expect(clock.getSnapshot()).toMatchObject({ playing: false, atEnd: true, tick: 30 });
    expect(pending.size).toBe(0);
    clock.play();
    expect(clock.time).toBe(0);
    expect(clock.getSnapshot().playing).toBe(true);
  });

  it("calls frame listeners every frame and React listeners only now and then", () => {
    const { scheduler, frame } = fakeFrames();
    const clock = new ReplayClock(6000, scheduler);
    const frames: number[] = [];
    let coarse = 0;
    clock.onFrame((t) => frames.push(t));
    clock.subscribe(() => {
      coarse++;
    });
    clock.play();
    const afterPlay = coarse;
    for (let i = 0; i < 60; i++) frame(16);
    expect(frames).toHaveLength(61);
    expect(coarse - afterPlay).toBeGreaterThan(3);
    expect(coarse - afterPlay).toBeLessThan(15);
  });

  it("seeks inside the replay, and a snapshot changes only when something changed", () => {
    const { scheduler } = fakeFrames();
    const clock = new ReplayClock(100, scheduler);
    const first = clock.getSnapshot();
    clock.seek(-5);
    expect(clock.getSnapshot()).toBe(first);
    clock.seek(40.7);
    expect(clock.getSnapshot().tick).toBe(40);
    clock.seek(500);
    expect(clock.time).toBe(100);
    expect(clock.getSnapshot().atEnd).toBe(true);
  });

  it("stops scheduling frames once disposed", () => {
    const { scheduler, pending } = fakeFrames();
    const clock = new ReplayClock(100, scheduler);
    clock.play();
    expect(pending.size).toBe(1);
    clock.dispose();
    expect(pending.size).toBe(0);
  });
});
