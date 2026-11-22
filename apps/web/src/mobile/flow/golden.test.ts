import { POSITIONS, type Position, type TrainingKind } from "@falconess/schema";
import { advanceSeason } from "@falconess/sim";
import { describe, expect, it } from "vitest";
import type { WeekActionInput } from "../../screens/model/position";
import type { Pace } from "../pace";
import { isInstant } from "./beats";
import { parents } from "./testing/bots";
import { label } from "./testing/invariants";
import { createWorld, type TraceEvent, type World } from "./testing/world";
import type { Beat } from "./types";

/**
 * The expected sequences of plan Appendix A, on the node world: what the player sees and what each
 * tap or timer ends, in order. Each comes from a seeded save of the phone e2e (guarded by
 * `scripts/e2e-saves.test.ts`) or from a bounded search, which fails saying what the content moved.
 */

const DRIFT = "content moved: search again or regenerate the saves (WRITE_SAVES=1)";

/** A beat, as the sequences below name it. */
function name(b: Beat): string {
  switch (b.kind) {
    case "train-result":
      return "result";
    case "fx":
      return `fx:${b.part}`;
    case "scene":
      return `scene:${b.scene.id}@${b.where}`;
    case "pass":
      return `pass:${b.scene.id}`;
    case "inspiration":
      return `card:${b.card.kind}`;
    default:
      return b.kind;
  }
}

/** What ended since `from`, in order (beats a command ended). */
function ended(w: World, from = 0): string[] {
  return w.trace
    .slice(from)
    .filter((e): e is Extract<TraceEvent, { type: "done" }> => e.type === "done")
    .map((e) => name(e.beat));
}

/** What the player saw since `from`: mode, screen and layer, each time the beat on screen changed. */
function seen(w: World, from = 0): string[] {
  const out: string[] = [];
  for (const e of w.trace.slice(from)) {
    if (e.type !== "frame") continue;
    const f = e.flow;
    const shown = e.beats.find((b) => !isInstant(b));
    const s = f.screen;
    const inert = "inert" in s && s.inert ? "(inert)" : "";
    const stage = s.kind === "race" ? `:${s.stage}` : "";
    const line = `${f.mode} ${s.kind}${stage}${inert}${f.layer ? ` + ${f.layer.kind}` : ""} · ${shown ? name(shown) : "?"}`;
    if (out.at(-1) !== line) out.push(line);
  }
  return out;
}

/** End the beat in front as its timer or its tap would, until the game waits at idle (or `stop`). */
function play(w: World, stop?: (b: Beat) => boolean): void {
  for (let i = 0; i < 60; i++) {
    const top = w.now().flow.top;
    if (stop?.(top)) return;
    if (isInstant(top)) w.cmd.resolve(top);
    else if (top.kind === "scene") w.cmd.sceneDone(top.key, true);
    else if (top.kind === "emblem") {
      if (top.covered) w.cmd.complete(top.key);
      else w.cmd.covered(top.key);
    } else if (top.kind === "position") w.cmd.run();
    else if (top.kind === "replay" || top.kind === "finish") w.cmd.raceNext(top.key);
    else if (top.kind === "race-result") w.cmd.raceContinue();
    else if (top.kind === "idle" || top.kind === "event") return;
    else w.cmd.complete(top.key);
  }
  throw new Error(`no idle moment: ${label(w.now().flow.top)}`);
}

const world = (pace: Pace = "normal", reduced = false): World => createWorld({ pace, reduced });

