import type { Position } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import type { WeekActionInput } from "../../screens/model/position";
import type { Pace } from "../pace";
import { beatsOf } from "./beats";
import { type FlowPolicy, LEGACY_POLICY, TARGET_POLICY } from "./policy";
import {
  commit,
  decide,
  factsFor,
  fpOf,
  loadSave,
  race,
  stateOf,
  type TestGame,
  testGame,
  uiAfter as ui,
} from "./testing/game";
import type { Beat } from "./types";
import { INITIAL_UI, reduceUi, type UiState } from "./ui";
import { raceWings } from "./week";

/**
 * The beat queue (plan §1.4, §1.5) on real games: a `GameController` on a memory store, the seeded
 * saves of the phone e2e (impl-log 1.2's facts). Every situation under both policies: LEGACY is
 * today's MobileGame (the oracle 4.1 wires), TARGET the designed order.
 */

const HANGAR = ["shiden", "mule", "nimbus", "falke"];

/** One beat, short: its kind and what tells it apart. */
function label(b: Beat): string {
  switch (b.kind) {
    case "train-result":
      return `result:${b.result.outcome}`;
    case "fx":
      return `fx:${b.part}:${b.fx.map((x) => x.kind).join("+")}`;
    case "scene":
      return `scene:${b.scene.id}@${b.where}`;
    case "pass":
      return `pass:${b.scene.id}`;
    case "inspiration":
      return `card:${b.card.key}`;
    case "emblem":
      return `emblem${b.covered ? ":covered" : ""}${b.fadeIn ? "" : ":cut"}`;
    default:
      return b.kind;
  }
}

type Page = { readonly pace?: Pace; readonly reduced?: boolean };

const beats = (t: TestGame, ui: UiState, p: FlowPolicy, page: Page = {}) =>
  beatsOf(t.game.context(), factsFor(t, page), ui, p);
const queue = (t: TestGame, ui: UiState, p: FlowPolicy, page: Page = {}) =>
  beats(t, ui, p, page).map(label);

const parents = () => {
  const start = loadSave("peregrina-w39-insp").game.getSnapshot().run?.inputs[0];
  if (start?.kind !== "start" || start.parents.length === 0) throw new Error("no parents");
  return start.parents;
};

describe("the season's start", () => {
  it("without parents: the prologue, then the menu", () => {
    const t = testGame();
    t.game.start("peregrina", HANGAR, "s1");
    for (const p of [LEGACY_POLICY, TARGET_POLICY])
      expect(queue(t, INITIAL_UI, p)).toEqual(["scene:peregrina-prologue@menu", "idle"]);
    expect(beats(t, INITIAL_UI, TARGET_POLICY)[0]?.key).toBe("scene:s1:peregrina-prologue");
  });

  it("with parents: the prologue, then the start's card (D2; it used to come first, C9)", () => {
    const t = testGame();
    t.game.start("peregrina", HANGAR, "s2", undefined, parents());
    for (const p of [LEGACY_POLICY, TARGET_POLICY])
      expect(queue(t, INITIAL_UI, p)).toEqual([
        "scene:peregrina-prologue@menu",
        "card:s2:start",
        "idle",
      ]);
    expect(beats(t, INITIAL_UI, TARGET_POLICY)[1]?.key).toBe("insp:s2:start");
    // shown once: the inheritance store remembers it
    t.cards.markShown("s2", "s2:start");
    for (const p of [LEGACY_POLICY, TARGET_POLICY])
      expect(queue(t, INITIAL_UI, p)).toEqual(["scene:peregrina-prologue@menu", "idle"]);
  });

  it("a prologue seen in an earlier season is passed by (an instant beat), in the same place", () => {
    const t = testGame();
    t.story.markSeen("earlier", "peregrina-prologue");
    t.game.start("peregrina", HANGAR, "s3", undefined, parents());
    for (const p of [LEGACY_POLICY, TARGET_POLICY])
      expect(queue(t, INITIAL_UI, p)).toEqual(["pass:peregrina-prologue", "card:s3:start", "idle"]);
    const plain = testGame();
    plain.story.markSeen("earlier", "peregrina-prologue");
    plain.game.start("peregrina", HANGAR, "s4");
    for (const p of [LEGACY_POLICY, TARGET_POLICY])
      expect(queue(plain, INITIAL_UI, p)).toEqual(["pass:peregrina-prologue", "idle"]);
  });
});

