import type { RunInput, SeasonState, StoryScene, StoryTrigger } from "@falconess/schema";
import { seasonGoalsOf, startSeason } from "@falconess/sim";
import { describe, expect, it } from "vitest";
import type { InspirationScene } from "../inspirationScene";
import {
  DIGEST,
  digestFor,
  dueScenes,
  type MenuItem,
  menuOrder,
  SCENE_KINDS,
  SCENE_ORDER,
} from "./scenes";
import { testContext, testScenes } from "./testing/content";
import type { SceneMode } from "./types";

describe("digestFor: the scene digest of a «Ritmo»", () => {
  it("is the same frozen object on every call, so a scene's timers never restart on a render", () => {
    expect(digestFor("fast")).toBe(digestFor("fast"));
    expect(digestFor("direct")).toBe(digestFor("direct"));
    expect(digestFor("fast")).toBe(DIGEST.fast);
    expect(Object.isFrozen(DIGEST)).toBe(true);
    expect(Object.isFrozen(DIGEST.fast)).toBe(true);
    expect(Object.isFrozen(DIGEST.direct)).toBe(true);
  });

  it("passes a line every 1100 ms on Rápido and 650 ms on Directo; Normal plays the whole scene", () => {
    expect(digestFor("fast")).toEqual({ ms: 1100 });
    expect(digestFor("direct")).toEqual({ ms: 650 });
    expect(digestFor("normal")).toBeUndefined();
  });
});

// her season on v3, with the calendar's goals
const ctx = testContext("v3");
const start: Extract<RunInput, { kind: "start" }> = {
  kind: "start",
  falconessId: "peregrina",
  hangar: ["shiden", "mule", "nimbus", "falke"],
  parents: [],
};
const s0 = startSeason(ctx, "scenes-1", start);
const goals = [...seasonGoalsOf(ctx, s0)].sort((a, b) => a.turn - b.turn);
const goalTurn = (i: number): number => {
  const g = goals[i];
  if (!g) throw new Error(`no goal ${i}`);
  return g.turn;
};

/** Her season with the first goals run at `places` (the last one failed if `failed`). */
function after(places: readonly number[], failed = false): SeasonState {
  const raceResults: SeasonState["raceResults"] = places.map((place, i) => ({
    courseId: goals[i]?.courseId ?? "",
    turn: goalTurn(i),
    place,
    fieldSize: 8,
    timeTicks: 1000,
    frameId: s0.equippedFrame,
    position: "lead",
    engine: "v1",
  }));
  const last = goalTurn(places.length - 1);
  return failed
    ? {
        ...s0,
        turn: last,
        status: "ended",
        endReason: "goal-failed",
        lastRace: { turn: last, outcome: "goal-failed" },
        raceResults,
      }
    : { ...s0, turn: goalTurn(places.length), raceResults };
}

const template = testScenes().find((sc) => sc.falconess === "peregrina");
if (!template) throw new Error("no scene of hers");
/** A scene of hers with this trigger (only the id and the trigger matter here). */
const scene = (id: string, trigger: StoryTrigger, falconess = "peregrina"): StoryScene => ({
  ...template,
  id,
  falconess,
  trigger,
});

// in "file" order, every kind mixed (none of these exist in the content: the orders are latent)
const SCENES: readonly StoryScene[] = [
  scene("x-turn-16", { kind: "turn", turn: 16 }),
  scene("x-after-1", { kind: "goal-after", goal: 1, result: "win" }),
  scene("x-end", { kind: "end", result: "goal-failed" }),
  scene("x-start", { kind: "start" }),
  scene("x-before-1", { kind: "goal-before", goal: 1 }),
  scene("x-after-0", { kind: "goal-after", goal: 0, result: "win" }),
  scene("x-turn-5", { kind: "turn", turn: 5 }),
  scene("x-after-1-any", { kind: "goal-after", goal: 1, result: "pass" }),
  scene("y-turn-5", { kind: "turn", turn: 5 }, "cernicala"),
];
const ids = (list: readonly StoryScene[]) => list.map((sc) => sc.id);
const due = (
  state: SeasonState,
  where: SceneMode,
  seen: ReadonlySet<string> = new Set(),
  scenes = SCENES,
) => ids(dueScenes(ctx, scenes, state, where, seen));

describe("the scene kinds and their priority (F13, F14)", () => {
  it("names each mode's kinds and orders the kinds as the season plays them", () => {
    expect(SCENE_ORDER).toEqual({ start: 0, "goal-before": 1, "goal-after": 2, end: 3, turn: 4 });
    expect(SCENE_KINDS).toEqual({
      prerace: ["goal-before"],
      race: ["goal-after", "end"],
      menu: ["start", "turn", "goal-after", "end"],
      end: ["goal-after", "end"],
    });
  });
});

