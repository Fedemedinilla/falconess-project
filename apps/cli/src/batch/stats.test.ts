import { describe, expect, it } from "vitest";
import {
  coefficientOfVariation,
  equalFieldWinProbability,
  meanInterval,
  normalCdf,
  pairedScoreInterval,
  pairedScoreStatistic,
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

describe("paired score interval (Tango 1998; S3, ADR-0005 Pasada 2)", () => {
  /** Restricted MLE of p₋ under Δ by brute force over the likelihood, then the score statistic. */
  function bruteStatistic(plus: number, minus: number, n: number, delta: number): number {
    const lo = Math.max(0, -delta);
    const hi = (1 - delta) / 2;
    const term = (k: number, p: number) => (k === 0 ? 0 : p <= 0 ? -Infinity : k * Math.log(p));
    let best = lo;
    let bestLl = -Infinity;
    const steps = 200_000;
    for (let i = 0; i <= steps; i++) {
      const q = lo + ((hi - lo) * i) / steps;
      const ll = term(plus, q + delta) + term(minus, q) + term(n - plus - minus, 1 - 2 * q - delta);
      if (ll > bestLl) {
        bestLl = ll;
        best = q;
      }
    }
    return (plus - minus - n * delta) / Math.sqrt(n * (2 * best + delta * (1 - delta)));
  }

  it("takes the restricted MLE in closed form (checked against the likelihood)", () => {
    for (const [plus, minus, n] of [
      [10, 0, 150],
      [10, 3, 150],
      [3, 10, 150],
      [40, 25, 100],
      [2.5, 0.5, 20],
    ] as const)
      for (const delta of [-0.4, -0.05, 0.02, 0.07, 0.3])
        expect(pairedScoreStatistic(plus, minus, n, delta)).toBeCloseTo(
          bruteStatistic(plus, minus, n, delta),
          3,
        );
  });

  it("decreases in Δ, so the bisection from the estimate finds the only crossing", () => {
    for (const n of [3, 20, 150])
      for (let plus = 0; plus <= n; plus += Math.max(1, Math.floor(n / 6)))
        for (let minus = 0; plus + minus <= n; minus += Math.max(1, Math.floor(n / 6))) {
          let prev = Number.POSITIVE_INFINITY;
          for (let i = 0; i <= 400; i++) {
            const z = pairedScoreStatistic(plus, minus, n, -1 + i / 200);
            expect(z).toBeLessThanOrEqual(prev + 1e-9);
            prev = z;
          }
        }
  });

  it("puts the score statistic at ±z on its bounds", () => {
    const ci = pairedScoreInterval(10, 3, 150);
    expect(pairedScoreStatistic(10, 3, 150, ci.lo ?? Number.NaN)).toBeCloseTo(1.96, 9);
    expect(pairedScoreStatistic(10, 3, 150, ci.hi ?? Number.NaN)).toBeCloseTo(-1.96, 9);
    expect(ci.mean).toBeCloseTo(7 / 150, 12);
  });

  it("with no discordant sample is ±z² / (n + z²), not a point", () => {
    const ci = pairedScoreInterval(0, 0, 150);
    const w = (1.96 * 1.96) / (150 + 1.96 * 1.96);
    expect(ci.mean).toBe(0);
    expect(ci.lo).toBeCloseTo(-w, 9);
    expect(ci.hi).toBeCloseTo(w, 9);
    // The normal interval of the same 150 even samples has zero width.
    const flat = meanInterval(new Array<number>(150).fill(0.5));
    expect(flat.hi).toBe(flat.lo);
  });

  it("with discordant samples on one side only has Wilson's upper bound and a lower bound below it", () => {
    for (const [plus, n] of [
      [4, 150],
      [10, 150],
      [300, 4000],
    ] as const) {
      const ci = pairedScoreInterval(plus, 0, n);
      const w = wilson(plus, n);
      expect(ci.hi).toBeCloseTo(w.hi ?? Number.NaN, 9);
      expect(ci.lo ?? Number.NaN).toBeLessThanOrEqual((w.lo ?? Number.NaN) + 1e-12);
    }
  });

  it("is antisymmetric in the sides, widens with z and reaches the ends of [−1, 1]", () => {
    const a = pairedScoreInterval(12, 4, 90);
    const b = pairedScoreInterval(4, 12, 90);
    expect(b.lo).toBeCloseTo(-(a.hi ?? Number.NaN), 12);
    expect(b.hi).toBeCloseTo(-(a.lo ?? Number.NaN), 12);
    const wide = pairedScoreInterval(12, 4, 90, 2.77);
    expect(wide.lo ?? 0).toBeLessThan(a.lo ?? 0);
    expect(wide.hi ?? 0).toBeGreaterThan(a.hi ?? 0);
    expect(pairedScoreInterval(20, 0, 20).hi).toBe(1);
    expect(pairedScoreInterval(0, 20, 20).lo).toBe(-1);
    expect(pairedScoreInterval(0, 0, 0)).toEqual({ mean: null, lo: null, hi: null });
  });

  it("matches the normal interval once both sides have hundreds of samples", () => {
    // full size: 4000 samples, 300 / 20 discordant; per-sample values 1, 0 and 0.5 (S3 shares).
    const values = [
      ...new Array<number>(300).fill(1),
      ...new Array<number>(20).fill(0),
      ...new Array<number>(3680).fill(0.5),
    ];
    const normal = meanInterval(values);
    const score = pairedScoreInterval(300, 20, 4000);
    expect(0.5 + (score.lo ?? 0) / 2).toBeCloseTo(normal.lo ?? 0, 3);
    expect(0.5 + (score.hi ?? 0) / 2).toBeCloseTo(normal.hi ?? 0, 3);
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
