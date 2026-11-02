import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { RunInput, SeasonState } from "@falconess/schema";
import {
  advanceSeason,
  CURRENT_RULESET,
  canonicalJson,
  RULESET_V1,
  replaySeason,
} from "@falconess/sim";
import { describe, expect, it } from "vitest";
import { getContent } from "../content/load";
import { GameController } from "./controller";
import { parseSavedRun, runFingerprint } from "./run";
import { type KeyValueStore, RUN_KEY, SEEN_KEY } from "./storage";

const HANGAR = ["shiden", "mule", "nimbus", "falke"] as const;
const content = getContent();
const ctx = { ruleset: CURRENT_RULESET, content };

/** The owner's playtest 1 (ruleset v1) and its digests (5f0fd65, re-recorded by ADR-0007; packages/sim). */
const FIXTURES = new URL("../../../../packages/sim/src/season/__fixtures__/", import.meta.url);
const RUN1_TEXT = readFileSync(new URL("playtest-run1.json", FIXTURES), "utf8");
const V1_DIGESTS = JSON.parse(
  readFileSync(new URL("v1-invariance-adr0007.json", FIXTURES), "utf8"),
);

/**
 * sha256 of the state without its log, as v1-invariance.test.ts hashes it: in the shape the
 * digests were taken in (ADR-0008 undone: the letters back on the wing styles, no race position).
 */
