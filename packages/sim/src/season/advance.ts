import type { Rng } from "@falconess/rng";
import type { RunInput, SeasonState } from "@falconess/schema";
import { type Draft, draft, note, rngForInput, type SimContext } from "./context.js";
import { resolveEvent, rollEvent } from "./events.js";
import { runGoalRace } from "./goals.js";
import { gradeFor } from "./grade.js";
import { rollCrewPresence } from "./hangar.js";
import { applyOuting, applyRest, applyTraining } from "./training.js";
import { applyWorkshop } from "./workshop.js";

export class InvalidInputError extends Error {}

function endSeason(ctx: SimContext, d: Draft, reason: "completed" | "goal-failed"): void {
  d.status = "ended";
  d.endReason = reason;
  d.grade = gradeFor(ctx, d);
  const reward = ctx.content.economy?.feathersByGrade[d.grade] ?? 0;
  d.wallet.feathers += reward;
  note(d, reason === "goal-failed" ? "log.goal.failed" : "log.season.end");
}

/** Close the turn: race if due, roll an event, and either wait for the choice or move on. */
function closeTurn(ctx: SimContext, d: Draft, rng: Rng): void {
  const outcome = runGoalRace(ctx, d, rng);
  rollEvent(ctx, d, rng);
  if (d.pendingEvent) return; // the next input must be event:choose; the turn advances after it
  finishTurn(ctx, d, rng, outcome === "goal-failed");
}

function finishTurn(ctx: SimContext, d: Draft, rng: Rng, goalFailed: boolean): void {
  if (goalFailed) {
    endSeason(ctx, d, "goal-failed");
    return;
  }
  if (d.turn >= ctx.ruleset.season.turns) {
    endSeason(ctx, d, "completed");
    return;
  }
  d.turn += 1;
  delete d.lastRace;
  rollCrewPresence(ctx, d, rng);
}

/**
 * The season reducer: pure, deterministic, `advanceSeason(ctx, state, input) → state'`.
 * The RNG for this step is derived from the seed and the number of inputs applied so far.
 */
export function advanceSeason(ctx: SimContext, state: SeasonState, input: RunInput): SeasonState {
  if (state.status === "ended") throw new InvalidInputError("season has ended");
  if (input.kind === "start") throw new InvalidInputError("season already started");
  const d = draft(state);
  const rng = rngForInput(d.seed, d.inputsApplied);
  d.inputsApplied += 1;

  if (d.pendingEvent) {
    if (input.kind !== "event:choose")
      throw new InvalidInputError("an event is pending: expected event:choose");
    resolveEvent(ctx, d, input.option, rng);
    const goalFailed = d.lastRace?.turn === d.turn && d.lastRace.outcome === "goal-failed";
    finishTurn(ctx, d, rng, goalFailed);
    return d;
  }
  if (input.kind === "event:choose") throw new InvalidInputError("no event is pending");

  d.log.push({ turn: d.turn, input, notes: [], deltas: {} });

  if (d.injuryTurns > 0) {
    d.injuryTurns -= 1;
    d.fatigue = Math.max(0, d.fatigue + ctx.ruleset.season.fatigueCost.rest);
    note(d, "log.injured");
    closeTurn(ctx, d, rng);
    return d;
  }

  const forcedRest =
    d.fatigue >= ctx.ruleset.season.forcedRestAt && input.kind.startsWith("train:");

  switch (input.kind) {
    case "train:agility":
    case "train:stamina":
    case "train:technique":
    case "train:risk-flight":
    case "train:simulator":
      if (forcedRest) applyRest(ctx, d, rng, true);
      else applyTraining(ctx, d, input.kind, rng);
      break;
    case "rest":
      applyRest(ctx, d, rng, false);
      break;
    case "outing":
      applyOuting(ctx, d, input.manufacturer);
      break;
    case "workshop":
      applyWorkshop(ctx, d, input.ops, rng);
      break;
  }

  closeTurn(ctx, d, rng);
  return d;
}
