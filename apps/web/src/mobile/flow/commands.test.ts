import { describe, expect, it } from "vitest";
import type { Pace } from "../pace";
import { isInstant } from "./beats";
import { type Commands, flowCommands } from "./commands";
import { deriveFlow } from "./derive";
import { parents } from "./testing/bots";
import { factsFor, fpOf, loadSave, runOf, type TestGame, testGame } from "./testing/game";
import type { Beat, Flow, FlowFacts } from "./types";
import { INITIAL_UI, reduceUi, type UiEvent, type UiState } from "./ui";

/**
 * The flow's commands (plan §1.7) on a real game: each reads the flow as the tap found it, and
 * writes to the game, the stores and the UI state in that same call (critic (c)3); a stale key, a
 * second tap or a refused act changes nothing it should not.
 */

const HANGAR = ["shiden", "mule", "nimbus", "falke"];

/** The commands of one mount, on spied ports: every dispatch, cue and effective acknowledgement. */
function harness(
  t: TestGame,
  o: {
    readonly pace?: Pace;
    /** What the commands read in place of the flow derived (a state no tap reaches today). */
    readonly over?: (flow: Flow) => Flow;
  } = {},
) {
  let ui: UiState = INITIAL_UI;
  let last: Flow | undefined;
  const dispatched: { readonly e: UiEvent; readonly inputs: number }[] = [];
  const cues: string[] = [];
  let acks = 0;
  const inputs = (): number => t.game.getSnapshot().run?.inputs.length ?? 0;
  const now = (): { flow: Flow; facts: FlowFacts; ui: UiState } => {
    const facts = factsFor(t, o.pace === undefined ? {} : { pace: o.pace });
    const derived = deriveFlow(t.game.context(), facts, ui, last);
    last = derived;
    return { flow: o.over ? o.over(derived) : derived, facts, ui };
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

  it("«Correr» acts and opens the race in the same call; a second «Correr» does not act", () => {
    const t = loadSave("peregrina-w10");
    const h = harness(t);
    h.cmd.choose({ kind: "rest" });
    h.until("position");
    const before = h.inputs();
    h.cmd.run();
    expect(h.inputs()).toBe(before + 1);
    // the record says «Correr» ran the race of the run it led to: a reload plays it on
    expect(t.weeks.getSnapshot()).toEqual({ phase: "raced", fp: fpOf(t) });
    expect(h.now().flow.top.kind).toBe("replay");
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
    expect(h.ui().notice?.kind).toBe("workshop");
    expect(h.inputs()).toBe(before);
    expect(h.cues).toEqual(["nav"]);
    expect(h.now().flow.top.kind).toBe("idle");
  });

  it("a scene skipped and one passed by are marked seen and show nothing (owner 2026-11-18)", () => {
    // her prologue was seen in another season: the `pass` beat marks it and ends, saying nothing
    const t = started("c3");
    const h = harness(t);
    h.until("idle");
    const seed = t.game.getSnapshot().run?.seed ?? "";
    expect(t.story.seenEver().has("peregrina-prologue")).toBe(true);
    expect(t.story.seenInRun(seed).has("peregrina-prologue")).toBe(true);
    // a scene played and skipped: marked seen, and nothing in its place
    let scenes = 0;
    for (let week = 0; week < 20 && scenes === 0; week++) {
      h.cmd.choose({ kind: "train:agility" });
      const top = h.until("scene", "idle").top;
      if (top.kind !== "scene") continue;
      scenes += 1;
      h.cmd.sceneDone(top.key, true);
      expect(t.story.seenEver().has(top.scene.id)).toBe(true);
    }
    expect(scenes).toBe(1);
    expect(h.dispatched.filter((d) => /toast|aviso/i.test(d.e.type))).toEqual([]);
    expect(h.ui().notice).toBeUndefined();
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
    // a stale ack (last week's, its effect firing late) never reads the next week's step
    h.until("idle");
    h.cmd.choose({ kind: "rest" });
    expect(t.game.getSnapshot().lastStepSeen).toBe(false);
    h.cmd.resolve(top);
    expect(t.game.getSnapshot().lastStepSeen).toBe(false);
    expect(h.acks()).toBe(acks + 1);
  });
});

describe("the commands' own guards (F27, rule 50): a tap that is not the moment's does nothing (final review C6)", () => {
  it("an action chosen on the decided card (a stale tap of the menu) decides nothing again", () => {
    const t = loadSave("peregrina-w10");
    const h = harness(t);
    h.cmd.choose({ kind: "rest" });
    const card = h.until("position");
    const record = t.weeks.getSnapshot();
    const ui = h.ui();
    const before = h.inputs();
    h.cmd.choose({ kind: "train:agility" });
    expect(t.weeks.getSnapshot()).toBe(record);
    expect(h.ui()).toBe(ui);
    expect(h.inputs()).toBe(before);
    expect(h.now().flow.top).toBe(card.top);
  });

  it("«Correr» while a layer is in front of the decided card does not run the race", () => {
    const t = loadSave("peregrina-w10");
    const first = harness(t);
    first.cmd.choose({ kind: "rest" });
    first.until("position");
    // a new mount on the decided week (stage race: the card at once), with a layer in front
    const h = harness(t, {
      over: (flow) => ({ ...flow, layer: { kind: "event", key: "event:any/10" } }),
    });
    expect(h.now().flow.top.kind).toBe("position");
    const before = h.inputs();
    const record = t.weeks.getSnapshot();
    h.cmd.run();
    expect(h.inputs()).toBe(before);
    expect(t.weeks.getSnapshot()).toBe(record);
  });
});

