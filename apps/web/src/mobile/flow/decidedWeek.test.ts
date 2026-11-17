import type { RunInput } from "@falconess/schema";
import { advanceSeason, seasonGoalsOf, startSeason } from "@falconess/sim";
import { describe, expect, it } from "vitest";
import type { ActiveRun } from "../../game/controller";
import { runFingerprint } from "../../game/run";
import { decodeWeek, encodeWeek, validRecord, WEEK_KEY, WeekStore } from "./decidedWeek";
import { testContext } from "./testing/content";
import { blockedStore, memoryStore } from "./testing/memory";
import type { DecidedWeek, WeekRecord } from "./types";
import { previewResult } from "./week";

const ctx = testContext("v3");
const startInput: Extract<RunInput, { kind: "start" }> = {
  kind: "start",
  falconessId: "peregrina",
  hangar: ["shiden", "mule", "nimbus", "falke"],
  parents: [],
};

/** Her run rested up to `turn` (her first goal's race week by default). */
function runTo(seed: string, turn?: number): ActiveRun {
  let state = startSeason(ctx, seed, startInput);
  const first = [...seasonGoalsOf(ctx, state)].sort((a, b) => a.turn - b.turn)[0];
  const until = turn ?? first?.turn ?? 1;
  const inputs: RunInput[] = [startInput];
  while (state.turn < until) {
    const input: RunInput = state.pendingEvent
      ? { kind: "event:choose", option: 0 }
      : { kind: "rest" };
    inputs.push(input);
    state = advanceSeason(ctx, state, input);
  }
  return { seed, rulesetVersion: "v3", inputs, state };
}

/** A copy of the run with a new state object: a cache of its own. */
const fresh = (run: ActiveRun): ActiveRun => ({ ...run, state: { ...run.state } });

type Decided = Extract<WeekRecord, { phase: "decided" }>;
const decided = (over: Partial<DecidedWeek> = {}): Decided => ({
  phase: "decided",
  fp: "v3|1|10|00000000",
  turn: 10,
  inputs: 10,
  input: { kind: "train:technique" },
  position: undefined,
  stage: "action",
  ...over,
});
const planned: WeekRecord = {
  phase: "planned",
  fp: "v3|1|10|00000000",
  turn: 10,
  position: "stalk",
};

describe("the decided week's stored format", () => {
  it("keeps its browser key", () => {
    expect(WEEK_KEY).toBe("falconess.juego.semana");
  });

  it("reads back every phase it writes", () => {
    const records: WeekRecord[] = [
      planned,
      { ...planned, position: undefined },
      decided(),
      decided({ position: "closer", stage: "race" }),
      decided({
        input: { kind: "workshop", ops: [{ op: "equip-frame", frameId: "nimbus-glide" }] },
      }),
      decided({ input: { kind: "outing", manufacturer: "altair" } }),
      { phase: "raced", fp: "v3|1|11|0000abcd" },
      { phase: "raceSeen", fp: "v3|1|11|0000abcd" },
    ];
    for (const r of records) expect(decodeWeek(encodeWeek(r))).toEqual(r);
  });

  it("writes one versioned line, without an unpicked position", () => {
    expect(encodeWeek({ ...planned, position: undefined })).toBe(
      '{"v":1,"phase":"planned","fp":"v3|1|10|00000000","turn":10}',
    );
    expect(JSON.parse(encodeWeek(decided({ position: "pack" })))).toMatchObject({
      v: 1,
      phase: "decided",
      position: "pack",
    });
  });

  it("reads nothing from a corrupt or foreign value", () => {
    const good = JSON.parse(encodeWeek(decided()));
    const bad: unknown[] = [
      { ...good, v: 2 },
      { ...good, phase: "deciding" },
      { ...good, extra: true },
      { ...good, stage: "done" },
      { ...good, turn: "10" },
      { v: 1, phase: "raceSeen" },
      { v: 1, phase: "raced", fp: "v3|1|11|0000abcd", turn: 10 },
      // a position belongs to the record, never to the stored input
      { ...good, input: { kind: "rest", position: "lead" } },
      // only a week's action is decided
      { ...good, input: startInput },
      { ...good, input: { kind: "event:choose", option: 0 } },
      { ...good, input: { kind: "fly" } },
      [],
      null,
    ];
    for (const v of bad) expect(decodeWeek(JSON.stringify(v)), JSON.stringify(v)).toBeUndefined();
    expect(decodeWeek("{")).toBeUndefined();
    expect(decodeWeek("")).toBeUndefined();
    expect(decodeWeek(undefined)).toBeUndefined();
  });
});

