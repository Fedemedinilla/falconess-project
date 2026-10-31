import { loadContent } from "@falconess/content";
import type { Course, RaceEntry, RaceEvent, RaceSkill, Style } from "@falconess/schema";
import { RACE_FRAME_FLAGS, RaceLog } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { RULESET_V1, type Ruleset } from "../rulesets/index.js";
import { KEY_FINISHED, rankSnapshot } from "./controller.js";
import { simulateRace, simulateRaceProbed } from "./engine.js";
import { freezeSkill } from "./entry.js";
import { neutralFixtureEntry } from "./fixtures.js";
import { buildCourseGeometry } from "./geometry.js";
import {
  createRaceArena,
  F_AIRBORNE,
  F_BROKEN,
  F_DASH,
  F_EXHAUSTED,
  F_FINISHED,
  F_PENDING_JUMP,
  type RaceArena,
} from "./state.js";
import { SPEC_RULESET } from "./testing/spec-ruleset.js";

/**
 * Mechanics of docs/race-engine.md 5-8, 13, 14, 16 and 19 through simulateRace, with the test-only
 * probe of 24.2 (P4) reading the state after every tick. Where a mechanic needs a state the
 * controller never reaches (heat above the cap, energy below the tank), the probe sets it between
 * two ticks; where boost would blur the mechanic under test, `NO_BOOST` prices a boost tick above
 * any tank, so every gate refuses it (the controller still runs).
 */

const content = loadContent();
const S600 = { agility: 600, stamina: 600, technique: 600, courage: 600, intelligence: 600 };
const QUIET: Ruleset = {
  ...SPEC_RULESET,
  race: { ...SPEC_RULESET.race, paceHalfWidth: 0, paceCentreSpan: 0, planErrorMax: 0 },
};
/** A boost tick costs more than any tank (200 energy): the energy gate refuses every boost. */
const NO_BOOST: Ruleset = { ...QUIET, race: { ...QUIET.race, kE: 1_000_000 } };
const M = 225_000; // pu per metre

function at<T>(arr: readonly T[] | undefined, i: number): T {
  const v = arr?.[i];
  if (v === undefined) throw new Error(`no element ${i}`);
  return v;
}

function fixture(style: Style, lane = 0, over: Partial<RaceEntry> = {}): RaceEntry {
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
    traits: [],
    entries: 8,
    segments,
    textKey: "course.test",
  };
}

/** A skill that always fires on its trigger when it is the runner's lucky pick. */
function luckySkill(
  id: string,
  trigger: Partial<RaceSkill["trigger"]>,
  effect: Partial<RaceSkill["effect"]>,
): RaceSkill {
  return {
    id,
    uniqueTo: null,
    activationBasePm: 1000,
    trigger: {
      phase: "any",
      segment: null,
      posLoPm: null,
      posHiPm: null,
      heatAboveMilli: null,
      energyBelowMilli: null,
      once: true,
      ...trigger,
    },
    effect: {
      speedMms: 0,
      accelMms2: 0,
      energyRefundMilli: 0,
      heatCoolMilli: 0,
      durabilityGuard: false,
      durationTicks: 0,
      ...effect,
    },
    disabled: false,
  };
}

type Row = {
  t: number;
  pos: number;
  vCore: number;
  vOut: number;
  seg: number;
  energy: number;
  heat: number;
  dur: number;
  hp: number;
  stall: number;
  flags: number;
  b: number;
  planCount: number;
};

/** Per-tick state of `lane`, with an optional hook that may set state between ticks. */
function trace(
  ruleset: Ruleset,
  entries: RaceEntry[],
  course: Course,
  seed = "trace",
  lane = 0,
  hook?: (t: number, A: RaceArena) => void,
): { log: RaceLog; rows: Row[] } {
  const rows: Row[] = [];
  const log = simulateRaceProbed(ruleset, entries, course, seed, (t, A) => {
    const S = A.state;
    rows.push({
      t,
      pos: S.pos[lane] ?? 0,
      vCore: S.vCore[lane] ?? 0,
      vOut: S.vOut[lane] ?? 0,
      seg: S.seg[lane] ?? 0,
      energy: S.energy[lane] ?? 0,
      heat: S.heat[lane] ?? 0,
      dur: S.dur[lane] ?? 0,
      hp: S.hp[lane] ?? 0,
      stall: S.stall[lane] ?? 0,
      flags: S.flags[lane] ?? 0,
      b: S.b[lane] ?? 0,
      planCount: S.planCount[lane] ?? 0,
    });
    hook?.(t, A);
  });
  return { log, rows };
}

function events<K extends RaceEvent["kind"]>(log: RaceLog, kind: K, lane = 0) {
  return (log.events ?? []).filter(
    (e): e is Extract<RaceEvent, { kind: K }> => e.kind === kind && e.lane === lane,
  );
}

const LONG_FLAT = testCourse([{ type: "flat", length: 2000 }]);

