import { describe, expect, it } from "vitest";
import { LEGACY_POLICY } from "./policy";
import {
  flowNames,
  type LegacyNames,
  type LegacyOverlays,
  type LegacyView,
  legacyNames,
  SHADOW_IDLE,
  type ShadowNames,
  type ShadowWatch,
  sameFlow,
  shadowCommands,
  shadowFrame,
} from "./shadow";
import { testScenes } from "./testing/content";
import { createWorld, type World } from "./testing/world";
import type { Flow } from "./types";

/**
 * The shadow (plan 4.0): today's run's view and the flow model, by name. `legacyNames` reads the
 * view's own `View` and what it draws over it, `flowNames` the model's flow; `sameFlow` compares
 * them and knows the differences the phase-3 review expects, none of them the model's fault.
 */

const NONE: LegacyOverlays = Object.freeze({
  ended: false,
  hold: false,
  cover: false,
  black: undefined,
  inspiration: false,
  fx: false,
  event: false,
  scene: undefined,
  sheet: false,
});
const over = (o: Partial<LegacyOverlays>): LegacyOverlays => ({ ...NONE, ...o });
const names = (
  screen: string,
  layer: string | undefined = undefined,
  music: "menu" | "race" = "menu",
): ShadowNames => ({ screen, layer, music });
/** Today's names (`sheet`: a sheet open by the view's own state). */
const today = (
  screen: string,
  layer: string | undefined = undefined,
  music: "menu" | "race" = "menu",
  sheet = false,
): LegacyNames => ({ screen, layer, music, sheet });

describe("legacyNames: one row per View", () => {
  const decided: LegacyView = { screen: "prerace", decided: true };
  const rows: [string, LegacyView, LegacyOverlays, LegacyNames][] = [
    ["the menu", { screen: "menu" }, NONE, today("menu")],
    ["the week's effects", { screen: "menu" }, over({ fx: true }), today("menu", "fx")],
    [
      "an inheritance card",
      { screen: "menu" },
      over({ inspiration: true }),
      today("menu", "inspiration"),
    ],
    ["the event", { screen: "menu" }, over({ event: true }), today("menu", "event")],
    [
      "a week's scene",
      { screen: "menu" },
      over({ scene: { id: "peregrina-nap", replay: false } }),
      today("menu", "scene:peregrina-nap"),
    ],
    [
      "a scene from «Historia»",
      { screen: "menu" },
      over({ scene: { id: "peregrina-prologue", replay: true } }),
      today("menu", "replay:peregrina-prologue"),
    ],
    ["the training picker", { screen: "train" }, NONE, today("train/-")],
    [
      "a training picked",
      { screen: "train", selected: "train:agility" },
      NONE,
      today("train/train:agility"),
    ],
    ["a training's result", { screen: "trained" }, NONE, today("train:result")],
    ["the workshop's wings", { screen: "workshop", tab: "wings" }, NONE, today("workshop/wings")],
    [
      "the workshop's skills",
      { screen: "workshop", tab: "skills" },
      NONE,
      today("workshop/skills"),
    ],
    ["the planning card", { screen: "prerace" }, NONE, today("plan")],
    ["the decided card", decided, NONE, today("position", undefined, "race")],
    [
      "the decided card, covered",
      decided,
      over({ cover: true }),
      today("position", "emblem", "race"),
    ],
    [
      "black under the cover: a goal's scene comes next",
      decided,
      over({ cover: true, black: "scene" }),
      today("black", "emblem", "race"),
    ],
    [
      "black under the cover for a goal's scene seen in another season",
      decided,
      over({ cover: true, black: "passed" }),
      today("black:passed", "emblem", "race"),
    ],
    [
      "the goal's scene over the card",
      decided,
      over({ scene: { id: "peregrina-debut", replay: false } }),
      today("position", "scene:peregrina-debut", "race"),
    ],
    [
      "the race's replay",
      { screen: "race", turn: 10, result: false },
      NONE,
      today("race:10/replay", undefined, "race"),
    ],
    [
      "the race's result",
      { screen: "race", turn: 10, result: true },
      NONE,
      today("race:10/result", undefined, "race"),
    ],
    [
      "the result held for the scene after the race",
      { screen: "race", turn: 10, result: true },
      over({ hold: true, scene: { id: "peregrina-debut-win", replay: false } }),
      today("race:10/held", "scene:peregrina-debut-win", "race"),
    ],
    [
      "a race seen again from the end, covered",
      { screen: "race", turn: 10, result: false },
      over({ cover: true }),
      today("race:10/replay", "emblem", "race"),
    ],
    ["a race week's action's effects", { screen: "actionfx" }, NONE, today("menu", "fx")],
    ["the season's end", { screen: "menu" }, over({ ended: true }), today("end")],
    [
      "a sheet open over the menu",
      { screen: "menu" },
      over({ sheet: true }),
      today("menu", undefined, "menu", true),
    ],
    [
      "a scene at the season's end",
      { screen: "menu" },
      over({ ended: true, scene: { id: "peregrina-long-won", replay: false } }),
      today("end", "scene:peregrina-long-won"),
    ],
  ];
  it.each(rows)("%s", (_, view, o, expected) => {
    expect(legacyNames(view, o)).toEqual(expected);
  });

  it("the layer in front: the event's dialog, the emblem and the card, a scene, the effects", () => {
    const replay = { id: "peregrina-prologue", replay: true };
    const layer = (view: LegacyView, o: Partial<LegacyOverlays>) =>
      legacyNames(view, over(o)).layer;
    expect(layer({ screen: "menu" }, { fx: true, scene: replay })).toBe(
      "replay:peregrina-prologue",
    );
    expect(layer({ screen: "actionfx" }, { scene: replay })).toBe("replay:peregrina-prologue");
    expect(layer({ screen: "menu" }, { event: true, scene: replay })).toBe("event");
    expect(layer({ screen: "prerace", decided: true }, { cover: true, scene: replay })).toBe(
      "emblem",
    );
    expect(layer({ screen: "menu" }, { inspiration: true, scene: replay })).toBe("inspiration");
  });
});

