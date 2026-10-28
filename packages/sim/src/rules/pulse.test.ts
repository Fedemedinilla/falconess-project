import { RaceModifier } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { compileTraits } from "../race/modifiers.js";
import { SEG_DESCENT, SEG_FLAT, SEG_WATER } from "../race/units.js";
import { RULESET_V1 } from "../rulesets/index.js";
import {
  createPulseOutput,
  createPulseState,
  endBurst,
  initPulseLane,
  type PulseInput,
  type PulseState,
  pulseStep,
} from "./pulse.js";

const R = RULESET_V1.race;
const BP = 60_750;
const BPC = 72_900;
const UNIT = BP * 12;

function setup(raw: unknown[] = []): PulseState {
  const st = createPulseState(8);
  initPulseLane(R, st, 3, compileTraits(raw.map((m) => RaceModifier.parse(m))));
  return st;
}

function input(t: number, over: Partial<PulseInput> = {}): PulseInput {
  return {
    t,
    want: true,
    gatesOk: true,
    canThrust: true,
    levelMode: false,
    segType: SEG_FLAT,
    bp: BP,
    bpc: BPC,
    unit: UNIT,
    ...over,
  };
}

type Tick = {
  t: number;
  boost: boolean;
  thrust: number;
  free: boolean;
  fired: boolean;
  chain: number;
};

/** Run lane 3 for `n` ticks with a per-tick input override; returns one row per tick. */
function run(
  st: PulseState,
  n: number,
  over: (t: number) => Partial<PulseInput> = () => ({}),
): Tick[] {
  const out = createPulseOutput();
  const rows: Tick[] = [];
  for (let t = 0; t < n; t++) {
    pulseStep(R, st, 3, input(t, over(t)), out);
    rows.push({
      t,
      boost: out.boostOn,
      thrust: out.thrust,
      free: out.freeTick,
      fired: out.fired,
      chain: st.chain[3] ?? 0,
    });
  }
  return rows;
}

const fires = (rows: Tick[]) => rows.filter((r) => r.fired).map((r) => r.t);

