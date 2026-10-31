import { loadContent } from "@falconess/content";
import { ceilDiv, Rng } from "@falconess/rng";
import type {
  Course,
  RaceEntry,
  RaceLog,
  RaceRule,
  RaceSkill,
  RaceTraits,
  Segment,
  Style,
} from "@falconess/schema";
import { RACE_RULES, RaceLog as RaceLogSchema } from "@falconess/schema";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { simulateRace, simulateRaceProbed } from "../../src/race/engine.js";
import { freezeEntry, freezeSkill } from "../../src/race/entry.js";
import { disableSkill, neutralFixtureEntry } from "../../src/race/fixtures.js";
import { buildCourseGeometry } from "../../src/race/geometry.js";
import {
  createRaceArena,
  drawRaceBlock,
  ib,
  ibps,
  ips,
  is,
  type RaceArena,
} from "../../src/race/state.js";
import { MODE_OFF, modeName, POS_PER_MM, VEL_PER_MMS } from "../../src/race/units.js";
import type { Ruleset } from "../../src/rulesets/index.js";

/**
 * The properties of docs/race-engine.md 24.2 as a suite parameterised by ruleset, with fast-check:
 * P1 determinism, P2 symmetry (exact with noise off, statistical with noise), P3 agility
 * monotonicity in the three tiers of ADR-0003 D41 with tier (a) as D52 narrows it (and P9 for
 * stamina), P4 bounds on every tick, P5 log consistency (P5b boostMode hysteresis), P6 RNG
 * accounting and isolation (P6b ablation alignment), P7 options invariance and a coverage check
 * of the controller. Every property runs the 500 cases 24.2 asks for (`RUNS`); every case is a
 * full race. None pins a number measured on a ruleset: `properties.test.ts` runs the suite on
 * SPEC_RULESET (with the pinned D52 counterexamples) and `properties-live.test.ts` on RULESET_V1,
 * so a balance change that breaks an invariant fails there (ADR-0005).
 */

const content = loadContent();

/** Noise off: pace window and plan error at 0 (24.2). */
export function quiet(R: Ruleset): Ruleset {
  return {
    ...R,
    race: { ...R.race, paceHalfWidth: 0, paceCentreSpan: 0, planErrorMax: 0 },
  };
}

/** Noise off and boost neutralised (kBoost = kH = 0): P3 tier (a). */
export function noBoost(R: Ruleset): Ruleset {
  const Q = quiet(R);
  return { ...Q, race: { ...Q.race, kBoost: 0, kH: 0 } };
}

const COURSES = ["sprint", "ridge", "canyon"].map((id) => content.getCourse(id));
const STYLES: readonly Style[] = ["dive", "hover", "glide", "ground"];
const ACTIVE_IDS = [...content.skills.values()]
  .filter((s) => s.kind === "active")
  .map((s) => s.id)
  .sort();
const FROZEN = new Map<string, RaceSkill>(ACTIVE_IDS.map((id) => [id, freezeSkill(content, id)]));
/** P3 and P9 draw "any frame" (24.2): the ten generic frames and the three signature frames. */
const ALL_FRAMES = [...content.frames.values()].map((f) => f.id).sort();
/** Cases per property (24.2: "fast-check, 500 cases each"). */
export const RUNS = 500;
/**
 * Timeout of each property (ms): a property runs hundreds of full races, about 1-5 s alone, and
 * the spec and live suites share the machine with the other test files; Vitest's 5 s default
 * timed them out under load.
 */
const HEAVY = 120_000;

export function at<T>(arr: readonly T[] | undefined, i: number): T {
  const v = arr?.[i];
  if (v === undefined) throw new Error(`no element ${i}`);
  return v;
}

export function testCourse(segments: Segment[], id = "prop-course"): Course {
  return { id, version: 1, traits: [], entries: 8, segments, textKey: "course.p" };
}

// --- arbitraries --------------------------------------------------------------------------------

const stat = fc.integer({ min: 50, max: 1200 });
const statsArb = fc.record({
  agility: stat,
  stamina: stat,
  technique: stat,
  courage: stat,
  intelligence: stat,
});

