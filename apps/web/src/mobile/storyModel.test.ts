import type { RunInput, SeasonState } from "@falconess/schema";
import { type SimContext, seasonGoalsOf, startSeason } from "@falconess/sim";
import { describe, expect, it } from "vitest";
import { simContext } from "../content/load";
import { allScenes } from "../content/story";
import { dueScene, triggerHolds } from "./storyModel";

// her season on v3, with the calendar's goals (the Larga is the fifth)
const ctx: SimContext = simContext("v3");
const start: Extract<RunInput, { kind: "start" }> = {
  kind: "start",
  falconessId: "peregrina",
  hangar: ["shiden", "mule", "nimbus", "falke"],
  parents: [],
};

/** Her season over, every goal run, the Larga (her last goal) at `larga`. */
function endedWith(larga: number): SeasonState {
  const s = startSeason(ctx, "story-1", start);
  const goals = seasonGoalsOf(ctx, s);
  const raceResults: SeasonState["raceResults"] = goals.map((g, i) => ({
    courseId: g.courseId,
    turn: g.turn,
    place: i === goals.length - 1 ? larga : 1,
    fieldSize: 8,
    timeTicks: 1000,
    frameId: s.equippedFrame,
    position: "lead",
    engine: "v1",
  }));
  return { ...s, turn: 48, status: "ended", endReason: "completed", raceResults };
}

describe("goal-after triggers (ADR-0014)", () => {
  const larga = { kind: "goal-after", goal: 4 } as const;
  it("«placed» holds when she ran the Larga without winning it, «win» when she won", () => {
    const lost = endedWith(5);
    expect(triggerHolds(ctx, lost, { ...larga, result: "placed" })).toBe(true);
    expect(triggerHolds(ctx, lost, { ...larga, result: "win" })).toBe(false);
    expect(triggerHolds(ctx, lost, { ...larga, result: "pass" })).toBe(true);
    const won = endedWith(1);
    expect(triggerHolds(ctx, won, { ...larga, result: "placed" })).toBe(false);
    expect(triggerHolds(ctx, won, { ...larga, result: "win" })).toBe(true);
  });
});

describe("week triggers (owner 2026-11-13)", () => {
  it("a week's scene holds after that week's decision, not when the week starts", () => {
    const s = startSeason(ctx, "story-1", start);
    const t = { kind: "turn", turn: 16 } as const;
    expect(triggerHolds(ctx, { ...s, turn: 16 }, t)).toBe(false);
    expect(triggerHolds(ctx, { ...s, turn: 17 }, t)).toBe(true);
  });
});

describe("which scene is due first", () => {
  it("the first by file name (id), whatever its trigger's kind", () => {
    // her season ended at the third goal; she won the first two
    const s = startSeason(ctx, "story-1", start);
    const goals = [...seasonGoalsOf(ctx, s)].sort((a, b) => a.turn - b.turn).slice(0, 3);
    const failed = goals.at(-1);
    if (!failed) throw new Error("no goals");
    const raceResults: SeasonState["raceResults"] = goals.map((g, i) => ({
      courseId: g.courseId,
      turn: g.turn,
      place: i === goals.length - 1 ? 8 : 1,
      fieldSize: 8,
      timeTicks: 1000,
      frameId: s.equippedFrame,
      position: "lead",
      engine: "v1",
    }));
    const ended: SeasonState = {
      ...s,
      turn: failed.turn,
      status: "ended",
      endReason: "goal-failed",
      lastRace: { turn: failed.turn, outcome: "goal-failed" },
      raceResults,
    };
    const order: string[] = [];
    const seen = new Set<string>();
    let next = dueScene(allScenes(), ctx, ended, seen);
    while (next) {
      order.push(next.id);
      seen.add(next.id);
      next = dueScene(allScenes(), ctx, ended, seen);
    }
    // F13: changes in 5.2 (scenes by kind: the goal-after wins, then the end)
    expect(order).toEqual(["peregrina-debut-win", "peregrina-end-failed", "peregrina-press"]);
  });
});
