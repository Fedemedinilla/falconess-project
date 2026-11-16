import type { RunInput, SeasonState, TurnLogEntry } from "@falconess/schema";
import { startSeason } from "@falconess/sim";
import { describe, expect, it } from "vitest";
import type { Step } from "../../game/controller";
import { inspirationCard } from "../inspirationScene";
import { CARDS_KEY, InspirationStore, type LoadedRun, MAX_SEEDS } from "./inspirations";
import { testContext } from "./testing/content";
import { blockedStore, memoryStore } from "./testing/memory";

const ctx = testContext("v3");
const base = startSeason(ctx, "insp", {
  kind: "start",
  falconessId: "peregrina",
  hangar: ["shiden", "mule", "nimbus", "falke"],
  parents: [],
});
const entry = (turn: number, extra: Partial<TurnLogEntry> = {}): TurnLogEntry => ({
  turn,
  notes: [],
  deltas: {},
  ...extra,
});
const rec = (inspired: boolean) => ({
  parent: 0,
  stars: 2,
  inspired,
  stat: "agility" as const,
  gain: inspired ? 40 : 0,
});
const rest: RunInput = { kind: "rest" };

/** Her season at week 41: inspired at the start, at week 24, and at week 40 by the last step. */
function season(startInspired = true): { readonly after: SeasonState; readonly step: Step } {
  const log = [
    entry(1, { inspirations: [rec(startInspired)] }),
    entry(23),
    entry(24, { inspirations: [rec(true), rec(false)] }),
    entry(39),
    entry(40, { inspirations: [rec(true)] }),
  ];
  const before: SeasonState = { ...base, turn: 40, log: log.slice(0, 4) };
  const after: SeasonState = { ...base, turn: 41, log };
  return { after, step: { before, input: rest, after } };
}
const loaded = (stepSeen: boolean, startInspired = true): LoadedRun => {
  const { after, step } = season(startInspired);
  return { seed: "s", state: after, step, stepSeen };
};

describe("the inheritance cards shown", () => {
  it("keeps its browser key", () => {
    expect(CARDS_KEY).toBe("falconess.juego.herencia");
  });

  it("a card marked shown stays shown in its season, across loads, and tells every subscriber", () => {
    const kv = memoryStore();
    const store = new InspirationStore(kv);
    const empty = store.shown("s");
    expect(empty.size).toBe(0);
    let told = 0;
    const stop = store.subscribe(() => {
      told += 1;
    });
    const v = store.version();
    store.markShown("s", "s:start");
    expect([...store.shown("s")]).toEqual(["s:start"]);
    expect(store.version()).not.toBe(v);
    expect(told).toBe(1);
    // the same reading until a mark changes it; a repeated mark changes nothing
    const once = store.shown("s");
    store.markShown("s", "s:start");
    expect(store.shown("s")).toBe(once);
    expect(told).toBe(1);
    expect(store.shown("other").size).toBe(0);
    stop();
    store.markShown("s", "s:24");
    expect(told).toBe(1);
    expect([...new InspirationStore(kv).shown("s")]).toEqual(["s:start", "s:24"]);
    expect(JSON.parse(kv.data.get(CARDS_KEY) ?? "")).toEqual({
      v: 1,
      seeds: [["s", ["s:start", "s:24"]]],
    });
  });

  it(`keeps the ${MAX_SEEDS} seasons marked last, in the order they were marked (seeds are digits)`, () => {
    expect(MAX_SEEDS).toBe(20);
    const kv = memoryStore();
    const store = new InspirationStore(kv);
    // 21 seeds, the newest the smallest number: an object's keys would sort them
    const seeds = Array.from({ length: MAX_SEEDS + 1 }, (_, i) => String(MAX_SEEDS - i));
    for (const seed of seeds) store.markShown(seed, `${seed}:start`);
    expect(store.shown("20").size).toBe(0);
    expect(store.shown("0").has("0:start")).toBe(true);
    const again = new InspirationStore(kv);
    expect(again.shown("20").size).toBe(0);
    expect(again.shown("19").has("19:start")).toBe(true);
    // a mark makes its season the newest: the oldest one now is "18"
    again.markShown("19", "19:24");
    again.markShown("x", "x:start");
    expect(again.shown("18").size).toBe(0);
    expect([...again.shown("19")]).toEqual(["19:start", "19:24"]);
    const stored = JSON.parse(kv.data.get(CARDS_KEY) ?? "");
    expect(stored.seeds).toHaveLength(MAX_SEEDS);
    expect(stored.seeds.at(-2)[0]).toBe("19");
    expect(stored.seeds.at(-1)[0]).toBe("x");
  });

  it("reads nothing from a corrupt or foreign value", () => {
    for (const raw of ["{", "[]", '{"v":2,"seeds":[]}', '{"v":1,"seeds":{"s":["s:start"]}}'])
      expect(new InspirationStore(memoryStore({ [CARDS_KEY]: raw })).shown("s").size).toBe(0);
  });

  it("without storage, or with it blocked, a card stays shown for the visit", () => {
    for (const kv of [undefined, blockedStore()]) {
      const store = new InspirationStore(kv);
      store.markShown("s", "s:start");
      expect(store.shown("s").has("s:start")).toBe(true);
      expect(new InspirationStore(kv).shown("s").size).toBe(0);
    }
  });
});

