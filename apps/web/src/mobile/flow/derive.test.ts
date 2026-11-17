import type { RunInput } from "@falconess/schema";
import { advanceSeason } from "@falconess/sim";
import { describe, expect, it } from "vitest";
import type { ActiveRun, Step } from "../../game/controller";
import { paceScale } from "../pace";
import { deriveFlow, screenKey, watchKey } from "./derive";
import { factsOf } from "./facts";
import { DIGEST } from "./scenes";
import { testScenes } from "./testing/content";
import {
  commit,
  decide,
  factsFor,
  fpOf,
  loadSave,
  race,
  runOf,
  stateOf,
  type TestGame,
  testGame,
  uiAfter,
} from "./testing/game";
import { resultTimeline } from "./trainResult";
import type { Flow, FlowFacts } from "./types";
import { INITIAL_UI, reduceUi, type UiState } from "./ui";
import { raceWings } from "./week";

/**
 * What is on screen for each first beat (plan §1.6), on real games: the screen, the mode, the
 * layer, the HUD's sources, the wide screen's panel, and when a notice, a replayed scene or a
 * week's action may come.
 */

const HANGAR = ["shiden", "mule", "nimbus", "falke"];

type Page = Parameters<typeof factsFor>[1];

const flowOf = (t: TestGame, ui: UiState, page: Page = {}, prev?: Flow): Flow =>
  deriveFlow(t.game.context(), factsFor(t, page), ui, prev);

const started = (seed = "s1"): TestGame => {
  const t = testGame();
  t.game.start("peregrina", HANGAR, seed);
  t.story.markSeen(seed, "peregrina-prologue");
  return t;
};

/**
 * The facts of `t`'s stores over another run in play: a save's run with her injured, which no seeded
 * save reaches on a race week or on the season's last week (its inputs, so its fp and its week's
 * record, stay the save's).
 */
const factsOver = (t: TestGame, run: ActiveRun, unread?: Step): FlowFacts =>
  factsOf(t.game.context(), {
    snap: unread
      ? { run, lastStep: unread, lastStepSeen: false }
      : { run, lastStep: t.game.getSnapshot().lastStep, lastStepSeen: true },
    week: t.weeks.getSnapshot(),
    story: t.story,
    cards: t.cards,
    scenes: testScenes(),
    pace: "normal",
    reduced: false,
    sheetOpen: false,
  });

const hurtRun = (t: TestGame): ActiveRun => {
  const run = runOf(t);
  return { ...run, state: { ...run.state, injuryTurns: 1 } };
};

/** `peregrina-w10`, raced after a rest (she wins: `peregrina-debut-win` comes after the race). */
const raced = (save = "peregrina-w10"): { t: TestGame; mine: UiState } => {
  const t = loadSave(save);
  decide(t, { kind: "rest" });
  return { t, mine: race(t, { kind: "rest" }) };
};

describe("a training's result", () => {
  it("the training screen with the week she trained in: its HUD, its button, the vigor at its «±N» (critic b1, L3)", () => {
    const t = started();
    const before = stateOf(t);
    const mine = commit(t, { kind: "train:agility" });
    const flow = flowOf(t, mine);
    expect(flow.top.kind).toBe("train-result");
    if (flow.top.kind !== "train-result" || flow.screen.kind !== "train") throw new Error("train");
    expect(flow.screen.result).toBe(flow.top);
    expect(flow.screen.finished).toBe(false);
    expect(flow.screen.selected).toBe("train:agility");
    expect([flow.mode, flow.screenKey, flow.layer, flow.music]).toEqual([
      "training",
      "train",
      undefined,
      "menu",
    ]);
    expect(flow.desk.locked).toBe(true);
    expect(flow.toast).toBe(false);
    const result = flow.top.result;
    const delay = resultTimeline(result, paceScale("normal")).vigor ?? 0;
    expect(flow.hud?.pop).toEqual(result.vigor === 0 ? undefined : { delta: result.vigor, delay });
    expect(flow.hud?.of).toBe(before);
    expect(flow.hud?.vigor).toBe(before);
    expect(flow.hud?.vigorTo).toBe(stateOf(t));
    expect(flow.hud?.vigorAt).toBe(delay);
  });

  it("on a race week the HUD reads the week being decided, not the last step's `before` (review 1 item 4)", () => {
    const t = loadSave("peregrina-w10");
    const mine = decide(t, { kind: "train:technique" }, "train");
    const lastBefore = t.game.getSnapshot().lastStep?.before;
    expect(lastBefore?.turn).toBe(9);
    const flow = flowOf(t, mine);
    expect(flow.top.kind).toBe("train-result");
    expect(flow.hud?.of).toBe(stateOf(t));
    expect(flow.hud?.of.turn).toBe(10);
    expect(flow.hud?.of.mood).toBe(stateOf(t).mood);
    expect(flow.hud?.vigorTo).toBe(factsFor(t).preview?.after);
  });
});

