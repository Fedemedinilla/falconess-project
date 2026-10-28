import { loadContent } from "@falconess/content";
import { RULESET_V1, type SimContext } from "@falconess/sim";
import { describe, expect, it } from "vitest";
import { goalFlagged, goalPassRate } from "./goal-rate.js";
import {
  GRADE_ORDER,
  renderSeasonBatch,
  runSeasonBatch,
  type SeasonBatchSummary,
} from "./season-batch.js";

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
    // every goal race has a place; the first slot is the wins
    expect(m.places.reduce((n, k) => n + k, 0)).toBe(m.races);
    expect(m.places[0]).toBe(m.wins);
    expect(m.goals.reduce((n, g) => n + g.won, 0)).toBe(m.wins);
    for (const g of m.goals) expect(g.won).toBeLessThanOrEqual(g.passed);
    expect(m.allWon).toBeLessThanOrEqual(m.completed);

    const text = renderSeasonBatch(m).join("\n");
    expect(text).toContain("cernicala  runs 4");
    expect(text).toContain("T46 desert-canyon ≤ 1: passed");
    expect(text).toMatch(/mean seasonScore \d+ = stats \d+ \+ skills \d+ \+ races \d+/);
    expect(text).toMatch(
      /goal races: [\d.]+ per season {2}won \d+% {2}podium \d+% {2}places 1st…8th ([\d.]+ \/ ){7}[\d.]+ % {2}seasons that won every goal race \d+%/,
    );
    expect(text).toMatch(/T12 desert-sprint ≤ 5: .* won\/reached \d+%/);
  });

  it("flags a goal under 80 % of the seasons that reached it, not of all seasons (21.1)", () => {
    const goals = ctx.content.getFalconess("peregrina").seasonGoals;
    const m: SeasonBatchSummary = {
      ...runSeasonBatch(ctx, "peregrina", 0),
      runs: 100,
      // T12 46 of 100; T24 42 of the 46 that ran it; T36 none ran it
      goals: [
        { goal: goals[0], reached: 100, passed: 46, won: 20 },
        { goal: goals[1], reached: 46, passed: 42, won: 23 },
        { goal: goals[2], reached: 0, passed: 0, won: 0 },
      ].flatMap((g) => (g.goal ? [{ ...g, goal: g.goal }] : [])),
    };
    const lines = renderSeasonBatch(m).filter((l) => l.trim().startsWith("T"));
    expect(lines[0]).toMatch(
      /passed 46% {2}reached 100% {2}passed\/reached 46% {2}won\/reached 20% {2}< 80%$/,
    );
    expect(lines[1]).toMatch(
      /passed 42% {2}reached 46% {2}passed\/reached 91% {2}won\/reached 50%$/,
    );
    expect(lines[2]).toMatch(/passed 0% {2}reached 0% {2}passed\/reached — {2}won\/reached —$/);
  });

  it("goal-rate: the rate and the flag use the seasons that reached the goal", () => {
    expect(goalPassRate(4, 5)).toBe(0.8);
    expect(goalPassRate(0, 0)).toBeNull();
    expect(goalFlagged(4, 5)).toBe(false);
    expect(goalFlagged(3, 4)).toBe(true);
    expect(goalFlagged(27, 28)).toBe(false); // 27 % of all seasons, 96 % of those that ran it
    expect(goalFlagged(0, 0)).toBe(false);
  });
});
