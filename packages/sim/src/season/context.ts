import { Rng } from "@falconess/rng";
import type { ContentIndex, SeasonState, TurnLogEntry } from "@falconess/schema";
import type { Ruleset } from "../rulesets/index.js";

export type SimContext = {
  readonly ruleset: Ruleset;
  readonly content: ContentIndex;
};

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

export function note(d: Draft, text: string): void {
  const last = d.log[d.log.length - 1];
  if (last && last.turn === d.turn) last.notes.push(text);
  else d.log.push({ turn: d.turn, notes: [text], deltas: {} });
}

export function addDelta(d: Draft, stat: keyof SeasonState["stats"], delta: number): void {
  const last = d.log[d.log.length - 1];
  if (!last || last.turn !== d.turn) {
    d.log.push({ turn: d.turn, notes: [], deltas: { [stat]: delta } });
    return;
  }
  last.deltas[stat] = (last.deltas[stat] ?? 0) + delta;
}