/** The model on today's policy, wired as the run's view wires it (flow/testing/world.ts). */
const legacyWorld = (): World => createWorld({ policy: LEGACY_POLICY });
const flowOf = (w: World): Flow => w.now().flow;
const top = (w: World) => flowOf(w).top;

/** The beat in front ended as the game ends it, until the world is idle. */
function toIdle(w: World): void {
  for (let i = 0; i < 20; i += 1) {
    const t = top(w);
    if (t.kind === "idle") return;
    if (t.kind === "ack" || t.kind === "enter" || t.kind === "pass") w.cmd.resolve(t);
    else if (t.kind === "scene") w.cmd.sceneDone(t.key, true);
    else w.cmd.complete(t.key);
  }
  throw new Error(`stuck at ${top(w).kind}`);
}

const PROLOGUE = testScenes().find((s) => s.id === "peregrina-prologue");

describe("flowNames: the model's flow by the same names", () => {
  it("a season's start: the prologue over the menu, the menu, a training's picker and result", () => {
    const w = legacyWorld();
    w.start("peregrina", "shadow-1");
    expect(flowNames(flowOf(w))).toEqual(names("menu", "scene:peregrina-prologue"));
    w.cmd.sceneDone(top(w).key, true);
    expect(flowNames(flowOf(w))).toEqual(names("menu"));
    w.cmd.open("train");
    expect(flowNames(flowOf(w))).toEqual(names("train/-"));
    w.cmd.selectTraining("train:agility");
    expect(flowNames(flowOf(w))).toEqual(names("train/train:agility"));
    w.cmd.choose({ kind: "train:agility" });
    expect(flowNames(flowOf(w))).toEqual(names("train:result"));
  });

  it("a race week: the action's effects, the cover over black, the goal's scene, the card, the race", () => {
    const w = legacyWorld();
    w.load("peregrina-w10");
    w.cmd.open("skills");
    expect(flowNames(flowOf(w))).toEqual(names("workshop/skills"));
    w.cmd.open("menu");
    w.cmd.open("plan");
    expect(flowNames(flowOf(w))).toEqual(names("plan"));
    w.cmd.open("menu");
    w.cmd.choose({ kind: "rest" });
    expect(flowNames(flowOf(w))).toEqual(names("menu", "fx"));
    w.cmd.complete(top(w).key);
    const emblem = top(w);
    expect(emblem.kind).toBe("emblem");
    w.cmd.covered(emblem.key);
    expect(flowNames(flowOf(w))).toEqual(names("black", "emblem", "race"));
    w.cmd.complete(emblem.key);
    expect(flowNames(flowOf(w))).toEqual(names("position", "scene:peregrina-debut", "race"));
    w.cmd.sceneDone(top(w).key, true);
    expect(flowNames(flowOf(w))).toEqual(names("position", undefined, "race"));
    w.cmd.run();
    expect(flowNames(flowOf(w))).toEqual(names("race:10/replay", undefined, "race"));
    const race = flowOf(w).screen;
    if (race.kind !== "race") throw new Error("no race screen");
    w.cmd.raceSkip(race.play);
    expect(flowNames(flowOf(w))).toEqual(
      names("race:10/held", "scene:peregrina-debut-win", "race"),
    );
    w.cmd.sceneDone(top(w).key, true);
    expect(flowNames(flowOf(w))).toEqual(names("race:10/result", undefined, "race"));
    w.cmd.raceContinue();
    expect(flowNames(flowOf(w))).toEqual(names("menu", "fx"));
  });

  it("the season's end, and a race seen again from it under the legacy emblem (F25)", () => {
    const w = legacyWorld();
    w.load("peregrina-ended");
    expect(flowNames(flowOf(w))).toEqual(names("end"));
    w.cmd.rewatch(10);
    expect(flowNames(flowOf(w))).toEqual(names("race:10/replay", "emblem", "race"));
  });
});

