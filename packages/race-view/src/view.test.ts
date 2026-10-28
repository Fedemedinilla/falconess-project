import { loadContent } from "@falconess/content";
import { RACE_FRAME_FLAGS, type RaceLog } from "@falconess/schema";
import {
  freezeEntry,
  generateField,
  neutralFixtureEntry,
  RULESET_V1,
  type SimContext,
  simulateRace,
} from "@falconess/sim";
import { describe, expect, it } from "vitest";
import { runnerEventLines } from "./events.js";
import { buildField, FieldError, learnableSkills, playerEntryInput } from "./field.js";
import { crossingMilliTicks, runnersInPlaceOrder } from "./log.js";
import { secondsPerColumn, timelineCells, timelineColumns } from "./timeline.js";
import { compressRuns, whyModel } from "./why.js";

const ctx: SimContext = { ruleset: RULESET_V1, content: loadContent() };
const engine = { generateField, freezeEntry, neutralFixtureEntry };

function race(courseId: string, seed: string, detail: "full" | "results" = "full"): RaceLog {
  const course = ctx.content.getCourse(courseId);
  const entries = buildField(engine, ctx, course, seed, {
    kind: "player",
    falconessId: "peregrina",
    frameId: null,
    parts: [],
    skills: ["stoop-strike", "last-gasp"],
    stats: 400,
    turn: 30,
  });
  return simulateRace(ctx.ruleset, entries, course, seed, { detail });
}

const ridge = race("desert-ridge", "rv-1");
const canyon = race("desert-canyon", "rv-2");

describe("buildField", () => {
  it("builds the player plus class-matched rivals, sorted by lane", () => {
    const course = ctx.content.getCourse("desert-sprint");
    const entries = buildField(engine, ctx, course, "f1", {
      kind: "player",
      falconessId: "caracara",
      frameId: null,
      parts: [],
      skills: [],
      stats: null,
      turn: 1,
    });
    expect(entries).toHaveLength(course.entries);
    expect(entries.map((e) => e.laneIndex)).toEqual(entries.map((_, i) => i));
    expect(entries.filter((e) => e.kind === "player")).toHaveLength(1);
  });

  it("builds eight neutral fixtures, two per style", () => {
    const course = ctx.content.getCourse("desert-sprint");
    const entries = buildField(engine, ctx, course, "f1", { kind: "neutral", stats: 450 });
    expect(entries.map((e) => e.style)).toEqual([
      "dive",
      "hover",
      "glide",
      "ground",
      "dive",
      "hover",
      "glide",
      "ground",
    ]);
  });

  it("refuses a skill another Falconess owns, and offers only the ones she can carry", () => {
    const spec = {
      kind: "player" as const,
      falconessId: "peregrina",
      frameId: null,
      parts: [],
      skills: ["scavenger-stride"],
      stats: null,
      turn: 1,
    };
    expect(() => playerEntryInput(ctx.content, spec)).toThrow(FieldError);
    const offered = learnableSkills(ctx.content, "peregrina");
    expect(offered).toContain("stoop-strike");
    expect(offered).not.toContain("scavenger-stride");
    for (const id of offered) expect(ctx.content.getSkill(id).kind).toBe("active");
  });
});

describe("runnerEventLines", () => {
  it("keeps time order and ends with the finish at the line", () => {
    for (const log of [ridge, canyon]) {
      for (const entry of log.entries) {
        const lines = runnerEventLines(log, entry.laneIndex);
        const milli = lines.map((l) => l.milli);
        expect(milli).toEqual([...milli].sort((a, b) => a - b));
        const last = lines[lines.length - 1];
        expect(last?.item.kind).toBe("finish");
        expect(last?.posMm).toBe(log.geometry.lengthMm);
      }
    }
  });

  it("pairs each overheat with its end", () => {
    for (const log of [ridge, canyon]) {
      for (const entry of log.entries) {
        const ons = (log.events ?? []).filter(
          (e) => e.lane === entry.laneIndex && e.kind === "overheat" && e.on,
        ).length;
        const spans = runnerEventLines(log, entry.laneIndex).filter(
          (l) => l.item.kind === "overheatSpan",
        );
        expect(spans).toHaveLength(ons);
      }
    }
  });

  it("groups consecutive pulses and counts every one", () => {
    for (const log of [ridge, canyon]) {
      for (const entry of log.entries) {
        const pulses = (log.events ?? []).filter(
          (e) => e.lane === entry.laneIndex && e.kind === "pulse",
        ).length;
        const grouped = runnerEventLines(log, entry.laneIndex).reduce(
          (n, l) => n + (l.item.kind === "pulses" ? l.item.count : 0),
          0,
        );
        expect(grouped).toBe(pulses);
      }
    }
  });

  it("is empty without events", () => {
    expect(runnerEventLines(race("desert-sprint", "rv-3", "results"), 0)).toEqual([]);
  });
});