describe("the week's effects", () => {
  it("over the inert menu; the HUD shows the week just played until they lift (O3), the vigor where it landed", () => {
    const t = started();
    const before = stateOf(t);
    const mine = commit(t, { kind: "rest" });
    const flow = flowOf(t, mine);
    expect(flow.screen).toEqual({ kind: "menu", inert: true });
    expect(flow.layer?.kind).toBe("fx");
    expect([flow.mode, flow.desk.locked, flow.toast]).toEqual(["menu", true, false]);
    // a rest: nothing landed before, so the bar moves when the effects lift
    expect(flow.hud?.of).toBe(before);
    expect(flow.hud?.vigor).toBe(before);
    // the race's part: its vigor showed before «Correr» (landed)
    const r = raced();
    const step = r.t.game.getSnapshot().lastStep;
    const done = reduceUi(r.mine, {
      type: "done",
      keys: ["race:replay", "race:finish", "race:result"].map((k) => `${fpOf(r.t)}/${k}`),
    });
    r.t.story.markSeen("1", "peregrina-debut-win");
    const raceFx = flowOf(r.t, done);
    expect(raceFx.top.kind === "fx" && raceFx.top.part).toBe("race");
    expect(raceFx.hud?.of).toBe(step?.before);
    expect(raceFx.hud?.vigor).toBe(step?.after);
  });

  it("a race week's action's effects: over the menu, the action's vigor once it landed (no cost stripes)", () => {
    const t = loadSave("peregrina-w10");
    const mine = decide(t, { kind: "rest" });
    const flow = flowOf(t, mine);
    expect(flow.top.kind === "fx" && flow.top.part).toBe("action");
    expect(flow.top.kind === "fx" && flow.top.landed).toBe(false);
    expect(flow.screen).toEqual({ kind: "menu", inert: true });
    expect(flow.mode).toBe("menu");
    expect(flow.hud?.of).toBe(stateOf(t));
    expect(flow.hud?.vigor).toBe(stateOf(t));
    expect(flow.hud?.preview).toBeUndefined();
    // a training that hurt her: its result, then the injury; the vigor already landed (review 2 M-C)
    const hurt = testGame();
    hurt.game.start("peregrina", HANGAR, "inj-3");
    while (stateOf(hurt).turn < 10) hurt.game.act({ kind: "train:risk-flight" });
    const fp = fpOf(hurt);
    const played = reduceUi(decide(hurt, { kind: "train:risk-flight" }, "train"), {
      type: "done",
      keys: [`${fp}/w:result`],
    });
    const preview = factsFor(hurt).preview;
    const injury = flowOf(hurt, played);
    expect(injury.top).toMatchObject({ kind: "fx", part: "action", landed: true });
    expect(injury.top.kind === "fx" && injury.top.fx.map((x) => x.kind)).toEqual(["injury"]);
    expect(injury.hud?.vigor).toBe(preview?.after);
  });

  it("over the end once the season ended (O5, F3): the end inert under them, no HUD, the lone column", () => {
    const t = loadSave("peregrina-w48");
    decide(t, { kind: "rest" });
    const mine = race(t, { kind: "rest" });
    const fp = fpOf(t);
    t.story.markSeen("1", "peregrina-long-lost");
    const done = reduceUi(mine, {
      type: "done",
      keys: ["race:replay", "race:finish", "race:result"].map((k) => `${fp}/${k}`),
    });
    const flow = flowOf(t, done);
    expect(flow.top.kind).toBe("fx");
    expect(flow.layer?.kind).toBe("fx");
    expect(flow.screen).toEqual({ kind: "end", inert: true });
    expect([flow.mode, flow.hud, flow.solo, flow.desk.locked]).toEqual([
      "end",
      undefined,
      true,
      true,
    ]);
    expect([flow.canAct, flow.canReplay]).toEqual([false, false]);
    // a tap on them reads the week: the end, awake
    t.game.acknowledgeStep();
    const read = flowOf(t, done);
    expect(read.top.kind).toBe("idle");
    expect(read.screen).toEqual({ kind: "end", inert: false });
    expect([read.layer, read.desk.locked, read.solo]).toEqual([undefined, false, true]);
  });
});