/** `peregrina-w10` decided on a rest, its effects done, the emblem covering. */
function covered(elsewhere: readonly string[] = []): World {
  const w = legacyWorld();
  w.load("peregrina-w10", undefined, elsewhere);
  w.cmd.choose({ kind: "rest" });
  w.cmd.complete(top(w).key);
  w.cmd.covered(top(w).key);
  return w;
}

describe("sameFlow", () => {
  it("the same names are the same; any other difference is a mismatch, with both sides", () => {
    const w = legacyWorld();
    w.load("peregrina-w10");
    const { flow, ui } = w.now();
    expect(sameFlow(flow, today("menu"), ui)).toEqual({ kind: "same" });
    expect(sameFlow(flow, today("menu", undefined, "menu", true), ui)).toEqual({ kind: "same" });
    expect(sameFlow(flow, today("menu", undefined, "race"), ui)).toEqual({
      kind: "mismatch",
      model: names("menu"),
      legacy: today("menu", undefined, "race"),
    });
    expect(sameFlow(flow, today("train/-"), ui).kind).toBe("mismatch");
    expect(sameFlow(flow, today("menu", "fx"), ui).kind).toBe("mismatch");
  });

  it("passed-scene-black: today black waits under the cover for a goal's scene seen in another season", () => {
    const unseen = covered().now();
    expect(flowNames(unseen.flow)).toEqual(names("black", "emblem", "race"));
    expect(sameFlow(unseen.flow, today("black", "emblem", "race"), unseen.ui)).toEqual({
      kind: "same",
    });
    // a first scene she never saw, after one she saw elsewhere: black on both sides
    expect(sameFlow(unseen.flow, today("black:passed", "emblem", "race"), unseen.ui)).toEqual({
      kind: "same",
    });
    // seen in another season: the model passes it by and covers its card
    const passed = covered(["peregrina-debut"]).now();
    expect(flowNames(passed.flow)).toEqual(names("position", "emblem", "race"));
    expect(sameFlow(passed.flow, today("black:passed", "emblem", "race"), passed.ui)).toEqual({
      kind: "tolerated",
      rules: ["passed-scene-black"],
    });
    // black for a scene she never saw is the model's to show
    expect(sameFlow(passed.flow, today("black", "emblem", "race"), passed.ui).kind).toBe(
      "mismatch",
    );
    // the layer must still agree
    expect(sameFlow(passed.flow, today("black:passed", undefined, "race"), passed.ui).kind).toBe(
      "mismatch",
    );
    // and only under a covered emblem: before it covers, the model's underlay is no card
    const w = legacyWorld();
    w.load("peregrina-w10", undefined, ["peregrina-debut"]);
    w.cmd.choose({ kind: "rest" });
    w.cmd.complete(top(w).key);
    const first = w.now();
    expect(flowNames(first.flow)).toEqual(names("menu", "emblem", "race"));
    expect(sameFlow(first.flow, today("black:passed", "emblem", "race"), first.ui).kind).toBe(
      "mismatch",
    );
  });

  it("replay-refused: «Historia» or «Ver» asked during a beat plays today; the model refused it", () => {
    if (!PROLOGUE) throw new Error("no prologue");
    const w = legacyWorld();
    w.start("peregrina", "shadow-2");
    w.cmd.sceneDone(top(w).key, true);
    w.cmd.open("train");
    w.cmd.choose({ kind: "train:agility" });
    w.cmd.watchScene(PROLOGUE); // the training's result is in front
    const beat = w.now();
    expect(beat.ui.replay).toBeUndefined();
    expect(
      sameFlow(beat.flow, today("train:result", "replay:peregrina-prologue"), beat.ui),
    ).toEqual({ kind: "tolerated", rules: ["replay-refused"] });
    // the screen under it must still agree
    expect(sameFlow(beat.flow, today("menu", "replay:peregrina-prologue"), beat.ui).kind).toBe(
      "mismatch",
    );
    // at idle the model takes it and plays it as today
    toIdle(w);
    w.cmd.watchScene(PROLOGUE);
    const asked = w.now();
    expect(asked.ui.replay?.scene).toBe(PROLOGUE);
    expect(sameFlow(asked.flow, today("menu", "replay:peregrina-prologue"), asked.ui)).toEqual({
      kind: "same",
    });
    // a replay the model took and does not show is the model's fault
    const lost: Flow = { ...asked.flow, layer: undefined };
    expect(sameFlow(lost, today("menu", "replay:peregrina-prologue"), asked.ui).kind).toBe(
      "mismatch",
    );
  });

  it("sheet-hold: an open sheet holds the model's layers (F10), which today goes on with but a scene's", () => {
    const w = legacyWorld();
    w.start("peregrina", "shadow-3");
    // the prologue held: today it waits for «Menú», the chat, «Historia» and the title, not the rest
    const prologue = w.now();
    const heldScene: Flow = { ...prologue.flow, layer: undefined };
    expect(
      sameFlow(heldScene, today("menu", "scene:peregrina-prologue", "menu", true), prologue.ui),
    ).toEqual({ kind: "tolerated", rules: ["sheet-hold"] });
    w.cmd.sceneDone(top(w).key, true);
    w.cmd.choose({ kind: "rest" });
    const { flow, ui } = w.now();
    expect(flowNames(flow)).toEqual(names("menu", "fx"));
    const held: Flow = { ...flow, layer: undefined };
    expect(sameFlow(held, today("menu", "fx", "menu", true), ui)).toEqual({
      kind: "tolerated",
      rules: ["sheet-hold"],
    });
    // only with a sheet open by today's own state (the model's fact could be wrong)
    expect(sameFlow(held, today("menu", "fx"), ui).kind).toBe("mismatch");
    // only the layer of the beat it holds, over the same screen
    expect(sameFlow(held, today("menu", "inspiration", "menu", true), ui).kind).toBe("mismatch");
    expect(sameFlow(held, today("train/-", "fx", "menu", true), ui).kind).toBe("mismatch");
    // and only a layer it holds: with the effects in front, no hold
    expect(sameFlow(flow, today("menu", undefined, "menu", true), ui).kind).toBe("mismatch");
  });

  it("both: a sheet open on the way into a race holds the emblem over today's black", () => {
    const passed = covered(["peregrina-debut"]).now();
    const held: Flow = { ...passed.flow, layer: undefined };
    expect(flowNames(held)).toEqual(names("position", undefined, "race"));
    expect(sameFlow(held, today("black:passed", "emblem", "race", true), passed.ui)).toEqual({
      kind: "tolerated",
      rules: ["passed-scene-black", "sheet-hold"],
    });
    const unseen = covered().now();
    const black: Flow = { ...unseen.flow, layer: undefined };
    expect(sameFlow(black, today("black", "emblem", "race", true), unseen.ui)).toEqual({
      kind: "tolerated",
      rules: ["sheet-hold"],
    });
    expect(sameFlow(black, today("black", "emblem", "race"), unseen.ui).kind).toBe("mismatch");
  });
});

