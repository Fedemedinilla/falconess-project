import { loadContent } from "@falconess/content";
import { Rng } from "@falconess/rng";
import type { Course, RaceEntry, RaceEvent, RaceLog, RaceSkill, Style } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import type { Ruleset } from "../rulesets/index.js";
import { simulateRace, simulateRaceProbed } from "./engine.js";
import { freezeEntry } from "./entry.js";
import { neutralFixtureEntry } from "./fixtures.js";
import { buildCourseGeometry, type CourseGeometry } from "./geometry.js";
import { createPlanReport, mapBack, type PlanReport, planSprint, thrustDist } from "./sprint.js";
import {
  buildTables,
  createRaceArena,
  drawRaceBlock,
  F_EXHAUSTED,
  F_PLAN_ACTIVE,
  F_REPLAN,
  ib,
  initState,
  type RaceState,
  type RaceTables,
} from "./state.js";
import { SPEC_RULESET } from "./testing/spec-ruleset.js";
import { MODE_KICK, MODE_PLAN, SEG_JUMP } from "./units.js";

/**
 * Final sprint plan of docs/race-engine.md 11: the worked values of 11.4, a fixture for every
 * `NONE` reason, the tie and clean rules, the hp window cut, perception, the licence kept out of
 * the plan, whole pulses, replans and their cap, and the jump fixtures (thrust coordinates,
 * `mapBack`, the terminal jump).
 */

const content = loadContent();
const S600 = { agility: 600, stamina: 600, technique: 600, courage: 600, intelligence: 600 };
const QUIET: Ruleset = {
  ...SPEC_RULESET,
  race: { ...SPEC_RULESET.race, paceHalfWidth: 0, paceCentreSpan: 0, planErrorMax: 0 },
};
const SPRINT = content.getCourse("sprint");
const RIDGE = content.getCourse("ridge");
const CANYON = content.getCourse("canyon");
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

