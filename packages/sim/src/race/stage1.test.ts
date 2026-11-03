import { loadCatalogueCourses, loadContent } from "@falconess/content";
import type { Course, Position, RaceEntry, Style } from "@falconess/schema";
import { RACE_FRAME_FLAGS, RaceLog } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { RULESET_V2 } from "../rulesets/index.js";
import { simulateRace, simulateRaceReversed } from "./engine.js";
import { freezeSkill } from "./entry.js";
import { neutralFixtureEntry } from "./fixtures.js";
import {
  airOffsetPm,
  FLIGHT_OFF_1_2,
  FLIGHT_OFF_1_3,
  FLIGHT_V3_E1,
  RULESET_V3,
  rulesetV3,
  WINGS_V3,
} from "./flight.js";

/**
 * Ruleset v3 stage 1 (diseno-v3-vuelo.md): the flight log (1.1), the struggle up there (1.2, L1-L6)
 * and the takeoff styles with the held skill (1.3, S1-S2, L7).
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
/** 8 hover stalks: the high band is full (L3, L4). */
const crowded = (st = 600) => field(st, () => ({ style: "hover", position: "stalk" }));
const courses = (): Course[] => [
  ...["sprint", "ridge", "canyon"].map((c) => content.getCourse(c)),
  ...loadCatalogueCourses(),
];
const results = (log: RaceLog) => JSON.stringify(log.results);

describe("ruleset v3 stage 1: the race does not depend on lane order (INV-4)", () => {
  it("step B in reverse lane order gives the same results, in v2 and in v3 with the struggle", () => {
    for (const course of courses())
      for (const [R, E] of [
        [RULESET_V3, field(450)],
        [RULESET_V3, crowded(600)],
        [RULESET_V2, field(600)],
      ] as const) {
        const seed = `inv4/${course.id}`;
        const a = simulateRace(R, E, course, seed, { detail: "results" });
        const b = simulateRaceReversed(R, E, course, seed, { detail: "results" });
        expect(results(b), `${R.version} ${course.id}`).toBe(results(a));
      }
  });
});

describe("ruleset v3 stage 1: the log (step 1.1)", () => {
  it("detail results and full give the same results; the full log parses strictly", () => {
    for (const course of courses().slice(0, 4)) {
      const E = crowded(450);
      const full = simulateRace(RULESET_V3, E, course, "detail");
      const res = simulateRace(RULESET_V3, E, course, "detail", { detail: "results" });
      expect(results(res)).toBe(results(full));
      expect(RaceLog.parse(full)).toEqual(full);
      // the plan of the card is only in the full log
      expect(full.derived.some((d) => (d.flightPlan?.length ?? 0) > 0)).toBe(true);
      expect(res.derived.every((d) => d.flightPlan === undefined)).toBe(true);
    }
  });

  it("v2 logs write no stage-1 key: no flight plan, no dirty-air bit, no held ticks", () => {
    const log = simulateRace(RULESET_V2, crowded(600), content.getCourse("ridge"), "v2");
    expect(log.derived.every((d) => !("flightPlan" in d))).toBe(true);
    for (const r of log.frames?.runners ?? [])
      expect(r.flags.every((f) => (f & RACE_FRAME_FLAGS.dirtyAir) === 0)).toBe(true);
    for (const e of log.events ?? []) if (e.kind === "skill") expect("heldTicks" in e).toBe(false);
  });

  it("the ledger counts what the events tell: passes, line changes, falls", () => {
    for (const course of courses().slice(0, 3)) {
      const log = simulateRace(RULESET_V3, crowded(450), course, "ledger");
      const ev = log.events ?? [];
      for (const r of log.results) {
        const f = r.ledger.flight;
        const mine = ev.filter((e) => e.lane === r.lane);
        const passes = mine.filter((e) => e.kind === "pass");
        expect(f?.passesAir, course.id).toBe(
          passes.filter((e) => e.kind === "pass" && e.band >= 1).length,
        );
        expect(f?.passesDive).toBe(passes.filter((e) => e.kind === "pass" && e.band === 0).length);
        const lc = mine.filter((e) => e.kind === "lineChange");
        expect(f?.overs).toBe(
          lc.filter((e) => e.kind === "lineChange" && e.cause === "over").length,
        );
        expect(f?.knocks).toBe(
          lc.filter((e) => e.kind === "lineChange" && e.cause === "knock").length,
        );
        const falls = mine.filter((e) => e.kind === "touchdown" && e.cause === "energy");
        expect(f?.falls).toBe(falls.length);
      }
    }
  });
});