describe("Appendix A: the expected sequences", () => {
  it("A.5 the season's start with parents: the prologue over the menu, then the inheritance card (D2)", () => {
    let w: World | undefined;
    for (let i = 1; i <= 20 && !w; i++) {
      const t = world();
      t.start("peregrina", `a5-${i}`, { parents: parents() });
      if (t.beats().some((b) => b.kind === "inspiration")) w = t;
    }
    if (!w) throw new Error(`no seed a5-1..a5-20 gives a start card with these parents: ${DRIFT}`);
    const from = w.trace.length - 1;
    play(w);
    expect(seen(w, from)).toEqual([
      "menu menu(inert) + scene · scene:peregrina-prologue@menu",
      "menu menu(inert) + inspiration · card:start",
      "menu menu · idle",
    ]);
    expect(ended(w)).toEqual(["scene:peregrina-prologue@menu", "card:start"]);
    // startMobile reads the week under the prologue: the HUD is there under every layer
    const frames = w.trace.filter((e) => e.type === "frame");
    expect(frames.every((e) => e.type === "frame" && e.flow.hud !== undefined)).toBe(true);
  });

  it("A.3 Peregrina's weeks 39 → 40: the effects, the card, first-vos, then the race mode with summit and the invitation", () => {
    const w = world();
    w.load("peregrina-w39-insp");
    // a week-40 action that wins (the invitation plays only then): searched among a few
    const s40 = advanceSeason(w.ctx(), w.now().facts.run.run.state, { kind: "rest" });
    const actions: (TrainingKind | "rest")[] = [
      "rest",
      "train:technique",
      "train:agility",
      "train:stamina",
    ];
    const positions: (Position | undefined)[] = [undefined, ...POSITIONS];
    const win = actions
      .flatMap((kind) => positions.map((position) => ({ kind, position })))
      .find(({ kind, position }) => {
        const input: WeekActionInput = { kind };
        const after = advanceSeason(w.ctx(), s40, position ? { ...input, position } : input);
        return after.raceResults.at(-1)?.place === 1;
      });
    if (!win) throw new Error(`no week-40 action wins from peregrina-w39-insp: ${DRIFT}`);
    const from = w.trace.length;
    w.cmd.choose({ kind: "rest" });
    play(w);
    expect(w.now().facts.run.run.state.turn).toBe(40);
    const week39 = ended(w, from);
    expect(week39.slice(-2)).toEqual(["card:inspiration", "scene:peregrina-first-vos@menu"]);
    expect(["fx:all", "ack"]).toContain(week39[0]);
    // week 40, the race week
    const at40 = w.trace.length;
    if (win.kind !== "rest") {
      w.cmd.open("train");
      w.cmd.selectTraining(win.kind);
    }
    w.cmd.choose({ kind: win.kind });
    play(w, (b) => b.kind === "position");
    w.cmd.position(win.position);
    play(w);
    const week40 = ended(w, at40).filter((b) => b !== "result" && b !== "fx:action");
    expect(week40).toEqual([
      "emblem",
      "scene:peregrina-summit@prerace",
      "position",
      "replay",
      "finish",
      "scene:peregrina-invitation@race",
      "race-result",
      ended(w).includes("fx:race") ? "fx:race" : "ack",
    ]);
    expect(seen(w, at40)).toEqual(
      expect.arrayContaining([
        "race black + emblem · emblem",
        "race position(inert) + scene · scene:peregrina-summit@prerace",
        "race position · position",
        "race race:replay · replay",
        "race race:finish · finish",
        "race race:held + scene · scene:peregrina-invitation@race",
        "race race:result · race-result",
      ]),
    );
    expect(w.now().facts.run.run.state.turn).toBe(41);
  });

  it("A.7 the non-race finale (F3): the last training's result at week 48, then its effects over the end", () => {
    const w = world();
    w.load("caracara-w48");
    const from = w.trace.length;
    w.cmd.open("train");
    w.cmd.selectTraining("train:technique");
    w.cmd.choose({ kind: "train:technique" });
    const result = w.now().flow;
    expect(result.top.kind).toBe("train-result");
    expect(result.hud?.of.turn).toBe(48);
    play(w);
    const lines = seen(w, from);
    expect(lines[0]).toBe("training train · idle");
    expect(lines.slice(1)).toEqual([
      "training train · result",
      ...(ended(w).includes("fx:all") ? ["end end(inert) + fx · fx:all"] : []),
      "end end · idle",
    ]);
    expect(w.trace.some((e) => e.type === "box")).toBe(true);
  });

  it("A.10 an injured week: no training's result, the «RECUPERACIÓN» effect over the menu, then the next week (O2)", () => {
    const w = world();
    w.load("injured");
    const turn = w.now().facts.run.run.state.turn;
    const from = w.trace.length;
    w.cmd.open("train");
    w.cmd.selectTraining("train:agility");
    w.cmd.choose({ kind: "train:agility" });
    const top = w.now().flow.top;
    expect(top.kind === "fx" && top.fx[0]?.kind).toBe("recovery");
    play(w);
    expect(seen(w, from)).toEqual([
      "training train · idle",
      "menu menu(inert) + fx · fx:all",
      "menu menu · idle",
    ]);
    expect(ended(w, from)).toEqual(["fx:all"]);
    expect(w.now().facts.run.run.state.turn).toBe(turn + 1);
  });

  it("the goal-failed path: the race, end-failed in the race mode before the result, the race's effects over the end", () => {
    const w = world();
    w.load("peregrina-w10-lose");
    const from = w.trace.length;
    w.cmd.choose({ kind: "rest" });
    const decided = w.trace.length;
    play(w, (b) => b.kind === "position");
    w.cmd.run();
    // the box is kept at «Correr», before the replay
    const box = w.trace.findIndex((e, i) => i >= decided && e.type === "box");
    const replay = w.trace.findIndex(
      (e, i) => i >= decided && e.type === "frame" && e.flow.top.kind === "replay",
    );
    expect(box).toBeGreaterThan(0);
    expect(box).toBeLessThan(replay);
    expect(w.now().flow.solo).toBe(false);
    play(w);
    const tail = ended(w, from).slice(ended(w, from).indexOf("position"));
    expect(tail).toEqual([
      "position",
      "replay",
      "finish",
      "scene:peregrina-end-failed@race",
      "race-result",
      ended(w).includes("fx:race") ? "fx:race" : "ack",
    ]);
    expect(seen(w, from)).toEqual(
      expect.arrayContaining([
        "race race:held + scene · scene:peregrina-end-failed@race",
        "race race:result · race-result",
        "end end · idle",
      ]),
    );
    expect(w.now().flow.solo).toBe(true);
  });

  it("A.4 Directo: no emblem and no replay; «Correr» opens on the result; «Ver otra vez» plays it with its hold", () => {
    const w = world("direct");
    w.load("peregrina-w10");
    const from = w.trace.length;
    w.cmd.open("train");
    w.cmd.selectTraining("train:technique");
    w.cmd.choose({ kind: "train:technique" });
    play(w, (b) => b.kind === "race-result");
    const done = ended(w, from);
    expect(done).toContain("enter");
    expect(done).not.toContain("emblem");
    expect(done).not.toContain("replay");
    const prerace = w.trace
      .slice(from)
      .find((e) => e.type === "frame" && e.flow.layer?.kind === "scene");
    expect(
      prerace?.type === "frame" &&
        prerace.flow.layer?.kind === "scene" &&
        prerace.flow.layer.digest,
    ).toEqual({
      ms: 650,
    });
    expect(done.slice(done.indexOf("position"))).toEqual([
      "position",
      "scene:peregrina-debut-win@race",
    ]);
    const watch = w.trace.length;
    w.cmd.raceAgain();
    for (const stage of ["replay", "finish"]) {
      const s = w.now().flow.screen;
      expect(s).toMatchObject({ kind: "race", stage, watch: "result" });
      if (s.kind === "race") w.cmd.raceNext(s.play);
    }
    expect(w.now().flow.screen).toMatchObject({ kind: "race", stage: "result" });
    w.cmd.raceContinue();
    play(w);
    expect(ended(w, watch)[0]).toBe("race-result");
    expect(["fx:race", "ack"]).toContain(ended(w, watch)[1]);
    expect(w.now().flow.canAct).toBe(true);
  });

  it("A.8 a reload after the preview: at stage action the action replays, then the emblem; nothing before it: a full cover", () => {
    // with a training's result: it replays after the reload, then the emblem fades in
    const w = world();
    w.load("peregrina-w10");
    w.cmd.open("train");
    w.cmd.selectTraining("train:technique");
    w.cmd.choose({ kind: "train:technique" });
    expect(w.now().flow.top.kind).toBe("train-result");
    w.reload();
    const from = w.trace.length;
    play(w, (b) => b.kind === "emblem");
    const emblem = w.now().flow.top;
    expect(ended(w, from)[0]).toBe("result");
    expect(emblem).toMatchObject({ kind: "emblem", fadeIn: true, covered: false });
    // nothing of the week before the emblem: it opens covered, black under it before the scene
    const bare = world();
    bare.load("peregrina-w10");
    const s = bare.now().facts.run.run.state;
    const frame = s.hangar.find((f) => f !== s.equippedFrame);
    if (!frame) throw new Error(`peregrina-w10 has one frame: ${DRIFT}`);
    bare.cmd.open("workshop");
    bare.cmd.choose({ kind: "workshop", ops: [{ op: "equip-frame", frameId: frame }] });
    const first = bare.beats()[0];
    if (first?.kind !== "emblem")
      throw new Error(`the equip-frame week has an action part: ${DRIFT}`);
    bare.reload();
    const restored = bare.now().flow;
    expect(restored.top).toMatchObject({ kind: "emblem", fadeIn: false, covered: true });
    expect(restored.screen).toEqual({ kind: "black" });
    expect(restored.hud).toBeDefined();
    // at stage race: no emblem, no way back; the scene not seen, then the same card
    play(bare, (b) => b.kind === "scene");
    bare.reload();
    expect(bare.now().flow.top.kind).toBe("scene");
    play(bare, (b) => b.kind === "position");
    bare.reload();
    const card = bare.now().flow;
    expect(card.top).toMatchObject({ kind: "position" });
    expect(card.top.kind === "position" && card.top.week.input).toEqual({
      kind: "workshop",
      ops: [{ op: "equip-frame", frameId: frame }],
    });
    expect(card.screen).toMatchObject({ kind: "position", inert: false });
  });

  it("A.9 «Ver otra vez» at any pace: the replay, its hold, the result, then the race's effects and the actions", () => {
    for (const pace of ["normal", "fast"] as const) {
      const w = world(pace);
      w.load("peregrina-w10");
      w.cmd.choose({ kind: "rest" });
      play(w, (b) => b.kind === "race-result");
      w.cmd.raceAgain();
      const stages: string[] = [];
      for (let i = 0; i < 3; i++) {
        const s = w.now().flow.screen;
        if (s.kind !== "race") break;
        stages.push(s.stage);
        if (s.stage === "result") break;
        w.cmd.raceNext(s.play);
      }
      expect(stages).toEqual(["replay", "finish", "result"]);
      w.cmd.raceContinue();
      expect(w.ui().nav).toEqual({ at: "menu" });
      play(w);
      const flow = w.now().flow;
      expect([flow.canAct, flow.screen.kind, flow.top.kind]).toEqual([true, "menu", "idle"]);
    }
  });
});
