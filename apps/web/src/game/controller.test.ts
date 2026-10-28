import type { RunInput, SeasonState } from "@falconess/schema";
import { RULESET_V1, replaySeason } from "@falconess/sim";
import { describe, expect, it } from "vitest";
import { getContent } from "../content/load";
import { GameController } from "./controller";
import { parseSavedRun } from "./run";
import { type KeyValueStore, RUN_KEY } from "./storage";

const HANGAR = ["shiden", "mule", "nimbus", "falke"] as const;
const content = getContent();
const ctx = { ruleset: RULESET_V1, content };

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
    removeItem: (k) => {
      data.delete(k);
    },
  };
}

const brokenStore: KeyValueStore = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
  removeItem: () => {
    throw new Error("SecurityError");
  },
};

/** A plain policy: answer events with option 0, rest when tired, else train agility. */
function policy(s: SeasonState): RunInput {
  if (s.pendingEvent) return { kind: "event:choose", option: 0 };
  if (s.fatigue >= 60) return { kind: "rest" };
  return { kind: "train:agility" };
}

function started(store: KeyValueStore | undefined = memoryStore()): GameController {
  const game = new GameController(content, store);
  expect(game.start("peregrina", HANGAR, "web-42")).toBe(true);
  return game;
}

describe("GameController", () => {
  it("starts a season from the start input", () => {
    const game = started();
    const run = game.getSnapshot().run;
    expect(run?.seed).toBe("web-42");
    expect(run?.rulesetVersion).toBe("v1");
    expect(run?.inputs).toEqual([
      { kind: "start", falconessId: "peregrina", hangar: [...HANGAR], parents: [] },
    ]);
    expect(run?.state.turn).toBe(1);
    expect(run?.state.status).toBe("active");
  });

  it("applies inputs through the sim: the state equals the replay of seed + inputs", () => {
    const game = started();
    for (let i = 0; i < 8; i++) {
      const s = game.getSnapshot().run?.state;
      if (!s) throw new Error("no run");
      expect(game.act(policy(s))).toBe(true);
    }
    const snap = game.getSnapshot();
    const run = snap.run;
    if (!run) throw new Error("no run");
    expect(run.inputs).toHaveLength(9);
    expect(run.state).toEqual(replaySeason(ctx, run.seed, run.inputs));
    expect(snap.lastStep?.after).toBe(run.state);
    expect(snap.lastStep?.input).toBe(run.inputs.at(-1));
  });

  it("turns a refused workshop order or a misplaced input into an error, state untouched", () => {
    const game = started();
    const before = game.getSnapshot();
    expect(game.act({ kind: "workshop", ops: [{ op: "equip-frame", frameId: "kite" }] })).toBe(
      false,
    );
    const after = game.getSnapshot();
    expect(after.error?.kind).toBe("workshop");
    expect(after.error?.detail).toMatch(/not in the hangar/);
    expect(after.run).toBe(before.run);

    expect(game.act({ kind: "event:choose", option: 0 })).toBe(false);
    expect(game.getSnapshot().error?.kind).toBe("invalid-input");
    game.clearError();
    expect(game.getSnapshot().error).toBeUndefined();
  });

  it("reports a start the sim refuses", () => {
    const game = new GameController(content, undefined);
    expect(game.start("nadie", HANGAR, "1")).toBe(false);
    expect(game.getSnapshot().error?.kind).toBe("start");
    expect(game.start("peregrina", ["shiden", "shiden"], "1")).toBe(false);
    expect(game.getSnapshot().run).toBeUndefined();
  });

  it("ignores an input chosen on a run that has moved on since (a double click)", () => {
    const game = started();
    expect(game.act({ kind: "train:agility" }, 1)).toBe(true);
    // the second click of the gesture was meant for the run of length 1
    expect(game.act({ kind: "train:agility" }, 1)).toBe(false);
    expect(game.getSnapshot().run?.inputs).toHaveLength(2);
    expect(game.getSnapshot().error).toBeUndefined();
    const state = game.getSnapshot().run?.state;
    if (!state) throw new Error("no run");
    expect(game.act(policy(state), 2)).toBe(true);
  });

  it("undoes the last input by replaying without it, never the start", () => {
    const game = started();
    const first = game.getSnapshot().run?.state;
    game.act({ kind: "train:stamina" });
    expect(game.undoLast()).toBe(true);
    const run = game.getSnapshot().run;
    expect(run?.inputs).toHaveLength(1);
    expect(run?.state).toEqual(first);
    expect(game.getSnapshot().lastStep).toBeUndefined();
    expect(game.undoLast()).toBe(false);
  });

  it("autosaves, continues the saved run and exports the same JSON", () => {
    const store = memoryStore();
    const game = started(store);
    game.act({ kind: "rest" });
    expect(game.getSnapshot().saved).toBe(true);
    const text = store.data.get(RUN_KEY);
    expect(text).toBe(game.exportText());

    const other = new GameController(content, store);
    expect(other.savedRun()?.seed).toBe("web-42");
    expect(other.continueSaved()).toBe(true);
    expect(other.getSnapshot().run?.state).toEqual(game.getSnapshot().run?.state);
  });

  it("keeps working when storage throws", () => {
    const game = started(brokenStore);
    expect(game.getSnapshot().saved).toBe(false);
    expect(game.act({ kind: "rest" })).toBe(true);
    expect(game.save()).toBe(false);
    expect(game.savedRun()).toBeUndefined();
    expect(game.continueSaved()).toBe(false);
    expect(game.exportText()).toBeDefined();
  });

  it("loads a pasted run and names what is wrong with a bad one", () => {
    const source = started();
    source.act({ kind: "train:technique" });
    const text = source.exportText() ?? "";

    const game = new GameController(content, memoryStore());
    expect(game.loadText(text)).toBe(true);
    expect(game.getSnapshot().run?.state).toEqual(source.getSnapshot().run?.state);

    expect(game.loadText("no es json")).toBe(false);
    expect(game.getSnapshot().error?.kind).toBe("load-json");
    const parsed = parseSavedRun(text, "v1");
    if (!parsed.ok) throw new Error("bad fixture");
    expect(game.loadText(JSON.stringify({ ...parsed.run, rulesetVersion: "v9" }))).toBe(false);
    expect(game.getSnapshot().error?.kind).toBe("load-ruleset");
    const unknownFrame = {
      ...parsed.run,
      inputs: [{ kind: "start", falconessId: "peregrina", hangar: ["no-such-frame"] }],
    };
    expect(game.loadText(JSON.stringify(unknownFrame))).toBe(false);
    expect(game.getSnapshot().error?.kind).toBe("load-replay");
    // a failed load keeps the run that was in play
    expect(game.getSnapshot().run?.state).toEqual(source.getSnapshot().run?.state);
  });

  it("leaves the run for a new season and notifies subscribers once per change", () => {
    const game = started();
    let calls = 0;
    const stop = game.subscribe(() => {
      calls += 1;
    });
    const snap = game.getSnapshot();
    expect(game.getSnapshot()).toBe(snap);
    game.newSeason();
    expect(game.getSnapshot().run).toBeUndefined();
    expect(calls).toBe(1);
    stop();
    game.start("cernicala", HANGAR, "2");
    expect(calls).toBe(1);
  });
});
