import { loadContent } from "@falconess/content";
import { Rng } from "@falconess/rng";
import type { Course, RaceEntry, Style } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { RULESET_V1, type Ruleset } from "../rulesets/index.js";
import {
  type Controller,
  createController,
  decide,
  keepOk,
  licenceOk,
  selectMode,
} from "./controller.js";
import { simulateRace, simulateRaceProbed } from "./engine.js";
import { freezeEntry } from "./entry.js";
import { neutralFixtureEntry } from "./fixtures.js";
import { buildCourseGeometry, type CourseGeometry, phaseOf } from "./geometry.js";
import {
  buildTables,
  createRaceArena,
  drawRaceBlock,
  F_AIRBORNE,
  F_EXHAUSTED,
  F_PLAN_ACTIVE,
  ib,
  initState,
  type RaceState,
  type RaceTables,
} from "./state.js";
import {
  MODE_DIVE_DESCENT,
  MODE_GLIDE_CHASE,
  MODE_GROUND_CONSTANT,
  MODE_HOLD,
  MODE_HOVER_CATCHUP,
  MODE_KICK,
  MODE_OFF,
  MODE_PLAN,
  MODE_PREHEAT,
  MODE_REGEN,
  MODE_SURPLUS,
  modeName,
  SEG_FLAT,
} from "./units.js";

/**
 * The controller of docs/race-engine.md 9 (and the Kōryū wiring of 12) rule by rule: each mode of
 * 9.4 from a constructed state, the precedence, the keeps of 9.2, the style hold, the gates and
 * their heat limits, the overheat licence of 9.3, the accumulator of 9.5 and free-first-boost; then
 * the same rules seen through simulateRace (pulses, preheat, the licence under a hot energy game).
 */

const content = loadContent();
const S600 = { agility: 600, stamina: 600, technique: 600, courage: 600, intelligence: 600 };
const QUIET: Ruleset = {
  ...RULESET_V1,
  race: { ...RULESET_V1.race, paceHalfWidth: 0, paceCentreSpan: 0, planErrorMax: 0 },
};
const SPRINT = content.getCourse("desert-sprint");
const RIDGE = content.getCourse("desert-ridge");
const M = 225_000; // pu per metre

function at<T>(arr: readonly T[] | undefined, i: number): T {
  const v = arr?.[i];
  if (v === undefined) throw new Error(`no element ${i}`);
  return v;
}

function fixture(style: Style, over: Partial<RaceEntry> = {}, lane = 0): RaceEntry {
  return {
    ...neutralFixtureEntry({ runnerId: `fx-${lane}`, laneIndex: lane, style, stats: S600 }),
    ...over,
  };
}

function withTraits(e: RaceEntry, traits: Partial<RaceEntry["traits"]>): RaceEntry {
  return { ...e, traits: { ...e.traits, ...traits } };
}

function testCourse(segments: Course["segments"]): Course {
  return {
    id: "test-course",
    version: 1,
    biome: "desert",
    traits: [],
    entries: 8,
    segments,
    textKey: "course.test",
  };
}

const FLAT = testCourse([{ type: "flat", length: 1000 }]);

type Setup = {
  G: CourseGeometry;
  T: RaceTables;
  S: RaceState;
  ctl: Controller;
  events: string[];
  /** Puts runner i at `x` pu (segment and the tick-start phase follow); returns the phase. */
  put: (x: number, i?: number) => number;
  /** selectMode for runner i at its current position. */
  mode: (i?: number) => number;
  /** decide for runner i at its current position; returns boostOn. */
  step: (i?: number, over?: boolean, t?: number) => boolean;
};

