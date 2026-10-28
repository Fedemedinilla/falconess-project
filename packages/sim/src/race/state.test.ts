import { loadContent } from "@falconess/content";
import { Rng, U32_RANGE } from "@falconess/rng";
import type { Course, EntryInput, RaceEntry, Style } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { RULESET_V1, type Ruleset } from "../rulesets/index.js";
import { simulateRace } from "./engine.js";
import { freezeEntry, freezeSkill } from "./entry.js";
import { neutralFixtureEntry } from "./fixtures.js";
import { buildCourseGeometry } from "./geometry.js";
import {
  buildTables,
  createRaceArena,
  DK_FINAL,
  DK_LEAD,
  drawRaceBlock,
  F_BROKEN,
  F_DASH,
  IMMUNE_WHOLE_RACE,
  ib,
  ibps,
  ibs,
  initState,
  ips,
  is,
  type RaceArena,
  validateRace,
} from "./state.js";
import { PH_FINAL, PH_MIDDLE, PH_START } from "./units.js";

const content = loadContent();
const RIDGE = content.getCourse("desert-ridge");
const SPRINT = content.getCourse("desert-sprint");
const CANYON = content.getCourse("desert-canyon");
const S600 = { agility: 600, stamina: 600, technique: 600, courage: 600, intelligence: 600 };
const QUIET: Ruleset = {
  ...RULESET_V1,
  race: { ...RULESET_V1.race, paceHalfWidth: 0, paceCentreSpan: 0, planErrorMax: 0 },
};

/** `arr[i]`, throwing instead of returning undefined (no non-null assertions in this repo). */
function at<T>(arr: readonly T[], i: number): T {
  const v = arr[i];
  if (v === undefined) throw new Error(`no element ${i}`);
  return v;
}

function fixture(style: Style, over: Partial<RaceEntry> = {}, lane = 0): RaceEntry {
  return {
    ...neutralFixtureEntry({ runnerId: `fx-${lane}`, laneIndex: lane, style, stats: S600 }),
    ...over,
  };
}

function frozen(frameId: string, course: Course, lane = 0, over: Partial<EntryInput> = {}) {
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
    learnedSkills: [],
    durability: null,
    ...over,
  };
  return freezeEntry(RULESET_V1, content, input, course, lane);
}

/** Tables of the given entries on `course`, drawn from `seed` (or a hand-set block `U`). */
function tablesOf(
  entries: RaceEntry[],
  course: Course,
  ruleset: Ruleset = QUIET,
  U?: readonly number[],
): RaceArena {
  const G = buildCourseGeometry(ruleset, course);
  const A = createRaceArena().reset(entries.length, G);
  if (U) A.U.set(U);
  else drawRaceBlock(ruleset, entries, new Rng("tables"), A);
  buildTables(ruleset, entries, G, A);
  initState(ruleset, entries, A);
  return A;
}