describe("speed: start dash, acceleration, deceleration (docs/race-engine.md 5)", () => {
  it("vStart 45 000 vu, the dash passes 255 000 in 9 ticks, then 400 vu per tick to 352 500", () => {
    const { rows } = trace(QUIET, [fixture("hover")], LONG_FLAT);
    const v = rows.map((r) => r.vCore);
    expect(v.slice(0, 10)).toEqual([
      69_400, 93_800, 118_200, 142_600, 167_000, 191_400, 215_800, 240_200, 264_600, 265_000,
    ]);
    expect((at(rows, 8).flags & F_DASH) !== 0).toBe(true);
    expect((at(rows, 9).flags & F_DASH) !== 0).toBe(false);
    const cruiseAt = v.indexOf(352_500);
    expect(cruiseAt).toBe(9 + Math.ceil((352_500 - 265_000) / 400));
    expect(v.slice(cruiseAt).every((x) => x === 352_500)).toBe(true);
  });

  it("a PW 0.7 frame dashes to 0.85 × its own target (209 737), then accelerates at 280", () => {
    const { rows } = trace(QUIET, [fixture("hover", 0, { powerToWeight: 700 })], LONG_FLAT);
    const cleared = rows.findIndex((r) => (r.flags & F_DASH) === 0);
    const before = at(rows, cleared - 1).vCore;
    expect(before).toBeGreaterThanOrEqual(209_737);
    expect(before - 24_280).toBeLessThan(209_737);
    expect(at(rows, cleared).vCore - before).toBe(280);
    expect(Math.max(...rows.map((r) => r.vCore))).toBe(246_750);
  });

  it("glide's launch: 440 vu per tick in the start phase only, 400 in the middle", () => {
    const sprint = content.getCourse("sprint");
    const { rows } = trace(QUIET, [fixture("glide")], sprint);
    const G = buildCourseGeometry(QUIET, sprint);
    const steps = rows.slice(10, 400).map((r, k) => ({
      pos: at(rows, k + 9).pos,
      dv: r.vCore - at(rows, k + 9).vCore,
      seg: at(rows, k + 9).seg,
    }));
    const start = steps.filter((s) => s.pos < G.startEnd && s.seg === 0 && s.dv > 0);
    const middle = steps.filter((s) => s.pos >= G.startEnd && s.seg === 0 && s.dv > 0);
    expect(start.length).toBeGreaterThan(50);
    expect(middle.length).toBeGreaterThan(5);
    expect(start.every((s) => s.dv === 440)).toBe(true);
    expect(middle.slice(0, -1).every((s) => s.dv === 400)).toBe(true);
  });

  it("a target drop is rate-limited at 3000 vu per tick (water f 800: 24 ticks from cruise)", () => {
    const c = testCourse([
      { type: "flat", length: 1000 },
      { type: "water", length: 300, drag: 0.2 },
    ]);
    const { rows } = trace(QUIET, [fixture("hover")], c);
    // the tick that crosses into the water is still governed by the flat (2: segment at tick start)
    const k = rows.findIndex((r) => r.seg === 1) + 1;
    const v = rows.slice(k, k + 26).map((r) => r.vCore);
    expect(at(rows, k - 1).vCore).toBe(352_500);
    expect(v.slice(0, 3)).toEqual([349_500, 346_500, 343_500]);
    expect(v.indexOf(282_000)).toBe(23);
  });
});

describe("hover slipstream and glide lead (docs/race-engine.md 9.7, 9.8)", () => {
  it("hover drafts ×1.02 only in the middle phase while in the middle pack, never solo", () => {
    const course = content.getCourse("canyon");
    const entries = [
      fixture("hover", 0, { stats: { ...S600, agility: 700 } }),
      fixture("hover", 1),
      fixture("hover", 2, { stats: { ...S600, agility: 500 } }),
    ];
    const { log, rows } = trace(QUIET, entries, course, "draft", 1);
    const G = buildCourseGeometry(QUIET, course);
    const draft = log.results.map((r) => [r.lane, r.ledger.draftTicks]);
    expect(draft.find(([l]) => l === 1)?.[1]).toBeGreaterThan(500);
    expect(draft.filter(([l]) => l !== 1).every(([, d]) => d === 0)).toBe(true);
    // on the long flat of the middle phase the drafting hover cruises at 352 500 × 1.02
    const midFlat = rows.filter((r) => r.seg === 3 && r.pos < G.finalStart);
    expect(midFlat.some((r) => r.vCore === 359_550)).toBe(true);
    const flags = at(log.frames?.runners, 1).flags;
    expect(flags.some((f) => (f & RACE_FRAME_FLAGS.drafting) !== 0)).toBe(true);
    const solo = simulateRace(QUIET, [fixture("hover")], course, "solo");
    expect(at(solo.results, 0).ledger.draftTicks).toBe(0);
  });

  it("a glide holding the lead drains ×0.98; caught, it loses the discount", () => {
    const sprint = content.getCourse("sprint");
    const hover = at(simulateRace(QUIET, [fixture("hover")], sprint, "g").results, 0);
    const glide = at(simulateRace(QUIET, [fixture("glide")], sprint, "g").results, 0);
    expect(glide.hpEnd).toBeGreaterThan(hover.hpEnd);
    // behind a much faster runner the glide pays full drain
    const chased = simulateRace(
      QUIET,
      [fixture("glide", 0), fixture("hover", 1, { powerToWeight: 1600 })],
      sprint,
      "g",
    );
    const g2 = at(
      chased.results.filter((r) => r.lane === 0),
      0,
    );
    expect(g2.hpEnd).toBeLessThan(glide.hpEnd);
  });
});

describe("hp and exhaustion (docs/race-engine.md 6)", () => {
  it("St 1 empties on the canyon: hpEmpty once, target vMin (17 m/s at the line), hp stays 0", () => {
    const canyon = content.getCourse("canyon");
    const { log, rows } = trace(
      QUIET,
      [fixture("dive", 0, { stats: { ...S600, stamina: 1 } })],
      canyon,
    );
    const r = at(log.results, 0);
    const empties = events(log, "hpEmpty");
    expect(empties).toHaveLength(1);
    expect(r.exhausted).toBe(true);
    expect(r.ledger.hpEmptyMm).toBe(at(empties, 0).posMm);
    const k = rows.findIndex((x) => (x.flags & F_EXHAUSTED) !== 0);
    expect(rows.slice(k).every((x) => x.hp === 0)).toBe(true);
    expect(r.vFinishMms).toBe(17_000);
    expect(r.hpEnd).toBe(0);
  });
});

