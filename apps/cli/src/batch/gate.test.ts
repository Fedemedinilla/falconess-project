import type { BalanceCell, BalanceMetric, BalanceReport } from "@falconess/schema";
import { BalanceReport as ReportSchema } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { exitDecision, judgeGate, parseReportText } from "./gate.js";

// The S3 signature band of §25.2 (0.85-0.90): the deadlock scenario of review finding T2.
const BAND = { min: 0.85, max: 0.9 };

const cell = (
  id: string,
  value: number,
  verdict: BalanceCell["verdict"],
  target: BalanceCell["target"] = BAND,
  halfWidth = 0.02,
): BalanceCell => ({
  id,
  value,
  interval: { lo: value - halfWidth, hi: value + halfWidth, method: "share-ratio" },
  target,
  verdict,
  n: 150,
});

const m3 = (cells: BalanceCell[]): BalanceMetric => ({
  id: "m3-signature",
  number: 3,
  scenario: "S3",
  title: "Generic vs signature",
  unit: "ratio",
  targetText: "0.85-0.90",
  verdict: cells.some((c) => c.verdict === "fail") ? "fail" : "pass",
  cells,
  notes: [],
});

function report(
  metrics: BalanceMetric[],
  over: { profile?: "pr" | "full"; dnf?: number; wallMs?: number; scenarios?: string[] } = {},
): BalanceReport {
  const verdicts = metrics.map((m) => m.verdict);
  return ReportSchema.parse({
    kind: "falconess-balance-report",
    schemaVersion: 1,
    metadata: {
      rulesetVersion: "v1",
      engine: "v1",
      seasonEngine: "v1",
      profile: over.profile ?? "pr",
      runs: 10_000,
      plannedRaces: 10_000,
      races: 10_000,
      seedBase: "",
      seedPattern: "<profile>/<scenario>/<course>/<cell>/<k>",
      scenarios: over.scenarios ?? ["S3"],
      budget: [],
      dnf: over.dnf ?? 0,
      timing: {
        races: 10_000,
        engineMs: 1,
        msPerRace: 0.0001,
        seasons: 0,
        seasonMs: 0,
        wallMs: over.wallMs ?? 6_800,
        workers: 4,
      },
    },
    verdict: verdicts.includes("fail") ? "fail" : "pass",
    metrics,
    diagnostics: [],
  });
}

// main's last full report: every peregrina cell of metric 3 fails (ratios 0.14-1.34)
const gate = report(
  [
    m3([
      cell("peregrina/sprint", 1.34, "fail"),
      cell("peregrina/ridge", 0.14, "fail"),
      cell("peregrina/canyon", 0.6, "fail"),
      cell("caracara/sprint", 0.87, "pass"),
    ]),
  ],
  { profile: "full" },
);

describe("judgeGate (§25.2.1: fail until a PR fixes the metric or moves the target)", () => {
  it("lifts a gate fail the PR fixes, keeps one it leaves inconclusive or failing", () => {
    const current = report([
      m3([
        cell("peregrina/sprint", 0.88, "pass"),
        cell("peregrina/ridge", 0.86, "inconclusive", BAND, 0.05),
        cell("peregrina/canyon", 0.6, "fail"),
        cell("caracara/sprint", 0.87, "pass"),
      ]),
    ]);
    expect(judgeGate(gate, current).map((g) => [g.cell, g.status])).toEqual([
      ["peregrina/sprint", "lifted"],
      ["peregrina/ridge", "failing"],
      ["peregrina/canyon", "failing"],
    ]);
  });

  it("lifts a gate fail whose target the PR moved so that the gate's interval no longer fails", () => {
    const wide = { min: 0.1, max: 1.4 };
    const current = report([
      m3([
        cell("peregrina/sprint", 1.34, "inconclusive", wide, 0.1),
        cell("peregrina/ridge", 0.14, "inconclusive", { min: 0.5, max: 1.4 }, 0.5),
        cell("peregrina/canyon", 0.6, "inconclusive", { min: 0.8, max: 0.95 }, 0.3),
      ]),
    ]);
    const out = judgeGate(gate, current);
    expect(out.map((g) => [g.cell, g.status])).toEqual([
      ["peregrina/sprint", "lifted"],
      // moved, but the gate's [0.12, 0.16] still lies outside [0.5, 1.4]
      ["peregrina/ridge", "failing"],
      ["peregrina/canyon", "failing"],
    ]);
    expect(out[0]?.reason).toMatch(/target moved/);
  });

  it("lifts a cell the PR removed, but not one of a scenario the run left out", () => {
    const removed = report([m3([cell("caracara/sprint", 0.87, "pass")])]);
    expect(new Set(judgeGate(gate, removed).map((g) => g.status))).toEqual(new Set(["lifted"]));
    const subset = report([], { scenarios: ["S1"] });
    expect(new Set(judgeGate(gate, subset).map((g) => g.status))).toEqual(new Set(["failing"]));
  });
});

