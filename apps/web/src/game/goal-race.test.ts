import type { RunInput, SeasonState } from "@falconess/schema";
import { advanceSeason, RULESET_V1, startSeason } from "@falconess/sim";
import { describe, expect, it } from "vitest";
import { getContent } from "../content/load";
import { goalRaceLog, replayStep } from "./goal-race";

const ctx = { ruleset: RULESET_V1, content: getContent() };
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

describe("goal race replay", () => {
  it("re-runs the season's first goal race with detail full: same place and time (P7)", () => {
    const inputs: RunInput[] = [START];
    let s = startSeason(ctx, "web-race", START);
    for (;;) {
      const input = policy(s);
      const next = advanceSeason(ctx, s, input);
      inputs.push(input);
      if (next.raceResults.length > s.raceResults.length) {
        const result = next.raceResults.at(-1);
        const log = goalRaceLog(ctx, s, input);
        expect(log?.detail).toBe("full");
        expect(log?.frames).toBeDefined();
        const me = log?.results.find((r) => r.runnerId === "player");
        expect(me?.place).toBe(result?.place);
        expect(me?.timeTicks).toBe(result?.timeTicks);
        expect(log?.courseId).toBe(result?.courseId);

        const step = replayStep(ctx, "web-race", inputs, inputs.length - 1);
        expect(step.before).toEqual(s);
        expect(step.after).toEqual(next);
        return;
      }
      if (next.status === "ended") throw new Error("no goal race");
      s = next;
    }
  });

  it("returns nothing for a step without a goal race", () => {
    const s = startSeason(ctx, "quiet", START);
    expect(goalRaceLog(ctx, s, { kind: "rest" })).toBeUndefined();
    expect(() => replayStep(ctx, "quiet", [START], 0)).toThrow();
  });
});