function rulesDigest(state: SeasonState): string {
  const { log: _log, positionAptitude: p, raceResults, ...rest } = state;
  const legacy = {
    ...rest,
    styleAptitude: { dive: p.closer, hover: p.stalk, glide: p.lead, ground: p.pack },
    raceResults: raceResults.map(({ position: _p, ...r }) => r),
  };
  return createHash("sha256").update(canonicalJson(legacy)).digest("hex").slice(0, 16);
}

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
    expect(run?.rulesetVersion).toBe(CURRENT_RULESET.version);
    expect(run?.state.rulesetVersion).toBe("v2");
    expect(game.context().ruleset).toBe(CURRENT_RULESET);
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

  it("opens «Lo que pasó» after each input until it is read, and remembers it across a reload", () => {
    const store = memoryStore();
    const game = started(store);
    expect(game.getSnapshot().lastStepSeen).toBe(true);
    game.act({ kind: "train:agility" });
    expect(game.getSnapshot().lastStepSeen).toBe(false);

    // a reload before reading it: the last step is rebuilt and still waits
    const early = new GameController(content, store);
    expect(early.continueSaved()).toBe(true);
    const rebuilt = early.getSnapshot();
    expect(rebuilt.lastStepSeen).toBe(false);
    expect(rebuilt.lastStep?.input).toEqual({ kind: "train:agility" });
    expect(rebuilt.lastStep?.after).toBe(rebuilt.run?.state);
    expect(rebuilt.lastStep?.before).toEqual(
      replaySeason(ctx, "web-42", rebuilt.run?.inputs.slice(0, 1) ?? []),
    );

    // read: closed here, and closed after a reload of the same run
    let calls = 0;
    const stop = game.subscribe(() => {
      calls += 1;
    });
    game.acknowledgeStep();
    game.acknowledgeStep();
    expect(calls).toBe(1);
    stop();
    expect(game.getSnapshot().lastStepSeen).toBe(true);
    const run = game.getSnapshot().run;
    if (!run) throw new Error("no run");
    expect(store.data.get(SEEN_KEY)).toBe(runFingerprint(run));
    const later = new GameController(content, store);
    expect(later.continueSaved()).toBe(true);
    expect(later.getSnapshot().lastStepSeen).toBe(true);
    expect(later.getSnapshot().lastStep?.input).toEqual({ kind: "train:agility" });

    // the recap line opens it again; another browser (no mark) shows it on load
    game.showStepAgain();
    expect(game.getSnapshot().lastStepSeen).toBe(false);
    const elsewhere = new GameController(content, memoryStore());
    expect(elsewhere.loadText(game.exportText() ?? "")).toBe(true);
    expect(elsewhere.getSnapshot().lastStepSeen).toBe(false);

    // undo goes back to a week already read: nothing to show, now or after a reload
    game.acknowledgeStep();
    game.act({ kind: "rest" });
    expect(game.undoLast()).toBe(true);
    expect(game.getSnapshot().lastStep).toBeUndefined();
    expect(game.getSnapshot().lastStepSeen).toBe(true);
    const afterUndo = new GameController(content, store);
    expect(afterUndo.continueSaved()).toBe(true);
    expect(afterUndo.getSnapshot().lastStepSeen).toBe(true);
  });

  it("keeps «Lo que pasó» working without storage: shown after each input, closed when read", () => {
    const game = started(brokenStore);
    game.act({ kind: "rest" });
    expect(game.getSnapshot().lastStepSeen).toBe(false);
    game.acknowledgeStep();
    expect(game.getSnapshot().lastStepSeen).toBe(true);
  });

  it("tells runs apart by their inputs, not only by seed and length", () => {
    const base = { rulesetVersion: "v1", seed: "s" };
    const start: RunInput = {
      kind: "start",
      falconessId: "peregrina",
      hangar: [...HANGAR],
      parents: [],
    };
    const a = runFingerprint({ ...base, inputs: [start, { kind: "rest" }] });
    const b = runFingerprint({ ...base, inputs: [start, { kind: "train:agility" }] });
    expect(a).not.toBe(b);
    expect(a).toBe(runFingerprint({ ...base, inputs: [start, { kind: "rest" }] }));
    expect(a.startsWith("v1|s|2|")).toBe(true);
  });

  it("loads the owner's v1 playtest under v1: the same final state as recorded, input for input", () => {
    const game = new GameController(content, memoryStore());
    expect(game.loadText(RUN1_TEXT)).toBe(true);
    const run = game.getSnapshot().run;
    if (!run) throw new Error("no run");
    expect(run.rulesetVersion).toBe("v1");
    expect(game.context().ruleset).toBe(RULESET_V1);
    expect(game.newRunContext().ruleset).toBe(CURRENT_RULESET);
    expect(run.inputs).toHaveLength(V1_DIGESTS.run1.perInput.length);
    expect(rulesDigest(run.state)).toBe(V1_DIGESTS.run1.perInput.at(-1));
    expect(run.state.grade).toBe(V1_DIGESTS.run1.final.grade);
    expect(run.state.raceResults.map((r) => r.place)).toEqual(V1_DIGESTS.run1.final.places);
    // the rebuilt last step is the same replay, split before the last input
    expect(game.getSnapshot().lastStep?.after).toBe(run.state);
    // the copy it exports keeps its ruleset
    expect(JSON.parse(game.exportText() ?? "{}").rulesetVersion).toBe("v1");
  });

  it("continues a v1 run under v1 rules: forced rest at high fatigue, as the owner played it", () => {
    const saved = JSON.parse(RUN1_TEXT);
    // up to week 19, whose training the v1 rules turned into a forced rest
    const game = new GameController(content, memoryStore());
    const v1 = { ruleset: RULESET_V1, content };
    let cut = 1;
    let state = replaySeason(v1, saved.seed, saved.inputs.slice(0, cut));
    while (state.turn < 19 || state.pendingEvent) {
      cut += 1;
      state = replaySeason(v1, saved.seed, saved.inputs.slice(0, cut));
    }
    expect(state.fatigue).toBeGreaterThanOrEqual(RULESET_V1.season.forcedRestAt);
    expect(game.loadText(JSON.stringify({ ...saved, inputs: saved.inputs.slice(0, cut) }))).toBe(
      true,
    );
    expect(game.act({ kind: "train:agility" })).toBe(true);
    const after = game.getSnapshot().run?.state;
    expect(after?.log.at(-1)?.notes).toContain("log.rest.forced");
    expect(after).toEqual(advanceSeason(v1, state, { kind: "train:agility" }));
  });

  it("reads a version-less `replay:` line of the CLI as a v1 run", () => {
    const saved = JSON.parse(RUN1_TEXT);
    const line = `replay: ${JSON.stringify({ seed: saved.seed, inputs: saved.inputs.slice(0, 5) })}`;
    const game = new GameController(content, memoryStore());
    expect(game.loadText(line)).toBe(true);
    const run = game.getSnapshot().run;
    if (!run) throw new Error("no run");
    expect(run.rulesetVersion).toBe("v1");
    expect(rulesDigest(run.state)).toBe(V1_DIGESTS.run1.perInput[4]);
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
