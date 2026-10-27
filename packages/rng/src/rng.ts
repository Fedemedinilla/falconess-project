import { deriveState, Xoshiro128, type XoshiroState } from "./xoshiro.js";

/** Every subsystem draws from its own stream so a change in one never shifts another. */
export const STREAMS = ["training", "events", "race", "gacha", "quirks"] as const;
export type StreamName = (typeof STREAMS)[number];

export type RngSnapshot = {
  readonly seed: string;
  readonly streams: Readonly<Record<StreamName, XoshiroState>>;
  readonly draws: Readonly<Record<StreamName, number>>;
};

const TWO_32 = 4294967296;

export class Rng {
  readonly seed: string;
  private readonly gens: Record<StreamName, Xoshiro128>;
  private readonly draws: Record<StreamName, number>;

  constructor(seed: string) {
    this.seed = seed;
    this.gens = Object.fromEntries(
      STREAMS.map((s) => [s, new Xoshiro128(deriveState(seed, s))]),
    ) as Record<StreamName, Xoshiro128>;
    this.draws = Object.fromEntries(STREAMS.map((s) => [s, 0])) as Record<StreamName, number>;
  }

  /** Unsigned 32-bit integer in [0, 2^32). The primitive every other method builds on. */
  nextU32(stream: StreamName): number {
    this.draws[stream] += 1;
    return this.gens[stream].nextU32();
  }

  /**
   * Uniform integer in [0, n). Unbiased via rejection sampling; consumes a variable number of
   * draws, which is fine because the whole sequence is deterministic for a given seed.
   */
  nextInt(stream: StreamName, n: number): number {
    if (!Number.isInteger(n) || n <= 0)
      throw new Error(`nextInt: n must be a positive integer, got ${n}`);
    if (n === 1) return 0;
    const limit = TWO_32 - (TWO_32 % n);
    let x = this.nextU32(stream);
    while (x >= limit) x = this.nextU32(stream);
    return x % n;
  }

  /** Uniform integer in [lo, hi] inclusive. */
  nextRange(stream: StreamName, lo: number, hi: number): number {
    if (hi < lo) throw new Error(`nextRange: hi < lo (${lo}, ${hi})`);
    return lo + this.nextInt(stream, hi - lo + 1);
  }

  /** Uniform integer in [0, 1000). Use for per-mille probabilities. */
  nextPermille(stream: StreamName): number {
    return this.nextInt(stream, 1000);
  }

  /** True with probability p/1000. p is clamped to [0, 1000]. */
  chancePermille(stream: StreamName, p: number): boolean {
    if (p <= 0) return false;
    if (p >= 1000) return true;
    return this.nextPermille(stream) < p;
  }

  /**
   * Weighted pick: returns the index of the chosen weight. Weights are non-negative integers.
   * Throws if the total is zero.
   */
  pickWeighted(stream: StreamName, weights: readonly number[]): number {
    let total = 0;
    for (const w of weights) {
      if (w < 0 || !Number.isInteger(w))
        throw new Error("pickWeighted: weights must be non-negative integers");
      total += w;
    }
    if (total === 0) throw new Error("pickWeighted: total weight is zero");
    let r = this.nextInt(stream, total);
    for (let i = 0; i < weights.length; i++) {
      const w = weights[i] ?? 0;
      if (r < w) return i;
      r -= w;
    }
    return weights.length - 1;
  }

  /** Fisher–Yates shuffle, returns a new array. */
  shuffle<T>(stream: StreamName, items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.nextInt(stream, i + 1);
      const a = out[i] as T;
      out[i] = out[j] as T;
      out[j] = a;
    }
    return out;
  }

  snapshot(): RngSnapshot {
    return {
      seed: this.seed,
      streams: Object.fromEntries(STREAMS.map((s) => [s, this.gens[s].getState()])) as Record<
        StreamName,
        XoshiroState
      >,
      draws: { ...this.draws },
    };
  }

  static restore(snap: RngSnapshot): Rng {
    const rng = new Rng(snap.seed);
    for (const s of STREAMS) {
      rng.gens[s] = new Xoshiro128(snap.streams[s]);
      rng.draws[s] = snap.draws[s];
    }
    return rng;
  }

  /** Number of draws taken per stream; useful in tests to prove UI never touches the RNG. */
  drawCount(stream: StreamName): number {
    return this.draws[stream];
  }
}