describe("exitDecision", () => {
  const passing = report([
    m3([
      cell("peregrina/sprint", 0.88, "pass"),
      cell("peregrina/ridge", 0.87, "pass"),
      cell("peregrina/canyon", 0.86, "pass"),
    ]),
  ]);
  const checks = { failOnVerdict: true, maxWallMs: undefined, gate: undefined };

  it("does not block the PR that fixes the gate's failing metric (finding T2)", () => {
    const d = exitDecision(passing, { ...checks, gate: { ok: true, report: gate } });
    expect(d.code).toBe(0);
    expect(d.gate?.every((g) => g.status === "lifted")).toBe(true);
  });

  it("blocks a PR that leaves a gate fail in place, naming the cells", () => {
    const untouched = report([
      m3([
        cell("peregrina/sprint", 0.88, "pass"),
        cell("peregrina/ridge", 0.86, "inconclusive", BAND, 0.05),
        cell("peregrina/canyon", 0.87, "pass"),
      ]),
    ]);
    const d = exitDecision(untouched, {
      ...checks,
      gate: { ok: true, report: gate },
      gatePath: "out/full/balance.json",
    });
    expect(d.code).toBe(1);
    expect(d.lines.join("\n")).toMatch(/out\/full\/balance.json holds 1 fail cell/);
    expect(d.lines.join("\n")).toContain("3. m3-signature peregrina/ridge");
  });

  it("fails on the report's own fail verdict, a DNF, and the wall-time budget", () => {
    expect(exitDecision(gate, checks).code).toBe(1);
    expect(exitDecision(gate, { ...checks, failOnVerdict: false }).code).toBe(0);
    expect(exitDecision(report([], { dnf: 2 }), { ...checks, failOnVerdict: false }).code).toBe(1);
    // 24.4: --runs 10000 under 60 s, --runs 1000 under 6 s
    const slow = report([], { wallMs: 68_000 });
    const budget = { failOnVerdict: false, gate: undefined };
    expect(exitDecision(slow, { ...budget, maxWallMs: 60_000 }).code).toBe(1);
    expect(exitDecision(slow, { ...budget, maxWallMs: 60_000 }).lines[0]).toMatch(
      /68000 ms .* over the 60000 ms budget/,
    );
    expect(exitDecision(report([], { wallMs: 6_800 }), { ...budget, maxWallMs: 60_000 }).code).toBe(
      0,
    );
    expect(exitDecision(report([], { wallMs: 6_000 }), { ...budget, maxWallMs: 6_000 }).code).toBe(
      1,
    );
  });

  it("skips an unreadable gate report with a warning instead of failing or throwing", () => {
    const d = exitDecision(passing, {
      ...checks,
      gate: { ok: false, reason: "another report schema" },
    });
    expect(d.code).toBe(0);
    expect(d.lines[0]).toMatch(/warning: .* skipped, another report schema/);
  });
});

describe("parseReportText (finding T3)", () => {
  const text = JSON.stringify(passing());
  function passing(): BalanceReport {
    return report([m3([cell("peregrina/sprint", 0.88, "pass")])]);
  }

  it("reads a report of this revision", () => {
    const r = parseReportText(text);
    expect(r.ok && r.report.verdict).toBe("pass");
  });

  it("returns a reason for a report of another schema revision, never throws", () => {
    const json = JSON.parse(text);
    const extra = parseReportText(
      JSON.stringify({ ...json, metadata: { ...json.metadata, gitSha: "abc" } }),
    );
    expect(extra.ok).toBe(false);
    if (!extra.ok) expect(extra.reason).toMatch(/another report schema.*metadata.*gitSha/);
    const v2 = parseReportText(JSON.stringify({ ...json, schemaVersion: 2 }));
    expect(v2.ok).toBe(false);
    if (!v2.ok) expect(v2.reason).toMatch(/schemaVersion/);
    const broken = parseReportText("{");
    expect(broken.ok).toBe(false);
    if (!broken.ok) expect(broken.reason).toMatch(/not JSON/);
  });
});
