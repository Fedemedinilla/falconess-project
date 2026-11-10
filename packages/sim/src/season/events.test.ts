import { createHash } from "node:crypto";
import { loadContent, loadRawContent } from "@falconess/content";
import { buildContentIndex, type RunInput, type SeasonState } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { RULESET_V3 } from "../race/flight.js";
import { canonicalJson } from "../race/golden.js";
import { getRuleset, RULESET_V1, RULESET_V2 } from "../rulesets/index.js";
import { advanceSeason } from "./advance.js";
import { draft, type SimContext } from "./context.js";
import { eligibleEvents } from "./events.js";
import { startSeason } from "./start.js";
import { mixedPolicy } from "./testing/mixed-policy.js";

/**
 * ADR-0006 D8: luck events applied on their own (`auto`) and events limited to rulesets. The
 * events below are test fixtures, not content: stage C writes the real ones.
 */
const TEXT: Record<string, string> = {
  "test.tailwind": "Un día redondo en el circuito de prueba.",
  "test.tailwind.opt": "Peregrina lo aprovecha.",
  "test.tailwind.good": "Sale perfecto.",
  "test.tailwind.bad": "Un mal aterrizaje la tumba.",
  "test.gust": "Ráfaga de suerte.",
  "test.gust.opt": "Agilidad +2.",
};

/** A story-like luck event at turn 2, only in v2, with a good and a bad branch. */
const TAILWIND = {
  id: "test-tailwind",
  version: 1,
  source: { kind: "random" },
  weight: null,
  fixedTurn: 2,
  auto: true,
  rulesets: ["v2"],
  textKey: "test.tailwind",
  options: [
    {
      textKey: "test.tailwind.opt",
      effects: { stats: { agility: 5 } },
      chance: [
        { p: 0.5, textKey: "test.tailwind.good", effects: { mood: 1, fatigue: -10 } },
        { p: 0.5, textKey: "test.tailwind.bad", effects: { mood: -1, fatigue: 15 } },
      ],
    },
  ],
};

/** A weighted luck event for every ruleset. */
const GUST = {
  id: "test-gust",
  version: 1,
  source: { kind: "random" },
  weight: 20,
  auto: true,
  textKey: "test.gust",
  conditions: { maxOccurrences: 48 },
  options: [{ textKey: "test.gust.opt", effects: { stats: { agility: 2 } } }],
};

function contentWith(...events: unknown[]) {
  const raw = loadRawContent();
  return buildContentIndex({
    ...raw,
    events: [...raw.events, ...events],
    text: { ...raw.text, ...TEXT },
  });
}

const START: Extract<RunInput, { kind: "start" }> = {
  kind: "start",
  falconessId: "peregrina",
  hangar: ["shiden", "mule", "nimbus", "falke"],
  parents: [],
};

const digest = (s: SeasonState) =>
  createHash("sha256").update(canonicalJson(s)).digest("hex").slice(0, 16);

function play(ctx: SimContext, seed: string): SeasonState {
  let s = startSeason(ctx, seed, START);
  while (s.status === "active") s = advanceSeason(ctx, s, mixedPolicy(ctx.content, s));
  return s;
}