describe("overheat, durability and broken wings (docs/race-engine.md 8)", () => {
  /** Puts `heat` mh into lane 0 at the end of tick `t0`. */
  const heatAt = (t0: number, heat: number) => (t: number, A: RaceArena) => {
    if (t === t0) A.state.heat[0] = heat;
  };

  it("×0.92 on the moved speed only, one flag per tick, −1000 md per overheated tick, events on transitions", () => {
    const { log, rows } = trace(
      QUIET,
      [fixture("hover")],
      LONG_FLAT,
      "oh",
      0,
      heatAt(400, 119_000),
    );
    const over = rows.filter((r) => r.t > 400 && r.t <= 450);
    expect(over.every((r) => r.vCore === 352_500 && r.vOut === 324_300)).toBe(true);
    expect(at(rows, 451).vOut).toBe(352_500);
    const r = at(log.results, 0);
    expect(r.ledger.overheatTicks).toBe(50);
    expect([r.ledger.durabilityLost, r.durabilityEnd]).toEqual([50_000, 50_000]);
    expect(events(log, "overheat").map((e) => [e.tick, e.on, e.heat])).toEqual([
      [401, true, 119_000],
      [451, false, 69_000],
    ]);
  });

  it("Steinhaus: no speed penalty, ×2 durability, cooling 500", () => {
    const mt = fixture("hover", 0, { rule: "mass-thrust" });
    const { log, rows } = trace(NO_BOOST, [mt], LONG_FLAT, "mt", 0, heatAt(400, 79_000));
    expect(rows.filter((r) => r.t > 400 && r.t <= 420).every((r) => r.vOut === r.vCore)).toBe(true);
    expect(at(log.results, 0).ledger.overheatTicks).toBe(20);
    expect(at(log.results, 0).durabilityEnd).toBe(60_000);
  });

  it("telemetry clamps heat at raw dissipation after every heat update", () => {
    const tel = fixture("hover", 0, { rule: "telemetry" });
    const { rows } = trace(QUIET, [tel], LONG_FLAT, "tel", 0, heatAt(400, 119_000));
    expect(at(rows, 401).heat).toBe(60_000);
    expect(rows.slice(401).every((r) => r.heat <= 60_000)).toBe(true);
  });

  it("a durability guard blocks overheat damage; heat immunity blocks the penalty inside its window", () => {
    const guard = luckySkill("guard", {}, { durabilityGuard: true, durationTicks: 300 });
    const guarded = withTraits(fixture("hover", 0, { skills: [guard] }), {
      randomSkillGuaranteed: true,
    });
    const g = trace(QUIET, [guarded], LONG_FLAT, "guard", 0, heatAt(10, 119_000));
    expect(at(g.log.results, 0).ledger.overheatTicks).toBe(50);
    expect(at(g.log.results, 0).durabilityEnd).toBe(100_000);
    const hot = withTraits(fixture("hover"), { heatImmune: true, heatImmuneUntilMm: 300_000 });
    const h = trace(QUIET, [hot], LONG_FLAT, "hot", 0, heatAt(10, 10_000_000));
    const inside = h.rows.filter((r) => r.t > 10 && r.pos + r.vOut < 300 * M);
    const outside = h.rows.filter((r) => r.t > 10 && r.pos - r.vOut > 300 * M && r.t < 9000);
    expect(inside.length).toBeGreaterThan(10);
    expect(inside.every((r) => r.vOut === r.vCore)).toBe(true);
    expect(outside.length).toBeGreaterThan(10);
    expect(outside.every((r) => r.vOut < r.vCore)).toBe(true);
  });

  it("a runner that starts at durability 0 runs the broken table (PW × 0.75) with no event", () => {
    const sprint = content.getCourse("sprint");
    const intact = at(simulateRace(QUIET, [fixture("hover")], sprint, "b").results, 0);
    const brokenLog = simulateRace(
      QUIET,
      [fixture("hover", 0, { durabilityStart: 0 })],
      sprint,
      "b",
    );
    const broken = at(brokenLog.results, 0);
    expect(broken.broken).toBe(true);
    expect(broken.finishMilli ?? 0).toBeGreaterThan(intact.finishMilli ?? 0);
    expect(events(brokenLog, "durabilityBroken")).toEqual([]);
  });

  it("wings broken by a water hit: one durabilityBroken event (PW 750), then the broken table", () => {
    const canyon = content.getCourse("canyon");
    const { log, rows } = trace(QUIET, [fixture("glide", 0, { durabilityStart: 3 })], canyon);
    const ev = events(log, "durabilityBroken");
    expect(ev.map((e) => e.powerToWeight)).toEqual([750]);
    const water = events(log, "waterHit");
    expect(water.map((e) => e.damage)).toEqual([10_000]);
    expect(at(ev, 0).tick).toBe(at(water, 0).tick);
    const k = rows.findIndex((r) => (r.flags & F_BROKEN) !== 0);
    expect(at(rows, k).b).toBe(1);
    expect(at(log.results, 0).durabilityEnd).toBe(0);
    expect(at(log.results, 0).ledger.durabilityLost).toBe(3000);
  });
});

describe("brokenSpeedPm (docs/race-engine.md 8.4, ADR-0003 D56)", () => {
  /** The spec's broken wings moved from the PW cut to the speed factor. */
  const SPEED: Ruleset = {
    ...QUIET,
    race: { ...QUIET.race, durabilityZeroPowerMult: 1000, brokenSpeedPm: 750 },
  };

  it("overridden to 750 with a neutral PW cut it runs the spec's race; only the event's PW changes", () => {
    const canyon = content.getCourse("canyon");
    const field = [
      fixture("glide", 0, { durabilityStart: 3 }), // breaks in the water
      fixture("hover", 1, { durabilityStart: 0 }), // broken from the start
      fixture("dive", 2, { powerToWeight: 1400, durabilityStart: 3 }),
      fixture("ground", 3, { durabilityStart: 5 }), // ground halves the water hit: breaks too
      fixture("hover", 4, { powerToWeight: 700 }),
    ];
    const spec = simulateRace(QUIET, field, canyon, "d56");
    const speed = simulateRace(SPEED, field, canyon, "d56");
    const brokenLanes = speed.results.filter((r) => r.broken).map((r) => r.lane);
    expect(brokenLanes.sort()).toEqual([0, 1, 2, 3]);
    const pwOf = (log: RaceLog) =>
      (log.events ?? [])
        .flatMap((e) => (e.kind === "durabilityBroken" ? [[e.lane, e.powerToWeight]] : []))
        .sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0));
    expect(pwOf(spec)).toEqual([
      [0, 750],
      [2, 1050],
      [3, 750],
    ]);
    expect(pwOf(speed)).toEqual([
      [0, 1000],
      [2, 1400],
      [3, 1000],
    ]);
    expect(spec.derived.map((d) => d.brokenSpeedPm)).toEqual([1000, 1000, 1000, 1000, 1000]);
    expect(speed.derived.map((d) => d.brokenSpeedPm)).toEqual([750, 750, 750, 750, 750]);
    // everything else is the same log: results, frames, every other event and derived value
    const rest = (log: RaceLog) => ({
      ...log,
      derived: log.derived.map(({ brokenSpeedPm: _, ...d }) => d),
      events: (log.events ?? []).map((e) =>
        e.kind === "durabilityBroken" ? { ...e, powerToWeight: 0 } : e,
      ),
    });
    expect(rest(speed)).toEqual(rest(spec));
  });

  it("overridden to 750 at the spec's weights a broken PW 1.4 frame cruises at 0.75 of its intact cruise", () => {
    const pw14 = fixture("hover", 0, { powerToWeight: 1400, durabilityStart: 1 });
    const breakAt = (t: number, A: RaceArena) => {
      if (t === 600) A.state.heat[0] = 200_000; // one overheated tick: −1000 md, broken
    };
    const noBoost: Ruleset = { ...SPEED, race: { ...SPEED.race, kE: 1_000_000 } };
    const { rows } = trace(noBoost, [pw14], LONG_FLAT, "pw14", 0, breakAt);
    const intactCruise = at(rows, 599).vCore;
    expect(intactCruise).toBe(493_500); // 352 500 × 1.4
    expect((at(rows, 601).flags & F_BROKEN) !== 0).toBe(true);
    expect(at(rows, 900).vCore).toBe(370_125); // 352 500 × 1.05
    expect(at(rows, 900).vCore * 1000).toBe(intactCruise * 750);
  });
});

