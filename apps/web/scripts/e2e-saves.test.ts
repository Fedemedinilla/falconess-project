/**
 * The seeded saves of the phone e2e (`e2e/saves/*.json`, read by `seedRun` in
 * `e2e/mobile-helpers.ts`): runs that «Continuar» opens at a state a random season reaches only by
 * luck (a lost first race, an inspiration week, an injury, the season's end…). Each file holds:
 *
 * - `save`: the run, as the browser stores it (`falconess.pruebas.partida`);
 * - `vista`: its fingerprint (`falconess.pruebas.vista`), so its last week counts as read;
 * - `historia`: every scene of hers whose trigger has held by then (`falconess.juego.historia`),
 *   except the race week's own scene before its race, which the race mode plays;
 * - `expect`: the facts the e2e relies on, and `due`, the scenes due at load (none).
 *
 * This test replays every file and checks all of it; when the content moves a fact, it fails and
 * says how to search the seeds again and rewrite the files:
 *
 *   WRITE_SAVES=1 pnpm vitest run --project web-flow scripts/e2e-saves.test.ts
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  BlackBox,
  Difficulty,
  RunInput,
  SeasonState,
  StatName,
  StoryScene,
  TrainingKind,
} from "@falconess/schema";
import {
  advanceSeason,
  CURRENT_RULESET,
  goalForTurn,
  type SimContext,
  startSeason,
  trainingRisk,
} from "@falconess/sim";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { GameController } from "../src/game/controller";
import { parseSavedRun, runFingerprint, type SavedRun, serializeRun } from "../src/game/run";
import { type KeyValueStore, RUN_KEY, SEEN_KEY } from "../src/game/storage";
import { dueScenes } from "../src/mobile/flow/scenes";
import { testContext, testScenes } from "../src/mobile/flow/testing/content";
import { triggerHolds } from "../src/mobile/storyModel";
import { goalStatuses } from "../src/screens/model/goals";
import { defaultHangar } from "../src/screens/model/new-season";

const SAVES = fileURLToPath(new URL("../e2e/saves/", import.meta.url));
const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const WRITE = process.env.WRITE_SAVES === "1";
const DRIFT =
  "content changed: run `WRITE_SAVES=1 pnpm vitest run --project web-flow scripts/e2e-saves.test.ts`";
/** Seeds tried per fixture when writing, as the phone draws them: "1", "2"… */
const MAX_SEEDS = 400;

// ---- what a fixture says ----

/** What one action of the fixture's week leads to. */
type Outcome = {
  /** The week after it (the season's last one if it ended there). */
  readonly turn: number;
  readonly status: SeasonState["status"];
  readonly endReason?: SeasonState["endReason"];
  /** On a race week: her place in the goal race, and whether it met the goal. */
  readonly place?: number;
  readonly met?: boolean;
  /** A training: it trained, it failed, or the injury made the week a rest. */
  readonly training?: "ok" | "failed" | "injured";
  /** Parents who inspired her as the next week began (an inspiration week, ADR-0013). */
  readonly inspired?: number;
};

type Expect = {
  /** The week «Continuar» opens on (the last one, once the season ended). */
  readonly turn: number;
  readonly status: SeasonState["status"];
  readonly endReason?: SeasonState["endReason"];
  readonly difficulty: Difficulty;
  /** The goal race of this week, on a race week. */
  readonly goal?: { readonly courseId: string; readonly minPlace: number; readonly cup?: string };
  /** Injured: any action this week is a rest. */
  readonly injured: boolean;
  /** The goal races run so far. */
  readonly races: readonly { readonly turn: number; readonly place: number }[];
  /** What each action the e2e plays this week leads to, by its kind. */
  readonly next: Readonly<Record<string, Outcome>>;
  /** The scenes due at load: the menu (or the End) plays them at once. */
  readonly due: readonly string[];
};

