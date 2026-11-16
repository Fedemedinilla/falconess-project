import { describe, expect, it } from "vitest";
import type { Pace } from "../pace";
import { isInstant } from "./beats";
import { type Commands, flowCommands } from "./commands";
import { deriveFlow } from "./derive";
import { type FlowPolicy, LEGACY_POLICY, TARGET_POLICY } from "./policy";
import { factsFor, loadSave, type TestGame, testGame } from "./testing/game";
import type { Beat, Flow, FlowFacts } from "./types";
import { INITIAL_UI, reduceUi, type UiEvent, type UiState } from "./ui";

/**
 * The flow's commands (plan §1.7) on a real game: each reads the flow as the tap found it, and
 * writes to the game, the stores and the UI state in that same call (critic (c)3); a stale key, a
 * second tap or a refused act changes nothing it should not.
 */

const HANGAR = ["shiden", "mule", "nimbus", "falke"];

/** The commands of one mount, on spied ports: every dispatch, cue and effective acknowledgement. */
function harness(t: TestGame, o: { readonly policy?: FlowPolicy; readonly pace?: Pace } = {}) {
  const policy = o.policy ?? TARGET_POLICY;
  let ui: UiState = INITIAL_UI;
  let last: Flow | undefined;
  const dispatched: { readonly e: UiEvent; readonly inputs: number }[] = [];
  const cues: string[] = [];
  let acks = 0;
  const inputs = (): number => t.game.getSnapshot().run?.inputs.length ?? 0;
  const now = (): { flow: Flow; facts: FlowFacts; ui: UiState } => {
    const facts = factsFor(t, o.pace === undefined ? {} : { pace: o.pace });
    const flow = deriveFlow(t.game.context(), facts, ui, policy, last);
    last = flow;
    return { flow, facts, ui };
  };
  const cmd: Commands = flowCommands({
    ctx: t.game.context(),
    game: {
      act: (input, expect) => t.game.act(input, expect),
      acknowledgeStep: () => {
        const was = t.game.getSnapshot().lastStepSeen;
        t.game.acknowledgeStep();
        if (!was && t.game.getSnapshot().lastStepSeen) acks += 1;
      },
      getSnapshot: t.game.getSnapshot,
    },
    weeks: t.weeks,
    story: t.story,
    cards: t.cards,
    sound: { cue: (c) => cues.push(c), nav: () => cues.push("nav") },
    policy,
    dispatch: (e) => {
      dispatched.push({ e, inputs: inputs() });
      ui = reduceUi(ui, e);
    },
    now,
  });
  /** Play the beats in front (as their timers and taps would) until one of `kinds` is the top. */
  const until = (...kinds: Beat["kind"][]): Flow => {
    for (let i = 0; i < 40; i++) {
      const { flow } = now();
      const top = flow.top;
      if (kinds.includes(top.kind)) return flow;
      if (isInstant(top)) cmd.resolve(top);
      else if (top.kind === "scene") cmd.sceneDone(top.key, true);
      else if (top.kind === "emblem" && !top.covered) cmd.covered(top.key);
      else if (top.kind === "position") cmd.run();
      else if (top.kind === "replay" || top.kind === "finish") cmd.raceNext(top.key);
      else if (top.kind === "race-result") cmd.raceContinue();
      else if (top.kind === "idle" || top.kind === "event") break;
      else cmd.complete(top.key);
    }
    throw new Error(`no ${kinds.join(" or ")} in front: ${now().flow.top.kind}`);
  };
  return {
    cmd,
    now,
    until,
    ui: () => ui,
    inputs,
    dispatched,
    cues,
    acks: () => acks,
  };
}

/** A new season of Peregrina's, its prologue already seen in another season (passed by). */
function started(seed: string): TestGame {
  const t = testGame();
  t.story.markSeen("earlier", "peregrina-prologue");
  t.game.start("peregrina", HANGAR, seed);
  return t;
}