describe("timelineCells", () => {
  it("covers the race with one cell per slice, finishing exactly once", () => {
    const seconds = secondsPerColumn(ridge.ticks, 60);
    const cols = timelineColumns(ridge, seconds);
    expect(cols).toBeLessThanOrEqual(60);
    for (const entry of ridge.entries) {
      const cells = timelineCells(ridge, entry.laneIndex, seconds);
      expect(cells).toHaveLength(cols);
      expect(cells.filter((c) => c === "finish")).toHaveLength(1);
      expect(cells.indexOf("after")).not.toBe(0);
    }
  });

  it("shows airborne slices where the frames have the airborne flag", () => {
    const lane = ridge.entries.findIndex((_, i) =>
      ridge.frames?.runners[i]?.flags.some((f) => (f & RACE_FRAME_FLAGS.airborne) !== 0),
    );
    expect(lane).toBeGreaterThanOrEqual(0);
    expect(timelineCells(ridge, lane, 1)).toContain("airborne");
  });
});

describe("crossingMilliTicks", () => {
  it("grows with distance and ends at the exact finish", () => {
    for (const r of ridge.results) {
      const marks = crossingMilliTicks(ridge, r.lane);
      expect(marks).toHaveLength(10);
      const numbers = marks.filter((m): m is number => m !== null);
      expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
      expect(marks[9]).toBe(r.finishMilli);
    }
  });
});

describe("whyModel", () => {
  const runners = runnersInPlaceOrder(canyon);
  const winner = runners[0];
  if (!winner) throw new Error("no winner");

  it("compares phases with the winner from the ledger, and none for the winner", () => {
    const w = whyModel(canyon, winner, winner);
    expect(w.isWinner).toBe(true);
    expect(w.gapMilli).toBeNull();
    expect(w.phases.every((p) => p.deltaTicks === null)).toBe(true);
    for (const r of runners.slice(1)) {
      const m = whyModel(canyon, r, winner);
      expect(m.isWinner).toBe(false);
      m.phases.forEach((p, i) => {
        expect(p.ticks).toBe(r.result.ledger.phaseTicks[i]);
        if (!r.result.dnf)
          expect(p.deltaTicks).toBe(p.ticks - (winner.result.ledger.phaseTicks[i] ?? 0));
      });
      if (r.result.finishMilli !== null && winner.result.finishMilli !== null)
        expect(m.gapMilli).toBe(r.result.finishMilli - winner.result.finishMilli);
    }
  });

  it("lists every sink the ledger has, and the skills with p and u", () => {
    for (const r of runners) {
      const m = whyModel(canyon, r, winner);
      const L = r.result.ledger;
      const kinds = m.sinks.map((s) => s.kind);
      expect(kinds.includes("hpEmpty")).toBe(L.hpEmptyMm !== null);
      expect(kinds.includes("overheat")).toBe(L.overheatTicks > 0);
      expect(kinds.includes("energyLeft")).toBe(L.energyLeft > 0);
      expect(kinds.includes("broken")).toBe(r.result.broken);
      expect(m.skills.filter((s) => s.fired).map((s) => s.skillId)).toEqual(
        expect.arrayContaining(L.skillsActivated),
      );
      expect(m.skills.every((s) => s.p !== null && s.u !== null)).toBe(true);
      expect(m.segments).toHaveLength(canyon.geometry.segments.length);
    }
  });

  it("falls back to the ledger's skill lists without events", () => {
    const log = race("desert-canyon", "rv-2", "results");
    const rs = runnersInPlaceOrder(log);
    const first = rs[0];
    if (!first) throw new Error("no winner");
    for (const r of rs) {
      const m = whyModel(log, r, first);
      expect(m.plan).toBeNull();
      expect(m.modes).toEqual([]);
      expect(m.skills.every((s) => s.p === null && s.u === null)).toBe(true);
    }
  });
});

describe("compressRuns", () => {
  const text = (items: string[]) =>
    compressRuns(items, (s) => s).map((p) =>
      p.kind === "more" ? `…${p.count}` : `${p.items.join("+")}×${p.reps}`,
    );

  it("run-lengths repeated items and repeated blocks of up to four", () => {
    expect(text(["a", "a", "a"])).toEqual(["a×3"]);
    expect(text(["a", "b", "a", "b", "c"])).toEqual(["a+b×2", "c×1"]);
    expect(text(["a", "b", "c", "d", "e", "a", "b", "c", "d", "e"])).toEqual([
      "a×1",
      "b×1",
      "c×1",
      "d×1",
      "e×1",
      "a×1",
      "b×1",
      "c×1",
      "d×1",
      "e×1",
    ]);
  });

  it("keeps the first seven and the last four parts of a long sequence", () => {
    const items = "abcdefghijklmnop".split("");
    const parts = text(items);
    expect(parts).toHaveLength(12);
    expect(parts[7]).toBe(`…${items.length - 11}`);
  });
});
