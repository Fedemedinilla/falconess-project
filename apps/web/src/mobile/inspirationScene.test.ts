import type { SeasonState, TurnLogEntry } from "@falconess/schema";
import { CURRENT_RULESET, startSeason } from "@falconess/sim";
import { describe, expect, it } from "vitest";
import { simContext } from "../content/load";
import { inspirationScene } from "./inspirationScene";

const ctx = simContext(CURRENT_RULESET.version);
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
const withLog = (log: TurnLogEntry[]): SeasonState => ({ ...base, log });
const rec = (inspired: boolean, parent = 0) => ({
  parent,
  stars: 2,
  inspired,
  stat: "agility" as const,
  gain: inspired ? 40 : 0,
});

describe("the inheritance card's scene (ADR-0013)", () => {
  it("shows the start's boxes on a run of only its start", () => {
    const s = withLog([entry(1, { inspirations: [rec(true)] })]);
    expect(inspirationScene("x", s, 1, undefined, true)?.kind).toBe("start");
    expect(inspirationScene("x", withLog([entry(1)]), 1, undefined, true)).toBeUndefined();
  });
  it("shows a new week's inspirations once, and not when none inspired her", () => {
    const before = withLog([entry(23)]);
    const after = withLog([entry(23), entry(24, { inspirations: [rec(true), rec(false, 1)] })]);
    const step = { before, after, input: { kind: "rest" as const } };
    const scene = inspirationScene("x", after, 30, step, false);
    expect(scene).toMatchObject({ kind: "inspiration", turn: 24, key: "x:24" });
    expect(scene?.records).toHaveLength(2);
    expect(inspirationScene("x", after, 30, step, true)).toBeUndefined();
    const quiet = withLog([entry(23), entry(24, { inspirations: [rec(false)] })]);
    const quietStep = { before, after: quiet, input: { kind: "rest" as const } };
    expect(inspirationScene("x", quiet, 30, quietStep, false)).toBeUndefined();
  });
});