describe("the event, the card and the scenes over the menu", () => {
  it("a v2 event: the menu inert under its dialog (review 1 item 18)", () => {
    const t = testGame();
    const start = { kind: "start", falconessId: "caracara", hangar: HANGAR, parents: [] };
    const rest = { kind: "rest" };
    t.game.loadText(
      JSON.stringify({
        schemaVersion: 1,
        rulesetVersion: "v2",
        seed: "1",
        inputs: [start, rest, rest, rest],
      }),
    );
    t.game.acknowledgeStep();
    const flow = flowOf(t, INITIAL_UI);
    expect(flow.layer).toEqual({ kind: "event", key: "event:caracara-scrap-run/3" });
    expect(flow.screen).toEqual({ kind: "menu", inert: true });
    expect([flow.mode, flow.desk.locked, flow.canAct]).toEqual(["menu", true, false]);
    expect(flow.hud?.of).toBe(stateOf(t));
  });

  it("the inheritance card and a week's scene: the menu inert, the HUD on the run", () => {
    const t = loadSave("peregrina-w39-insp");
    const mine = commit(t, { kind: "rest" });
    t.game.acknowledgeStep();
    const flow = flowOf(t, mine);
    expect(flow.layer?.kind).toBe("inspiration");
    expect(flow.screen).toEqual({ kind: "menu", inert: true });
    expect(flow.hud?.of).toBe(stateOf(t));
    t.cards.markShown("1", "1:40");
    const scene = flowOf(t, mine, { pace: "fast" });
    expect(scene.layer).toMatchObject({ kind: "scene", replay: false, digest: DIGEST.fast });
    expect(scene.layer?.kind === "scene" && scene.layer.scene.id).toBe("peregrina-first-vos");
    expect([scene.mode, scene.screen.kind, scene.music]).toEqual(["menu", "menu", "menu"]);
  });

  it("an instant beat shows the next beat's screen: a passed prologue, the menu at once", () => {
    const t = testGame();
    t.story.markSeen("earlier", "peregrina-prologue");
    t.game.start("peregrina", HANGAR, "s9");
    const flow = flowOf(t, INITIAL_UI);
    expect(flow.top.kind).toBe("pass");
    expect(flow.screen).toEqual({ kind: "menu", inert: false });
    expect([flow.layer, flow.canAct, flow.canReplay]).toEqual([undefined, false, false]);
  });
});

