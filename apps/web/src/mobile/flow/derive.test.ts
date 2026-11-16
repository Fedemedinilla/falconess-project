import { describe, expect, it } from "vitest";
import { paceScale } from "../pace";
import { deriveFlow, screenKey, watchKey } from "./derive";
import { type FlowPolicy, LEGACY_POLICY, TARGET_POLICY } from "./policy";
import { DIGEST } from "./scenes";
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
import type { Flow } from "./types";
import { INITIAL_UI, reduceUi, type UiState } from "./ui";
import { raceWings } from "./week";

/**
 * What is on screen for each first beat (plan §1.6), on real games: the screen, the mode, the
 * layer, the HUD's sources, the wide screen's panel, and when a notice, a replayed scene or a
 * week's action may come. LEGACY is today's MobileGame, TARGET the design.
 */

const HANGAR = ["shiden", "mule", "nimbus", "falke"];
const BOTH = [LEGACY_POLICY, TARGET_POLICY];

type Page = Parameters<typeof factsFor>[1];

const flowOf = (t: TestGame, ui: UiState, p: FlowPolicy, page: Page = {}, prev?: Flow): Flow =>
  deriveFlow(t.game.context(), factsFor(t, page), ui, p, prev);

const started = (seed = "s1"): TestGame => {
  const t = testGame();
  t.game.start("peregrina", HANGAR, seed);
  t.story.markSeen(seed, "peregrina-prologue");
  return t;
};

/** `peregrina-w10`, raced after a rest (she wins: `peregrina-debut-win` comes after the race). */
const raced = (save = "peregrina-w10"): { t: TestGame; mine: UiState } => {
  const t = loadSave(save);
  decide(t, { kind: "rest" });
  return { t, mine: race(t, { kind: "rest" }) };
};

describe("a training's result", () => {
  it("the training screen; legacy over the next week's HUD (critic b1), target the week she trained in", () => {
    const t = started();
    const before = stateOf(t);
    const mine = commit(t, { kind: "train:agility" });
    for (const p of BOTH) {
      const flow = flowOf(t, mine, p);
      expect(flow.top.kind).toBe("train-result");
      if (flow.top.kind !== "train-result" || flow.screen.kind !== "train")
        throw new Error("train");
      expect(flow.screen.result).toBe(flow.top);
      expect(flow.screen.finished).toBe(false);
      expect(flow.screen.selected).toBe(p.trainView ? "train:agility" : undefined);
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
      expect(flow.hud?.pop).toEqual(
        result.vigor === 0 ? undefined : { delta: result.vigor, delay },
      );
      if (p.trainView) {
        expect(flow.hud?.of).toBe(before);
        expect(flow.hud?.vigor).toBe(before);
        expect(flow.hud?.vigorTo).toBe(stateOf(t));
        expect(flow.hud?.vigorAt).toBe(delay);
      } else {
        expect(flow.hud?.of).toBe(stateOf(t));
        expect(flow.hud?.vigor).toBe(stateOf(t));
        expect(flow.hud?.vigorTo).toBeUndefined();
      }
    }
  });

  it("on a race week the HUD reads the week being decided, not the last step's `before` (review 1 item 4)", () => {
    const t = loadSave("peregrina-w10");
    const mine = decide(t, { kind: "train:technique" }, "train");
    const lastBefore = t.game.getSnapshot().lastStep?.before;
    expect(lastBefore?.turn).toBe(9);
    for (const p of BOTH) {
      const flow = flowOf(t, mine, p);
      expect(flow.top.kind).toBe("train-result");
      expect(flow.hud?.of).toBe(stateOf(t));
      expect(flow.hud?.of.turn).toBe(10);
      expect(flow.hud?.of.mood).toBe(stateOf(t).mood);
      expect(flow.hud?.vigorTo).toBe(p.trainView ? factsFor(t).preview?.after : undefined);
    }
  });
});