/** Tables and initial state of `entries` on `course`, plus a recording controller. */
function setup(entries: RaceEntry[], course: Course, ruleset: Ruleset = QUIET): Setup {
  const R = ruleset.race;
  const G = buildCourseGeometry(ruleset, course);
  const A = createRaceArena().reset(entries.length, G);
  drawRaceBlock(ruleset, entries, new Rng("controller"), A);
  buildTables(ruleset, entries, G, A);
  initState(ruleset, entries, A);
  const T = A.tables;
  const S = A.state;
  const events: string[] = [];
  const ctl = createController({
    boostMode: (i, m, level) => events.push(`mode ${i} ${modeName(m)} ${level}`),
    freeBoost: (i, segType) => events.push(`free ${i} ${segType}`),
    pulse: (i, chain, thrust, free, cd) =>
      events.push(`pulse ${i} ${chain} ${thrust} ${free} ${cd}`),
  });
  const put = (x: number, i = 0) => {
    S.pos[i] = x;
    let s = 0;
    while (s < G.S - 1 && x >= (G.segEnd[s] ?? 0)) s++;
    S.seg[i] = s;
    return phaseOf(G, x);
  };
  return {
    G,
    T,
    S,
    ctl,
    events,
    put,
    mode: (i = 0) => selectMode(R, G, T, S, i, phaseOf(G, S.pos[i] ?? 0), ctl),
    step: (i = 0, over = false, t = 0) => {
      decide(R, G, T, S, i, t, phaseOf(G, S.pos[i] ?? 0), over, ctl);
      return S.boostOn[i] === 1;
    },
  };
}

