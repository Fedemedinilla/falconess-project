import { describe, expect, it } from "vitest";
import { cellVerdict, combineVerdicts } from "./verdict.js";

const band = { min: 0.15, max: 0.35 };
const weak = { min: null, max: 0.15 };
const atLeast = { min: 0.6, max: null };

describe("cell verdicts (§25.2.1)", () => {
  it("passes when the interval lies inside the band, edges included", () => {
    expect(cellVerdict({ lo: 0.2, hi: 0.3 }, band)).toBe("pass");
    expect(cellVerdict({ lo: 0.15, hi: 0.35 }, band)).toBe("pass");
  });

  it("fails only when the interval lies entirely outside", () => {
    expect(cellVerdict({ lo: 0.36, hi: 0.4 }, band)).toBe("fail");
    expect(cellVerdict({ lo: 0.01, hi: 0.149 }, band)).toBe("fail");
    expect(cellVerdict({ lo: 0.3, hi: 0.4 }, band)).toBe("inconclusive");
    expect(cellVerdict({ lo: 0.1, hi: 0.4 }, band)).toBe("inconclusive");
  });

  it("judges a one-sided target by its bound only", () => {
    expect(cellVerdict({ lo: 0, hi: 0.15 }, weak)).toBe("pass");
    expect(cellVerdict({ lo: 0.1, hi: 0.2 }, weak)).toBe("inconclusive");
    expect(cellVerdict({ lo: 0.16, hi: 0.2 }, weak)).toBe("fail");
    expect(cellVerdict({ lo: 0.61, hi: 0.9 }, atLeast)).toBe("pass");
    expect(cellVerdict({ lo: 0.4, hi: 0.59 }, atLeast)).toBe("fail");
  });

  it("treats null bounds as unbounded", () => {
    expect(cellVerdict({ lo: null, hi: null }, band)).toBe("inconclusive");
    expect(cellVerdict({ lo: 0.5, hi: null }, band)).toBe("fail");
    expect(cellVerdict({ lo: null, hi: -0.01 }, { min: 0, max: null })).toBe("fail");
  });
});

describe("combining cells into a metric (revision 4)", () => {
  it("passes only if every cell passes and fails if any cell fails", () => {
    expect(combineVerdicts(["pass", "pass"])).toBe("pass");
    expect(combineVerdicts(["pass", "inconclusive"])).toBe("inconclusive");
    expect(combineVerdicts(["inconclusive", "fail", "pass"])).toBe("fail");
    expect(combineVerdicts([])).toBe("inconclusive");
  });
});
