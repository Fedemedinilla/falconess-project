/**
 * Pure statistics of the balance batch (docs/race-engine.md §25.2). This is CLI code, not `sim`:
 * floats are allowed here. Every function is deterministic for a given input order.
 */

/** Two-sided 95 % normal quantile (§25.2: every interval is 95 %). */
export const Z95 = 1.96;

/** An interval bound of `null` is unbounded (too few samples, or a ratio over zero). */
export type Interval = { lo: number | null; hi: number | null };

/**
 * Share of the top `k` places for each runner, from finish times in milli-ticks (`null` = DNF).
 * A dead heat (equal `finishMilli`, §19) shares the places its group occupies: a group of `g`
 * runners on places a..a+g−1 gives each runner |[a, a+g−1] ∩ [1, k]| / g. With k = 1 this is the
 * metric-2 rule "a dead heat for first gives each runner 1/k of a win"; the lane tie-break of §19
 * is never used. DNF runners take no share.
 */
export function topShares(finish: readonly (number | null)[], k: number): number[] {
  const out = finish.map(() => 0);
  const order = finish
    .map((t, i) => ({ t, i }))
    .filter((r): r is { t: number; i: number } => r.t !== null)
    .sort((a, b) => a.t - b.t || a.i - b.i);
  let place = 1;
  let g = 0;
  while (g < order.length) {
    let end = g;
    while (end + 1 < order.length && order[end + 1]?.t === order[g]?.t) end++;
    const size = end - g + 1;
    const first = place;
    const last = place + size - 1;
    const inTop = Math.max(0, Math.min(last, k) - first + 1);
    for (let j = g; j <= end; j++) {
      const r = order[j];
      if (r) out[r.i] = inTop / size;
    }
    place += size;
    g = end + 1;
  }
  return out;
}

/** Win share per runner (dead heats for first split evenly). */
export function winShares(finish: readonly (number | null)[]): number[] {
  return topShares(finish, 1);
}

/** Wilson score interval for `successes` (may be fractional: dead heats) out of `n` trials. */
export function wilson(successes: number, n: number): Interval {
  if (n <= 0) return { lo: null, hi: null };
  const p = successes / n;
  const z2 = Z95 * Z95;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (Z95 * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) };
}

export function mean(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

/** Sample standard deviation (N − 1); `null` below two values. */
export function sampleSd(values: readonly number[]): number | null {
  const m = mean(values);
  if (m === null || values.length < 2) return null;
  let s = 0;
  for (const v of values) s += (v - m) * (v - m);
  return Math.sqrt(s / (values.length - 1));
}

/**
 * Normal interval of a mean (§25.2: "the normal interval of the mean paired difference" for S3,
 * S4, S5 and the adjacent-I steps of S8). Unbounded below two samples.
 */
export function meanInterval(values: readonly number[]): Interval & { mean: number | null } {
  const m = mean(values);
  const sd = sampleSd(values);
  if (m === null || sd === null) return { mean: m, lo: null, hi: null };
  const half = (Z95 * sd) / Math.sqrt(values.length);
  return { mean: m, lo: m - half, hi: m + half };
}

/** §25.2 interval for σ/mean: `σ × (1 ± 1.96 / √(2(N − 1)))`. */
export function sigmaInterval(value: number, n: number): Interval {
  if (n < 2) return { lo: null, hi: null };
  const f = Z95 / Math.sqrt(2 * (n - 1));
  return { lo: Math.max(0, value * (1 - f)), hi: value * (1 + f) };
}

/** Coefficient of variation σ/mean of a sample (`null` below two values or at mean 0). */
export function coefficientOfVariation(values: readonly number[]): number | null {
  const m = mean(values);
  const sd = sampleSd(values);
  if (m === null || sd === null || m === 0) return null;
  return sd / m;
}

/** Complementary error function (Numerical Recipes `erfcc`, relative error < 1.2e-7). */
function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t *
                  (0.09678418 +
                    t *
                      (-0.18628806 +
                        t *
                          (0.27886807 +
                            t *
                              (-1.13520398 +
                                t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    );
  return x >= 0 ? r : 2 - r;
}

/** Standard normal CDF. */
export function normalCdf(x: number): number {
  return 0.5 * erfc(-x / Math.SQRT2);
}

function normalPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

/**
 * Equal-field model of §25.2 (S5, `pr`): one runner `d` standard deviations faster than
 * `field − 1` others, all times independent normal. Returns P(that runner wins) =
 * ∫ φ(z) (1 − Φ(z − d))^(field − 1) dz, by Simpson's rule on [−10, 10].
 */
export function equalFieldWinProbability(d: number, field = 8): number {
  const steps = 4000;
  const a = -10;
  const b = 10;
  const h = (b - a) / steps;
  let sum = 0;
  for (let i = 0; i <= steps; i++) {
    const z = a + i * h;
    const w = i === 0 || i === steps ? 1 : i % 2 === 1 ? 4 : 2;
    let tail = 1;
    const q = 1 - normalCdf(z - d);
    for (let j = 1; j < field; j++) tail *= q;
    sum += w * normalPdf(z) * tail;
  }
  return (sum * h) / 3;
}

/**
 * S5 `pr` verdict input: win-rate points (as a fraction, 0.03 = 3 points) gained by a runner whose
 * time is `gain` (fraction, 0.0016 = 0.16 %) shorter in an equal 8-field of relative σ `sigma`.
 * At σ 0.99 % a gain of 0.155 % is ≈ 3 points (R18).
 */
export function pointsFromTimeGain(gain: number, sigma: number, field = 8): number {
  return equalFieldWinProbability(gain / sigma, field) - 1 / field;
}