describe("the race mode", () => {
  it("the emblem rises over where the week was decided: the action's effects' menu, its result, or the screen it was picked on", () => {
    const fxWeek = loadSave("peregrina-w10");
    const afterFx = reduceUi(decide(fxWeek, { kind: "rest" }), {
      type: "done",
      keys: [`${fpOf(fxWeek)}/w:fx`],
    });
    const trained = loadSave("peregrina-w10");
    const afterResult = reduceUi(decide(trained, { kind: "train:technique" }, "train"), {
      type: "done",
      keys: [`${fpOf(trained)}/w:result`],
    });
    const swap = loadSave("peregrina-w10");
    const workshop = reduceUi(uiAfter({ type: "open", to: "workshop" }), {
      type: "decided",
      fp: fpOf(swap),
      from: "workshop",
    });
    swap.weeks.decide({
      fp: fpOf(swap),
      turn: 10,
      inputs: runOf(swap).inputs.length,
      input: { kind: "workshop", ops: [{ op: "equip-frame", frameId: "mule" }] },
      position: undefined,
      stage: "action",
    });
    const a = flowOf(fxWeek, afterFx);
    expect(a.top).toMatchObject({ kind: "emblem", covered: false, fadeIn: true });
    expect(a.screen).toEqual({ kind: "menu", inert: true });
    expect([a.mode, a.music, a.desk.locked]).toEqual(["race", "race", true]);
    const b = flowOf(trained, afterResult);
    expect(b.screen).toMatchObject({ kind: "train", finished: true });
    expect(b.screen.kind === "train" && b.screen.result?.key).toBe(`${fpOf(trained)}/w:result`);
    expect(flowOf(swap, workshop).screen).toEqual({ kind: "workshop", tab: "wings" });
  });

  it("an injured race week's training: no result, the recovery over the menu, the emblem rises over that menu (F4, O2)", () => {
    const t = loadSave("peregrina-w10");
    const run = hurtRun(t);
    const fp = fpOf(t);
    const mine = decide(t, { kind: "train:agility" }, "train");
    const facts = factsOver(t, run);
    expect(facts.record?.phase).toBe("decided");
    const afterFx = reduceUi(mine, { type: "done", keys: [`${fp}/w:fx`] });
    const flow = deriveFlow(t.game.context(), facts, mine);
    expect(flow.top).toMatchObject({ kind: "fx", part: "action", landed: false });
    expect(flow.top.kind === "fx" && flow.top.fx.map((x) => x.kind)).toEqual(["recovery"]);
    expect(flow.screen).toEqual({ kind: "menu", inert: true });
    // she rested by rule: the bar moves when the recovery lifts, with no cost stripes
    expect([flow.hud?.of, flow.hud?.vigor, flow.hud?.preview]).toEqual([
      run.state,
      run.state,
      undefined,
    ]);
    // the emblem rises over that menu: never the picker the training was chosen on
    const emblem = deriveFlow(t.game.context(), facts, afterFx);
    expect(emblem.top).toMatchObject({ kind: "emblem", covered: false });
    expect(emblem.screen).toEqual({ kind: "menu", inert: true });
    expect(emblem.hud?.vigor).toBe(facts.preview?.after);
  });

  it("covered: black only when a scene comes next (the HUD kept under it), else the inert card", () => {
    const t = loadSave("peregrina-w10");
    const fp = fpOf(t);
    const covered = reduceUi(decide(t, { kind: "rest" }), {
      type: "done",
      keys: [`${fp}/w:fx`, `${fp}/w:emblem:in`],
    });
    const flow = flowOf(t, covered);
    expect(flow.top).toMatchObject({ kind: "emblem", covered: true });
    expect(flow.screen).toEqual({ kind: "black" });
    expect(flow.screenKey).toBe("black");
    expect(flow.hud).toBeDefined();
    expect([flow.toast, flow.wide]).toEqual([false, false]);
    // the scene seen in another season: passed by (instant), so the card, never black
    t.story.markSeen("other", "peregrina-debut");
    const passed = flowOf(t, covered);
    expect(passed.screen).toMatchObject({ kind: "position", inert: true });
  });

  it("the scene before the race over the inert card; then the card, no way back; the HUD has the action's vigor", () => {
    const t = loadSave("peregrina-w10");
    const fp = fpOf(t);
    const mine = reduceUi(decide(t, { kind: "rest" }), {
      type: "done",
      keys: [`${fp}/w:fx`, `${fp}/w:emblem:in`, `${fp}/w:emblem`],
    });
    const preview = factsFor(t).preview;
    const flow = flowOf(t, mine);
    expect(flow.top).toMatchObject({ kind: "scene", where: "prerace" });
    expect(flow.screen).toMatchObject({ kind: "position", inert: true });
    expect([flow.mode, flow.music]).toEqual(["race", "race"]);
    expect(flow.hud?.vigor).toBe(preview?.after);
    t.story.markSeen("1", "peregrina-debut");
    const card = flowOf(t, mine);
    expect(card.screen).toEqual({
      kind: "position",
      week: t.weeks.getSnapshot(),
      wings: raceWings(t.game.context(), stateOf(t)),
      inert: false,
    });
    expect(card.screenKey).toBe("position");
    expect(card.hud?.preview).toBeUndefined();
    expect([card.canAct, card.canReplay, card.toast, card.desk.locked]).toEqual([
      false,
      true,
      true,
      true,
    ]);
  });

  it("the replay and the finish: the race screen, wide, no HUD; the panel shows the week before (no spoiler)", () => {
    const { t, mine } = raced();
    const step = t.game.getSnapshot().lastStep;
    const flow = flowOf(t, mine);
    expect(flow.screen).toEqual({
      kind: "race",
      turn: 10,
      stage: "replay",
      play: `${fpOf(t)}/race:replay`,
      watch: undefined,
    });
    expect([flow.screenKey, flow.hud, flow.wide, flow.toast, flow.solo]).toEqual([
      "race:10",
      undefined,
      true,
      false,
      false,
    ]);
    expect(flow.desk).toEqual({ locked: true, of: step?.before, hideLast: true });
    const finish = reduceUi(mine, { type: "done", keys: [`${fpOf(t)}/race:replay`] });
    const held = flowOf(t, finish);
    expect(held.screen).toMatchObject({ stage: "finish", play: `${fpOf(t)}/race:finish` });
    expect(held.screenKey).toBe("race:10");
  });

  it("a scene after the race: the race held (an empty body), the panel still the week before", () => {
    const { t, mine } = raced();
    const done = reduceUi(mine, {
      type: "done",
      keys: [`${fpOf(t)}/race:replay`, `${fpOf(t)}/race:finish`],
    });
    const flow = flowOf(t, done);
    expect(flow.layer?.kind === "scene" && flow.layer.scene.id).toBe("peregrina-debut-win");
    expect(flow.screen).toMatchObject({ kind: "race", turn: 10, stage: "held" });
    expect(flow.screenKey).toBe("race:10");
    expect([flow.mode, flow.hud, flow.desk.hideLast]).toEqual(["race", undefined, true]);
    expect(flow.desk.of).toBe(t.game.getSnapshot().lastStep?.before);
  });

  it("the result: the race screen at its result, the panel on the run; «Ver otra vez» replays it there, never reaching idle", () => {
    const { t, mine } = raced();
    const fp = fpOf(t);
    t.story.markSeen("1", "peregrina-debut-win");
    const result = reduceUi(mine, {
      type: "done",
      keys: [`${fp}/race:replay`, `${fp}/race:finish`],
    });
    const flow = flowOf(t, result);
    expect(flow.screen).toEqual({
      kind: "race",
      turn: 10,
      stage: "result",
      play: `${fp}/race:result`,
      watch: undefined,
    });
    expect(flow.desk).toEqual({ locked: true, of: stateOf(t), hideLast: false });
    expect([flow.canReplay, flow.toast]).toEqual([true, true]);
    const watching = reduceUi(result, { type: "watch", turn: 10, from: "result" });
    const nav = watching.nav;
    if (nav.at !== "watch") throw new Error("watch");
    const w = flowOf(t, watching);
    expect(w.top.kind).toBe("race-result");
    expect(w.screen).toEqual({
      kind: "race",
      turn: 10,
      stage: "replay",
      play: watchKey(nav),
      watch: "result",
    });
    expect([w.screenKey, w.canReplay, w.toast]).toEqual(["race:10", false, false]);
    // «Continuar» on the watch's result ends the race's result and the watch together
    const after = reduceUi(watching, { type: "done", keys: [`${fp}/race:result`] });
    expect(after.nav).toEqual({ at: "menu" });
    const back = flowOf(t, after);
    expect(back.top.kind).toBe("fx");
    expect(back.screen).toEqual({ kind: "menu", inert: true });
  });
});