type Fixture = {
  readonly save: SavedRun;
  readonly vista: string;
  readonly historia: readonly string[];
  readonly expect: Expect;
};

/** A file as read: the save goes through the browser's own parser, the rest is compared. */
const FixtureFile = z.strictObject({
  save: z.unknown(),
  vista: z.string(),
  historia: z.array(z.string()),
  expect: z.unknown(),
});

// ---- how each fixture is made ----

type WeekInput = Exclude<RunInput, { kind: "start" | "event:choose" }>;

type Recipe = {
  readonly falconessId: string;
  readonly difficulty: Difficulty;
  readonly parents?: readonly BlackBox[];
  /** The week's input on the way (the trainer's by default). */
  readonly play?: (ctx: SimContext, s: SeasonState) => RunInput;
  /** The fixture's state: the season stops here. */
  readonly until: (s: SeasonState) => boolean;
  /** The actions `expect.next` records. */
  readonly next: readonly WeekInput[];
  /** What a seed must give for this fixture. */
  readonly wants: (e: Expect) => boolean;
};

const TRAIN: Readonly<Record<StatName, TrainingKind>> = {
  agility: "train:agility",
  stamina: "train:stamina",
  technique: "train:technique",
  courage: "train:risk-flight",
  intelligence: "train:simulator",
};

/**
 * A simple trainer, playing what the phone's menu offers: the first option of an event; rest when
 * the training it wants could fail; else train the lowest of Agility, Stamina and Technique.
 */
function trainer(ctx: SimContext, s: SeasonState): RunInput {
  if (s.pendingEvent) return { kind: "event:choose", option: 0 };
  const pool: readonly StatName[] = ["agility", "stamina", "technique"];
  let low: StatName = "agility";
  for (const stat of pool) if (s.stats[stat] < s.stats[low]) low = stat;
  const kind = TRAIN[low];
  return trainingRisk(ctx.ruleset, s.fatigue, kind).failPm > 0 ? { kind: "rest" } : { kind };
}

/** A risk flight every week, until one injures her. */
function riskFlights(_ctx: SimContext, s: SeasonState): RunInput {
  return s.pendingEvent ? { kind: "event:choose", option: 0 } : { kind: "train:risk-flight" };
}

/** A 3★ black box of Peregrina's in one stat (ADR-0013), as the select screen offers boxes. */
function parent(id: string, stat: StatName): BlackBox {
  return {
    id,
    rulesetVersion: CURRENT_RULESET.version,
    falconessId: "peregrina",
    grade: "A",
    factors: {
      stat: { stat, stars: 3 },
      aptitude: { kind: "position", key: "closer", letter: "A", stars: 3 },
      skills: [],
      frameAffinity: "koryu",
    },
    seed: id,
    inputsHash: "0",
  };
}

const atWeek = (turn: number) => (s: SeasonState) => s.turn === turn;
const REST: WeekInput = { kind: "rest" };
const TECHNIQUE: WeekInput = { kind: "train:technique" };
const AGILITY: WeekInput = { kind: "train:agility" };