const traitsArb: fc.Arbitrary<Partial<RaceTraits>> = fc
  .record({
    immune: fc.constantFrom<"none" | "300m" | "all">("none", "none", "300m", "all"),
    regenMe: fc.constantFrom(0, 0, 250),
    freeFirstBoostMask: fc.constantFrom(0, 0, 1, 4, 5),
    chain: fc.boolean(),
    flatCooldown: fc.boolean(),
    heatToEnergyPm: fc.constantFrom(0, 0, 250, 500),
    liftBonusPm: fc.constantFrom(0, 100),
    noPulse: fc.constantFrom(false, false, false, true),
    obstacleArmor: fc.constantFrom(false, false, true),
    randomSkillGuaranteed: fc.constantFrom(false, false, true),
    packRegenMultPm: fc.constantFrom(1000, 2000),
  })
  .map((t) => ({
    heatImmune: t.immune !== "none",
    heatImmuneUntilMm: t.immune === "300m" ? 300_000 : null,
    regenMe: t.regenMe,
    freeFirstBoostMask: t.freeFirstBoostMask,
    pulseChainIndex: t.chain ? 3 : 0,
    pulseChainBonusPm: t.chain ? 200 : 0,
    pulseCooldown: [t.flatCooldown ? 20 : 0, 0, 0, 0, 0, 0, 0],
    heatToEnergyPm: t.heatToEnergyPm,
    liftBonusPm: t.liftBonusPm,
    noPulse: t.noPulse,
    obstacleArmor: t.obstacleArmor,
    obstacleArmorExtraTicks: t.obstacleArmor ? 10 : 0,
    randomSkillGuaranteed: t.randomSkillGuaranteed,
    packRegenMultPm: t.packRegenMultPm,
  }));

type Build = {
  style: Style;
  rule: RaceRule;
  stats: RaceEntry["stats"];
  powerToWeight: number;
  energy: number;
  dissipation: number;
  durabilityMax: number;
  durabilityStart: number;
  skills: string[];
  traits: Partial<RaceTraits>;
};

const buildArb = (maxSkills = 3): fc.Arbitrary<Build> =>
  fc
    .record({
      style: fc.constantFrom(...STYLES),
      rule: fc.constantFrom(...RACE_RULES),
      stats: statsArb,
      powerToWeight: fc.integer({ min: 500, max: 1600 }),
      energy: fc.integer({ min: 20, max: 200 }),
      dissipation: fc.integer({ min: 20, max: 120 }),
      durabilityMax: fc.integer({ min: 20, max: 260 }),
      durFrac: fc.integer({ min: 0, max: 1000 }),
      skills: fc.subarray(ACTIVE_IDS, { maxLength: maxSkills }),
      traits: traitsArb,
    })
    .map(({ durFrac, ...b }) => ({
      ...b,
      durabilityStart: Math.floor((b.durabilityMax * durFrac) / 1000),
    }));

function entryOf(b: Build, lane: number, runnerId = `r-${lane}`): RaceEntry {
  const base = neutralFixtureEntry({
    runnerId,
    laneIndex: lane,
    style: b.style,
    stats: b.stats,
    skills: b.skills.map((id) => {
      const s = FROZEN.get(id);
      if (s === undefined) throw new Error(id);
      return s;
    }),
  });
  return {
    ...base,
    rule: b.rule,
    powerToWeight: b.powerToWeight,
    energy: b.energy,
    dissipation: b.dissipation,
    durabilityMax: b.durabilityMax,
    durabilityStart: b.durabilityStart,
    traits: { ...base.traits, ...b.traits },
  };
}

