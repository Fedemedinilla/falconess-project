import type { SeasonState, TurnLogEntry } from "@falconess/schema";
import { CURRENT_RULESET, startSeason } from "@falconess/sim";
import { describe, expect, it } from "vitest";
import { simContext } from "../content/load";
import { inspirationCard } from "./inspirationScene";

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

describe("the inheritance card in the flow: shown until it was shown (F19, plan §1.5)", () => {
  const none: ReadonlySet<string> = new Set();
  it("the start's card while the run is only its start, until its key was shown", () => {
    const s = withLog([entry(1, { inspirations: [rec(true)] })]);
    expect(inspirationCard("x", s, 1, undefined, none)).toMatchObject({
      kind: "start",
      key: "x:start",
    });
    expect(inspirationCard("x", s, 1, undefined, new Set(["x:start"]))).toBeUndefined();
    expect(inspirationCard("x", withLog([entry(1)]), 1, undefined, none)).toBeUndefined();
  });
  it("the week's card comes from the latest step, read or not, until its key was shown", () => {
    const before = withLog([entry(23)]);
    const after = withLog([entry(23), entry(24, { inspirations: [rec(true), rec(false, 1)] })]);
    const step = { before, after, input: { kind: "rest" as const } };
    const card = inspirationCard("x", after, 30, step, none);
    expect(card).toMatchObject({ kind: "inspiration", turn: 24, key: "x:24" });
    expect(card?.records).toHaveLength(2);
    // the same object on every call (a derive never churns it)
    expect(inspirationCard("x", after, 30, step, new Set(["x:start"]))).toBe(card);
    expect(inspirationCard("x", after, 30, step, new Set(["x:24"]))).toBeUndefined();
    // the run moved on past that step, or no step: no card
    expect(
      inspirationCard("x", withLog([...after.log, entry(25)]), 31, step, none),
    ).toBeUndefined();
    expect(inspirationCard("x", after, 30, undefined, none)).toBeUndefined();
    const quiet = withLog([entry(23), entry(24, { inspirations: [rec(false)] })]);
    expect(inspirationCard("x", quiet, 30, { ...step, after: quiet }, none)).toBeUndefined();
  });
});
