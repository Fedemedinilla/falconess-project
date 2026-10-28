import { loadContent } from "@falconess/content";
import { U32_RANGE, uPm } from "@falconess/rng";
import type { RaceEntry, RaceSkill, RaceSkillEffect, RaceSkillTrigger } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { RULESET_V1 } from "../rulesets/index.js";
import { simulateRace } from "./engine.js";
import { freezeSkill } from "./entry.js";
import { disableSkill, neutralFixtureEntry } from "./fixtures.js";
import { buildCourseGeometry } from "./geometry.js";
import {
  requestReplan,
  runSkills,
  type SkillSink,
  skillProbability,
  tickSkillTimers,
} from "./skills.js";
import {
  buildTables,
  CAUSE_PHASE,
  CAUSE_REFUND,
  createRaceArena,
  F_PLAN_ACTIVE,
  F_REPLAN,
  initState,
  type RaceArena,
} from "./state.js";
import { PH_FINAL, PH_MIDDLE, PH_START, SEG_DESCENT, SEG_FLAT, SEG_WATER } from "./units.js";

const content = loadContent();
const R = RULESET_V1.race;
const SPRINT = content.getCourse("desert-sprint");
const S600 = { agility: 600, stamina: 600, technique: 600, courage: 600, intelligence: 600 };

/** A u32 that maps to exactly `x` ‰ with `uPm`. */
function uFor(x: number): number {
  return Math.ceil((x * U32_RANGE) / 1000);
}

