import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * CI gates that docs/race-engine.md requires (22, 24.4). The race benchmark asserts the p95 budget
 * (packages/sim/bench/race.bench.ts) only when `pnpm bench` runs, so CI must run it.
 */
const CI = readFileSync(join(process.cwd(), ".github/workflows/ci.yml"), "utf8");
const steps = CI.split("\n")
  .map((line) => line.trim())
  .filter((line) => line.startsWith("- run:"))
  .map((line) => line.slice("- run:".length).trim());

describe("CI workflow", () => {
  it("runs lint, typecheck, test and content validation", () => {
    for (const cmd of ["pnpm lint", "pnpm typecheck", "pnpm test", "pnpm content:validate"])
      expect(steps).toContain(cmd);
  });

  it("runs the race benchmark, whose canyon p95 must stay under 5 ms (spec 22: CI fails above it)", () => {
    expect(steps).toContain("pnpm bench");
  });
});