describe("modes of docs/race-engine.md 9.4 from a constructed state", () => {
  it("KICK from kickAt in the final; PLAN inside the plan window; HOLD outside it or at level 0", () => {
    const x = setup([fixture("dive")], SPRINT);
    const kickAt = x.T.kickAt[0] ?? 0;
    x.put(kickAt);
    expect([x.mode(), x.ctl.want]).toEqual([MODE_KICK, true]);
    x.S.flags[0] = (x.S.flags[0] ?? 0) | F_PLAN_ACTIVE;
    x.S.planLevel[0] = 27_000;
    x.S.planStartPos[0] = 900 * M;
    x.S.planEndPos[0] = 1100 * M;
    x.put(kickAt); // KICK beats PLAN
    expect(x.mode()).toBe(MODE_KICK);
    x.put(900 * M);
    expect([x.mode(), x.ctl.level, x.ctl.want]).toEqual([MODE_PLAN, 27_000, false]);
    x.put(900 * M - 1);
    expect(x.mode()).toBe(MODE_HOLD);
    x.put(1100 * M);
    expect(x.mode()).toBe(MODE_HOLD);
    x.S.planLevel[0] = 0;
    x.put(950 * M);
    expect(x.mode()).toBe(MODE_HOLD);
  });

  it("PLAN and HOLD beat every pre-final mode once the plan is active", () => {
    const x = setup([fixture("dive")], SPRINT);
    x.put(100 * M); // start phase, full tank: SURPLUS without a plan
    expect(x.mode()).toBe(MODE_SURPLUS);
    x.S.flags[0] = (x.S.flags[0] ?? 0) | F_PLAN_ACTIVE;
    expect(x.mode()).toBe(MODE_HOLD);
  });

  it("PREHEAT when the final is closer than the ticks the heat room allows at cruise; it beats SURPLUS", () => {
    const x = setup([withTraits(fixture("glide"), { heatToEnergyPm: 500 })], SPRINT);
    const G = x.G;
    // 69 000 mh of room / 2000 per tick = 35 ticks at the flat cruise of 352 500 vu
    const edge = G.finalStart - 35 * 352_500;
    x.put(edge);
    expect([x.mode(), x.ctl.want]).toEqual([MODE_PREHEAT, true]);
    x.put(edge - 1);
    expect(x.mode()).toBe(MODE_SURPLUS); // full tank otherwise
    x.S.heat[0] = 20_000; // less room: 25 ticks
    x.put(G.finalStart - 25 * 352_500);
    expect(x.mode()).toBe(MODE_PREHEAT);
    x.put(G.finalStart - 25 * 352_500 - 1);
    expect(x.mode()).not.toBe(MODE_PREHEAT);
    // no heat-to-energy trait, no PREHEAT
    const plain = setup([fixture("glide")], SPRINT);
    plain.put(edge);
    expect(plain.mode()).toBe(MODE_SURPLUS);
  });

  it("SURPLUS while energy − jr − capFinal ≥ costBoost (neutral dive on the sprint: 1 energy at the gun)", () => {
    const x = setup([fixture("dive")], SPRINT);
    x.put(0);
    expect(x.T.capFinal[ib(0, 0)]).toBe(99_000);
    expect(x.mode()).toBe(MODE_SURPLUS);
    x.S.energy[0] = 99_999;
    expect(x.mode()).toBe(MODE_OFF);
    // a pulse frame commits a whole burst: 14 400 above capFinal
    const sh = freezeEntry(
      QUIET,
      content,
      {
        runnerId: "sh",
        kind: "rival",
        falconessId: null,
        baseStats: S600,
        mood: 0,
        biomeAptitude: { desert: "B", mountain: "B", coast: "B", urban: "B", tundra: "B" },
        styleAptitude: { dive: "B", hover: "B", glide: "B", ground: "B" },
        frameId: "shiden",
        parts: [],
        quirks: [],
        learnedSkills: [],
        durability: null,
      },
      SPRINT,
      0,
    );
    const p = setup([sh], SPRINT);
    p.put(0);
    p.S.energy[0] = 52_800 + 14_400;
    expect(p.mode()).toBe(MODE_SURPLUS);
    p.S.energy[0] = 52_800 + 14_399;
    expect(p.mode()).toBe(MODE_OFF);
  });

  it("REGEN when a regenerating tank is within two ticks of full; SURPLUS beats it; it beats the style row", () => {
    const lum = fixture("hover", { rule: "regen" });
    const x = setup([lum], RIDGE); // capFinal 120 000 > Emax: no SURPLUS on the ridge
    x.put(100 * M);
    x.S.energy[0] = 99_000;
    expect(x.mode()).toBe(MODE_REGEN);
    x.S.posFrac[0] = 1000; // behind the pack: REGEN still first
    expect(x.mode()).toBe(MODE_REGEN);
    x.S.energy[0] = 98_999;
    expect(x.mode()).toBe(MODE_HOVER_CATCHUP);
    const sprint = setup([lum], SPRINT);
    sprint.put(100 * M);
    expect(sprint.mode()).toBe(MODE_SURPLUS);
  });

  it("dive spends on descents before the final while it keeps 50 % + the jump reserve", () => {
    const x = setup([fixture("dive")], RIDGE);
    x.put(400 * M); // first descent, middle phase, jr 35 000
    x.S.energy[0] = 86_000; // 86 000 − 1000 − 35 000 = 50 000
    expect([x.mode(), x.ctl.want]).toEqual([MODE_DIVE_DESCENT, true]);
    expect(keepOk(QUIET.race, x.T, x.S, 0, QUIET.race.style.diveKeep)).toBe(true);
    x.S.energy[0] = 85_999;
    expect([x.mode(), x.ctl.want]).toEqual([MODE_DIVE_DESCENT, false]);
    x.put(1000 * M); // flat
    expect(x.mode()).toBe(MODE_OFF);
    x.put(1400 * M); // second descent, but in the final phase
    expect(x.mode()).toBe(MODE_OFF);
  });

  it("hover catches up from behind the middle pack (keep 50 %); glide chases when not leading (keep 60 %)", () => {
    const h = setup([fixture("hover")], SPRINT);
    h.put(500 * M);
    h.S.energy[0] = 60_000;
    expect(h.mode()).toBe(MODE_OFF); // posFrac 0
    h.S.posFrac[0] = 857;
    expect([h.mode(), h.ctl.want]).toEqual([MODE_HOVER_CATCHUP, true]);
    h.S.holdLeft[0] = 0;
    h.S.posFrac[0] = 750; // inside the pack
    expect(h.mode()).toBe(MODE_OFF);
    h.S.posFrac[0] = 1000;
    h.S.energy[0] = 50_999; // 50 999 − 1000 < 50 000
    expect([h.mode(), h.ctl.want]).toEqual([MODE_HOVER_CATCHUP, false]);

    const g = setup([fixture("glide")], SPRINT);
    g.put(500 * M);
    g.S.energy[0] = 61_000;
    expect(g.mode()).toBe(MODE_OFF); // leading
    g.S.ahead[0] = 1;
    expect([g.mode(), g.ctl.want]).toEqual([MODE_GLIDE_CHASE, true]);
    g.S.holdLeft[0] = 0;
    g.S.energy[0] = 60_999;
    expect([g.mode(), g.ctl.want]).toEqual([MODE_GLIDE_CHASE, false]);
    g.put(900 * M); // final phase: no chase
    expect(g.mode()).toBe(MODE_OFF);
  });

  it("ground runs its constant level while 40 % of the tank (beyond the reserve) is left before the final", () => {
    const x = setup([fixture("ground")], SPRINT);
    x.put(500 * M);
    x.S.energy[0] = 40_000;
    expect([x.mode(), x.ctl.level]).toEqual([MODE_GROUND_CONSTANT, 5133]);
    x.S.energy[0] = 39_999;
    expect(x.mode()).toBe(MODE_OFF);
    x.S.energy[0] = 90_000;
    x.put(900 * M);
    expect(x.mode()).toBe(MODE_OFF);
  });
});