describe("the two-frame rule: a difference counts once it is on screen at two frames in a row", () => {
  const run = (frames: readonly (string | undefined)[]): boolean[] => {
    let watch: ShadowWatch = SHADOW_IDLE;
    return frames.map((m) => {
      const step = shadowFrame(watch, m);
      watch = step.watch;
      return step.report;
    });
  };
  it("one frame is not enough (the emblem's first frame: today's cover lands at 0 ms)", () => {
    expect(run(["a", undefined, "a", undefined])).toEqual([false, false, false, false]);
    expect(run(["a", "b", "a", "b"])).toEqual([false, false, false, false]);
  });
  it("two frames in a row report it once, until it changes or ends", () => {
    expect(run(["a", "a", "a", "a"])).toEqual([false, true, false, false]);
    expect(run(["a", "b", "b", "b"])).toEqual([false, false, true, false]);
    expect(run(["a", "a", undefined, "a", "a"])).toEqual([false, true, false, false, true]);
  });
});

describe("shadowCommands: the beat a handler of today ended, if the model shows it too", () => {
  it("completes only a beat of that kind, ends only the scene it names, skips the race on screen", () => {
    const w = legacyWorld();
    w.load("peregrina-w10");
    const dry = shadowCommands(w.cmd, w.now);
    dry.covered();
    dry.raceSkip();
    expect(top(w).kind).toBe("idle");
    w.cmd.choose({ kind: "rest" });
    dry.complete("train-result");
    dry.complete("inspiration");
    expect(top(w).kind).toBe("fx");
    dry.complete("fx");
    expect(top(w).kind).toBe("emblem");
    dry.covered();
    expect(flowNames(flowOf(w)).screen).toBe("black");
    dry.complete("emblem");
    dry.sceneDone("peregrina-nap", true);
    expect(top(w).kind).toBe("scene");
    dry.sceneDone("peregrina-debut", true);
    expect(top(w).kind).toBe("position");
    w.cmd.run();
    expect(flowNames(flowOf(w)).screen).toBe("race:10/replay");
    dry.raceSkip();
    expect(flowNames(flowOf(w)).screen).toBe("race:10/held");
  });
});