const segmentArb: fc.Arbitrary<Segment> = fc.oneof(
  fc.record({ type: fc.constant("flat" as const), length: fc.integer({ min: 50, max: 500 }) }),
  fc.record({
    type: fc.constant("climb" as const),
    length: fc.integer({ min: 50, max: 500 }),
    grade: fc.constantFrom(0.05, 0.15, 0.25),
  }),
  fc.record({
    type: fc.constant("descent" as const),
    length: fc.integer({ min: 50, max: 500 }),
    grade: fc.constantFrom(0.1, 0.2, 0.3),
  }),
  fc.record({
    type: fc.constant("jump" as const),
    length: fc.integer({ min: 50, max: 150 }),
    liftRequired: fc.integer({ min: 5, max: 40 }),
  }),
  fc.record({
    type: fc.constant("water" as const),
    length: fc.integer({ min: 50, max: 300 }),
    drag: fc.constantFrom(0.1, 0.2, 0.3),
  }),
  fc.record({
    type: fc.constant("canyon" as const),
    length: fc.integer({ min: 50, max: 500 }),
  }),
  fc.record({
    type: fc.constant("curves" as const),
    length: fc.integer({ min: 50, max: 400 }),
    radius: fc.integer({ min: 20, max: 80 }),
  }),
);

/**
 * A content course or a random one of 1 to 6 segments (50 m to 3000 m). Courses shorter than
 * `finalSprintReserveMeters` (60 m) are kept: their `reserveAt` and `kickAt` are clamped at 0
 * (ADR-0003 D53), which P5's schema parse checks (both Nat in RaceLog).
 */
const courseArb: fc.Arbitrary<Course> = fc.oneof(
  fc.constantFrom(...COURSES),
  fc.array(segmentArb, { minLength: 1, maxLength: 6 }).map((s) => testCourse(s)),
);

const fieldArb = (min: number, max: number, maxSkills = 3) =>
  fc
    .array(buildArb(maxSkills), { minLength: min, maxLength: max })
    .map((bs) => bs.map((b, lane) => entryOf(b, lane)));

const seedArb = fc.string({ minLength: 1, maxLength: 8 });

function byLane(log: RaceLog) {
  return [...log.results].sort((a, b) => a.lane - b.lane);
}

// --- P3, P9 helpers ------------------------------------------------------------------------------

type Pair = {
  frameId: string;
  base: RaceEntry["stats"];
  lengthM: number;
  d: number;
};

const pairArb: fc.Arbitrary<Pair> = fc.record({
  frameId: fc.constantFrom(...ALL_FRAMES),
  base: statsArb,
  lengthM: fc.integer({ min: 200, max: 3000 }),
  d: fc.integer({ min: 1, max: 200 }),
});

export function frameEntry(
  R: Ruleset,
  frameId: string,
  stats: RaceEntry["stats"],
  course: Course,
): RaceEntry {
  return freezeEntry(
    R,
    content,
    {
      runnerId: "m",
      kind: "rival",
      falconessId: null,
      baseStats: stats,
      mood: 0,
      styleAptitude: { dive: "B", hover: "B", glide: "B", ground: "B" },
      frameId,
      parts: [],
      quirks: [],
      learnedSkills: [],
      durability: null,
    },
    course,
    0,
  );
}

/** Solo run on `course`: finish time, exhaustion, and (for pulse frames) the one-burst slack q. */
export function solo(ruleset: Ruleset, e: RaceEntry, course: Course) {
  // the probe hands the tables out through a box: a `let` assigned in the callback would stay
  // narrowed to its initial null at the read below
  const box: { tables?: RaceArena["tables"] } = {};
  let q = 1;
  const log = simulateRaceProbed(
    ruleset,
    [e],
    course,
    "mono",
    (t, A) => {
      if (t === 0) box.tables = A.tables;
    },
    { detail: "results" },
  );
  const T = box.tables;
  if (T !== undefined && T.pulseFrame[0] === 1) {
    // q = 1 + ceilDiv(pulseTicks × BpMax, vC0): one burst of the largest pulse thrust at the
    // slowest flat cruise (the course is a single flat segment)
    let air = 0;
    let stoop = 1000;
    for (let ph = 0; ph < 3; ph++) stoop = Math.max(stoop, T.stoop[ips(0, ph, 0)] ?? 1000);
    air = T.airPm[is(0, 0)] ?? 1000;
    const bpMax = Math.floor((Math.floor(((T.Bpc[ib(0, 0)] ?? 0) * air) / 1000) * stoop) / 1000);
    let vC0 = Number.MAX_SAFE_INTEGER;
    for (let ph = 0; ph < 3; ph++) vC0 = Math.min(vC0, T.vC[ibps(0, 0, ph, 0)] ?? 1);
    q = 1 + ceilDiv(ruleset.race.pulseTicks * bpMax, vC0);
  }
  const r = at(log.results, 0);
  return { milli: r.finishMilli ?? Number.MAX_SAFE_INTEGER, exhausted: r.exhausted, q };
}

