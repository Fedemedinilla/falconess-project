import { Calendar, calendarOptionalRuns, courseLength, withCalendar } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { loadCalendar, loadCatalogueCourses, loadContent, loadSeasonContent } from "./node.js";

describe("v3 calendar (ADR-0011 §6)", () => {
  const cal = loadCalendar("v3");
  it("names only known tracks and every catalogue track", () => {
    const known = new Set([
      ...loadContent().courses.keys(),
      ...loadCatalogueCourses().map((c) => c.id),
    ]);
    expect(cal.catalogue.every((t) => known.has(t))).toBe(true);
    expect(cal.catalogue).toHaveLength(9);
  });
  it("spreads the optional runs like the offers: the track of the month weighs more", () => {
    const w = calendarOptionalRuns(cal);
    const sum = Object.values(w).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(cal.optionalRunsPerSeason, 9);
    // design7 criterios.json calendarV3.offerSlots: 6.6667 per track, 8.6667 with two months
    expect((w.canyon ?? 0) * (66 / 8)).toBeCloseTo(8.6667, 3);
    expect((w.steps ?? 0) * (66 / 8)).toBeCloseTo(6.6667, 3);
  });
});

describe("v3 goals (balance lever «calendario/metas», ADR-0010)", () => {
  const cal = loadCalendar("v3");
  const v3 = loadSeasonContent("v3");
  // the distances of ruleset v3 (FLIGHT.distanceMaxM 1400 / 1800 / 2400 m)
  const distance = (id: string) => {
    const m = courseLength(v3.getCourse(id));
    return m <= 1400 ? "sprint" : m <= 1800 ? "mile" : m <= 2400 ? "medium" : "long";
  };
  it("gives each Falconess her own goals on catalogue tracks, at her B letters or better", () => {
    for (const f of v3.falconess.values()) {
      const goals = cal.goals?.[f.id];
      // ADR-0014: Peregrina's story adds a fifth goal, the Larga she only has to run
      expect(goals, f.id).toHaveLength(f.id === "peregrina" ? 5 : 4);
      expect(f.seasonGoals).toEqual(goals);
      for (const g of f.seasonGoals) {
        expect(cal.catalogue).toContain(g.courseId);
        if (g.minPlace < 8)
          expect(["S", "A", "B"]).toContain(f.distanceAptitude?.[distance(g.courseId)]);
      }
    }
  });
  it("keeps each Falconess's season her own: only Peregrina's goals carry grades (ADR-0014)", () => {
    for (const [id, goals] of Object.entries({ ...cal.goals, ...cal.exigenteGoals }))
      if (id !== "peregrina")
        for (const g of goals) expect([g.grade, g.fieldPm], id).toEqual([undefined, undefined]);
  });
  it("puts her goals where her identity is: Peregrina short, Cernícala Media, Caracara Larga", () => {
    const dist = (f: string) => v3.getFalconess(f).seasonGoals.map((g) => distance(g.courseId));
    // ADR-0014: four wins in her distances, then the Larga «Correr» (any place passes)
    const pg = v3.getFalconess("peregrina").seasonGoals;
    expect(
      dist("peregrina")
        .slice(0, 4)
        .every((d) => d === "sprint" || d === "mile"),
    ).toBe(true);
    expect(pg.slice(0, 4).every((g) => g.minPlace === 1)).toBe(true);
    expect([dist("peregrina")[4], pg[4]?.minPlace]).toEqual(["long", 8]);
    expect(dist("cernicala").filter((d) => d === "medium")).toHaveLength(3);
    expect(dist("caracara").filter((d) => d === "long")).toHaveLength(3);
  });
  it("leaves v1 and v2 on the Falconess's own goals and tracks", () => {
    const base = loadContent();
    expect(loadSeasonContent("v2")).toBe(base);
    expect(base.courses.has("open-sky")).toBe(false);
    expect(base.getFalconess("caracara").seasonGoals[1]?.courseId).toBe("sprint");
  });
  it("rejects a goal off the catalogue or for an unknown Falconess", () => {
    const bad = (goals: unknown) => () =>
      withCalendar(loadContent(), Calendar.parse({ ...cal, goals }), loadCatalogueCourses());
    expect(bad({ nobody: [{ turn: 12, courseId: "sprint", minPlace: 3 }] })).toThrow(
      /unknown falconess/,
    );
    expect(() =>
      Calendar.parse({
        ...cal,
        goals: { peregrina: [{ turn: 12, courseId: "moon", minPlace: 3 }] },
      }),
    ).toThrow(/catalogue/);
  });
});
