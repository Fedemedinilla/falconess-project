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

  it("runs the 1000-race batch smoke under 6 s in a job of its own (24.4)", () => {
    const smoke = [...CI.entries()].filter(([, runs]) =>
      runs.some((cmd) => cmd.startsWith("pnpm sim:batch")),
    );
    expect(smoke.map(([job]) => job)).toEqual(["batch-smoke"]);
    const cmd = smoke[0]?.[1].find((c) => c.startsWith("pnpm sim:batch")) ?? "";
    expect(cmd).toMatch(/--runs 1000\b/);
    expect(cmd).toMatch(/--max-wall-ms 6000\b/);
  });

  it("keeps the balance workflow", () => {
    expect(existsSync(join(ROOT, ".github/workflows/balance.yml"))).toBe(true);
    expect(read(".github/workflows/balance.yml")).toContain("pnpm sim:batch");
  });
});

describe("balance workflow (docs/race-engine.md 24.4, 25.2.1)", () => {
  const balance = read(".github/workflows/balance.yml");
  const lines = balance.split("\n");

  /** The `paths:` entries of one trigger (`pull_request` or `push`). */
  function paths(trigger: string): string[] {
    const start = lines.indexOf(`  ${trigger}:`);
    const out: string[] = [];
    for (const line of lines.slice(start + 1)) {
      if (/^ {2}\S/.test(line)) break;
      const entry = /^ {6}- "([^"]+)"$/.exec(line);
      if (entry?.[1] !== undefined) out.push(entry[1]);
    }
    return out;
  }

  it("runs on every PR and main push that touches an input of the metrics", () => {
    const inputs = [
      "packages/sim/**",
      "packages/content/**",
      "packages/rng/**",
      "packages/schema/src/**",
      "apps/cli/src/sim-batch.ts",
      "apps/cli/src/batch/**",
      "apps/cli/src/policy.ts",
      "apps/cli/src/goal-rate.ts",
    ];
    for (const trigger of ["pull_request", "push"])
      expect(paths(trigger)).toEqual(expect.arrayContaining(inputs));
    expect(paths("push")).toEqual(paths("pull_request"));
  });

  it("holds the 10 000-race batch to its 60-s budget", () => {
    expect(balance).toMatch(/args=\(--runs 10000 [^)]*--max-wall-ms 60000\)/);
  });

  it("applies the verdict gate to pull requests only, with an ADR label that lifts it", () => {
    const pr = lines.findIndex((l) => l.includes('[ "$EVENT" = "pull_request" ]'));
    const fail = lines.findIndex((l) => l.includes("args+=(--fail-on-verdict)"));
    expect(pr).toBeGreaterThan(0);
    expect(fail).toBeGreaterThan(pr);
    expect(lines.filter((l) => l.includes("--fail-on-verdict"))).toHaveLength(1);
    expect(balance).toContain("contains(github.event.pull_request.labels.*.name, 'balance-adr')");
    expect(balance).toMatch(/types: \[[^\]]*labeled[^\]]*unlabeled/);
  });

  it("takes the newest main report as the baseline whatever the run's conclusion, and names it", () => {
    expect(balance).not.toContain("--status success");
    expect(balance).toContain("--status completed");
    expect(balance).toContain('--baseline-from "$BASELINE_FROM"');
  });
});
