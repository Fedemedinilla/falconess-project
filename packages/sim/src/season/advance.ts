import type { Rng } from "@falconess/rng";
import type { RunInput, SeasonState } from "@falconess/schema";
import { changeFatigue, type Draft, draft, note, rngForInput, type SimContext } from "./context.js";
import { resolveEvent, rollEvent } from "./events.js";
import { goalForTurn, runGoalRace } from "./goals.js";
import { gradeFor } from "./grade.js";
import { rollCrewPresence } from "./hangar.js";
import { actionBlock } from "./rules.js";
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
  const outcome = runGoalRace(ctx, d);
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
 * A state is only ever advanced by the ruleset it was started on (ADR-0006 D1): a saved v1 run
 * replays under v1 forever, and a context of another version is a caller's bug, not a rule.
 */
function checkRuleset(ctx: SimContext, state: SeasonState): void {
  if (state.rulesetVersion !== ctx.ruleset.version)
    throw new Error(
      `the state was played on ruleset ${state.rulesetVersion}, not ${ctx.ruleset.version}: use getRuleset(state.rulesetVersion)`,
    );
}

/**
 * The season reducer: pure, deterministic, `advanceSeason(ctx, state, input) → state'`.
 * The RNG for this step is derived from the seed and the number of inputs applied so far.
 */
export function advanceSeason(ctx: SimContext, state: SeasonState, input: RunInput): SeasonState {
  checkRuleset(ctx, state);
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

  applyAction(ctx, d, input, rng);
  closeTurn(ctx, d, rng);
  return d;
}

type ActionInput = Exclude<RunInput, { kind: "start" } | { kind: "event:choose" }>;

/**
 * The turn's action: an injured turn rests whatever the input (recovering `−fatigueCost.rest`, no
 * draw); in v1 a training at `forcedRestAt` or more rests instead (`actionBlock`).
 */
function applyAction(ctx: SimContext, d: Draft, input: ActionInput, rng: Rng): void {
  d.log.push({ turn: d.turn, input, notes: [], deltas: {} });
  const block = actionBlock(ctx.ruleset, d, input.kind);

  if (block === "injured") {
    d.injuryTurns -= 1;
    note(d, "log.injured");
    changeFatigue(ctx, d, ctx.ruleset.season.fatigueCost.rest);
    return;
  }

  const forcedRest = block === "forced-rest";

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
}

/**
 * The state the goal race of `advanceSeason(ctx, state, input)` runs on: `input` applied by the
 * same code with the same per-input Rng, stopped before the race. With `goalRaceSetup` it lets a
 * viewer rebuild that race exactly (docs/race-engine.md 21.2: the race takes no season draw).
 * Undefined when the input runs no goal race (an event choice, an ended season, no goal this turn).
 */
export function goalRaceState(
  ctx: SimContext,
  state: SeasonState,
  input: RunInput,
): SeasonState | undefined {
  checkRuleset(ctx, state);
  if (state.status === "ended" || state.pendingEvent) return undefined;
  if (input.kind === "start" || input.kind === "event:choose") return undefined;
  const d = draft(state);
  if (!goalForTurn(ctx, d)) return undefined;
  const rng = rngForInput(d.seed, d.inputsApplied);
  d.inputsApplied += 1;
  applyAction(ctx, d, input, rng);
  return d;
}
