import { loadContent } from "@falconess/content";
import type { Position, RaceEntry, RaceLog, Style } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { RULESET_V3 } from "../rulesets/index.js";
import { FLIGHT_OFF_ALLFLY, rulesetV3With } from "../rulesets/v3/switches.js";
import { simulateRace, simulateRaceReversed } from "./engine.js";
import { neutralFixtureEntry } from "./fixtures.js";

/**
 * «Todas vuelan» (owner, 2026-11-08): the lead skims (band 1) early and over Colina, Terreno
 * líquido and Salto before the final; the pack skims the long flats and the Pasillos; a skim pays
 * part of the terrain, the Salto and the water and gets a short lift push. allFly off is the two
 * lines of 84dc112 byte for byte (allfly/inv8.ts).
 */
const content = loadContent();
const ORDER: Style[] = ["glide", "ground", "hover", "dive"];
const DEFAULT: Record<Style, Position> = {
  glide: "lead",
  ground: "pack",
  hover: "stalk",
  dive: "closer",
};
const stats = (st: number) => ({
  agility: st,
  stamina: st,
  technique: st,
  courage: st,
  intelligence: st,
});
function field(
  st = 600,
  pick?: (lane: number) => { style: Style; position: Position },
): RaceEntry[] {
  return Array.from({ length: 8 }, (_, lane) => {
    const style = ORDER[lane % 4] ?? "glide";
    const p = pick?.(lane) ?? { style, position: DEFAULT[style] };
    return neutralFixtureEntry({ runnerId: `r${lane}`, laneIndex: lane, ...p, stats: stats(st) });
  });
}
type Ev = NonNullable<RaceLog["events"]>[number];
const events = <K extends Ev["kind"]>(log: RaceLog, kind: K) =>
  (log.events ?? []).filter((e): e is Extract<Ev, { kind: K }> => e.kind === kind);
const OFF = rulesetV3With(FLIGHT_OFF_ALLFLY);

describe("todas vuelan (2026-11-08)", () => {
  it("off, the lead and the default pack never take off on the sprint; on, both skim at band 1", () => {
    const E = field();
    const course = content.getCourse("sprint");
    const lanes = (pos: Position) => E.filter((e) => e.position === pos).map((e) => e.laneIndex);
    const off = simulateRace(OFF, E, course, "af");
    for (const p of ["lead", "pack"] as const)
      expect(events(off, "takeoff").filter((e) => lanes(p).includes(e.lane))).toHaveLength(0);
    const on = simulateRace(RULESET_V3, E, course, "af");
    for (const p of ["lead", "pack"] as const) {
      const t = events(on, "takeoff").filter((e) => lanes(p).includes(e.lane));
      expect(t.length).toBeGreaterThan(0);
      for (const e of t) expect(e.band).toBe(1);
    }
  });

  it("the lead's skims end before the final (it belongs to the legs and the dive)", () => {
    for (const id of ["sprint", "ridge", "canyon"]) {
      const log = simulateRace(RULESET_V3, field(), content.getCourse(id), "af");
      const fs = log.geometry.finalStartMm;
      log.entries.forEach((e, lane) => {
        if (e.position !== "lead") return; // the pack's Pasillo (F1) may lie in the final
        for (const f of log.derived[lane]?.flightPlan ?? []) expect(f.bMm).toBeLessThanOrEqual(fs);
      });
    }
  });

  it("a skim over a Salto pays skimJumpPm of its lift; the free skim spends nothing on it", () => {
    const E = field(600, (lane) => ({ style: "glide", position: lane < 4 ? "lead" : "stalk" }));
    const course = content.getCourse("ridge");
    const lift = (R: typeof RULESET_V3) =>
      simulateRace(R, E, course, "jump")
        .results.filter((r) => r.lane < 4)
        .reduce((p, r) => p + (r.ledger.energyLift ?? 0), 0);
    const paid = lift(RULESET_V3);
    const free = lift(rulesetV3With({ skimJumpPm: 0 }));
    expect(paid).toBeGreaterThan(free);
  });

  it("a skim from the ground adds skimLiftMms to her speed; 0 adds nothing", () => {
    const course = content.getCourse("sprint");
    const take = (R: typeof RULESET_V3) =>
      events(simulateRace(R, field(), course, "push"), "takeoff").filter(
        (e) => e.band === 1 && e.fromBand === 0 && e.style === "turbine",
      );
    const a = take(RULESET_V3);
    const b = take(rulesetV3With({ skimLiftMms: 0 }));
    expect(a.length).toBeGreaterThan(0);
    for (const e of a) expect(e.vAfterMms - e.vMms).toBe(RULESET_V3.flight.skimLiftMms);
    for (const e of b) expect(e.vAfterMms).toBe(e.vMms);
  });

  it("lane order never moves a race with everyone in the air", () => {
    for (const id of ["sprint", "ridge", "canyon"]) {
      const course = content.getCourse(id);
      const a = simulateRace(RULESET_V3, field(), course, "lane");
      const b = simulateRaceReversed(RULESET_V3, field(), course, "lane");
      expect(JSON.stringify(b.results)).toBe(JSON.stringify(a.results));
    }
  });
});
