import { loadContent } from "@falconess/content";
import { BalanceReport } from "@falconess/schema";
import { RULESET_V1 } from "@falconess/sim";
import { describe, expect, it } from "vitest";
import { buildCatalog } from "./catalog.js";
import { createEngineAdapter, EngineUnavailableError } from "./engine-adapter.js";
import type { RaceEnginePort } from "./engine-port.js";
import { createExecContext, runJob } from "./execute.js";
import { arenaUses, createFakeEngine } from "./fake-engine.js";
import { type BatchConfig, defaultScenarios } from "./plan.js";
import { createWorkerPoolExecutor } from "./pool.js";
import { REPORT_MARKER, renderMarkdown } from "./report.js";
import { runBatch } from "./run.js";

const content = loadContent();
const catalog = buildCatalog(content);

const config = (runs: number): BatchConfig => ({
  profile: "pr",
  runs,
  scenarios: defaultScenarios("pr"),
  seedBase: "",
});

function withoutTiming(r: BalanceReport): unknown {
  const { timing: _t, ...metadata } = r.metadata;
  return { ...r, metadata };
}

describe("engine adapter", () => {
  it("refuses to run until the race engine is wired", () => {
    expect(() => createEngineAdapter()).toThrow(EngineUnavailableError);
    expect(() => createEngineAdapter()).toThrow(/race engine not available yet/);
  });
});

describe("job execution", () => {
  it("reuses one arena and one geometry per course, always with detail results", () => {
    const fake = createFakeEngine();
    const details: string[] = [];
    const port: RaceEnginePort = {
      ...fake,
      simulateRace: (ruleset, entries, course, seed, opts) => {
        details.push(opts?.detail ?? "none");
        return fake.simulateRace(ruleset, entries, course, seed, opts);
      },
    };
    const ctx = createExecContext(port, RULESET_V1, content, catalog);
    for (let k = 0; k < 3; k++)
      runJob(ctx, { id: k, scenario: "S1", course: "desert-sprint", k, seed: `s/${k}` });
    runJob(ctx, {
      id: 3,
      scenario: "S4",
      skill: "canyon-sense",
      course: "desert-canyon",
      k: 0,
      seed: "s4",
    });
    expect(arenaUses.get(ctx.arena)).toBe(5);
    expect([...ctx.geometry.keys()]).toEqual(["desert-sprint", "desert-canyon"]);
    expect(new Set(details)).toEqual(new Set(["results"]));
    expect(ctx.timing.races).toBe(5);
  });

  it("records finish times by role and counts DNFs", () => {
    const fake = createFakeEngine();
    const port: RaceEnginePort = {
      ...fake,
      simulateRace: (...args) => {
        const log = fake.simulateRace(...args);
        const results = log.results.map((r) =>
          r.runnerId === "hover-2" ? { ...r, dnf: true, finishMilli: null } : r,
        );
        return { ...log, results };
      },
    };
    const ctx = createExecContext(port, RULESET_V1, content, catalog);
    const r = runJob(ctx, { id: 0, scenario: "S1", course: "desert-ridge", k: 0, seed: "x" });
    expect(r.dnf).toBe(1);
    expect(r.races[0]?.finish[3]).toBeNull();
    expect(r.races[0]?.finish.filter((t) => t !== null)).toHaveLength(7);
    expect(r.races[0]?.phaseTicks).toHaveLength(8);
  });

  it("plays S7 seasons through the season engine with the reference policy", () => {
    const ctx = createExecContext(createFakeEngine(), RULESET_V1, content, catalog);
    const r = runJob(ctx, { id: 0, scenario: "S7", falconess: "cernicala", k: 0, seed: "s7/0" });
    expect(r.season?.goals.map((g) => g.turn)).toEqual([12, 24, 36, 46]);
    expect(r.season?.score.total).toBe(
      (r.season?.score.stats ?? 0) + (r.season?.score.skills ?? 0) + (r.season?.score.races ?? 0),
    );
    expect(ctx.timing.seasons).toBe(1);
    expect(ctx.timing.races).toBe(0);
  });
});