describe("a normal week", () => {
  const started = (seed: string): TestGame => {
    const t = testGame();
    t.game.start("peregrina", HANGAR, seed);
    t.story.markSeen(seed, "peregrina-prologue");
    return t;
  };

  it("with effects: the effects over the menu, then the menu", () => {
    const t = started("s1");
    const mine = commit(t, { kind: "rest" });
    const fp = fpOf(t);
    for (const p of [LEGACY_POLICY, TARGET_POLICY]) {
      expect(queue(t, mine, p)).toEqual(["fx:all:sleep-poor", "idle"]);
      expect(beats(t, mine, p).map((b) => b.key)).toEqual([`${fp}/fx`, `idle:${fp}`]);
    }
    // the effects are read: the step is acknowledged
    t.game.acknowledgeStep();
    for (const p of [LEGACY_POLICY, TARGET_POLICY]) expect(queue(t, mine, p)).toEqual(["idle"]);
  });

  it("without effects: a training's result, then the step is read at once (ack)", () => {
    const t = started("s1");
    const mine = commit(t, { kind: "train:agility" });
    for (const p of [LEGACY_POLICY, TARGET_POLICY])
      expect(queue(t, mine, p)).toEqual(["result:boost", "ack", "idle"]);
    // done in this mount: the result does not play again
    const done = reduceUi(mine, { type: "done", keys: [`${fpOf(t)}/result`] });
    expect(queue(t, done, TARGET_POLICY)).toEqual(["ack", "idle"]);
  });

  it("committed before this mount (a reload): the result plays again while its week is unread (O1)", () => {
    const t = started("s1");
    commit(t, { kind: "train:agility" });
    for (const p of [LEGACY_POLICY, TARGET_POLICY])
      expect(queue(t, INITIAL_UI, p)).toEqual(["result:boost", "ack", "idle"]);
    t.game.acknowledgeStep();
    for (const p of [LEGACY_POLICY, TARGET_POLICY])
      expect(queue(t, INITIAL_UI, p)).toEqual(["idle"]);
  });

  it("an injured week's training rested by rule: no training's result, the recovery effect (F4, O2)", () => {
    const t = loadSave("injured");
    expect(stateOf(t).injuryTurns).toBeGreaterThan(0);
    const before = stateOf(t);
    const mine = commit(t, { kind: "train:agility" });
    const mood = stateOf(t).mood - before.mood;
    const fx = ["recovery", ...(mood > 0 ? ["mood-up"] : mood < 0 ? ["mood-down"] : [])];
    for (const p of [LEGACY_POLICY, TARGET_POLICY])
      expect(queue(t, mine, p)).toEqual([`fx:all:${fx.join("+")}`, "idle"]);
  });

  it("the week before an inspiration (39 → 40): effects → card → scene (D2; the card came first, C10)", () => {
    const t = loadSave("peregrina-w39-insp");
    const mine = commit(t, { kind: "rest" });
    for (const p of [LEGACY_POLICY, TARGET_POLICY])
      expect(queue(t, mine, p)).toEqual([
        "fx:all:sleep-normal",
        "card:1:40",
        "scene:peregrina-first-vos@menu",
        "idle",
      ]);
    // once the step is read the card stays until it is shown (it was lost then, F19), and a mount
    // that did not commit the step (a reload) shows it too
    t.game.acknowledgeStep();
    for (const ui of [mine, INITIAL_UI])
      for (const p of [LEGACY_POLICY, TARGET_POLICY])
        expect(queue(t, ui, p)).toEqual(["card:1:40", "scene:peregrina-first-vos@menu", "idle"]);
    t.cards.markShown("1", "1:40");
    expect(queue(t, mine, TARGET_POLICY)).toEqual(["scene:peregrina-first-vos@menu", "idle"]);
  });

  it("two unseen weeks' scenes: one at a time, by week, not by file name (F13)", () => {
    const full = loadSave("peregrina-w39-insp");
    const historia = [...full.story.seenEver()].filter(
      (id) => id !== "peregrina-tears" && id !== "peregrina-rookie",
    );
    const t = loadSave("peregrina-w39-insp", historia);
    for (const p of [LEGACY_POLICY, TARGET_POLICY])
      expect(queue(t, INITIAL_UI, p)).toEqual([
        "scene:peregrina-tears@menu",
        "scene:peregrina-rookie@menu",
        "idle",
      ]);
    t.story.markSeen("1", "peregrina-tears");
    for (const p of [LEGACY_POLICY, TARGET_POLICY])
      expect(queue(t, INITIAL_UI, p)).toEqual(["scene:peregrina-rookie@menu", "idle"]);
  });

  it("the planning card's nav adds nothing to the queue, on a race week or not", () => {
    const t = started("s1");
    const plan = ui({ type: "open", to: "plan" });
    for (const p of [LEGACY_POLICY, TARGET_POLICY]) expect(queue(t, plan, p)).toEqual(["idle"]);
    const w10 = loadSave("peregrina-w10");
    for (const p of [LEGACY_POLICY, TARGET_POLICY]) expect(queue(w10, plan, p)).toEqual(["idle"]);
  });
});

