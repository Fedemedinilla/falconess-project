import { CURRENT_RULESET } from "@falconess/sim";
import { describe, expect, it } from "vitest";
import { parseBatchArgs, UsageError } from "./options.js";

describe("sim:batch command line", () => {
  it("defaults to the pr profile, 10 000 runs, every pr scenario and out/balance.json", () => {
    const o = parseBatchArgs([]);
    expect(o.config).toEqual({
      profile: "pr",
      runs: 10_000,
      scenarios: ["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"],
      seedBase: "",
    });
    expect(o.reportPath).toBe("out/balance.json");
    expect(o.engine).toEqual({ kind: "real" });
    expect(o.workers).toBeGreaterThanOrEqual(1);
    expect(o.workers).toBeLessThanOrEqual(4);
    expect(o.failOnVerdict).toBe(false);
    // the rules new runs play (ADR-0006 «Métrica 7»: S7 passes or is inconclusive under v2)
    expect(o.rulesetVersion).toBe(CURRENT_RULESET.version);
    expect(o.rulesetVersion).toBe("v3");
  });

  it("takes --ruleset for S7's seasons and rejects an unknown one (ADR-0006)", () => {
    expect(parseBatchArgs(["--ruleset", "v1"]).rulesetVersion).toBe("v1");
    expect(parseBatchArgs(["--ruleset", "v2"]).rulesetVersion).toBe("v2");
    expect(() => parseBatchArgs(["--ruleset", "v9"])).toThrow(UsageError);
    expect(() => parseBatchArgs(["--ruleset"])).toThrow(/needs a value/);
  });

  it("parses every option, with pnpm's -- separator and the default alias", () => {
    const o = parseBatchArgs([
      "--",
      "--runs",
      "1000",
      "--profile",
      "default",
      "--scenarios",
      "S1,S3",
      "--seed",
      "base",
      "--report",
      "r.json",
      "--baseline",
      "b.json",
      "--markdown",
      "r.md",
      "--workers",
      "3",
      "--engine",
      "fake",
      "--fail-on-verdict",
      "--gate-report",
      "full.json",
      "--max-wall-ms",
      "6000",
      "--baseline-from",
      "run 42 (abc1234)",
    ]);
    expect(o.config).toEqual({
      profile: "pr",
      runs: 1000,
      scenarios: ["S1", "S3", "S6"],
      seedBase: "base",
    });
    expect(o).toMatchObject({
      reportPath: "r.json",
      baselinePath: "b.json",
      markdownPath: "r.md",
      workers: 3,
      engine: { kind: "fake" },
      failOnVerdict: true,
      gateReportPath: "full.json",
      maxWallMs: 6000,
      baselineFrom: "run 42 (abc1234)",
    });
    expect(parseBatchArgs([]).maxWallMs).toBeUndefined();
    expect(() => parseBatchArgs(["--max-wall-ms", "0"])).toThrow(/positive integer/);
    expect(() => parseBatchArgs(["--max-wall-ms"])).toThrow(/needs a value/);
  });

  it("passes --fake-cost-ms to the fake engine only", () => {
    expect(parseBatchArgs(["--engine", "fake", "--fake-cost-ms", "5"]).engine).toEqual({
      kind: "fake",
      options: { costMsPer8Runners: 5 },
    });
    expect(() => parseBatchArgs(["--fake-cost-ms", "5"])).toThrow(/needs --engine fake/);
  });

  it("adds the diagnostics in the full profile", () => {
    expect(parseBatchArgs(["--profile", "full"]).config.scenarios).toContain("quirks");
  });

  it("rejects unknown options, bad numbers, unknown scenarios and full-only scenarios in pr", () => {
    expect(() => parseBatchArgs(["--runz", "5"])).toThrow(UsageError);
    expect(() => parseBatchArgs(["--runs", "ten"])).toThrow(UsageError);
    expect(() => parseBatchArgs(["--workers", "0"])).toThrow(UsageError);
    expect(() => parseBatchArgs(["--scenarios", "S9"])).toThrow(/unknown scenario/);
    expect(() => parseBatchArgs(["--scenarios", "stats"])).toThrow(/full profile/);
    expect(() => parseBatchArgs(["--profile", "nightly"])).toThrow(UsageError);
    expect(() => parseBatchArgs(["--report"])).toThrow(/needs a value/);
  });
});