describe("the week's effects", () => {
  it("over the inert menu; target's HUD shows the week just played until they lift (O3), the vigor where it landed", () => {
    const t = started();
    const before = stateOf(t);
    const mine = commit(t, { kind: "rest" });
    for (const p of BOTH) {
      const flow = flowOf(t, mine, p);
      expect(flow.screen).toEqual({ kind: "menu", inert: true });
      expect(flow.layer?.kind).toBe("fx");
      expect([flow.mode, flow.desk.locked, flow.toast]).toEqual(["menu", true, false]);
      // a rest: nothing landed before, so the bar moves when the effects lift
      expect(flow.hud?.of).toBe(p.fxHud ? before : stateOf(t));
      expect(flow.hud?.vigor).toBe(p.fxHud ? before : stateOf(t));
    }
    // the race's part: its vigor showed before «Correr» (landed)
    const r = raced();
    const step = r.t.game.getSnapshot().lastStep;
    const done = reduceUi(r.mine, {
      type: "done",
      keys: ["race:replay", "race:finish", "race:result"].map((k) => `${fpOf(r.t)}/${k}`),
    });
    r.t.story.markSeen("1", "peregrina-debut-win");
    for (const p of BOTH) {
      const flow = flowOf(r.t, done, p);
      expect(flow.top.kind === "fx" && flow.top.part).toBe("race");
      expect(flow.hud?.of).toBe(p.fxHud ? step?.before : stateOf(r.t));
      expect(flow.hud?.vigor).toBe(p.fxHud ? step?.after : stateOf(r.t));
    }
  });

  it("a race week's action's effects: over the menu; legacy previews the action's cost, target its vigor once landed", () => {
    const t = loadSave("peregrina-w10");
    const mine = decide(t, { kind: "rest" });
    for (const p of BOTH) {
      const flow = flowOf(t, mine, p);
      expect(flow.top.kind === "fx" && flow.top.part).toBe("action");
      expect(flow.top.kind === "fx" && flow.top.landed).toBe(false);
      expect(flow.screen).toEqual({ kind: "menu", inert: true });
      expect(flow.mode).toBe("menu");
      expect(flow.hud?.of).toBe(stateOf(t));
      expect(flow.hud?.vigor).toBe(stateOf(t));
      expect(flow.hud?.preview).toBe(p.trainView ? undefined : "rest");
    }
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
    for (const p of BOTH) {
      const flow = flowOf(hurt, played, p);
      expect(flow.top).toMatchObject({ kind: "fx", part: "action", landed: true });
      expect(flow.top.kind === "fx" && flow.top.fx.map((x) => x.kind)).toEqual(["injury"]);
      expect(flow.hud?.vigor).toBe(p.trainView ? preview?.after : stateOf(hurt));
    }
  });

  it("over the end once the season ended (target, O5): no HUD", () => {
    const t = loadSave("peregrina-w48");
    decide(t, { kind: "rest" });
    const mine = race(t, { kind: "rest" });
    const fp = fpOf(t);
    t.story.markSeen("1", "peregrina-long-lost");
    const done = reduceUi(mine, {
      type: "done",
      keys: ["race:replay", "race:finish", "race:result"].map((k) => `${fp}/${k}`),
    });
    const flow = flowOf(t, done, TARGET_POLICY);
    expect(flow.top.kind).toBe("fx");
    expect(flow.screen).toEqual({ kind: "end", inert: true });
    expect([flow.mode, flow.hud, flow.solo]).toEqual(["end", undefined, true]);
    expect(flowOf(t, done, LEGACY_POLICY).screen).toEqual({ kind: "end", inert: false });
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
    for (const p of BOTH) {
      const flow = flowOf(t, INITIAL_UI, p);
      expect(flow.layer).toEqual({ kind: "event", key: "event:caracara-scrap-run/3" });
      expect(flow.screen).toEqual({ kind: "menu", inert: true });
      expect([flow.mode, flow.desk.locked, flow.canAct]).toEqual(["menu", true, false]);
      expect(flow.hud?.of).toBe(stateOf(t));
    }
  });

  it("the inheritance card and a week's scene: the menu inert, the HUD on the run", () => {
    const t = loadSave("peregrina-w39-insp");
    const mine = commit(t, { kind: "rest" });
    t.game.acknowledgeStep();
    const flow = flowOf(t, mine, TARGET_POLICY);
    expect(flow.layer?.kind).toBe("inspiration");
    expect(flow.screen).toEqual({ kind: "menu", inert: true });
    expect(flow.hud?.of).toBe(stateOf(t));
    t.cards.markShown("1", "1:40");
    const scene = flowOf(t, mine, TARGET_POLICY, { pace: "fast" });
    expect(scene.layer).toMatchObject({ kind: "scene", replay: false, digest: DIGEST.fast });
    expect(scene.layer?.kind === "scene" && scene.layer.scene.id).toBe("peregrina-first-vos");
    expect([scene.mode, scene.screen.kind, scene.music]).toEqual(["menu", "menu", "menu"]);
  });

  it("an instant beat shows the next beat's screen: a passed prologue, the menu at once", () => {
    const t = testGame();
    t.story.markSeen("earlier", "peregrina-prologue");
    t.game.start("peregrina", HANGAR, "s9");
    for (const p of BOTH) {
      const flow = flowOf(t, INITIAL_UI, p);
      expect(flow.top.kind).toBe("pass");
      expect(flow.screen).toEqual({ kind: "menu", inert: false });
      expect([flow.layer, flow.canAct, flow.canReplay]).toEqual([undefined, false, false]);
    }
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
    for (const p of BOTH) {
      const a = flowOf(fxWeek, afterFx, p);
      expect(a.top).toMatchObject({ kind: "emblem", covered: false, fadeIn: true });
      expect(a.screen).toEqual({ kind: "menu", inert: true });
      expect([a.mode, a.music, a.desk.locked]).toEqual(["race", "race", true]);
      const b = flowOf(trained, afterResult, p);
      expect(b.screen).toMatchObject({ kind: "train", finished: true });
      expect(b.screen.kind === "train" && b.screen.result?.key).toBe(`${fpOf(trained)}/w:result`);
      expect(flowOf(swap, workshop, p).screen).toEqual({ kind: "workshop", tab: "wings" });
    }
  });

  it("covered: black only when a scene comes next (the HUD kept under it), else the inert card", () => {
    const t = loadSave("peregrina-w10");
    const fp = fpOf(t);
    const covered = reduceUi(decide(t, { kind: "rest" }), {
      type: "done",
      keys: [`${fp}/w:fx`, `${fp}/w:emblem:in`],
    });
    for (const p of BOTH) {
      const flow = flowOf(t, covered, p);
      expect(flow.top).toMatchObject({ kind: "emblem", covered: true });
      expect(flow.screen).toEqual({ kind: "black" });
      expect(flow.screenKey).toBe("black");
      expect(flow.hud).toBeDefined();
      expect([flow.toast, flow.wide]).toEqual([false, false]);
    }
    // the scene seen in another season: passed by (instant), so the card, never black
    t.story.markSeen("other", "peregrina-debut");
    for (const p of BOTH) {
      const flow = flowOf(t, covered, p);
      expect(flow.screen).toMatchObject({ kind: "position", inert: true });
    }
  });

  it("the scene before the race over the inert card; then the card, no way back; legacy's HUD previews the cost", () => {
    const t = loadSave("peregrina-w10");
    const fp = fpOf(t);
    const mine = reduceUi(decide(t, { kind: "rest" }), {
      type: "done",
      keys: [`${fp}/w:fx`, `${fp}/w:emblem:in`, `${fp}/w:emblem`],
    });
    const preview = factsFor(t).preview;
    for (const p of BOTH) {
      const flow = flowOf(t, mine, p);
      expect(flow.top).toMatchObject({ kind: "scene", where: "prerace" });
      expect(flow.screen).toMatchObject({ kind: "position", inert: true });
      expect([flow.mode, flow.music]).toEqual(["race", "race"]);
      expect(flow.hud?.vigor).toBe(p.trainView ? preview?.after : stateOf(t));
    }
    t.story.markSeen("1", "peregrina-debut");
    for (const p of BOTH) {
      const flow = flowOf(t, mine, p);
      expect(flow.screen).toEqual({
        kind: "position",
        week: t.weeks.getSnapshot(),
        wings: raceWings(t.game.context(), stateOf(t)),
        inert: false,
      });
      expect(flow.screenKey).toBe("position");
      expect(flow.hud?.preview).toBe(p.trainView ? undefined : "rest");
      expect([flow.canAct, flow.canReplay, flow.toast, flow.desk.locked]).toEqual([
        false,
        true,
        true,
        true,
      ]);
    }
  });

  it("the replay and the finish: the race screen, wide, no HUD; the panel shows the week before (no spoiler)", () => {
    const { t, mine } = raced();
    const step = t.game.getSnapshot().lastStep;
    for (const p of BOTH) {
      const flow = flowOf(t, mine, p);
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
    }
    const finish = reduceUi(mine, { type: "done", keys: [`${fpOf(t)}/race:replay`] });
    const flow = flowOf(t, finish, TARGET_POLICY);
    expect(flow.screen).toMatchObject({ stage: "finish", play: `${fpOf(t)}/race:finish` });
    expect(flow.screenKey).toBe("race:10");
  });

  it("a scene after the race: the race held (an empty body), the panel still the week before", () => {
    const { t, mine } = raced();
    const done = reduceUi(mine, {
      type: "done",
      keys: [`${fpOf(t)}/race:replay`, `${fpOf(t)}/race:finish`],
    });
    for (const p of BOTH) {
      const flow = flowOf(t, done, p);
      expect(flow.layer?.kind === "scene" && flow.layer.scene.id).toBe("peregrina-debut-win");
      expect(flow.screen).toMatchObject({ kind: "race", turn: 10, stage: "held" });
      expect(flow.screenKey).toBe("race:10");
      expect([flow.mode, flow.hud, flow.desk.hideLast]).toEqual(["race", undefined, true]);
      expect(flow.desk.of).toBe(t.game.getSnapshot().lastStep?.before);
    }
  });

  it("the result: the race screen at its result, the panel on the run; «Ver otra vez» replays it there, never reaching idle", () => {
    const { t, mine } = raced();
    const fp = fpOf(t);
    t.story.markSeen("1", "peregrina-debut-win");
    const result = reduceUi(mine, {
      type: "done",
      keys: [`${fp}/race:replay`, `${fp}/race:finish`],
    });
    for (const p of BOTH) {
      const flow = flowOf(t, result, p);
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
      const w = flowOf(t, watching, p);
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
      const back = flowOf(t, after, p);
      expect(back.top.kind).toBe("fx");
      expect(back.screen).toEqual({ kind: "menu", inert: true });
    }
  });
});

