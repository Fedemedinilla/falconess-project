import { loadContent } from "@falconess/content";
import type { Course, EntryInput, RaceEntry, Style } from "@falconess/schema";
import { RACE_FRAME_FLAGS, RaceLog } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { RULESET_V1, type Ruleset } from "../rulesets/index.js";
import { simulateRace, simulateRaceProbed } from "./engine.js";
import { freezeEntry } from "./entry.js";
import { neutralFixtureEntry } from "./fixtures.js";
import { buildCourseGeometry } from "./geometry.js";
import { createRaceArena, F_FINISHED, type RaceArena } from "./state.js";

/**
 * simulateRace end to end (docs/race-engine.md 18-20, 24.2): smoke runs on the three content
 * courses, the cross-check against the spec prototype, determinism, the log
 * schema, symmetry, bounds on every tick, log consistency and options invariance.
 */

const content = loadContent();
const COURSES = ["desert-sprint", "desert-ridge", "desert-canyon"] as const;
const course = (id: string) => content.getCourse(id);
const S600 = { agility: 600, stamina: 600, technique: 600, courage: 600, intelligence: 600 };
const STYLES: readonly Style[] = ["dive", "hover", "glide", "ground"];
const QUIET: Ruleset = {
  ...RULESET_V1,
  race: { ...RULESET_V1.race, paceHalfWidth: 0, paceCentreSpan: 0, planErrorMax: 0 },
};

function at<T>(arr: readonly T[] | undefined, i: number): T {
  const v = arr?.[i];
  if (v === undefined) throw new Error(`no element ${i}`);
  return v;
}

function fixture(style: Style, lane: number, over: Partial<RaceEntry> = {}): RaceEntry {
  return {
    ...neutralFixtureEntry({ runnerId: `fx-${lane}`, laneIndex: lane, style, stats: S600 }),
    ...over,
  };
}

function frozen(frameId: string, c: Course, lane: number, learnedSkills: string[] = []): RaceEntry {
  const B = { desert: "B", mountain: "B", coast: "B", urban: "B", tundra: "B" } as const;
  const input: EntryInput = {
    runnerId: `r-${lane}`,
    kind: "rival",
    falconessId: null,
    baseStats: S600,
    mood: 0,
    biomeAptitude: B,
    styleAptitude: { dive: "B", hover: "B", glide: "B", ground: "B" },
    frameId,
    parts: [],
    quirks: [],
    learnedSkills,
    durability: null,
  };
  return freezeEntry(RULESET_V1, content, input, c, lane);
}

/** Two of each style on the neutral fixture frame (the S1 field). */
function neutralField(): RaceEntry[] {
  return [0, 1, 2, 3, 4, 5, 6, 7].map((lane) => fixture(at(STYLES, lane % 4), lane));
}

/** Field 0 of the prototype cross-check: eight generic frames with two or three actives each. */
const FIELD0: [string, string[]][] = [
  ["falke", ["corner-carver", "last-gasp"]],
  ["erzherzog", ["hill-lungs"]],
  ["sylphe", ["pack-shadow", "cool-head"]],
  ["etoile", ["second-wind"]],
  ["shiden", ["clean-start", "water-skimmer"]],
  ["hayate", ["canyon-sense", "iron-wings"]],
  ["nimbus", ["lead-guard", "pack-shadow"]],
  ["horizon", ["gravity-friend", "last-gasp", "clean-start"]],
];

function realField(c: Course): RaceEntry[] {
  return FIELD0.map(([f, skills], lane) => frozen(f, c, lane, skills));
}

function byLane(log: RaceLog) {
  return [...log.results].sort((a, b) => a.lane - b.lane);
}

