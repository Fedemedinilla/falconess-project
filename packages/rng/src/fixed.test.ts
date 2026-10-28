import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  ceilDiv,
  clamp,
  divFP,
  FP,
  floorDiv,
  mulDiv,
  mulFP,
  scale,
  toPermille,
  U32_RANGE,
  uPm,
  uRange,
} from "./fixed.js";

describe("fixed-point", () => {
  it("mulFP multiplies per-mille values", () => {
    expect(mulFP(20_000, 1_050)).toBe(21_000); // 20 m/s × 1.05
    expect(mulFP(1_500, 1_500)).toBe(2_250);
    expect(mulFP(-1_500, 1_500)).toBe(-2_250);
  });

  it("divFP divides per-mille values", () => {
    expect(divFP(21_000, 20_000)).toBe(1_050);
    expect(divFP(1, 3)).toBe(333);
    expect(() => divFP(1, 0)).toThrow();
  });

  it("floor rounding is consistent (toward -inf)", () => {
    expect(floorDiv(7, 2)).toBe(3);
    expect(floorDiv(-7, 2)).toBe(-4);
    expect(mulDiv(7, 1, 2)).toBe(3);
  });

  it("scale applies a per-mille multiplier", () => {
    expect(scale(600, 1_100)).toBe(660);
    expect(scale(600, 700)).toBe(420);
    expect(scale(999, 1_000)).toBe(999);
  });

  it("toPermille converts aptitude ratios exactly", () => {
    expect(toPermille(1.1)).toBe(1_100);
    expect(toPermille(0.95)).toBe(950);
    expect(toPermille(0.7)).toBe(700);
  });

  it("clamp", () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });

  it("results are always integers for integer inputs", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000, max: 1_000_000 }),
        fc.integer({ min: 0, max: 5_000 }),
        (a, m) => Number.isInteger(mulFP(a, m)) && Number.isInteger(scale(a, m)),
      ),
    );
    expect(FP).toBe(1000);
  });
});

describe("race helpers (docs/race-engine.md 0.1, 17.2)", () => {
  const U32_MAX = U32_RANGE - 1;

  it("ceilDiv rounds up for positive divisors, including negative numerators", () => {
    expect(ceilDiv(0, 7)).toBe(0);
    expect(ceilDiv(1, 7)).toBe(1);
    expect(ceilDiv(7, 7)).toBe(1);
    expect(ceilDiv(8, 7)).toBe(2);
    expect(ceilDiv(20_000_000, 1000)).toBe(20_000); // jump need of the ridge (lift 20, T 600)
    expect(ceilDiv(15_000_000, 1000)).toBe(15_000);
    expect(ceilDiv(-7, 2)).toBe(-3);
    expect(() => ceilDiv(1, 0)).toThrow();
    expect(() => ceilDiv(1, -2)).toThrow();
  });

  it("ceilDiv equals floorDiv(a + b − 1, b) and the true ceiling", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000_000, max: 1_000_000_000 }),
        fc.integer({ min: 1, max: 100_000 }),
        (a, b) => {
          const c = ceilDiv(a, b);
          return c === floorDiv(a + b - 1, b) && c * b >= a && (c - 1) * b < a;
        },
      ),
    );
  });

  it("uPm maps a u32 to [0, 999]", () => {
    expect(uPm(0)).toBe(0);
    expect(uPm(U32_MAX)).toBe(999);
    expect(uPm(U32_RANGE / 2)).toBe(500);
    expect(uPm(U32_RANGE / 2 - 1)).toBe(499);
    // the product at the maximum is an exact integer
    expect(Number.isSafeInteger(U32_MAX * 1000)).toBe(true);
  });

  it("uRange maps a u32 to [lo, hi] at both ends", () => {
    expect(uRange(0, -43, 43)).toBe(-43);
    expect(uRange(U32_MAX, -43, 43)).toBe(43);
    expect(uRange(0, -65, 65)).toBe(-65);
    expect(uRange(U32_MAX, -65, 65)).toBe(65);
    expect(uRange(U32_MAX, 0, 0)).toBe(0);
    expect(uRange(U32_MAX, -150, 150)).toBe(150);
    expect(uRange(U32_MAX, 0, 999_999)).toBe(999_999);
    expect(Number.isSafeInteger(U32_MAX * 1_000_000)).toBe(true);
    expect(() => uRange(0, 1, 0)).toThrow();
    expect(() => uRange(0, 0, 1_000_000)).toThrow();
  });

  it("uPm and uRange stay in range and are monotone in u", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: U32_MAX }),
        fc.integer({ min: 0, max: U32_MAX }),
        fc.integer({ min: -500, max: 500 }),
        fc.integer({ min: 0, max: 1000 }),
        (u1, u2, lo, w) => {
          const [a, b] = u1 <= u2 ? [u1, u2] : [u2, u1];
          const hi = lo + w;
          const pa = uPm(a);
          const ra = uRange(a, lo, hi);
          return (
            pa >= 0 &&
            pa <= 999 &&
            pa <= uPm(b) &&
            ra >= lo &&
            ra <= hi &&
            ra <= uRange(b, lo, hi) &&
            Number.isInteger(ra)
          );
        },
      ),
    );
  });
});
