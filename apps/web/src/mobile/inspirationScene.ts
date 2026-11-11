import type { SeasonState, TurnLogEntry } from "@falconess/schema";
import type { Step } from "../game/controller";

export type InspirationRecord = NonNullable<TurnLogEntry["inspirations"]>[number];

/** What the inheritance card shows: the season's start, or an inspiration week. */
export type InspirationScene = {
  /** A key that changes with each scene (the card shows once per key). */
  readonly key: string;
  readonly kind: "start" | "inspiration";
  readonly turn: number;
  readonly records: readonly InspirationRecord[];
};

/**
 * The scene the last step left (ADR-0013): an inspiration week that began with it (its entry is
 * new to the step), or, on a run of only its start, the start's own. Undefined when no box did
 * anything worth the card (no record inspired her).
 */
export function inspirationScene(
  seed: string,
  state: SeasonState,
  inputs: number,
  step: Step | undefined,
  stepSeen: boolean,
): InspirationScene | undefined {
  if (inputs === 1) {
    const records = state.log[0]?.inspirations;
    if (records?.some((r) => r.inspired))
      return { key: `${seed}:start`, kind: "start", turn: 1, records };
    return undefined;
  }
  if (!step || stepSeen || state !== step.after) return undefined;
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
