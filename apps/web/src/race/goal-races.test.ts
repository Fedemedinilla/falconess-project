import type { RunInput } from "@falconess/schema";
import { PLAYER_RUNNER_ID, replaySeason } from "@falconess/sim";
import { describe, expect, it } from "vitest";
import { simContext } from "../content/load";
import { goalRaceLog } from "../game/goal-race";
import { goalRaceSteps } from "./goal-races";

const ctx = simContext();
const seed = "gr-1";
const start: RunInput = {
  kind: "start",
  falconessId: "peregrina",
  hangar: ["shiden", "mule", "nimbus", "falke"],
  parents: [],
};
const goals = ctx.content.getFalconess("peregrina").seasonGoals;
const firstGoal = goals[0]?.turn ?? 0;

/** A run that trains until a little past its first goal race, choosing option 0 on every event. */
function runPast(turn: number): RunInput[] {
  const inputs: RunInput[] = [start];
  let state = replaySeason(ctx, seed, inputs);
  const cycle: RunInput[] = [
    { kind: "train:agility" },
    { kind: "train:stamina" },
    { kind: "rest" },
    { kind: "train:technique" },
  ];
  let k = 0;
  while (state.status === "active" && state.turn <= turn) {
    const input: RunInput = state.pendingEvent
      ? { kind: "event:choose", option: 0 }
      : (cycle[k++ % cycle.length] ?? { kind: "rest" });
    inputs.push(input);
    state = replaySeason(ctx, seed, inputs);
  }
  return inputs;
}

describe("goalRaceSteps", () => {
  const inputs = runPast(firstGoal);
  const state = replaySeason(ctx, seed, inputs);
  const steps = goalRaceSteps(ctx, seed, inputs);

  it("finds every goal race the run has run, with its week, course and goal", () => {
    expect(steps.map((st) => st.turn)).toEqual(state.raceResults.map((r) => r.turn));
    const step = steps[0];
    expect(step?.turn).toBe(firstGoal);
    expect(step?.courseId).toBe(goals[0]?.courseId);
    expect(step?.minPlace).toBe(goals[0]?.minPlace);
    expect(inputs[step?.index ?? -1]).toBe(step?.input);
  });

  it("rebuilds each race with detail full and the result the season recorded (P7)", () => {
    for (const step of steps) {
      const log = goalRaceLog(ctx, step.before, step.input);
      expect(log?.detail).toBe("full");
      const mine = log?.results.find((r) => r.runnerId === PLAYER_RUNNER_ID);
      const recorded = state.raceResults.find((r) => r.turn === step.turn);
      expect(mine?.place).toBe(recorded?.place);
      expect(mine?.timeTicks).toBe(recorded?.timeTicks);
    }
  });

  it("has no race before the first goal week, and none without a start", () => {
    expect(goalRaceSteps(ctx, seed, inputs.slice(0, 3))).toEqual([]);
    expect(goalRaceSteps(ctx, seed, [])).toEqual([]);
  });
});
