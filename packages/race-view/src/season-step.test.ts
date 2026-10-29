import { loadContent } from "@falconess/content";
import type { RunInput, SeasonState } from "@falconess/schema";
import { advanceSeason, RULESET_V2, type SimContext, startSeason } from "@falconess/sim";
import { describe, expect, it } from "vitest";
import { resolveLoggedEvent, stepLog } from "./season-step.js";

const ctx: SimContext = { ruleset: RULESET_V2, content: loadContent() };
const START = {
  kind: "start" as const,
  falconessId: "peregrina",
  hangar: ["shiden", "mule", "nimbus", "falke"],
  parents: [],
};

/** Every step of a few v2 seasons that rest, train and answer events with their first option. */
function steps(seeds: number): { before: SeasonState; input: RunInput; after: SeasonState }[] {
  const out = [];
  const cycle: RunInput[] = [
    { kind: "train:agility" },
    { kind: "train:stamina" },
    { kind: "rest" },
    { kind: "outing" },
  ];
  for (let n = 0; n < seeds; n++) {
    let s = startSeason(ctx, `step-${n}`, START);
    for (let i = 0; s.status === "active" && i < 80; i++) {
      const input: RunInput = s.pendingEvent
        ? { kind: "event:choose", option: 0 }
        : (cycle[i % cycle.length] ?? { kind: "rest" });
      const after = advanceSeason(ctx, s, input);
      out.push({ before: s, input, after });
      s = after;
    }
  }
  return out;
}

describe("one step of the season log, read for the CLI and the web", () => {
  const all = steps(12);

  it("takes the notes and deltas an action added to its new entry", () => {
    const s0 = { ...startSeason(ctx, "step-train", START), fatigue: 0 };
    const s1 = advanceSeason(ctx, s0, { kind: "train:agility" });
    const step = stepLog(s0, s1);
    const entry = s1.log.at(-1);
    expect(step.notes).toEqual(entry?.notes);
    expect(Object.fromEntries(step.deltas)).toEqual(entry?.deltas);
    expect(stepLog(s1, s1)).toEqual({ notes: [], deltas: new Map(), event: undefined });
  });

  it("finds an answered event on the week's entry it extends, with only the notes it added", () => {
    const step = all.find((x) => x.input.kind === "event:choose");
    if (!step) throw new Error("no event answered");
    const read = stepLog(step.before, step.after);
    expect(read.event).toMatchObject({ id: step.before.pendingEvent?.eventId, option: 0 });
    expect(read.event?.auto).toBeUndefined();
    const week = step.after.log.find((e) => e.turn === step.before.pendingEvent?.turn);
    const old = step.before.log.find((e) => e.turn === step.before.pendingEvent?.turn);
    expect(read.notes).toEqual(week?.notes.slice(old?.notes.length ?? 0));
  });

  it("reads a luck event as the sim logged it: its notes in order, its blocks and stats", () => {
    let autos = 0;
    for (const { before, after } of all) {
      const read = stepLog(before, after);
      if (!read.event) continue;
      const resolved = resolveLoggedEvent(ctx.content, read.event);
      if (!resolved) throw new Error(`content does not know ${read.event.id}`);
      // the event's notes are logged together, in this order, among the step's notes
      const at = read.notes.indexOf(resolved.noteKeys[0] ?? "");
      expect(read.notes.slice(at, at + resolved.noteKeys.length)).toEqual(resolved.noteKeys);
      if (read.event.auto) {
        autos += 1;
        expect(resolved.noteKeys[1]).toBe(resolved.option.textKey);
      }
    }
    expect(autos).toBeGreaterThan(5);
  });

  it("sums a luck event's stat effects over the option and the drawn branch", () => {
    const tail = resolveLoggedEvent(ctx.content, { id: "luck-tailwind", option: 0, auto: true });
    expect(tail?.noteKeys).toEqual(["ev.luck-tailwind", "ev.luck-tailwind.opt0"]);
    expect(tail?.stats).toEqual([
      { stat: "agility", delta: 10 },
      { stat: "technique", delta: 6 },
    ]);
    const smile = (branch: number) =>
      resolveLoggedEvent(ctx.content, { id: "luck-rival-smile", option: 0, branch, auto: true });
    expect(smile(0)?.noteKeys).toEqual([
      "ev.luck-rival-smile",
      "ev.luck-rival-smile.opt0",
      "ev.luck-rival-smile.good",
    ]);
    expect(smile(0)?.stats).toEqual([
      { stat: "stamina", delta: 6 },
      { stat: "courage", delta: 10 },
    ]);
    expect(smile(1)?.stats).toEqual([]);
    expect(smile(1)?.effects.map((fx) => fx.mood)).toEqual([0, -1]);
    expect(resolveLoggedEvent(ctx.content, { id: "no-such-event", option: 0 })).toBeUndefined();
    expect(resolveLoggedEvent(ctx.content, { id: "luck-tailwind", option: 2 })).toBeUndefined();
  });
});
