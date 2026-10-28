import type { RaceGeometry } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import {
  CHART,
  chartGeometry,
  PACK,
  packWindow,
  scaleStepM,
  tickStepMm,
  trackLayout,
  xAt,
  xIn,
} from "./track";

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
    expect(g.height).toBe(g.lanesY + 8 * g.laneH + CHART.footH);
    expect(g.bandY).toBeGreaterThanOrEqual(g.lanesY + 8 * g.laneH);
    expect(g.ticksY).toBeLessThanOrEqual(g.height);
    expect(xAt(g, 0)).toBe(g.x0);
    expect(xAt(g, 1)).toBe(g.x1);
    expect(xAt(g, 2)).toBe(g.x1);
    expect(xAt(g, 0.5)).toBe((g.x0 + g.x1) / 2);
  });

  it("never gets narrower than a phone can draw", () => {
    expect(chartGeometry(20, 8).width).toBe(160);
  });

  it("maps a window of the course onto the plot", () => {
    const g = chartGeometry(400, 8);
    const w = { a: 1_000_000, b: 1_100_000 };
    expect(xIn(g, w, 1_000_000)).toBe(g.x0);
    expect(xIn(g, w, 1_100_000)).toBe(g.x1);
    expect(xIn(g, w, 1_050_000)).toBe((g.x0 + g.x1) / 2);
    expect(xIn(g, w, 900_000)).toBeLessThan(g.x0);
  });
});

describe("packWindow", () => {
  const L = 2_000_000;

  it("frames the start while the pack is near it", () => {
    expect(packWindow([0, 0, 0], L)).toEqual({ a: 0, b: PACK.minSpanMm, span: PACK.minSpanMm });
    expect(packWindow([30_000, 20_000], L).a).toBe(0);
  });

  it("keeps everyone in view, from just behind the last to just ahead of the first", () => {
    const w = packWindow([900_000, 1_000_000, 700_000], L);
    expect(w.b).toBe(1_000_000 + PACK.aheadMm);
    expect(w.a).toBe(700_000 - PACK.behindMm);
  });

  it("never gets narrower than the minimum, nor wider than the course", () => {
    const close = packWindow([1_000_000, 1_001_000], L);
    expect(close.b - close.a).toBe(PACK.minSpanMm);
    const spread = packWindow([0, L], L);
    expect(spread.span).toBe(L + PACK.aheadMm);
  });

  it("uses an eased width when given one", () => {
    const w = packWindow([1_000_000, 1_001_000], L, 150_000);
    expect(w.b - w.a).toBe(150_000);
    expect(w.span).toBe(PACK.minSpanMm);
  });

  it("frames the finish once everyone is home", () => {
    const w = packWindow([L, L, L], L);
    expect(w.b).toBe(L + PACK.aheadMm);
  });
});

describe("tickStepMm", () => {
  it("picks a round step with at most the asked number of marks", () => {
    expect(tickStepMm(80_000, 5)).toBe(20_000);
    expect(tickStepMm(80_000, 8)).toBe(10_000);
    expect(tickStepMm(2_000_000, 5)).toBe(500_000);
    expect(tickStepMm(9_000_000, 5)).toBe(1_000_000);
  });
});