const RECIPES: Readonly<Record<string, Recipe>> = {
  /** Her first goal race's week (the Sprint): resting or a technique training both win it. */
  "peregrina-w10": {
    falconessId: "peregrina",
    difficulty: "normal",
    until: atWeek(10),
    next: [REST, TECHNIQUE],
    wants: (e) =>
      e.goal !== undefined &&
      e.next.rest?.place === 1 &&
      e.next["train:technique"]?.place === 1 &&
      e.next["train:technique"]?.training === "ok",
  },
  /** The same week where resting loses the race: the goal fails and the season ends. */
  "peregrina-w10-lose": {
    falconessId: "peregrina",
    difficulty: "normal",
    until: atWeek(10),
    next: [REST],
    wants: (e) => e.goal !== undefined && e.next.rest?.endReason === "goal-failed",
  },
  /** Week 39 with two 3★ parents: both inspire her as week 40 begins, whatever the action. */
  "peregrina-w39-insp": {
    falconessId: "peregrina",
    difficulty: "normal",
    parents: [parent("caja-agilidad", "agility"), parent("caja-tecnica", "technique")],
    until: atWeek(39),
    next: [REST],
    wants: (e) => e.goal === undefined && e.next.rest?.inspired === 2,
  },
  /** The finale's week (the Larga): its race ends the season. */
  "peregrina-w48": {
    falconessId: "peregrina",
    difficulty: "normal",
    until: atWeek(48),
    next: [REST],
    wants: (e) => e.goal !== undefined && e.next.rest?.endReason === "completed",
  },
  /** A completed season, with every goal race's result. */
  "peregrina-ended": {
    falconessId: "peregrina",
    difficulty: "normal",
    until: (s) => s.status === "ended",
    next: [],
    wants: (e) => e.endReason === "completed" && e.races.length === 5,
  },
  /** Normal's last week is no race week for Caracara: a training ends the season. */
  "caracara-w48": {
    falconessId: "caracara",
    difficulty: "normal",
    until: atWeek(48),
    next: [TECHNIQUE],
    wants: (e) => e.goal === undefined && e.next["train:technique"]?.endReason === "completed",
  },
  /** Exigente's cup (ADR-0012): the qualifier's week. */
  "cernicala-x-w44": {
    falconessId: "cernicala",
    difficulty: "exigente",
    until: atWeek(44),
    next: [REST],
    wants: (e) => e.goal?.cup === "qualifier",
  },
  /** An injured week's menu, before her first race: a training is a rest there. */
  injured: {
    falconessId: "caracara",
    difficulty: "normal",
    play: riskFlights,
    until: (s) => s.injuryTurns > 0,
    next: [AGILITY],
    wants: (e) =>
      e.injured &&
      e.goal === undefined &&
      e.races.length === 0 &&
      e.next["train:agility"]?.training === "injured",
  },
};

// ---- replaying a save ----

/** Every state of the run: after its start, then after each input. */
function walk(ctx: SimContext, save: SavedRun): SeasonState[] {
  const [first, ...rest] = save.inputs;
  if (first?.kind !== "start") throw new Error("the first input must be `start`");
  let s = startSeason(ctx, save.seed, first);
  const states = [s];
  for (const input of rest) {
    s = advanceSeason(ctx, s, input);
    states.push(s);
  }
  return states;
}

/**
 * The scenes of hers whose trigger held at some point of the run: what her player has seen by
 * now. Not the goal-before scene of the week the run stops on: the race mode plays it.
 */
function heldScenes(
  ctx: SimContext,
  scenes: readonly StoryScene[],
  states: readonly SeasonState[],
): string[] {
  const last = states.at(-1);
  const held: string[] = [];
  for (const s of states)
    for (const sc of scenes) {
      if (sc.falconess !== s.falconessId || held.includes(sc.id)) continue;
      if (s === last && sc.trigger.kind === "goal-before") continue;
      if (triggerHolds(ctx, s, sc.trigger)) held.push(sc.id);
    }
  return held;
}

/**
 * The scenes due when «Continuar» opens the run (its step already read): the menu's, or the End's
 * once the season ended, in the order they play (flow/scenes.ts).
 */
function dueAtLoad(
  ctx: SimContext,
  scenes: readonly StoryScene[],
  state: SeasonState,
  historia: readonly string[],
): string[] {
  const where = state.status === "ended" ? "end" : "menu";
  return dueScenes(ctx, scenes, state, where, new Set(historia)).map((sc) => sc.id);
}

