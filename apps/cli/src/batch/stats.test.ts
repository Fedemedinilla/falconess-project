import { describe, expect, it } from "vitest";
import {
  coefficientOfVariation,
  equalFieldWinProbability,
  meanInterval,
  normalCdf,
  pointsFromTimeGain,
  sigmaInterval,
  topShares,
  wilson,
  winShares,
} from "./stats.js";

describe("win counting with dead heats (§25.2 S2 counting rule)", () => {
  it("gives the whole win to the single fastest runner, by finishMilli not lane", () => {
    expect(winShares([5000, 4000, 6000])).toEqual([0, 1, 0]);
  });

  it("splits a dead heat for first evenly (1/k each)", () => {
    expect(winShares([4000, 4000, 6000])).toEqual([0.5, 0.5, 0]);
    const three = winShares([7000, 7000, 7000, 9000]);
    expect(three.slice(0, 3).every((s) => Math.abs(s - 1 / 3) < 1e-12)).toBe(true);
    expect(three[3]).toBe(0);
  });

  it("ignores a dead heat behind the winner and gives DNFs nothing", () => {
    expect(winShares([3000, 5000, 5000, null])).toEqual([1, 0, 0, 0]);
    expect(winShares([null, null])).toEqual([0, 0]);
  });

  it("sums to one win per race whenever someone finishes", () => {
    for (const f of [
      [1, 2, 3],
      [2, 2, 2, 2],
      [9, 1, 1, null],
    ]) {
      const total = winShares(f).reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(1, 12);
    }
  });

  it("shares top-k places across a tie group that straddles place k", () => {
    // Places 1, then a three-way tie on places 2-4: two of its three places are inside the top 3.
    const s = topShares([1000, 2000, 2000, 2000, 3000], 3);
    expect(s[0]).toBe(1);
    for (const i of [1, 2, 3]) expect(s[i]).toBeCloseTo(2 / 3, 12);
    expect(s[4]).toBe(0);
    expect(s.reduce((a, b) => a + b, 0)).toBeCloseTo(3, 12);
  });
});

describe("intervals (§25.2: 95 %)", () => {
  it("Wilson matches the closed form", () => {
    const ci = wilson(50, 100);
    expect(ci.lo).toBeCloseTo(0.4038, 4);
    expect(ci.hi).toBeCloseTo(0.5962, 4);
    const zero = wilson(0, 200);
    expect(zero.lo).toBe(0);
    expect(zero.hi).toBeCloseTo(0.0188, 4);
  });

  it("Wilson accepts fractional successes and is unbounded without trials", () => {
    const ci = wilson(12.5, 100);
    expect(ci.lo).toBeLessThan(0.125);
    expect(ci.hi).toBeGreaterThan(0.125);
    expect(wilson(0, 0)).toEqual({ lo: null, hi: null });
  });

  it("normal interval of a paired mean", () => {
    const mi = meanInterval([1, 2, 3, 4, 5]);
    expect(mi.mean).toBe(3);
    const half = (1.96 * Math.sqrt(2.5)) / Math.sqrt(5);
    expect(mi.lo).toBeCloseTo(3 - half, 12);
    expect(mi.hi).toBeCloseTo(3 + half, 12);
    expect(meanInterval([7])).toEqual({ mean: 7, lo: null, hi: null });
  });

  it("σ/mean interval is σ × (1 ± 1.96 / √(2(N − 1)))", () => {
    const ci = sigmaInterval(0.012, 401);
    const f = 1.96 / Math.sqrt(800);
    expect(ci.lo).toBeCloseTo(0.012 * (1 - f), 12);
    expect(ci.hi).toBeCloseTo(0.012 * (1 + f), 12);
    expect(sigmaInterval(0.01, 1)).toEqual({ lo: null, hi: null });
  });

  it("coefficient of variation uses the sample standard deviation", () => {
    const cv = coefficientOfVariation([99, 100, 101]);
    expect(cv).toBeCloseTo(1 / 100, 12);
    expect(coefficientOfVariation([5])).toBeNull();
  });
});

describe("equal-field model of S5 (pr verdict)", () => {
  it("normal CDF anchors", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 7);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 4);
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 4);
  });

  it("an equal runner wins 1/8 of an 8-field", () => {
    expect(equalFieldWinProbability(0)).toBeCloseTo(1 / 8, 6);
    expect(pointsFromTimeGain(0, 0.01)).toBeCloseTo(0, 6);
  });

  it("reproduces R18: 3 points at δ 0.155 % for σ 0.99 % and δ 0.185 % for σ 1.18 %", () => {
    expect(pointsFromTimeGain(0.00155, 0.0099)).toBeCloseTo(0.03, 2);
    expect(pointsFromTimeGain(0.00185, 0.0118)).toBeCloseTo(0.03, 2);
  });

  it("is increasing in the gain and symmetric-ish in sign", () => {
    const a = pointsFromTimeGain(0.001, 0.01);
    const b = pointsFromTimeGain(0.002, 0.01);
    expect(b).toBeGreaterThan(a);
    expect(pointsFromTimeGain(-0.001, 0.01)).toBeLessThan(0);
  });
});
