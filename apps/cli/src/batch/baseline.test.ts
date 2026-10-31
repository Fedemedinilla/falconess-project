import type { BalanceCell, BalanceMetric, BalanceReport } from "@falconess/schema";
import { BalanceReport as ReportSchema } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { diffReports, renderDiffMarkdown, verdictChange } from "./baseline.js";
import { renderMarkdown } from "./report.js";

const cell = (id: string, value: number | null, verdict: BalanceCell["verdict"]): BalanceCell => ({
  id,
  value,
  interval: {
    lo: value === null ? null : value - 0.02,
    hi: value === null ? null : value + 0.02,
    method: "wilson",
  },
  target: { min: 0.15, max: 0.35 },
  verdict,
  n: 400,
});

const metric = (
  id: string,
  number: number,
  cells: BalanceCell[],
  verdict: BalanceMetric["verdict"],
): BalanceMetric => ({
  id,
  number,
  scenario: "S1",
  title: `metric ${number}`,
  unit: "rate",
  targetText: "15-35 %",
  verdict,
  cells,
  notes: [],
});

function report(
  metrics: BalanceMetric[],
  verdict: BalanceReport["verdict"],
  runs = 10_000,
): BalanceReport {
  return ReportSchema.parse({
    kind: "falconess-balance-report",
    schemaVersion: 1,
    metadata: {
      rulesetVersion: "v1",
      engine: "v1",
      seasonEngine: "v1",
      profile: "pr",
      runs,
      plannedRaces: runs,
      races: runs,
      seedBase: "",
      seedPattern: "<profile>/<scenario>/<course>/<cell>/<k>",
      scenarios: ["S1"],
      budget: [],
      dnf: 0,
      timing: {
        races: runs,
        engineMs: 1,
        msPerRace: 0.0001,
        seasons: 0,
        seasonMs: 0,
        wallMs: 2,
        workers: 1,
      },
    },
    verdict,
    metrics,
    diagnostics: [],
  });
}

describe("baseline diff", () => {
  const baseline = report(
    [
      metric(
        "m1-style",
        1,
        [
          cell("all/dive", 0.3, "pass"),
          cell("all/ground", 0.2, "pass"),
          cell("all/old", 0.25, "pass"),
        ],
        "pass",
      ),
    ],
    "pass",
  );
  const current = report(
    [
      metric(
        "m1-style",
        1,
        [
          cell("all/dive", 0.36, "inconclusive"),
          cell("all/ground", 0.21, "pass"),
          cell("all/new", 0.4, "fail"),
        ],
        "fail",
      ),
      metric("m6-dispersion", 6, [cell("sprint", 0.012, "pass")], "pass"),
    ],
    "fail",
    1000,
  );

  it("matches cells by metric and cell id, with deltas and verdict changes", () => {
    const diff = diffReports(baseline, current);
    const dive = diff.rows.find((r) => r.cell === "all/dive");
    expect(dive?.delta).toBeCloseTo(0.06, 10);
    expect(dive && verdictChange(dive)).toBe("pass → inconclusive");
    const ground = diff.rows.find((r) => r.cell === "all/ground");
    expect(ground && verdictChange(ground)).toBe("=");
    const old = diff.rows.find((r) => r.cell === "all/old");
    expect(old?.current).toBeUndefined();
    expect(old && verdictChange(old)).toBe("removed (was pass)");
    const fresh = diff.rows.find((r) => r.cell === "all/new");
    expect(fresh && verdictChange(fresh)).toBe("new (fail)");
    expect(diff.metrics.map((m) => [m.id, m.baseline, m.current])).toEqual([
      ["m1-style", "pass", "fail"],
      ["m6-dispersion", undefined, "pass"],
    ]);
    expect(diff.warnings).toEqual(["runs 10000 → 1000"]);
  });

  it("renders a Markdown table with the changed cells first", () => {
    const md = renderDiffMarkdown(diffReports(baseline, current));
    expect(md).toContain("| Metric | Cell | Baseline | Current | Delta | Verdict change |");
    expect(md).toContain(
      "| 1. m1-style | all/dive | 30.0 % | 36.0 % | +6.0 pp | pass → inconclusive |",
    );
    expect(md).toContain("Cells whose verdict changed (4)");
    expect(md).toContain("Not like for like: runs 10000 → 1000.");
    const same = renderDiffMarkdown(diffReports(baseline, baseline));
    expect(same).toContain("No cell changed verdict.");
  });

  it("is embedded in the report Markdown when given", () => {
    const md = renderMarkdown(current, { diff: diffReports(baseline, current) });
    expect(md).toContain("### Diff against the baseline");
    expect(md.indexOf("### Diff against the baseline")).toBeLessThan(md.indexOf("### 1. metric 1"));
  });
});