function frame(frameId: string, course: Course, ruleset: Ruleset = QUIET): RaceEntry {
  return freezeEntry(
    ruleset,
    content,
    {
      runnerId: frameId,
      kind: "rival",
      falconessId: null,
      baseStats: S600,
      mood: 0,
      positionAptitude: { lead: "B", pack: "B", stalk: "B", closer: "B" },
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

type Plan = Extract<RaceEvent, { kind: "sprintPlan" }>;

function plans(log: RaceLog): Plan[] {
  return (log.events ?? []).filter((e): e is Plan => e.kind === "sprintPlan");
}

type Unit = { G: CourseGeometry; T: RaceTables; S: RaceState; out: PlanReport; R: Ruleset };

/** Tables and initial state for direct planSprint calls. */
function unit(entries: RaceEntry[], course: Course, ruleset: Ruleset = QUIET): Unit {
  const G = buildCourseGeometry(ruleset, course);
  const A = createRaceArena().reset(entries.length, G);
  drawRaceBlock(ruleset, entries, new Rng("plan"), A);
  buildTables(ruleset, entries, G, A);
  initState(ruleset, entries, A);
  return { G, T: A.tables, S: A.state, out: createPlanReport(), R: ruleset };
}

function planAt(u: Unit, x: number, i = 0): PlanReport {
  u.S.pos[i] = x;
  let s = 0;
  while (s < u.G.S - 1 && x >= (u.G.segEnd[s] ?? 0)) s++;
  u.S.seg[i] = s;
  planSprint(u.R.race, u.G, u.T, u.S, i, u.out);
  return u.out;
}

describe("worked values of docs/race-engine.md 11.4 (neutral dive, 600 stats, noise off)", () => {
  it("sprint: SURPLUS spends 1 at the gun; at 800.8 m Ep 99 plans 1.80 m/s from 801 m, 90 on-ticks; 54.12 s", () => {
    const log = simulateRace(QUIET, [fixture("dive")], SPRINT, "w");
    // the one-tick SURPLUS at the gun and the OFF after it hold less than a second, so the log
    // keeps no boostMode event for them (ADR-0003 D54); boostTicks below still counts the tick
    const modes = (log.events ?? []).filter((e) => e.kind === "boostMode");
    expect(modes.map((e) => [e.tick, e.posMm, e.mode, e.levelMms])).toEqual([
      [561, 800_802, "plan", 1800],
      [775, 1_140_214, "kick", 0],
    ]);
    expect(plans(log)).toHaveLength(1);
    expect(at(plans(log), 0)).toMatchObject({
      posMm: 800_802,
      cause: "phase",
      index: 0,
      reason: "planned",
      energy: 99_000,
      energyPerceived: 99_000,
      jumpReserve: 0,
      startMm: 800_802,
      endMm: 1_140_000,
      levelMms: 1800,
      candidates: 42,
      onTicks: 90,
      clean: true,
    });
    const r = at(log.results, 0);
    expect(r.ledger.boostTicks).toEqual([1, 0, 99]);
    expect(r.energyEnd).toBe(0);
    expect(((r.finishMilli ?? 0) / 15_000).toFixed(2)).toBe("54.12");
  });

  it("the plan spends in PLAN up to the window end and the kick uses the rest from kickAt (1140 m)", () => {
    let plan = 0;
    let kick = 0;
    let kickFrom = Number.POSITIVE_INFINITY;
    simulateRaceProbed(QUIET, [fixture("dive")], SPRINT, "w", (_t, A) => {
      if (A.state.boostOn[0] !== 1) return;
      if (A.state.mode[0] === MODE_PLAN) plan++;
      if (A.state.mode[0] === MODE_KICK) {
        kick++;
        kickFrom = Math.min(kickFrom, A.state.prevPos[0] ?? 0);
      }
    });
    // 90 planned on-ticks realise 91 (the accumulator's one-tick bound), the kick spends the last 8
    expect([plan, kick]).toEqual([91, 8]);
    expect(kickFrom).toBeGreaterThanOrEqual(1140 * M);
  });

  it("ridge: 15 on the first descent, jump 1 costs 20; at 1334 m Ep 65 − 15 plans 2.60 m/s from 1800 m; the jump-exit replan confirms it", () => {
    const log = simulateRace(QUIET, [fixture("dive")], RIDGE, "w");
    const r = at(log.results, 0);
    expect(r.ledger.boostTicks).toEqual([15, 0, 50]);
    const [first, second] = plans(log);
    expect(first).toMatchObject({
      posMm: 1_334_006,
      cause: "phase",
      reason: "planned",
      energy: 65_000,
      jumpReserve: 15_000,
      startMm: 1_800_146,
      endMm: 1_940_000,
      levelMms: 2600,
      onTicks: 49,
    });
    expect(second).toMatchObject({
      posMm: 1_580_098,
      cause: "jump",
      index: 1,
      energy: 50_000,
      jumpReserve: 0,
      startMm: 1_800_950,
      levelMms: 2600,
    });
    expect(((r.finishMilli ?? 0) / 15_000).toFixed(2)).toBe("86.91");
  });

  it("canyon: hp binds; hp-limited window [2001, 2771) m, 1.80 m/s from 2401 m, 99 on-ticks, empty at 2822 m with the tank spent (no wind, ADR-0007)", () => {
    const log = simulateRace(QUIET, [fixture("dive")], CANYON, "w");
    expect(plans(log)).toHaveLength(1);
    expect(at(plans(log), 0)).toMatchObject({
      posMm: 2_000_978,
      reason: "hp-limited",
      startMm: 2_400_516,
      endMm: 2_770_766,
      levelMms: 1800,
      onTicks: 99,
      clean: true,
    });
    const r = at(log.results, 0);
    expect([r.ledger.hpEmptyMm, r.energyEnd, r.exhausted]).toEqual([2_822_410, 0, true]);
    expect(((r.finishMilli ?? 0) / 15_000).toFixed(2)).toBe("134.90");
  });

  it("a neutral hover plans at 70 %: 1.30 m/s from 841 m on the sprint", () => {
    const p = at(plans(simulateRace(QUIET, [fixture("hover")], SPRINT, "w")), 0);
    expect([p.posMm, p.startMm, p.levelMms]).toEqual([841_348, 841_348, 1300]);
  });
});

describe("NONE reasons and the plan report (docs/race-engine.md 11.3)", () => {
  it("planned: counts the plan, writes level, start and end", () => {
    const u = unit([fixture("dive")], SPRINT);
    u.S.energy[0] = 99_000;
    const out = planAt(u, 800_802 * 225);
    expect([out.reason, out.level, out.onTicks, out.candidates, out.clean]).toEqual([
      "planned",
      27_000,
      90,
      42,
      true,
    ]);
    expect([u.S.planCount[0], u.S.planLevel[0], u.S.planEndPos[0]]).toEqual([1, 27_000, 1140 * M]);
  });

  it("exhausted, past-reserve, no-energy, no-candidate and an empty hp window give a zero-level plan at pos", () => {
    const cases: [string, (u: Unit) => number][] = [
      [
        "exhausted",
        (u) => {
          u.S.flags[0] = (u.S.flags[0] ?? 0) | F_EXHAUSTED;
          return 900 * M;
        },
      ],
      ["past-reserve", (u) => u.T.kickAt[0] ?? 0],
      [
        "no-energy",
        (u) => {
          u.S.energy[0] = 999;
          return 900 * M;
        },
      ],
      [
        "no-candidate",
        (u) => {
          u.T.sMax[ib(0, 0)] = 0;
          return 900 * M;
        },
      ],
      [
        "hp-limited",
        (u) => {
          u.S.hp[0] = 1;
          return 900 * M;
        },
      ],
    ];
    for (const [reason, prep] of cases) {
      const u = unit([fixture("dive")], SPRINT);
      const x = prep(u);
      const out = planAt(u, x);
      expect([out.reason, out.level, out.startPos, out.endPos]).toEqual([reason, 0, x, x]);
      expect([u.S.planLevel[0], u.S.planStartPos[0], u.S.planEndPos[0], u.S.planCount[0]]).toEqual([
        0,
        x,
        x,
        1,
      ]);
    }
  });

  it("no-thrust when Bon is 0; a pulse frame needs a whole burst (12 × 1200) to plan", () => {
    const noThrust: Ruleset = { ...QUIET, race: { ...QUIET.race, kBoost: 0 } };
    const u = unit([fixture("dive")], SPRINT, noThrust);
    expect(planAt(u, 900 * M).reason).toBe("no-thrust");
    const p = unit([frame("shiden", SPRINT)], SPRINT);
    p.S.energy[0] = 14_399;
    expect(planAt(p, 900 * M).reason).toBe("no-energy");
    p.S.energy[0] = 14_400;
    expect(planAt(p, 900 * M).reason).toBe("planned");
  });
});

describe("candidate rules (docs/race-engine.md 11.3)", () => {
  it("exact ties keep the highest clean level: with no heat (kH 0) every candidate is clean and sMax wins", () => {
    const cold: Ruleset = { ...QUIET, race: { ...QUIET.race, kH: 0 } };
    const u = unit([fixture("hover")], SPRINT, cold);
    const out = planAt(u, 841 * M);
    expect([out.level, out.clean]).toEqual([u.T.sMax[ib(0, 0)], true]);
    // under v1 heat the higher levels are unclean: 1.30 m/s
    const v1 = unit([fixture("hover")], SPRINT);
    v1.S.energy[0] = 90_000;
    expect(planAt(v1, 841 * M).level).toBe(1300 * 15);
  });

  it("regen breaks the ties towards lower levels (more off-ticks to regenerate)", () => {
    const cold: Ruleset = { ...QUIET, race: { ...QUIET.race, kH: 0 } };
    const u = unit([fixture("hover", { rule: "regen" })], SPRINT, cold);
    const out = planAt(u, 841 * M);
    expect(out.clean).toBe(true);
    expect(out.level).toBeLessThan(u.T.sMax[ib(0, 0)] ?? 0);
  });

  it("clean first: with no heat budget left no candidate is clean, and the plan says so", () => {
    const u = unit([fixture("dive")], SPRINT);
    u.S.heat[0] = 10_000_000;
    const out = planAt(u, 900 * M);
    expect([out.reason, out.clean]).toEqual(["planned", false]);
    const v = unit([fixture("dive")], SPRINT);
    expect(planAt(v, 900 * M).clean).toBe(true);
  });

  it("the overheat licence never enters the plan (Steinhaus plans at capLim like everyone)", () => {
    const mt = fixture("dive", { rule: "mass-thrust" });
    const a = unit([mt], SPRINT);
    const b = unit([mt], SPRINT);
    b.T.licensed[0] = 0;
    expect(a.T.licensed[0]).toBe(1);
    expect({ ...planAt(a, 850 * M) }).toEqual({ ...planAt(b, 850 * M) });
  });

  it("pulse frames count whole bursts: on-ticks are multiples of 12; shiden plans sMax 39 122 vu", () => {
    for (const course of [SPRINT, RIDGE, CANYON])
      for (const f of ["shiden", "hayate", "peregrina-signature"]) {
        const log = simulateRace(QUIET, [frame(f, course)], course, "pulse");
        for (const p of plans(log)) expect(p.onTicks % 12).toBe(0);
      }
    const u = unit([frame("shiden", SPRINT)], SPRINT);
    expect(planAt(u, 801 * M).level).toBe(39_122);
  });

  it("the spurt never starts before the current position", () => {
    for (const course of [SPRINT, RIDGE, CANYON])
      for (const st of ["dive", "hover", "glide", "ground"] as const)
        for (const pw of [800, 1000, 1400]) {
          const log = simulateRace(SPEC_RULESET, [fixture(st, { powerToWeight: pw })], course, "s");
          for (const p of plans(log)) {
            expect(p.startMm).toBeGreaterThanOrEqual(p.posMm);
            expect(p.endMm).toBeGreaterThanOrEqual(p.startMm);
          }
        }
  });
});

describe("perception (docs/race-engine.md 10)", () => {
  it("the plan sees energy and hp × (1000 + planErr); I ≥ 1200 sees true values", () => {
    for (const seed of ["p1", "p2", "p3", "p4"]) {
      const log = simulateRace(SPEC_RULESET, [fixture("dive")], SPRINT, seed);
      const err = at(log.derived, 0).planErrPm;
      expect(Math.abs(err)).toBeLessThanOrEqual(75);
      const p = at(plans(log), 0);
      expect(p.energyPerceived).toBe(Math.floor((p.energy * (1000 + err)) / 1000));
    }
    const sharp = fixture("dive", { stats: { ...S600, intelligence: 1200 } });
    const p = at(plans(simulateRace(SPEC_RULESET, [sharp], SPRINT, "p1")), 0);
    expect([p.energyPerceived, p.hpPerceived]).toEqual([p.energy, p.hp]);
  });
});

describe("replans (docs/race-engine.md 11.1)", () => {
  function refundSkill(): RaceSkill {
    return {
      id: "late-refund",
      uniqueTo: null,
      activationBasePm: 1000,
      trigger: {
        phase: "final",
        segment: null,
        posLoPm: null,
        posHiPm: null,
        heatAboveMilli: null,
        energyBelowMilli: 60_000,
        once: true,
      },
      effect: {
        speedMms: 0,
        accelMms2: 0,
        energyRefundMilli: 10_000,
        heatCoolMilli: 0,
        durabilityGuard: false,
        durationTicks: 0,
      },
      disabled: false,
    };
  }

  it("an energy refund inside the plan, a jump exit and broken wings each replan from the current position", () => {
    const lucky = fixture("dive", { skills: [refundSkill()] });
    const withLuck = { ...lucky, traits: { ...lucky.traits, randomSkillGuaranteed: true } };
    const refund = plans(simulateRace(QUIET, [withLuck], SPRINT, "r"));
    expect(refund.map((p) => p.cause)).toEqual(["phase", "refund"]);
    expect(at(refund, 1).energy).toBeGreaterThan(at(refund, 0).energy - 99_000);
    expect(at(refund, 1).startMm).toBeGreaterThanOrEqual(at(refund, 1).posMm);

    expect(plans(simulateRace(QUIET, [fixture("hover")], RIDGE, "j")).map((p) => p.cause)).toEqual([
      "phase",
      "jump",
    ]);
    const broken = plans(
      simulateRace(QUIET, [fixture("glide", { durabilityStart: 3 })], CANYON, "b"),
    );
    expect(broken.map((p) => p.cause)).toEqual(["phase", "broken"]);
  });

  it("at most 4 replans after the first plan: later requests are dropped", () => {
    let count = 0;
    const log = simulateRaceProbed(QUIET, [fixture("dive")], SPRINT, "cap", (_t, A) => {
      const S = A.state;
      if (((S.flags[0] ?? 0) & F_PLAN_ACTIVE) !== 0) S.flags[0] = (S.flags[0] ?? 0) | F_REPLAN;
      count = S.planCount[0] ?? 0;
    });
    expect(count).toBe(5);
    expect(plans(log).map((p) => p.index)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("jumps in the plan (docs/race-engine.md 11.3, 11.4 fixtures)", () => {
  const TERMINAL = testCourse([
    { type: "flat", length: 1000 },
    { type: "jump", length: 100, liftRequired: 20 },
  ]);
  const INSIDE = testCourse([
    { type: "flat", length: 1500 },
    { type: "jump", length: 100, liftRequired: 20 },
    { type: "flat", length: 400 },
  ]);

  /** Boost ticks a runner takes on jump segments, and its log. */
  function jumpBoosts(ruleset: Ruleset, e: RaceEntry, course: Course) {
    const G = buildCourseGeometry(ruleset, course);
    let onJump = 0;
    const log = simulateRaceProbed(ruleset, [e], course, "jf", (_t, A) => {
      // `seg` is now the segment after the move; the tick was governed by the one at prevPos
      const x = A.state.prevPos[0] ?? 0;
      let s = 0;
      while (s < G.S - 1 && x >= (G.segEnd[s] ?? 0)) s++;
      if (A.state.boostOn[0] === 1 && G.segType[s] === SEG_JUMP) onJump++;
    });
    return { log, onJump };
  }

  it("terminal jump [flat 1000, jump 100]: kickAt and the window end at the jump entry; nothing spent inside; ≤ 6 left", () => {
    for (const [st, left] of [
      ["dive", 6000],
      ["hover", 4000],
    ] as const) {
      const { log, onJump } = jumpBoosts(QUIET, fixture(st), TERMINAL);
      expect(at(log.derived, 0).kickAtMm).toBe(1_000_000);
      expect(at(plans(log), 0).endMm).toBe(1_000_000);
      expect(onJump).toBe(0);
      expect(at(log.results, 0).energyEnd).toBe(left);
    }
  });

  it("a jump inside the window: no on-tick in the jump, the tank is spent (also the hp-limited ridge cases)", () => {
    const cases: [RaceEntry, Course][] = [
      [fixture("dive"), INSIDE],
      [fixture("hover"), INSIDE],
      [fixture("hover", { powerToWeight: 1400 }), RIDGE],
      [fixture("dive", { powerToWeight: 1400 }), RIDGE],
      [fixture("hover", { stats: { ...S600, stamina: 350 } }), RIDGE],
    ];
    for (const [e, course] of cases) {
      const { log, onJump } = jumpBoosts(QUIET, e, course);
      expect(onJump).toBe(0);
      expect(at(log.results, 0).energyEnd).toBeLessThanOrEqual(1000);
    }
    // the PW 1.4 hover's hp-limited spurt spans jump 2 (1500-1580 m)
    const p = at(
      plans(simulateRace(QUIET, [fixture("hover", { powerToWeight: 1400 })], RIDGE, "x")),
      0,
    );
    expect([p.reason, p.startMm < 1_500_000, p.endMm > 1_580_000]).toEqual([
      "hp-limited",
      true,
      true,
    ]);
  });

  it("thrustDist skips a flyer's jump; mapBack puts a spurt that spans it earlier by exactly its length", () => {
    const u = unit([fixture("dive"), fixture("ground", {}, 1)], INSIDE);
    const { G, T } = u;
    expect(thrustDist(G, T, 0, 1300 * M, 1940 * M)).toBe(540 * M);
    // 340 m of thrust distance after the jump; a 400 m spurt starts 60 m before it
    expect(mapBack(G, T, 0, 1300 * M, 1940 * M, 340 * M)).toBe(1600 * M);
    expect(mapBack(G, T, 0, 1300 * M, 1940 * M, 340 * M + 1)).toBe(1500 * M - 1);
    expect(mapBack(G, T, 0, 1300 * M, 1940 * M, 400 * M)).toBe(1440 * M);
    expect(mapBack(G, T, 0, 1300 * M, 1940 * M, 700 * M)).toBe(1300 * M); // never before pos
    // ground thrusts on its detour: the route is 1.10 × the jump's length
    expect(thrustDist(G, T, 1, 1300 * M, 1940 * M)).toBe(650 * M);
    expect(mapBack(G, T, 1, 1300 * M, 1940 * M, 340 * M + 110 * M)).toBe(1500 * M);
    expect(mapBack(G, T, 1, 1300 * M, 1940 * M, 340 * M + 55 * M)).toBe(1550 * M);
  });

  it("ground on the ridge: the plan walks route distances (detour 1.10 on both jumps)", () => {
    const u = unit([fixture("ground")], RIDGE);
    // 2000 m with 180 m of jumps routed at 1.10: 2018 m
    expect(thrustDist(u.G, u.T, 0, 0, u.G.L)).toBe(2018 * M);
    const fly = unit([fixture("hover")], RIDGE);
    expect(thrustDist(fly.G, fly.T, 0, 0, fly.G.L)).toBe(1820 * M);
  });
});
