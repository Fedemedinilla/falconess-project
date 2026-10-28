import type { RaceGeometry } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { chartGeometry, scaleStepM, trackLayout, xAt } from "./track";

const ridge: RaceGeometry = {
  biome: "desert",
  lengthMm: 2_000_000,
  startEndMm: 333_333,
  finalStartMm: 1_333_333,
  hoverAttackMm: 1_400_000,
  reserveAtMm: 1_940_000,
  denseFromMm: 1_975_000,
  segments: [
    { type: "flat", startMm: 0, endMm: 300_000, param: 0 },
    { type: "descent", startMm: 300_000, endMm: 700_000, param: 300 },
    { type: "jump", startMm: 700_000, endMm: 800_000, param: 20 },
    { type: "flat", startMm: 800_000, endMm: 2_000_000, param: 0 },
  ],
};

describe("trackLayout", () => {
  const layout = trackLayout(ridge);

  it("places segments as fractions of the course, end to end", () => {
    expect(layout.segments.map((s) => [s.type, s.from, s.to])).toEqual([
      ["flat", 0, 0.15],
      ["descent", 0.15, 0.35],
      ["jump", 0.35, 0.4],
      ["flat", 0.4, 1],
    ]);
  });

  it("splits the course into its three phases and marks the 60 m reserve", () => {
    expect(layout.phases.map((p) => p.name)).toEqual(["start", "middle", "final"]);
    expect(layout.phases[0]?.from).toBe(0);
    expect(layout.phases[1]?.from).toBeCloseTo(333_333 / 2_000_000, 9);
    expect(layout.phases[2]?.to).toBe(1);
    expect(layout.reserve).toEqual({ mm: 1_940_000, at: 0.97 });
  });

  it("has no reserve mark on a course shorter than 60 m", () => {
    expect(trackLayout({ ...ridge, reserveAtMm: 0 }).reserve).toBeNull();
  });

  it("marks round distances and always the finish", () => {
    expect(layout.scale.map((m) => m.mm)).toEqual([0, 500_000, 1_000_000, 1_500_000, 2_000_000]);
    const sprint = trackLayout({ ...ridge, lengthMm: 1_200_000 });
    expect(sprint.scale.map((m) => m.mm)).toEqual([
      0, 200_000, 400_000, 600_000, 800_000, 1_000_000, 1_200_000,
    ]);
    const odd = trackLayout({ ...ridge, lengthMm: 2_080_000 });
    expect(odd.scale.at(-1)?.mm).toBe(2_080_000);
    expect(odd.scale.at(-2)?.mm).toBe(1_500_000);
  });

  it("picks the smallest round step for the marks", () => {
    expect(scaleStepM(1_200_000, 6)).toBe(200);
    expect(scaleStepM(3_000_000, 6)).toBe(500);
    expect(scaleStepM(250_000, 6)).toBe(50);
  });
});

describe("chartGeometry", () => {
  it("sizes the plot to its width and one row per lane", () => {
    const g = chartGeometry(400, 8);
    expect(g.width).toBe(400);
    expect(g.height).toBe(g.lanesY + 8 * g.laneH + 6);
    expect(xAt(g, 0)).toBe(g.x0);
    expect(xAt(g, 1)).toBe(g.x1);
    expect(xAt(g, 2)).toBe(g.x1);
    expect(xAt(g, 0.5)).toBe((g.x0 + g.x1) / 2);
  });

  it("never gets narrower than a phone can draw", () => {
    expect(chartGeometry(20, 8).width).toBe(160);
  });
});
