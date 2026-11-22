import { describe, expect, it } from "vitest";
import { expire, MAX_LEAVING, type Presence, presenceStep } from "./presence";
import type { Layer } from "./types";

const fx = (key: string): Layer => ({ kind: "fx", key, fx: [] });
const event = (key: string): Layer => ({ kind: "event", key });
/** Every layer leaves in 240 ms but the event dialog (a native dialog, at once). */
const outMs = (l: Layer): number => (l.kind === "event" ? 0 : 240);

/** The entries in words: `key#gen:phase`. */
const names = (list: readonly Presence[]): string[] =>
  list.map((e) => `${e.key}#${e.gen}:${e.phase}`);

describe("presenceStep: the layer in front and the ones leaving (plan §1.9)", () => {
  it("a layer enters in front; with none, nothing changes", () => {
    const none: readonly Presence[] = [];
    expect(presenceStep(none, undefined, 0, outMs)).toBe(none);
    const a = fx("a");
    const list = presenceStep(none, a, 10, outMs);
    expect(names(list)).toEqual(["a#0:in"]);
    expect(list[0]?.layer).toBe(a);
  });

  it("a layer that is no longer the flow's leaves, from now, with the data it had", () => {
    const a = fx("a");
    const list = presenceStep(presenceStep([], a, 0, outMs), undefined, 500, outMs);
    expect(names(list)).toEqual(["a#0:out"]);
    expect(list[0]?.since).toBe(500);
    expect(list[0]?.layer).toBe(a);
    // nothing in front any more: a second step without one changes nothing
    expect(presenceStep(list, undefined, 600, outMs)).toBe(list);
  });

  it("a new layer replaces the one in front: that one leaves in its place, the new one after it", () => {
    let list = presenceStep([], fx("a"), 0, outMs);
    list = presenceStep(list, fx("b"), 100, outMs);
    expect(names(list)).toEqual(["a#0:out", "b#0:in"]);
    // replaced again while the first still leaves
    list = presenceStep(list, fx("c"), 150, outMs);
    expect(names(list)).toEqual(["a#0:out", "b#0:out", "c#0:in"]);
    expect(list.map((e) => e.since)).toEqual([100, 150, 150]);
  });

  it("the same key refreshes the data of the one in front, and the same data changes nothing", () => {
    const first = fx("a");
    let list = presenceStep([], first, 0, outMs);
    expect(presenceStep(list, first, 50, outMs)).toBe(list);
    const newer: Layer = { kind: "fx", key: "a", fx: [{ kind: "sleep-great", good: true }] };
    list = presenceStep(list, newer, 50, outMs);
    expect(names(list)).toEqual(["a#0:in"]);
    expect(list[0]?.layer).toBe(newer);
    expect(list[0]?.since).toBe(0);
  });

  it("a key that comes back while it leaves is a new one (a new gen): the leaving one stays", () => {
    let list = presenceStep([], fx("a"), 0, outMs);
    list = presenceStep(list, undefined, 100, outMs);
    list = presenceStep(list, fx("a"), 120, outMs);
    expect(names(list)).toEqual(["a#0:out", "a#1:in"]);
    // and once more: the next gen, never one in use
    list = presenceStep(list, undefined, 130, outMs);
    list = presenceStep(list, fx("a"), 140, outMs);
    expect(names(list)).toEqual(["a#0:out", "a#1:out", "a#2:in"]);
  });

  it(`at most ${MAX_LEAVING} leave at once: the oldest goes when another starts leaving`, () => {
    let list: readonly Presence[] = [];
    for (const [i, key] of ["a", "b", "c", "d"].entries())
      list = presenceStep(list, fx(key), i * 10, outMs);
    expect(names(list)).toEqual(["b#0:out", "c#0:out", "d#0:in"]);
    list = presenceStep(list, undefined, 50, outMs);
    expect(names(list)).toEqual(["c#0:out", "d#0:out"]);
  });

  it("a layer that leaves in no time (the event's dialog, reduced motion) is gone at once", () => {
    let list = presenceStep([], event("e"), 0, outMs);
    list = presenceStep(list, fx("a"), 10, outMs);
    expect(names(list)).toEqual(["a#0:in"]);
    list = presenceStep(list, undefined, 20, () => 0);
    expect(list).toEqual([]);
  });
});

describe("expire: a leaving layer's time is up", () => {
  it("removes that leaving entry only", () => {
    let list = presenceStep([], fx("a"), 0, outMs);
    list = presenceStep(list, undefined, 10, outMs);
    list = presenceStep(list, fx("a"), 20, outMs);
    expect(names(expire(list, "a", 0))).toEqual(["a#1:in"]);
  });

  it("a layer in front, an older gen or an unknown key: nothing changes", () => {
    let list = presenceStep([], fx("a"), 0, outMs);
    list = presenceStep(list, fx("b"), 10, outMs);
    expect(expire(list, "b", 0)).toBe(list);
    expect(expire(list, "a", 1)).toBe(list);
    expect(expire(list, "z", 0)).toBe(list);
    expect(names(expire(list, "a", 0))).toEqual(["b#0:in"]);
  });
});