describe("a decided race week (C: the action's part, the race mode up to «Correr»)", () => {
  const paces: readonly { readonly name: string; readonly page: Page; readonly emblem: boolean }[] =
    [
      { name: "Normal", page: { pace: "normal" }, emblem: true },
      { name: "Rápido", page: { pace: "fast" }, emblem: true },
      { name: "Directo", page: { pace: "direct" }, emblem: false },
      { name: "reduced motion", page: { reduced: true }, emblem: false },
    ];
  const cases: readonly {
    readonly name: string;
    readonly save: string;
    readonly input: WeekActionInput;
    readonly from: "menu" | "train" | "workshop";
    readonly action: readonly string[];
    readonly scene: string;
    /** The position the card preselects: her wings' after the action (F5). */
    readonly wings: Position;
  }[] = [
    {
      name: "a training",
      save: "peregrina-w10",
      input: { kind: "train:technique" },
      from: "train",
      action: ["result:success"],
      scene: "peregrina-debut",
      wings: "closer",
    },
    {
      name: "a rest",
      save: "peregrina-w10",
      input: { kind: "rest" },
      from: "menu",
      action: ["fx:action:sleep-normal"],
      scene: "peregrina-debut",
      wings: "closer",
    },
    {
      name: "a workshop that learns a skill",
      save: "peregrina-w48",
      input: { kind: "workshop", ops: [{ op: "learn-skill", skillId: "clean-start" }] },
      from: "workshop",
      action: ["fx:action:skills"],
      scene: "peregrina-long",
      wings: "closer",
    },
    {
      name: "a workshop that swaps the wings",
      save: "peregrina-w10",
      input: { kind: "workshop", ops: [{ op: "equip-frame", frameId: "mule" }] },
      from: "workshop",
      action: [],
      scene: "peregrina-debut",
      // Mule's ground wings race in the pack: the card follows them, not the dive wings (F5)
      wings: "pack",
    },
  ];

  for (const c of cases)
    it(`${c.name} × Normal, Rápido, Directo, reduced motion: same queue under both policies`, () => {
      const t = loadSave(c.save);
      const mine = decide(t, c.input, c.from);
      const fp = fpOf(t);
      for (const { page, emblem } of paces) {
        const expected = [
          ...c.action,
          emblem ? "emblem" : "enter",
          `scene:${c.scene}@prerace`,
          "position",
        ];
        for (const p of [LEGACY_POLICY, TARGET_POLICY]) {
          const queued = beats(t, mine, p, page);
          expect(queued.map(label)).toEqual(expected);
          // keyed by the run before the commit
          for (const b of queued)
            if (b.kind !== "scene") expect(b.key.startsWith(`${fp}/w:`)).toBe(true);
          const card = queued.at(-1);
          expect(card?.kind === "position" && card.week).toBe(t.weeks.getSnapshot());
          expect(card?.kind === "position" && card.wings).toBe(c.wings);
          expect(c.wings).toBe(raceWings(t.game.context(), stateOf(t), c.input));
        }
      }
    });

  it("the emblem rises over this mount's week (fade in), covers once it is opaque, then the race mode", () => {
    const t = loadSave("peregrina-w10");
    const mine = decide(t, { kind: "rest" });
    const fp = fpOf(t);
    const after = (u: UiState, ...keys: string[]) =>
      reduceUi(u, { type: "done", keys: keys.map((k) => `${fp}/w:${k}`) });
    const fxDone = after(mine, "fx");
    for (const p of [LEGACY_POLICY, TARGET_POLICY]) {
      expect(queue(t, fxDone, p)).toEqual(["emblem", "scene:peregrina-debut@prerace", "position"]);
      expect(queue(t, after(fxDone, "emblem:in"), p)[0]).toBe("emblem:covered");
    }
    // the emblem done: the race mode began (the record's stage), its action's part never again
    t.weeks.enterRace(fp);
    for (const p of [LEGACY_POLICY, TARGET_POLICY])
      expect(queue(t, INITIAL_UI, p)).toEqual(["scene:peregrina-debut@prerace", "position"]);
  });

  it("restored at stage action: fresh opens on a full cover; once its result played, it fades in", () => {
    // a swap of wings: no result and no effects, so the emblem is the first beat (review 1 item 12)
    const swap = loadSave("peregrina-w10");
    decide(swap, { kind: "workshop", ops: [{ op: "equip-frame", frameId: "mule" }] });
    for (const p of [LEGACY_POLICY, TARGET_POLICY])
      expect(queue(swap, INITIAL_UI, p)).toEqual([
        "emblem:covered:cut",
        "scene:peregrina-debut@prerace",
        "position",
      ]);
    const trained = loadSave("peregrina-w10");
    decide(trained, { kind: "train:technique" });
    const fp = fpOf(trained);
    for (const p of [LEGACY_POLICY, TARGET_POLICY]) {
      expect(queue(trained, INITIAL_UI, p).slice(0, 2)).toEqual([
        "result:success",
        "emblem:covered:cut",
      ]);
      const played = reduceUi(INITIAL_UI, { type: "done", keys: [`${fp}/w:result`] });
      expect(queue(trained, played, p)[0]).toBe("emblem");
    }
    // a rest: no result, its effects first; once they played again, it fades in over the menu
    const rested = loadSave("peregrina-w10");
    decide(rested, { kind: "rest" });
    const rfp = fpOf(rested);
    for (const p of [LEGACY_POLICY, TARGET_POLICY]) {
      expect(queue(rested, INITIAL_UI, p)[0]).toMatch(/^fx:action:/);
      const played = reduceUi(INITIAL_UI, { type: "done", keys: [`${rfp}/w:fx`] });
      expect(queue(rested, played, p)[0]).toBe("emblem");
    }
  });

  it("restored at stage race: no emblem, the scene if unseen, the card", () => {
    const t = loadSave("peregrina-w10");
    decide(t, { kind: "train:technique" });
    t.weeks.enterRace(fpOf(t));
    for (const p of [LEGACY_POLICY, TARGET_POLICY])
      expect(queue(t, INITIAL_UI, p)).toEqual(["scene:peregrina-debut@prerace", "position"]);
    t.story.markSeen("1", "peregrina-debut");
    for (const p of [LEGACY_POLICY, TARGET_POLICY])
      expect(queue(t, INITIAL_UI, p)).toEqual(["position"]);
  });

  it("planned, then decided: the planning card adds no beat; the decided card keeps the planned position", () => {
    const t = loadSave("peregrina-w10");
    const fp = fpOf(t);
    t.weeks.plan(fp, 10, "lead");
    for (const p of [LEGACY_POLICY, TARGET_POLICY])
      expect(queue(t, INITIAL_UI, p)).toEqual(["idle"]);
    const mine = decide(t, { kind: "rest" }, "menu", "lead");
    for (const p of [LEGACY_POLICY, TARGET_POLICY]) {
      const card = beats(t, mine, p).at(-1);
      expect(card?.kind === "position" && card.week.position).toBe("lead");
    }
  });
});

