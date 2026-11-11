import { describe, expect, it } from "vitest";
import {
  entrySave,
  exportFileName,
  HISTORY_KEY,
  MAX_SEASONS,
  putHistory,
  readHistory,
  type SeasonEntry,
} from "./history";
import type { KeyValueStore } from "./storage";

function memory(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const save = (seed: string) =>
  JSON.stringify({
    schemaVersion: 1,
    rulesetVersion: "v3",
    seed,
    inputs: [{ kind: "start", falconessId: "peregrina", hangar: ["shiden"], parents: [] }],
  });
const entry = (seed: string, turn = 1): SeasonEntry => ({
  seed,
  falconessId: "peregrina",
  difficulty: "normal",
  turn,
  status: "active",
  updatedAt: "2026-11-11T10:00:00.000Z",
  save: save(seed),
});

describe("this browser's seasons (export, owner 2026-11-11)", () => {
  it("keeps one entry per seed, the newest first, at most MAX_SEASONS", () => {
    const store = memory();
    putHistory(store, entry("a"));
    putHistory(store, entry("b"));
    putHistory(store, entry("a", 12));
    expect(readHistory(store).map((e) => [e.seed, e.turn])).toEqual([
      ["a", 12],
      ["b", 1],
    ]);
    for (let i = 0; i < MAX_SEASONS + 3; i++) putHistory(store, entry(`x${i}`));
    expect(readHistory(store)).toHaveLength(MAX_SEASONS);
  });
  it("reads back the save, drops what is not an entry, and names the file", () => {
    const store = memory();
    store.data.set(HISTORY_KEY, JSON.stringify([{ nope: 1 }, entry("ok")]));
    const [only] = readHistory(store);
    expect(only?.seed).toBe("ok");
    expect(only && entrySave(only)?.seed).toBe("ok");
    store.data.set(HISTORY_KEY, "{broken");
    expect(readHistory(store)).toEqual([]);
    expect(exportFileName({ falconessId: "peregrina", turn: 48, seed: "265138" })).toBe(
      "falconess-peregrina-s48-265138.json",
    );
  });
});
