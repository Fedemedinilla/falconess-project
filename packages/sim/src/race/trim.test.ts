import { loadCatalogueCourses, loadContent } from "@falconess/content";
import type { Course, EntryInput, RaceEntry, RaceLog } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { RULESET_V1, RULESET_V2 } from "../rulesets/index.js";
import { simulateRace } from "./engine.js";
import { freezeEntry } from "./entry.js";
import { neutralFixtureEntry } from "./fixtures.js";
import {
  distanceOfLength,
  FLIGHT_OFF_HOMES,
  FLIGHT_OFF_TRIM,
  FLIGHT_V3_E1,
  RULESET_V3,
  rulesetV3,
} from "./flight.js";

/**
 * Trim (owner 2026-11-09/10, .work/design7/measure/trim-final.md): Garra fija's dive bonus by race
 * distance (Sprint +10 %, Milla +25 %, Media and Larga +50 %), and the Escapada (breakaway), the
 * Punta's home in the Media. FLIGHT_OFF_TRIM is the homes engine (5f470a2) byte for byte
 * (trim/inv14.ts).
 */
const content = loadContent();
const catalogue = new Map(loadCatalogueCourses().map((c) => [c.id, c]));
const courseOf = (id: string): Course => catalogue.get(id) ?? content.getCourse(id);
const S = (v: number) => ({ agility: v, stamina: v, technique: v, courage: v, intelligence: v });

function peregrina(): EntryInput {
  const f = content.getFalconess("peregrina");
  return {
    runnerId: "player",
    kind: "player",
    falconessId: "peregrina",
    baseStats: S(600),
    mood: 0,
    positionAptitude: f.positionAptitude,
    distanceAptitude: f.distanceAptitude,
    position: "closer",
    frameId: "shiden",
    parts: [],
    quirks: [],
    learnedSkills: [],
    durability: null,
  };
}

function mirror(R: typeof RULESET_V3, course: Course): RaceEntry[] {
  const me = freezeEntry(R, content, peregrina(), course, 0);
  const rest = Array.from({ length: 7 }, (_, j) => ({
    ...neutralFixtureEntry({
      runnerId: `r${j + 1}`,
      laneIndex: j + 1,
      style: "dive",
      position: "closer",
      stats: me.stats,
    }),
    distanceAptitude: "B" as const,
  }));
  return [me, ...rest];
}

const myDives = (log: RaceLog) =>
  (log.events ?? []).flatMap((e) => (e.kind === "dive" && e.lane === 0 ? [e] : []));

describe("trim: Garra fija by distance (ADR-0009 draft)", () => {
  it("talon-lock reads 100 / 250 / 500 / 500 ‰ per distance", () => {
    expect(content.getPassive("talon-lock").flight?.diveVPmDistance).toEqual({
      sprint: 100,
      mile: 250,
      medium: 500,
      long: 500,
    });
  });

  it("the trait carries the course distance's ‰; with the flag off, 500 everywhere", () => {
    const want: Record<string, number> = {
      sprint: 100,
      steps: 250,
      overlook: 250,
      ridge: 500,
      circuit: 500,
      breakaway: 500,
      canyon: 500,
      crossing: 500,
    };
    const off = rulesetV3(1, FLIGHT_OFF_TRIM);
    for (const [id, pm] of Object.entries(want)) {
      const c = courseOf(id);
      expect(freezeEntry(RULESET_V3, content, peregrina(), c, 0).traits.diveSkill).toEqual({
        fromBand: 2,
        pm,
      });
      expect(freezeEntry(off, content, peregrina(), c, 0).traits.diveSkill).toEqual({
        fromBand: 2,
        pm: 500,
      });
    }
    // v1, v2 and the homes flag off never freeze it
    for (const R of [RULESET_V1, RULESET_V2, rulesetV3(1, FLIGHT_OFF_HOMES)])
      expect(freezeEntry(R, content, peregrina(), courseOf("sprint"), 0).traits.diveSkill).toBe(
        undefined,
      );
  });

  it("a Sprint dive gains a tenth more: the skill's part is 1/11 of the gain", () => {
    const c = courseOf("sprint");
    const d = myDives(simulateRace(RULESET_V3, mirror(RULESET_V3, c), c, "trim-1"));
    expect(d.length).toBeGreaterThan(0);
    for (const e of d) {
      expect(e.skillId).toBe("talon-lock");
      expect(Math.abs((e.skillMms ?? 0) * 11 - e.gainMms)).toBeLessThanOrEqual(11);
    }
  });

  it("FLIGHT_OFF_HOMES carries the trim flag (INV-13 keeps measuring the polish)", () => {
    expect(FLIGHT_OFF_HOMES.skillFlightDistance).toBe(false);
    expect(FLIGHT_V3_E1.skillFlightDistance).toBe(true);
  });
});

describe("trim: the Escapada (breakaway), the Punta's home in the Media", () => {
  it("is a 2400 m Media of abstract features: Salto in the start, two Colinas, curvas, Pasillo to the line", () => {
    const c = courseOf("breakaway");
    const L = c.segments.reduce((a, s) => a + s.length, 0);
    expect(L).toBe(2400);
    expect(distanceOfLength(FLIGHT_V3_E1, L * 1000)).toBe("medium");
    expect(c.segments.map((s) => s.type)).toEqual([
      "flat",
      "jump",
      "flat",
      "climb",
      "flat",
      "climb",
      "flat",
      "curves",
      "flat",
      "canyon",
    ]);
    // the Salto lies inside the start (the first sixth: 400 m), and a llano parts it from the first
    // Colina: a skim planned to start inside the Salto she jumps on her legs never took off (trim-final.md)
    expect((c.segments[0]?.length ?? 0) + (c.segments[1]?.length ?? 0)).toBeLessThan(400);
    expect(c.segments[2]?.length ?? 0).toBeGreaterThanOrEqual(60);
    expect(content.courses.has("breakaway")).toBe(false);
    expect(content.text.get("course.breakaway")).toBe("Escapada");
  });

  it("races deterministically", () => {
    const c = courseOf("breakaway");
    const a = simulateRace(RULESET_V3, mirror(RULESET_V3, c), c, "trim-2", { detail: "full" });
    const b = simulateRace(RULESET_V3, mirror(RULESET_V3, c), c, "trim-2", { detail: "full" });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
