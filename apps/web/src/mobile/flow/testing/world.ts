/**
 * The phone's game without React, for the season walks (plan §3.4): a real `GameController` on a
 * memory store, the week, scene and card stores, the UI state (`reduceUi`) and the commands of
 * `flowCommands` on ports that read `deriveFlow(factsOf(...))`, as the run's view will wire them.
 * Every command goes through a recorder that writes what happened to `trace`: each flow after a
 * command (a "render"), each beat a command ended, each act, decision, acknowledgement, reload and
 * black box. `reload()` is the browser's: a new controller continues the saved run, new stores read
 * the same storage and the UI state starts again.
 */
import { loadSeasonContent } from "@falconess/content";
import type { BlackBox, Difficulty, RunInput, StoryScene } from "@falconess/schema";
import type { SimContext } from "@falconess/sim";
import { GameController, type GameSnapshot, type Step } from "../../../game/controller";
import { runFingerprint } from "../../../game/run";
import { defaultHangar } from "../../../screens/model/new-season";
import type { Pace } from "../../pace";
import { createStoryStore } from "../../storyModel";
import { beatsOf } from "../beats";
import { boxToKeep } from "../box";
import { type Commands, type FlowPorts, flowCommands } from "../commands";
import { WeekStore } from "../decidedWeek";
import { deriveFlow } from "../derive";
import { factsOf } from "../facts";
import { InspirationStore } from "../inspirations";
import type { Beat, DecidedWeek, Flow, FlowFacts, InstantBeat, WeekRecord } from "../types";
import { INITIAL_UI, reduceUi, type UiEvent, type UiState } from "../ui";
import { testScenes } from "./content";
import { saveSeed } from "./game";
import { memoryStore } from "./memory";

/** Where in the walk an event happened: which season (a new run), which mount (a reload), which move. */
export type At = { readonly season: number; readonly mount: number; readonly move: number };

/** How a beat was ended. */
export type Via = "complete" | "sceneDone" | "resolve" | "raceNext" | "raceSkip" | "run";

/** What the store held when the page reloaded. */
export type BeforeReload = {
  readonly fp: string;
  readonly record: WeekRecord | undefined;
  readonly stepSeen: boolean;
  readonly step: Step | undefined;
  readonly seenInRun: ReadonlySet<string>;
  readonly cardsShown: ReadonlySet<string>;
  readonly flow: Flow;
  readonly beats: readonly Beat[];
};

export type TraceEvent =
  | {
      readonly type: "season";
      readonly at: At;
      readonly seed: string;
      readonly falconessId: string;
    }
  /** A render: the flow after a command, the facts and UI state it came from, its beat queue. */
  | {
      readonly type: "frame";
      readonly at: At;
      readonly flow: Flow;
      readonly facts: FlowFacts;
      readonly ui: UiState;
      readonly beats: readonly Beat[];
      /** A second derive over facts read again and the same UI state kept `top`, `screen`, `layer`. */
      readonly stable: boolean;
    }
  /** A beat the command ended: the top it found. */
  | {
      readonly type: "done";
      readonly at: At;
      readonly beat: Beat;
      readonly via: Via;
      readonly flow: Flow;
    }
  | {
      readonly type: "act";
      readonly at: At;
      readonly step: Step;
      /** The run's fingerprint before and after. */
      readonly fpBefore: string;
      readonly fp: string;
      readonly via: "choose" | "run" | "event";
      /** «Correr»: the decided week it ran. */
      readonly week: DecidedWeek | undefined;
    }
  | { readonly type: "decide"; readonly at: At; readonly week: DecidedWeek }
  /** An acknowledgement that read a step (the controller's `lastStepSeen` went true). */
  | { readonly type: "ack"; readonly at: At; readonly fp: string }
  | { readonly type: "reload"; readonly at: At; readonly before: BeforeReload }
  /** The run's view kept the season's black box (`useSeasonBox`). */
  | { readonly type: "box"; readonly at: At; readonly fp: string }
  /** A watch's stage moved by «Saltar» or the natural end (or did not). */
  | {
      readonly type: "watchMove";
      readonly at: At;
      readonly n: number;
      readonly from: string;
      readonly to: string;
    }
  /** A command the UI must ignore here, tried on purpose: `changed` must stay false. */
  | { readonly type: "probe"; readonly at: At; readonly name: string; readonly changed: boolean };

