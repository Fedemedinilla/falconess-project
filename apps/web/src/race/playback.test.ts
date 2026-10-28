import { RACE_FRAME_FLAGS, type RaceLog } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { simContext } from "../content/load";
import { defaultForm, runFreeRace } from "./free-race";
import { replayEnd, rowAtOrBefore, rowCovering, sampleAt, standings } from "./playback";

const ctx = simContext();
const log: RaceLog = runFreeRace(ctx, { ...defaultForm(ctx.content), seed: "pb-1" });
const frames = log.frames;
if (!frames) throw new Error("the free race runs with detail full");

describe("frame lookup", () => {
  const ticks = [0, 1, 2, 15, 30, 45];

  it("finds the last row at or before an instant", () => {
    expect(rowAtOrBefore(ticks, -3)).toBe(0);
    expect(rowAtOrBefore(ticks, 0)).toBe(0);
    expect(rowAtOrBefore(ticks, 1.5)).toBe(1);
    expect(rowAtOrBefore(ticks, 15)).toBe(3);
    expect(rowAtOrBefore(ticks, 29.9)).toBe(3);
    expect(rowAtOrBefore(ticks, 99)).toBe(5);
    expect(rowAtOrBefore([], 4)).toBe(0);
  });

  it("finds the row that covers an instant (the first at or after it)", () => {
    expect(rowCovering(ticks, 0)).toBe(0);
    expect(rowCovering(ticks, 0.5)).toBe(1);
    expect(rowCovering(ticks, 3)).toBe(3);
    expect(rowCovering(ticks, 15)).toBe(3);
    expect(rowCovering(ticks, 16)).toBe(4);
    expect(rowCovering(ticks, 99)).toBe(5);
  });
});

describe("sampleAt", () => {
  it("is the logged row exactly on a sampled tick", () => {
    const row = 20;
    const t = frames.tick[row] ?? 0;
    for (const sample of sampleAt(log, t)) {
      const col = frames.runners[sample.lane];
      if (sample.finished) continue;
      expect(sample.posMm).toBe(col?.posMm[row]);
      expect(sample.vMms).toBe(col?.vMms[row]);
      expect(sample.hp).toBe(col?.hp[row]);
      expect(sample.energy).toBe(col?.energy[row]);
    }
  });

  it("interpolates positions linearly between two sampled rows", () => {
    const row = 30;
    const t0 = frames.tick[row] ?? 0;
    const t1 = frames.tick[row + 1] ?? 0;
    const mid = (t0 + t1) / 2;
    for (const sample of sampleAt(log, mid)) {
      const col = frames.runners[sample.lane];
      const a = col?.posMm[row] ?? 0;
      const b = col?.posMm[row + 1] ?? 0;
      expect(sample.posMm).toBeCloseTo((a + b) / 2, 6);
      expect(sample.posMm).toBeGreaterThanOrEqual(Math.min(a, b));
      expect(sample.posMm).toBeLessThanOrEqual(Math.max(a, b));
    }
  });

  it("never moves a runner backwards and never past the line", () => {
    const L = log.geometry.lengthMm;
    let prev = sampleAt(log, 0).map((s) => s.posMm);
    for (let t = 0.5; t <= replayEnd(log); t += 7.3) {
      const now = sampleAt(log, t);
      now.forEach((s, lane) => {
        expect(s.posMm).toBeGreaterThanOrEqual((prev[lane] ?? 0) - 1e-6);
        expect(s.posMm).toBeLessThanOrEqual(L);
      });
      prev = now.map((s) => s.posMm);
    }
  });

  it("finishes a runner exactly at her logged finishMilli", () => {
    for (const r of log.results) {
      if (r.finishMilli === null) continue;
      const before = sampleAt(log, r.finishMilli / 1000 - 0.01)[r.lane];
      const after = sampleAt(log, r.finishMilli / 1000)[r.lane];
      expect(before?.finished).toBe(false);
      expect(after?.finished).toBe(true);
      expect(after?.posMm).toBe(log.geometry.lengthMm);
      expect(after?.flags.size).toBe(0);
    }
  });

  it("reads the flags of the row that covers the instant", () => {
    const lane = frames.runners.findIndex((c) =>
      c.flags.some((f) => (f & RACE_FRAME_FLAGS.boosting) !== 0),
    );
    expect(lane).toBeGreaterThanOrEqual(0);
    const col = frames.runners[lane];
    const row = col?.flags.findIndex((f) => (f & RACE_FRAME_FLAGS.boosting) !== 0) ?? -1;
    const t = frames.tick[row] ?? 0;
    expect(sampleAt(log, t)[lane]?.flags.has("boost")).toBe(true);
  });

  it("is empty without frames", () => {
    const { frames: _f, events: _e, ...rest } = log;
    expect(sampleAt({ ...rest, detail: "results" }, 10)).toEqual([]);
  });
});

describe("standings", () => {
  it("orders by position before the finish, with gaps to the front", () => {
    const t = Math.floor(replayEnd(log) / 3);
    const rows = standings(log, sampleAt(log, t));
    expect(rows.map((r) => r.order)).toEqual(rows.map((_, i) => i + 1));
    const pos = rows.map((r) => r.sample.posMm);
    expect(pos).toEqual([...pos].sort((a, b) => b - a));
    expect(rows[0]?.gapMm).toBe(0);
    for (const r of rows) expect(r.gapMm).toBe((pos[0] ?? 0) - r.sample.posMm);
  });

  it("is the logged classification at the end, with the time behind the winner", () => {
    const rows = standings(log, sampleAt(log, replayEnd(log)));
    expect(rows.map((r) => r.sample.lane)).toEqual(log.results.map((r) => r.lane));
    const winner = log.results[0]?.finishMilli ?? 0;
    rows.forEach((row, k) => {
      const result = log.results[k];
      expect(row.gapMm).toBeNull();
      expect(row.behindMilli).toBe((result?.finishMilli ?? 0) - winner);
    });
  });
});
