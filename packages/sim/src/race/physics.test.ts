import { loadContent } from "@falconess/content";
import { type Course, RaceModifier } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { compileRule } from "../rules/index.js";
import { buildCourseGeometry } from "./geometry.js";
import { compileTraits, defaultTraits } from "./modifiers.js";
import {
  accelVu,
  activationPm,
  agilityCruiseVu,
  approachVu,
  baseSegmentFactor,
  boostThrustVu,
  chainThrustVu,
  coolTick,
  crashDamageMd,
  cruiseVu,
  dashEnds,
  detourDisp,
  drainCoefficients,
  drainMicro,
  exhaustSpeedVu,
  fatiguePm,
  finishMilliOf,
  groundDetourPm,
  heatCapMh,
  heatTolerancePm,
  hpMaxMicro,
  jumpNeedMe,
  landingKeepPm,
  liftFactorPm,
  liftMe,
  marginGapMm,
  overheatDamage,
  paceCentrePm,
  penalisedVu,
  planErrWindowPm,
  powerVariant,
  pulseThrustVu,
  segmentFactors,
  staminaDivisor,
  styleDamagePm,
  variantPower,
  waterHitMd,
  weightedPower,
} from "./physics.js";
import { SPEC_RULESET } from "./testing/spec-ruleset.js";
import { engineUnits, SEG_CANYON, SEG_CURVES, SEG_JUMP } from "./units.js";

const content = loadContent();
const R = SPEC_RULESET.race;
const NONE = compileRule(R, "none");
const stats600 = { agility: 600, stamina: 600, technique: 600, courage: 600, intelligence: 600 };

function course(segments: Course["segments"]): Course {
  return {
    id: "test-course",
    version: 1,
    traits: [],
    entries: 8,
    segments,
    textKey: "course.test",
  };
}

function factors(
  c: Course,
  opts: { agility?: number; modifiers?: unknown[]; rule?: "repairable" } = {},
) {
  const traits = compileTraits((opts.modifiers ?? []).map((m) => RaceModifier.parse(m)));
  const terms = opts.rule ? compileRule(R, opts.rule) : NONE;
  const G = buildCourseGeometry(SPEC_RULESET, c);
  return Array.from(
    segmentFactors(R, G, { stats: { ...stats600, agility: opts.agility ?? 600 }, traits }, terms),
  );
}

