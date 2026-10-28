/**
 * The game controller: the only place that holds a run. It keeps `{ seed, inputs, state }` and
 * every state comes from @falconess/sim (startSeason, advanceSeason, replaySeason); the UI reads
 * snapshots and sends inputs, and never computes a rule itself.
 *
 * Framework-free on purpose: React subscribes through `useGame` (useSyncExternalStore), tests
 * drive it directly. Snapshots are immutable and change identity only when something changed.
 */
import type { ContentIndex, RunInput, SeasonState } from "@falconess/schema";
import {
  advanceSeason,
  getRuleset,
  InvalidInputError,
  RULESET_V1,
  replaySeason,
  type SimContext,
  startSeason,
  WorkshopError,
} from "@falconess/sim";
import { parseSavedRun, SAVE_SCHEMA_VERSION, type SavedRun, serializeRun } from "./run";
import { type KeyValueStore, RUN_KEY, readKey, writeKey } from "./storage";

/** What went wrong, for the screen: `ui.error.<kind>` names it, `detail` is the technical part. */
export const GAME_ERROR_KINDS = [
  "start",
  "workshop",
  "invalid-input",
  "unexpected",
  "load-json",
  "load-format",
  "load-version",
  "load-ruleset",
  "load-replay",
] as const;
export type GameErrorKind = (typeof GAME_ERROR_KINDS)[number];

export type GameError = { readonly kind: GameErrorKind; readonly detail: string };

/** A run in play: the save (seed + inputs) and the state the season rebuilt from it. */
export type ActiveRun = {
  readonly seed: string;
  readonly rulesetVersion: string;
  readonly inputs: readonly RunInput[];
  readonly state: SeasonState;
};

/**
 * The step `act` just applied. `before` + `input` rebuild that turn's goal race with detail
 * "full" (game/goal-race.ts) and give the turn summary its "before" numbers.
 */
export type Step = {
  readonly before: SeasonState;
  readonly input: RunInput;
  readonly after: SeasonState;
};

export type GameSnapshot = {
  readonly run: ActiveRun | undefined;
  readonly lastStep: Step | undefined;
  readonly error: GameError | undefined;
  /** The run in play is in this browser's storage (false when storage is blocked). */
  readonly saved: boolean;
};

