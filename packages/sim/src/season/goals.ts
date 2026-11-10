import type {
  Position,
  RaceOutcome,
  RaceResult,
  RunInput,
  SeasonGoal,
  SeasonState,
} from "@falconess/schema";
import { simulateRace } from "../race/engine.js";
import { goalRaceSetup, PLAYER_RUNNER_ID } from "../race/field.js";
import { flightOf } from "../race/flight.js";
import { changeMood, type Draft, note, type SimContext } from "./context.js";
import { raceLossCostsMood } from "./rules.js";

/** The goal race of the state's turn, if any. */
export function goalForTurn(
  ctx: SimContext,
  s: Pick<SeasonState, "falconessId" | "turn">,
): SeasonGoal | undefined {
  return ctx.content.getFalconess(s.falconessId).seasonGoals.find((g) => g.turn === s.turn);
}

/**
 * The race position a week's input chose (ADR-0008); undefined when it chose none (her wings'
 * default) or the input cannot carry one (`start`, `event:choose`).
 */
export function inputPosition(input: RunInput): Position | undefined {
  return "position" in input ? input.position : undefined;
}

/**
 * Run this turn's goal race (if any) on the race engine (docs/race-engine.md 21.2): the field of
 * `goalRaceSetup` with the player in `position` (absent = her wings' default, ADR-0008), seed
 * `${seed}/race/${turn}`, `detail: "results"`. Takes no draw from the season's per-input Rng.
 * Records the result with the position she ran (a DNF is last place with `maxTicks`), pays scrap
 * and (v3) skill points by place, persists the equipped frame's durability (ADR-0003 D35) and maps the outcome. Returns
 * the outcome, or undefined when no race was due.
 */
export function runGoalRace(
  ctx: SimContext,
  d: Draft,
  position?: Position,
): RaceOutcome | undefined {
  const goal = goalForTurn(ctx, d);
  if (!goal) return undefined;
  const { course, raceSeed, entries } = goalRaceSetup(ctx, d, goal, position);
  const log = simulateRace(ctx.ruleset, entries, course, raceSeed, { detail: "results" });
  const me: RaceResult | undefined = log.results.find((r) => r.runnerId === PLAYER_RUNNER_ID);
  const entry = entries.find((e) => e.runnerId === PLAYER_RUNNER_ID);
  if (!me || !entry) throw new Error(`goal race ${raceSeed}: no result for the player`);
  const fieldSize = entries.length;
  const place = me.dnf ? fieldSize : me.place;
  const timeTicks = me.dnf || me.timeTicks === null ? log.maxTicks : me.timeTicks;

  d.raceResults.push({
    courseId: course.id,
    turn: d.turn,
    place,
    fieldSize,
    timeTicks,
    frameId: d.equippedFrame,
    position: entry.position,
    engine: "v1",
  });
  // ADR-0011: wings never wear in v3; the race runs on the neutral profile, so its durability is
  // not the frame's and the season keeps the frame's own
  if (flightOf(ctx.ruleset)?.noWear !== true)
    d.frameDurability[d.equippedFrame] = Math.floor(me.durabilityEnd / 1000);
  d.wallet.scrap += ctx.ruleset.season.scrapByPlace[place - 1] ?? 10;
  d.skillPoints += ctx.ruleset.season.skillPointsByPlace?.[place - 1] ?? 0;
  note(d, "log.race");

  const outcome: RaceOutcome =
    place > goal.minPlace ? "goal-failed" : place === 1 ? "win" : place <= 3 ? "podium" : "lose";
  d.lastRace = { turn: d.turn, outcome };
  if (raceLossCostsMood(ctx.ruleset, place)) changeMood(d, -1, "race-loss");
  return outcome;
}