describe("broken wings under the live ruleset (RULESET_V1; ADR-0005 pass 2, ADR-0003 D56)", () => {
  const V1_QUIET: Ruleset = {
    ...RULESET_V1,
    race: { ...RULESET_V1.race, paceHalfWidth: 0, paceCentreSpan: 0, planErrorMax: 0 },
  };

  it("v1 breaks wings with the speed factor, not the PW cut", () => {
    expect(RULESET_V1.race.durabilityZeroPowerMult).toBe(1000);
    expect(RULESET_V1.race.brokenSpeedPm).toBe(750);
  });

  it("a frame broken mid-race keeps its PW in the event and cruises 25 % slower from the break on", () => {
    const e = fixture("hover", 0, { durabilityStart: 1 });
    const breakAt = (t: number, A: RaceArena) => {
      if (t === 400) A.state.heat[0] = 200_000; // one overheated tick: −1000 md, broken
    };
    const noBoost: Ruleset = { ...V1_QUIET, race: { ...V1_QUIET.race, kE: 1_000_000 } };
    const { log, rows } = trace(noBoost, [e], LONG_FLAT, "v1", 0, breakAt);
    expect(events(log, "durabilityBroken").map((x) => x.powerToWeight)).toEqual([1000]);
    expect(at(log.derived, 0).brokenSpeedPm).toBe(750);
    expect(at(rows, 399).vCore).toBe(352_500);
    expect(at(rows, 700).vCore).toBe(264_375); // ×0.75 with the v1 weights 5 / 250
  });

  it("a broken frame loses about 25 % of its mean speed on every v1 course, for PW 0.7, 1.0 and 1.4", () => {
    for (const courseId of ["sprint", "ridge", "canyon"]) {
      const course = content.getCourse(courseId);
      for (const powerToWeight of [700, 1000, 1400]) {
        const e = fixture("hover", 0, { powerToWeight });
        const intact = at(simulateRace(RULESET_V1, [e], course, "live").results, 0);
        const broken = at(
          simulateRace(RULESET_V1, [{ ...e, durabilityStart: 0 }], course, "live").results,
          0,
        );
        expect(broken.broken).toBe(true);
        // mean speed broken / intact: 0.75 of cruise and thrust, a little more for the start
        const ratio = (intact.finishMilli ?? 0) / (broken.finishMilli ?? 1);
        expect([courseId, powerToWeight, ratio > 0.74 && ratio < 0.79]).toEqual([
          courseId,
          powerToWeight,
          true,
        ]);
      }
    }
  });
});

describe("Boneyard repair (docs/race-engine.md 13)", () => {
  it("+2 durability on entering each flat segment past the first, capped, events only when it rose", () => {
    const canyon = content.getCourse("canyon");
    const worn = fixture("ground", 0, { rule: "repairable", durabilityStart: 90 });
    const log = simulateRace(QUIET, [worn], canyon, "rep");
    const r = at(log.results, 0);
    // flat 3 (+2), water (−5, ground), flat 6 (+2); the starting flat is not entered
    expect(events(log, "repair").map((e) => e.amount)).toEqual([2000, 2000]);
    expect([r.durabilityEnd, r.ledger.durabilityRepaired, r.ledger.durabilityLost]).toEqual([
      89_000, 4000, 5000,
    ]);
    const full = simulateRace(QUIET, [fixture("ground", 0, { rule: "repairable" })], canyon, "rep");
    expect(events(full, "repair").map((e) => e.amount)).toEqual([2000]); // only after the water hit
  });

  it("repairs never clear broken wings", () => {
    const ridge = content.getCourse("ridge");
    const log = simulateRace(
      QUIET,
      [fixture("ground", 0, { rule: "repairable", durabilityStart: 0 })],
      ridge,
      "rep",
    );
    const r = at(log.results, 0);
    expect(r.durabilityEnd).toBe(4000);
    expect(r.broken).toBe(true);
  });
});

