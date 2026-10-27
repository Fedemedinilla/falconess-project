import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { clamp, divFP, FP, floorDiv, mulDiv, mulFP, scale, toPermille } from "./fixed.js";

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