describe("style hold (docs/race-engine.md 9.4)", () => {
  it("a hover or glide intent sets a 12-tick hold that ignores intent and keep; rows 1-6 clear it", () => {
    const x = setup([fixture("glide")], SPRINT);
    x.put(500 * M);
    x.S.energy[0] = 70_000;
    x.S.ahead[0] = 1;
    x.mode();
    expect(x.S.holdLeft[0]).toBe(12);
    x.S.ahead[0] = 0; // now leading and nearly empty: the hold still wants boost
    x.S.energy[0] = 2000;
    x.S.holdLeft[0] = 5;
    expect([x.mode(), x.ctl.want]).toEqual([MODE_GLIDE_CHASE, true]);
    // a mode of rows 1-6 clears it (decide does)
    x.S.energy[0] = 100_000;
    x.put(10 * M);
    x.step();
    expect([x.S.mode[0], x.S.holdLeft[0]]).toEqual([MODE_SURPLUS, 0]);
  });

  it("no hold without want, and never for pulse frames", () => {
    const x = setup([fixture("hover")], SPRINT);
    x.put(500 * M);
    x.S.posFrac[0] = 1000;
    x.S.energy[0] = 10_000;
    x.mode();
    expect(x.S.holdLeft[0]).toBe(0);
    const p = setup([fixture("hover", { rule: "pulse" })], SPRINT);
    p.put(500 * M);
    p.S.posFrac[0] = 1000;
    p.S.energy[0] = 80_000;
    expect([p.mode(), p.ctl.want]).toEqual([MODE_HOVER_CATCHUP, true]);
    expect(p.S.holdLeft[0]).toBe(0);
  });

  it("through simulateRace a chasing glide boosts in spans of at least 12 ticks", () => {
    const entries = [fixture("glide", {}, 0), fixture("hover", { powerToWeight: 1300 }, 1)];
    const on: number[] = [];
    simulateRaceProbed(QUIET, entries, SPRINT, "hold", (_t, A) => {
      on.push(A.state.mode[0] === MODE_GLIDE_CHASE && A.state.boostOn[0] === 1 ? 1 : 0);
    });
    const spans: number[] = [];
    let run = 0;
    for (const b of on) {
      if (b === 1) run++;
      else if (run > 0) {
        spans.push(run);
        run = 0;
      }
    }
    expect(spans.length).toBeGreaterThan(0);
    // every span is a whole hold, except one ended by the keep running dry or the heat gate
    expect(spans.filter((s) => s >= 12).length).toBeGreaterThan(0);
  });
});