describe("segment factor f_seg (docs/race-engine.md 7)", () => {
  it("content values: 963, 1030, 1020, 800, 900; canyon 1000 without wind (ADR-0007)", () => {
    expect(factors(content.getCourse("canyon"))).toEqual([1000, 963, 1000, 1000, 1000, 800, 1000]);
    expect(factors(content.getCourse("ridge"))).toEqual([1000, 1030, 1000, 1000, 1020, 1000, 1000]);
    expect(factors(content.getCourse("sprint"))).toEqual([1000, 900, 1000, 900, 1000]);
  });

  it("curves: 900 at A 600, 950 with the stabilizer, 1000 at A ≥ 1200, 800 at A 0", () => {
    const c = course([{ type: "curves", length: 200, radius: 60 }]);
    expect(factors(c)).toEqual([900]);
    expect(factors(c, { modifiers: [{ kind: "curves-penalty-scale", scale: 0.5 }] })).toEqual([
      950,
    ]);
    expect(factors(c, { agility: 1200 })).toEqual([1000]);
    expect(factors(c, { agility: 2000 })).toEqual([1000]);
    expect(baseSegmentFactor(R, SEG_CURVES, 0, 0, 0, 1000)).toBe(800);
  });

  it("Boneyard curve term (13.1): 850 at A 600, 925 with the stabilizer", () => {
    const c = course([{ type: "curves", length: 200, radius: 60 }]);
    expect(factors(c, { rule: "repairable" })).toEqual([850]);
    expect(
      factors(c, { rule: "repairable", modifiers: [{ kind: "curves-penalty-scale", scale: 0.5 }] }),
    ).toEqual([925]);
  });

  it("modifiers: falke override, thin-air 1011 / 978, mud-runner 1000, max of two overrides", () => {
    const canyon = content.getCourse("canyon");
    const ridge = content.getCourse("ridge");
    expect(factors(canyon, { modifiers: content.getPassive("no-climb-loss").modifiers })[1]).toBe(
      1000,
    );
    const thinAir = content.getQuirk("thin-air").modifiers;
    expect(factors(canyon, { modifiers: thinAir })[1]).toBe(1011);
    expect(factors(ridge, { modifiers: thinAir })[1]).toBe(978);
    expect(factors(canyon, { modifiers: content.getQuirk("mud-runner").modifiers })[5]).toBe(1000);
    const two = [
      { kind: "segment-factor", segment: "water", mode: "override", value: 0.9 },
      { kind: "segment-factor", segment: "water", mode: "override", value: 1.1 },
    ];
    expect(factors(canyon, { modifiers: two })[5]).toBe(1100);
    // override, then multiply
    const both = [
      ...two,
      { kind: "segment-factor", segment: "water", mode: "multiply", value: 0.5 },
    ];
    expect(factors(canyon, { modifiers: both })[5]).toBe(550);
  });

  it("clamps to [500, 1500]", () => {
    const c = course([
      { type: "water", length: 100, drag: 0.5 },
      { type: "descent", length: 100, grade: 1 },
      { type: "canyon", length: 100 },
    ]);
    expect(factors(c)).toEqual([500, 1100, 1000]);
    const low = [{ kind: "segment-factor", segment: "water", mode: "multiply", value: 0.5 }];
    expect(factors(c, { modifiers: low })[0]).toBe(500);
    const high = [{ kind: "segment-factor", segment: "descent", mode: "multiply", value: 1.5 }];
    expect(factors(c, { modifiers: high })[1]).toBe(1500);
  });

  it("jump, flat and canyon are 1000", () => {
    expect(baseSegmentFactor(R, SEG_JUMP, 0, 0, 600, 1000)).toBe(1000);
    expect(baseSegmentFactor(R, SEG_CANYON, 0, 0, 600, 1000)).toBe(1000);
    expect(() => baseSegmentFactor(R, 7, 0, 0, 600, 1000)).toThrow();
  });

  it("is monotone non-decreasing in agility (curves only)", () => {
    const c = course([{ type: "curves", length: 200, radius: 60 }]);
    let prev = 0;
    for (let a = 1; a <= 2000; a += 37) {
      const [f] = factors(c, { agility: a });
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f ?? 0;
    }
  });
});

describe("scalar helpers of table 3.3 with the rule terms of 13.1", () => {
  const T = (rule: "mass-thrust" | "regen" | "pulse" | "telemetry" | "repairable" | "none") =>
    compileRule(R, rule);

  it("acceleration: 400 vu/tick at T 600 (telemetry 340), 300 at T 300, 500 at T 900", () => {
    expect(accelVu(R, 600, 1000, 1000, T("none"))).toBe(400);
    expect(accelVu(R, 600, 1000, 1000, T("telemetry"))).toBe(340);
    expect(accelVu(R, 300, 1000, 1000, T("none"))).toBe(300);
    expect(accelVu(R, 900, 1000, 1000, T("none"))).toBe(500);
    expect(accelVu(R, 600, 750, 1000, T("none"))).toBe(300); // broken PW table
  });

  it("drain: 625 000 / 812 500 µhp at St 600, C 600; telemetry ×0.9; fat floor at C ≥ 1500", () => {
    expect(drainCoefficients(R, 600, 600, T("none"))).toEqual([625_000, 812_500]);
    expect(drainCoefficients(R, 600, 600, T("telemetry"))).toEqual([562_500, 731_250]);
    const [n1500, f1500] = drainCoefficients(R, 600, 1500, T("none"));
    expect(f1500).toBe(n1500);
    const [n2000, f2000] = drainCoefficients(R, 600, 2000, T("none"));
    expect(f2000).toBe(n2000);
  });

  it("cooling: 1000 mh at neutral knobs, Steinhaus 500 on every course (ADR-0007)", () => {
    expect(coolTick(R, 60, T("none"))).toBe(1000);
    expect(coolTick(R, 45, T("mass-thrust"))).toBe(500);
    // the dissipation knob (0 = brief) scales cooling with dissipation / dissRef
    expect(coolTick({ ...R, coolDissWeight: 1000 }, 120, T("none"))).toBe(2000);
    expect(coolTick({ ...R, coolDissWeight: 1000 }, 30, T("none"))).toBe(500);
  });

  it("overheat damage: 1000 md, Steinhaus 2000, ground 500, Steinhaus ground 1000", () => {
    expect(overheatDamage(R, "hover", T("none"))).toBe(1000);
    expect(overheatDamage(R, "glide", T("mass-thrust"))).toBe(2000);
    expect(overheatDamage(R, "ground", T("none"))).toBe(500);
    expect(overheatDamage(R, "ground", T("mass-thrust"))).toBe(1000);
  });

  it("landing: 830 / 860 / 920 at T 300 / 600 / 1200; Lumière 720, Boneyard 930 at T 600", () => {
    expect(landingKeepPm(R, 300, T("none"))).toBe(830);
    expect(landingKeepPm(R, 600, T("none"))).toBe(860);
    expect(landingKeepPm(R, 1200, T("none"))).toBe(920);
    expect(landingKeepPm(R, 2000, T("none"))).toBe(920);
    expect(landingKeepPm(R, 0, T("none"))).toBe(800);
    expect(landingKeepPm(R, 600, T("regen"))).toBe(720);
    expect(landingKeepPm(R, 600, T("repairable"))).toBe(930);
    expect(landingKeepPm(R, 0, T("regen"))).toBe(600);
  });

  it("ground detour: 1100 (Boneyard 1050)", () => {
    expect(groundDetourPm(R, T("none"))).toBe(1100);
    expect(groundDetourPm(R, T("repairable"))).toBe(1050);
  });

  it("defaults trait object is untouched by the helpers", () => {
    const d = defaultTraits();
    factors(content.getCourse("sprint"));
    expect(defaultTraits()).toEqual(d);
  });
});