export type WorldOptions = {
  readonly pace?: Pace;
  readonly reduced?: boolean;
  readonly scenes?: readonly StoryScene[];
};

export type StartOptions = {
  readonly difficulty?: Difficulty;
  readonly parents?: readonly BlackBox[];
  /** An older ruleset (v2: the luck events): the season is loaded as a save of its start. */
  readonly rulesetVersion?: string;
};

/** The flow and what it was derived from. */
export type Now = { readonly flow: Flow; readonly facts: FlowFacts; readonly ui: UiState };

export type World = {
  readonly pace: Pace;
  readonly reduced: boolean;
  readonly trace: TraceEvent[];
  /** The commands, recorded. */
  readonly cmd: Commands;
  ui(): UiState;
  ctx(): SimContext;
  now(): Now;
  beats(): readonly Beat[];
  /** What changes when anything the flow reads changes. */
  signature(): readonly unknown[];
  /** «Nueva temporada» → a new season (the run's view remounts). */
  start(falconessId: string, seed: string, o?: StartOptions): void;
  /** A seeded save of the phone e2e (`e2e/saves/<name>.json`), opened with «Continuar». */
  load(name: string, historia?: readonly string[]): void;
  /** The event dialog's answer (it acts by itself). */
  answer(option: number): void;
  /** The error notice's close button. */
  dismiss(): void;
  reload(): void;
  /** The bot's move counter (for `At`). */
  move(): void;
  /** Try a command the flow must ignore; records whether it changed anything. */
  probe(name: string, fn: (cmd: Commands) => void): void;
};

