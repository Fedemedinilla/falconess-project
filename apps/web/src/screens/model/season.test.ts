import type { RunInput, SeasonState } from "@falconess/schema";
import { advanceSeason, RULESET_V1, STAT_ORDER, startSeason } from "@falconess/sim";
import { describe, expect, it } from "vitest";
import { getContent } from "../../content/load";
import {
  freshRace,
  goalStatuses,
  isEventNote,
  lastClosedTurn,
  nextGoal,
  recentWeeks,
  turnDeltas,
} from "./season";

const ctx = { ruleset: RULESET_V1, content: getContent() };

function policy(s: SeasonState): RunInput {
  if (s.pendingEvent) return { kind: "event:choose", option: 0 };
  if (s.fatigue >= 60) return { kind: "rest" };
  return { kind: s.turn % 2 === 0 ? "train:stamina" : "train:agility" };
}

/** Play until the first goal race has run; returns the states before and after it. */
function firstRace(): { before: SeasonState; after: SeasonState } {
  let s = startSeason(ctx, "season-view", {
    kind: "start",
    falconessId: "peregrina",
    hangar: ["shiden", "mule", "nimbus", "falke"],
    parents: [],
  });
  for (;;) {
    const next = advanceSeason(ctx, s, policy(s));
    if (next.raceResults.length > 0) return { before: s, after: next };
    if (next.status === "ended") throw new Error("no goal race");
    s = next;
  }
}

describe("season views", () => {
  const { before, after } = firstRace();
  const goals = ctx.content.getFalconess("peregrina").seasonGoals;
  const first = goals[0];

  it("lists the goals with their results and points at the next one", () => {
    const pre = goalStatuses(ctx, before);
    expect(pre.map((g) => g.goal.turn)).toEqual(goals.map((g) => g.turn));
    expect(pre.every((g) => g.result === undefined && g.met === undefined)).toBe(true);
    expect(nextGoal(ctx, before)).toEqual({ goal: first, weeksLeft: 0 });

    const post = goalStatuses(ctx, after);
    expect(post[0]?.result).toEqual(after.raceResults[0]);
    expect(post[0]?.met).toBe((after.raceResults[0]?.place ?? 9) <= (first?.minPlace ?? 0));
    const next = nextGoal(ctx, after);
    expect(next?.goal).toEqual(goals[1]);
    expect(next?.weeksLeft).toBe((goals[1]?.turn ?? 0) - after.turn);
  });

  it("shows the race that just ran in the week after it, or while its event waits", () => {
    expect(freshRace(ctx, before)).toBeUndefined();
    expect(freshRace(ctx, after)?.goal.turn).toBe(first?.turn);
    let s = after;
    while (s.pendingEvent) s = advanceSeason(ctx, s, { kind: "event:choose", option: 0 });
    expect(freshRace(ctx, s)?.goal.turn).toBe(first?.turn);
    const later = advanceSeason(ctx, s, { kind: "rest" });
    if (!later.pendingEvent) expect(freshRace(ctx, later)).toBeUndefined();
  });

  it("sums a week's stat changes from the log and lists recent weeks newest first", () => {
    const turn = lastClosedTurn(after);
    const deltas = turnDeltas(after, turn);
    for (const stat of STAT_ORDER) {
      const sum = after.log
        .filter((e) => e.turn === turn)
        .reduce((a, e) => a + (e.deltas[stat] ?? 0), 0);
      expect(deltas[stat] ?? 0).toBe(sum);
    }
    const weeks = recentWeeks(after, 4);
    expect(weeks).toHaveLength(4);
    expect(weeks.map((w) => w.turn)).toEqual([...weeks.map((w) => w.turn)].sort((a, b) => b - a));
    expect(weeks[0]?.turn).toBe(first?.turn);
    expect(weeks[0]?.race).toEqual(after.raceResults[0]);
    expect(weeks[0]?.notes).toContain("log.race");
    expect(isEventNote("ev.sandstorm-week")).toBe(true);
    expect(isEventNote("log.rest")).toBe(false);
  });
});
