import { describe, expect, it } from "vitest";
import { placeCounts } from "./goal-rate.js";

describe("placeCounts", () => {
  it("counts places with index 0 = 1st and keeps at least the field size", () => {
    expect(placeCounts([1, 1, 3, 8])).toEqual([2, 0, 1, 0, 0, 0, 0, 1]);
    expect(placeCounts([])).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(placeCounts([2], 2)).toEqual([0, 1]);
  });

  it("grows past the field size when a place exceeds it", () => {
    expect(placeCounts([9], 8)).toHaveLength(9);
  });

  it("handles a long batch without overflowing the stack", () => {
    const places = Array.from({ length: 300_000 }, (_, i) => (i % 8) + 1);
    const counts = placeCounts(places);
    expect(counts).toHaveLength(8);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(300_000);
  });
});