describe("validRecord: a record counts only for the run it was written in", () => {
  const run = runTo("dw-1");
  const fp = runFingerprint(run);
  const week = decided({
    fp,
    turn: run.state.turn,
    inputs: run.inputs.length,
    input: { kind: "rest" },
  });

  it("a decided week of this run's race week, whose preview plays", () => {
    expect(validRecord(ctx, run, fp, week)).toBe(week);
    expect(validRecord(ctx, run, fp, undefined)).toBeUndefined();
  });

  it("not another run's, another week's or one decided on another count of inputs", () => {
    expect(validRecord(ctx, run, "v3|other|10|00000000", week)).toBeUndefined();
    expect(validRecord(ctx, run, fp, { ...week, fp: "v3|other|10|00000000" })).toBeUndefined();
    expect(validRecord(ctx, run, fp, { ...week, turn: run.state.turn + 1 })).toBeUndefined();
    expect(validRecord(ctx, run, fp, { ...week, inputs: run.inputs.length - 1 })).toBeUndefined();
  });

  it("not on a week without a race", () => {
    const early = runTo("dw-1", 5);
    const efp = runFingerprint(early);
    const w = { ...week, fp: efp, turn: early.state.turn, inputs: early.inputs.length };
    expect(validRecord(ctx, early, efp, w)).toBeUndefined();
    const plan: WeekRecord = {
      phase: "planned",
      fp: efp,
      turn: early.state.turn,
      position: "lead",
    };
    expect(validRecord(ctx, early, efp, plan)).toBeUndefined();
  });

  it("not when its preview is refused (a workshop order the sim refuses)", () => {
    const order = decided({
      fp,
      turn: run.state.turn,
      inputs: run.inputs.length,
      input: { kind: "workshop", ops: [{ op: "equip-frame", frameId: "no-such-frame" }] },
    });
    expect(validRecord(ctx, run, fp, order)).toBeUndefined();
  });

  it("a planned position on this run's race week; a race run or seen by the run it led to", () => {
    const plan: WeekRecord = { phase: "planned", fp, turn: run.state.turn, position: undefined };
    expect(validRecord(ctx, run, fp, plan)).toBe(plan);
    expect(validRecord(ctx, run, fp, { ...plan, turn: 3 })).toBeUndefined();
    expect(validRecord(ctx, run, fp, { ...plan, fp: "x" })).toBeUndefined();
    const seen: WeekRecord = { phase: "raceSeen", fp };
    expect(validRecord(ctx, run, fp, seen)).toBe(seen);
    expect(validRecord(ctx, run, fp, { phase: "raceSeen", fp: "x" })).toBeUndefined();
    const raced: WeekRecord = { phase: "raced", fp };
    expect(validRecord(ctx, run, fp, raced)).toBe(raced);
    expect(validRecord(ctx, run, fp, { phase: "raced", fp: "x" })).toBeUndefined();
  });

  it("reads the one preview cache that tryPreview and previewOf read (one simulation)", () => {
    const own = fresh(run);
    const calls: RunInput[] = [];
    previewResult(ctx, own.state, { kind: "rest" }, (c, s, input) => {
      calls.push(input);
      return advanceSeason(c, s, input);
    });
    expect(validRecord(ctx, own, fp, week)).toBe(week);
    expect(calls).toHaveLength(1);
    // a refusal kept in the cache refuses the record, with no new simulation
    const refused = fresh(run);
    previewResult(ctx, refused.state, { kind: "rest" }, () => {
      throw new Error("refused");
    });
    expect(validRecord(ctx, refused, fp, week)).toBeUndefined();
  });
});

