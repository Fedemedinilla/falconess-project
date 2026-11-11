import type { BlackBox } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { addBox, BOXES_KEY, MAX_BOXES, readBoxes } from "./boxes";
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

const box = (id: string): BlackBox => ({
  id,
  rulesetVersion: "v3",
  falconessId: "peregrina",
  grade: "B",
  factors: {
    stat: { stat: "agility", stars: 2 },
    aptitude: { kind: "position", key: "closer", letter: "A", stars: 2 },
    skills: [],
    frameAffinity: "koryu",
  },
  seed: "s",
  inputsHash: "h",
});

describe("black boxes in this browser (ADR-0013)", () => {
  it("keeps the newest first, once per id, at most MAX_BOXES", () => {
    const store = memory();
    expect(readBoxes(store)).toEqual([]);
    addBox(box("a"), store);
    addBox(box("b"), store);
    addBox(box("a"), store);
    expect(readBoxes(store).map((b) => b.id)).toEqual(["b", "a"]);
    for (let i = 0; i < MAX_BOXES + 5; i++) addBox(box(`x${i}`), store);
    expect(readBoxes(store)).toHaveLength(MAX_BOXES);
  });
  it("drops what is not a box, and survives a broken store", () => {
    const store = memory();
    store.data.set(BOXES_KEY, JSON.stringify([{ nope: 1 }, box("ok")]));
    expect(readBoxes(store).map((b) => b.id)).toEqual(["ok"]);
    store.data.set(BOXES_KEY, "{not json");
    expect(readBoxes(store)).toEqual([]);
    expect(readBoxes(undefined)).toEqual([]);
  });
});
