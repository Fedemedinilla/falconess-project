/**
 * What a committed step did, read from its two states. Pure and text-free
 * (flow/imports.test.ts).
 */
import type { RaceResultEntry, SeasonState } from "@falconess/schema";
import type { WeekFxPart } from "../weekFx";

type StepStates = { readonly before: SeasonState; readonly after: SeasonState };

/** The goal race the step ran, if it ran one: the newest result. */
export function addedRace(step: StepStates): RaceResultEntry | undefined {
  return step.after.raceResults.length > step.before.raceResults.length
    ? step.after.raceResults.at(-1)
    : undefined;
}

/** A race week's step played its action's effects before the race: the menu shows the race's. */
export function fxPart(step: StepStates): WeekFxPart {
  return addedRace(step) ? "race" : "all";
}