describe("auto events (ADR-0006 D8)", () => {
  const ctx: SimContext = { ruleset: RULESET_V2, content: contentWith(TAILWIND) };

  it("applies in the same input: no pending choice, history, notes and the event in the log", () => {
    let branches = 0;
    for (let i = 0; i < 40; i++) {
      let s = startSeason(ctx, `tail-${i}`, START);
      s = advanceSeason(ctx, s, { kind: "rest" });
      if (s.pendingEvent) s = advanceSeason(ctx, s, { kind: "event:choose", option: 0 });
      expect(s.turn).toBe(2);
      const before = s;
      const after = advanceSeason(ctx, s, { kind: "workshop", ops: [{ op: "repair" }] });
      expect(after.pendingEvent).toBeUndefined();
      expect(after.turn).toBe(3);
      expect(after.inputsApplied).toBe(before.inputsApplied + 1);
      expect(after.eventHistory["test-tailwind"]).toBe(1);
      const week = after.log.find((e) => e.turn === 2 && e.input !== undefined);
      if (!week) throw new Error("no week 2");
      const branch = week.event?.branch;
      expect(week.event).toEqual({ id: "test-tailwind", option: 0, branch, auto: true });
      const good = branch === 0;
      if (good) branches++;
      expect(week.notes).toEqual(
        expect.arrayContaining([
          "log.workshop",
          "test.tailwind",
          "test.tailwind.opt",
          good ? "test.tailwind.good" : "test.tailwind.bad",
        ]),
      );
      expect(week.deltas.agility).toBe(5);
      const mood = Math.max(-2, Math.min(2, before.mood + (good ? 1 : -1)));
      expect(after.mood).toBe(mood);
      if (mood !== before.mood)
        expect(week.notes).toContain(good ? "log.mood.event.up" : "log.mood.event.down");
      const fatigue = Math.max(0, before.fatigue + 5 + (good ? -10 : 15));
      expect(after.fatigue).toBe(fatigue);
      if (fatigue !== before.fatigue + 5)
        expect(week.notes).toContain(good ? "log.vigor.event.up" : "log.vigor.event.down");
    }
    expect(branches).toBeGreaterThan(8);
    expect(branches).toBeLessThan(32);
  });

  it("is eligible only on the rulesets it names", () => {
    const v2 = draft({ ...startSeason(ctx, "elig", START), turn: 2 });
    expect(eligibleEvents(ctx, v2).story.map((e) => e.id)).toContain("test-tailwind");
    const v1ctx: SimContext = { ruleset: RULESET_V1, content: ctx.content };
    const v1 = draft({ ...startSeason(v1ctx, "elig", START), turn: 2 });
    expect(eligibleEvents(v1ctx, v1).story.map((e) => e.id)).not.toContain("test-tailwind");
  });

  it("v1 ignores a v2-only event: the same seasons, byte for byte", () => {
    const plain: SimContext = { ruleset: RULESET_V1, content: loadContent() };
    const extra: SimContext = { ruleset: RULESET_V1, content: ctx.content };
    for (const seed of ["a", "b", "c", "d"])
      expect(digest(play(extra, seed))).toBe(digest(play(plain, seed)));
  });

  it("a weighted auto event for every ruleset fires on its own in v1 and v2", () => {
    for (const ruleset of [RULESET_V1, RULESET_V2]) {
      const c: SimContext = { ruleset, content: contentWith(GUST) };
      const s = play(c, "gust");
      const fired = s.log.filter((e) => e.event?.id === "test-gust");
      expect(fired.length, ruleset.version).toBeGreaterThan(3);
      for (const e of fired) {
        expect(e.event).toEqual({ id: "test-gust", option: 0, auto: true });
        expect(e.notes).toEqual(expect.arrayContaining(["test.gust", "test.gust.opt"]));
      }
      expect(s.eventHistory["test-gust"]).toBe(fired.length);
    }
  });

  it("chosen events log which option and branch they took, without auto", () => {
    const c: SimContext = { ruleset: RULESET_V2, content: loadContent() };
    let s = startSeason(c, "story", START);
    while (s.turn < 3) {
      if (s.pendingEvent) s = advanceSeason(c, s, { kind: "event:choose", option: 0 });
      else s = advanceSeason(c, s, { kind: "rest" });
    }
    if (s.pendingEvent) s = advanceSeason(c, s, { kind: "event:choose", option: 0 });
    const pending = advanceSeason(c, s, { kind: "rest" });
    expect(pending.pendingEvent?.eventId).toBe("peregrina-first-dive");
    const chosen = advanceSeason(c, pending, { kind: "event:choose", option: 1 });
    const week = chosen.log.find((e) => e.turn === 3 && e.input !== undefined);
    expect(week?.event).toEqual({ id: "peregrina-first-dive", option: 1 });
  });
});

describe("content events and rulesets", () => {
  it("every ruleset an event names exists", () => {
    // the v3 draft (design7) lives outside the registry until ADR-0009; it keeps v2's season
    const draft = (v: string) => (v === RULESET_V3.version ? RULESET_V3 : getRuleset(v));
    for (const e of loadContent().events.values())
      for (const v of e.rulesets ?? []) expect(() => draft(v), `${e.id}: ${v}`).not.toThrow();
  });
});