describe("cross-check with the spec prototype (docs/race-engine.md 25.4)", () => {
  // .work/proto/proto2/engine.mjs (written from spec revision 2), seed "ref-seed"
  const QUIET_MILLI: Record<string, number[]> = {
    "desert-sprint": [811_731, 817_093, 814_407, 817_402],
    "desert-ridge": [1_303_652, 1_306_911, 1_304_010, 1_296_912],
    "desert-canyon": [2_039_108, 2_042_391, 2_028_014, 2_043_225],
  };
  const NOISY_MILLI: Record<string, number[]> = {
    "desert-sprint": [815_547, 820_687, 818_367, 820_408],
    "desert-ridge": [1_311_738, 1_314_973, 1_312_152, 1_304_771],
    "desert-canyon": [2_052_085, 2_054_727, 2_041_527, 2_055_678],
  };

  for (const id of COURSES)
    it(`${id}: neutral dive / hover / glide / ground solo finish times match exactly`, () => {
      const quiet = STYLES.map(
        (st) =>
          byLane(simulateRace(QUIET, [fixture(st, 0)], course(id), "ref-seed"))[0]?.finishMilli,
      );
      expect(quiet).toEqual(QUIET_MILLI[id]);
      const noisy = STYLES.map(
        (st) =>
          byLane(simulateRace(RULESET_V1, [fixture(st, 0)], course(id), "ref-seed"))[0]
            ?.finishMilli,
      );
      expect(noisy).toEqual(NOISY_MILLI[id]);
    });

  it("an eight-runner field of real frames with actives matches the prototype (finish, skills)", () => {
    const want: Record<string, { milli: number[]; skills: string[] }> = {
      "desert-sprint": {
        milli: [822_021, 824_890, 690_784, 626_683, 640_368, 708_147, 923_593, 795_707],
        skills: [
          "corner-carver+last-gasp",
          "",
          "cool-head",
          "second-wind",
          "clean-start",
          "iron-wings",
          "pack-shadow",
          "clean-start",
        ],
      },
      "desert-ridge": {
        milli: [
          1_322_759, 1_311_267, 1_179_542, 1_075_128, 1_075_772, 1_153_680, 1_493_352, 1_278_080,
        ],
        skills: [
          "last-gasp",
          "",
          "cool-head",
          "second-wind",
          "clean-start",
          "iron-wings",
          "pack-shadow",
          "clean-start+gravity-friend",
        ],
      },
      "desert-canyon": {
        milli: [
          2_056_408, 2_060_669, 1_780_218, 1_610_097, 1_650_306, 1_803_154, 2_305_539, 1_968_370,
        ],
        skills: [
          "last-gasp",
          "hill-lungs",
          "cool-head",
          "second-wind",
          "clean-start+water-skimmer",
          "iron-wings+canyon-sense",
          "pack-shadow",
          "clean-start",
        ],
      },
    };
    for (const id of COURSES) {
      const log = simulateRace(RULESET_V1, realField(course(id)), course(id), "s1", {
        detail: "results",
      });
      const rs = byLane(log);
      expect(rs.map((r) => r.finishMilli)).toEqual(want[id]?.milli);
      expect(rs.map((r) => r.ledger.skillsActivated.join("+"))).toEqual(want[id]?.skills);
    }
  });
});