function flatCourse(segments: Course["segments"]): Course {
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

describe("per-race tables of docs/race-engine.md 3.3 (600-balanced, PW 1.0, noise off)", () => {
  it("cruise, acceleration, exhaustion speed, thrust: 352 500 / 400 / 255 000 / 45 000 / 60 750 vu", () => {
    const { tables: T } = tablesOf([fixture("hover")], RIDGE);
    expect(T.vA[0]).toBe(352_500);
    expect(Array.from(T.f.slice(is(0, 0), is(0, 7)))).toEqual([
      1000, 1030, 1000, 1000, 1020, 1000, 1000,
    ]);
    for (const ph of [PH_START, PH_MIDDLE, PH_FINAL]) {
      expect(T.vC[ibps(0, 0, ph, 0)]).toBe(352_500);
      expect(T.vMin[ibps(0, 0, ph, 0)]).toBe(255_000);
    }
    expect(T.vC[ibps(0, 0, PH_MIDDLE, 1)]).toBe(363_075); // descent 0.3 (24.20 m/s)
    expect(T.acc[ibs(0, 0, 0)]).toBe(400);
    expect(T.acc[ibs(0, 0, 1)]).toBe(412);
    expect(T.accStart[ibs(0, 0, 0)]).toBe(400); // only glide launches faster
    expect([T.B[ib(0, 0)], T.Bp[ib(0, 0)], T.Bpc[ib(0, 0)]]).toEqual([45_000, 60_750, 60_750]);
  });

  it("broken copies use PW × 0.75 in every PW table", () => {
    const { tables: T } = tablesOf([fixture("hover")], RIDGE);
    expect(T.pwBroken[0]).toBe(750);
    expect(T.vC[ibps(0, 1, PH_START, 0)]).toBe(264_375);
    expect(T.acc[ibs(0, 1, 0)]).toBe(300);
    expect(T.vMin[ibps(0, 1, PH_START, 0)]).toBe(191_250);
    expect([T.B[ib(0, 1)], T.Bp[ib(0, 1)]]).toEqual([33_750, 45_562]);
  });

  it("hp, heat and durability scalars: 1235 hp, 625 000 / 812 500 µhp, heatCap 69 000, cool 1000", () => {
    const { tables: T } = tablesOf([fixture("glide")], RIDGE);
    expect(T.hpMax[0]).toBe(1_235_000_000);
    expect([T.stamDiv[0], T.fat[0], T.tol[0]]).toEqual([1_920_000, 1300, 1150]);
    expect(Array.from(T.dK.slice(0, 4))).toEqual([625_000, 612_500, 812_500, 796_250]);
    expect(T.dK[DK_FINAL + DK_LEAD]).toBe(796_250);
    expect([T.D[0], T.heatCap[0], T.capLim[0], T.coolTick[0], T.dmgTick[0]]).toEqual([
      60_000, 69_000, 69_000, 1000, 1000,
    ]);
    expect([T.regenTick[0], T.Emax[0], T.durMax[0], T.styleDmg[0]]).toEqual([
      0, 100_000, 100_000, 1000,
    ]);
    expect([T.heatPenalty[0], T.clampHeat[0], T.licensed[0], T.heatImmune[0]]).toEqual([
      1, 0, 0, 0,
    ]);
  });

  it("jumps, landing, kick and plan point; the jump need per jump segment", () => {
    const A = tablesOf([fixture("hover"), fixture("ground", {}, 1)], RIDGE);
    const T = A.tables;
    const G = buildCourseGeometry(QUIET, RIDGE);
    expect([T.liftF[0], T.landPm[0], T.detour[0], T.detour[1]]).toEqual([1000, 860, 1000, 1100]);
    expect(T.need[is(0, 2)]).toBe(20_000);
    expect(T.need[is(0, 5)]).toBe(15_000);
    expect(T.need[is(0, 0)]).toBe(0);
    expect(T.kickAt[0]).toBe(G.reserveAt);
    expect(T.kickAt[1]).toBe(G.reserveAt);
    expect(T.planPoint[0]).toBe(G.hoverAttack); // hover attacks at 70 %
    expect(T.planPoint[1]).toBe(G.finalStart);
  });

  it("kickAt moves to the entry of a terminal jump that contains reserveAt (not for ground)", () => {
    const course = flatCourse([
      { type: "flat", length: 1000 },
      { type: "jump", length: 100, liftRequired: 20 },
    ]);
    const A = tablesOf([fixture("dive"), fixture("ground", {}, 1)], course);
    expect(A.tables.kickAt[0]).toBe(1000 * 225_000);
    expect(A.tables.kickAt[1]).toBe(1040 * 225_000);
  });

  it("style terms: glide launch 440 in the start phase, dive stoop 1400 on descents and in the final, dive Bon 63 000", () => {
    const A = tablesOf([fixture("glide"), fixture("dive", {}, 1)], RIDGE);
    const T = A.tables;
    expect(T.accStart[ibs(0, 0, 0)]).toBe(440);
    expect(T.acc[ibs(0, 0, 0)]).toBe(400);
    expect(T.stoop[ips(1, PH_START, 0)]).toBe(1000);
    expect(T.stoop[ips(1, PH_START, 1)]).toBe(1400); // descent
    expect(T.stoop[ips(1, PH_FINAL, 6)]).toBe(1400); // final phase
    expect(T.stoop[ips(0, PH_FINAL, 6)]).toBe(1000); // not a dive
    expect([T.Bon[ib(1, 0)], T.unit[ib(1, 0)], T.sMax[ib(1, 0)], T.costOn[1]]).toEqual([
      63_000, 63_000, 63_000, 1000,
    ]);
    expect(T.Bon[ib(0, 0)]).toBe(45_000);
  });

  it("rule terms of 13.1: telemetry, mass-thrust, regen, repairable, heat immunity", () => {
    const A = tablesOf(
      [
        fixture("hover", { rule: "telemetry" }),
        fixture("glide", { rule: "mass-thrust" }, 1),
        fixture("hover", { rule: "regen" }, 2),
        fixture("ground", { rule: "repairable" }, 3),
        frozen("kite", SPRINT, 4, { quirks: ["hot-head"] }),
      ],
      SPRINT,
    );
    const T = A.tables;
    // telemetry: acc 340, drain ×0.9, capLim = D, clamp, no licence, +150 on every check
    expect(T.acc[ibs(0, 0, 0)]).toBe(340);
    expect([T.dK[0], T.dK[DK_FINAL]]).toEqual([562_500, 731_250]);
    expect([T.capLim[0], T.clampHeat[0], T.licensed[0]]).toEqual([60_000, 1, 0]);
    expect(Array.from(T.actBonus.slice(0, 3))).toEqual([150, 150, 150]);
    // Steinhaus in the desert: cooling 500, damage 2000, licence, no speed penalty
    expect([T.coolTick[1], T.dmgTick[1], T.licensed[1], T.heatPenalty[1]]).toEqual([
      500, 2000, 1, 0,
    ]);
    // Lumière: regen 500, landing 720
    expect([T.regenTick[2], T.landPm[2]]).toEqual([500, 720]);
    // Boneyard: landing 930, detour 1050 (ground), repair 2 durability, curves 850
    expect([T.landPm[3], T.detour[3], T.repairMd[3]]).toEqual([930, 1050, 2000]);
    expect(T.f[is(3, 1)]).toBe(850);
    expect(T.dmgTick[3]).toBe(500); // ground ×0.5
    // hot-head: immunity until 300 m gives the licence inside its window
    expect([T.heatImmune[4], T.licensed[4], T.immuneUntil[4]]).toEqual([1, 1, 300 * 225_000]);
  });

  it("Kōryū intake air (desert ×1.15, descent ×1.38, water ×0.69) and the pulse plan quantities", () => {
    const shiden = frozen("shiden", RIDGE);
    const hayate = frozen("hayate", RIDGE, 1);
    const stutter = frozen("shiden", RIDGE, 2, { quirks: [] });
    const A = tablesOf(
      [shiden, hayate, { ...stutter, traits: { ...stutter.traits, noPulse: true } }],
      RIDGE,
    );
    const T = A.tables;
    expect([T.airPm[is(0, 0)], T.airPm[is(0, 1)]]).toEqual([1150, 1380]);
    expect(T.pulseFrame[0]).toBe(1);
    expect([T.Bp[ib(0, 0)], T.Bon[ib(0, 0)], T.unit[ib(0, 0)], T.sMax[ib(0, 0)]]).toEqual([
      85_050, 136_929, 1_643_148, 39_122,
    ]);
    expect(T.Bpc[ib(0, 0)]).toBe(102_060); // third-pulse +20 %
    expect([T.Bp[ib(1, 0)], T.Bon[ib(1, 0)], T.unit[ib(1, 0)], T.sMax[ib(1, 0)]]).toEqual([
      72_900, 83_835, 1_006_020, 23_952,
    ]);
    expect(T.costOn[0]).toBe(1200);
    // no-pulse: continuous boost, no air term
    expect([T.pulseFrame[2], T.airPm[is(2, 1)], T.Bon[ib(2, 0)], T.costOn[2]]).toEqual([
      0, 1000, 88_200, 1000,
    ]);
    const water = tablesOf([frozen("shiden", CANYON)], CANYON).tables;
    expect(water.airPm[is(0, 5)]).toBe(690);
  });

  it("validator bounds hold at PW 500 / 1600 and stats 1 / 2000; every table is a safe integer", () => {
    const lo = fixture("dive", {
      powerToWeight: 500,
      stats: { agility: 1, stamina: 1, technique: 1, courage: 1, intelligence: 1 },
    });
    const hi = fixture(
      "glide",
      {
        powerToWeight: 1600,
        stats: { agility: 2000, stamina: 2000, technique: 2000, courage: 2000, intelligence: 2000 },
      },
      1,
    );
    const T = tablesOf([lo, hi], CANYON, RULESET_V1).tables;
    expect(T.vA[0]).toBe(300_087);
    expect(T.vA[1]).toBe(475_000);
    expect(T.acc[ibs(0, 0, 0)]).toBe(100); // 400 × 601 × 500 / 1.2e6
    expect(T.acc[ibs(1, 0, 0)]).toBe(1386);
    for (const [name, arr] of Object.entries(T))
      if (arr instanceof Int32Array || arr instanceof Float64Array || arr instanceof Uint8Array)
        for (const v of arr) expect(Number.isSafeInteger(v), `${name} ${v}`).toBe(true);
  });
});

describe("pace judgement and plan perception from the pre-drawn block (docs/race-engine.md 10, 17)", () => {
  const MAX = U32_RANGE - 1;
  const block = (fill: number) => new Array<number>(32).fill(fill);

  it("pace lies in [c − 43, c + 43] at both ends of uRange; the width is the same for every I", () => {
    for (const I of [1, 300, 600, 1000, 1200, 2000]) {
      const e = fixture("hover", { stats: { ...S600, intelligence: I } });
      const lo = tablesOf([e], SPRINT, RULESET_V1, block(0)).tables;
      const hi = tablesOf([e], SPRINT, RULESET_V1, block(MAX)).tables;
      const c = lo.paceCentre[0] ?? 0;
      expect(Array.from(lo.pace.slice(0, 3))).toEqual([c - 43, c - 43, c - 43]);
      expect(Array.from(hi.pace.slice(0, 3))).toEqual([c + 43, c + 43, c + 43]);
    }
    const top = tablesOf(
      [fixture("hover", { stats: { ...S600, intelligence: 1200 } })],
      SPRINT,
      RULESET_V1,
      block(MAX),
    );
    expect(top.tables.pace[0]).toBe(65);
  });

  it("plan error in [−We, +We] with We 75 at I 600; noise off gives 0 everywhere", () => {
    const e = fixture("hover");
    expect(tablesOf([e], SPRINT, RULESET_V1, block(0)).tables.planErr[0]).toBe(-75);
    expect(tablesOf([e], SPRINT, RULESET_V1, block(MAX)).tables.planErr[0]).toBe(75);
    const quiet = tablesOf([e], SPRINT, QUIET, block(MAX)).tables;
    expect([quiet.pace[0], quiet.pace[1], quiet.pace[2], quiet.planErr[0]]).toEqual([0, 0, 0, 0]);
  });

  it("u of skill j, activation k comes from slot 4 + 3j + k", () => {
    const skills = ["corner-carver", "last-gasp"].map((id) => freezeSkill(content, id));
    const e = fixture("hover", { skills });
    const U = block(0);
    U[4 + 3 * 1 + 2] = MAX; // skill 1, activation 2
    U[4] = Math.ceil(0.5 * U32_RANGE); // skill 0, activation 0 → 500
    const T = tablesOf([e], SPRINT, RULESET_V1, U).tables;
    expect(Array.from(T.u.slice(0, 3))).toEqual([500, 0, 0]);
    expect(Array.from(T.u.slice(3, 6))).toEqual([0, 0, 999]);
    expect([T.pAct[0], T.pSkill[0], T.pSkill[1]]).toEqual([850, 850, 680]);
  });
});

describe("the pre-drawn RNG block (docs/race-engine.md 17.1, 16 #15)", () => {
  function countDraws(entries: RaceEntry[]) {
    const rng = new Rng("draws");
    const G = buildCourseGeometry(RULESET_V1, SPRINT);
    const A = createRaceArena().reset(entries.length, G);
    drawRaceBlock(RULESET_V1, entries, rng, A);
    return { race: rng.drawCount("race"), quirks: rng.drawCount("quirks"), A };
  }
  const lucky = (e: RaceEntry): RaceEntry => ({
    ...e,
    traits: { ...e.traits, randomSkillGuaranteed: true },
  });

  it("draws exactly 32 n from `race` and one `quirks` per lucky holder (even with no actives)", () => {
    const three = [fixture("dive"), fixture("hover", {}, 1), fixture("glide", {}, 2)];
    expect(countDraws(three)).toMatchObject({ race: 96, quirks: 0 });
    const holders = [
      lucky(fixture("dive")),
      fixture("hover", {}, 1),
      lucky(fixture("glide", {}, 2)),
    ];
    const r = countDraws(holders);
    expect([r.race, r.quirks]).toEqual([96, 2]);
    expect(Array.from(r.A.tables.luckyIdx.slice(0, 3))).toEqual([-1, -1, -1]); // no actives
  });

  it("the lucky index is fl(x × nActive, 2^32) over every active, disabled ones included", () => {
    const skills = ["canyon-sense", "corner-carver", "last-gasp"].map((id) =>
      freezeSkill(content, id),
    );
    const e = lucky(
      fixture("dive", {
        skills: [at(skills, 0), { ...at(skills, 1), disabled: true }, at(skills, 2)],
      }),
    );
    const G = buildCourseGeometry(RULESET_V1, SPRINT);
    for (const [x, idx] of [
      [0, 0],
      [U32_RANGE / 3, 1],
      [U32_RANGE - 1, 2],
    ] as const) {
      const A = createRaceArena().reset(1, G);
      drawRaceBlock(RULESET_V1, [e], { nextU32: (s) => (s === "quirks" ? x : 7) }, A);
      expect(A.tables.luckyIdx[0]).toBe(idx);
    }
  });

  it("a runner's draws depend only on (seed, lane): another runner's build never shifts them", () => {
    const base = [fixture("dive"), fixture("hover", {}, 1), fixture("glide", {}, 2)];
    const changed = [
      at(base, 0),
      fixture(
        "ground",
        {
          stats: { ...S600, agility: 900 },
          skills: [freezeSkill(content, "last-gasp")],
          traits: { ...at(base, 1).traits, randomSkillGuaranteed: true },
        },
        1,
      ),
      at(base, 2),
    ];
    const a = simulateRace(RULESET_V1, base, SPRINT, "iso", { detail: "results" });
    const b = simulateRace(RULESET_V1, changed, SPRINT, "iso", { detail: "results" });
    for (const lane of [0, 2]) {
      const pick = (d: (typeof a.derived)[number]) => [d.pace, d.planErrPm, d.u];
      expect(pick(at(b.derived, lane))).toEqual(pick(at(a.derived, lane)));
    }
  });
});

describe("initial state (docs/race-engine.md 1.3)", () => {
  it("vStart 45 000 vu with the dash, full hp and energy, cold, durability from the entry", () => {
    const A = tablesOf([fixture("hover"), fixture("dive", { durabilityStart: 0 }, 1)], RIDGE);
    const S = A.state;
    expect([S.pos[0], S.vCore[0], S.hp[0], S.energy[0], S.heat[0], S.dur[0], S.seg[0]]).toEqual([
      0, 45_000, 1_235_000_000, 100_000, 0, 100_000, 0,
    ]);
    expect(S.flags[0]).toBe(F_DASH);
    // a runner that starts at durability 0 starts broken (table variant 1)
    expect(S.flags[1]).toBe(F_DASH | F_BROKEN);
    expect(S.b[1]).toBe(1);
  });

  it("the immunity of a whole-race holder never ends", () => {
    const e = fixture("hover");
    const imm = { ...e, traits: { ...e.traits, heatImmune: true, heatImmuneUntilMm: null } };
    expect(tablesOf([imm], SPRINT).tables.immuneUntil[0]).toBe(IMMUNE_WHOLE_RACE);
  });
});

describe("validator (docs/race-engine.md 1.4)", () => {
  const ok = [fixture("dive"), fixture("hover", {}, 1)];
  const check =
    (entries: RaceEntry[], course: Course = SPRINT, seed = "s", r: Ruleset = RULESET_V1) =>
    () =>
      validateRace(r, entries, course, seed);

  it("accepts a valid field", () => {
    expect(check(ok)).not.toThrow();
  });

  it("rejects bad runner counts, lanes and ids", () => {
    expect(check([])).toThrow(/runner count/);
    const nine = Array.from({ length: 9 }, (_, i) => fixture("dive", {}, i));
    expect(check(nine)).toThrow(/runner count/);
    expect(check([fixture("dive"), fixture("hover", {}, 0)])).toThrow();
    expect(check([fixture("dive"), fixture("hover", {}, 2)])).toThrow(/laneIndex/);
    expect(check([fixture("dive"), { ...fixture("hover", {}, 1), runnerId: "fx-0" }])).toThrow(
      /runnerId/,
    );
  });

  it("rejects out-of-range or fractional numbers", () => {
    const bad: Partial<RaceEntry>[] = [
      { stats: { ...S600, agility: 0 } },
      { stats: { ...S600, courage: 2001 } },
      { stats: { ...S600, stamina: 600.5 } },
      { powerToWeight: 499 },
      { powerToWeight: 1601 },
      { energy: 19 },
      { energy: 201 },
      { dissipation: 19 },
      { dissipation: 121 },
      { durabilityMax: 19 },
      { durabilityMax: 261 },
      { durabilityStart: 101 },
      { durabilityStart: -1 },
    ];
    for (const over of bad) expect(check([fixture("dive", over)])).toThrow(/outside/);
  });

  it("rejects unsorted or too many skills, unknown rules, empty seeds and long courses", () => {
    const pair = ["corner-carver", "last-gasp"].map((id) => freezeSkill(content, id));
    const [a, b] = [at(pair, 0), at(pair, 1)];
    expect(check([fixture("dive", { skills: [b, a] })])).toThrow(/id-sorted/);
    expect(check([fixture("dive", { skills: [a, a] })])).toThrow(/id-sorted/);
    const many = Array.from({ length: 9 }, (_, i) => ({ ...a, id: `s-${i}` }));
    expect(check([fixture("dive", { skills: many })])).toThrow(/skill count/);
    expect(check([Object.assign(fixture("dive"), { rule: "warp" })])).toThrow(/rule/);
    expect(check(ok, SPRINT, "")).toThrow(/seed/);
    const long = flatCourse([{ type: "flat", length: 10_001 }]);
    expect(check(ok, long)).toThrow(/course/);
    const many24 = flatCourse(
      Array.from({ length: 25 }, () => ({ type: "flat" as const, length: 50 })),
    );
    expect(check(ok, many24)).toThrow(/segment count/);
    const tiny: Ruleset = { ...RULESET_V1, race: { ...RULESET_V1.race, rngBlock: 8 } };
    expect(check([fixture("dive", { skills: [a, b] })], SPRINT, "s", tiny)).toThrow(/rngBlock/);
  });
});

describe("arena (docs/race-engine.md 22)", () => {
  it("reset zero-fills; a reused arena gives byte-identical logs", () => {
    const arena = createRaceArena();
    const field = [fixture("dive"), fixture("ground", {}, 1), fixture("glide", {}, 2)];
    const fresh = JSON.stringify(simulateRace(RULESET_V1, field, RIDGE, "arena"));
    simulateRace(RULESET_V1, [frozen("shiden", CANYON)], CANYON, "other", { arena });
    expect(JSON.stringify(simulateRace(RULESET_V1, field, RIDGE, "arena", { arena }))).toBe(fresh);
    arena.reset(2, buildCourseGeometry(RULESET_V1, SPRINT));
    expect(arena.state.pos.every((v) => v === 0)).toBe(true);
    expect(arena.tables.vC.every((v) => v === 0)).toBe(true);
    expect(() => arena.reset(9, buildCourseGeometry(RULESET_V1, SPRINT))).toThrow();
  });
});