function skill(
  id: string,
  trigger: Partial<RaceSkillTrigger> = {},
  effect: Partial<RaceSkillEffect> = {},
  activationBasePm = 1000,
): RaceSkill {
  return {
    id,
    uniqueTo: null,
    activationBasePm,
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

type Setup = { A: RaceArena; sink: SkillSink; calls: string[] };

/** One runner carrying `skills`; `u[j]` = the three draws of skill j (‰), default 0. */
function setup(skills: RaceSkill[], u: number[][] = [], over: Partial<RaceEntry> = {}): Setup {
  const e: RaceEntry = {
    ...neutralFixtureEntry({ runnerId: "fx", laneIndex: 0, style: "hover", stats: S600, skills }),
    ...over,
  };
  const G = buildCourseGeometry(RULESET_V1, SPRINT);
  const A = createRaceArena().reset(1, G);
  const U = new Array<number>(32).fill(0);
  u.forEach((row, j) => {
    row.forEach((x, k) => {
      U[4 + 3 * j + k] = uFor(x);
    });
  });
  A.U.set(U);
  buildTables(RULESET_V1, [e], G, A);
  initState(RULESET_V1, [e], A);
  const calls: string[] = [];
  const sink: SkillSink = {
    onSkill: (_i, j, p, uu, k) => calls.push(`skill ${j} p${p} u${uu} k${k}`),
    onMiss: (_i, j, p, uu) => calls.push(`miss ${j} p${p} u${uu}`),
  };
  return { A, sink, calls };
}

function tick(s: Setup, ph = PH_START, segType = SEG_FLAT): void {
  runSkills(R, s.A.tables, s.A.state, 0, ph, segType, s.sink);
  tickSkillTimers(s.A.tables, s.A.state, 0);
}

describe("draw mapping", () => {
  it("uFor gives exactly the wanted ‰", () => {
    for (const x of [0, 1, 499, 850, 999]) expect(uPm(uFor(x))).toBe(x);
  });
});

describe("skill probability (docs/race-engine.md 15.2)", () => {
  const base = (pm: number, id = "s") => skill(id, {}, {}, pm);

  it("pAct 850 at I 600, 700 at I 300, 200 at I 100; pSkill = fl(pAct × base)", () => {
    for (const [I, pAct] of [
      [600, 850],
      [300, 700],
      [100, 200],
      [900, 900],
    ] as const) {
      const s = setup([base(800)], [], { stats: { ...S600, intelligence: I } });
      expect(s.A.tables.pAct[0]).toBe(pAct);
      expect(skillProbability(s.A.tables, 0, 0, PH_START)).toBe(Math.floor((pAct * 800) / 1000));
    }
  });

  it("last-gasp 680 at I 600; talon-lock's final +100 → 780; on an Altair frame +150", () => {
    const lg = freezeSkill(content, "last-gasp");
    expect(skillProbability(setup([lg]).A.tables, 0, 0, PH_FINAL)).toBe(680);
    const talon = setup([lg], [], {
      traits: {
        ...neutralFixtureEntry({ runnerId: "x", laneIndex: 0, style: "dive", stats: S600 }).traits,
        activationBonusPm: { start: 0, middle: 0, final: 100, any: 0 },
      },
    });
    expect(skillProbability(talon.A.tables, 0, 0, PH_FINAL)).toBe(780);
    expect(skillProbability(talon.A.tables, 0, 0, PH_MIDDLE)).toBe(680);
    const altair = setup([lg], [], { rule: "telemetry" });
    expect(skillProbability(altair.A.tables, 0, 0, PH_START)).toBe(830);
    const capped = setup([base(1000)], [], { rule: "telemetry" });
    expect(skillProbability(capped.A.tables, 0, 0, PH_START)).toBe(1000);
  });

  it("the lucky pick is 1000; a disabled skill is 0 before Altair, any bonus and the lucky pick", () => {
    const traits = {
      ...neutralFixtureEntry({ runnerId: "x", laneIndex: 0, style: "dive", stats: S600 }).traits,
      activationBonusPm: { start: 300, middle: 0, final: 0, any: 300 },
    };
    const lucky = setup([base(100, "a"), base(100, "b")], [], { rule: "telemetry", traits });
    lucky.A.tables.luckyIdx[0] = 1;
    expect(skillProbability(lucky.A.tables, 0, 1, PH_START)).toBe(1000);
    expect(skillProbability(lucky.A.tables, 0, 0, PH_START)).toBe(835); // 85 + 300 + 300 + 150
    const off = setup([base(100, "a"), { ...base(100, "b"), disabled: true }], [], {
      rule: "telemetry",
      traits,
    });
    off.A.tables.luckyIdx[0] = 1;
    expect(off.A.tables.pSkill[1]).toBe(0);
    expect(skillProbability(off.A.tables, 0, 1, PH_START)).toBe(0);
  });
});

describe("one evaluation per activation slot (docs/race-engine.md 15.1, 15.3)", () => {
  it("a trigger held 10 000 ticks with u ≥ p never fires; skillMiss is logged once", () => {
    const s = setup([skill("s")], [[851, 0, 0]]);
    for (let t = 0; t < 10_000; t++) tick(s);
    expect(s.calls).toEqual(["miss 0 p850 u851"]);
    expect(s.A.state.acts[0]).toBe(0);
  });

  it("a phase-scoped bonus fires the skill at its first eligible tick of that phase", () => {
    const traits = {
      ...neutralFixtureEntry({ runnerId: "x", laneIndex: 0, style: "dive", stats: S600 }).traits,
      activationBonusPm: { start: 0, middle: 100, final: 0, any: 0 },
    };
    const s = setup([skill("s")], [[900, 0, 0]], { traits });
    for (let t = 0; t < 30; t++) tick(s, PH_START);
    tick(s, PH_MIDDLE);
    expect(s.calls).toEqual(["miss 0 p850 u900", "skill 0 p950 u900 k0"]);
  });

  it("once: false re-arms after a false-trigger tick and the end of its effect, up to 3 activations", () => {
    const s = setup(
      [skill("s", { once: false, energyBelowMilli: 50_000 }, { durationTicks: 5, speedMms: 100 })],
      [[0, 0, 0]],
    );
    const S = s.A.state;
    const run = (energy: number, n: number) => {
      for (let t = 0; t < n; t++) {
        S.energy[0] = energy;
        tick(s);
      }
    };
    run(40_000, 20); // fires once, never re-arms while the trigger holds
    expect(s.calls).toEqual(["skill 0 p850 u0 k0"]);
    run(60_000, 1); // trigger false: re-armed
    run(40_000, 1);
    expect(s.calls).toHaveLength(2);
    run(60_000, 1); // re-armed during the running effect: fires once the effect has ended
    run(40_000, 3);
    expect(s.calls).toHaveLength(2);
    run(40_000, 2);
    expect(s.calls).toEqual(["skill 0 p850 u0 k0", "skill 0 p850 u0 k1", "skill 0 p850 u0 k2"]);
    run(60_000, 1);
    run(40_000, 50); // cap 3
    expect(s.calls).toHaveLength(3);
    expect(S.acts[0]).toBe(3);
  });

  it("activation k uses u[j][k]; a miss on a later activation is still logged only once", () => {
    const s = setup([skill("s", { once: false, energyBelowMilli: 50_000 })], [[0, 900, 0]]);
    const S = s.A.state;
    S.energy[0] = 40_000;
    tick(s);
    S.energy[0] = 60_000;
    tick(s);
    S.energy[0] = 40_000;
    tick(s);
    tick(s);
    expect(s.calls).toEqual(["skill 0 p850 u0 k0", "miss 0 p850 u900"]);
  });

  it("each trigger field: phase, segment, position range (inclusive), heat above, energy below", () => {
    const fires = (
      trigger: Partial<RaceSkillTrigger>,
      prep: (s: Setup) => void,
      ph = PH_START,
      seg = SEG_FLAT,
    ) => {
      const s = setup([skill("s", trigger)]);
      prep(s);
      tick(s, ph, seg);
      return s.calls.length === 1;
    };
    const none = () => {};
    expect(fires({ phase: "final" }, none, PH_FINAL)).toBe(true);
    expect(fires({ phase: "final" }, none, PH_MIDDLE)).toBe(false);
    expect(fires({ segment: "water" }, none, PH_START, SEG_WATER)).toBe(true);
    expect(fires({ segment: "water" }, none, PH_START, SEG_DESCENT)).toBe(false);
    const pos = (pf: number) => (s: Setup) => {
      s.A.state.posFrac[0] = pf;
    };
    expect(fires({ posLoPm: 300, posHiPm: 700 }, pos(300))).toBe(true);
    expect(fires({ posLoPm: 300, posHiPm: 700 }, pos(700))).toBe(true);
    expect(fires({ posLoPm: 300, posHiPm: 700 }, pos(299))).toBe(false);
    expect(fires({ posLoPm: 300, posHiPm: 700 }, pos(701))).toBe(false);
    const heat = (h: number) => (s: Setup) => {
      s.A.state.heat[0] = h;
    };
    expect(fires({ heatAboveMilli: 50_000 }, heat(50_001))).toBe(true);
    expect(fires({ heatAboveMilli: 50_000 }, heat(50_000))).toBe(false);
    const energy = (e: number) => (s: Setup) => {
      s.A.state.energy[0] = e;
    };
    expect(fires({ energyBelowMilli: 20_000 }, energy(19_999))).toBe(true);
    expect(fires({ energyBelowMilli: 20_000 }, energy(20_000))).toBe(false);
  });
});

describe("skill effects (docs/race-engine.md 15.4)", () => {
  it("speed and accel run from the activation tick for durationTicks ticks, then are removed", () => {
    const s = setup([skill("s", {}, { speedMms: 1000, accelMms2: 300, durationTicks: 3 })]);
    const S = s.A.state;
    const seen: number[][] = [];
    for (let t = 0; t < 5; t++) {
      runSkills(R, s.A.tables, S, 0, PH_START, SEG_FLAT, s.sink);
      seen.push([S.skillSpeed[0] ?? 0, S.skillAccel[0] ?? 0, S.activeSkills[0] ?? 0]);
      tickSkillTimers(s.A.tables, S, 0);
    }
    expect(seen).toEqual([
      [15_000, 300, 1],
      [15_000, 300, 1],
      [15_000, 300, 1],
      [0, 0, 0],
      [0, 0, 0],
    ]);
  });

  it("effects of different skills stack additively", () => {
    const s = setup([
      skill("a", {}, { speedMms: 400, durationTicks: 10 }),
      skill("b", {}, { speedMms: -100, durationTicks: 2 }),
    ]);
    runSkills(R, s.A.tables, s.A.state, 0, PH_START, SEG_FLAT, s.sink);
    expect(s.A.state.skillSpeed[0]).toBe(4500);
    tickSkillTimers(s.A.tables, s.A.state, 0);
    tickSkillTimers(s.A.tables, s.A.state, 0);
    expect(s.A.state.skillSpeed[0]).toBe(6000);
  });

  it("refund is capped at Emax (ledger counts what moved); cool floors at 0; guard keeps the max", () => {
    const s = setup([
      skill("a", {}, { energyRefundMilli: 15_000, heatCoolMilli: 20_000 }),
      skill("b", {}, { durabilityGuard: true, durationTicks: 30 }),
    ]);
    const S = s.A.state;
    S.energy[0] = 90_000;
    S.heat[0] = 5000;
    S.guardLeft[0] = 50;
    runSkills(R, s.A.tables, S, 0, PH_START, SEG_FLAT, s.sink);
    expect([S.energy[0], S.energyRefunded[0], S.heat[0], S.guardLeft[0]]).toEqual([
      100_000, 10_000, 0, 50,
    ]);
    const g = setup([skill("b", {}, { durabilityGuard: true, durationTicks: 30 })]);
    runSkills(R, g.A.tables, g.A.state, 0, PH_START, SEG_FLAT, g.sink);
    expect(g.A.state.guardLeft[0]).toBe(30);
  });

  it("durationTicks 0: only the instant parts apply (a guard of 0 ticks guards nothing)", () => {
    const s = setup([
      skill("s", {}, { speedMms: 900, durabilityGuard: true, energyRefundMilli: 5000 }),
    ]);
    const S = s.A.state;
    S.energy[0] = 0;
    runSkills(R, s.A.tables, S, 0, PH_START, SEG_FLAT, s.sink);
    expect([S.skillSpeed[0], S.guardLeft[0], S.activeSkills[0], S.energy[0]]).toEqual([
      0, 0, 0, 5000,
    ]);
  });

  it("an earlier refund changes a later skill's energyBelow check of the same tick (id order)", () => {
    const s = setup([
      skill("a", {}, { energyRefundMilli: 10_000 }),
      skill("b", { energyBelowMilli: 50_000 }),
    ]);
    s.A.state.energy[0] = 45_000;
    tick(s);
    expect(s.calls).toEqual(["skill 0 p850 u0 k0"]);
  });

  it("a refund while the plan is active asks for a replan (cause refund); a pending cause is kept", () => {
    const s = setup([skill("a", {}, { energyRefundMilli: 1000 })]);
    const S = s.A.state;
    S.energy[0] = 0;
    tick(s);
    expect((S.flags[0] ?? 0) & F_REPLAN).toBe(0);
    const p = setup([skill("a", {}, { energyRefundMilli: 1000 })]);
    p.A.state.energy[0] = 0;
    p.A.state.flags[0] = (p.A.state.flags[0] ?? 0) | F_PLAN_ACTIVE;
    tick(p);
    expect((p.A.state.flags[0] ?? 0) & F_REPLAN).toBe(F_REPLAN);
    expect(p.A.state.replanCause[0]).toBe(CAUSE_REFUND);
    const q = setup([]);
    requestReplan(q.A.state, 0, CAUSE_PHASE);
    requestReplan(q.A.state, 0, CAUSE_REFUND);
    expect(q.A.state.replanCause[0]).toBe(CAUSE_PHASE);
  });

  it("a disabled skill is never evaluated: no fire, no miss, no effect", () => {
    const s = setup([{ ...skill("s", {}, { speedMms: 1000, durationTicks: 5 }), disabled: true }]);
    for (let t = 0; t < 100; t++) tick(s);
    expect(s.calls).toEqual([]);
    expect(s.A.state.skillSpeed[0]).toBe(0);
  });
});

describe("skills inside simulateRace (docs/race-engine.md 15, 3.2)", () => {
  const ids = ["clean-start", "corner-carver", "last-gasp"];
  const fixture = (lane: number, extra: Partial<RaceEntry> = {}): RaceEntry => ({
    ...neutralFixtureEntry({
      runnerId: `fx-${lane}`,
      laneIndex: lane,
      style: "hover",
      stats: S600,
      skills: ids.map((id) => freezeSkill(content, id)),
    }),
    ...extra,
  });

  it("logs skill and skillMiss events with p and u, and the ledger lists them", () => {
    const log = simulateRace(RULESET_V1, [fixture(0), fixture(1)], SPRINT, "skills-1");
    const evs = (log.events ?? []).filter((e) => e.kind === "skill" || e.kind === "skillMiss");
    expect(evs.length).toBeGreaterThan(0);
    for (const r of log.results) {
      const d = log.derived[r.lane];
      const mine = evs.filter((e) => e.lane === r.lane);
      expect(r.ledger.skillsActivated).toEqual(
        mine.filter((e) => e.kind === "skill").map((e) => (e.kind === "skill" ? e.skillId : "")),
      );
      expect(r.ledger.skillsMissed).toEqual(
        mine
          .filter((e) => e.kind === "skillMiss")
          .map((e) => (e.kind === "skillMiss" ? e.skillId : "")),
      );
      for (const e of mine) {
        const j = ids.indexOf(e.kind === "skill" || e.kind === "skillMiss" ? e.skillId : "");
        expect(e.kind === "skill" ? e.u < e.p : e.kind === "skillMiss" && e.u >= e.p).toBe(true);
        expect(d?.u[j]?.[0]).toBe(e.u);
      }
    }
    // clean-start (phase start) is checked on tick 0
    const cs = evs.find(
      (e) =>
        e.lane === 0 &&
        (e.kind === "skill" || e.kind === "skillMiss") &&
        e.skillId === "clean-start",
    );
    expect(cs?.tick).toBe(0);
  });

  it("disableSkill: p 0 in derived, no event for it, every draw unchanged (P6b)", () => {
    const on = [fixture(0), fixture(1)];
    const off = on.map((e) => disableSkill(e, "corner-carver"));
    const a = simulateRace(RULESET_V1, on, SPRINT, "abl");
    const b = simulateRace(RULESET_V1, off, SPRINT, "abl");
    for (const lane of [0, 1]) {
      const da = a.derived[lane];
      const db = b.derived[lane];
      expect(db?.pSkill[1]).toBe(0);
      expect([db?.u, db?.pace, db?.planErrPm, db?.luckySkill]).toEqual([
        da?.u,
        da?.pace,
        da?.planErrPm,
        da?.luckySkill,
      ]);
    }
    const cc = (b.events ?? []).filter(
      (e) => (e.kind === "skill" || e.kind === "skillMiss") && e.skillId === "corner-carver",
    );
    expect(cc).toEqual([]);
  });

  it("random-skill-guaranteed: the lucky skill fires whenever its trigger is reached", () => {
    const base = fixture(0, { stats: { ...S600, intelligence: 100 } }); // p = 200 or less
    const lucky: RaceEntry = { ...base, traits: { ...base.traits, randomSkillGuaranteed: true } };
    for (const seed of ["l1", "l2", "l3", "l4", "l5", "l6"]) {
      const log = simulateRace(RULESET_V1, [lucky], SPRINT, seed);
      const id = log.derived[0]?.luckySkill;
      expect(id).not.toBeNull();
      expect(log.results[0]?.ledger.skillsActivated).toContain(id);
    }
  });
});