describe("smoke on the three content courses (docs/race-engine.md 18)", () => {
  for (const id of COURSES)
    it(`${id}: neutral and real-frame fields finish, parse as RaceLog, plausible times`, () => {
      const c = course(id);
      const L = c.segments.reduce((m, s) => m + s.length, 0);
      for (const entries of [neutralField(), realField(c)]) {
        const log = simulateRace(RULESET_V1, entries, c, `smoke-${id}`);
        expect(RaceLog.parse(log)).toEqual(log);
        expect(log.results.map((r) => r.place)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
        for (const r of log.results) {
          expect(r.dnf).toBe(false);
          const seconds = (r.finishMilli ?? 0) / 15_000;
          expect(seconds).toBeGreaterThan(L / 35); // faster than any frame's cruise
          expect(seconds).toBeLessThan(L / 10);
        }
        expect(log.ticks).toBe(Math.max(...log.results.map((r) => r.timeTicks ?? 0)));
      }
    });

  it("a 50 m course (the shortest Course) clamps reserveAt and kickAt at 0 and parses (ADR-0003 D53)", () => {
    // section 2: Lmm − 60 000 is below 0 under 60 m; reserveAt and kickAt (9.4) are clamped at 0,
    // so the log carries no negative boundary and RaceLog (reserveAtMm, kickAtMm: Nat) accepts it
    const short = (segments: Course["segments"]): Course => ({
      id: "short-course",
      version: 1,
      biome: "desert",
      traits: [],
      entries: 8,
      segments,
      textKey: "course.short",
    });
    for (const c of [
      short([{ type: "flat", length: 50 }]),
      short([{ type: "jump", length: 50, liftRequired: 5 }]),
      short([{ type: "water", length: 50, drag: 0.2 }]),
    ]) {
      const log = simulateRace(RULESET_V1, neutralField(), c, "short");
      expect(log.geometry.reserveAtMm).toBe(0);
      expect(log.geometry.denseFromMm).toBe(25_000);
      expect(log.derived.map((d) => d.kickAtMm)).toEqual(new Array(8).fill(0));
      expect(RaceLog.parse(log)).toEqual(log);
      expect(log.results.every((r) => !r.dnf)).toBe(true);
    }
    // 60 m is the first length with no clamp
    const sixty = simulateRace(
      RULESET_V1,
      neutralField(),
      short([{ type: "flat", length: 60 }]),
      "s",
    );
    expect([sixty.geometry.reserveAtMm, at(sixty.derived, 0).kickAtMm]).toEqual([0, 0]);
  });

  it("the ridge flyers lift twice (35 energy) and land twice; ground detours both jumps", () => {
    const log = simulateRace(RULESET_V1, neutralField(), course("desert-ridge"), "ridge");
    for (const r of log.results) {
      const ground = at(log.entries, r.lane).style === "ground";
      expect([r.ledger.jumpsOk, r.ledger.jumpsFailed, r.ledger.detours]).toEqual(
        ground ? [0, 0, 2] : [2, 0, 0],
      );
      expect(r.ledger.energyLift).toBe(ground ? 0 : 35_000);
      expect(r.ledger.landingLossMms > 0).toBe(!ground);
      // every runner spends its tank (the jump reserve kept the lift energy until each jump)
      expect(r.energyEnd).toBe(0);
    }
  });
});

describe("determinism and options (properties P1, P7)", () => {
  it("same inputs give a byte-identical JSON log; entry order is irrelevant; inputs never mutate", () => {
    const c = course("desert-canyon");
    const entries = realField(c);
    const before = JSON.stringify(entries);
    const courseBefore = JSON.stringify(c);
    const a = JSON.stringify(simulateRace(RULESET_V1, entries, c, "det"));
    const b = JSON.stringify(simulateRace(RULESET_V1, [...entries].reverse(), c, "det"));
    expect(b).toBe(a);
    expect(JSON.stringify(entries)).toBe(before);
    expect(JSON.stringify(c)).toBe(courseBefore);
    const other = JSON.stringify(simulateRace(RULESET_V1, entries, c, "det-2"));
    expect(other).not.toBe(a);
  });

  it("the log never aliases the caller's entries", () => {
    const c = course("desert-sprint");
    const entries = neutralField();
    const log = simulateRace(RULESET_V1, entries, c, "alias");
    at(log.entries, 0).skills.push(at(realField(c)[0]?.skills, 0));
    at(log.entries, 0).traits.segMultiplyPm[0] = 1;
    expect(at(entries, 0).skills).toEqual([]);
    expect(at(entries, 0).traits.segMultiplyPm[0]).toBe(1000);
  });

  it("detail, arena and a cached geometry never change results or derived", () => {
    const arena = createRaceArena();
    for (const id of COURSES) {
      const c = course(id);
      const geometry = buildCourseGeometry(RULESET_V1, c);
      const entries = realField(c);
      const full = simulateRace(RULESET_V1, entries, c, "p7");
      const variants = [
        simulateRace(RULESET_V1, entries, c, "p7", { detail: "results" }),
        simulateRace(RULESET_V1, entries, c, "p7", { arena }),
        simulateRace(RULESET_V1, entries, c, "p7", { geometry, arena, detail: "results" }),
      ];
      for (const v of variants) {
        expect(JSON.stringify(v.results)).toBe(JSON.stringify(full.results));
        expect(JSON.stringify(v.derived)).toBe(JSON.stringify(full.derived));
      }
      const results = at(variants, 0);
      expect(results.frames).toBeUndefined();
      expect(results.events).toBeUndefined();
      expect(RaceLog.parse(results)).toEqual(results);
    }
  });

  it("rejects a geometry built for another course", () => {
    const sprint = course("desert-sprint");
    const geometry = buildCourseGeometry(RULESET_V1, course("desert-ridge"));
    expect(() => simulateRace(RULESET_V1, neutralField(), sprint, "g", { geometry })).toThrow(
      /geometry/,
    );
  });
});

describe("symmetry (property P2)", () => {
  for (const id of COURSES)
    it(`${id}: identical builds without actives tie exactly with noise off`, () => {
      for (const style of STYLES) {
        const entries = [0, 1, 2].map((lane) => fixture(style, lane));
        const log = simulateRace(QUIET, entries, course(id), "sym");
        const ms = log.results.map((r) => r.finishMilli);
        expect(new Set(ms).size).toBe(1);
        for (const r of log.results) {
          expect(r.deadHeat).toBe(true);
          expect(r.marginMm).toBe(0);
        }
        expect(log.results.map((r) => r.lane)).toEqual([0, 1, 2]); // places by lane
        const cols = log.frames?.runners.map((r) => JSON.stringify(r));
        expect(new Set(cols).size).toBe(1);
      }
    });
});

type Probe = { arena: RaceArena; t: number };

/** Bounds of property P4 on every tick, plus monotone positions. */
function checkBounds(ruleset: Ruleset, entries: RaceEntry[], c: Course, seed: string): RaceLog {
  const prev = new Float64Array(8);
  const errors: string[] = [];
  const log = simulateRaceProbed(ruleset, entries, c, seed, (t, A) => {
    const S = A.state;
    const T = A.tables;
    for (let i = 0; i < A.n; i++) {
      const bad = (what: string) => errors.push(`t${t} lane ${i}: ${what}`);
      const hp = S.hp[i] ?? -1;
      const energy = S.energy[i] ?? -1;
      const dur = S.dur[i] ?? -1;
      if (hp < 0 || hp > (T.hpMax[i] ?? 0)) bad(`hp ${hp}`);
      if (energy < 0 || energy > (T.Emax[i] ?? 0)) bad(`energy ${energy}`);
      if ((S.heat[i] ?? -1) < 0) bad("heat < 0");
      if (dur < 0 || dur > (T.durMax[i] ?? 0)) bad(`dur ${dur}`);
      if ((S.vOut[i] ?? -1) < 0 || (S.vCore[i] ?? -1) < 0) bad("negative speed");
      if ((S.pos[i] ?? 0) < (prev[i] ?? 0)) bad("pos went back");
      prev[i] = S.pos[i] ?? 0;
      for (const v of [hp, energy, dur, S.pos[i] ?? 0]) if (!Number.isSafeInteger(v)) bad(`${v}`);
    }
  });
  expect(errors).toEqual([]);
  return log;
}

describe("bounds on every tick (property P4)", () => {
  it("no resource is ever negative or above its maximum, positions never go back, no DNF", () => {
    for (const id of COURSES) {
      const c = course(id);
      const edge = [
        fixture("dive", 0, { stats: { ...S600, stamina: 1 } }), // exhausts early
        fixture("glide", 1, { durabilityStart: 3 }), // breaks on water
        fixture("ground", 2, {
          stats: {
            agility: 2000,
            stamina: 2000,
            technique: 2000,
            courage: 2000,
            intelligence: 2000,
          },
        }),
        fixture("hover", 3, { energy: 20, stats: { ...S600, technique: 1 } }), // fails jumps
        fixture("dive", 4, { powerToWeight: 500 }),
        fixture("glide", 5, { powerToWeight: 1600, durabilityStart: 0 }),
        frozen("erzherzog", c, 6),
        frozen("sylphe", c, 7, ["second-wind", "lead-guard"]),
      ];
      for (const seed of ["b1", "b2"]) {
        const log = checkBounds(RULESET_V1, edge, c, seed);
        expect(log.results.every((r) => !r.dnf)).toBe(true);
      }
      checkBounds(RULESET_V1, realField(c), c, "b3");
    }
  });
});

describe("log consistency (properties P5, P8)", () => {
  function allNumbers(x: unknown, out: number[] = []): number[] {
    if (typeof x === "number") out.push(x);
    else if (Array.isArray(x)) for (const v of x) allNumbers(v, out);
    else if (x !== null && typeof x === "object")
      for (const v of Object.values(x)) allNumbers(v, out);
    return out;
  }

  for (const id of COURSES)
    it(`${id}: places, finish events, time intervals, frames, boost counts, energy identity, integers`, () => {
      const c = course(id);
      const entries = realField(c);
      const log = simulateRace(RULESET_V1, entries, c, `p5-${id}`);
      const n = entries.length;
      expect([...log.results.map((r) => r.place)].sort((a, b) => a - b)).toEqual(
        Array.from({ length: n }, (_, k) => k + 1),
      );
      const finishes = (log.events ?? []).filter((e) => e.kind === "finish");
      expect(finishes).toHaveLength(n);
      for (const r of log.results) {
        const ev = finishes.find((e) => e.lane === r.lane);
        expect(ev?.kind === "finish" && [ev.place, ev.finishMilli, ev.tick + 1]).toEqual([
          r.place,
          r.finishMilli,
          r.timeTicks,
        ]);
        const tt = r.timeTicks ?? 0;
        expect(r.finishMilli).toBeGreaterThanOrEqual(1000 * (tt - 1));
        expect(r.finishMilli).toBeLessThanOrEqual(1000 * tt);
        expect(r.marginMm).toBeGreaterThanOrEqual(0);
        // energy identity of 20.5
        const L = r.ledger;
        const start = at(entries, r.lane).energy * 1000;
        expect(
          start -
            L.energySpent -
            L.energyLift +
            L.energyRegen +
            L.energyRefunded +
            L.energyFromHeat,
        ).toBe(r.energyEnd);
        expect(L.energyLeft).toBe(r.energyEnd);
        // stalled ticks are booked in stallTicks only (18 B11, stalledTick)
        expect(L.phaseTicks.reduce((a, b) => a + b, 0) + L.stallTicks).toBe(tt);
      }
      const f = log.frames;
      if (f === undefined) throw new Error("full log without frames");
      for (let k = 1; k < f.tick.length; k++)
        expect(at(f.tick, k)).toBeGreaterThan(at(f.tick, k - 1));
      for (const r of log.results) {
        const col = at(f.runners, r.lane).boost;
        expect(col.reduce((a, b) => a + b, 0)).toBe(r.ledger.boostTicks.reduce((a, b) => a + b, 0));
      }
      for (const v of allNumbers(log)) expect(Number.isSafeInteger(v)).toBe(true);
      // events are ordered by tick
      const ticks = (log.events ?? []).map((e) => e.tick);
      for (let k = 1; k < ticks.length; k++)
        expect(at(ticks, k)).toBeGreaterThanOrEqual(at(ticks, k - 1));
    });

  it("margins: the k-th finisher's gap at the (k − 1)-th's crossing, 0 for the winner", () => {
    const c = course("desert-sprint");
    const entries = [
      fixture("hover", 0, { stats: { ...S600, agility: 650 } }),
      fixture("hover", 1),
      fixture("hover", 2, { stats: { ...S600, agility: 550 } }),
    ];
    const rows: { t: number; pos: number[]; prev: number[]; disp: number[] }[] = [];
    const log = simulateRaceProbed(QUIET, entries, c, "m", (t: number, A: RaceArena) => {
      rows.push({
        t,
        pos: Array.from(A.state.pos.slice(0, 3)),
        prev: Array.from(A.state.prevPos.slice(0, 3)),
        disp: Array.from(A.state.disp.slice(0, 3)),
      });
    });
    const L = 1_200_000 * 225;
    const [w, s2, s3] = log.results;
    expect([w?.lane, s2?.lane, s3?.lane]).toEqual([0, 1, 2]);
    expect(w?.marginMm).toBe(0);
    for (const [ahead, behind] of [
      [w, s2],
      [s2, s3],
    ] as const) {
      const tA = (ahead?.timeTicks ?? 0) - 1;
      const row = at(rows, tA);
      const fA = (ahead?.finishMilli ?? 0) - 1000 * tA;
      const b = behind?.lane ?? 0;
      const posB = at(row.prev, b) + Math.floor((at(row.disp, b) * fA) / 1000);
      expect(behind?.marginMm).toBe(Math.max(0, Math.floor((L - posB) / 225)));
      expect(behind?.marginMm).toBeGreaterThan(0);
    }
  });
});

describe("race-wide sampling (docs/race-engine.md 20.4)", () => {
  it("rows: T = 0, every tick of the first second, every 15th, finish ticks, last 25 m, last tick", () => {
    const c = course("desert-sprint");
    const entries = [fixture("glide", 0), fixture("hover", 1, { powerToWeight: 900 })];
    const G = buildCourseGeometry(RULESET_V1, c);
    const expected = [0];
    const finishedBefore = [false, false];
    let probe: Probe | null = null;
    const log = simulateRaceProbed(RULESET_V1, entries, c, "rows", (t, arena) => {
      probe = { arena, t };
      const S = arena.state;
      const T = t + 1;
      let due = T <= 15 || T % 15 === 0;
      for (let i = 0; i < 2; i++) {
        const fin = ((S.flags[i] ?? 0) & F_FINISHED) !== 0;
        if (fin && !finishedBefore[i]) due = true;
        if (!fin && (S.pos[i] ?? 0) >= G.denseFrom) due = true;
        finishedBefore[i] = fin;
      }
      if (finishedBefore.every((x) => x)) due = true;
      if (due) expected.push(T);
    });
    expect(probe).not.toBeNull();
    expect(log.frames?.tick).toEqual(expected);
    // finished runners repeat their final state with the finished flag
    const first = at(log.results, 0);
    const col = at(log.frames?.runners, first.lane);
    const last = col.flags.length - 1;
    expect((at(col.flags, last) & RACE_FRAME_FLAGS.finished) !== 0).toBe(true);
    expect(at(col.posMm, last)).toBeGreaterThanOrEqual(1_200_000);
  });

  it("frame columns: positions in mm, speeds in mm/s, hp in milli-hp; row 0 is the gun", () => {
    const c = course("desert-ridge");
    const log = simulateRace(QUIET, [fixture("hover", 0)], c, "cols");
    const r = at(log.frames?.runners, 0);
    expect([
      at(r.posMm, 0),
      at(r.vMms, 0),
      at(r.hp, 0),
      at(r.energy, 0),
      at(r.heat, 0),
      at(r.durability, 0),
    ]).toEqual([0, 0, 1_235_000, 100_000, 0, 100_000]);
    // tick 0: vStart 45 000 vu + dash 24 000 + accel 400 → 69 400 vu (4626 mm/s), moved 69 400 pu
    expect([at(log.frames?.tick, 1), at(r.vMms, 1), at(r.posMm, 1)]).toEqual([1, 4626, 308]);
    const airborne = r.flags.some((f) => (f & RACE_FRAME_FLAGS.airborne) !== 0);
    expect(airborne).toBe(true);
  });
});
