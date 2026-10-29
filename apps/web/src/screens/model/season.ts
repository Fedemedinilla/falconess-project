/**
 * Read-only views of a SeasonState for the season screens: the goal races and their results, the
 * last week's changes and the recent log. Everything is read from the state the sim produced (its
 * `log`, `raceResults` and the Falconess's `seasonGoals`); nothing is recomputed.
 */
import type {
  RaceResultEntry,
  SeasonGoal,
  SeasonState,
  StatName,
  TurnLogEntry,
} from "@falconess/schema";
import { type SimContext, STAT_ORDER } from "@falconess/sim";
import { ui } from "../../text/ui";

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
  const goals = [...ctx.content.getFalconess(state.falconessId).seasonGoals].sort(
    (a, b) => a.turn - b.turn,
  );
  const failed = failedTurn(state);
  return goals.map((goal) => {
    const result = state.raceResults.find((r) => r.turn === goal.turn);
    return { goal, result, met: result === undefined ? undefined : result.turn !== failed };
  });
}

export type NextGoal = {
  readonly goal: SeasonGoal;
  /** Weeks until it: 0 = this week, after the week's action. */
  readonly weeksLeft: number;
};

/** The next goal race that has not run yet. */
export function nextGoal(ctx: SimContext, state: SeasonState): NextGoal | undefined {
  const next = goalStatuses(ctx, state).find((g) => g.result === undefined);
  return next && { goal: next.goal, weeksLeft: next.goal.turn - state.turn };
}

/**
 * The goal race of the last closed week (`lastClosedTurn`): the one that just ran, shown in the
 * week right after it, in its own week while its event waits, and on the season's last screen.
 */
export function freshRace(ctx: SimContext, state: SeasonState): GoalStatus | undefined {
  const last = state.raceResults.at(-1);
  if (!last || last.turn !== lastClosedTurn(state)) return undefined;
  return goalStatuses(ctx, state).find((g) => g.goal.turn === last.turn);
}

/** The last week the season log has closed: the week before, or this one while an event waits. */
export function lastClosedTurn(state: SeasonState): number {
  return state.pendingEvent || state.status === "ended" ? state.turn : state.turn - 1;
}

/** Stat changes of one week, summed over its log entries (action, event, race). */
export function turnDeltas(state: SeasonState, turn: number): Partial<Record<StatName, number>> {
  const out: Partial<Record<StatName, number>> = {};
  for (const entry of state.log) {
    if (entry.turn !== turn) continue;
    for (const stat of STAT_ORDER) {
      const d = entry.deltas[stat];
      if (d !== undefined && d !== 0) out[stat] = (out[stat] ?? 0) + d;
    }
  }
  return out;
}

export type WeekLog = {
  readonly turn: number;
  /** The week's action, if one was taken (the start has none). */
  readonly input: TurnLogEntry["input"];
  /** Text keys of what happened, in order. */
  readonly notes: readonly string[];
  readonly deltas: Partial<Record<StatName, number>>;
  /** The goal race of that week, if one ran. */
  readonly race: RaceResultEntry | undefined;
};

/** The last `count` weeks of the season log, newest first. */
export function recentWeeks(state: SeasonState, count: number): WeekLog[] {
  const turns: number[] = [];
  for (let i = state.log.length - 1; i >= 0 && turns.length < count; i--) {
    const turn = state.log[i]?.turn;
    if (turn !== undefined && !turns.includes(turn)) turns.push(turn);
  }
  return turns.map((turn) => {
    const entries = state.log.filter((e) => e.turn === turn);
    return {
      turn,
      input: entries.find((e) => e.input !== undefined)?.input,
      notes: entries.flatMap((e) => e.notes),
      deltas: turnDeltas(state, turn),
      race: state.raceResults.find((r) => r.turn === turn),
    };
  });
}

/**
 * Log notes the page words itself: v1's forced rest says "vigor bajo", as the rest of the page
 * (its game text still says «Fatiga alta», the CLI's word for it).
 */
const NOTE_WORDS: Readonly<Record<string, string>> = { "log.rest.forced": "ui.log.forcedRest" };

/** A log note in words: the page's own wording, its game text, or the key itself (never a crash). */
export function logNoteText(ctx: SimContext, key: string): string {
  const own = NOTE_WORDS[key];
  if (own) return ui(own);
  return ctx.content.text.has(key) ? ctx.content.t(key) : key;
}

/** Whether a log note is an event's text (`ev.*`), shown apart from the plain notes. */
export function isEventNote(key: string): boolean {
  return key.startsWith("ev.");
}