describe("dueScenes: the scenes due now in a mode", () => {
  // week 20, the second goal's race week: she won the first one
  const raceWeek = after([1]);

  it("only a goal's «before» scene before the position", () => {
    expect(due(raceWeek, "prerace")).toEqual(["x-before-1"]);
  });

  it("the race mode and the end play goal-after and end scenes, the menu also the weeks'", () => {
    expect(due(raceWeek, "race")).toEqual(["x-after-0"]);
    expect(due(raceWeek, "end")).toEqual(["x-after-0"]);
    expect(due(raceWeek, "menu")).toEqual(["x-after-0", "x-turn-5", "x-turn-16"]);
  });

  it("no week's scene in the race mode or at the end, and the files' order decides nothing (F13, F14)", () => {
    const reversed = [...SCENES].reverse();
    for (const where of ["race", "end"] as const) {
      expect(due(raceWeek, where)).toEqual(["x-after-0"]);
      expect(due(raceWeek, where, new Set(), reversed)).toEqual(["x-after-0"]);
    }
    expect(due(raceWeek, "menu", new Set(), reversed)).toEqual([
      "x-after-0",
      "x-turn-5",
      "x-turn-16",
    ]);
  });

  it("by kind, then by goal or week, then by id", () => {
    // she won the first two goals and failed the third, which ended her season
    const ended = after([1, 1, 8], true);
    for (const where of ["race", "menu", "end"] as const) {
      expect(due(ended, where)).toEqual(["x-after-0", "x-after-1", "x-after-1-any", "x-end"]);
      expect(due(ended, where, new Set(), [...SCENES].reverse())).toEqual(due(ended, where));
    }
    expect(due(ended, "prerace")).toEqual([]);
  });

  it("the season's start: its scene on the menu only, never before or after a race", () => {
    expect(due(s0, "menu")).toEqual(["x-start"]);
    expect(due(s0, "race")).toEqual([]);
    expect(due(s0, "prerace")).toEqual([]);
  });

  it("leaves out what was seen in this season, another Falconess's scenes and triggers that do not hold", () => {
    expect(due(raceWeek, "menu", new Set(["x-after-0", "x-turn-16"]))).toEqual(["x-turn-5"]);
    const others = SCENES.filter((sc) => sc.falconess !== "peregrina");
    expect(due(raceWeek, "menu", new Set(), others)).toEqual([]);
    expect(due(after([2]), "menu")).toEqual(["x-turn-5", "x-turn-16"]);
  });

  it("her season ended at the third goal (the content): the goal-afters first, then the end (F13)", () => {
    const ended = after([1, 1, 8], true);
    const real = testScenes();
    // by kind, not by file name: the press after her second win comes before the ending
    for (const where of ["race", "end"] as const)
      expect(due(ended, where, new Set(), real)).toEqual([
        "peregrina-debut-win",
        "peregrina-press",
        "peregrina-end-failed",
      ]);
  });
});

describe("menuOrder: the menu's scenes and the inheritance card (D2)", () => {
  const card = (kind: "start" | "inspiration"): InspirationScene => ({
    key: kind === "start" ? "x:start" : "x:24",
    kind,
    turn: kind === "start" ? 1 : 24,
    records: [],
  });
  const names = (items: readonly MenuItem[]) =>
    items.map((it) => (it.kind === "card" ? `card:${it.card.kind}` : it.scene.id));
  const of = (...list: string[]) =>
    list.map((id) => {
      const sc = SCENES.find((x) => x.id === id);
      if (!sc) throw new Error(id);
      return sc;
    });

  it("at the season's start: the prologue, then the start's card (no longer the card first: C9)", () => {
    expect(names(menuOrder(of("x-start"), card("start")))).toEqual(["x-start", "card:start"]);
  });

  it("any other week: the goal's scenes and the end, the week's card, the weeks' scenes, a start left over (C10)", () => {
    const scenes = of("x-after-0", "x-end", "x-turn-5", "x-turn-16", "x-start");
    expect(names(menuOrder(scenes, card("inspiration")))).toEqual([
      "x-after-0",
      "x-end",
      "card:inspiration",
      "x-turn-5",
      "x-turn-16",
      "x-start",
    ]);
    expect(names(menuOrder(scenes, undefined))).toEqual(ids(scenes));
  });
});
