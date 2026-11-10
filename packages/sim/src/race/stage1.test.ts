import { loadCatalogueCourses, loadContent } from "@falconess/content";
import type { Course, Position, RaceEntry, Style } from "@falconess/schema";
import { RACE_FRAME_FLAGS, RaceLog } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { RULESET_V2, RULESET_V3, type RulesetV3 } from "../rulesets/index.js";
import {
  FLIGHT_OFF_1_2,
  FLIGHT_OFF_1_3,
  FLIGHT_OFF_NEUTRAL,
  FLIGHT_OFF_R5,
  rulesetV3With,
  WINGS_V3,
} from "../rulesets/v3/switches.js";
import { simulateRace, simulateRaceProbed, simulateRaceReversed } from "./engine.js";
import { freezeSkill } from "./entry.js";
import { neutralFixtureEntry } from "./fixtures.js";
import { airOffsetPm } from "./flight.js";
import { ibps } from "./state.js";

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
        airOffsetPm(RULESET_V3.flight, byte, technique),
      );
      expect(Math.max(...v) - Math.min(...v)).toBe(2 * RULESET_V3.flight.airWPm);
    }
    // technique only moves the centre: ±7.5 ‰ between 300 and 900
    const mid = (t: number) => airOffsetPm(RULESET_V3.flight, 128, t);
    expect(mid(900) - mid(600)).toBe(7);
    expect(mid(600) - mid(300)).toBe(8);
    expect(airOffsetPm({ ...RULESET_V3.flight, airWPm: 0 }, 77, 900)).toBe(0);
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
      const off = simulateRace(rulesetV3With(FLIGHT_OFF_1_2), crowded(600), course, "crowd");
      for (const r of off.results) {
        expect(r.ledger.flight?.dirtyTicks).toBe(0);
        expect((r.ledger.flight?.overs ?? 0) + (r.ledger.flight?.knocks ?? 0)).toBe(0);
      }
    }
    expect(dirty).toBeGreaterThan(0);
    expect(overs).toBeGreaterThan(0);
    expect(knocks).toBeGreaterThan(0);
  });

  it("L1b: the air cruise reads airPacePm ‰ of her pace draw (0 = the centre, 1000 = the ground's)", () => {
    const course = content.getCourse("sprint");
    const tables = (airPacePm: number) => {
      let vC: number[] = [];
      let vCAir: number[] = [];
      simulateRaceProbed(rulesetV3With({ airPacePm }), field(600), course, "pace", (t, A) => {
        if (t > 0) return;
        const idx = Array.from({ length: 8 }, (_, i) => [0, 1, 2].map((ph) => ibps(i, 0, ph, 0)));
        vC = idx.flat().map((x) => A.tables.vC[x] ?? 0);
        vCAir = idx.flat().map((x) => A.tables.vCAir[x] ?? 0);
      });
      return { vC, vCAir };
    };
    const centre = tables(0).vCAir;
    const full = tables(1000);
    const part = tables(RULESET_V3.flight.airPacePm).vCAir;
    expect(full.vCAir).toEqual(full.vC);
    expect(full.vC.some((v, k) => v !== centre[k])).toBe(true);
    full.vC.forEach((v, k) => {
      const c = centre[k] ?? 0;
      const p = part[k] ?? 0;
      // between the centre and her draw, on her draw's side
      expect(Math.abs(p - c)).toBeLessThanOrEqual(Math.abs(v - c));
      expect(Math.sign(p - c) * Math.sign(v - c)).toBeGreaterThanOrEqual(0);
    });
  });

  it("L3-L4: within fightM it is dirty air and the fight for the line (fightM 0: the whole wake)", () => {
    let wide = 0;
    let close = 0;
    let dirtyClose = 0;
    for (const course of courses().slice(0, 3)) {
      const a = simulateRace(rulesetV3With({ fightM: 0 }), crowded(600), course, "fight");
      const b = simulateRace(rulesetV3With({ fightM: 1 }), crowded(600), course, "fight");
      for (const r of a.results)
        wide += (r.ledger.flight?.overs ?? 0) + (r.ledger.flight?.knocks ?? 0);
      for (const r of b.results) {
        close += (r.ledger.flight?.overs ?? 0) + (r.ledger.flight?.knocks ?? 0);
        dirtyClose += r.ledger.flight?.dirtyTicks ?? 0;
      }
    }
    expect(dirtyClose).toBeGreaterThan(0);
    expect(close).toBeLessThan(wide);
  });

  it("L3: the high band's wake reaches dirtyHighM (round 5: it tows); the ceiling keeps dirtyM", () => {
    const closers = field(600, () => ({ style: "dive", position: "closer" }));
    let short = 0;
    let long = 0;
    for (const course of courses().slice(0, 3)) {
      for (const r of simulateRace(rulesetV3With({ dirtyHighM: 0 }), crowded(600), course, "wake")
        .results)
        short += r.ledger.flight?.towTicks ?? 0;
      for (const r of simulateRace(RULESET_V3, crowded(600), course, "wake").results)
        long += r.ledger.flight?.towTicks ?? 0;
      // closers that nobody knocks down never hold the high band: the longer wake does not reach them
      const noKnock = { knockTicks: 0 };
      const a = simulateRace(rulesetV3With({ ...noKnock, dirtyHighM: 0 }), closers, course, "ceil");
      const b = simulateRace(rulesetV3With(noKnock), closers, course, "ceil");
      expect(results(b)).toBe(results(a));
    }
    expect(RULESET_V3.flight.dirtyHighM).toBeGreaterThan(RULESET_V3.flight.dirtyM);
    expect(long).toBeGreaterThan(short);
  });

  it("R3c: the closer's keep already pays her ceiling flight; a stalk's flight stays on top", () => {
    // 8 Picada closers on the ridge (T46): with R3c they spend on the first descent what v3 kept
    // twice (the keep for the final plus the flight reserve), so less energy reaches 1200 m
    const closers = field(600, () => ({ style: "dive", position: "closer" }));
    const ridge = content.getCourse("ridge");
    const left = (R: RulesetV3) => {
      const fr = simulateRace(R, closers, ridge, "keep").frames;
      let e = 0;
      for (const r of fr?.runners ?? [])
        e += r.energy[r.posMm.findIndex((x) => x >= 1_200_000)] ?? 0;
      return e;
    };
    expect(left(RULESET_V3)).toBeLessThan(left(rulesetV3With({ keepFlown: false })));
    // a stalk plans a mid-race flight in the high band: her keep still adds its reserve
    for (const course of courses().slice(0, 3))
      expect(results(simulateRace(RULESET_V3, crowded(600), course, "keep"))).toBe(
        results(simulateRace(rulesetV3With({ keepFlown: false }), crowded(600), course, "keep")),
      );
  });

  it("L6: a fall forced by the tank lands with a loss and no dive", () => {
    // a very bad air (W 400 ‰, ×10 per ‰) makes holding cost more than the plan reserved
    const R = rulesetV3With({ airWPm: 400 });
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
      const R = rulesetV3With(FLIGHT_OFF_1_3); // neutral wings: no ×1.25 of the Lanza
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
    // neutral wings (owner 2026-11-08): every wing keeps all her speed; FLIGHT_OFF_NEUTRAL is S1's
    for (const R of [rulesetV3With(FLIGHT_OFF_NEUTRAL), RULESET_V3]) {
      const log = simulateRace(R, field(600), content.getCourse("canyon"), "lift");
      const t = (log.events ?? []).flatMap((e) => (e.kind === "takeoff" ? [e] : []));
      // everyone flies: a skim from the ground (band 1) keeps all her speed and adds the lift push
      const push = R.flight.skimLiftMms;
      const row = (style: string) => R.flight.wings.find((w) => w.style === style);
      for (const e of t) {
        const skim = e.band === 1 && e.fromBand === 0;
        const keep = skim ? 1000 : (row(e.style)?.liftSpeedPm ?? 0);
        const add = skim ? push : 0;
        expect(
          Math.abs(e.vAfterMms - Math.floor((e.vMms * keep) / 1000) - add),
        ).toBeLessThanOrEqual(1);
        expect(e.band).toBeLessThanOrEqual(row(e.style)?.maxBand ?? 0);
      }
      // round 5: the default field's pack (Rasante) skims with the Turbina (F1, F8); the lead (Planeo) skims too
      expect(new Set(t.map((e) => e.style))).toEqual(
        new Set(["lance", "column", "ramp", "turbine"]),
      );
    }
    expect(WINGS_V3.find((w) => w.style === "lance")?.liftSpeedPm).toBe(960);
    expect(RULESET_V3.flight.wings.every((w) => w.liftSpeedPm === 1000)).toBe(true);
  });

  it("S2: from a cornisa the climb takes half the ticks, never under 2 (round 5; 3 before)", () => {
    // the ridge's closers take off at the cornisa of the final's descent
    const E = field(600, (lane) => ({ style: ORDER[lane % 4] ?? "glide", position: "closer" }));
    const log = simulateRace(RULESET_V3, E, content.getCourse("ridge"), "corn");
    const ticks: Record<string, number> = {};
    for (const e of log.events ?? []) if (e.kind === "takeoff") ticks[e.style] = e.climbTicks;
    // neutral wings: the Turbina climbs to the ceiling too (3 ticks per band, 2 from a cornisa)
    expect(ticks).toEqual({ lance: 2, column: 2, ramp: 4, turbine: 2 });
    const r4: Record<string, number> = {};
    const old = simulateRace(rulesetV3With(FLIGHT_OFF_R5), E, content.getCourse("ridge"), "corn");
    for (const e of old.events ?? []) if (e.kind === "takeoff") r4[e.style] = e.climbTicks;
    expect(r4).toEqual({ lance: 3, column: 3, ramp: 6 });
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
        rulesetV3With({ heldSkill: false }),
        E,
        content.getCourse("ridge"),
        seed,
      );
      for (const e of off.events ?? []) if (e.kind === "skill") expect(e.heldTicks).toBeUndefined();
    }
    expect(held).toBeGreaterThan(0);
  });
});