describe("commands act and move the flow in the same call (critic (c)3)", () => {
  it("a normal week's action: the game moved on and the nav is the menu before the call returns", () => {
    const t = started("c1");
    const h = harness(t);
    h.until("idle");
    h.cmd.open("train");
    h.cmd.selectTraining("train:agility");
    expect(h.ui().nav).toEqual({ at: "train", selected: "train:agility" });
    const before = h.inputs();
    h.cmd.choose({ kind: "train:agility" });
    expect(h.inputs()).toBe(before + 1);
    expect(h.ui().nav).toEqual({ at: "menu" });
    // the nav changed by the dispatch that came after the act, inside the same tap
    const acted = h.dispatched.find((d) => d.e.type === "acted");
    expect(acted?.inputs).toBe(before + 1);
    // the training's sound plays inside the tap (iOS)
    expect(["success", "boost", "fail"]).toContain(h.cues.at(-1));
    expect(h.now().flow.top.kind).toBe("train-result");
  });

  it("a race week's action is decided, not committed: the record and the nav together", () => {
    const t = loadSave("peregrina-w10");
    const h = harness(t);
    const before = h.inputs();
    h.cmd.choose({ kind: "rest" });
    expect(h.inputs()).toBe(before);
    expect(t.weeks.getSnapshot()).toMatchObject({ phase: "decided", stage: "action" });
    expect(h.ui().mine.size).toBe(1);
    expect(h.cues.at(-1)).toBe("confirm");
  });

  it("a second «Correr» does not act", () => {
    const t = loadSave("peregrina-w10");
    const h = harness(t);
    h.cmd.choose({ kind: "rest" });
    h.until("position");
    const before = h.inputs();
    h.cmd.run();
    expect(h.inputs()).toBe(before + 1);
    expect(t.weeks.getSnapshot()).toBeUndefined();
    const count = h.dispatched.length;
    const snap = t.game.getSnapshot();
    h.cmd.run();
    expect(h.inputs()).toBe(before + 1);
    expect(t.game.getSnapshot()).toBe(snap);
    expect(h.dispatched.length).toBe(count);
  });

  it("a stale complete, raceSkip or raceNext changes nothing (F18)", () => {
    const t = loadSave("peregrina-w10");
    const h = harness(t);
    h.cmd.choose({ kind: "rest" });
    const w = t.weeks.getSnapshot();
    const fxKey = h.until("fx").top.key;
    h.cmd.complete(fxKey);
    const replay = h.until("replay").top.key;
    h.cmd.raceNext(replay);
    expect(h.now().flow.top.kind).toBe("finish");
    const ui = h.ui();
    const snap = t.game.getSnapshot();
    const weeks = t.weeks.getSnapshot();
    h.cmd.complete(fxKey); // the action's effects, long gone
    h.cmd.complete(replay); // the replay just ended
    h.cmd.raceNext(replay); // its timer, firing late
    h.cmd.raceSkip(replay); // «Saltar» on the replay, tapped late
    h.cmd.covered(`${w?.fp}/w:emblem`);
    h.cmd.sceneDone("scene:1:peregrina-debut", true);
    expect(h.ui()).toBe(ui);
    expect(t.game.getSnapshot()).toBe(snap);
    expect(t.weeks.getSnapshot()).toBe(weeks);
    expect(h.now().flow.top.kind).toBe("finish");
  });

  it("a refused preview writes no record and sets the notice (F7, C16)", () => {
    const t = loadSave("peregrina-w10");
    const h = harness(t);
    h.cmd.open("skills");
    const before = h.inputs();
    // no skill points yet: the workshop refuses
    h.cmd.choose({ kind: "workshop", ops: [{ op: "learn-skill", skillId: "clean-start" }] });
    expect(t.weeks.getSnapshot()).toBeUndefined();
    expect(h.ui().notice).toBe("workshop");
    expect(h.inputs()).toBe(before);
    expect(h.cues).toEqual(["nav"]);
    expect(h.now().flow.top.kind).toBe("idle");
  });

  it("resolve(ack) twice acknowledges once and always ends the beat (L9)", () => {
    const t = started("c2");
    const h = harness(t);
    h.until("idle");
    // a week with no effects: its step is read by an instant beat
    let top: Beat = h.now().flow.top;
    for (let week = 0; week < 12 && top.kind !== "ack"; week++) {
      h.cmd.choose({ kind: "train:technique" });
      top = h.until("ack", "idle").top;
    }
    if (top.kind !== "ack") throw new Error("no week without effects in 12");
    const acks = h.acks();
    h.cmd.resolve(top);
    h.cmd.resolve(top);
    expect(h.acks()).toBe(acks + 1);
    expect(t.game.getSnapshot().lastStepSeen).toBe(true);
    expect(h.ui().done.has(top.key)).toBe(true);
    // an ack of another run's step reads nothing, and still ends
    h.cmd.resolve({ kind: "ack", key: "another/ack" });
    expect(h.acks()).toBe(acks + 1);
    expect(h.ui().done.has("another/ack")).toBe(true);
  });
});

