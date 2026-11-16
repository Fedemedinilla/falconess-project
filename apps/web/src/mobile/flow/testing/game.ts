/**
 * A game for the flow's node tests: a real `GameController` on a memory store, with the stores the
 * flow reads (the week's record, the scenes seen, the cards shown) on the same store, as the run's
 * view will have them, and the seeded saves of the phone e2e loaded as «Continuar» loads them.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadSeasonContent } from "@falconess/content";
import type { Position, RunInput, SeasonState, StoryScene } from "@falconess/schema";
import { type ActiveRun, GameController } from "../../../game/controller";
import { runFingerprint } from "../../../game/run";
import { RUN_KEY, SEEN_KEY } from "../../../game/storage";
import type { WeekActionInput } from "../../../screens/model/position";
import type { Pace } from "../../pace";
import { createStoryStore, STORY_KEY, type StoryStore } from "../../storyModel";
import { WeekStore } from "../decidedWeek";
import { factsOf } from "../facts";
import { InspirationStore } from "../inspirations";
import type { FlowFacts } from "../types";
import { INITIAL_UI, reduceUi, type UiEvent, type UiState } from "../ui";
import { testScenes } from "./content";
import { memoryStore } from "./memory";

export type TestGame = {
  readonly kv: ReturnType<typeof memoryStore>;
  readonly game: GameController;
  readonly weeks: WeekStore;
  readonly story: StoryStore;
  readonly cards: InspirationStore;
};

/** A new game and its stores on one memory store (`seed`: what the store holds at first). */
export function testGame(seed: Readonly<Record<string, string>> = {}): TestGame {
  const kv = memoryStore(seed);
  return {
    kv,
    game: new GameController(loadSeasonContent, kv),
    weeks: new WeekStore(kv),
    story: createStoryStore(kv),
    cards: new InspirationStore(kv),
  };
}

const SAVES = fileURLToPath(new URL("../../../../e2e/saves/", import.meta.url));

/** A seeded save's file (`e2e/saves/<name>.json`, checked by `scripts/e2e-saves.test.ts`). */
type SeededSave = {
  readonly save: { readonly seed: string };
  readonly vista: string;
  readonly historia: readonly string[];
};

/**
 * What `seedRun` stores for a seeded save: the run, its last week read (`vista`) and its scenes
 * seen (`historia`, which `historia` here replaces), plus `elsewhere`: scenes seen only in another
 * season of this browser.
 */
export function saveSeed(
  name: string,
  historia?: readonly string[],
  elsewhere: readonly string[] = [],
): Record<string, string> {
  const text = readFileSync(`${SAVES}${name}.json`, "utf8");
  const fixture: SeededSave = JSON.parse(text);
  const seen = historia ?? fixture.historia;
  return {
    [RUN_KEY]: JSON.stringify(fixture.save),
    [SEEN_KEY]: fixture.vista,
    [STORY_KEY]: JSON.stringify({
      runs: { [fixture.save.seed]: seen },
      ever: [...seen, ...elsewhere],
    }),
  };
}

/** A seeded save, continued, as the e2e's «Continuar» opens it. */
export function loadSave(name: string, historia?: readonly string[]): TestGame {
  const t = testGame(saveSeed(name, historia));
  if (!t.game.continueSaved()) throw new Error(`the seeded save ${name} did not load`);
  return t;
}

/** The facts the flow reads from the game now (Normal pace, motion, no sheet open by default). */
export function factsFor(
  t: TestGame,
  page: {
    readonly pace?: Pace;
    readonly reduced?: boolean;
    readonly sheetOpen?: boolean;
    readonly scenes?: readonly StoryScene[];
  } = {},
): FlowFacts {
  const snap = t.game.getSnapshot();
  if (!snap.run) throw new Error("no run in play");
  return factsOf(t.game.context(), {
    snap: { run: snap.run, lastStep: snap.lastStep, lastStepSeen: snap.lastStepSeen },
    week: t.weeks.getSnapshot(),
    story: t.story,
    cards: t.cards,
    scenes: page.scenes ?? testScenes(),
    pace: page.pace ?? "normal",
    reduced: page.reduced ?? false,
    sheetOpen: page.sheetOpen ?? false,
  });
}

/** The run in play. */
export function runOf(t: TestGame): ActiveRun {
  const run = t.game.getSnapshot().run;
  if (!run) throw new Error("no run in play");
  return run;
}

export const fpOf = (t: TestGame): string => runFingerprint(runOf(t));
export const stateOf = (t: TestGame): SeasonState => runOf(t).state;

/** A new mount's UI state after `events`. */
export const uiAfter = (...events: UiEvent[]): UiState => events.reduce(reduceUi, INITIAL_UI);

/*
 * What the flow's commands do to the stores and the UI state (3.4 builds them), for the tests that
 * look at one moment: each returns the UI state of a mount that just did it.
 */

/** A week's input committed in this mount. */
export function commit(t: TestGame, input: RunInput): UiState {
  if (!t.game.act(input)) throw new Error(`refused: ${input.kind}`);
  return uiAfter({ type: "acted", fp: fpOf(t) });
}

/** A race week's action decided in this mount (its preview played). */
export function decide(
  t: TestGame,
  input: WeekActionInput,
  from: "menu" | "train" | "workshop" = "menu",
  position?: Position,
): UiState {
  const run = runOf(t);
  const fp = runFingerprint(run);
  t.weeks.decide({
    fp,
    turn: run.state.turn,
    inputs: run.inputs.length,
    input,
    position,
    stage: "action",
  });
  return uiAfter({ type: "decided", fp, from });
}

/** «Correr» on the decided week's input. */
export function race(t: TestGame, input: WeekActionInput): UiState {
  if (!t.game.act(input)) throw new Error(`refused: ${input.kind}`);
  t.weeks.clear();
  return uiAfter({ type: "raced", fp: fpOf(t) });
}
