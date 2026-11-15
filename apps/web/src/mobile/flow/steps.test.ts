import type { RunInput, SeasonState } from "@falconess/schema";
import { advanceSeason, seasonGoalsOf, startSeason } from "@falconess/sim";
import { describe, expect, it } from "vitest";
import { addedRace, fxPart } from "./steps";
import { testContext } from "./testing/content";

const ctx = testContext("v3");

describe("addedRace and fxPart: what a committed step ran", () => {
  // Peregrina rests up to her first goal race and runs it
  let state: SeasonState = startSeason(ctx, "steps-1", {
    kind: "start",
    falconessId: "peregrina",
    hangar: ["shiden", "mule", "nimbus", "falke"],
    parents: [],
  });
  const first = [...seasonGoalsOf(ctx, state)].sort((a, b) => a.turn - b.turn)[0];
  const rest: RunInput = { kind: "rest" };
  const weeks: { before: SeasonState; input: RunInput; after: SeasonState }[] = [];
  while (first && state.status === "active" && state.turn <= first.turn) {
    const input: RunInput = state.pendingEvent ? { kind: "event:choose", option: 0 } : rest;
    const after = advanceSeason(ctx, state, input);
    weeks.push({ before: state, input, after });
    state = after;
  }

  it("a race week's step ran its goal race: the menu shows the race's effects", () => {
    const raced = weeks.at(-1);
    expect(raced?.before.turn).toBe(first?.turn);
    const race = raced && addedRace(raced);
    expect(race).toBeDefined();
    expect(race).toBe(raced?.after.raceResults.at(-1));
    expect(race?.turn).toBe(first?.turn);
    expect(raced && fxPart(raced)).toBe("race");
  });
  it("any other week ran none: all its effects play together", () => {
    const quiet = weeks.slice(0, -1);
    expect(quiet.length).toBeGreaterThan(0);
    for (const step of quiet) {
      expect(addedRace(step)).toBeUndefined();
      expect(fxPart(step)).toBe("all");
    }
  });
});