describe("watches end where they began (I21, review 1 item 1)", () => {
  it("«Ver otra vez» → «Saltar» → «Continuar»: the menu, and the actions take taps after the race's effects", () => {
    const t = loadSave("peregrina-w10");
    const h = harness(t);
    h.cmd.choose({ kind: "rest" });
    h.until("race-result");
    h.cmd.raceAgain();
    const nav = h.ui().nav;
    expect(nav).toMatchObject({ at: "watch", from: "result", stage: "replay" });
    const screen = h.now().flow.screen;
    expect(screen).toMatchObject({ kind: "race", stage: "replay", watch: "result" });
    if (screen.kind !== "race") return;
    h.cmd.raceSkip(screen.play);
    expect(h.now().flow.screen).toMatchObject({ kind: "race", stage: "result" });
    h.cmd.raceContinue();
    expect(h.ui().nav.at).toBe("menu");
    expect(h.now().flow.top.kind).not.toBe("race-result");
    const flow = h.until("idle");
    expect(flow.canAct).toBe(true);
    expect(flow.screen).toEqual({ kind: "menu", inert: false });
    expect(h.cues.filter((c) => c === "nav").length).toBe(2); // «Ver otra vez», «Continuar»
  });

  it("«Ver carrera» → its natural end twice → «Continuar»: the idle end again", () => {
    const t = loadSave("peregrina-ended");
    const h = harness(t);
    expect(h.now().flow.screen.kind).toBe("end");
    h.cmd.rewatch(10);
    expect(h.now().flow.screen).toMatchObject({ kind: "race", turn: 10, stage: "replay" });
    for (const stage of ["finish", "result"]) {
      const s = h.now().flow.screen;
      if (s.kind !== "race") throw new Error("no race screen");
      h.cmd.raceNext(s.play);
      expect(h.now().flow.screen).toMatchObject({ kind: "race", stage });
    }
    h.cmd.raceContinue();
    const flow = h.now().flow;
    expect([flow.top.kind, flow.screen.kind, h.ui().nav.at]).toEqual(["idle", "end", "menu"]);
  });

  it("legacy (until 6.3): no finish hold, a watch's replay ends on its result", () => {
    const t = loadSave("peregrina-ended");
    const h = harness(t, { policy: LEGACY_POLICY });
    h.cmd.rewatch(10);
    h.until("idle"); // the emblem over it (F25, until 5.1)
    const s = h.now().flow.screen;
    if (s.kind !== "race") throw new Error("no race screen");
    h.cmd.raceNext(s.play);
    expect(h.now().flow.screen).toMatchObject({ kind: "race", stage: "result" });
  });

  it("a watch and a back to the menu are only for idle moments", () => {
    const t = loadSave("peregrina-w10");
    const h = harness(t);
    h.cmd.open("train");
    h.cmd.selectTraining("train:technique");
    h.cmd.choose({ kind: "train:technique" });
    const card = h.until("position");
    const ui = h.ui();
    h.cmd.open("menu"); // the decided card has no way back
    h.cmd.rewatch(10);
    h.cmd.raceAgain();
    expect(h.ui()).toBe(ui);
    expect(h.now().flow.top).toBe(card.top);
  });
});
