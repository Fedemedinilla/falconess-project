import { loadContent } from "@falconess/content";
import { type Course, RaceGeometry } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { buildCourseGeometry, logGeometry, phaseOf, raceMaxTicks } from "./geometry.js";
import { SPEC_RULESET } from "./testing/spec-ruleset.js";
import {
  PH_FINAL,
  PH_MIDDLE,
  PH_START,
  POS_PER_MM,
  SEG_CURVES,
  SEG_DESCENT,
  SEG_FLAT,
  SEG_JUMP,
} from "./units.js";

const content = loadContent();
const R = SPEC_RULESET;
const M = 225_000; // pu per metre

/** The table of docs/race-engine.md 2, in mm. */
const BOUNDARIES: Record<string, readonly [number, number, number, number, number, number]> = {
  "sprint": [1_200_000, 200_000, 800_000, 840_000, 1_140_000, 1_175_000],
  "ridge": [2_000_000, 333_333, 1_333_333, 1_400_000, 1_940_000, 1_975_000],
  "canyon": [3_000_000, 500_000, 2_000_000, 2_100_000, 2_940_000, 2_975_000],
};

describe("buildCourseGeometry (docs/race-engine.md 2)", () => {
  for (const [id, [len, startEnd, finalStart, hover, reserve, dense]] of Object.entries(BOUNDARIES))
    it(`${id}: phase, plan and sampling positions in mm and pu`, () => {
      const G = buildCourseGeometry(R, content.getCourse(id));
      expect(G.lengthMm).toBe(len);
      expect([G.startEndMm, G.finalStartMm, G.hoverAttackMm, G.reserveAtMm, G.denseFromMm]).toEqual(
        [startEnd, finalStart, hover, reserve, dense],
      );
      expect(G.L).toBe(len * POS_PER_MM);
      expect([G.startEnd, G.finalStart, G.hoverAttack, G.reserveAt, G.denseFrom]).toEqual(
        [startEnd, finalStart, hover, reserve, dense].map((mm) => mm * POS_PER_MM),
      );
      expect(G.segEnd[G.S - 1]).toBe(G.L);
      expect(G.segStart[0]).toBe(0);
      for (let s = 1; s < G.S; s++) expect(G.segStart[s]).toBe(G.segEnd[s - 1]);
      expect(G.courseId).toBe(id);
      expect(G.courseVersion).toBe(1);
    });

  it("ridge segments: boundaries, types, grades, lifts and jump indices", () => {
    const G = buildCourseGeometry(R, content.getCourse("ridge"));
    expect(G.S).toBe(7);
    const metres = [0, 300, 700, 800, 1200, 1500, 1580, 2000];
    expect(Array.from(G.segStart)).toEqual(metres.slice(0, 7).map((m) => m * M));
    expect(Array.from(G.segEnd)).toEqual(metres.slice(1).map((m) => m * M));
    expect(Array.from(G.segType)).toEqual([
      SEG_FLAT,
      SEG_DESCENT,
      SEG_JUMP,
      SEG_FLAT,
      SEG_DESCENT,
      SEG_JUMP,
      SEG_FLAT,
    ]);
    expect(Array.from(G.gradePm)).toEqual([0, 300, 0, 0, 200, 0, 0]);
    expect(Array.from(G.liftReq)).toEqual([0, 0, 20, 0, 0, 15, 0]);
    expect(Array.from(G.jumpIdx)).toEqual([2, 5]);
    // the second jump lies in the final phase
    expect(phaseOf(G, G.segStart[5] ?? 0)).toBe(PH_FINAL);
  });

  it("canyon and sprint: drag and radius in ‰ / content ints", () => {
    const canyon = buildCourseGeometry(R, content.getCourse("canyon"));
    expect(Array.from(canyon.gradePm)).toEqual([0, 250, 0, 0, 0, 0, 0]);
    expect(Array.from(canyon.dragPm)).toEqual([0, 0, 0, 0, 0, 200, 0]);
    expect(canyon.jumpIdx.length).toBe(0);
    const sprint = buildCourseGeometry(R, content.getCourse("sprint"));
    expect(Array.from(sprint.radius)).toEqual([0, 60, 0, 40, 0]);
    expect(sprint.segType[1]).toBe(SEG_CURVES);
  });

  it("a position exactly on a boundary belongs to the later phase", () => {
    const G = buildCourseGeometry(R, content.getCourse("ridge"));
    expect(phaseOf(G, 0)).toBe(PH_START);
    expect(phaseOf(G, G.startEnd - 1)).toBe(PH_START);
    expect(phaseOf(G, G.startEnd)).toBe(PH_MIDDLE);
    expect(phaseOf(G, G.finalStart - 1)).toBe(PH_MIDDLE);
    expect(phaseOf(G, G.finalStart)).toBe(PH_FINAL);
    expect(phaseOf(G, G.L)).toBe(PH_FINAL);
  });

  it("logGeometry gives the RaceLog block in mm with each segment's param", () => {
    const G = buildCourseGeometry(R, content.getCourse("canyon"));
    const g = logGeometry(R, G);
    expect(RaceGeometry.parse(g)).toEqual(g);
    expect("biome" in g).toBe(false); // ADR-0007
    expect(g.lengthMm).toBe(3_000_000);
    expect(g.segments.map((s) => [s.type, s.startMm, s.endMm, s.param])).toEqual([
      ["flat", 0, 400_000, 0],
      ["climb", 400_000, 900_000, 250],
      ["canyon", 900_000, 1_500_000, 0],
      ["flat", 1_500_000, 2_000_000, 0],
      ["canyon", 2_000_000, 2_400_000, 0],
      ["water", 2_400_000, 2_600_000, 200],
      ["flat", 2_600_000, 3_000_000, 0],
    ]);
    const ridge = logGeometry(R, buildCourseGeometry(R, content.getCourse("ridge")));
    expect(ridge.segments.map((s) => s.param)).toEqual([0, 300, 20, 0, 200, 15, 0]);
    const sprint = logGeometry(R, buildCourseGeometry(R, content.getCourse("sprint")));
    expect(sprint.segments.map((s) => s.param)).toEqual([0, 60, 0, 40, 0]);
  });

  it("reserveAt = max(0, L − 60 m) for every length from 50 m: never negative in the log (ADR-0003 D53)", () => {
    for (let m = 50; m <= 3000; m++) {
      const course: Course = {
        ...content.getCourse("sprint"),
        segments: [{ type: "flat", length: m }],
      };
      const G = buildCourseGeometry(R, course);
      expect(G.reserveAtMm).toBe(Math.max(0, (m - R.race.finalSprintReserveMeters) * 1000));
      expect(G.reserveAt).toBe(G.reserveAtMm * POS_PER_MM);
      const g = logGeometry(R, G);
      expect(RaceGeometry.safeParse(g).success).toBe(true);
    }
  });

  it("rejects courses longer than maxCourseMeters (the 2^53 bound of 1.5)", () => {
    const long: Course = {
      ...content.getCourse("sprint"),
      segments: Array.from({ length: 4 }, () => ({ type: "flat" as const, length: 3000 })),
    };
    expect(() => buildCourseGeometry(R, long)).toThrow(/exceeds/);
    const ok: Course = { ...long, segments: long.segments.slice(0, 3) };
    expect(buildCourseGeometry(R, ok).lengthMm).toBe(9_000_000);
  });

  it("is pure: the same course gives equal geometry, and the course is not mutated", () => {
    const course = content.getCourse("ridge");
    const before = JSON.stringify(course);
    const a = buildCourseGeometry(R, course);
    const b = buildCourseGeometry(R, course);
    expect(a).toEqual(b);
    expect(JSON.stringify(course)).toBe(before);
  });
});

describe("raceMaxTicks (docs/race-engine.md 19, ADR-0003 D33)", () => {
  it("is 8 ticks per whole metre + 2400 on the three courses", () => {
    const expected: Record<string, number> = {
      "sprint": 8 * 1200 + 2400,
      "ridge": 8 * 2000 + 2400,
      "canyon": 8 * 3000 + 2400,
    };
    for (const course of content.courses.values())
      expect(raceMaxTicks(R, buildCourseGeometry(R, course)), course.id).toBe(expected[course.id]);
    expect(raceMaxTicks(R, { lengthMm: 1_200_999 })).toBe(8 * 1200 + 2400);
  });
});