describe("jumps (docs/race-engine.md 14)", () => {
  const JUMP_COURSE = testCourse([
    { type: "flat", length: 600 },
    { type: "jump", length: 100, liftRequired: 20 },
    { type: "flat", length: 600 },
  ]);

  it("success: resolved the tick after entry, lift on true energy, speed held at cruise, landing ×0.86", () => {
    const { log, rows } = trace(NO_BOOST, [fixture("hover")], JUMP_COURSE);
    const ok = events(log, "jumpOk");
    expect(ok.map((e) => [e.lift, e.required, e.energyBefore])).toEqual([
      [100_000, 20_000, 100_000],
    ]);
    const entry = rows.findIndex((r) => r.seg === 1);
    expect(at(ok, 0).tick).toBe(entry + 1);
    const air = rows.filter((r) => (r.flags & F_AIRBORNE) !== 0);
    expect(air.length).toBeGreaterThan(50);
    expect(air.every((r) => r.vCore === 352_500 && r.vOut === 352_500)).toBe(true);
    const land = events(log, "landing");
    expect(land.map((e) => e.speedLossMms)).toEqual([3290]);
    const out = rows.findIndex((r) => r.seg === 2);
    expect(at(rows, out).vCore).toBe(303_150);
    const r = at(log.results, 0);
    expect([r.energyEnd, r.ledger.energyLift, r.ledger.landingLossMms]).toEqual([
      80_000, 20_000, 3290,
    ]);
  });

  it("lift == required succeeds; high technique lifts with less energy than required", () => {
    const exact = simulateRace(QUIET, [fixture("hover", 0, { energy: 20 })], JUMP_COURSE, "j");
    expect(at(exact.results, 0).ledger.jumpsOk).toBe(1);
    expect(at(exact.results, 0).energyEnd).toBe(0);
    const c25 = testCourse([
      { type: "flat", length: 600 },
      { type: "jump", length: 100, liftRequired: 25 },
      { type: "flat", length: 300 },
    ]);
    const hiT = fixture("hover", 0, { energy: 20, stats: { ...S600, technique: 1200 } });
    const log = simulateRace(QUIET, [hiT], c25, "j");
    expect(events(log, "jumpOk").map((e) => [e.lift, e.required])).toEqual([[30_000, 25_000]]);
    expect(at(log.results, 0).ledger.energyLift).toBe(20_000);
  });

  it("failure: no lift spent, −25 durability, ×0.4, exactly 20 frozen ticks, then the recovery dash", () => {
    const weak = fixture("hover", 0, { energy: 20, stats: { ...S600, technique: 1 } });
    const { log, rows } = trace(NO_BOOST, [weak], JUMP_COURSE);
    const fail = events(log, "jumpFail");
    expect(fail.map((e) => [e.lift, e.required, e.energyBefore, e.damage, e.stallTicks])).toEqual([
      [10_000, 20_000, 20_000, 25_000, 20],
    ]);
    const tf = at(fail, 0).tick;
    const before = at(rows, tf - 1);
    expect(at(rows, tf).vCore).toBe(Math.floor((before.vCore * 400) / 1000));
    for (let k = tf; k < tf + 20; k++) {
      expect(at(rows, k).pos).toBe(before.pos);
      expect(at(rows, k).vOut).toBe(0);
    }
    expect(at(rows, tf + 20).pos).toBeGreaterThan(before.pos);
    expect(at(rows, tf + 20).vCore - at(rows, tf + 19).vCore).toBe(24_000 + 200); // dash + accel at T 1
    const r = at(log.results, 0);
    expect([r.energyEnd, r.durabilityEnd, r.ledger.stallTicks, r.ledger.jumpsFailed]).toEqual([
      20_000, 75_000, 20, 1,
    ]);
    expect(events(log, "landing")).toEqual([]); // a crashed runner crosses on foot and never lands
    const stalled = at(log.frames?.runners, 0).flags.filter(
      (f) => (f & RACE_FRAME_FLAGS.stalled) !== 0,
    );
    expect(stalled.length).toBeGreaterThan(0);
  });

  it("stalled ticks are not phase ticks (18 B11): phaseTicks + stallTicks = timeTicks", () => {
    // found by the differential harness against the prototype (.work/impl/diff): ticks lost to a
    // failed jump were counted twice, in phaseTicks (B1) and in stallTicks
    const G = buildCourseGeometry(NO_BOOST, JUMP_COURSE);
    const weak = fixture("hover", 0, { energy: 20, stats: { ...S600, technique: 1 } });
    const armored = withTraits(weak, { obstacleArmor: true, obstacleArmorExtraTicks: 10 });
    for (const [e, stall] of [
      [weak, 20],
      [armored, 30],
    ] as const) {
      const { log, rows } = trace(NO_BOOST, [e], JUMP_COURSE, "phase-ticks");
      const r = at(log.results, 0);
      const tf = at(events(log, "jumpFail"), 0).tick;
      const want = [0, 0, 0];
      for (let t = 0; t < (r.timeTicks ?? 0); t++) {
        if (t >= tf && t < tf + stall) continue;
        const start = t === 0 ? 0 : at(rows, t - 1).pos;
        const ph = start < G.startEnd ? 0 : start < G.finalStart ? 1 : 2;
        want[ph] = at(want, ph) + 1;
      }
      expect(r.ledger.stallTicks).toBe(stall);
      expect(r.ledger.phaseTicks).toEqual(want);
      expect(r.ledger.phaseTicks.reduce((a, b) => a + b, 0) + stall).toBe(r.timeTicks);
    }
  });

  it("stalled ticks cool and regenerate (and count skill timers), but never drain hp", () => {
    const weak = withTraits(fixture("hover", 0, { energy: 30, stats: { ...S600, technique: 1 } }), {
      regenMe: 250,
    });
    const { log, rows } = trace(QUIET, [weak], JUMP_COURSE, "stall", 0, (t, A) => {
      if (t === 0) {
        A.state.energy[0] = 10_000;
        A.state.heat[0] = 60_000;
      }
    });
    const tf = at(events(log, "jumpFail"), 0).tick;
    for (let k = tf + 1; k < tf + 20; k++) {
      expect(at(rows, k).heat).toBe(Math.max(0, at(rows, k - 1).heat - 1000));
      expect(at(rows, k).hp).toBe(at(rows, k - 1).hp);
      expect(at(rows, k).energy).toBe(Math.min(30_000, at(rows, k - 1).energy + 250));
    }
  });

  it("stalled ticks regenerate regenEff: × packRegenMultPm while in the middle pack (18 stalledTick)", () => {
    // the spec prototype adds the bare regenTick on a stalled tick; spec 18 (regenEff) wins, and the
    // differential harness patches the prototype to match (.work/impl/diff/proto.mjs)
    const lead = fixture("hover", 0, { stats: { ...S600, agility: 1200 } });
    const mid = withTraits(fixture("hover", 1, { stats: { ...S600, technique: 1 } }), {
      regenMe: 250,
      packRegenMultPm: 2000,
    });
    const tail = fixture("hover", 2, { powerToWeight: 500, stats: { ...S600, agility: 1 } });
    const energy: number[] = [];
    const posFrac: number[] = [];
    let drained = false;
    const log = simulateRaceProbed(
      NO_BOOST,
      [lead, mid, tail],
      JUMP_COURSE,
      "stall-pack",
      (_t, A) => {
        // the tick that enters the jump leaves the runner too little energy to lift (20 000 needed)
        if (!drained && ((A.state.flags[1] ?? 0) & F_PENDING_JUMP) !== 0) {
          A.state.energy[1] = 10_000;
          drained = true;
        }
        energy.push(A.state.energy[1] ?? 0);
        posFrac.push(A.state.posFrac[1] ?? 0);
      },
    );
    const tf = at(events(log, "jumpFail", 1), 0).tick;
    expect(
      at(
        log.results.filter((r) => r.lane === 1),
        0,
      ).ledger.stallTicks,
    ).toBe(20);
    for (let k = tf; k < tf + 20; k++) {
      expect(at(posFrac, k)).toBe(500); // second of three: in the pack
      expect(at(energy, k)).toBe(Math.min(100_000, at(energy, k - 1) + 500));
    }
  });

  it("a guard active at resolution blocks the crash damage; obstacle-armor: no damage, speed kept, stall 30", () => {
    const guard = luckySkill(
      "jump-guard",
      { segment: "jump" },
      { durabilityGuard: true, durationTicks: 30 },
    );
    const guarded = withTraits(
      fixture("hover", 0, { energy: 20, stats: { ...S600, technique: 1 }, skills: [guard] }),
      { randomSkillGuaranteed: true },
    );
    const g = simulateRace(QUIET, [guarded], JUMP_COURSE, "guard");
    expect(events(g, "jumpFail").map((e) => e.damage)).toEqual([0]);
    expect(at(g.results, 0).durabilityEnd).toBe(100_000);

    const armored = withTraits(
      fixture("hover", 0, { energy: 20, stats: { ...S600, technique: 1 } }),
      {
        obstacleArmor: true,
        obstacleArmorExtraTicks: 10,
      },
    );
    const { log, rows } = trace(QUIET, [armored], JUMP_COURSE, "armor");
    const fail = at(events(log, "jumpFail"), 0);
    expect([fail.damage, fail.stallTicks]).toEqual([0, 30]);
    expect(at(rows, fail.tick).vCore).toBe(at(rows, fail.tick - 1).vCore);
    expect((at(rows, fail.tick).flags & F_DASH) !== 0).toBe(false);
    expect(at(log.results, 0).ledger.stallTicks).toBe(30);
  });

  it("ground detours at 1.10 × the length (Boneyard 1.05): no lift, no landing, a detour event", () => {
    const ticksOnJump = (e: RaceEntry) => {
      const { log, rows } = trace(NO_BOOST, [e], JUMP_COURSE);
      return { log, n: rows.filter((r) => r.seg === 1).length };
    };
    const flyer = ticksOnJump(fixture("hover"));
    const ground = ticksOnJump(fixture("ground"));
    const boneyard = ticksOnJump(fixture("ground", 0, { rule: "repairable" }));
    // 100 m at 352 500 vu: 63.8 ticks flying; 320 454 vu of progress: 70.2; 335 714: 67.0
    expect([63, 64]).toContain(flyer.n);
    expect([70, 71]).toContain(ground.n);
    expect([67, 68]).toContain(boneyard.n);
    expect(events(ground.log, "detour").map((e) => e.segment)).toEqual([1]);
    expect(events(ground.log, "jumpOk")).toEqual([]);
    expect(events(ground.log, "landing")).toEqual([]);
    expect(at(ground.log.results, 0).energyEnd).toBe(100_000);
    const flags = at(ground.log.frames?.runners, 0).flags;
    expect(flags.some((f) => (f & RACE_FRAME_FLAGS.detour) !== 0)).toBe(true);
  });

  it("the sprint plan is (re)asked at the plan point and on each jump exit inside it", () => {
    const ridge = content.getCourse("ridge");
    const count = (style: Style) => {
      const { rows } = trace(QUIET, [fixture(style)], ridge);
      return at(rows, rows.length - 1).planCount;
    };
    expect(count("hover")).toBe(2); // plan at 1400 m, replan when leaving jump 2 (1580 m)
    expect(count("dive")).toBe(2);
    expect(count("ground")).toBe(1); // a ground runner never jumps
  });
});

