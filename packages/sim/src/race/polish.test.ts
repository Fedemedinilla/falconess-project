import { loadCatalogueCourses, loadContent } from "@falconess/content";
import type { Course, Position, RaceEntry, RaceLog, Style } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { simulateRace } from "./engine.js";
import { freezeSkill } from "./entry.js";
import { neutralFixtureEntry } from "./fixtures.js";
import { FLIGHT_OFF_POLISH, RULESET_V3, rulesetV3 } from "./flight.js";

/**
 * Balance polish (2026-11-09, .work/design7/measure/polish-final.md): every great dive keeps room
 * to the line, the Punta jumps the start's Saltos on her legs, the bar budgets the plan at her own
 * Resistencia, η reads her Courage against her build and a dive is a descent for the descent
 * skills. FLIGHT_OFF_POLISH is the kick on low hp (95e469f) byte for byte (polish/inv12.ts).
 */
const content = loadContent();
const catalogue = new Map(loadCatalogueCourses().map((c) => [c.id, c]));
const courseOf = (id: string): Course => catalogue.get(id) ?? content.getCourse(id);
const S = (v: number) => ({ agility: v, stamina: v, technique: v, courage: v, intelligence: v });
const ORDER: readonly [Style, Position][] = [
  ["glide", "lead"],
  ["ground", "pack"],
  ["hover", "stalk"],
  ["dive", "closer"],
];
function field(st: number, skills: readonly string[] = []): RaceEntry[] {
  return Array.from({ length: 8 }, (_, j) => {
    const [style, position] = ORDER[j % 4] ?? ["glide", "lead"];
    const e = neutralFixtureEntry({
      runnerId: `r${j}`,
      laneIndex: j,
      style,
      position,
      stats: S(st),
      skills: position === "closer" ? skills.map((id) => freezeSkill(content, id)) : [],
    });
    return { ...e, distanceAptitude: "B" as const };
  });
}
const OFF = rulesetV3(1, FLIGHT_OFF_POLISH);
const takeoffs = (log: RaceLog, pos: Position) =>
  (log.events ?? []).flatMap((e) =>
    e.kind === "takeoff" && log.entries[e.lane]?.position === pos ? [e.posMm] : [],
  );
const dives = (log: RaceLog, pos: Position) =>
  (log.events ?? []).flatMap((e) =>
    e.kind === "diveStart" && log.entries[e.lane]?.position === pos ? [e.posMm] : [],
  );

describe("balance polish", () => {
  it("the circuit's Remate dives 300 m out, before the water and the Salto, not 60 m out", () => {
    const c = courseOf("circuit");
    const on = simulateRace(RULESET_V3, field(600), c, "polish-room");
    const off = simulateRace(OFF, field(600), c, "polish-room");
    expect(Math.max(...dives(off, "closer"))).toBeGreaterThan(2_130_000);
    for (const x of dives(on, "closer")) expect(x).toBeLessThanOrEqual(1_900_000);
    for (const x of takeoffs(on, "closer")) expect(x).toBeGreaterThanOrEqual(1_700_000);
  });

  it("the steps' Punta jumps the start's Salto on her legs and skims from the start's end", () => {
    const c = courseOf("steps");
    const on = simulateRace(RULESET_V3, field(600), c, "polish-lead");
    const off = simulateRace(OFF, field(600), c, "polish-lead");
    expect(Math.min(...takeoffs(off, "lead"))).toBeLessThan(250_000);
    for (const x of takeoffs(on, "lead")) expect(x).toBeGreaterThanOrEqual(310_000);
    const jumped = (log: RaceLog) =>
      (log.events ?? []).filter(
        (e) => e.kind === "jumpOk" && log.entries[e.lane]?.position === "lead" && e.posMm < 320_000,
      ).length;
    expect(jumped(on)).toBe(2);
    expect(jumped(off)).toBe(0);
  });

  it("the bar budgets her plan at her own Resistencia: more bar at 300, less at 750, same at 600", () => {
    const c = courseOf("sprint");
    for (const [st, sign] of [
      [300, 1],
      [600, 0],
      [750, -1],
    ] as const) {
      const on = simulateRace(RULESET_V3, field(st), c, "polish-hp");
      const off = simulateRace(OFF, field(st), c, "polish-hp");
      const closer = on.entries.findIndex((e) => e.position === "closer");
      const d = (on.derived[closer]?.hpMax ?? 0) - (off.derived[closer]?.hpMax ?? 0);
      expect(Math.sign(d)).toBe(sign);
    }
  });

  it("a dive from the ceiling is a descent for a descent skill (the sprint has no Bajada)", () => {
    const c = courseOf("sprint");
    const fired = (log: RaceLog) =>
      (log.events ?? []).filter(
        (e) => e.kind === "skill" && log.entries[e.lane]?.position === "closer",
      ).length;
    const on = simulateRace(RULESET_V3, field(600, ["gravity-friend"]), c, "polish-skill");
    const off = simulateRace(OFF, field(600, ["gravity-friend"]), c, "polish-skill");
    expect(fired(off)).toBe(0);
    expect(fired(on)).toBeGreaterThan(0);
  });
});
