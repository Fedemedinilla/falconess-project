import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { Rng, STREAMS } from "./rng.js";
import { deriveState, fnv1a32, Xoshiro128 } from "./xoshiro.js";

describe("Xoshiro128**", () => {
  it("rejects the all-zero state", () => {
    expect(() => new Xoshiro128([0, 0, 0, 0])).toThrow();
  });

  it("produces unsigned 32-bit integers", () => {
    const g = new Xoshiro128([1, 2, 3, 4]);
    for (let i = 0; i < 1000; i++) {
      const x = g.nextU32();
      expect(Number.isInteger(x)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(2 ** 32);
    }
  });

  it("is reproducible from the same state", () => {
    const a = new Xoshiro128([1, 2, 3, 4]);
    const b = new Xoshiro128([1, 2, 3, 4]);
    for (let i = 0; i < 100; i++) expect(a.nextU32()).toBe(b.nextU32());
  });
});

describe("seed derivation", () => {
  it("fnv1a32 is stable", () => {
    expect(fnv1a32("")).toBe(0x811c9dc5);
    expect(fnv1a32("a")).toBe(0xe40c292c);
    expect(fnv1a32("foobar")).toBe(0xbf9cf968);
  });

  it("different streams yield different states for the same seed", () => {
    const a = deriveState("42", "training");
    const b = deriveState("42", "race");
    expect(a).not.toEqual(b);
  });

  it("different seeds yield different states for the same stream", () => {
    expect(deriveState("42", "race")).not.toEqual(deriveState("43", "race"));
  });
});

describe("Rng", () => {
  it("same seed → same sequence on every stream", () => {
    const a = new Rng("seed-1");
    const b = new Rng("seed-1");
    for (const s of STREAMS) {
      for (let i = 0; i < 50; i++) expect(a.nextU32(s)).toBe(b.nextU32(s));
    }
  });

  it("streams are independent: drawing from one does not shift another", () => {
    const a = new Rng("x");
    const b = new Rng("x");
    for (let i = 0; i < 500; i++) a.nextU32("training");
    const seqA = Array.from({ length: 20 }, () => a.nextU32("race"));
    const seqB = Array.from({ length: 20 }, () => b.nextU32("race"));
    expect(seqA).toEqual(seqB);
  });

  it("snapshot/restore continues the exact same sequence", () => {
    const a = new Rng("snap");
    for (let i = 0; i < 37; i++) a.nextInt("events", 10);
    const snap = JSON.parse(JSON.stringify(a.snapshot()));
    const b = Rng.restore(snap);
    for (let i = 0; i < 100; i++) expect(a.nextU32("events")).toBe(b.nextU32("events"));
    expect(b.drawCount("events")).toBe(a.drawCount("events"));
  });

  it("nextInt stays within [0, n)", () => {
    fc.assert(
      fc.property(fc.string(), fc.integer({ min: 1, max: 100_000 }), (seed, n) => {
        const rng = new Rng(seed);
        for (let i = 0; i < 50; i++) {
          const x = rng.nextInt("race", n);
          if (x < 0 || x >= n || !Number.isInteger(x)) return false;
        }
        return true;
      }),
      { numRuns: 300 },
    );
  });

  it("nextRange is inclusive on both ends and reaches them", () => {
    const rng = new Rng("range");
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) seen.add(rng.nextRange("training", 3, 7));
    expect([...seen].sort()).toEqual([3, 4, 5, 6, 7]);
  });

  it("chancePermille is roughly calibrated", () => {
    const rng = new Rng("chance");
    let hits = 0;
    const N = 20_000;
    for (let i = 0; i < N; i++) if (rng.chancePermille("training", 250)) hits++;
    expect(hits / N).toBeGreaterThan(0.23);
    expect(hits / N).toBeLessThan(0.27);
    expect(rng.chancePermille("training", 0)).toBe(false);
    expect(rng.chancePermille("training", 1000)).toBe(true);
  });

  it("pickWeighted respects weights and ignores zero weights", () => {
    const rng = new Rng("weights");
    const counts = [0, 0, 0];
    for (let i = 0; i < 9000; i++) {
      const k = rng.pickWeighted("events", [1, 0, 2]);
      counts[k] = (counts[k] ?? 0) + 1;
    }
    expect(counts[1]).toBe(0);
    expect((counts[2] ?? 0) / (counts[0] ?? 1)).toBeGreaterThan(1.7);
    expect((counts[2] ?? 0) / (counts[0] ?? 1)).toBeLessThan(2.3);
    expect(() => rng.pickWeighted("events", [0, 0])).toThrow();
  });

  it("shuffle is a permutation", () => {
    fc.assert(
      fc.property(fc.array(fc.integer()), fc.string(), (arr, seed) => {
        const out = new Rng(seed).shuffle("quirks", arr);
        return out.length === arr.length && [...out].sort().join() === [...arr].sort().join();
      }),
    );
  });

  it("golden: first draws for seed 42 (regression lock)", () => {
    const rng = new Rng("42");
    const got = STREAMS.map((s) => rng.nextU32(s));
    // Locked on first implementation. Any change here is a ruleset change and needs an ADR.
    expect(got).toMatchSnapshot();
  });
});