describe("Koryu pulse state machine (docs/race-engine.md 12)", () => {
  it("12/30 cadence: one pulse every 42 ticks at max cadence, 12 burst ticks each", () => {
    const rows = run(setup(), 200);
    expect(fires(rows)).toEqual([0, 42, 84, 126, 168]);
    expect(rows.slice(0, 42).filter((r) => r.boost)).toHaveLength(12);
    expect(rows.slice(0, 12).every((r) => r.boost && r.thrust === BP)).toBe(true);
    expect(rows.slice(12, 42).some((r) => r.boost)).toBe(false);
  });

  it("readyAt chain counting: fired at readyAt → chain + 1; one idle tick → chain = 1", () => {
    const st = setup();
    const rows = run(st, 130, (t) => ({ want: t !== 84 }));
    // chain 1 at 0, 2 at 42, then the idle readyAt (84) breaks it: fire at 85 with chain 1
    expect(fires(rows)).toEqual([0, 42, 85, 127]);
    expect(rows[0]?.chain).toBe(1);
    expect(rows[42]?.chain).toBe(2);
    expect(rows[85]?.chain).toBe(1);
    expect(rows[127]?.chain).toBe(2);
  });

  it("third-pulse: every 3rd consecutive pulse uses Bpc for its whole burst", () => {
    const st = setup([{ kind: "pulse-chain-accel", chainIndex: 3, accelBonus: 0.2 }]);
    const rows = run(st, 42 * 6);
    expect(fires(rows)).toEqual([0, 42, 84, 126, 168, 210]);
    const burstThrust = (t0: number) => rows.slice(t0, t0 + 12).map((r) => r.thrust);
    expect(burstThrust(0).every((x) => x === BP)).toBe(true);
    expect(burstThrust(42).every((x) => x === BP)).toBe(true);
    expect(burstThrust(84).every((x) => x === BPC)).toBe(true);
    expect(burstThrust(126).every((x) => x === BP)).toBe(true);
    expect(burstThrust(210).every((x) => x === BPC)).toBe(true);
  });

  it("no chain trait: never Bpc", () => {
    const rows = run(setup(), 42 * 4);
    expect(rows.every((r) => r.thrust === 0 || r.thrust === BP)).toBe(true);
  });

  it("cooldown by the segment type of the fire tick (flat-cooldown: flat 20)", () => {
    const flat = run(setup([{ kind: "pulse-cooldown", segment: "flat", cooldownTicks: 20 }]), 100);
    expect(fires(flat)).toEqual([0, 32, 64, 96]);
    // fired on descent (no trait there): 30 ticks, even if the burst then moves onto flat
    const st = setup([{ kind: "pulse-cooldown", segment: "flat", cooldownTicks: 20 }]);
    const mixed = run(st, 80, (t) => ({ segType: t === 0 ? SEG_DESCENT : SEG_FLAT }));
    expect(fires(mixed)).toEqual([0, 42, 74]);
    // a trait longer than the rule's cooldown is capped at 30
    const long = run(setup([{ kind: "pulse-cooldown", segment: "flat", cooldownTicks: 60 }]), 50);
    expect(fires(long)).toEqual([0, 42]);
  });

  it("a burst runs all 12 ticks even when want turns false; aborts when canThrust turns false", () => {
    const st = setup();
    const kept = run(st, 12, (t) => ({ want: t === 0 }));
    expect(kept.filter((r) => r.boost)).toHaveLength(12);

    const st2 = setup();
    const out = createPulseOutput();
    for (let t = 0; t < 5; t++) pulseStep(R, st2, 3, input(t), out);
    pulseStep(R, st2, 3, input(5, { canThrust: false }), out);
    expect(out.aborted).toBe(true);
    expect(out.boostOn).toBe(false);
    expect(st2.pulseLeft[3]).toBe(0);
    expect(st2.pulseCd[3]).toBe(30);
    // the cooldown then runs 30 ticks (6..35) and the next pulse may fire at 36
    const later: number[] = [];
    for (let t = 6; t < 40; t++) {
      pulseStep(R, st2, 3, input(t), out);
      if (out.fired) later.push(t);
    }
    expect(later).toEqual([36]);
  });

  it("endBurst (takeoff, crash) ends a running burst and starts the cooldown", () => {
    const st = setup();
    const out = createPulseOutput();
    expect(endBurst(st, 3)).toBe(false);
    pulseStep(R, st, 3, input(0), out);
    expect(endBurst(st, 3)).toBe(true);
    expect([st.pulseLeft[3], st.pulseCd[3]]).toEqual([0, 30]);
  });

  it("free-first-boost: the first pulse fired on the masked type is free for its 12 ticks", () => {
    const st = setup([{ kind: "free-first-boost", segment: "descent" }]);
    const rows = run(st, 60, () => ({ segType: SEG_DESCENT }));
    expect(rows.slice(0, 12).every((r) => r.free && r.boost)).toBe(true);
    expect(st.freeMask[3]).toBe(0);
    expect(rows.slice(42, 54).every((r) => !r.free && r.boost)).toBe(true);
    // on another segment type the bit stays
    const st2 = setup([{ kind: "free-first-boost", segment: "descent" }]);
    const water = run(st2, 12, () => ({ segType: SEG_WATER }));
    expect(water.some((r) => r.free)).toBe(false);
    expect(st2.freeMask[3]).toBe(4);
  });

  it("level modes spend one accumulator unit per fire, not per burst tick", () => {
    const st = setup();
    st.acc[3] = UNIT + 1000;
    run(st, 12, () => ({ levelMode: true }));
    expect(st.acc[3]).toBe(1000);
  });

  it("no fire without want or gates; the cooldown counts down regardless", () => {
    expect(fires(run(setup(), 50, () => ({ want: false })))).toEqual([]);
    expect(fires(run(setup(), 50, () => ({ gatesOk: false })))).toEqual([]);
    const st = setup();
    run(st, 12);
    run(st, 30, () => ({ want: false }));
    expect(st.pulseCd[3]).toBe(0);
  });

  it("initPulseLane: per-type cooldowns min(30, trait), chain index, free mask, timers 0", () => {
    const st = setup([
      { kind: "pulse-cooldown", segment: "flat", cooldownTicks: 20 },
      { kind: "pulse-cooldown", segment: "descent", cooldownTicks: 45 },
      { kind: "pulse-chain-accel", chainIndex: 3, accelBonus: 0.2 },
      { kind: "free-first-boost", segment: "descent" },
    ]);
    expect(Array.from(st.cdBySeg.slice(21, 28))).toEqual([20, 30, 30, 30, 30, 30, 30]);
    expect(st.chainIndex[3]).toBe(3);
    expect(st.freeMask[3]).toBe(4);
    expect([st.pulseLeft[3], st.pulseCd[3], st.readyAt[3], st.chain[3], st.acc[3]]).toEqual([
      0, 0, 0, 0, 0,
    ]);
    // other lanes untouched
    expect(st.chainIndex[2]).toBe(0);
  });
});