describe("idle", () => {
  it("the screen the player went to: menu, training (its mode), workshop; the cost stripes of the pick", () => {
    const t = started();
    const menu = flowOf(t, INITIAL_UI);
    expect([menu.screen, menu.mode, menu.canAct, menu.desk.locked]).toEqual([
      { kind: "menu", inert: false },
      "menu",
      true,
      false,
    ]);
    const train = flowOf(
      t,
      uiAfter({ type: "open", to: "train" }, { type: "select", kind: "train:stamina" }),
    );
    expect(train.screen).toEqual({
      kind: "train",
      selected: "train:stamina",
      result: undefined,
      finished: false,
    });
    expect([train.mode, train.hud?.preview, train.canAct, train.canReplay]).toEqual([
      "training",
      "train:stamina",
      true,
      false,
    ]);
    const shop = flowOf(t, uiAfter({ type: "open", to: "skills" }));
    expect(shop.screen).toEqual({ kind: "workshop", tab: "skills" });
    expect([shop.mode, shop.hud?.preview, shop.screenKey]).toEqual([
      "menu",
      "workshop",
      "workshop",
    ]);
  });

  it("the planning card only on a race week (else the menu), its position from the planned record", () => {
    const plan = uiAfter({ type: "open", to: "plan" });
    const normal = started();
    expect(flowOf(normal, plan).screen).toEqual({ kind: "menu", inert: false });
    const w10 = loadSave("peregrina-w10");
    const flow = flowOf(w10, plan);
    expect(flow.screen).toEqual({ kind: "plan", position: undefined });
    expect([flow.mode, flow.music, flow.canAct, flow.canReplay]).toEqual([
      "menu",
      "menu",
      false,
      true,
    ]);
    w10.weeks.plan(fpOf(w10), 10, "stalk");
    expect(flowOf(w10, plan).screen).toEqual({ kind: "plan", position: "stalk" });
  });

  it("the end; a watch from it takes the race screen with no emblem, and keeps `solo` (M3, L8)", () => {
    const t = loadSave("peregrina-ended");
    const end = flowOf(t, INITIAL_UI);
    expect([end.screen, end.mode, end.hud, end.solo, end.canAct, end.canReplay]).toEqual([
      { kind: "end", inert: false },
      "end",
      undefined,
      true,
      false,
      true,
    ]);
    const watch = uiAfter({ type: "watch", turn: 10, from: "end" });
    const nav = watch.nav;
    if (nav.at !== "watch") throw new Error("watch");
    const race = { kind: "race", turn: 10, stage: "replay", play: watchKey(nav), watch: "end" };
    const flow = flowOf(t, watch);
    expect([flow.top.kind, flow.layer, flow.screen]).toEqual(["idle", undefined, race]);
    expect([flow.mode, flow.music, flow.solo, flow.desk.locked, flow.canReplay]).toEqual([
      "race",
      "race",
      true,
      true,
      false,
    ]);
    // a turn without a race: nothing to watch, the end stays
    const none = uiAfter({ type: "watch", turn: 11, from: "end" });
    expect(flowOf(t, none).screen).toEqual({ kind: "end", inert: false });
  });

  it("`solo` is false during the season's last race (the panel stays, locked: review 1 item 3)", () => {
    const t = loadSave("peregrina-w48");
    decide(t, { kind: "rest" });
    const mine = race(t, { kind: "rest" });
    expect(stateOf(t).status).toBe("ended");
    const flow = flowOf(t, mine);
    expect(flow.top.kind).toBe("replay");
    expect([flow.solo, flow.desk.locked, flow.screen.kind]).toEqual([false, true, "race"]);
  });

  it("the season's last training (Caracara's week 48): its result on the training screen before the end (F3)", () => {
    const t = loadSave("caracara-w48");
    const mine = commit(t, { kind: "train:technique" });
    expect(stateOf(t).status).toBe("ended");
    const flow = flowOf(t, mine);
    expect(flow.top.kind).toBe("train-result");
    expect([flow.screen.kind, flow.mode, flow.solo, flow.desk.locked]).toEqual([
      "train",
      "training",
      false,
      true,
    ]);
    expect(flow.hud?.of.turn).toBe(48);
    // the week she trained in: its HUD and buttons, the training she chose (critic b1)
    expect(flow.hud?.of).toBe(t.game.getSnapshot().lastStep?.before);
    expect(flow.screen.kind === "train" && flow.screen.selected).toBe("train:technique");
  });

  it("an injured season's last week: no result, its recovery over the end, then the end (F4, O2, O5)", () => {
    const t = loadSave("caracara-w48");
    const hurt = hurtRun(t);
    const ctx = t.game.context();
    const input: RunInput = { kind: "train:technique" };
    const step: Step = { before: hurt.state, input, after: advanceSeason(ctx, hurt.state, input) };
    expect(step.after.status).toBe("ended");
    const run: ActiveRun = { ...hurt, inputs: [...hurt.inputs, input], state: step.after };
    const facts = factsOver(t, run, step);
    const mine = uiAfter({ type: "acted" });
    const flow = deriveFlow(ctx, facts, mine);
    expect(flow.top).toMatchObject({ kind: "fx", part: "all", landed: false });
    expect(flow.top.kind === "fx" && flow.top.fx[0]?.kind).toBe("recovery");
    expect([flow.screen, flow.mode, flow.hud]).toEqual([
      { kind: "end", inert: true },
      "end",
      undefined,
    ]);
    const done = reduceUi(mine, { type: "done", keys: [flow.top.key] });
    expect(deriveFlow(ctx, facts, done).screen).toEqual({ kind: "end", inert: false });
  });

  it("a watch from a result left at idle shows the menu, takes no action (done ends it before idle)", () => {
    const t = started();
    const stale = uiAfter({ type: "watch", turn: 1, from: "result" });
    const flow = flowOf(t, stale);
    expect(flow.screen).toEqual({ kind: "menu", inert: false });
    expect([flow.canAct, flow.canReplay]).toEqual([false, false]);
  });
});

