import { loadContent, loadSeasonContent } from "@falconess/content";
import type { RaceLog, RunInput, SeasonState } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { simulateRace } from "../race/engine.js";
import { goalRaceSetup } from "../race/field.js";
import { canonicalJson } from "../race/golden.js";
import { RULESET_V1, RULESET_V3 } from "../rulesets/index.js";
import { advanceSeason, goalRaceState } from "./advance.js";
import type { SimContext } from "./context.js";
import { goalForTurn, inputPosition } from "./goals.js";
import { startSeason } from "./start.js";

/**
 * `advanceSeason`'s `onGoalRace` (ADR-0017, open decision 6): the season runs its goal race with
 * detail "full" and hands the log over, so a viewer keeps it instead of running the race again.
 * The state is the one without it (P7), and the log is byte for byte the one a viewer rebuilds
 * from `goalRaceState` + `goalRaceSetup`.
 */

const START: Extract<RunInput, { kind: "start" }> = {
  kind: "start",
  falconessId: "peregrina",
  hangar: ["shiden", "mule", "nimbus", "falke"],
  parents: [],
};

function policy(s: SeasonState): RunInput {
  if (s.pendingEvent) return { kind: "event:choose", option: 0 };
  if (s.fatigue >= 60) return { kind: "rest" };
  return { kind: s.turn % 2 === 0 ? "train:stamina" : "train:agility" };
}

/** The viewer's rebuild of the goal race `advanceSeason(ctx, before, input)` runs. */
function rebuilt(ctx: SimContext, before: SeasonState, input: RunInput): RaceLog | undefined {
  const at = goalRaceState(ctx, before, input);
  const goal = at && goalForTurn(ctx, at);
  if (!at || !goal) return undefined;
  const { course, raceSeed, entries } = goalRaceSetup(ctx, at, goal, inputPosition(input));
  return simulateRace(ctx.ruleset, entries, course, raceSeed, { detail: "full" });
}

describe.each([
  ["v1", { ruleset: RULESET_V1, content: loadContent() }],
  ["v3", { ruleset: RULESET_V3, content: loadSeasonContent("v3") }],
] as const)("advanceSeason's onGoalRace on %s", (_name, ctx: SimContext) => {
  it("hands over each goal race's full log, the viewer's byte for byte, and the same state", () => {
    let s = startSeason(ctx, "kept-race", START);
    let races = 0;
    while (s.status !== "ended" && races < 3) {
      const input = policy(s);
      const logs: RaceLog[] = [];
      const next = advanceSeason(ctx, s, input, { onGoalRace: (log) => logs.push(log) });
      expect(next).toEqual(advanceSeason(ctx, s, input));
      const ran = next.raceResults.length > s.raceResults.length;
      expect(logs.length).toBe(ran ? 1 : 0);
      const log = logs[0];
      if (log) {
        races += 1;
        expect(log.detail).toBe("full");
        expect(canonicalJson(log)).toBe(canonicalJson(rebuilt(ctx, s, input)));
      }
      s = next;
    }
    expect(races).toBe(3);
  });

  it("keeps the state when the caller changes the log it was handed", () => {
    let s = startSeason(ctx, "kept-race", START);
    let races = 0;
    while (s.status !== "ended" && races < 3) {
      const input = policy(s);
      const next = advanceSeason(ctx, s, input, {
        onGoalRace: (log) => {
          races += 1;
          log.results.reverse();
          for (const r of log.results) {
            r.place = 99;
            r.durabilityEnd = 0;
          }
        },
      });
      expect(next).toEqual(advanceSeason(ctx, s, input));
      s = next;
    }
    expect(races).toBe(3);
  });
});