describe("a committed race (C after «Correr»)", () => {
  const raced = (save = "peregrina-w10"): { t: TestGame; mine: UiState } => {
    const t = loadSave(save);
    decide(t, { kind: "rest" });
    return { t, mine: race(t, { kind: "rest" }) };
  };

  it("with an after-scene: the replay, (the finish hold), the scene, the result, the race's effects", () => {
    const { t, mine } = raced();
    const fp = fpOf(t);
    expect(queue(t, mine, LEGACY_POLICY)).toEqual([
      "replay",
      "scene:peregrina-debut-win@race",
      "race-result",
      "fx:race:points",
      "idle",
    ]);
    expect(queue(t, mine, TARGET_POLICY)).toEqual([
      "replay",
      "finish",
      "scene:peregrina-debut-win@race",
      "race-result",
      "fx:race:points",
      "idle",
    ]);
    // keyed by the run after the commit
    expect(beats(t, mine, TARGET_POLICY).map((b) => b.key)).toEqual([
      `${fp}/race:replay`,
      `${fp}/race:finish`,
      "scene:1:peregrina-debut-win",
      `${fp}/race:result`,
      `${fp}/fx`,
      `idle:${fp}`,
    ]);
    const fx = beats(t, mine, TARGET_POLICY).find((b) => b.kind === "fx");
    expect(fx?.kind === "fx" && fx.landed).toBe(true);
  });

  it("without an after-scene (seen): the replay, (the finish), the result", () => {
    const { t, mine } = raced();
    t.story.markSeen("1", "peregrina-debut-win");
    expect(queue(t, mine, LEGACY_POLICY)).toEqual([
      "replay",
      "race-result",
      "fx:race:points",
      "idle",
    ]);
    expect(queue(t, mine, TARGET_POLICY)).toEqual([
      "replay",
      "finish",
      "race-result",
      "fx:race:points",
      "idle",
    ]);
  });

  it("under Directo: no replay and no finish, the race opens on its result", () => {
    const { t, mine } = raced();
    for (const p of [LEGACY_POLICY, TARGET_POLICY])
      expect(queue(t, mine, p, { pace: "direct" })).toEqual([
        "scene:peregrina-debut-win@race",
        "race-result",
        "fx:race:points",
        "idle",
      ]);
  });

  it("its result seen (raceSeen): straight to the race's effects on the menu", () => {
    const { t, mine } = raced();
    t.story.markSeen("1", "peregrina-debut-win");
    t.weeks.markRaceSeen(fpOf(t));
    for (const p of [LEGACY_POLICY, TARGET_POLICY])
      expect(queue(t, mine, p)).toEqual(["fx:race:points", "idle"]);
  });

  it("committed before this mount (a reload): the race again, its scene in the race mode (O1)", () => {
    const { t } = raced();
    expect(t.weeks.getSnapshot()).toEqual({ phase: "raced", fp: fpOf(t) });
    const again = (p: FlowPolicy) => [
      "replay",
      ...(p.finishHold ? ["finish"] : []),
      "scene:peregrina-debut-win@race",
      "race-result",
      "fx:race:points",
      "idle",
    ];
    for (const p of [LEGACY_POLICY, TARGET_POLICY])
      expect(queue(t, INITIAL_UI, p)).toEqual(again(p));
    // a reload mid-race under an older build left no record: the season goes on, so the race too
    t.weeks.clear();
    for (const p of [LEGACY_POLICY, TARGET_POLICY])
      expect(queue(t, INITIAL_UI, p)).toEqual(again(p));
    // its result seen: the race's effects on the menu
    t.weeks.markRaceSeen(fpOf(t));
    t.story.markSeen("1", "peregrina-debut-win");
    for (const p of [LEGACY_POLICY, TARGET_POLICY])
      expect(queue(t, INITIAL_UI, p)).toEqual(["fx:race:points", "idle"]);
  });

  it("a step read elsewhere (the test view): the after-scene is left over for the menu", () => {
    const { t, mine } = raced();
    t.game.acknowledgeStep();
    for (const p of [LEGACY_POLICY, TARGET_POLICY])
      expect(queue(t, mine, p)).toEqual(["scene:peregrina-debut-win@menu", "idle"]);
  });
});

