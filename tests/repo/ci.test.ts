import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CI gates that docs/race-engine.md requires (22, 24.3, 24.4). The race benchmark asserts the p95
 * budget (packages/sim/bench/race.bench.ts) only when `pnpm bench` runs, so CI must run it, in a
 * job of its own whose only failure mode is that gate.
 */
const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

/** The `run:` commands of each job of a workflow (single-line `run:` steps only). */
function jobRuns(workflow: string): Map<string, string[]> {
  const jobs = new Map<string, string[]>();
  const lines = workflow.split("\n");
  let current: string[] | null = null;
  for (const line of lines.slice(lines.indexOf("jobs:") + 1)) {
    const job = /^ {2}([\w-]+):\s*$/.exec(line);
    if (job?.[1] !== undefined) {
      current = [];
      jobs.set(job[1], current);
      continue;
    }
    const run = /^\s+(?:- )?run:\s*(\S.*)$/.exec(line);
    if (run?.[1] !== undefined) current?.push(run[1].trim());
  }
  return jobs;
}

const CI = jobRuns(read(".github/workflows/ci.yml"));

describe("CI workflow", () => {
  it("runs lint, typecheck, test and content validation", () => {
    const verify = CI.get("verify") ?? [];
    for (const cmd of ["pnpm lint", "pnpm typecheck", "pnpm test", "pnpm content:validate"])
      expect(verify).toContain(cmd);
  });

  it("runs the race benchmark, whose canyon p95 must stay under 5 ms (spec 22: CI fails above it)", () => {
    expect([...CI.values()].flat()).toContain("pnpm bench");
  });

  it("gives the benchmark its own job that runs nothing else but the install", () => {
    const bench = CI.get("bench") ?? [];
    expect(bench.filter((cmd) => !cmd.startsWith("pnpm install"))).toEqual(["pnpm bench"]);
    expect(CI.get("verify")).not.toContain("pnpm bench");
  });

  it("has the bench write its numbers to the job summary before the gate", () => {
    const bench = read("packages/sim/bench/race.bench.ts");
    expect(bench).toContain("GITHUB_STEP_SUMMARY");
    expect(bench.indexOf("jobSummary(rows)")).toBeLessThan(
      bench.indexOf("toBeLessThan(BUDGET_MS)"),
    );
  });

  it("keeps the balance workflow", () => {
    expect(existsSync(join(ROOT, ".github/workflows/balance.yml"))).toBe(true);
    expect(read(".github/workflows/balance.yml")).toContain("pnpm sim:batch");
  });
});