/**
 * The three tiers of ADR-0003 D41 for one stat raised by d (solo, flat, noise off, no actives),
 * tier (a) as ADR-0003 D52 narrows it.
 */
function monotone(R: Ruleset, statName: "agility" | "stamina", tiers: "a" | "bc") {
  const ruleset = tiers === "a" ? noBoost(R) : quiet(R);
  return fc.property(pairArb, ({ frameId, base, lengthM, d }) => {
    const course = testCourse([{ type: "flat", length: lengthM }], "flat-mono");
    const lo = solo(ruleset, frameEntry(R, frameId, base, course), course);
    const raised = { ...base, [statName]: base[statName] + d };
    const hi = solo(ruleset, frameEntry(R, frameId, raised, course), course);
    if (tiers === "a") {
      // ADR-0003 D52: strict only when neither run exhausts; an exhausted no-boost pair gets the
      // tier (c) bound of 0.5 %. When hp runs out, the tick that crosses finalStart is charged at
      // the drain rate of its start phase and exhaustion is whole-tick, so the faster runner can
      // empty hp earlier and crawl longer at vMin: over 12 000 pairs of every frame, 42 inversions
      // in 3579 exhausted pairs, worst +1333 mt (0.07 %, caracara-signature), both engines alike
      // (SPEC_RULESET). The two measured cases are pinned in properties.test.ts
      if (!lo.exhausted && !hi.exhausted) expect(hi.milli).toBeLessThanOrEqual(lo.milli);
      else expect(hi.milli * 1000).toBeLessThanOrEqual(lo.milli * 1005); // tier (c), D52
    } else if (!lo.exhausted && !hi.exhausted)
      expect(hi.milli).toBeLessThanOrEqual(lo.milli + 1000 * lo.q); // tier (b)
    else expect(hi.milli * 1000).toBeLessThanOrEqual(lo.milli * 1005); // tier (c)
  });
}

