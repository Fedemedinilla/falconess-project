import type { RunInput, SeasonState } from "@falconess/schema";
import { advanceSeason, RULESET_V1, replaySeason, startSeason } from "@falconess/sim";
import { describe, expect, it } from "vitest";
import { getContent } from "../content/load";
import type { ActiveRun } from "./controller";
import { goalRaceLog } from "./goal-race";
import { findRacePick, getPickedRace, pickRace, raceStepIndex } from "./race-pick";

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

/** A run played until its second goal race (or its end). */
function play(): ActiveRun {
  const inputs: RunInput[] = [START];
  let state = startSeason(ctx, "pick", START);
  while (state.status === "active" && state.raceResults.length < 2) {
    const input = policy(state);
    state = advanceSeason(ctx, state, input);
    inputs.push(input);
  }
  return { seed: "pick", rulesetVersion: "v1", inputs, state };
}

describe("race pick", () => {
  const run = play();

  it("finds the step that ran each goal race, as the replay rebuilds it", () => {
    for (const result of run.state.raceResults) {
      const found = raceStepIndex(ctx, run.seed, run.inputs, result.turn);
      if (!found) throw new Error(`no step for T${result.turn}`);
      expect(found.step.input).toEqual(run.inputs[found.index]);
      expect(found.step.before).toEqual(
        replaySeason(ctx, run.seed, run.inputs.slice(0, found.index)),
      );
      expect(found.step.after.raceResults.at(-1)).toEqual(result);
      const log = goalRaceLog(ctx, found.step.before, found.step.input);
      expect(log?.results.find((r) => r.runnerId === "player")?.place).toBe(result.place);
    }
    expect(raceStepIndex(ctx, run.seed, run.inputs, 2)).toBeUndefined();
  });

  it("uses the last step when it ran the race, else replays the run", () => {
    const last = run.state.raceResults.at(-1);
    if (!last) throw new Error("fixture");
    const found = raceStepIndex(ctx, run.seed, run.inputs, last.turn);
    if (!found) throw new Error("fixture");
    const shortRun: ActiveRun = {
      ...run,
      inputs: run.inputs.slice(0, found.index + 1),
      state: found.step.after,
    };
    const pick = findRacePick(ctx, shortRun, last.turn, found.step);
    expect(pick?.step).toBe(found.step);
    expect(pick?.index).toBe(found.index);

    const replayed = findRacePick(ctx, run, last.turn, undefined);
    expect(replayed?.index).toBe(found.index);
    expect(replayed?.step.before).toEqual(found.step.before);

    pickRace(replayed);
    expect(getPickedRace()).toBe(replayed);
    pickRace(undefined);
    expect(getPickedRace()).toBeUndefined();
  });
});