describe("ruleset v3 stage 1: the struggle up there (step 1.2)", () => {
  it("L1: every flight's air has the same width whatever the technique (AIR-4)", () => {
    for (const technique of [0, 300, 600, 900, 1200, 2000]) {
      const v = Array.from({ length: 256 }, (_, byte) =>
        airOffsetPm(FLIGHT_V3_E1, byte, technique),
      );
      expect(Math.max(...v) - Math.min(...v)).toBe(2 * FLIGHT_V3_E1.airWPm);
    }
    // technique only moves the centre: ±7.5 ‰ between 300 and 900
    const mid = (t: number) => airOffsetPm(FLIGHT_V3_E1, 128, t);
    expect(mid(900) - mid(600)).toBe(7);
    expect(mid(600) - mid(300)).toBe(8);
    expect(airOffsetPm({ ...FLIGHT_V3_E1, airWPm: 0 }, 77, 900)).toBe(0);
  });

  it("L1: the air of each flight comes from the pre-drawn block (no draw in the tick)", () => {
    const log = simulateRace(RULESET_V3, field(600), content.getCourse("sprint"), "air");
    const air = (log.events ?? []).flatMap((e) => (e.kind === "takeoff" ? [e.airPm] : []));
    expect(air.length).toBeGreaterThan(0);
    for (const a of air) expect(Math.abs(a)).toBeLessThanOrEqual(26 + 9);
    expect(new Set(air).size).toBeGreaterThan(1);
  });

  it("L3-L4: a full high band has dirty air, climbs over and knocks; only stage 1.2 has them", () => {
    let dirty = 0;
    let overs = 0;
    let knocks = 0;
    for (const course of courses().slice(0, 3)) {
      const log = simulateRace(RULESET_V3, crowded(600), course, "crowd");
      for (const r of log.results) {
        dirty += r.ledger.flight?.dirtyTicks ?? 0;
        overs += r.ledger.flight?.overs ?? 0;
        knocks += r.ledger.flight?.knocks ?? 0;
      }
      const flags = log.frames?.runners.flatMap((r) => r.flags) ?? [];
      expect(flags.some((f) => (f & RACE_FRAME_FLAGS.dirtyAir) !== 0)).toBe(true);
      const off = simulateRace(rulesetV3(1, FLIGHT_OFF_1_2), crowded(600), course, "crowd");
      for (const r of off.results) {
        expect(r.ledger.flight?.dirtyTicks).toBe(0);
        expect((r.ledger.flight?.overs ?? 0) + (r.ledger.flight?.knocks ?? 0)).toBe(0);
      }
    }
    expect(dirty).toBeGreaterThan(0);
    expect(overs).toBeGreaterThan(0);
    expect(knocks).toBeGreaterThan(0);
  });

  it("L6: a fall forced by the tank lands with a loss and no dive", () => {
    // a very bad air (W 400 ‰, ×10 per ‰) makes holding cost more than the plan reserved
    const R = rulesetV3(1, { airWPm: 400 });
    let falls = 0;
    for (const course of courses().slice(0, 3))
      for (const seed of ["f1", "f2", "f3"]) {
        const log = simulateRace(R, field(450), course, seed);
        const ev = log.events ?? [];
        for (const e of ev) {
          if (e.kind !== "touchdown" || e.cause !== "energy") continue;
          falls += 1;
          expect(e.lossMms).toBeGreaterThan(0);
          expect(ev.some((d) => d.kind === "dive" && d.lane === e.lane && d.tick === e.tick)).toBe(
            false,
          );
        }
      }
    expect(falls).toBeGreaterThan(0);
  });

  it("L5: courage sets the dive, η = 700 + 600·min(C, 1200)/1200", () => {
    const gain = (c: number) => {
      const E = field(600).map((e) => ({ ...e, stats: { ...e.stats, courage: c } }));
      const R = rulesetV3(1, FLIGHT_OFF_1_3); // neutral wings: no ×1.25 of the Lanza
      const log = simulateRace(R, E, content.getCourse("sprint"), "eta5");
      const d = (log.events ?? []).find((e) => e.kind === "dive" && e.fromBand === 3);
      return d?.kind === "dive" ? d.gainMms : -1;
    };
    expect(gain(600)).toBe(6000);
    expect(gain(1)).toBe(4200);
    expect(gain(2000)).toBe(7800);
  });
});

describe("ruleset v3 stage 1: takeoff styles and the held skill (step 1.3)", () => {
  it("S1: the Lanza leaves 960 ‰ of her speed on the ground, the Rampa all of it", () => {
    const log = simulateRace(RULESET_V3, field(600), content.getCourse("canyon"), "lift");
    const t = (log.events ?? []).flatMap((e) => (e.kind === "takeoff" ? [e] : []));
    for (const e of t) {
      const keep = WINGS_V3.find((w) => w.style === e.style)?.liftSpeedPm ?? 0;
      expect(Math.abs(e.vAfterMms - Math.floor((e.vMms * keep) / 1000))).toBeLessThanOrEqual(1);
    }
    expect(new Set(t.map((e) => e.style))).toEqual(new Set(["lance", "column"]));
  });

  it("S2: from a cornisa the climb takes half the ticks, never under 3", () => {
    // the ridge's closers take off at the cornisa of the final's descent
    const E = field(600, (lane) => ({ style: ORDER[lane % 4] ?? "glide", position: "closer" }));
    const log = simulateRace(RULESET_V3, E, content.getCourse("ridge"), "corn");
    const ticks: Record<string, number> = {};
    for (const e of log.events ?? []) if (e.kind === "takeoff") ticks[e.style] = e.climbTicks;
    expect(ticks).toEqual({ lance: 3, column: 3, ramp: 6 });
  });

  it("L7: a skill that fires in the air is held and released whole on touchdown", () => {
    const strike = freezeSkill(content, "stoop-strike");
    const E = field(600).map((e) => (e.position === "closer" ? { ...e, skills: [strike] } : e));
    let held = 0;
    for (const seed of ["s1", "s2", "s3", "s4", "s5", "s6"]) {
      const log = simulateRace(RULESET_V3, E, content.getCourse("ridge"), seed);
      const ev = log.events ?? [];
      for (const e of ev) {
        if (e.kind !== "skill" || e.heldTicks === undefined) continue;
        held += 1;
        const down = ev.find(
          (d) => d.kind === "touchdown" && d.lane === e.lane && d.tick >= e.tick,
        );
        expect(down).toBeDefined();
        expect((down?.tick ?? 0) - e.tick).toBe(e.heldTicks);
      }
      const off = simulateRace(
        rulesetV3(1, { heldSkill: false }),
        E,
        content.getCourse("ridge"),
        seed,
      );
      for (const e of off.events ?? []) if (e.kind === "skill") expect(e.heldTicks).toBeUndefined();
    }
    expect(held).toBeGreaterThan(0);
  });
});