describe("what the commands keep (plan §1.8): a new mount on the same storage plays on", () => {
  it("the planning card's pick is kept and carried into the decision; «Correr» commits the decided card's pick (D3, F22)", () => {
    const t = loadSave("peregrina-w10");
    const h = harness(t);
    const fp = fpOf(t);
    h.cmd.open("plan");
    h.cmd.position("lead");
    expect(t.weeks.getSnapshot()).toEqual({ phase: "planned", fp, turn: 10, position: "lead" });
    h.cmd.position("closer");
    expect(t.weeks.getSnapshot()).toMatchObject({ phase: "planned", position: "closer" });
    h.cmd.open("menu"); // «Elegir la acción»
    h.cmd.choose({ kind: "rest" });
    expect(t.weeks.getSnapshot()).toMatchObject({ phase: "decided", position: "closer" });
    const card = h.until("position").top;
    expect(card.kind === "position" && card.week.position).toBe("closer");
    h.cmd.position("pack");
    expect(t.weeks.getSnapshot()).toMatchObject({ phase: "decided", position: "pack" });
    h.cmd.run();
    expect(t.game.getSnapshot().lastStep?.input).toEqual({ kind: "rest", position: "pack" });
  });

  it("the race mode begun is kept: after the emblem, or straight in on Directo, no action part again (O1)", () => {
    for (const pace of ["normal", "direct"] as const) {
      const t = loadSave("peregrina-w10");
      const h = harness(t, { pace });
      h.cmd.open("train");
      h.cmd.selectTraining("train:technique");
      h.cmd.choose({ kind: "train:technique" });
      expect(h.now().flow.top.kind).toBe("train-result");
      expect(h.until("scene").top).toMatchObject({ scene: { id: "peregrina-debut" } });
      expect(t.weeks.getSnapshot()).toMatchObject({ phase: "decided", stage: "race" });
      // a reload: the scene not seen yet, then the card; never the result or the emblem again
      const again = harness(t, { pace });
      expect(again.now().flow.top).toMatchObject({ kind: "scene", where: "prerace" });
    }
  });

  it("a race's result seen is kept: a new mount plays the race's effects, not the race again", () => {
    const t = loadSave("peregrina-w10");
    const h = harness(t);
    h.cmd.choose({ kind: "rest" });
    h.until("race-result");
    const fp = fpOf(t);
    h.cmd.raceContinue();
    expect(t.weeks.getSnapshot()).toEqual({ phase: "raceSeen", fp });
    const again = harness(t).now().flow;
    expect([again.mode, again.top.kind === "fx" || again.top.kind === "ack"]).toEqual([
      "menu",
      true,
    ]);
  });

  it("an inheritance card shown is kept: a new mount does not show it again (D2, F19)", () => {
    let found: { t: TestGame; key: string } | undefined;
    for (let i = 1; i <= 20 && !found; i++) {
      const t = testGame();
      t.game.start("peregrina", HANGAR, `a5-${i}`, undefined, parents());
      const top = harness(t).until("inspiration", "idle").top;
      if (top.kind === "inspiration") found = { t, key: top.key };
    }
    if (!found) throw new Error("no seed a5-1..a5-20 gives a start card with these parents");
    const { t, key } = found;
    const h = harness(t);
    expect(h.until("inspiration").top.key).toBe(key);
    h.cmd.complete(key);
    expect(t.cards.shown(runOf(t).seed).size).toBe(1);
    expect(harness(t).until("inspiration", "idle").top.kind).toBe("idle");
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

  it("«Ver otra vez» on a watch's result: the race again, ending where the watch began", () => {
    // from a race's result: the menu after it, the actions take taps
    const t = loadSave("peregrina-w10");
    const h = harness(t);
    h.cmd.choose({ kind: "rest" });
    h.until("race-result");
    h.cmd.raceAgain();
    const first = h.ui().nav;
    let s = h.now().flow.screen;
    if (s.kind !== "race" || first.at !== "watch") throw new Error("no watch");
    h.cmd.raceSkip(s.play);
    expect(h.now().flow.screen).toMatchObject({ kind: "race", stage: "result" });
    h.cmd.raceAgain();
    const again = h.ui().nav;
    expect(again).toMatchObject({ at: "watch", turn: 10, from: "result", stage: "replay" });
    expect(again.at === "watch" && again.n > first.n).toBe(true);
    s = h.now().flow.screen;
    expect(s).toMatchObject({ kind: "race", stage: "replay", watch: "result" });
    if (s.kind === "race") h.cmd.raceSkip(s.play);
    h.cmd.raceContinue();
    expect(h.ui().nav.at).toBe("menu");
    expect(h.until("idle").canAct).toBe(true);
    // from the end: the end again
    const e = loadSave("peregrina-ended");
    const he = harness(e);
    he.cmd.rewatch(10);
    s = he.now().flow.screen;
    if (s.kind === "race") he.cmd.raceSkip(s.play);
    he.cmd.raceAgain();
    const flow = he.now().flow;
    expect(flow.top.kind).toBe("idle");
    expect(flow.screen).toMatchObject({ kind: "race", turn: 10, stage: "replay", watch: "end" });
    if (flow.screen.kind === "race") he.cmd.raceSkip(flow.screen.play);
    he.cmd.raceContinue();
    const end = he.now().flow;
    expect([end.top.kind, end.screen.kind, he.ui().nav.at]).toEqual(["idle", "end", "menu"]);
  });

  it("a watch's replay ends on its finish hold, then its result (6.3: it went straight to the result)", () => {
    const t = loadSave("peregrina-ended");
    const h = harness(t);
    h.cmd.rewatch(10);
    for (const stage of ["finish", "result"]) {
      const s = h.now().flow.screen;
      if (s.kind !== "race") throw new Error("no race screen");
      h.cmd.raceNext(s.play);
      expect(h.now().flow.screen).toMatchObject({ kind: "race", stage });
    }
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