describe("gates of docs/race-engine.md 9.3 (true values)", () => {
  it("SURPLUS stops at 800 ‰ of capLim, REGEN at 900 ‰, every other mode at capLim", () => {
    const s = setup([fixture("dive")], SPRINT);
    s.put(0);
    s.S.heat[0] = 53_200; // + 2000 = 55 200 = 0.8 × 69 000
    expect(s.step()).toBe(true);
    s.S.energy[0] = 100_000;
    s.S.heat[0] = 53_201;
    expect(s.step()).toBe(false);

    const r = setup([fixture("hover", { rule: "regen" })], RIDGE);
    r.put(100 * M);
    r.S.energy[0] = 99_500;
    r.S.heat[0] = 60_100; // + 2000 = 62 100
    expect([r.step(), r.S.mode[0]]).toEqual([true, MODE_REGEN]);
    r.S.energy[0] = 99_500;
    r.S.heat[0] = 60_101;
    expect(r.step()).toBe(false);

    const k = setup([fixture("dive")], SPRINT);
    k.put(k.T.kickAt[0] ?? 0);
    k.S.heat[0] = 67_000;
    expect(k.step()).toBe(true);
    k.S.heat[0] = 67_001;
    expect(k.step()).toBe(false);
    // telemetry: raw dissipation
    const tel = setup([fixture("dive", { rule: "telemetry" })], SPRINT);
    tel.put(tel.T.kickAt[0] ?? 0);
    tel.S.heat[0] = 58_000;
    expect(tel.step()).toBe(true);
    tel.S.heat[0] = 58_001;
    expect(tel.step()).toBe(false);
  });

  it("every boost keeps energy − cost ≥ jr; a free-first-boost bit lifts the energy gate", () => {
    const x = setup([fixture("glide")], RIDGE);
    x.put(100 * M); // flat, jr 35 000
    x.S.holdLeft[0] = 5; // a hold wants boost whatever the keep says
    x.S.energy[0] = 36_000;
    expect(x.step()).toBe(true);
    x.S.energy[0] = 35_999;
    expect(x.step()).toBe(false);
    const f = setup([withTraits(fixture("glide"), { freeFirstBoostMask: 1 << SEG_FLAT })], RIDGE);
    f.put(100 * M);
    f.S.holdLeft[0] = 5;
    f.S.energy[0] = 0;
    expect([f.step(), f.S.freeTick[0], f.S.freeLeft[0]]).toEqual([true, 1, 11]);
    expect(f.events).toContain("free 0 0");
  });

  it("no thrust while exhausted, airborne, or (for flyers) on a jump segment; ground thrusts on its detour", () => {
    const x = setup([fixture("dive")], SPRINT);
    x.put(x.T.kickAt[0] ?? 0);
    x.S.flags[0] = (x.S.flags[0] ?? 0) | F_EXHAUSTED;
    expect(x.step()).toBe(false);
    const j = setup([fixture("hover"), fixture("ground", {}, 1)], RIDGE);
    j.put(1520 * M, 0);
    j.put(1520 * M, 1);
    for (const i of [0, 1]) {
      j.S.flags[i] = (j.S.flags[i] ?? 0) | F_PLAN_ACTIVE;
      j.S.planLevel[i] = 45_000;
      j.S.planStartPos[i] = 1400 * M;
      j.S.planEndPos[i] = 1900 * M;
      j.S.pulse.acc[i] = 45_000;
    }
    expect(j.step(0)).toBe(false); // on foot after a crash, or airborne
    expect(j.step(1)).toBe(true);
    j.S.flags[0] = (j.S.flags[0] ?? 0) | F_AIRBORNE;
    expect(j.step(0)).toBe(false);
  });
});