export function createWorld(o: WorldOptions = {}): World {
  const pace = o.pace ?? "normal";
  const reduced = o.reduced ?? false;
  const scenes = o.scenes ?? testScenes();
  const kv = memoryStore();
  const trace: TraceEvent[] = [];
  let game = new GameController(loadSeasonContent, kv);
  let weeks = new WeekStore(kv);
  let story = createStoryStore(kv);
  let cards = new InspirationStore(kv);
  let ui: UiState = INITIAL_UI;
  let last: Flow | undefined;
  let season = 0;
  let mount = 0;
  let moves = 0;
  let boxed = new Set<string>();
  const at = (): At => ({ season, mount, move: moves });

  const snapshot = (): GameSnapshot => game.getSnapshot();
  const factsNow = (): FlowFacts => {
    const snap = snapshot();
    if (!snap.run) throw new Error("no run in play");
    return factsOf(game.context(), {
      snap: { run: snap.run, lastStep: snap.lastStep, lastStepSeen: snap.lastStepSeen },
      week: weeks.getSnapshot(),
      story,
      cards,
      scenes,
      pace,
      reduced,
      sheetOpen: false,
    });
  };
  const now = (): Now => {
    const facts = factsNow();
    const flow = deriveFlow(game.context(), facts, ui, last);
    last = flow;
    return { flow, facts, ui };
  };
  const dispatch = (e: UiEvent): void => {
    ui = reduceUi(ui, e);
  };
  const fpOf = (): string => {
    const run = snapshot().run;
    if (!run) throw new Error("no run in play");
    return runFingerprint(run);
  };

  /** Who is acting: a week's action, «Correr» (with its decided week) or the event dialog. */
  let via: { kind: "choose" | "run" | "event"; week?: DecidedWeek } = { kind: "choose" };
  /** The controller as the commands reach it: its acts and its acknowledgements are recorded. */
  const gamePort: FlowPorts["game"] = {
    act: (input: RunInput, expect?: number): boolean => {
      const fpBefore = fpOf();
      const ok = game.act(input, expect);
      const step = snapshot().lastStep;
      if (ok && step)
        trace.push({
          type: "act",
          at: at(),
          step,
          fpBefore,
          fp: fpOf(),
          via: via.kind,
          week: via.week,
        });
      return ok;
    },
    acknowledgeStep: (): void => {
      const before = snapshot().lastStepSeen;
      game.acknowledgeStep();
      if (!before && snapshot().lastStepSeen) trace.push({ type: "ack", at: at(), fp: fpOf() });
    },
    getSnapshot: snapshot,
  };

  const build = (): Commands =>
    flowCommands({
      ctx: game.context(),
      game: gamePort,
      weeks: {
        plan: (...a) => weeks.plan(...a),
        decide: (w) => {
          weeks.decide(w);
          trace.push({ type: "decide", at: at(), week: w });
        },
        setPosition: (...a) => weeks.setPosition(...a),
        enterRace: (fp) => weeks.enterRace(fp),
        markRaced: (fp) => weeks.markRaced(fp),
        markRaceSeen: (fp) => weeks.markRaceSeen(fp),
      },
      story: { markSeen: (seed, id) => story.markSeen(seed, id) },
      cards: { markShown: (seed, key) => cards.markShown(seed, key) },
      sound: { cue: () => {}, nav: () => {} },
      dispatch,
      now,
    });
  let commands = build();

  const signature = (): readonly unknown[] => [
    ui,
    snapshot(),
    weeks.getSnapshot(),
    story.version(),
    cards.version(),
  ];
  const changedSince = (before: readonly unknown[]): boolean => {
    const after = signature();
    return after.some((v, i) => v !== before[i]);
  };

  /** What the run's view does after any change: derive, keep the box, show it. */
  const render = (): void => {
    if (!snapshot().run) return;
    const { flow, facts } = now();
    const ctx = game.context();
    const run = facts.run.run;
    if (!boxed.has(facts.run.fp) && boxToKeep(ctx, run)) {
      boxed.add(facts.run.fp);
      trace.push({ type: "box", at: at(), fp: facts.run.fp });
    }
    const again = deriveFlow(ctx, factsNow(), ui, flow);
    trace.push({
      type: "frame",
      at: at(),
      flow,
      facts,
      ui,
      beats: beatsOf(ctx, facts, ui),
      stable: again.top === flow.top && again.screen === flow.screen && again.layer === flow.layer,
    });
  };

  /** How the command being recorded ends a beat. */
  let lastVia: Via = "complete";
  /** A command, recorded: the beat it ended (the top's key now done, or «Correr» acted). */
  const recorded = (fn: () => void): void => {
    const before = now();
    const acts = trace.length;
    fn();
    const top = before.flow.top;
    const ran = trace.slice(acts).some((e) => e.type === "act" && e.via === "run");
    if (top.kind === "position" ? ran : !before.ui.done.has(top.key) && ui.done.has(top.key)) {
      trace.push({ type: "done", at: at(), beat: top, via: lastVia, flow: before.flow });
    }
    const nav = before.ui.nav;
    if (nav.at === "watch" && (lastVia === "raceNext" || lastVia === "raceSkip")) {
      const after = ui.nav;
      trace.push({
        type: "watchMove",
        at: at(),
        n: nav.n,
        from: nav.stage,
        to: after.at === "watch" && after.n === nav.n ? after.stage : after.at,
      });
    }
    render();
  };
  const using = (v: Via, fn: () => void): void => {
    lastVia = v;
    recorded(fn);
  };

  const cmd: Commands = {
    open: (to) => using("complete", () => commands.open(to)),
    selectTraining: (kind) => using("complete", () => commands.selectTraining(kind)),
    workshopTab: (tab) => using("complete", () => commands.workshopTab(tab)),
    choose: (input) => {
      via = { kind: "choose" };
      using("complete", () => commands.choose(input));
    },
    position: (p) => using("complete", () => commands.position(p)),
    run: () => {
      const top = now().flow.top;
      via = { kind: "run", ...(top.kind === "position" ? { week: top.week } : {}) };
      using("run", () => commands.run());
      via = { kind: "choose" };
    },
    complete: (key) => using("complete", () => commands.complete(key)),
    covered: (key) => using("complete", () => commands.covered(key)),
    raceSkip: (play) => using("raceSkip", () => commands.raceSkip(play)),
    raceNext: (play) => using("raceNext", () => commands.raceNext(play)),
    raceAgain: () => using("complete", () => commands.raceAgain()),
    rewatch: (turn) => using("complete", () => commands.rewatch(turn)),
    raceContinue: () => using("complete", () => commands.raceContinue()),
    sceneDone: (key, skipped) => using("sceneDone", () => commands.sceneDone(key, skipped)),
    watchScene: (scene) => using("complete", () => commands.watchScene(scene)),
    resolve: (b: InstantBeat) => using("resolve", () => commands.resolve(b)),
  };

  /** A new mount of the run's view: its stores read the storage again, the UI state anew. */
  const remount = (): void => {
    mount += 1;
    weeks = new WeekStore(kv);
    story = createStoryStore(kv);
    cards = new InspirationStore(kv);
    ui = INITIAL_UI;
    last = undefined;
    boxed = new Set();
    commands = build();
  };

  const world: World = {
    pace,
    reduced,
    trace,
    cmd,
    ui: () => ui,
    ctx: () => game.context(),
    now,
    beats: () => beatsOf(game.context(), factsNow(), ui),
    signature,
    start(falconessId, seed, so = {}) {
      game.newSeason();
      const ctx = game.newRunContext();
      const hangar = defaultHangar(ctx.content);
      const started =
        so.rulesetVersion === undefined
          ? game.start(falconessId, hangar, seed, so.difficulty, so.parents)
          : game.loadText(
              JSON.stringify({
                schemaVersion: 1,
                rulesetVersion: so.rulesetVersion,
                seed,
                inputs: [{ kind: "start", falconessId, hangar, parents: so.parents ?? [] }],
              }),
            );
      if (!started) throw new Error(`the season of ${falconessId} (${seed}) did not start`);
      season += 1;
      // a new run's view (keyed per run)
      remount();
      trace.push({ type: "season", at: at(), seed, falconessId });
      render();
    },
    load(name, historia) {
      for (const [k, v] of Object.entries(saveSeed(name, historia))) kv.setItem(k, v);
      game = new GameController(loadSeasonContent, kv);
      if (!game.continueSaved()) throw new Error(`the seeded save ${name} did not load`);
      season += 1;
      remount();
      const run = snapshot().run;
      if (run)
        trace.push({
          type: "season",
          at: at(),
          seed: run.seed,
          falconessId: run.state.falconessId,
        });
      render();
    },
    answer(option) {
      via = { kind: "event" };
      gamePort.act({ kind: "event:choose", option });
      via = { kind: "choose" };
      render();
    },
    dismiss() {
      dispatch({ type: "notice", notice: undefined });
      render();
    },
    reload() {
      const snap = snapshot();
      const { flow, facts } = now();
      const seed = facts.run.run.seed;
      const before: BeforeReload = {
        fp: facts.run.fp,
        record: weeks.getSnapshot(),
        stepSeen: snap.lastStepSeen,
        step: snap.lastStep,
        seenInRun: story.seenInRun(seed),
        cardsShown: cards.shown(seed),
        flow,
        beats: beatsOf(game.context(), facts, ui),
      };
      game = new GameController(loadSeasonContent, kv);
      if (!game.continueSaved()) throw new Error("the saved run did not continue");
      remount();
      trace.push({ type: "reload", at: at(), before });
      render();
    },
    move() {
      moves += 1;
    },
    probe(name, fn) {
      const before = signature();
      fn(commands);
      trace.push({ type: "probe", at: at(), name, changed: changedSince(before) });
      render();
    },
  };
  return world;
}
