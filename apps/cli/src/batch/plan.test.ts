import { loadContent } from "@falconess/content";
import { describe, expect, it } from "vitest";
import { buildCatalog } from "./catalog.js";
import {
  allocate,
  BUDGET,
  type BudgetKey,
  buildPlan,
  defaultScenarios,
  extendS3,
  PlanError,
  plannedRaces,
  resolveScenarios,
  seedFor,
} from "./plan.js";

const catalog = buildCatalog(loadContent());

/** v1 cell counts of every budget line. */
const V1_CELLS = new Map<BudgetKey, number>([
  ["S1", 3],
  ["S2-real", 3],
  ["S2-equal-pw", 3],
  ["S3", 9],
  ["S4", 31],
  ["S5", 24],
  ["S7", 3],
  ["S8", 12],
  ["quirks", 36],
  ["stats", 15],
]);

function races(alloc: ReturnType<typeof allocate>): Record<string, number> {
  return Object.fromEntries(
    BUDGET.map((r) => [
      r.key,
      (alloc.get(r.key) ?? []).reduce((s, n) => s + n, 0) * r.racesPerUnit,
    ]),
  );
}

describe("run budget (§25.2.1)", () => {
  it("reproduces the pr table at --runs 10000", () => {
    const alloc = allocate("pr", 10_000, V1_CELLS);
    expect(races(alloc)).toEqual({
      S1: 1200,
      "S2-real": 600,
      "S2-equal-pw": 900,
      S3: 2700,
      S4: 1240,
      S5: 1440,
      S7: 720,
      S8: 1200,
      quirks: 0,
      stats: 0,
    });
    expect(alloc.get("S1")).toEqual([400, 400, 400]);
    expect(Object.values(races(alloc)).reduce((a, b) => a + b, 0)).toBe(10_000);
  });

  it("scales each count by runs / 10 000 (floored, ≥ 1) and lets S1 absorb the remainder", () => {
    const thousand = allocate("pr", 1000, V1_CELLS);
    expect(Object.values(races(thousand)).reduce((a, b) => a + b, 0)).toBe(1000);
    expect(thousand.get("S1")).toEqual([40, 40, 40]);
    expect(thousand.get("S4")?.[0]).toBe(2);
    const odd = allocate("pr", 10_001, V1_CELLS);
    expect(odd.get("S1")).toEqual([401, 400, 400]);
    const small = allocate("pr", 400, V1_CELLS);
    expect(small.get("S5")?.every((n) => n === 1)).toBe(true);
    expect(small.get("S4")?.every((n) => n === 1)).toBe(true);
    expect(Object.values(races(small)).reduce((a, b) => a + b, 0)).toBe(400);
  });

  it("refuses a pr budget too small for one S1 race per course", () => {
    expect(() => allocate("pr", 217, V1_CELLS)).toThrow(PlanError);
    // Counts scale with runs, so the fit is not monotone: 296 fits, 300 does not.
    expect(() => allocate("pr", 296, V1_CELLS)).not.toThrow();
    expect(() => allocate("pr", 300, V1_CELLS)).toThrow(/next budget that fits is --runs \d+/);
  });

  it("uses the fixed full counts and ignores --runs", () => {
    const full = allocate("full", 5, V1_CELLS);
    expect(races(full)).toEqual({
      S1: 2400,
      "S2-real": 1800,
      "S2-equal-pw": 1800,
      S3: 72_000,
      S4: 6200,
      S5: 72_000,
      S7: 6000,
      S8: 90_000,
      quirks: 14_400,
      stats: 3000,
    });
  });
});

describe("seeds and jobs", () => {
  it("names seeds <profile>/<scenario>/<course>/<cell>/<k>, optionally prefixed", () => {
    expect(seedFor("", "pr", "S1", "desert-sprint", "field", 0)).toBe(
      "pr/S1/desert-sprint/field/0",
    );
    expect(seedFor("nightly", "full", "S4", "desert-ridge", "stoop-strike", 7)).toBe(
      "nightly/full/S4/desert-ridge/stoop-strike/7",
    );
  });

  it("numbers jobs in plan order with one distinct seed each", () => {
    const plan = buildPlan(
      { profile: "pr", runs: 10_000, scenarios: defaultScenarios("pr"), seedBase: "" },
      catalog,
    );
    expect(plannedRaces(plan)).toBe(10_000);
    expect(plan.jobs.map((j) => j.id)).toEqual(plan.jobs.map((_, i) => i));
    expect(new Set(plan.jobs.map((j) => j.seed)).size).toBe(plan.jobs.length);
    expect(plan.jobs[0]).toEqual({
      id: 0,
      scenario: "S1",
      course: "desert-sprint",
      k: 0,
      seed: "pr/S1/desert-sprint/field/0",
    });
    const s8 = plan.jobs.filter((j) => j.scenario === "S8");
    expect(s8).toHaveLength(12 * 20);
    expect(s8[0]?.seed).toBe("pr/S8/desert-sprint/dive/0");
    expect(plan.jobs.filter((j) => j.scenario === "S7")[0]?.seed).toBe("pr/S7/season/caracara/0");
  });

  it("gives a cell the same jobs whatever the --scenarios selection", () => {
    const all = buildPlan(
      { profile: "pr", runs: 10_000, scenarios: defaultScenarios("pr"), seedBase: "" },
      catalog,
    );
    const only = buildPlan(
      { profile: "pr", runs: 10_000, scenarios: ["S3"], seedBase: "" },
      catalog,
    );
    const strip = (j: { id: number }) => ({ ...j, id: 0 });
    expect(only.jobs.map(strip)).toEqual(all.jobs.filter((j) => j.scenario === "S3").map(strip));
  });

  it("pulls S1 in for S6 and for S5's pr conversion; quirks and stats need full", () => {
    expect(resolveScenarios("pr", ["S6"])).toEqual(["S1", "S6"]);
    expect(resolveScenarios("pr", ["S5"])).toEqual(["S1", "S5", "S6"]);
    expect(resolveScenarios("full", ["S5"])).toEqual(["S5"]);
    expect(resolveScenarios("pr", ["S1"])).toEqual(["S1", "S6"]);
    expect(() => resolveScenarios("pr", ["quirks"])).toThrow(PlanError);
    expect(defaultScenarios("full")).toContain("stats");
    expect(defaultScenarios("pr")).not.toContain("quirks");
  });

  it("doubles the samples of the requested S3 cells, continuing k (full)", () => {
    const plan = buildPlan({ profile: "full", runs: 1, scenarios: ["S3"], seedBase: "" }, catalog);
    expect(plan.jobs).toHaveLength(9 * 4000);
    const { plan: next, jobs } = extendS3(plan, [{ pair: "peregrina", course: "desert-ridge" }]);
    expect(jobs).toHaveLength(4000);
    expect(jobs[0]).toMatchObject({
      id: 36_000,
      pair: "peregrina",
      course: "desert-ridge",
      k: 4000,
      seed: "full/S3/desert-ridge/peregrina/4000",
    });
    expect(next.jobs).toHaveLength(40_000);
    const line = next.lines.find((l) => l.row.key === "S3");
    expect(line?.perCell.filter((n) => n === 8000)).toHaveLength(1);
    expect(extendS3(plan, []).jobs).toHaveLength(0);
  });
});