describe("overheat licence (docs/race-engine.md 9.3, D11)", () => {
  const R = QUIET.race;

  it("Steinhaus boosts past the cap in KICK while its projected durability after the tail stays above 25 %", () => {
    const x = setup([fixture("dive", { rule: "mass-thrust" })], FLAT);
    x.put(x.T.kickAt[0] ?? 0);
    x.S.heat[0] = 69_000; // at the cap: the heat gate refuses
    // tail: ceilDiv(69 000 + 2000 − 69 000, 500) = 4 overheated ticks × 2000 md
    x.S.dur[0] = 33_001;
    expect(licenceOk(R, x.T, x.S, 0, false)).toBe(true);
    expect(x.step()).toBe(true);
    x.S.dur[0] = 33_000; // 33 000 − 8000 = 25 000, not above the floor
    expect(licenceOk(R, x.T, x.S, 0, false)).toBe(false);
    expect(x.step()).toBe(false);
    // an overheated tick also pays its own damage
    x.S.dur[0] = 35_000;
    expect(licenceOk(R, x.T, x.S, 0, false)).toBe(true);
    expect(licenceOk(R, x.T, x.S, 0, true)).toBe(false);
  });

  it("the licence acts only in KICK and PLAN for Steinhaus: never in SURPLUS or the style modes", () => {
    const x = setup([fixture("glide", { rule: "mass-thrust" })], SPRINT);
    x.put(0);
    x.S.heat[0] = 69_000;
    expect([x.step(), x.S.mode[0]]).toEqual([false, MODE_SURPLUS]);
    x.put(500 * M);
    x.S.energy[0] = 70_000;
    x.S.heat[0] = 69_000;
    x.S.holdLeft[0] = 5;
    expect([x.step(), x.S.mode[0]]).toEqual([false, MODE_GLIDE_CHASE]);
  });

  it("telemetry never holds a licence, not even with heat immunity", () => {
    const tel = withTraits(fixture("dive", { rule: "telemetry" }), {
      heatImmune: true,
      heatImmuneUntilMm: null,
    });
    const x = setup([tel], FLAT);
    x.put(x.T.kickAt[0] ?? 0);
    x.S.heat[0] = 60_000;
    expect(licenceOk(R, x.T, x.S, 0, false)).toBe(false);
    expect(x.step()).toBe(false);
  });

  it("heat immunity: style modes included, only if the tail ends inside the window (hot-head 300 m)", () => {
    const hot = withTraits(fixture("glide"), { heatImmune: true, heatImmuneUntilMm: 300_000 });
    const x = setup([hot], FLAT);
    x.S.vOutPrev[0] = 352_500;
    x.S.holdLeft[0] = 5;
    x.S.energy[0] = 70_000;
    x.S.heat[0] = 69_000; // tail ceilDiv(2000, 1000) = 2 ticks: needs pos + 3 × vOutPrev < 300 m
    x.put(300 * M - 3 * 352_500 - 1);
    expect([x.step(), x.S.mode[0]]).toEqual([true, MODE_GLIDE_CHASE]);
    x.S.heat[0] = 69_000;
    x.put(300 * M - 3 * 352_500);
    expect(x.step()).toBe(false);
    // a whole-race immunity never ends
    const all = setup([withTraits(fixture("glide"), { heatImmune: true })], FLAT);
    all.S.holdLeft[0] = 5;
    all.S.energy[0] = 70_000;
    all.S.heat[0] = 69_000;
    all.put(900 * M - 1);
    all.put(500 * M);
    expect(all.step()).toBe(true);
  });

  it("through simulateRace under a hot energy game (kE 250): Steinhaus overheats only by boosting in PLAN or KICK and never breaks itself", () => {
    const KE: Ruleset = { ...QUIET, race: { ...QUIET.race, kE: 250 } };
    for (const course of [SPRINT, RIDGE]) {
      const falke = freezeEntry(
        KE,
        content,
        {
          runnerId: "falke",
          kind: "rival",
          falconessId: null,
          baseStats: S600,
          mood: 0,
          biomeAptitude: { desert: "B", mountain: "B", coast: "B", urban: "B", tundra: "B" },
          styleAptitude: { dive: "B", hover: "B", glide: "B", ground: "B" },
          frameId: "falke",
          parts: [],
          quirks: [],
          learnedSkills: [],
          durability: null,
        },
        course,
        0,
      );
      const floor = Math.floor((falke.durabilityMax * 1000 * KE.race.overheatFloorPm) / 1000);
      const bad: string[] = [];
      let licensed = 0;
      const log = simulateRaceProbed(KE, [falke], course, "lic", (t, A) => {
        const S = A.state;
        const T = A.tables;
        if (S.boostOn[0] === 1 && (S.heat[0] ?? 0) > (T.capLim[0] ?? 0)) {
          licensed++;
          const m = S.mode[0] ?? -1;
          if (m !== MODE_PLAN && m !== MODE_KICK) bad.push(`t${t} boosted past the cap in ${m}`);
        }
        if ((S.dur[0] ?? 0) <= floor) bad.push(`t${t} durability ${S.dur[0]}`);
      });
      expect(bad).toEqual([]);
      expect(licensed).toBeGreaterThan(0);
      const r = at(log.results, 0);
      expect(r.ledger.overheatTicks).toBeGreaterThan(0);
      expect(r.broken).toBe(false);
      expect(r.ledger.durabilityLost).toBe(r.ledger.overheatTicks * 2000);
    }
  });
});

