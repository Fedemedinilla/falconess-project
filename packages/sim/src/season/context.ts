import { Rng } from "@falconess/rng";
import type { ContentIndex, LoggedEvent, SeasonState, TurnLogEntry } from "@falconess/schema";
import { CURRENT_RULESET, getRuleset, type Ruleset } from "../rulesets/index.js";

export type SimContext = {
  readonly ruleset: Ruleset;
  readonly content: ContentIndex;
};

/**
 * The context of a run on ruleset `rulesetVersion`: new runs default to `CURRENT_RULESET`
 * (ADR-0006 D1); a saved run passes the version it was played on.
 */
export function seasonContext(
  content: ContentIndex,
  rulesetVersion: string = CURRENT_RULESET.version,
): SimContext {
  return { ruleset: getRuleset(rulesetVersion), content };
}

/**
 * One RNG per applied input, derived from the seed and the input counter. The state never carries
 * RNG internals, replay is trivially consistent, and the UI cannot shift any draw.
 */
export function rngForInput(seed: string, inputIndex: number): Rng {
  return new Rng(`${seed}/${inputIndex}`);
}

/** Mutable working copy of the state for one reducer step. */
export type Draft = SeasonState & { log: TurnLogEntry[] };

/** SeasonState is JSON-safe by construction (it is the save format), so this clone is exact. */
export function draft(state: SeasonState): Draft {
  return JSON.parse(JSON.stringify(state)) as Draft;
}

/** The log entry of the current turn, created if the turn has none yet. */
function entry(d: Draft): TurnLogEntry {
  const last = d.log[d.log.length - 1];
  if (last && last.turn === d.turn) return last;
  const fresh: TurnLogEntry = { turn: d.turn, notes: [], deltas: {} };
  d.log.push(fresh);
  return fresh;
}

/** ADR-0013: one parent's part at the start or at an inspiration, on the turn's entry. */
export function logInspiration(
  d: Draft,
  rec: NonNullable<TurnLogEntry["inspirations"]>[number],
): void {
  const e = entry(d);
  e.inspirations = [...(e.inspirations ?? []), rec];
}

export function note(d: Draft, text: string): void {
  entry(d).notes.push(text);
}

export function addDelta(d: Draft, stat: keyof SeasonState["stats"], delta: number): void {
  const e = entry(d);
  e.deltas[stat] = (e.deltas[stat] ?? 0) + delta;
}

/** Why the mood moved (ADR-0006 D7); the note is `log.mood.<cause>`. */
export type MoodCause = "failure" | "drift" | "race-loss" | "rest" | "outing" | "event";

/**
 * Move the mood by `delta` within −2 … +2 and log what actually changed: `moodDelta` on the turn's
 * entry and, when a cause is given, its note (an event's is `log.mood.event.up` / `.down`). A
 * change the bounds swallow leaves no trace. Returns the applied change.
 */
export function changeMood(d: Draft, delta: number, cause?: MoodCause): number {
  const before = d.mood;
  d.mood = Math.max(-2, Math.min(2, before + delta));
  const applied = d.mood - before;
  if (applied === 0) return 0;
  const e = entry(d);
  const net = (e.moodDelta ?? 0) + applied;
  if (net === 0) delete e.moodDelta;
  else e.moodDelta = net;
  if (cause === "event") e.notes.push(applied > 0 ? "log.mood.event.up" : "log.mood.event.down");
  else if (cause !== undefined) e.notes.push(`log.mood.${cause}`);
  return applied;
}

/**
 * Move the fatigue by `delta` within 0 … fatigueMax (vigor moves by −delta) and log the applied
 * change as `fatigueDelta` on the turn's entry. Returns the applied change.
 */
export function changeFatigue(ctx: SimContext, d: Draft, delta: number): number {
  const before = d.fatigue;
  d.fatigue = Math.max(0, Math.min(ctx.ruleset.season.fatigueMax, before + delta));
  const applied = d.fatigue - before;
  if (applied === 0) return 0;
  const e = entry(d);
  const net = (e.fatigueDelta ?? 0) + applied;
  if (net === 0) delete e.fatigueDelta;
  else e.fatigueDelta = net;
  return applied;
}

/** Record the event resolved this turn on the turn's log entry. */
export function logEvent(d: Draft, event: LoggedEvent): void {
  entry(d).event = event;
}