describe("water (docs/race-engine.md 14.6)", () => {
  const canyon = content.getCourse("canyon");
  const hit = (e: RaceEntry) => {
    const log = simulateRace(QUIET, [e], canyon, "water");
    return [events(log, "waterHit").map((x) => x.damage), at(log.results, 0).ledger.stallTicks];
  };

  it("10 000 md at drag 0.2, ground 5000, armor or guard 0, never a stall", () => {
    expect(hit(fixture("hover"))).toEqual([[10_000], 0]);
    expect(hit(fixture("ground"))).toEqual([[5000], 0]);
    expect(hit(withTraits(fixture("hover"), { obstacleArmor: true }))).toEqual([[0], 0]);
    const guard = luckySkill(
      "wg",
      { segment: "water" },
      { durabilityGuard: true, durationTicks: 5 },
    );
    // the guard fires on the first tick in the water, after the hit at entry: no protection
    expect(
      hit(withTraits(fixture("hover", 0, { skills: [guard] }), { randomSkillGuaranteed: true })),
    ).toEqual([[10_000], 0]);
    // once: false re-arms on the flat and fires again on the second canyon, right before the water
    const early = luckySkill(
      "eg",
      { segment: "canyon", once: false },
      { durabilityGuard: true, durationTicks: 300 },
    );
    expect(
      hit(withTraits(fixture("hover", 0, { skills: [early] }), { randomSkillGuaranteed: true })),
    ).toEqual([[0], 0]);
  });
});

describe("once: false re-arm through simulateRace (docs/race-engine.md 15.3, ADR-0003 D50)", () => {
  it("a heat trigger flickering every tick during a 10-tick effect fires at 1, 13 and 25", () => {
    // NO_BOOST keeps heat at what the probe writes: 40 000 after even ticks, 0 after odd ones, so
    // the trigger (read at tick start) holds on odd ticks. Each activation waits for a false tick
    // after its 10-tick effect has ended (the even tick after it), then fires on the next odd one
    const flicker = luckySkill(
      "flicker",
      { heatAboveMilli: 30_000, once: false },
      { speedMms: 100, durationTicks: 10 },
    );
    const holder = withTraits(fixture("hover", 0, { skills: [flicker] }), {
      randomSkillGuaranteed: true,
    });
    const { log } = trace(NO_BOOST, [holder], LONG_FLAT, "d50", 0, (t, A) => {
      A.state.heat[0] = t % 2 === 0 ? 40_000 : 0;
    });
    expect(events(log, "skill").map((e) => [e.tick, e.activation])).toEqual([
      [1, 0],
      [13, 1],
      [25, 2],
    ]);
    expect(at(log.results, 0).ledger.skillsActivated).toEqual(["flicker", "flicker", "flicker"]);
  });
});