const VBASE = 300_000;
const KBOOST = 45_000;

describe("PW, cruise, exhaustion and thrust tables (docs/race-engine.md 3.3, 5, 6)", () => {
  it("PW variants: intact and broken ×0.75; weighted PW (1000 = brief)", () => {
    expect([powerVariant(R, 1000, 0), powerVariant(R, 1000, 1)]).toEqual([1000, 750]);
    expect([powerVariant(R, 1400, 1), powerVariant(R, 500, 1), powerVariant(R, 1600, 1)]).toEqual([
      1050, 375, 1200,
    ]);
    expect(weightedPower(1000, 1400)).toBe(1400);
    expect(weightedPower(250, 1400)).toBe(1100);
    expect(weightedPower(1000, 750)).toBe(750);
    expect(weightedPower(500, 750)).toBe(875);
    expect(weightedPower(0, 1600)).toBe(1000);
  });

  it("variant power: the weighted PW, × brokenSpeedPm on the broken variant (8.4, ADR-0003 D56)", () => {
    // spec: brokenSpeedPm 1000 is neutral, broken wings go through PW₁ alone
    expect(R.brokenSpeedPm).toBe(1000);
    expect(variantPower(R, 1000, 1400, 0)).toBe(1400);
    expect(variantPower(R, 1000, 1050, 1)).toBe(1050);
    expect(variantPower(R, 250, 500, 1)).toBe(weightedPower(250, 500));
    // overridden to 750: ×0.75 after the weights, whatever they are
    const R750 = { ...R, brokenSpeedPm: 750 };
    expect(variantPower(R750, 1000, 1400, 0)).toBe(1400); // intact never scales
    expect(variantPower(R750, 1000, 1400, 1)).toBe(1050); // = PW₁ of the spec's PW route
    expect(variantPower(R750, 1000, 1000, 1)).toBe(750);
    expect(variantPower(R750, 5, 1400, 1)).toBe(751); // fl(1002 × 750, 1000)
    expect(variantPower(R750, 250, 1400, 1)).toBe(825); // fl(1100 × 750, 1000)
    expect(variantPower(R750, 250, 700, 1)).toBe(693); // fl(925 × 750, 1000)
    // at full weight the two routes build the same pwc / pwb for every PW the validator allows
    for (let pw = 500; pw <= 1600; pw++)
      expect(variantPower(R750, 1000, pw, 1)).toBe(
        variantPower(R, 1000, powerVariant(R, pw, 1), 1),
      );
  });

  it("vA = 352 500 vu at A 600 (23.5 m/s); 300 087 at A 1; 475 000 at A 2000", () => {
    expect(agilityCruiseVu(R, VBASE, 600)).toBe(352_500);
    expect(agilityCruiseVu(R, VBASE, 1)).toBe(300_087);
    expect(agilityCruiseVu(R, VBASE, 2000)).toBe(475_000);
  });

  it("vC: 352 500 on flat, 317 250 on curves (f 900), pace ±65 ‰ around it", () => {
    expect(cruiseVu(352_500, 1000, 1000, 1000, 0)).toBe(352_500);
    expect(cruiseVu(352_500, 1000, 900, 1000, 0)).toBe(317_250);
    expect(cruiseVu(352_500, 1000, 1000, 1000, 65)).toBe(375_412);
    expect(cruiseVu(352_500, 1000, 1000, 1000, -65)).toBe(329_587);
    expect(cruiseVu(352_500, 750, 1000, 1000, 0)).toBe(264_375); // broken table
    expect(cruiseVu(352_500, 700, 1000, 1000, 0)).toBe(246_750); // PW 0.7 frame
  });

  it("vMin: 255 000 vu (17 m/s) at PW 1.0 on flat, broken 191 250, water 204 000", () => {
    expect(exhaustSpeedVu(R, VBASE, 1000, 1000, 0)).toBe(255_000);
    expect(exhaustSpeedVu(R, VBASE, 750, 1000, 0)).toBe(191_250);
    expect(exhaustSpeedVu(R, VBASE, 1000, 800, 0)).toBe(204_000);
    expect(exhaustSpeedVu(R, VBASE, 1000, 1000, 43)).toBe(265_965);
  });

  it("thrust: B 45 000, Bp 60 750, Bpc 72 900 (third-pulse); PW 1.4: 63 000 / 85 050; PW 1.2 Bp 72 900", () => {
    expect(boostThrustVu(KBOOST, 1000)).toBe(45_000);
    expect(boostThrustVu(KBOOST, 750)).toBe(33_750);
    expect(boostThrustVu(KBOOST, 1400)).toBe(63_000);
    expect(pulseThrustVu(R, KBOOST, 1000)).toBe(60_750);
    expect(pulseThrustVu(R, KBOOST, 1400)).toBe(85_050);
    expect(pulseThrustVu(R, KBOOST, 1200)).toBe(72_900);
    expect(chainThrustVu(60_750, 200)).toBe(72_900);
    expect(chainThrustVu(60_750, 0)).toBe(60_750);
  });

  it("every table is monotone non-decreasing in its inputs (property P3 needs it)", () => {
    let prev = -1;
    for (let a = 1; a <= 2000; a += 13) {
      const v = cruiseVu(agilityCruiseVu(R, VBASE, a), 1000, 1000, 1000, 0);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    prev = -1;
    for (let pw = 500; pw <= 1600; pw += 7) {
      const v = exhaustSpeedVu(R, VBASE, weightedPower(1000, pw), 1000, 0);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe("hp, heat and resource helpers (docs/race-engine.md 4, 6, 8)", () => {
  it("hpMax 915 / 1235 / 1635 hp on the sprint, ridge and canyon", () => {
    expect(hpMaxMicro(R, 1_200_000)).toBe(915_000_000);
    expect(hpMaxMicro(R, 2_000_000)).toBe(1_235_000_000);
    expect(hpMaxMicro(R, 3_000_000)).toBe(1_635_000_000);
  });

  it("stamDiv 1 920 000 at St 600; fatigue 1300 at C 600, floor 1000 from C 1500", () => {
    expect(staminaDivisor(R, 600)).toBe(1_920_000);
    expect(fatiguePm(R, 0)).toBe(1500);
    expect(fatiguePm(R, 600)).toBe(1300);
    expect(fatiguePm(R, 1500)).toBe(1000);
    expect(fatiguePm(R, 2000)).toBe(1000);
  });

  it("drain at cruise: 862 890 µhp (non-final) and 1 121 757 µhp (final) per tick", () => {
    expect(drainMicro(352_500, VBASE, 625_000)).toBe(862_890);
    expect(drainMicro(352_500, VBASE, 812_500)).toBe(1_121_757);
    expect(drainMicro(352_500, VBASE, 612_500)).toBe(845_632); // glide lead ×0.98
    expect(drainMicro(0, VBASE, 625_000)).toBe(0);
    expect(drainMicro(VBASE, VBASE, 625_000)).toBe(625_000);
  });

  it("courage tolerance 1150 ‰ at C 600 → heatCap 69 000 mh at dissipation 60", () => {
    expect(heatTolerancePm(R, 600)).toBe(1150);
    expect(heatTolerancePm(R, 0)).toBe(1000);
    expect(heatCapMh(60, 1150)).toBe(69_000);
    expect(heatCapMh(20, 1000)).toBe(20_000);
  });

  it("heat penalty ×0.92 on the moved speed only", () => {
    expect(penalisedVu(R, 352_500)).toBe(324_300);
    expect(penalisedVu(R, 0)).toBe(0);
  });

  it("style damage: ground ×0.5, every other style ×1", () => {
    expect(styleDamagePm(R, "ground")).toBe(500);
    for (const s of ["dive", "hover", "glide"] as const) expect(styleDamagePm(R, s)).toBe(1000);
  });
});

describe("speed helpers (docs/race-engine.md 5)", () => {
  it("dash ends at 0.85 × min(vBase, target): 255 000 at PW 1.0, 209 737 at PW 0.7", () => {
    expect(dashEnds(R, VBASE, 254_999, 352_500)).toBe(false);
    expect(dashEnds(R, VBASE, 255_000, 352_500)).toBe(true);
    expect(dashEnds(R, VBASE, 209_736, 246_750)).toBe(false);
    expect(dashEnds(R, VBASE, 209_737, 246_750)).toBe(true);
  });

  it("approach: up by `up`, down by kDecel, never past the target, never a negative step", () => {
    expect(approachVu(45_000, 352_500, 24_400, 3000)).toBe(69_400);
    expect(approachVu(352_300, 352_500, 400, 3000)).toBe(352_500);
    expect(approachVu(352_500, 317_250, 400, 3000)).toBe(349_500);
    expect(approachVu(318_000, 317_250, 400, 3000)).toBe(317_250);
    expect(approachVu(352_500, 352_500, 400, 3000)).toBe(352_500);
    expect(approachVu(100, 200, -50, 3000)).toBe(100);
  });
});

describe("jump, water and detour helpers (docs/race-engine.md 14)", () => {
  it("liftF 1000 ‰ at T 600 (500 at T 0, 1500 at T 1200, glider-tape 1100)", () => {
    expect(liftFactorPm(600, 0)).toBe(1000);
    expect(liftFactorPm(0, 0)).toBe(500);
    expect(liftFactorPm(1200, 0)).toBe(1500);
    expect(liftFactorPm(600, 100)).toBe(1100);
    expect(liftMe(100_000, 1000)).toBe(100_000);
    expect(liftMe(20_000, 1500)).toBe(30_000);
  });

  it("jump need: 20 000 / 15 000 me at T 600 (ridge), 26 667 at T 300, 18 182 with glider-tape", () => {
    expect(jumpNeedMe(20, 1000)).toBe(20_000);
    expect(jumpNeedMe(15, 1000)).toBe(15_000);
    expect(jumpNeedMe(20, 750)).toBe(26_667);
    expect(jumpNeedMe(20, 1100)).toBe(18_182);
  });

  it("crash 25 000 md (ground 12 500); water hit 10 000 md at drag 0.2 (ground 5000)", () => {
    expect(crashDamageMd(R, 1000)).toBe(25_000);
    expect(crashDamageMd(R, 500)).toBe(12_500);
    expect(waterHitMd(R, 200, 1000)).toBe(10_000);
    expect(waterHitMd(R, 200, 500)).toBe(5000);
  });

  it("ground detour progress: fl(vOut × 1000, detour)", () => {
    expect(detourDisp(352_500, 1100)).toBe(320_454);
    expect(detourDisp(352_500, 1050)).toBe(335_714);
    expect(detourDisp(352_500, 1000)).toBe(352_500);
  });
});

describe("Intelligence and skill helpers (docs/race-engine.md 10, 15.2)", () => {
  it("pace centre −21 / −11 / −3 / 0 / +1 / +14 / +22 at I 0 / 300 / 510 / 600 / 630 / 1000 / 1200", () => {
    const at = (i: number) => paceCentrePm(R, i);
    expect([0, 300, 510, 600, 630, 1000, 1200, 2000].map(at)).toEqual([
      -21, -11, -3, 0, 1, 14, 22, 22,
    ]);
    expect(paceCentrePm({ ...R, paceCentreSpan: 0 }, 1000)).toBe(0);
  });

  it("plan perception half-width 150 → 0 (I 600: 75)", () => {
    expect([0, 600, 1200, 2000].map((i) => planErrWindowPm(R, i))).toEqual([150, 75, 0, 0]);
  });

  it("activation 850 at I 600, 700 at I 300, 900 at I 900, floor 200 at I ≤ 112", () => {
    expect([600, 300, 900, 112, 100, 1].map((i) => activationPm(R, i))).toEqual([
      850, 700, 900, 200, 200, 200,
    ]);
    expect(activationPm(R, 113)).toBe(203);
  });
});

describe("finish helpers (docs/race-engine.md 19)", () => {
  it("finishMilli lies in [1000 t, 1000 t + 1000] (both interval ends)", () => {
    expect(finishMilliOf(10, 1000, 500, 1000)).toBe(10_500);
    expect(finishMilliOf(10, 1000, 0, 1000)).toBe(11_000); // pos lands exactly on L
    expect(finishMilliOf(10, 1000, 999, 5000)).toBe(10_000); // crossed at the start of the tick
  });

  it("margin gap: B's position at A's crossing instant, in mm, never negative", () => {
    const L = 225_000 * 100;
    expect(marginGapMm(L, L - 225_000, 0, 500, 225)).toBe(1000); // stalled 1 m behind
    expect(marginGapMm(L, L - 450_000, 450_000, 500, 225)).toBe(1000); // half its move done
    expect(marginGapMm(L, L - 10, 450_000, 1000, 225)).toBe(0);
  });
});

describe("2^53 bounds of docs/race-engine.md 1.5: the helpers at the maxima", () => {
  // Each helper runs at the validator's maxima (1.4) and the spec constants, and must return the
  // exact floor computed with BigInt, every intermediate product of its formula at most 2^53 − 1.
  // A helper whose product order pushed an intermediate past 2^53 would round and miss the floor.
  const SAFE = BigInt(Number.MAX_SAFE_INTEGER);
  const n = (x: number) => BigInt(x);
  /** floor(a / b) of non-negative BigInts, with the 2^53 check on the dividend. */
  function fl(a: bigint, b: bigint): bigint {
    expect(a <= SAFE, `${a} exceeds 2^53 − 1`).toBe(true);
    return a / b;
  }
  const VBASE = engineUnits(R).vBase; // 300 000 vu
  const KBOOST = engineUnits(R).kBoost; // 45 000 vu
  const PW = 1600;
  const F = R.segFactorMax; // 1500
  const PACE = 65; // paceHalfWidth + paceCentreSpan / 2, rounded up (1.5)
  const STYLE_PACE = 1200; // the 1.5 bound of stylePace (v1: 1000)
  const L = R.maxCourseMeters * 1000 * 225; // 2.25e9 pu
  const T_MAX = R.dnfTicksPerMeter * R.maxCourseMeters + R.dnfTicksBase; // 82 400 ticks

  // the fastest moved speed under v1: dive cruise at A, PW and f maxima + the chained pulse burst
  // on a desert descent with the stoop + eight +3 m/s skills (1 949 680 vu ≈ 130 m/s; 1.5: < 2e6)
  const vA = agilityCruiseVu(R, VBASE, R.maxEffectiveStat);
  const vC = cruiseVu(vA, weightedPower(R.pwCruiseWeight, PW), F, 1000, PACE);
  const Bpc = chainThrustVu(pulseThrustVu(R, KBOOST, weightedPower(R.pwBoostWeight, PW)), 1000);
  const air = Math.max(...compileRule(R, "pulse").pulseAirPm);
  const burst = Math.floor((Math.floor((Bpc * air) / 1000) * R.style.diveStoopPm) / 1000);
  const V_MAX = vC + burst + R.maxSkills * 3000 * engineUnits(R).velPerMms;
  const [, DK_MAX] = drainCoefficients(R, 1, 0, { drainPm: 1000 });

  it("the speed and drain maxima the products below use", () => {
    expect([vA, vC, Bpc, air, burst, V_MAX, DK_MAX]).toEqual([
      475_000, 1_214_100, 194_400, 1380, 375_580, 1_949_680, 1_498_501,
    ]);
    expect(V_MAX).toBeLessThan(2_000_000);
  });

  it("cruise, exhaustion, acceleration and thrust tables at PW 1600, f 1500, stats 2000", () => {
    expect(cruiseVu(vA, PW, F, STYLE_PACE, PACE)).toBe(
      Number(fl(fl(n(vA) * n(PW) * n(F) * n(STYLE_PACE), n(1e9)) * n(1000 + PACE), n(1000))),
    );
    expect(exhaustSpeedVu(R, VBASE, PW, F, PACE)).toBe(
      Number(
        fl(fl(n(VBASE) * n(R.exhaustSpeedPm) * n(PW) * n(F), n(1e9)) * n(1000 + PACE), n(1000)),
      ),
    );
    const acc = fl(n(R.kAcc) * n(600 + R.maxEffectiveStat) * n(PW) * n(F), n(1_200_000_000));
    expect(accelVu(R, R.maxEffectiveStat, PW, F, { accelPm: 2000 })).toBe(
      Number(fl(acc * n(2000), n(1000))),
    );
    expect(pulseThrustVu(R, KBOOST, PW)).toBe(
      Number(fl(n(KBOOST) * n(PW) * n(R.pulseBoostMult), n(1_000_000))),
    );
    expect(boostThrustVu(KBOOST, PW)).toBe(Number(fl(n(KBOOST) * n(PW), n(1000))));
  });

  it("hp: drain coefficients at stamina 1 and courage 0, drain at the fastest speed", () => {
    const stamDiv = n(staminaDivisor(R, 1));
    const coef = n(R.kHp) * n(1000) * n(1_200_000);
    expect(drainCoefficients(R, 1, 0, { drainPm: 1000 })).toEqual([
      Number(fl(fl(coef, stamDiv) * n(1000), n(1000))),
      Number(fl(fl(coef * n(fatiguePm(R, 0)), stamDiv * n(1000)) * n(1000), n(1000))),
    ]);
    for (const v of [V_MAX, V_MAX - 1, 1_949_999]) {
      const rPm = fl(n(v) * n(1000), n(VBASE));
      for (const dK of [DK_MAX, DK_MAX - 2])
        expect(drainMicro(v, VBASE, dK)).toBe(Number(fl(rPm * rPm * n(dK), n(1_000_000))));
    }
  });

  it("finish and margins of a 10 km course at the fastest move", () => {
    for (const disp of [V_MAX, 2_000_000]) {
      // crossed at the very start of the last tick: (L − prevPos) × 1000 at its largest
      expect(finishMilliOf(T_MAX - 1, L, L - disp, disp)).toBe(
        Number(n(T_MAX - 1) * n(1000) + fl(n(disp) * n(1000), n(disp))),
      );
      expect(finishMilliOf(T_MAX - 1, L, L - disp + 1, disp)).toBe(
        Number(n(T_MAX - 1) * n(1000) + fl(n(disp - 1) * n(1000), n(disp))),
      );
      const prev = L - 2 * disp - 7;
      for (const fA of [1000, 999])
        expect(marginGapMm(L, prev, disp, fA, 225)).toBe(
          Number(fl(n(L) - (n(prev) + fl(n(disp) * n(fA), n(1000))), n(225))),
        );
    }
  });

  it("per-mille terms at the fastest speed, lift and jump need at the maxima", () => {
    expect(penalisedVu(R, V_MAX)).toBe(Number(fl(n(V_MAX) * n(R.heatPenaltyMult), n(1000))));
    expect(detourDisp(V_MAX, 1000)).toBe(V_MAX);
    expect(detourDisp(V_MAX, 1050)).toBe(Number(fl(n(V_MAX) * n(1000), n(1050))));
    const liftF = liftFactorPm(R.maxEffectiveStat, 1000); // 4333
    expect(liftMe(200_000, liftF)).toBe(Number(fl(n(200_000) * n(liftF), n(1000))));
    expect(jumpNeedMe(60, 1)).toBe(60_000_000);
  });
});
