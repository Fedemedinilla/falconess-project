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
  CURRENT_RULESET,
  getRuleset,
  InvalidInputError,
  RULESET_V1,
  replaySeason,
  type SimContext,
  startSeason,
  WorkshopError,
} from "@falconess/sim";
import {
  parseSavedRun,
  runFingerprint,
  SAVE_SCHEMA_VERSION,
  type SavedRun,
  serializeRun,
} from "./run";
import { type KeyValueStore, RUN_KEY, readKey, SEEN_KEY, writeKey } from "./storage";

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
 * The step `act` just applied (after a load: the run's last input). `before` + `input` rebuild
 * that turn's goal race with detail "full" (game/goal-race.ts) and give «Lo que pasó»
 * (screens/WeekDialog.tsx) its "before" numbers.
 */
export type Step = {
  readonly before: SeasonState;
  readonly input: RunInput;
  readonly after: SeasonState;
};

export type GameSnapshot = {
  readonly run: ActiveRun | undefined;
  readonly lastStep: Step | undefined;
  /**
   * Whether the player has read `lastStep` in «Lo que pasó» (true when there is none): false
   * right after `act`; after a load, true only when this browser already saw that run's last week.
   */
  readonly lastStepSeen: boolean;
  readonly error: GameError | undefined;
  /** The run in play is in this browser's storage (false when storage is blocked). */
  readonly saved: boolean;
};

const EMPTY: GameSnapshot = {
  run: undefined,
  lastStep: undefined,
  lastStepSeen: true,
  error: undefined,
  saved: false,
};

/**
 * The ruleset of a pasted `replay:` line that carries no version: those lines were all printed by
 * `pnpm play` on v1 (today it prints the whole save, version included). Never the current ruleset:
 * replaying a v1 run on v2 rules gives another season.
 */
const CLI_REPLAY_RULESET = RULESET_V1.version;

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export class GameController {
  readonly #content: (rulesetVersion: string) => ContentIndex;
  readonly #store: KeyValueStore | undefined;
  readonly #listeners = new Set<() => void>();
  #snap: GameSnapshot = EMPTY;

  /**
   * `content` is the index every ruleset plays on, or a function that gives each ruleset its own
   * (`seasonContent`: v3 races its calendar's goals on the catalogue tracks).
   */
  constructor(
    content: ContentIndex | ((rulesetVersion: string) => ContentIndex),
    store: KeyValueStore | undefined,
  ) {
    this.#content = typeof content === "function" ? content : () => content;
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

  /**
   * The simulation context of the run in play: the ruleset that run started on (a v1 save keeps
   * playing v1), or the ruleset new seasons start on when there is none.
   */
  context(): SimContext {
    return this.#ctx(this.#snap.run?.rulesetVersion ?? CURRENT_RULESET.version);
  }

  /** The context a new season starts on (`CURRENT_RULESET`), whatever run is in play. */
  newRunContext(): SimContext {
    return this.#ctx(CURRENT_RULESET.version);
  }

  // --- actions ----------------------------------------------------------------------------------

  /**
   * Start a season on the current ruleset (`CURRENT_RULESET`, ADR-0006). False (and `error`) when
   * the sim rejects the start input.
   */
  start(falconessId: string, hangar: readonly string[], seed: string): boolean {
    const input: RunInput = { kind: "start", falconessId, hangar: [...hangar], parents: [] };
    const ctx = this.newRunContext();
    try {
      const state = startSeason(ctx, seed, input);
      this.#setRun({ seed, rulesetVersion: ctx.ruleset.version, inputs: [input], state });
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
        false,
      );
      return true;
    } catch (e) {
      if (e instanceof WorkshopError) this.#fail("workshop", e);
      else if (e instanceof InvalidInputError) this.#fail("invalid-input", e);
      else this.#fail("unexpected", e);
      return false;
    }
  }

  /**
   * Testers' undo: replay the run without its last input. The start input cannot be undone. The
   * week it goes back to was read when it was played: «Lo que pasó» does not open for it again.
   */
  undoLast(): boolean {
    const run = this.#snap.run;
    if (!run || run.inputs.length <= 1) return false;
    const inputs = run.inputs.slice(0, -1);
    try {
      const state = replaySeason(this.#ctx(run.rulesetVersion), run.seed, inputs);
      const back = { ...run, inputs, state };
      writeKey(this.#store, SEEN_KEY, runFingerprint(back));
      this.#setRun(back);
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

  /**
   * The player has read «Lo que pasó» for the last step: it closes, and this browser remembers
   * it (`SEEN_KEY`, guarded storage) so a reload does not open it again.
   */
  acknowledgeStep(): void {
    const run = this.#snap.run;
    if (!run || this.#snap.lastStepSeen) return;
    writeKey(this.#store, SEEN_KEY, runFingerprint(run));
    this.#emit({ ...this.#snap, lastStepSeen: true });
  }

  /** Open «Lo que pasó» for the last step again (the recap line above the actions). */
  showStepAgain(): void {
    if (!this.#snap.lastStep || !this.#snap.lastStepSeen) return;
    this.#emit({ ...this.#snap, lastStepSeen: false });
  }

  // --- save, load, copy ------------------------------------------------------------------------

  /** The run in storage, if there is a readable one (the state is not rebuilt). */
  savedRun(): SavedRun | undefined {
    const text = readKey(this.#store, RUN_KEY);
    if (text === undefined) return undefined;
    const parsed = parseSavedRun(text, CLI_REPLAY_RULESET);
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
    const parsed = parseSavedRun(text, CLI_REPLAY_RULESET);
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
    return { ruleset: getRuleset(rulesetVersion), content: this.#content(rulesetVersion) };
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
      // the run without its last input, then that input: the same replay, plus the last step for
      // «Lo que pasó» (which opens unless this browser already saw that week of this very run)
      const last = save.inputs.at(-1);
      let state: SeasonState;
      let step: Step | undefined;
      if (save.inputs.length > 1 && last) {
        const before = replaySeason(ctx, save.seed, save.inputs.slice(0, -1));
        state = advanceSeason(ctx, before, last);
        step = { before, input: last, after: state };
      } else state = replaySeason(ctx, save.seed, save.inputs);
      const run = {
        seed: save.seed,
        rulesetVersion: save.rulesetVersion,
        inputs: save.inputs,
        state,
      };
      this.#setRun(run, step, readKey(this.#store, SEEN_KEY) === runFingerprint(run));
      return true;
    } catch (e) {
      this.#fail("load-replay", e);
      return false;
    }
  }

  /** Install a run and save it (autosave after every change). */
  #setRun(run: ActiveRun, lastStep?: Step, seen = true): void {
    const saved = writeKey(this.#store, RUN_KEY, serializeRun(this.#toSave(run)));
    const lastStepSeen = lastStep === undefined || seen;
    this.#emit({ run, lastStep, lastStepSeen, error: undefined, saved });
  }

  #fail(kind: GameErrorKind, e: unknown): void {
    this.#emit({ ...this.#snap, error: { kind, detail: message(e) } });
  }

  #emit(snap: GameSnapshot): void {
    this.#snap = snap;
    for (const listener of this.#listeners) listener();
  }
}