describe("segment-0 pre-step (docs/race-engine.md 1.3, 18 P4)", () => {
  it("a water start hits at tick 0; a jump start resolves at tick 0; ground logs a detour at tick 0", () => {
    const water = testCourse([
      { type: "water", length: 200, drag: 0.2 },
      { type: "flat", length: 300 },
    ]);
    const w = simulateRace(QUIET, [fixture("hover")], water, "p4");
    expect(at(w.events, 0)).toMatchObject({ kind: "waterHit", tick: 0, posMm: 0, damage: 10_000 });
    const jump = testCourse([
      { type: "jump", length: 100, liftRequired: 20 },
      { type: "flat", length: 300 },
    ]);
    const j = simulateRace(QUIET, [fixture("hover")], jump, "p4");
    expect(events(j, "jumpOk").map((e) => e.tick)).toEqual([0]);
    const g = simulateRace(QUIET, [fixture("ground")], jump, "p4");
    expect(at(g.events, 0)).toMatchObject({ kind: "detour", tick: 0, segment: 0 });
  });

  it("the starting flat is not entered: no Boneyard repair at the gun", () => {
    const flat = testCourse([{ type: "flat", length: 300 }]);
    const log = simulateRace(
      QUIET,
      [fixture("ground", 0, { rule: "repairable", durabilityStart: 50 })],
      flat,
      "p4",
    );
    expect(events(log, "repair")).toEqual([]);
    expect(at(log.results, 0).durabilityEnd).toBe(50_000);
  });
});

describe("heat-to-energy (docs/race-engine.md 16 #12)", () => {
  it("on the first tick of the final phase: gained = min(Emax − energy, heat × ratio), heat → 0", () => {
    const sprint = content.getCourse("sprint");
    const G = buildCourseGeometry(NO_BOOST, sprint);
    const holder = withTraits(fixture("glide"), { heatToEnergyPm: 500 });
    let primed = false;
    const { log } = trace(NO_BOOST, [holder], sprint, "h2e", 0, (_t, A) => {
      const pos = A.state.pos[0] ?? 0;
      if (!primed && pos < G.finalStart && pos + 400_000 >= G.finalStart) {
        primed = true;
        A.state.heat[0] = 40_000;
        A.state.energy[0] = 70_000;
      }
    });
    const ev = events(log, "heatToEnergy");
    expect(ev.map((e) => [e.heat, e.energy])).toEqual([[39_000, 19_500]]);
    expect(at(log.results, 0).ledger.energyFromHeat).toBe(19_500);
    const none = simulateRace(NO_BOOST, [fixture("glide")], sprint, "h2e");
    expect(events(none, "heatToEnergy")).toEqual([]);
  });
});

describe("rank snapshot (docs/race-engine.md 9.1)", () => {
  it("competition ranking: ties share a rank; posFrac 0, 142, …, 1000; finished runners lead by time", () => {
    const A = createRaceArena().reset(8, buildCourseGeometry(QUIET, LONG_FLAT));
    const S = A.state;
    [800, 700, 600, 500, 400, 300, 200, 100].forEach((p, i) => {
      S.pos[i] = p;
    });
    rankSnapshot(S, 8);
    expect(Array.from(S.posFrac)).toEqual([0, 142, 285, 428, 571, 714, 857, 1000]);
    S.pos[1] = 800; // tie for the lead
    rankSnapshot(S, 8);
    expect([S.ahead[0], S.ahead[1], S.ahead[2]]).toEqual([0, 0, 2]);
    S.flags[7] = F_FINISHED;
    S.finishMilli[7] = 5000;
    S.flags[6] = F_FINISHED;
    S.finishMilli[6] = 6000;
    rankSnapshot(S, 8);
    expect([S.ahead[7], S.ahead[6], S.ahead[0]]).toEqual([0, 1, 2]);
    expect(S.key[7]).toBe(KEY_FINISHED - 5000);
    const solo = createRaceArena().reset(1, buildCourseGeometry(QUIET, LONG_FLAT));
    rankSnapshot(solo.state, 1);
    expect(solo.state.posFrac[0]).toBe(0);
  });
});

describe("DNF guard (docs/race-engine.md 19)", () => {
  const sprint = content.getCourse("sprint");
  const tiny = (base: number): Ruleset => ({
    ...QUIET,
    race: { ...QUIET.race, dnfTicksPerMeter: 0, dnfTicksBase: base },
  });

  it("unfinished at maxTicks: dnf, nulls, placed after finishers by position then lane, dnf flag", () => {
    const entries = [
      fixture("hover", 0, { powerToWeight: 500 }),
      fixture("hover", 1, { powerToWeight: 1600 }),
      fixture("hover", 2, { powerToWeight: 500 }),
    ];
    const log = simulateRace(tiny(800), entries, sprint, "dnf");
    expect(RaceLog.parse(log)).toEqual(log);
    expect(log.ticks).toBe(800);
    expect(log.results.map((r) => [r.lane, r.place, r.dnf])).toEqual([
      [1, 1, false],
      [0, 2, true],
      [2, 3, true],
    ]);
    for (const r of log.results.filter((x) => x.dnf)) {
      expect([r.finishMilli, r.timeTicks, r.marginMm, r.vFinishMms]).toEqual([
        null,
        null,
        null,
        null,
      ]);
      const flags = at(log.frames?.runners, r.lane).flags;
      expect((at(flags, flags.length - 1) & RACE_FRAME_FLAGS.dnf) !== 0).toBe(true);
    }
    expect((log.events ?? []).filter((e) => e.kind === "dnf").map((e) => [e.lane, e.tick])).toEqual(
      [
        [0, 799],
        [2, 799],
      ],
    );
    const all = simulateRace(tiny(100), entries, sprint, "dnf");
    expect(all.results.map((r) => r.lane)).toEqual([1, 0, 2]); // by position, then lane
    expect(all.results.every((r) => r.dnf)).toBe(true);
  });

  it("maxTicks = 8 × L_m + 2400 (sprint 12 000, canyon 26 400)", () => {
    expect(simulateRace(QUIET, [fixture("hover")], sprint, "m").maxTicks).toBe(12_000);
    const canyon = content.getCourse("canyon");
    expect(simulateRace(QUIET, [fixture("hover")], canyon, "m").maxTicks).toBe(26_400);
  });
});

