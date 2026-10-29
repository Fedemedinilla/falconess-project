/**
 * One input of a season read for people (ADR-0006 D7): what it added to the season log and the
 * event it resolved, as the content defines it. `pnpm play` / `pnpm sim` (apps/cli render.ts) and
 * the web's «Lo que pasó» (apps/web screens/model/week.ts) read a step through these two
 * functions, so the terminal and the browser never disagree on what a week did. Nothing is
 * simulated again: the notes and deltas are the log's, the effects are the content's blocks the
 * sim applied (the option's, then the drawn branch's). Words belong to each reader.
 */
import type {
  ContentIndex,
  EventEffects,
  EventOption,
  GameEvent,
  LoggedEvent,
  SeasonState,
  StatName,
} from "@falconess/schema";
import { STAT_ORDER } from "@falconess/sim";

/** What one input added to the season log. */
export type StepLog = {
  /**
   * The notes it added, in order: those of the entries it created and those it appended to an
   * entry already there (an event choice extends the entry of the week it answers).
   */
  readonly notes: readonly string[];
  /** The stat deltas it added to the log: the action's and an event's, mixed. */
  readonly deltas: ReadonlyMap<StatName, number>;
  /** The event it resolved, chosen or applied by itself (`auto`), if any. */
  readonly event: LoggedEvent | undefined;
};

/** The log only grows: new entries, or notes, deltas and an event added to the last one. */
export function stepLog(before: SeasonState, after: SeasonState): StepLog {
  const notes: string[] = [];
  const deltas = new Map<StatName, number>();
  let event: LoggedEvent | undefined;
  after.log.forEach((entry, i) => {
    const old = before.log[i];
    notes.push(...entry.notes.slice(old?.notes.length ?? 0));
    for (const stat of STAT_ORDER) {
      const d = (entry.deltas[stat] ?? 0) - (old?.deltas[stat] ?? 0);
      if (d !== 0) deltas.set(stat, (deltas.get(stat) ?? 0) + d);
    }
    if (entry.event && !old?.event) event ??= entry.event;
  });
  return { notes, deltas, event };
}

export type ChanceBranch = NonNullable<EventOption["chance"]>[number];

/** A logged event as the content defines it. */
export type ResolvedEvent = {
  readonly event: GameEvent;
  readonly option: EventOption;
  /** The chance branch the sim drew, when the option has them. */
  readonly branch: ChanceBranch | undefined;
  /** The effect blocks the sim applied, in order: the option's, then the branch's. */
  readonly effects: readonly EventEffects[];
  /**
   * The notes the sim logged for it, in order (season/events.ts): the event's text, an auto
   * event's option text (the player saw no dialog), the branch's text.
   */
  readonly noteKeys: readonly string[];
  /** Its stat effects summed over the blocks, in `STAT_ORDER`, zeros left out. */
  readonly stats: readonly { readonly stat: StatName; readonly delta: number }[];
};

/** The content behind a logged event; undefined when content does not know it or its option. */
export function resolveLoggedEvent(
  content: ContentIndex,
  logged: LoggedEvent,
): ResolvedEvent | undefined {
  const event = content.events.get(logged.id);
  const option = event?.options[logged.option];
  if (!event || !option) return undefined;
  const branch = logged.branch === undefined ? undefined : option.chance?.[logged.branch];
  const effects = branch ? [option.effects, branch.effects] : [option.effects];
  const noteKeys = [event.textKey];
  if (logged.auto) noteKeys.push(option.textKey);
  if (branch?.textKey !== undefined) noteKeys.push(branch.textKey);
  const stats = STAT_ORDER.map((stat) => ({
    stat,
    delta: effects.reduce((sum, fx) => sum + (fx.stats[stat] ?? 0), 0),
  })).filter((s) => s.delta !== 0);
  return { event, option, branch, effects, noteKeys, stats };
}