describe("level accumulator (docs/race-engine.md 9.5)", () => {
  /** Ground in GROUND_CONSTANT on a flat middle phase with resources reset every tick. */
  function groundRun(n: number, block: (k: number) => boolean = () => false) {
    const x = setup([fixture("ground")], FLAT);
    x.put(300 * M);
    const level = x.T.groundLevel[ib(0, 0)] ?? 0;
    const unit = x.T.unit[ib(0, 0)] ?? 0;
    let on = 0;
    const acc: number[] = [];
    for (let k = 0; k < n; k++) {
      x.S.energy[0] = 50_000; // above the 40 % share, below SURPLUS (capFinal 81 000)
      x.S.heat[0] = block(k) ? 69_000 : 0;
      if (x.step()) on++;
      acc.push(x.S.pulse.acc[0] ?? 0);
    }
    return { x, level, unit, on, acc };
  }

  it("N unblocked ticks at level s give exactly fl(N × s, unit) on-ticks", () => {
    for (const n of [1, 7, 100, 333]) {
      const { level, unit, on } = groundRun(n);
      expect(level).toBeGreaterThan(0);
      expect(on).toBe(Math.floor((n * level) / unit));
    }
  });

  it("a gate block saturates the accumulator at unit + level; it fires once when the gate allows", () => {
    const { level, unit, acc, on } = groundRun(60, (k) => k < 50);
    expect(acc[49]).toBe(unit + level); // capped, overflow not dropped below unit
    expect(acc[50]).toBe(level); // fired: unit + level + level capped, then − unit
    expect(acc[51]).toBe(2 * level);
    // one catch-up on-tick, then the plain duty again: ticks 51..59 bring acc from level to 10 level
    expect(on).toBe(1 + Math.floor((10 * level) / unit));
  });

  it("no accrual on jump-blocked ticks (a flyer on a jump segment); ground accrues on its detour", () => {
    const x = setup([fixture("hover"), fixture("ground", {}, 1)], RIDGE);
    for (const i of [0, 1]) {
      x.put(1520 * M, i);
      x.S.flags[i] = (x.S.flags[i] ?? 0) | F_PLAN_ACTIVE;
      x.S.planLevel[i] = 10_000;
      x.S.planStartPos[i] = 1400 * M;
      x.S.planEndPos[i] = 1900 * M;
    }
    for (let k = 0; k < 3; k++) {
      x.step(0);
      x.step(1);
    }
    expect([x.S.pulse.acc[0], x.S.pulse.acc[1]]).toEqual([0, 30_000]);
  });

  it("a (mode, level) change resets it and logs one boostMode event", () => {
    const { x, level } = groundRun(3);
    expect(x.events).toEqual([`mode 0 ground-constant ${level}`]);
    x.S.energy[0] = 30_000; // below the share: OFF
    x.step();
    expect(x.S.pulse.acc[0]).toBe(0);
    expect(x.events).toEqual([`mode 0 ground-constant ${level}`, "mode 0 off 0"]);
  });
});

describe("free-first-boost on continuous frames (docs/race-engine.md 16 #8, D26)", () => {
  it("the first 12 boost ticks on the masked segment type are free; the bit is spent once", () => {
    const x = setup([withTraits(fixture("dive"), { freeFirstBoostMask: 1 << SEG_FLAT })], FLAT);
    x.put(x.T.kickAt[0] ?? 0);
    const free: number[] = [];
    for (let k = 0; k < 14; k++) {
      x.S.heat[0] = 0;
      x.step();
      free.push(x.S.freeTick[0] ?? 0);
    }
    expect(free).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0]);
    expect(x.events.filter((e) => e.startsWith("free"))).toEqual(["free 0 0"]);
    expect(x.S.pulse.freeMask[0]).toBe(0);
  });

  it("through simulateRace the free ticks cost no energy: the same tank buys 12 more boost ticks", () => {
    const plain = at(simulateRace(QUIET, [fixture("dive")], FLAT, "f").results, 0);
    const free = at(
      simulateRace(
        QUIET,
        [withTraits(fixture("dive"), { freeFirstBoostMask: 1 << SEG_FLAT })],
        FLAT,
        "f",
      ).results,
      0,
    );
    expect([free.ledger.energySpent, plain.ledger.energySpent]).toEqual([100_000, 100_000]);
    expect(
      free.ledger.boostTicks.reduce((a, b) => a + b, 0) -
        plain.ledger.boostTicks.reduce((a, b) => a + b, 0),
    ).toBe(12);
  });
});

