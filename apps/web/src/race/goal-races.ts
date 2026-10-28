/**
 * The goal races of a run, found by replaying it once with the sim (startSeason, advanceSeason):
 * each one is the step whose input `goalRaceState` says runs a race, with the state before it, so
 * `goalRaceLog` (game/goal-race.ts) can run it again with detail "full" (P7: same result).
 */
import type { RunInput, SeasonState } from "@falconess/schema";
import {
  advanceSeason,
  goalForTurn,
  goalRaceState,
  type SimContext,
  startSeason,
} from "@falconess/sim";

export type GoalRaceStep = {
  /** The season week of the race. */
  readonly turn: number;
  readonly courseId: string;
  /** The place the goal asked for. */
  readonly minPlace: number;
  /** Index of the input in the run (1 = the first after `start`). */
  readonly index: number;
  readonly before: SeasonState;
  readonly input: RunInput;
};

/** Every goal race the run has run so far, in season order. */
export function goalRaceSteps(
  ctx: SimContext,
  seed: string,
  inputs: readonly RunInput[],
): GoalRaceStep[] {
  const first = inputs[0];
  if (first?.kind !== "start") return [];
  const steps: GoalRaceStep[] = [];
  let state = startSeason(ctx, seed, first);
  for (let index = 1; index < inputs.length; index++) {
    const input = inputs[index];
    if (!input) break;
    const at = goalRaceState(ctx, state, input);
    const goal = at === undefined ? undefined : goalForTurn(ctx, at);
    if (goal)
      steps.push({
        turn: goal.turn,
        courseId: goal.courseId,
        minPlace: goal.minPlace,
        index,
        before: state,
        input,
      });
    state = advanceSeason(ctx, state, input);
  }
  return steps;
}