function outcome(ctx: SimContext, before: SeasonState, input: WeekInput): Outcome {
  const after = advanceSeason(ctx, before, input);
  const entry = after.log.find((e) => e.turn === before.turn && e.input?.kind === input.kind);
  const race = after.raceResults.find((r) => r.turn === before.turn);
  const fresh = after.log.slice(before.log.length);
  const inspirations = fresh.find((e) => e.inspirations !== undefined)?.inspirations;
  return {
    turn: after.turn,
    status: after.status,
    ...(after.endReason === undefined ? {} : { endReason: after.endReason }),
    ...(race === undefined
      ? {}
      : {
          place: race.place,
          // read as the race's result card reads it
          met: goalStatuses(ctx, after).find((g) => g.goal.turn === race.turn)?.met !== false,
        }),
    ...(!input.kind.startsWith("train:")
      ? {}
      : {
          training: entry?.notes.includes("log.injured")
            ? "injured"
            : entry?.notes.includes("log.train.ok")
              ? "ok"
              : "failed",
        }),
    ...(inspirations === undefined
      ? {}
      : { inspired: inspirations.filter((r) => r.inspired).length }),
  };
}

/** The fixture of a save: the fingerprint, the scenes seen, the facts. */
function fixtureOf(
  ctx: SimContext,
  scenes: readonly StoryScene[],
  save: SavedRun,
  recipe: Recipe,
): Fixture {
  const states = walk(ctx, save);
  const state = states.at(-1);
  if (!state) throw new Error("no state");
  const goal = state.status === "active" ? goalForTurn(ctx, state) : undefined;
  const historia = heldScenes(ctx, scenes, states);
  const next: Record<string, Outcome> = {};
  if (state.status === "active")
    for (const input of recipe.next) next[input.kind] = outcome(ctx, state, input);
  return {
    save,
    vista: runFingerprint(save),
    historia,
    expect: {
      turn: state.turn,
      status: state.status,
      ...(state.endReason === undefined ? {} : { endReason: state.endReason }),
      difficulty: state.difficulty ?? "normal",
      ...(goal === undefined
        ? {}
        : {
            goal: {
              courseId: goal.courseId,
              minPlace: goal.minPlace,
              ...(goal.cup === undefined ? {} : { cup: goal.cup }),
            },
          }),
      injured: state.status === "active" && state.injuryTurns > 0,
      races: state.raceResults.map((r) => ({ turn: r.turn, place: r.place })),
      next,
      due: dueAtLoad(ctx, scenes, state, historia),
    },
  };
}

/** The save as the browser reads it back (field order and defaults of its parser). */
function asStored(save: SavedRun): SavedRun {
  const parsed = parseSavedRun(serializeRun(save), CURRENT_RULESET.version);
  if (!parsed.ok) throw new Error(`${parsed.error}: ${parsed.detail}`);
  return parsed.run;
}

/** The first seed whose season reaches the recipe's state and gives what it wants. */
function search(name: string, recipe: Recipe): Fixture {
  const version = CURRENT_RULESET.version;
  const ctx = testContext(version);
  const scenes = testScenes();
  const play = recipe.play ?? trainer;
  for (let i = 1; i <= MAX_SEEDS; i++) {
    const seed = String(i);
    const start: Extract<RunInput, { kind: "start" }> = {
      kind: "start",
      falconessId: recipe.falconessId,
      hangar: defaultHangar(ctx.content),
      parents: [...(recipe.parents ?? [])],
      difficulty: recipe.difficulty,
    };
    const inputs: RunInput[] = [start];
    let s = startSeason(ctx, seed, start);
    while (!recipe.until(s) && s.status === "active") {
      const input = play(ctx, s);
      s = advanceSeason(ctx, s, input);
      inputs.push(input);
    }
    if (!recipe.until(s)) continue;
    const save = asStored({ schemaVersion: 1, rulesetVersion: version, seed, inputs });
    const fixture = fixtureOf(ctx, scenes, save, recipe);
    if (recipe.wants(fixture.expect)) return fixture;
  }
  throw new Error(`${name}: no seed in 1..${MAX_SEEDS} gives what it wants`);
}