describe("idle", () => {
  it("the screen the player went to: menu, training (its mode), workshop; the cost stripes of the pick", () => {
    const t = started();
    for (const p of BOTH) {
      const menu = flowOf(t, INITIAL_UI, p);
      expect([menu.screen, menu.mode, menu.canAct, menu.desk.locked]).toEqual([
        { kind: "menu", inert: false },
        "menu",
        true,
        false,
      ]);
      const train = flowOf(
        t,
        uiAfter({ type: "open", to: "train" }, { type: "select", kind: "train:stamina" }),
        p,
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
      const shop = flowOf(t, uiAfter({ type: "open", to: "skills" }), p);
      expect(shop.screen).toEqual({ kind: "workshop", tab: "skills" });
      expect([shop.mode, shop.hud?.preview, shop.screenKey]).toEqual([
        "menu",
        "workshop",
        "workshop",
      ]);
    }
  });

  it("the planning card only on a race week (else the menu), its position from the planned record", () => {
    const plan = uiAfter({ type: "open", to: "plan" });
    const normal = started();
    for (const p of BOTH)
      expect(flowOf(normal, plan, p).screen).toEqual({ kind: "menu", inert: false });
    const w10 = loadSave("peregrina-w10");
    for (const p of BOTH) {
      const flow = flowOf(w10, plan, p);
      expect(flow.screen).toEqual({ kind: "plan", position: undefined });
      expect([flow.mode, flow.music, flow.canAct, flow.canReplay]).toEqual([
        "menu",
        "menu",
        false,
        true,
      ]);
    }
    w10.weeks.plan(fpOf(w10), 10, "stalk");
    for (const p of BOTH)
      expect(flowOf(w10, plan, p).screen).toEqual({ kind: "plan", position: "stalk" });
  });

  it("the end; a watch from it takes the race screen (legacy: after the emblem); `solo` there only under target", () => {
    const t = loadSave("peregrina-ended");
    for (const p of BOTH) {
      const end = flowOf(t, INITIAL_UI, p);
      expect([end.screen, end.mode, end.hud, end.solo, end.canAct, end.canReplay]).toEqual([
        { kind: "end", inert: false },
        "end",
        undefined,
        true,
        false,
        true,
      ]);
    }
    const watch = uiAfter({ type: "watch", turn: 10, from: "end" });
    const nav = watch.nav;
    if (nav.at !== "watch") throw new Error("watch");
    const race = { kind: "race", turn: 10, stage: "replay", play: watchKey(nav), watch: "end" };
    const legacy = flowOf(t, watch, LEGACY_POLICY);
    expect(legacy.top.kind).toBe("emblem");
    expect(legacy.layer).toEqual({ kind: "emblem", key: "watch:1/emblem", fadeIn: false });
    expect(legacy.screen).toEqual(race);
    expect([legacy.mode, legacy.music, legacy.solo]).toEqual(["race", "race", false]);
    const target = flowOf(t, watch, TARGET_POLICY);
    expect([target.top.kind, target.layer, target.screen]).toEqual(["idle", undefined, race]);
    expect([target.mode, target.solo, target.desk.locked, target.canReplay]).toEqual([
      "race",
      true,
      true,
      false,
    ]);
    // a turn without a race: nothing to watch, the end stays
    const none = uiAfter({ type: "watch", turn: 11, from: "end" });
    for (const p of BOTH) expect(flowOf(t, none, p).screen).toEqual({ kind: "end", inert: false });
  });

  it("`solo` is false during the season's last race (the panel stays, locked: review 1 item 3)", () => {
    const t = loadSave("peregrina-w48");
    decide(t, { kind: "rest" });
    const mine = race(t, { kind: "rest" });
    expect(stateOf(t).status).toBe("ended");
    for (const p of BOTH) {
      const flow = flowOf(t, mine, p);
      expect(flow.top.kind).toBe("replay");
      expect([flow.solo, flow.desk.locked, flow.screen.kind]).toEqual([false, true, "race"]);
    }
  });

  it("a watch from a result left at idle shows the menu, takes no action (done ends it before idle)", () => {
    const t = started();
    const stale = uiAfter({ type: "watch", turn: 1, from: "result" });
    for (const p of BOTH) {
      const flow = flowOf(t, stale, p);
      expect(flow.screen).toEqual({ kind: "menu", inert: false });
      expect([flow.canAct, flow.canReplay]).toEqual([false, false]);
    }
  });
});

describe("the sheet hold and a replayed scene", () => {
  it("a sheet open holds a beat's layer (F10), never the event's", () => {
    const t = started();
    const mine = commit(t, { kind: "rest" });
    for (const p of BOTH) {
      const flow = flowOf(t, mine, p, { sheetOpen: true });
      expect(flow.top.kind).toBe("fx");
      expect([flow.layer, flow.screen, flow.desk.locked]).toEqual([
        undefined,
        { kind: "menu", inert: false },
        false,
      ]);
    }
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
    for (const p of BOTH)
      expect(flowOf(v2, INITIAL_UI, p, { sheetOpen: true }).layer?.kind).toBe("event");
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
    for (const p of BOTH) {
      expect(flowOf(t, covered, p).screen).toEqual({ kind: "black" });
      const flow = flowOf(t, covered, p, { sheetOpen: true });
      expect(flow.top).toMatchObject({ kind: "emblem", covered: true });
      expect(flow.layer).toBeUndefined();
      expect(flow.screen).toEqual({
        kind: "position",
        week: t.weeks.getSnapshot(),
        wings: raceWings(t.game.context(), stateOf(t)),
        inert: false,
      });
      expect(flow.screenKey).toBe("position");
    }
  });

  it("«Historia» / «Ver» play a scene only when nothing else is in front (critic b)", () => {
    const t = started();
    const prologue = factsFor(t).scenes.find((s) => s.id === "peregrina-prologue");
    if (!prologue) throw new Error("no prologue");
    const asked = uiAfter({ type: "replay", scene: prologue });
    for (const p of BOTH) {
      const flow = flowOf(t, asked, p);
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
      expect(flowOf(t, asked, p, { sheetOpen: true }).layer).toBeUndefined();
    }
    // over the week's effects: the effects stay, the scene waits
    const fx = reduceUi(commit(t, { kind: "rest" }), { type: "replay", scene: prologue });
    for (const p of BOTH) {
      const flow = flowOf(t, fx, p);
      expect([flow.layer?.kind, flow.canReplay]).toEqual(["fx", false]);
    }
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
    for (const c of cases)
      for (const p of BOTH) {
        const a = flowOf(c.t, c.ui, p, c.page);
        // the facts read again from the stores: new objects, equal readings
        const b = flowOf(c.t, c.ui, p, c.page, a);
        expect(b.top, c.name).toBe(a.top);
        expect(b.screen, c.name).toBe(a.screen);
        expect(b.layer, c.name).toBe(a.layer);
        expect(screenKey(b.screen)).toBe(b.screenKey);
      }
  });

  it("a change keeps nothing stale: the next beat is a new object", () => {
    const t = started();
    const mine = commit(t, { kind: "rest" });
    const a = flowOf(t, mine, TARGET_POLICY);
    t.game.acknowledgeStep();
    const b = flowOf(t, mine, TARGET_POLICY, {}, a);
    expect(b.top).not.toBe(a.top);
    expect(b.top.kind).toBe("idle");
    expect(b.layer).toBeUndefined();
  });
});
