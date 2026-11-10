import { calendarOptionalRuns } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { loadCalendar, loadCatalogueCourses, loadContent } from "./node.js";

describe("v3 calendar (ADR-0011 §6)", () => {
  const cal = loadCalendar("v3");
  it("names only known tracks and every catalogue track", () => {
    const known = new Set([
      ...loadContent().courses.keys(),
      ...loadCatalogueCourses().map((c) => c.id),
    ]);
    expect(cal.catalogue.every((t) => known.has(t))).toBe(true);
    expect(cal.catalogue).toHaveLength(9);
  });
  it("spreads the optional runs like the offers: the track of the month weighs more", () => {
    const w = calendarOptionalRuns(cal);
    const sum = Object.values(w).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(cal.optionalRunsPerSeason, 9);
    // design7 criterios.json calendarV3.offerSlots: 6.6667 per track, 8.6667 with two months
    expect((w.canyon ?? 0) * (66 / 8)).toBeCloseTo(8.6667, 3);
    expect((w.steps ?? 0) * (66 / 8)).toBeCloseTo(6.6667, 3);
  });
});