describe("the week store", () => {
  const fp = "v3|1|10|00000000";
  const next = "v3|1|11|0000abcd";
  const w: DecidedWeek = {
    fp,
    turn: 10,
    inputs: 10,
    input: { kind: "train:technique" },
    position: "closer",
    stage: "action",
  };

  it("follows the week's life (plan §1.8), one write per moment, each one kept", () => {
    const kv = memoryStore();
    const store = new WeekStore(kv);
    const told: (WeekRecord | undefined)[] = [];
    store.subscribe(() => told.push(store.getSnapshot()));
    const life: readonly [string, (s: WeekStore) => void, WeekRecord | undefined][] = [
      [
        "a position picked on the planning card",
        (s) => s.plan(fp, 10, "closer"),
        { phase: "planned", fp, turn: 10, position: "closer" },
      ],
      [
        "another one",
        (s) => s.setPosition(fp, "lead"),
        { phase: "planned", fp, turn: 10, position: "lead" },
      ],
      [
        "an action tapped, its preview fine",
        (s) => s.decide({ ...w, position: "lead" }),
        { phase: "decided", ...w, position: "lead" },
      ],
      [
        "the emblem done, or the race mode entered without it",
        (s) => s.enterRace(fp),
        { phase: "decided", ...w, position: "lead", stage: "race" },
      ],
      [
        "a position picked on the decided card",
        (s) => s.setPosition(fp, "pack"),
        { phase: "decided", ...w, position: "pack", stage: "race" },
      ],
      [
        "no choice on the card: her wings'",
        (s) => s.setPosition(fp, undefined),
        { phase: "decided", ...w, position: undefined, stage: "race" },
      ],
      ["«Correr» committed", (s) => s.markRaced(next), { phase: "raced", fp: next }],
      ["«Continuar» on its result", (s) => s.markRaceSeen(next), { phase: "raceSeen", fp: next }],
      ["a record of no run in play, dropped", (s) => s.clear(), undefined],
    ];
    for (const [moment, act, after] of life) {
      act(store);
      expect(store.getSnapshot(), moment).toEqual(after);
      expect(new WeekStore(kv).getSnapshot(), moment).toEqual(after);
      expect(kv.data.get(WEEK_KEY), moment).toBe(after ? encodeWeek(after) : undefined);
    }
    expect(told).toHaveLength(life.length);
  });

  it("a write that changes nothing keeps the snapshot and tells no one", () => {
    const store = new WeekStore(memoryStore());
    store.decide(w);
    const snap = store.getSnapshot();
    let told = 0;
    const stop = store.subscribe(() => {
      told += 1;
    });
    store.setPosition(fp, "closer");
    store.setPosition(next, "lead");
    store.enterRace(next);
    store.decide({ ...w });
    expect(store.getSnapshot()).toBe(snap);
    expect(told).toBe(0);
    store.enterRace(fp);
    const raced = store.getSnapshot();
    store.enterRace(fp);
    expect(store.getSnapshot()).toBe(raced);
    expect(told).toBe(1);
    stop();
    store.clear();
    expect(told).toBe(1);
    store.clear();
    expect(store.getSnapshot()).toBeUndefined();
  });

  it("a race run or seen takes no position and enters no race", () => {
    const store = new WeekStore(memoryStore());
    store.markRaced(fp);
    store.setPosition(fp, "lead");
    store.enterRace(fp);
    expect(store.getSnapshot()).toEqual({ phase: "raced", fp });
    store.markRaceSeen(fp);
    store.setPosition(fp, "lead");
    store.enterRace(fp);
    expect(store.getSnapshot()).toEqual({ phase: "raceSeen", fp });
  });

  it("reads what was stored; nothing from a corrupt value", () => {
    const kv = memoryStore({ [WEEK_KEY]: encodeWeek(planned) });
    expect(new WeekStore(kv).getSnapshot()).toEqual(planned);
    expect(new WeekStore(memoryStore({ [WEEK_KEY]: "{oops" })).getSnapshot()).toBeUndefined();
  });

  it("without storage, or with it blocked, the week lasts the visit", () => {
    for (const kv of [undefined, blockedStore()]) {
      const store = new WeekStore(kv);
      expect(store.getSnapshot()).toBeUndefined();
      store.decide(w);
      expect(store.getSnapshot()).toEqual({ phase: "decided", ...w });
      expect(new WeekStore(kv).getSnapshot()).toBeUndefined();
    }
  });

  it("two tabs: each reads what the other stored since its load (as the save is read at «Continuar»)", () => {
    const kv = memoryStore({ [WEEK_KEY]: encodeWeek({ phase: "raceSeen", fp: "stale" }) });
    // a tab left on the title since the stale record, and the tab that plays on
    const waiting = new WeekStore(kv);
    const playing = new WeekStore(kv);
    playing.clear();
    playing.decide(w);
    expect(waiting.getSnapshot()).toEqual({ phase: "decided", ...w });
    // the same object while nothing new is stored (no identity churn)
    expect(waiting.getSnapshot()).toBe(waiting.getSnapshot());
    // and a write of its own starts from it: the position goes on the other tab's decided week
    waiting.setPosition(fp, "pack");
    expect(new WeekStore(kv).getSnapshot()).toEqual({ phase: "decided", ...w, position: "pack" });
  });

  it("a write the storage refuses keeps this tab's record for the visit", () => {
    const kv = memoryStore({ [WEEK_KEY]: encodeWeek(planned) });
    const store = new WeekStore(kv);
    kv.setItem = () => {
      throw new Error("quota");
    };
    store.decide(w);
    expect(store.getSnapshot()).toEqual({ phase: "decided", ...w });
    expect(store.getSnapshot()).toBe(store.getSnapshot());
  });
});
