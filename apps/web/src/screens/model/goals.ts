/**
 * The goal races of a season and their results so far, text-free: the story triggers and the
 * flow's node tests read them without the text tables; `season.ts` re-exports them for the
 * season screens.
 */
import type { RaceResultEntry, SeasonGoal, SeasonState } from "@falconess/schema";
import { type SimContext, seasonGoalsOf } from "@falconess/sim";

export type GoalStatus = {
  readonly goal: SeasonGoal;
  /** The race's result, once it ran. */
  readonly result: RaceResultEntry | undefined;
  /** Whether the result met the goal (undefined until it ran). */
  readonly met: boolean | undefined;
};

/**
 * The goal race the sim marked as failed, if any: `lastRace` keeps the outcome while the race's
 * week is open and once the season has ended; a failed goal ends the season, so every other race
 * that ran was met.
 */
function failedTurn(state: SeasonState): number | undefined {
  return state.lastRace?.outcome === "goal-failed" ? state.lastRace.turn : undefined;
}

/** Every goal race of the season with its result so far, in turn order. */
export function goalStatuses(ctx: SimContext, state: SeasonState): GoalStatus[] {
  const goals = [...seasonGoalsOf(ctx, state)].sort((a, b) => a.turn - b.turn);
  const failed = failedTurn(state);
  return goals.map((goal) => {
    const result = state.raceResults.find((r) => r.turn === goal.turn);
    return { goal, result, met: result === undefined ? undefined : result.turn !== failed };
  });
}