describe("the season's end (D, F3)", () => {
  it("a goal failed in a race: its ending scene in the race mode, once, then the race's effects over the end", () => {
    const t = loadSave("peregrina-w10-lose");
    decide(t, { kind: "rest" });
    const mine = race(t, { kind: "rest" });
    expect(stateOf(t).endReason).toBe("goal-failed");
    expect(queue(t, mine, LEGACY_POLICY)).toEqual([
      "replay",
      "scene:peregrina-end-failed@race",
      "race-result",
      "fx:race:points",
      "idle",
    ]);
    expect(queue(t, mine, TARGET_POLICY)).toEqual([
      "replay",
      "finish",
      "scene:peregrina-end-failed@race",
      "race-result",
      "fx:race:points",
      "idle",
    ]);
  });

  it("a finale that is no race (Caracara's week 48): its training's result first, then the end (no effects: read at once)", () => {
    const t = loadSave("caracara-w48");
    const mine = commit(t, { kind: "train:technique" });
    expect(stateOf(t).status).toBe("ended");
    for (const p of [LEGACY_POLICY, TARGET_POLICY])
      expect(queue(t, mine, p)).toEqual(["result:success", "ack", "idle"]);
  });

  it("the race finale (Peregrina's week 48): the race mode plays out, its effects over the end, then the end", () => {
    const t = loadSave("peregrina-w48");
    decide(t, { kind: "rest" });
    const mine = race(t, { kind: "rest" });
    expect(stateOf(t).status).toBe("ended");
    expect(queue(t, mine, LEGACY_POLICY)).toEqual([
      "replay",
      "scene:peregrina-long-lost@race",
      "race-result",
      "fx:race:mood-up+points",
      "idle",
    ]);
    expect(queue(t, mine, TARGET_POLICY)).toEqual([
      "replay",
      "finish",
      "scene:peregrina-long-lost@race",
      "race-result",
      "fx:race:mood-up+points",
      "idle",
    ]);
  });

  it("the race finale committed before this mount (a reload): the race again only while the record says «Correr» ran it", () => {
    const t = loadSave("peregrina-w48");
    decide(t, { kind: "rest" });
    race(t, { kind: "rest" });
    expect(stateOf(t).status).toBe("ended");
    const again = (p: FlowPolicy) => [
      "replay",
      ...(p.finishHold ? ["finish"] : []),
      "scene:peregrina-long-lost@race",
      "race-result",
      "fx:race:mood-up+points",
      "idle",
    ];
    for (const p of [LEGACY_POLICY, TARGET_POLICY])
      expect(queue(t, INITIAL_UI, p)).toEqual(again(p));
    // an End an older build saved (its last week never read, F3) has no such record: its last race
    // never plays again, only that week's effects over the End, then what is left of its scenes
    t.weeks.clear();
    for (const p of [LEGACY_POLICY, TARGET_POLICY])
      expect(queue(t, INITIAL_UI, p)).toEqual([
        "fx:race:mood-up+points",
        "scene:peregrina-long-lost@end",
        "idle",
      ]);
    // nor with a record of another run, or of its result seen
    t.weeks.markRaced("v3|another|48|00000000");
    for (const p of [LEGACY_POLICY, TARGET_POLICY])
      expect(queue(t, INITIAL_UI, p)[0]).toBe("fx:race:mood-up+points");
    t.weeks.markRaceSeen(fpOf(t));
    for (const p of [LEGACY_POLICY, TARGET_POLICY])
      expect(queue(t, INITIAL_UI, p)[0]).toBe("fx:race:mood-up+points");
  });

  it("the training finale committed before this mount (a reload): its result again while unread (O1), then the End", () => {
    const t = loadSave("caracara-w48");
    commit(t, { kind: "train:technique" });
    expect(stateOf(t).status).toBe("ended");
    for (const p of [LEGACY_POLICY, TARGET_POLICY])
      expect(queue(t, INITIAL_UI, p)).toEqual(["result:success", "ack", "idle"]);
  });

  it("the end's effects seen (the step read): the end, with nothing left to play", () => {
    const t = loadSave("peregrina-w48");
    decide(t, { kind: "rest" });
    const mine = race(t, { kind: "rest" });
    t.story.markSeen("1", "peregrina-long-lost");
    t.weeks.markRaceSeen(fpOf(t));
    t.game.acknowledgeStep();
    for (const p of [LEGACY_POLICY, TARGET_POLICY]) expect(queue(t, mine, p)).toEqual(["idle"]);
  });
});