/** Register the 24.2 properties for `R`; call it inside a describe that names the ruleset. */
export function raceProperties(R: Ruleset): void {
  const QUIET = quiet(R);

  // --- P1 ----------------------------------------------------------------------------------------

  describe("P1 determinism (docs/race-engine.md 24.2)", () => {
    it(
      "two calls give byte-identical logs; entry order is irrelevant; inputs are never mutated",
      () => {
        fc.assert(
          fc.property(fieldArb(1, 8), courseArb, seedArb, (entries, course, seed) => {
            const before = JSON.stringify(entries);
            const a = JSON.stringify(simulateRace(R, entries, course, seed));
            const b = JSON.stringify(simulateRace(R, [...entries].reverse(), course, seed));
            expect(b).toBe(a);
            expect(JSON.stringify(entries)).toBe(before);
          }),
          { numRuns: RUNS },
        );
      },
      HEAVY,
    );
  });

  // --- P2 ----------------------------------------------------------------------------------------

  describe("P2 symmetry", () => {
    it(
      "noise off: identical builds without actives tie exactly in any number of lanes",
      () => {
        fc.assert(
          fc.property(buildArb(0), fc.integer({ min: 2, max: 8 }), courseArb, (b, n, course) => {
            const entries = Array.from({ length: n }, (_, lane) => entryOf(b, lane));
            const log = simulateRace(QUIET, entries, course, "sym");
            const ms = new Set(log.results.map((r) => r.finishMilli));
            expect(ms.size).toBe(1);
            for (const r of log.results) {
              expect(r.deadHeat).toBe(true);
              expect(r.marginMm).toBe(0);
            }
            expect(new Set(log.frames?.runners.map((r) => JSON.stringify(r))).size).toBe(1);
          }),
          { numRuns: RUNS },
        );
      },
      HEAVY,
    );

    it(
      "noise on: 8 identical builds over 2000 seeds, each lane wins 12.5 % ± 3 %",
      () => {
        const course = content.getCourse("sprint");
        const entries = Array.from({ length: 8 }, (_, lane) =>
          neutralFixtureEntry({
            runnerId: `h-${lane}`,
            laneIndex: lane,
            style: "hover",
            stats: { agility: 600, stamina: 600, technique: 600, courage: 600, intelligence: 600 },
          }),
        );
        const arena = createRaceArena();
        const geometry = buildCourseGeometry(R, course);
        const wins = new Array<number>(8).fill(0);
        const N = 2000;
        for (let k = 0; k < N; k++) {
          const log = simulateRace(R, entries, course, `stat-${k}`, {
            detail: "results",
            arena,
            geometry,
          });
          const lane = at(log.results, 0).lane;
          wins[lane] = (wins[lane] ?? 0) + 1;
        }
        for (const w of wins) expect(Math.abs(w / N - 0.125)).toBeLessThanOrEqual(0.03);
      },
      HEAVY,
    );
  });

  describe("P3 agility monotonicity, three tiers (ADR-0003 D41)", () => {
    it(
      "(a) boost neutralised (kBoost = kH = 0): strict when neither run exhausts, tier (c) otherwise (ADR-0003 D52)",
      () => {
        fc.assert(monotone(R, "agility", "a"), { numRuns: RUNS });
      },
      HEAVY,
    );

    it(
      "(b) within one tick (one burst for pulse frames) when neither run exhausts; (c) within 0.5 % otherwise",
      () => {
        fc.assert(monotone(R, "agility", "bc"), { numRuns: RUNS });
      },
      HEAVY,
    );
  });

  describe("P9 stamina monotonicity (tiers b and c)", () => {
    it(
      "more stamina never costs more than one tick (one burst) without exhaustion, 0.5 % with it",
      () => {
        fc.assert(monotone(R, "stamina", "bc"), { numRuns: RUNS });
      },
      HEAVY,
    );
  });

  // --- P4 ----------------------------------------------------------------------------------------

  describe("P4 bounds on every tick", () => {
    it(
      "hp, energy, heat, durability and speed stay in bounds; governed runners never pass capLim; licensed runners never break themselves; the telemetry clamp is a no-op",
      () => {
        fc.assert(
          fc.property(fieldArb(1, 8), courseArb, seedArb, (entries, course, seed) => {
            const bad: string[] = [];
            const n = entries.length;
            const prevPos = new Float64Array(n);
            const dur0 = new Float64Array(n);
            const minDur = new Float64Array(n).fill(Number.MAX_SAFE_INTEGER);
            const telemetry = new Uint8Array(n);
            const E = [...entries].sort((a, b) => a.laneIndex - b.laneIndex);
            const log = simulateRaceProbed(R, entries, course, seed, (t, A) => {
              const S = A.state;
              const T = A.tables;
              for (let i = 0; i < n; i++) {
                if (t === 0) {
                  // 13 telemetry (2): the defensive clamp heat = min(heat, D) is asserted as a no-op.
                  // It is switched off after tick 0 (heat ≤ kH there), so heat ≤ D below is the
                  // governor's work alone (capLim = D), not the clamp's
                  telemetry[i] = T.clampHeat[i] ?? 0;
                  T.clampHeat[i] = 0;
                }
                const hp = S.hp[i] ?? -1;
                const energy = S.energy[i] ?? -1;
                const heat = S.heat[i] ?? -1;
                const dur = S.dur[i] ?? -1;
                if (t === 0) dur0[i] = (at(E, i).durabilityStart ?? 0) * 1000;
                if (hp < 0 || hp > (T.hpMax[i] ?? 0)) bad.push(`t${t} ${i} hp ${hp}`);
                if (energy < 0 || energy > (T.Emax[i] ?? 0))
                  bad.push(`t${t} ${i} energy ${energy}`);
                if (heat < 0) bad.push(`t${t} ${i} heat ${heat}`);
                if (telemetry[i] === 1 && heat > (T.D[i] ?? 0)) bad.push(`t${t} ${i} telemetry`);
                if (T.licensed[i] !== 1 && heat > (T.capLim[i] ?? 0))
                  bad.push(`t${t} ${i} governor`);
                if (dur < 0 || dur > (T.durMax[i] ?? 0)) bad.push(`t${t} ${i} dur ${dur}`);
                if ((S.vOut[i] ?? -1) < 0 || (S.vCore[i] ?? -1) < 0) bad.push(`t${t} ${i} speed`);
                if ((S.pos[i] ?? 0) < (prevPos[i] ?? 0)) bad.push(`t${t} ${i} pos back`);
                prevPos[i] = S.pos[i] ?? 0;
                minDur[i] = Math.min(minDur[i] ?? 0, dur);
              }
            });
            expect(bad.slice(0, 5)).toEqual([]);
            expect(log.results.every((r) => !r.dnf)).toBe(true);
            // durability: without a water hit or a crash, only the licence costs durability, and it
            // never takes a runner to its floor (25 % of durabilityMax) or breaks its wings
            for (let i = 0; i < n; i++) {
              const external = (log.events ?? []).some(
                (e) =>
                  e.lane === i &&
                  ((e.kind === "waterHit" && e.damage > 0) ||
                    (e.kind === "jumpFail" && e.damage > 0)),
              );
              if (external) continue;
              const e = at(E, i);
              const floor = Math.floor((e.durabilityMax * 1000 * R.race.overheatFloorPm) / 1000);
              expect(minDur[i]).toBeGreaterThanOrEqual(Math.min(dur0[i] ?? 0, floor + 1));
              const r = at(byLane(log), i);
              if (e.durabilityStart > 0) expect(r.broken).toBe(false);
            }
          }),
          { numRuns: RUNS },
        );
      },
      HEAVY,
    );
  });

  // --- P5 ----------------------------------------------------------------------------------------

  describe("P5 log consistency (and P8 integers)", () => {
    it(
      "places, finish events, time intervals, frames, boost counts, pulses, plans, the energy identity",
      () => {
        fc.assert(
          fc.property(fieldArb(1, 8), courseArb, seedArb, (entries, course, seed) => {
            const log = simulateRace(R, entries, course, seed);
            expect(RaceLogSchema.parse(log)).toEqual(log);
            const n = entries.length;
            expect(log.results.map((r) => r.place).sort((a, b) => a - b)).toEqual(
              Array.from({ length: n }, (_, k) => k + 1),
            );
            const events = log.events ?? [];
            const E = [...entries].sort((a, b) => a.laneIndex - b.laneIndex);
            for (const r of log.results) {
              const fin = events.filter((e) => e.kind === "finish" && e.lane === r.lane);
              expect(fin).toHaveLength(1);
              const f = at(fin, 0);
              expect(f.kind === "finish" && [f.place, f.finishMilli]).toEqual([
                r.place,
                r.finishMilli,
              ]);
              const tt = r.timeTicks ?? 0;
              expect(r.finishMilli ?? -1).toBeGreaterThanOrEqual(1000 * (tt - 1));
              expect(r.finishMilli ?? -1).toBeLessThanOrEqual(1000 * tt);
              expect(r.marginMm ?? -1).toBeGreaterThanOrEqual(0);
              const L = r.ledger;
              expect(
                at(E, r.lane).energy * 1000 -
                  L.energySpent -
                  L.energyLift +
                  L.energyRegen +
                  L.energyRefunded +
                  L.energyFromHeat,
              ).toBe(r.energyEnd);
              const pulses = events.filter((e) => e.kind === "pulse" && e.lane === r.lane).length;
              expect(L.pulses).toBe(pulses);
              const planEvents = events.filter((e) => e.kind === "sprintPlan" && e.lane === r.lane);
              expect(planEvents.length).toBeLessThanOrEqual(1 + R.race.maxReplans);
              const col = at(log.frames?.runners, r.lane).boost;
              expect(col.reduce((a, b) => a + b, 0)).toBe(L.boostTicks.reduce((a, b) => a + b, 0));
            }
            const ticks = log.frames?.tick ?? [];
            for (let k = 1; k < ticks.length; k++)
              expect(at(ticks, k)).toBeGreaterThan(at(ticks, k - 1));
          }),
          { numRuns: RUNS },
        );
      },
      HEAVY,
    );
  });

  describe("P5b boostMode hysteresis (ADR-0003 D54)", () => {
    it(
      "the log keeps exactly the (mode, level) spans that hold sampleEveryTicks ticks and change the last kept pair, at the tick they began",
      () => {
        const minTicks = R.race.log.sampleEveryTicks;
        type Change = { tick: number; lane: number; posMm: number; mode: string; levelMms: number };
        fc.assert(
          fc.property(fieldArb(1, 8), courseArb, seedArb, (entries, course, seed) => {
            const n = entries.length;
            // every raw change the controller makes (B7), with the tick-start position
            const changes: Change[][] = Array.from({ length: n }, () => []);
            const mode = new Int32Array(n).fill(MODE_OFF);
            const level = new Int32Array(n);
            const pos = new Float64Array(n);
            const log = simulateRaceProbed(R, entries, course, seed, (t, A) => {
              const S = A.state;
              for (let i = 0; i < n; i++) {
                const m = S.mode[i] ?? MODE_OFF;
                const l = S.modeLevel[i] ?? 0;
                if (m !== mode[i] || l !== level[i]) {
                  changes[i]?.push({
                    tick: t,
                    lane: i,
                    posMm: Math.floor((pos[i] ?? 0) / POS_PER_MM),
                    mode: modeName(m),
                    levelMms: Math.floor(l / VEL_PER_MMS),
                  });
                  mode[i] = m;
                  level[i] = l;
                }
                pos[i] = S.pos[i] ?? 0;
              }
            });
            // a span lasts until the next change, or the tick after the runner's last simulated tick
            const want: Change[] = [];
            for (let i = 0; i < n; i++) {
              const r = log.results.find((x) => x.lane === i);
              const end = r?.timeTicks ?? log.ticks;
              const cs = changes[i] ?? [];
              let shown = "off 0";
              cs.forEach((c, k) => {
                const stop = cs[k + 1]?.tick ?? end;
                const key = `${c.mode} ${c.levelMms}`;
                if (stop - c.tick >= minTicks && key !== shown) {
                  want.push(c);
                  shown = key;
                }
              });
            }
            want.sort((a, b) => a.tick - b.tick || a.lane - b.lane);
            const got = (log.events ?? []).flatMap((e) =>
              e.kind === "boostMode"
                ? [
                    {
                      tick: e.tick,
                      lane: e.lane,
                      posMm: e.posMm,
                      mode: e.mode,
                      levelMms: e.levelMms,
                    },
                  ]
                : [],
            );
            expect(got).toEqual(want);
          }),
          { numRuns: RUNS },
        );
      },
      HEAVY,
    );
  });

  // --- P6 ----------------------------------------------------------------------------------------

  describe("P6 RNG accounting and isolation", () => {
    it(
      "32 n draws from race and one quirks draw per lucky holder, before tick 0",
      () => {
        fc.assert(
          fc.property(fieldArb(1, 8, 2), courseArb, (entries, course) => {
            const counts = { race: 0, quirks: 0 };
            const rng = new Rng("p6");
            const src = {
              nextU32(stream: "race" | "quirks") {
                counts[stream] += 1;
                return rng.nextU32(stream);
              },
            };
            const E = [...entries].sort((a, b) => a.laneIndex - b.laneIndex);
            const A = createRaceArena().reset(E.length, buildCourseGeometry(R, course));
            drawRaceBlock(R, E, src, A);
            expect(counts.race).toBe(32 * E.length);
            expect(counts.quirks).toBe(E.filter((e) => e.traits.randomSkillGuaranteed).length);
          }),
          { numRuns: RUNS },
        );
      },
      HEAVY,
    );

    it(
      "changing one runner's build never shifts another runner's pace, plan error or skill draws",
      () => {
        fc.assert(
          fc.property(
            fieldArb(2, 8),
            buildArb(),
            fc.nat(),
            courseArb,
            seedArb,
            (entries, other, k, course, seed) => {
              const lane = k % entries.length;
              const changed = entries.map((e) => (e.laneIndex === lane ? entryOf(other, lane) : e));
              const a = simulateRace(R, entries, course, seed, { detail: "results" });
              const b = simulateRace(R, changed, course, seed, { detail: "results" });
              for (let i = 0; i < entries.length; i++) {
                if (i === lane) continue;
                const da = at(a.derived, i);
                const db = at(b.derived, i);
                // the lucky pick may move: one quirks draw per holder in lane order (17.1)
                expect([db.pace, db.planErrPm, db.u]).toEqual([da.pace, da.planErrPm, da.u]);
              }
            },
          ),
          { numRuns: RUNS },
        );
      },
      HEAVY,
    );

    it(
      "P6b: disabling any skill keeps every draw (pace, plan error, lucky pick, every u) and never fires it",
      () => {
        const withSkills = fieldArb(1, 8).filter((es) => es.some((e) => e.skills.length > 0));
        fc.assert(
          fc.property(
            withSkills,
            fc.nat(),
            fc.nat(),
            courseArb,
            seedArb,
            (entries, a, b, course, seed) => {
              const carriers = entries.filter((e) => e.skills.length > 0);
              const target = at(carriers, a % carriers.length);
              const skillId = at(target.skills, b % target.skills.length).id;
              const off = entries.map((e) => (e === target ? disableSkill(e, skillId) : e));
              const on = simulateRace(R, entries, course, seed);
              const dis = simulateRace(R, off, course, seed);
              for (let i = 0; i < entries.length; i++) {
                const x = at(on.derived, i);
                const y = at(dis.derived, i);
                expect([y.pace, y.planErrPm, y.u, y.luckySkill]).toEqual([
                  x.pace,
                  x.planErrPm,
                  x.u,
                  x.luckySkill,
                ]);
              }
              const r = at(byLane(dis), target.laneIndex);
              expect(r.ledger.skillsActivated).not.toContain(skillId);
              expect(r.ledger.skillsMissed).not.toContain(skillId);
              const evs = (dis.events ?? []).filter(
                (e) =>
                  e.lane === target.laneIndex &&
                  (e.kind === "skill" || e.kind === "skillMiss") &&
                  e.skillId === skillId,
              );
              expect(evs).toEqual([]);
            },
          ),
          { numRuns: RUNS },
        );
      },
      HEAVY,
    );
  });

  // --- P7 ----------------------------------------------------------------------------------------

  describe("P7 options invariance", () => {
    const arena = createRaceArena();
    it(
      "results and derived are identical across detail modes, with or without an arena or a cached geometry",
      () => {
        fc.assert(
          fc.property(fieldArb(1, 8), courseArb, seedArb, (entries, course, seed) => {
            const geometry = buildCourseGeometry(R, course);
            const full = simulateRace(R, entries, course, seed);
            const want = JSON.stringify([full.results, full.derived]);
            for (const opts of [
              { detail: "results" as const },
              { arena },
              { geometry, arena, detail: "results" as const },
            ]) {
              const v = simulateRace(R, entries, course, seed, opts);
              expect(JSON.stringify([v.results, v.derived])).toBe(want);
            }
          }),
          { numRuns: RUNS },
        );
      },
      HEAVY,
    );
  });

  describe("generated builds really exercise the controller", () => {
    it(
      "dives, pulses, licences, plans and kicks all occur across the generated fields",
      () => {
        const seen = new Set<string>();
        fc.assert(
          fc.property(fieldArb(4, 8), courseArb, seedArb, (entries, course, seed) => {
            const log = simulateRace(R, entries, course, seed);
            for (const e of log.events ?? []) {
              if (e.kind === "boostMode") seen.add(e.mode);
              if (e.kind === "pulse") seen.add("pulse");
              if (e.kind === "sprintPlan") seen.add(`plan:${e.reason}`);
              if (e.kind === "freeBoost") seen.add("free");
            }
            for (const r of log.results) if (r.ledger.overheatTicks > 0) seen.add("overheat");
            for (const [i, e] of [...entries].sort((x, y) => x.laneIndex - y.laneIndex).entries())
              if (e.style === "dive" && at(log.derived, i).stoopPm !== 1000) seen.add("stoop");
          }),
          { numRuns: 30, seed: 20_261_028 },
        );
        for (const k of ["surplus", "plan", "kick", "hold", "pulse", "plan:planned", "free"])
          expect(seen).toContain(k);
      },
      HEAVY,
    );
  });
}