/** The file's text: one input per line, so a save reads (and diffs) week by week. */
function fixtureText(fixture: Fixture): string {
  const HOLE = '"@inputs"';
  const text = JSON.stringify(
    { ...fixture, save: { ...fixture.save, inputs: "@inputs" } },
    null,
    2,
  );
  const inputs = fixture.save.inputs.map((input) => `      ${JSON.stringify(input)}`).join(",\n");
  return `${text.replace(HOLE, `[\n${inputs}\n    ]`)}\n`;
}

function memoryStore(entries: Readonly<Record<string, string>>): KeyValueStore {
  const map = new Map(Object.entries(entries));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

function readFixture(name: string): { file: z.infer<typeof FixtureFile>; save: SavedRun } {
  const path = join(SAVES, `${name}.json`);
  if (!existsSync(path)) throw new Error(`${name}.json is missing. ${DRIFT}`);
  const file = FixtureFile.parse(JSON.parse(readFileSync(path, "utf8")));
  const parsed = parseSavedRun(JSON.stringify(file.save), CURRENT_RULESET.version);
  if (!parsed.ok) throw new Error(`${name}: the save does not load (${parsed.detail}). ${DRIFT}`);
  return { file, save: parsed.run };
}

/** A file's `expect`, read with the fields this test compares. */
function storedExpect(file: z.infer<typeof FixtureFile>): Pick<Expect, "turn" | "due"> {
  return z.object({ turn: z.number().int(), due: z.array(z.string()) }).parse(file.expect);
}

// ---- the tests ----

if (WRITE)
  it("writes every fixture (WRITE_SAVES=1)", { timeout: 300_000 }, () => {
    for (const [name, recipe] of Object.entries(RECIPES))
      writeFileSync(join(SAVES, `${name}.json`), fixtureText(search(name, recipe)));
    // `pnpm lint` formats e2e/saves like any JSON of the repo
    execFileSync("pnpm", ["exec", "biome", "format", "--write", "apps/web/e2e/saves"], {
      cwd: REPO,
      stdio: "inherit",
    });
  });

describe.each(Object.keys(RECIPES))("seeded save %s", (name) => {
  const recipe = RECIPES[name];

  it("replays to its expect, with the scenes seen and the fingerprint of the save", () => {
    if (!recipe) throw new Error(`no recipe for ${name}`);
    const { file, save } = readFixture(name);
    const fresh = fixtureOf(testContext(save.rulesetVersion), testScenes(), save, recipe);
    expect(save, `${name}: the save is not as the browser stores it. ${DRIFT}`).toEqual(file.save);
    expect(file, `${name}: ${DRIFT}`).toEqual({ ...fresh, save: file.save });
    expect(recipe.wants(fresh.expect), `${name} no longer gives what it wants. ${DRIFT}`).toBe(
      true,
    );
  });

  it("no scene is due at load except expect.due", () => {
    const { file, save } = readFixture(name);
    const ctx = testContext(save.rulesetVersion);
    const state = walk(ctx, save).at(-1);
    if (!state) throw new Error("no state");
    const due = dueAtLoad(ctx, testScenes(), state, file.historia);
    expect(due, `${name}: ${DRIFT}`).toEqual(storedExpect(file).due);
  });

  it("«Continuar» loads it at its week, with its last week already read", () => {
    const { file, save } = readFixture(name);
    const game = new GameController(
      (version) => testContext(version).content,
      memoryStore({ [RUN_KEY]: serializeRun(save), [SEEN_KEY]: file.vista }),
    );
    expect(game.continueSaved()).toBe(true);
    const snap = game.getSnapshot();
    expect(snap.error).toBeUndefined();
    expect(snap.lastStepSeen).toBe(true);
    expect(snap.run?.state.turn).toBe(storedExpect(file).turn);
  });
});

it("every file in e2e/saves has its recipe", () => {
  const files = readdirSync(SAVES)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -".json".length));
  expect(files.sort()).toEqual(Object.keys(RECIPES).sort());
});