describe("the one-time migration (plan §1.8): the cards an earlier build already showed", () => {
  it("with no key yet: the start's card and every read week's card of the saved run", () => {
    const kv = memoryStore();
    let asked = 0;
    const store = new InspirationStore(kv, () => {
      asked += 1;
      return loaded(false);
    });
    expect(asked).toBe(1);
    // the last step is unread: its card (week 40) plays in D2's order
    expect([...store.shown("s")].sort()).toEqual(["s:24", "s:start"]);
    const { after, step } = season();
    expect(inspirationCard("s", after, 41, step, store.shown("s"))?.key).toBe("s:40");
    // once: the key is there now
    new InspirationStore(kv, () => {
      asked += 1;
      return loaded(false);
    });
    expect(asked).toBe(1);
  });

  it("a read last step's card is marked too; a start that inspired no one has no card", () => {
    const read = new InspirationStore(memoryStore(), () => loaded(true));
    expect([...read.shown("s")].sort()).toEqual(["s:24", "s:40", "s:start"]);
    const quiet = new InspirationStore(memoryStore(), () => loaded(true, false));
    expect([...quiet.shown("s")].sort()).toEqual(["s:24", "s:40"]);
  });

  it("a run of only its start: its card was shown at «Empezar»", () => {
    const state: SeasonState = { ...base, log: [entry(1, { inspirations: [rec(true)] })] };
    const store = new InspirationStore(memoryStore(), () => ({
      seed: "s",
      state,
      step: undefined,
      stepSeen: true,
    }));
    expect([...store.shown("s")]).toEqual(["s:start"]);
  });

  it("with the key there, a new season is not migrated (its start card shows)", () => {
    const kv = memoryStore({ [CARDS_KEY]: '{"v":1,"seeds":[]}' });
    let asked = 0;
    const store = new InspirationStore(kv, () => {
      asked += 1;
      return loaded(true);
    });
    expect(asked).toBe(0);
    expect(store.shown("s").size).toBe(0);
  });

  it("with no saved run, the key is written all the same, so no later season is migrated", () => {
    const kv = memoryStore();
    new InspirationStore(kv, () => undefined);
    expect(kv.data.get(CARDS_KEY)).toBe('{"v":1,"seeds":[]}');
    let asked = 0;
    new InspirationStore(kv, () => {
      asked += 1;
      return loaded(true);
    });
    expect(asked).toBe(0);
  });
});