describe("the sheet hold and a replayed scene", () => {
  it("a sheet open holds a beat's layer (F10), never the event's", () => {
    const t = started();
    const mine = commit(t, { kind: "rest" });
    const flow = flowOf(t, mine, { sheetOpen: true });
    expect(flow.top.kind).toBe("fx");
    expect([flow.layer, flow.screen, flow.desk.locked]).toEqual([
      undefined,
      { kind: "menu", inert: false },
      false,
    ]);
    const v2 = testGame();
    const start = { kind: "start", falconessId: "caracara", hangar: HANGAR, parents: [] };
    const rest = { kind: "rest" };
    v2.game.loadText(
      JSON.stringify({
        schemaVersion: 1,
        rulesetVersion: "v2",
        seed: "1",
        inputs: [start, rest, rest, rest],
      }),
    );
    v2.game.acknowledgeStep();
    expect(flowOf(v2, INITIAL_UI, { sheetOpen: true }).layer?.kind).toBe("event");
  });

  it("a sheet open over the covered emblem before a scene: the card, never the black without the emblem", () => {
    // the black stands only under the emblem: held alone it would cover the wide screen's chat
    // (a sheet in the column, under the black) and leave nothing to tap (review of phase 4)
    const t = loadSave("peregrina-w10");
    const fp = fpOf(t);
    const covered = reduceUi(decide(t, { kind: "rest" }), {
      type: "done",
      keys: [`${fp}/w:fx`, `${fp}/w:emblem:in`],
    });
    expect(flowOf(t, covered).screen).toEqual({ kind: "black" });
    const flow = flowOf(t, covered, { sheetOpen: true });
    expect(flow.top).toMatchObject({ kind: "emblem", covered: true });
    expect(flow.layer).toBeUndefined();
    expect(flow.screen).toEqual({
      kind: "position",
      week: t.weeks.getSnapshot(),
      wings: raceWings(t.game.context(), stateOf(t)),
      inert: false,
    });
    expect(flow.screenKey).toBe("position");
  });

  it("«Historia» / «Ver» play a scene only when nothing else is in front (critic b)", () => {
    const t = started();
    const prologue = factsFor(t).scenes.find((s) => s.id === "peregrina-prologue");
    if (!prologue) throw new Error("no prologue");
    const asked = uiAfter({ type: "replay", scene: prologue });
    const flow = flowOf(t, asked);
    expect(flow.layer).toEqual({
      kind: "scene",
      key: "replay:1:peregrina-prologue",
      scene: prologue,
      digest: undefined,
      replay: true,
    });
    expect([flow.screen, flow.canReplay, flow.canAct, flow.desk.locked]).toEqual([
      { kind: "menu", inert: true },
      false,
      true,
      true,
    ]);
    // held by an open sheet
    expect(flowOf(t, asked, { sheetOpen: true }).layer).toBeUndefined();
    // over the week's effects: the effects stay, the scene waits
    const fx = reduceUi(commit(t, { kind: "rest" }), { type: "replay", scene: prologue });
    const effects = flowOf(t, fx);
    expect([effects.layer?.kind, effects.canReplay]).toEqual(["fx", false]);
  });
});