describe("real content passives in the loop (docs/race-engine.md 16)", () => {
  // scrap-armor dropped its water override in ADR-0005; the pair is now armor plus mud-runner
  it("obstacle-armor and mud-runner's water override keep a frame unharmed on the canyon", () => {
    const canyon = content.getCourse("canyon");
    const skill = freezeSkill(content, "water-skimmer");
    const e = withTraits(fixture("ground", 0, { skills: [skill] }), {
      obstacleArmor: true,
      segOverridePm: [0, 0, 0, 0, 1000, 0, 0],
    });
    const log = simulateRace(QUIET, [e], canyon, "scrap");
    expect(events(log, "waterHit").map((x) => x.damage)).toEqual([0]);
    expect(at(log.derived, 0).segments[5]?.fPm).toBe(1000);
  });
});

describe("finish placing (docs/race-engine.md 19)", () => {
  it("a dead heat that spans two ticks is placed by lane; both carry deadHeat and margin 0", () => {
    const L = 2000 * M;
    const entries = [fixture("hover", 0), fixture("hover", 1)];
    // at cruise (352 500 vu), lane 1 lands exactly on L in tick 501 (finishMilli 502 000) and
    // lane 0 crosses from L − 1 at the very start of tick 502 (finishMilli 502 000 too)
    const log = simulateRaceProbed(NO_BOOST, entries, LONG_FLAT, "dh", (t, A) => {
      if (t === 500) {
        A.state.pos[1] = L - 352_500;
        A.state.pos[0] = L - 352_500 - 1;
      }
    });
    expect(RaceLog.parse(log)).toEqual(log);
    expect(
      log.results.map((r) => [r.lane, r.place, r.finishMilli, r.deadHeat, r.marginMm]),
    ).toEqual([
      [0, 1, 502_000, true, 0],
      [1, 2, 502_000, true, 0],
    ]);
    const finishes = (log.events ?? []).filter((e) => e.kind === "finish");
    expect(finishes.map((e) => (e.kind === "finish" ? [e.tick, e.lane, e.place] : []))).toEqual([
      [501, 1, 2],
      [502, 0, 1],
    ]);
  });

  it("a later finisher after a dead heat takes its margin from the last runner of the group", () => {
    const L = 2000 * M;
    const entries = [fixture("hover", 0), fixture("hover", 1), fixture("hover", 2)];
    const log = simulateRaceProbed(NO_BOOST, entries, LONG_FLAT, "dh3", (t, A) => {
      if (t === 500) {
        A.state.pos[0] = L - 352_500;
        A.state.pos[1] = L - 352_500;
        A.state.pos[2] = L - 352_500 - 225_000; // 1 m behind
      }
    });
    expect(log.results.map((r) => [r.lane, r.place, r.deadHeat, r.marginMm])).toEqual([
      [0, 1, true, 0],
      [1, 2, true, 0],
      [2, 3, false, 1000],
    ]);
  });

  it("a dead heat for 2nd: every runner of the group has margin 0, the first one included (19)", () => {
    // 19: "deadHeat: true on every runner of the group, margin 0"; "marginMm ... (0 for the winner
    // and for dead heats)". The first runner of the group used to keep its gap to the winner (1000)
    const L = 2000 * M;
    const entries = [fixture("hover", 0), fixture("hover", 1), fixture("hover", 2)];
    const log = simulateRaceProbed(NO_BOOST, entries, LONG_FLAT, "dh2", (t, A) => {
      if (t === 500) {
        A.state.pos[0] = L - 352_500;
        A.state.pos[1] = L - 352_500 - 225_000; // 1 m behind the winner
        A.state.pos[2] = L - 352_500 - 225_000;
      }
    });
    expect(RaceLog.parse(log)).toEqual(log);
    expect(
      log.results.map((r) => [r.lane, r.place, r.finishMilli, r.deadHeat, r.marginMm]),
    ).toEqual([
      [0, 1, 502_000, false, 0],
      [1, 2, 502_638, true, 0],
      [2, 3, 502_638, true, 0],
    ]);
  });
});

describe("instantaneous terms and rule regen (docs/race-engine.md 5, 8.1, 13)", () => {
  it("skill speed adds to the moved speed at once and leaves at once (never through vCore)", () => {
    const fast = luckySkill("burst", {}, { speedMms: 1000, durationTicks: 30 });
    const e = withTraits(fixture("hover", 0, { skills: [fast] }), { randomSkillGuaranteed: true });
    const { rows } = trace(QUIET, [e], LONG_FLAT, "speed");
    for (let t = 0; t < 30; t++) expect(at(rows, t).vOut - at(rows, t).vCore).toBe(15_000);
    expect(at(rows, 30).vOut).toBe(at(rows, 30).vCore);
    // the body ramp is the same as without the skill
    const plain = trace(QUIET, [fixture("hover")], LONG_FLAT, "speed").rows;
    expect(rows.slice(0, 40).map((r) => r.vCore)).toEqual(plain.slice(0, 40).map((r) => r.vCore));
  });

  it("broken wings inside the plan window ask for a replan (plan count +1)", () => {
    const canyon = content.getCourse("canyon");
    const { rows } = trace(QUIET, [fixture("glide", 0, { durabilityStart: 3 })], canyon);
    // plan at the final (2000 m), then the water hit at 2400 m breaks the wings
    expect(at(rows, rows.length - 1).planCount).toBe(2);
    const intact = trace(QUIET, [fixture("glide")], canyon).rows;
    expect(at(intact, intact.length - 1).planCount).toBe(1);
  });

  it("Lumière regenerates 500 me on every non-boost tick: the ridge lifts are refilled", () => {
    const ridge = content.getCourse("ridge");
    const { log, rows } = trace(NO_BOOST, [fixture("hover", 0, { rule: "regen" })], ridge);
    const ok = events(log, "jumpOk");
    expect(ok).toHaveLength(2);
    const after = at(rows, at(ok, 0).tick);
    expect(after.energy).toBe(80_000 + 500); // lift 20, then this tick's regen
    const r = at(log.results, 0);
    expect(r.energyEnd).toBe(100_000);
    expect(r.ledger.energyRegen).toBe(35_000);
  });
});
