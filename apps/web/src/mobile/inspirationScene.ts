import type { SeasonState, TurnLogEntry } from "@falconess/schema";
import type { Step } from "../game/controller";

type InspirationRecord = NonNullable<TurnLogEntry["inspirations"]>[number];

/** What the inheritance card shows: the season's start, or an inspiration week. */
export type InspirationScene = {
  /** A key that changes with each scene (the card shows once per key). */
  readonly key: string;
  readonly kind: "start" | "inspiration";
  readonly turn: number;
  readonly records: readonly InspirationRecord[];
};

/** The start's card: the boxes the season began with, when one of them inspired her. */
function startCard(seed: string, state: SeasonState): InspirationScene | undefined {
  const records = state.log[0]?.inspirations;
  if (!records?.some((r) => r.inspired)) return undefined;
  return { key: `${seed}:start`, kind: "start", turn: 1, records };
}

/** The card of an inspiration week that began with the step (its entry is new to it). */
function weekCard(
  seed: string,
  state: SeasonState,
  step: Step | undefined,
): InspirationScene | undefined {
  if (!step || state !== step.after) return undefined;
  const fresh = step.after.log.slice(step.before.log.length);
  const entry = fresh.find((e) => e.inspirations !== undefined);
  if (!entry?.inspirations?.some((r) => r.inspired)) return undefined;
  return {
    key: `${seed}:${entry.turn}`,
    kind: "inspiration",
    turn: entry.turn,
    records: entry.inspirations,
  };
}

const cards = new WeakMap<readonly InspirationRecord[], InspirationScene>();

/**
 * The inheritance card (ADR-0013, plan §1.5, F19): the start's while the run is only its start
 * (when a box inspired her), a week's from the latest step's new entry whether that step was read
 * or not, either one until its key was shown (the inheritance store keeps those across reloads
 * and the language's remount). The same object on every call.
 */
export function inspirationCard(
  seed: string,
  state: SeasonState,
  inputs: number,
  step: Step | undefined,
  shown: ReadonlySet<string>,
): InspirationScene | undefined {
  const card = inputs === 1 ? startCard(seed, state) : weekCard(seed, state, step);
  if (!card || shown.has(card.key)) return undefined;
  const hit = cards.get(card.records);
  if (hit?.key === card.key) return hit;
  cards.set(card.records, card);
  return card;
}

/**
 * Every card a run's state holds, the start's and each inspiration week's: an earlier build
 * showed these before their step was read (the inheritance store's one-time migration).
 */
export function cardKeys(seed: string, state: SeasonState): string[] {
  const start = startCard(seed, state);
  const weeks = state.log
    .slice(1)
    .filter((e) => e.inspirations?.some((r) => r.inspired))
    .map((e) => `${seed}:${e.turn}`);
  return start ? [start.key, ...weeks] : weeks;
}

/** The key of the card the step left, if it left one. */
export function stepCardKey(
  seed: string,
  state: SeasonState,
  step: Step | undefined,
): string | undefined {
  return weekCard(seed, state, step)?.key;
}