describe("identity (I22)", () => {
  it("two derives over equal facts return the same top, screen and layer", () => {
    const cases: { name: string; t: TestGame; ui: UiState; page?: Page }[] = [];
    const fx = started();
    cases.push({ name: "effects", t: fx, ui: commit(fx, { kind: "rest" }) });
    const trained = started();
    cases.push({ name: "result", t: trained, ui: commit(trained, { kind: "train:agility" }) });
    const w = loadSave("peregrina-w10");
    const fp = fpOf(w);
    cases.push({
      name: "covered emblem",
      t: w,
      ui: reduceUi(decide(w, { kind: "rest" }), {
        type: "done",
        keys: [`${fp}/w:fx`, `${fp}/w:emblem:in`],
      }),
    });
    const r = raced();
    cases.push({ name: "replay", t: r.t, ui: r.mine });
    const s = started("s2");
    s.game.act({ kind: "rest" });
    s.game.acknowledgeStep();
    cases.push({
      name: "idle",
      t: s,
      ui: uiAfter({ type: "open", to: "train" }),
      page: { pace: "fast" },
    });
    for (const c of cases) {
      const a = flowOf(c.t, c.ui, c.page);
      // the facts read again from the stores: new objects, equal readings
      const b = flowOf(c.t, c.ui, c.page, a);
      expect(b.top, c.name).toBe(a.top);
      expect(b.screen, c.name).toBe(a.screen);
      expect(b.layer, c.name).toBe(a.layer);
      expect(screenKey(b.screen)).toBe(b.screenKey);
    }
  });

  it("a change keeps nothing stale: the next beat is a new object", () => {
    const t = started();
    const mine = commit(t, { kind: "rest" });
    const a = flowOf(t, mine);
    t.game.acknowledgeStep();
    const b = flowOf(t, mine, {}, a);
    expect(b.top).not.toBe(a.top);
    expect(b.top.kind).toBe("idle");
    expect(b.layer).toBeUndefined();
  });
});
