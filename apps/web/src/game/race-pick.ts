/**
 * Which goal race `#carrera` replays. A season screen's "Ver carrera" picks one and navigates:
 *
 *   pickRace(findRaceStep(ctx, run, turn));  navigate("carrera");
 *
 * The pick is the Step that ran the race (the same shape as the controller's `lastStep`), so the
 * race screen rebuilds it with `goalRaceLog(ctx, pick.step.before, pick.step.input)` at detail
 * "full". Without a pick it falls back to the goal race of `snap.lastStep`.
 *
 * A module store and not run state: the pick names a race to look at and never changes the run.
 */
import type { RunInput, SeasonState } from "@falconess/schema";
import { advanceSeason, type SimContext, startSeason } from "@falconess/sim";
import { useSyncExternalStore } from "react";
import type { ActiveRun, Step } from "./controller";

export type RacePick = {
  readonly seed: string;
  readonly rulesetVersion: string;
  /** The season week of the race. */
  readonly turn: number;
  /** Index of the race's input in the run (1 = the first input after `start`). */
  readonly index: number;
  /** The step that ran the race: `before` + `input` rebuild it. */
  readonly step: Step;
};

let picked: RacePick | undefined;
const listeners = new Set<() => void>();

export function pickRace(pick: RacePick | undefined): void {
  if (picked === pick) return;
  picked = pick;
  for (const listener of listeners) listener();
}

export function getPickedRace(): RacePick | undefined {
  return picked;
}

export function subscribePickedRace(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The picked race, re-rendering when it changes. */
export function usePickedRace(): RacePick | undefined {
  return useSyncExternalStore(subscribePickedRace, getPickedRace, getPickedRace);
}

/**
 * The input of `inputs` that ran the goal race of week `turn`, found by replaying the run once:
 * the step whose state gains that race result. Undefined when no such race ran.
 */
export function raceStepIndex(
  ctx: SimContext,
  seed: string,
  inputs: readonly RunInput[],
  turn: number,
): { index: number; step: Step } | undefined {
  const first = inputs[0];
  if (first?.kind !== "start") return undefined;
  let state: SeasonState = startSeason(ctx, seed, first);
  for (let i = 1; i < inputs.length; i++) {
    const input = inputs[i];
    if (!input) break;
    const after = advanceSeason(ctx, state, input);
    const ran = after.raceResults.length > state.raceResults.length;
    if (ran && after.raceResults.at(-1)?.turn === turn)
      return { index: i, step: { before: state, input, after } };
    if (ran && (after.raceResults.at(-1)?.turn ?? 0) > turn) return undefined;
    state = after;
  }
  return undefined;
}

/**
 * The pick for the goal race of week `turn` of a run. Uses `lastStep` when it is that race's step
 * (no replay), else replays the run.
 */
export function findRacePick(
  ctx: SimContext,
  run: ActiveRun,
  turn: number,
  lastStep?: Step,
): RacePick | undefined {
  const last = lastStep?.after.raceResults.at(-1);
  if (
    lastStep &&
    last?.turn === turn &&
    lastStep.after.raceResults.length > lastStep.before.raceResults.length &&
    run.inputs.at(-1) === lastStep.input
  )
    return {
      seed: run.seed,
      rulesetVersion: run.rulesetVersion,
      turn,
      index: run.inputs.length - 1,
      step: lastStep,
    };
  const found = raceStepIndex(ctx, run.seed, run.inputs, turn);
  return (
    found && {
      seed: run.seed,
      rulesetVersion: run.rulesetVersion,
      turn,
      index: found.index,
      step: found.step,
    }
  );
}