describe("a v2 event (C19)", () => {
  it("waits for the week's effects; its answer is a new step with its own effects", () => {
    const t = testGame();
    const start = { kind: "start", falconessId: "caracara", hangar: HANGAR, parents: [] };
    const rest = { kind: "rest" };
    const save = {
      schemaVersion: 1,
      rulesetVersion: "v2",
      seed: "1",
      inputs: [start, rest, rest, rest],
    };
    expect(t.game.loadText(JSON.stringify(save))).toBe(true);
    expect(stateOf(t).pendingEvent?.eventId).toBe("caracara-scrap-run");
    for (const p of [LEGACY_POLICY, TARGET_POLICY]) {
      expect(queue(t, INITIAL_UI, p)).toEqual(["fx:all:sleep-poor", "event", "idle"]);
      expect(beats(t, INITIAL_UI, p)[1]?.key).toBe("event:caracara-scrap-run/3");
    }
    const mine = commit(t, { kind: "event:choose", option: 0 });
    for (const p of [LEGACY_POLICY, TARGET_POLICY])
      expect(queue(t, mine, p)).toEqual(["fx:all:bond", "idle"]);
  });
});

describe("watching a race again from the end", () => {
  it("no emblem: it only goes from the week into the race mode (F25, M3, C4), whatever the pace", () => {
    const t = loadSave("peregrina-ended");
    const watch = ui({ type: "watch", turn: 10, from: "end" });
    for (const p of [LEGACY_POLICY, TARGET_POLICY]) {
      expect(queue(t, watch, p)).toEqual(["idle"]);
      expect(queue(t, watch, p, { pace: "fast" })).toEqual(["idle"]);
      // the next watch too
      const again = reduceUi(reduceUi(watch, { type: "watchDone", n: 1 }), {
        type: "watch",
        turn: 20,
        from: "end",
      });
      expect(queue(t, again, p)).toEqual(["idle"]);
    }
  });

  it("a turn without a result has nothing to watch: no emblem", () => {
    const t = loadSave("peregrina-ended");
    const watch = ui({ type: "watch", turn: 11, from: "end" });
    for (const p of [LEGACY_POLICY, TARGET_POLICY]) expect(queue(t, watch, p)).toEqual(["idle"]);
  });
});
