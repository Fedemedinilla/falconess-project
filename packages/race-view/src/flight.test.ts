import { loadCatalogueCourses, loadContent } from "@falconess/content";
import type { Course, Position, RaceEntry, Style } from "@falconess/schema";
import { neutralFixtureEntry, RULESET_V2, RULESET_V3, simulateRace } from "@falconess/sim";
import { describe, expect, it } from "vitest";
import { flightBeats } from "./flight.js";

const content = loadContent();
const ORDER: Style[] = ["glide", "ground", "hover", "dive"];
const DEFAULT: Record<Style, Position> = {
  glide: "lead",
  ground: "pack",
  hover: "stalk",
  dive: "closer",
};

function field(st: number, positions?: Position[]): RaceEntry[] {
  const stats = { agility: st, stamina: st, technique: st, courage: st, intelligence: st };
  return Array.from({ length: 8 }, (_, lane) => {
    const style = ORDER[lane % 4] ?? "glide";
    return neutralFixtureEntry({
      runnerId: `r${lane}`,
      laneIndex: lane,
      style,
      position: positions?.[lane] ?? DEFAULT[style],
      stats,
    });
  });
}

describe("flightBeats (ruleset v3 stage 1, diseno-v3-vuelo.md §6.1)", () => {
  const courses: Course[] = [
    ...["sprint", "ridge", "canyon"].map((c) => content.getCourse(c)),
    ...loadCatalogueCourses(),
  ];

  it("every flight of a real v3 log is told whole: takeoff, bands, diveStart, dive, touchdown", () => {
    let flights = 0;
    for (const course of courses)
      for (const st of [300, 600])
        for (const seed of ["a", "b"]) {
          const log = simulateRace(RULESET_V3, field(st), course, `beats/${course.id}/${seed}`);
          for (let lane = 0; lane < 8; lane++)
            for (const f of flightBeats(log, lane)) {
              flights += 1;
              expect(f.problems, `${course.id} ${st} lane ${lane} tick ${f.takeoff.tick}`).toEqual(
                [],
              );
              // the plan of the card: the takeoff falls at its start (one tick of movement)
              expect(f.plan).not.toBeNull();
              const gap = f.takeoff.posMm - (f.plan?.aMm ?? 0);
              expect(gap).toBeGreaterThanOrEqual(0);
              expect(gap).toBeLessThan(2500);
              if (f.dive !== null) expect(f.peakMms).toBe(f.dive.vBeforeMms + f.dive.gainMms);
            }
        }
    expect(flights).toBeGreaterThan(100);
  });

  it("the ledger peak is the highest dive peak of the beats", () => {
    const log = simulateRace(RULESET_V3, field(600), content.getCourse("sprint"), "peak");
    for (const r of log.results) {
      const peaks = flightBeats(log, r.lane).map((f) => f.peakMms ?? 0);
      expect(r.ledger.flight?.peakMms ?? 0).toBe(Math.max(0, ...peaks));
    }
  });

  it("the Lanza reaches the ceiling in 6 ticks, the Columna in 12, the Rampa in 24 (S1)", () => {
    // closers with each flying wing, on the sprint (no cornisa)
    const closers: Position[] = [
      "closer",
      "pack",
      "closer",
      "closer",
      "closer",
      "pack",
      "closer",
      "closer",
    ];
    const log = simulateRace(RULESET_V3, field(600, closers), content.getCourse("sprint"), "sty");
    const ticks: Record<string, number[]> = {};
    for (let lane = 0; lane < 8; lane++)
      for (const f of flightBeats(log, lane))
        if (f.apex === 3 && f.lineChanges.every((l) => l.cause !== "over"))
          ticks[f.takeoff.style] = [...(ticks[f.takeoff.style] ?? []), f.climbToApexTicks ?? -1];
    expect(new Set(ticks.lance)).toEqual(new Set([6]));
    expect(new Set(ticks.column)).toEqual(new Set([12]));
    expect(new Set(ticks.ramp)).toEqual(new Set([24]));
  });

  it("a v2 log has no flight", () => {
    const log = simulateRace(RULESET_V2, field(600), content.getCourse("ridge"), "v2");
    for (let lane = 0; lane < 8; lane++) expect(flightBeats(log, lane)).toEqual([]);
  });
});