describe("Kōryū through the controller (docs/race-engine.md 12, 13.1)", () => {
  const B = { desert: "B", mountain: "B", coast: "B", urban: "B", tundra: "B" } as const;
  const shiden = (course: Course) =>
    freezeEntry(
      QUIET,
      content,
      {
        runnerId: "shiden",
        kind: "rival",
        falconessId: null,
        baseStats: S600,
        mood: 0,
        biomeAptitude: B,
        styleAptitude: { dive: "B", hover: "B", glide: "B", ground: "B" },
        frameId: "shiden",
        parts: [],
        quirks: [],
        learnedSkills: [],
        durability: null,
      },
      course,
      0,
    );

  it("shiden on the sprint: 6 pulses of 12 ticks, 14 400 each, max cadence 42, third-pulse on every 3rd", () => {
    const log = simulateRace(QUIET, [shiden(SPRINT)], SPRINT, "pulse");
    const r = at(log.results, 0);
    const pulses = (log.events ?? []).filter((e) => e.kind === "pulse");
    expect(r.ledger.pulses).toBe(6);
    expect(pulses).toHaveLength(6);
    expect(r.ledger.boostTicks.reduce((a, b) => a + b, 0)).toBe(6 * 12);
    expect(r.ledger.energySpent).toBe(6 * 14_400);
    const rows = pulses.map((e) =>
      e.kind === "pulse" ? [e.tick, e.chain, e.thrustMms, e.free, e.cooldown] : [],
    );
    // SURPLUS fires three at max cadence in the start phase (desert air: 85 050 × 1.15 = 97 807 vu),
    // the third with the chain thrust ×1.2; the plan's three carry dive's stoop ×1.4 in the final
    expect(rows).toEqual([
      [0, 1, 6520, false, 30],
      [42, 2, 6520, false, 30],
      [84, 3, 7824, false, 30],
      [501, 1, 9128, false, 30],
      [543, 2, 9128, false, 30],
      [585, 3, 10_954, false, 30],
    ]);
    // a chain needs the first legal tick after the cooldown (readyAt): 42 apart
    expect(at(rows, 1)[0] as number).toBe((at(rows, 0)[0] as number) + 42);
  });

  it("no-pulse turns a pulse frame into continuous boost; free-first-boost makes a whole pulse free", () => {
    const np = withTraits(shiden(SPRINT), { noPulse: true });
    const log = simulateRace(QUIET, [np], SPRINT, "np");
    const r = at(log.results, 0);
    expect(r.ledger.pulses).toBe(0);
    expect(r.ledger.boostTicks.reduce((a, b) => a + b, 0)).toBeGreaterThan(72);
    expect(at(log.derived, 0).pulseMms).toBe(0);

    const free = withTraits(shiden(SPRINT), { freeFirstBoostMask: 1 << SEG_FLAT });
    const fl = simulateRace(QUIET, [free], SPRINT, "fp");
    const first = (fl.events ?? []).find((e) => e.kind === "pulse");
    expect(first?.kind === "pulse" && first.free).toBe(true);
    expect((fl.events ?? []).filter((e) => e.kind === "freeBoost")).toHaveLength(1);
    const rf = at(fl.results, 0);
    expect(rf.ledger.energySpent).toBe((rf.ledger.pulses - 1) * 14_400);
  });

  it("a pulse frame never boosts while airborne or exhausted (a takeoff ends its burst)", () => {
    const bad: number[] = [];
    simulateRaceProbed(QUIET, [shiden(RIDGE)], RIDGE, "air", (t, A) => {
      const f = A.state.flags[0] ?? 0;
      if (A.state.boostOn[0] === 1 && (f & (F_AIRBORNE | F_EXHAUSTED)) !== 0) bad.push(t);
    });
    expect(bad).toEqual([]);
  });
});

describe("PREHEAT through simulateRace (docs/race-engine.md 9.4, 16 #12)", () => {
  it("a heat-to-energy holder boosts every tick from the preheat point and converts the heat at final entry", () => {
    const holder = withTraits(fixture("glide"), { heatToEnergyPm: 500 });
    const ticks: number[] = [];
    const log = simulateRaceProbed(QUIET, [holder], SPRINT, "pre", (_t, A) => {
      if (A.state.mode[0] === MODE_PREHEAT) ticks.push(A.state.boostOn[0] ?? 0);
    });
    const ev = (log.events ?? []).find((e) => e.kind === "heatToEnergy");
    expect(ticks.length).toBeGreaterThan(20);
    expect(ticks.every((b) => b === 1)).toBe(true);
    // the entry condition counts ticks at cruise; boosting moves faster, so the runner arrives
    // after fewer ticks than the heat room allows: 31 × 2000 of the 35 × 2000 room
    expect(ev?.kind === "heatToEnergy" && [ev.heat, ev.energy]).toEqual([
      ticks.length * 2000,
      ticks.length * 1000,
    ]);
    expect(ticks.length).toBe(31);
  });
});
