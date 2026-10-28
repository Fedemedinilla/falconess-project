/**
 * The goal race of one season step, rebuilt for `pnpm play`: the state it ran on
 * (`goalRaceState`), the field of `goalRaceSetup`, and `simulateRace` with detail "full". The
 * season ran it with detail "results"; property P7 (docs/race-engine.md 24.2) makes both runs
 * place and time every runner identically, so the view matches the recorded `RaceResultEntry`.
 */
import type { RaceLog, RunInput, SeasonState } from "@falconess/schema";
import {
  goalForTurn,
  goalRaceSetup,
  goalRaceState,
  type SimContext,
  simulateRace,
} from "@falconess/sim";
import { contentLabels } from "./race/labels.js";
import { renderRaceSummary } from "./race/render-race.js";

/** The full log of the goal race `advanceSeason(ctx, before, input)` runs, if it runs one. */
export function goalRaceLog(
  ctx: SimContext,
  before: SeasonState,
  input: RunInput,
): RaceLog | undefined {
  const at = goalRaceState(ctx, before, input);
  const goal = at && goalForTurn(ctx, at);
  if (!at || !goal) return undefined;
  const { course, raceSeed, entries } = goalRaceSetup(ctx, at, goal);
  return simulateRace(ctx.ruleset, entries, course, raceSeed, { detail: "full" });
}

/** Compact classification and the player's time sinks of that race; empty when none ran. */
export function goalRaceView(ctx: SimContext, before: SeasonState, input: RunInput): string[] {
  const log = goalRaceLog(ctx, before, input);
  if (!log) return [];
  return renderRaceSummary(log, contentLabels(ctx.content)).map((line) => `  ${line}`);
}
