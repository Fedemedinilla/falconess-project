/**
 * Replays for the race screens, rebuilt by the sim and never recomputed here.
 *
 * The season runs its goal races with detail "results"; a viewer needs frames and events, so it
 * re-runs the same race with detail "full" on the same state (`goalRaceState`), field and seed
 * (`goalRaceSetup`). Property P7 (docs/race-engine.md 24.2) makes both runs place and time every
 * runner identically, so the replay matches the recorded `RaceResultEntry`.
 */
import type { RaceLog, RaceResultEntry, RunInput, SeasonState } from "@falconess/schema";
import {
  advanceSeason,
  goalForTurn,
  goalRaceSetup,
  goalRaceState,
  inputPosition,
  PLAYER_RUNNER_ID,
  replaySeason,
  type SimContext,
  simulateRace,
} from "@falconess/sim";
import type { Step } from "./controller";

/** The full log of the goal race `advanceSeason(ctx, before, input)` runs, if it runs one. */
export function goalRaceLog(
  ctx: SimContext,
  before: SeasonState,
  input: RunInput,
): RaceLog | undefined {
  const at = goalRaceState(ctx, before, input);
  const goal = at && goalForTurn(ctx, at);
  if (!at || !goal) return undefined;
  const { course, raceSeed, entries } = goalRaceSetup(ctx, at, goal, inputPosition(input));
  return simulateRace(ctx.ruleset, entries, course, raceSeed, { detail: "full" });
}

/**
 * Step `index` of a run (1 = the first input after `start`), rebuilt by replaying the inputs
 * before it: how a past turn, and its goal race, can be shown again.
 */
export function replayStep(
  ctx: SimContext,
  seed: string,
  inputs: readonly RunInput[],
  index: number,
): Step {
  const input = inputs[index];
  if (index < 1 || !input) throw new Error(`no step ${index} in a run of ${inputs.length} inputs`);
  const before = replaySeason(ctx, seed, inputs.slice(0, index));
  return { before, input, after: advanceSeason(ctx, before, input) };
}

/**
 * The player's result in a replay, as the season records it (`runGoalRace`): a DNF counts as last
 * place with the race's `maxTicks`. Undefined when the log has no player.
 */
export function recordedOf(log: RaceLog): { place: number; timeTicks: number } | undefined {
  const mine = log.results.find((r) => r.runnerId === PLAYER_RUNNER_ID);
  if (!mine) return undefined;
  return {
    place: mine.dnf ? log.results.length : mine.place,
    timeTicks: mine.dnf || mine.timeTicks === null ? log.maxTicks : mine.timeTicks,
  };
}

/** Whether a replay gives the place and time the season recorded (P7 says it always does). */
export function replayMatches(log: RaceLog, recorded: RaceResultEntry | undefined): boolean {
  if (!recorded) return true;
  const mine = recordedOf(log);
  return mine?.place === recorded.place && mine.timeTicks === recorded.timeTicks;
}