describe("runBatch with the fake engine", () => {
  it("writes a valid report whose budget adds up to --runs", async () => {
    const report = await runBatch({
      config: config(1000),
      workers: 1,
      engine: { kind: "fake", options: {} },
      engineId: "fake",
      ruleset: RULESET_V1,
      content,
    });
    expect(BalanceReport.parse(report)).toEqual(report);
    expect(report.metadata.plannedRaces).toBe(1000);
    expect(report.metadata.races).toBeLessThanOrEqual(1000);
    expect(report.metadata.engine).toBe("fake");
    expect(report.metadata.seasonEngine).toBe("stub");
    expect(report.metrics.map((m) => m.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const s1 = report.metadata.budget.find((b) => b.key === "S1");
    expect(s1?.perCell).toEqual([40, 40, 40]);
    expect(report.metadata.timing.races).toBe(
      report.metadata.races - (report.metadata.budget.find((b) => b.key === "S7")?.races ?? 0),
    );
    const md = renderMarkdown(report);
    expect(md.startsWith(REPORT_MARKER)).toBe(true);
    expect(md).toContain("## Balance report:");
    expect(md).toContain("### 3. Generic vs signature");
    expect(md).toContain("<summary>Diagnostics");
    const short = renderMarkdown(report, { maxLength: 2000 });
    expect(short).not.toContain("<summary>Diagnostics");
    expect(short).toContain("Diagnostics omitted");
  });

  it("produces the same report for --workers 1 and --workers 3 (timing aside)", async () => {
    const run = (workers: number) =>
      runBatch({
        config: config(600),
        workers,
        engine: { kind: "fake", options: { tieGranularityMilli: 500 } },
        engineId: "fake",
        ruleset: RULESET_V1,
        content,
      });
    const one = await run(1);
    const three = await run(3);
    expect(three.metadata.timing.workers).toBe(3);
    expect(one.metadata.timing.workers).toBe(1);
    expect(withoutTiming(three)).toEqual(withoutTiming(one));
    expect(JSON.stringify(withoutTiming(three))).toBe(JSON.stringify(withoutTiming(one)));
  }, 60_000);

  it("surfaces a job error raised inside a worker and still shuts the pool down", async () => {
    const pool = createWorkerPoolExecutor({
      workers: 2,
      engine: { kind: "fake", options: {} },
      ruleset: RULESET_V1,
      content,
      catalog,
    });
    await expect(
      pool.run([
        { id: 0, scenario: "S1", course: "desert-sprint", k: 0, seed: "ok" },
        { id: 1, scenario: "S3", pair: "nobody", course: "desert-sprint", k: 0, seed: "bad" },
      ]),
    ).rejects.toThrow(/S3: unknown pair nobody/);
    const timing = await pool.close();
    expect(timing.races).toBeGreaterThanOrEqual(0);
  }, 30_000);

  it("changes every seed with --seed and keeps the report valid", async () => {
    const base = await runBatch({
      config: { ...config(400), scenarios: ["S1", "S6"] },
      workers: 1,
      engine: { kind: "fake", options: {} },
      engineId: "fake",
      ruleset: RULESET_V1,
      content,
    });
    const other = await runBatch({
      config: { ...config(400), scenarios: ["S1", "S6"], seedBase: "alt" },
      workers: 1,
      engine: { kind: "fake", options: {} },
      engineId: "fake",
      ruleset: RULESET_V1,
      content,
    });
    expect(other.metadata.seedPattern).toBe("alt/<profile>/<scenario>/<course>/<cell>/<k>");
    expect(other.metrics[0]?.cells[0]?.value).not.toBe(base.metrics[0]?.cells[0]?.value);
    expect(base.metrics.map((m) => m.id)).toEqual(["m1-style", "m6-dispersion"]);
  });
});
