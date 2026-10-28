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
    });
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
