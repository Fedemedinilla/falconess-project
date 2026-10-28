import { loadContent } from "@falconess/content";
import { RULESET_V1, type SimContext } from "@falconess/sim";
import { describe, expect, it } from "vitest";
import { GRADE_ORDER, renderSeasonBatch, runSeasonBatch } from "./season-batch.js";

const ctx: SimContext = { ruleset: RULESET_V1, content: loadContent() };

describe("pnpm sim:season-batch", () => {
  it("counts grades, completions and goal passes consistently, deterministically", () => {
    const runs = 4;
    const m = runSeasonBatch(ctx, "cernicala", runs);
    expect(runSeasonBatch(ctx, "cernicala", runs)).toEqual(m);
    expect(GRADE_ORDER.reduce((n, g) => n + (m.grades[g] ?? 0), 0)).toBe(runs);
    const failed = Object.values(m.failTurns).reduce((n, k) => n + k, 0);
    expect(m.completed + failed).toBe(runs);
    expect(m.goals.map((g) => g.goal.turn)).toEqual([12, 24, 36, 46]);
    expect(m.goals[0]?.reached).toBe(runs); // every season runs its first goal race
    for (const g of m.goals) expect(g.passed).toBeLessThanOrEqual(g.reached);
    // a completed season passed every goal
    expect(m.goals.at(-1)?.passed).toBe(m.completed);
    expect(m.races).toBe(m.goals.reduce((n, g) => n + g.reached, 0));

    const text = renderSeasonBatch(m).join("\n");
    expect(text).toContain("cernicala  runs 4");
    expect(text).toContain("T46 desert-canyon ≤ 1: passed");
    expect(text).toMatch(/mean seasonScore \d+ = stats \d+ \+ skills \d+ \+ races \d+/);
  });
});