const EMPTY: GameSnapshot = { run: undefined, lastStep: undefined, error: undefined, saved: false };

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export class GameController {
  readonly #content: ContentIndex;
  readonly #store: KeyValueStore | undefined;
  readonly #listeners = new Set<() => void>();
  #snap: GameSnapshot = EMPTY;

  constructor(content: ContentIndex, store: KeyValueStore | undefined) {
    this.#content = content;
    this.#store = store;
  }

  // --- store protocol (useSyncExternalStore) ---------------------------------------------------

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  readonly getSnapshot = (): GameSnapshot => this.#snap;

  /** Whether this browser can keep runs at all. */
  get canSave(): boolean {
    return this.#store !== undefined;
  }

  /** The simulation context of the run in play (the current ruleset when there is none). */
  context(): SimContext {
    return this.#ctx(this.#snap.run?.rulesetVersion ?? RULESET_V1.version);
  }

  // --- actions ----------------------------------------------------------------------------------

  /** Start a season. False (and `error`) when the sim rejects the start input. */
  start(falconessId: string, hangar: readonly string[], seed: string): boolean {
    const input: RunInput = { kind: "start", falconessId, hangar: [...hangar], parents: [] };
    const ctx = this.#ctx(RULESET_V1.version);
    try {
      const state = startSeason(ctx, seed, input);
      this.#setRun(
        { seed, rulesetVersion: ctx.ruleset.version, inputs: [input], state },
        undefined,
      );
      return true;
    } catch (e) {
      this.#fail("start", e);
      return false;
    }
  }

  /**
   * Apply one input. A workshop order the sim refuses, or an input that does not fit the state
   * (an event is pending, the season ended), leaves the run as it was and sets `error`.
   *
   * `expectInputs` is the length of the run the screen showed when the player chose: when the
   * run has moved on since (the second click of a double click, already applied), the input is
   * ignored without an error, so one gesture never spends two weeks.
   */
  act(input: RunInput, expectInputs?: number): boolean {
    const run = this.#snap.run;
    if (!run) return false;
    if (expectInputs !== undefined && run.inputs.length !== expectInputs) return false;
    try {
      const after = advanceSeason(this.#ctx(run.rulesetVersion), run.state, input);
      this.#setRun(
        { ...run, inputs: [...run.inputs, input], state: after },
        { before: run.state, input, after },
      );
      return true;
    } catch (e) {
      if (e instanceof WorkshopError) this.#fail("workshop", e);
      else if (e instanceof InvalidInputError) this.#fail("invalid-input", e);
      else this.#fail("unexpected", e);
      return false;
    }
  }

  /** Testers' undo: replay the run without its last input. The start input cannot be undone. */
  undoLast(): boolean {
    const run = this.#snap.run;
    if (!run || run.inputs.length <= 1) return false;
    const inputs = run.inputs.slice(0, -1);
    try {
      const state = replaySeason(this.#ctx(run.rulesetVersion), run.seed, inputs);
      this.#setRun({ ...run, inputs, state }, undefined);
      return true;
    } catch (e) {
      this.#fail("unexpected", e);
      return false;
    }
  }

  /** Leave the run in play (it stays in storage, if it was saved) to set up a new season. */
  newSeason(): void {
    this.#emit(EMPTY);
  }

  clearError(): void {
    if (this.#snap.error) this.#emit({ ...this.#snap, error: undefined });
  }

  // --- save, load, copy ------------------------------------------------------------------------

  /** The run in storage, if there is a readable one (the state is not rebuilt). */
  savedRun(): SavedRun | undefined {
    const text = readKey(this.#store, RUN_KEY);
    if (text === undefined) return undefined;
    const parsed = parseSavedRun(text, RULESET_V1.version);
    return parsed.ok ? parsed.run : undefined;
  }

  /** Replay the stored run. */
  continueSaved(): boolean {
    const saved = this.savedRun();
    if (!saved) return false;
    return this.#replayInto(saved);
  }

  /** Replay a pasted run (the JSON of "Copiar partida", or the `replay:` line of `pnpm play`). */
  loadText(text: string): boolean {
    const parsed = parseSavedRun(text, RULESET_V1.version);
    if (!parsed.ok) {
      this.#fail(`load-${parsed.error}`, parsed.detail);
      return false;
    }
    return this.#replayInto(parsed.run);
  }

  /** The run in play as save JSON (what "Copiar partida" copies). */
  exportText(): string | undefined {
    const run = this.#snap.run;
    return run ? serializeRun(this.#toSave(run)) : undefined;
  }

  /** Write the run in play to storage now. True when it was stored. */
  save(): boolean {
    const run = this.#snap.run;
    if (!run) return false;
    const saved = writeKey(this.#store, RUN_KEY, serializeRun(this.#toSave(run)));
    if (saved !== this.#snap.saved) this.#emit({ ...this.#snap, saved });
    return saved;
  }

  // --- internals --------------------------------------------------------------------------------

  #ctx(rulesetVersion: string): SimContext {
    return { ruleset: getRuleset(rulesetVersion), content: this.#content };
  }

  #toSave(run: ActiveRun): SavedRun {
    return {
      schemaVersion: SAVE_SCHEMA_VERSION,
      rulesetVersion: run.rulesetVersion,
      seed: run.seed,
      inputs: [...run.inputs],
    };
  }

  #replayInto(save: SavedRun): boolean {
    let ctx: SimContext;
    try {
      ctx = this.#ctx(save.rulesetVersion);
    } catch (e) {
      this.#fail("load-ruleset", e);
      return false;
    }
    try {
      const state = replaySeason(ctx, save.seed, save.inputs);
      this.#setRun(
        { seed: save.seed, rulesetVersion: save.rulesetVersion, inputs: save.inputs, state },
        undefined,
      );
      return true;
    } catch (e) {
      this.#fail("load-replay", e);
      return false;
    }
  }

  /** Install a run and save it (autosave after every change). */
  #setRun(run: ActiveRun, lastStep: Step | undefined): void {
    const saved = writeKey(this.#store, RUN_KEY, serializeRun(this.#toSave(run)));
    this.#emit({ run, lastStep, error: undefined, saved });
  }

  #fail(kind: GameErrorKind, e: unknown): void {
    this.#emit({ ...this.#snap, error: { kind, detail: message(e) } });
  }

  #emit(snap: GameSnapshot): void {
    this.#snap = snap;
    for (const listener of this.#listeners) listener();
  }
}
