import { floorDiv } from "@falconess/rng";
import { BOOST_MODES, RACE_RULES, SEGMENT_TYPES, STYLES } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { RULESET_V1 } from "../rulesets/index.js";
import {
  addCap,
  engineUnits,
  MODE_DIVE_DESCENT,
  MODE_GROUND_CONSTANT,
  MODE_KICK,
  MODE_OFF,
  MODE_REGEN,
  modeCode,
  modeName,
  PH_FINAL,
  PH_MIDDLE,
  PH_START,
  PHASE_NAMES,
  POS_PER_MM,
  RULE_MASS_THRUST,
  RULE_NONE,
  RULE_PULSE,
  RULE_REPAIRABLE,
  RULE_TELEMETRY,
  ruleCode,
  SEG_CANYON,
  SEG_CLIMB,
  SEG_CURVES,
  SEG_DESCENT,
  SEG_FLAT,
  SEG_JUMP,
  SEG_WATER,
  SEGMENT_TYPE_COUNT,
  STYLE_DIVE,
  STYLE_GLIDE,
  STYLE_GROUND,
  STYLE_HOVER,
  segmentTypeCode,
  styleCode,
  sub0,
  VEL_PER_MMS,
} from "./units.js";

const R = RULESET_V1.race;

describe("engine units (docs/race-engine.md 1.1)", () => {
  it("derives pu and vu from the tick rate", () => {
    expect(VEL_PER_MMS).toBe(15);
    expect(POS_PER_MM).toBe(225);
    const u = engineUnits(R);
    expect(u).toEqual({
      tps: 15,
      velPerMms: 15,
      posPerMm: 225,
      vBase: 300_000,
      kBoost: 45_000,
      vStart: 45_000,
    });
    // a test ruleset with another tick rate moves every scale with it
    const u20 = engineUnits({ ...R, ticksPerSecond: 20 });
    expect([u20.velPerMms, u20.posPerMm, u20.vBase]).toEqual([20, 400, 400_000]);
  });

  it("one tick at v vu moves exactly v pu: 1 m/s = 15 000 vu, 1 m = 225 000 pu", () => {
    const vMs = 23_500 * VEL_PER_MMS; // 23.5 m/s in vu
    expect(vMs).toBe(352_500);
    // 15 ticks at 23.5 m/s move 23.5 m
    expect(15 * vMs).toBe(23_500 * POS_PER_MM);
  });

  it("sub0 and addCap clamp at 0 and at the cap", () => {
    expect(sub0(5, 3)).toBe(2);
    expect(sub0(3, 5)).toBe(0);
    expect(addCap(5, 3, 10)).toBe(8);
    expect(addCap(9, 3, 10)).toBe(10);
  });
});

describe("small-integer codes follow the schema orders (0.1, 3.4, 9.4)", () => {
  it("phases", () => {
    expect([PH_START, PH_MIDDLE, PH_FINAL]).toEqual([0, 1, 2]);
    expect(PHASE_NAMES).toEqual(["start", "middle", "final"]);
  });

  it("segment types", () => {
    const codes = [SEG_FLAT, SEG_CLIMB, SEG_DESCENT, SEG_JUMP, SEG_WATER, SEG_CANYON, SEG_CURVES];
    expect(codes.map((c) => SEGMENT_TYPES[c])).toEqual([...SEGMENT_TYPES]);
    expect(SEGMENT_TYPE_COUNT).toBe(SEGMENT_TYPES.length);
    for (const t of SEGMENT_TYPES) expect(SEGMENT_TYPES[segmentTypeCode(t)]).toBe(t);
  });

  it("styles", () => {
    expect([STYLE_DIVE, STYLE_HOVER, STYLE_GLIDE, STYLE_GROUND].map((c) => STYLES[c])).toEqual([
      ...STYLES,
    ]);
    for (const s of STYLES) expect(STYLES[styleCode(s)]).toBe(s);
  });

  it("rules: RULE_NONE = 5", () => {
    expect(RULE_NONE).toBe(5);
    expect(RACE_RULES[RULE_MASS_THRUST]).toBe("mass-thrust");
    expect(RACE_RULES[RULE_PULSE]).toBe("pulse");
    expect(RACE_RULES[RULE_TELEMETRY]).toBe("telemetry");
    expect(RACE_RULES[RULE_REPAIRABLE]).toBe("repairable");
    for (const r of RACE_RULES) expect(RACE_RULES[ruleCode(r)]).toBe(r);
  });

  it("controller modes", () => {
    expect(modeName(MODE_OFF)).toBe("off");
    expect(modeName(MODE_KICK)).toBe("kick");
    expect(modeName(MODE_REGEN)).toBe("regen-overflow");
    expect(modeName(MODE_DIVE_DESCENT)).toBe("dive-descent");
    expect(modeName(MODE_GROUND_CONSTANT)).toBe("ground-constant");
    for (const m of BOOST_MODES) expect(modeName(modeCode(m))).toBe(m);
    expect(() => modeName(11)).toThrow();
  });
});

describe("overflow table (1.5): every product stays a safe integer at the validator maxima", () => {
  const { vBase: VBASE, kBoost: KBOOST } = engineUnits(R);
  const STAT = R.maxEffectiveStat; // 2000
  const PW = 1600;
  const F = R.segFactorMax; // 1500
  const STYLE_PACE = 1200;
  const MULT = 2000; // style and rule multipliers, one floor at a time
  const E = 200_000; // me
  const V = 1_500_000; // vu, 100 m/s
  const L = R.maxCourseMeters * 1000 * POS_PER_MM; // pu
  const pwc = 1000 + floorDiv(R.pwCruiseWeight * (PW - 1000), 1000);
  const pwb = 1000 + floorDiv(R.pwBoostWeight * (PW - 1000), 1000);
  const vA = floorDiv(VBASE * (1_200_000 + R.kA * STAT), 1_200_000);
  const fat = R.fatigueBase; // courage 0
  const rPm = floorDiv(V * 1000, VBASE);
  const dKFinal = floorDiv(R.kHp * 1000 * 1_200_000 * fat, (1_200_000 + R.kS * 1) * 1000);
  const B = floorDiv(KBOOST * pwb, 1000);
  const Bp = floorDiv(KBOOST * pwb * R.pulseBoostMult, 1_000_000);
  const bonPulse = floorDiv(floorDiv(Bp * MULT, 1000) * MULT, 1000);
  const sPulse = floorDiv(bonPulse * R.pulseTicks, R.pulseTicks + R.pulseCooldownTicks);
  const bonCont = floorDiv(B * MULT, 1000);

  const products: ReadonlyArray<[string, number]> = [
    ["vA × pwc × f × stylePace (cruise)", vA * pwc * F * STYLE_PACE],
    ["cruise × (1000 + pace)", floorDiv(vA * pwc * F * STYLE_PACE, 1e9) * (1000 + 65)],
    ["kAcc × (600 + T) × pwc × f", R.kAcc * (600 + STAT) * pwc * F],
    ["kAcc raised to 4000", 4000 * (600 + STAT) * pwc * F],
    ["kHp × 1000 × 1.2e6 × fat", R.kHp * 1000 * 1_200_000 * fat],
    ["rPm × rPm × dK (drain)", rPm * rPm * dKFinal],
    ["s × Ep × Bon (plan gain, pulse)", sPulse * E * bonPulse],
    ["s × Ep × Bon (plan gain, continuous)", bonCont * E * bonCont],
    ["Ep × Bon (plan ticks)", E * bonPulse],
    ["(L − prevPos) × 1000 (finish)", V * 1000],
    ["disp × fA (margins)", V * 1000],
    ["u32 × 1000", (4_294_967_296 - 1) * 1000],
    ["u32 × (2W + 1)", (4_294_967_296 - 1) * (2 * 65 + 1)],
    ["energy × liftF (lift)", E * floorDiv((600 + STAT) * (1000 + 500), 1200)],
    ["thrust × multiplier", bonPulse * MULT],
    ["vCore × landPm, tgt × hoverDraftPm, acc × glideStartAccelPm", V * MULT],
    ["B × Emax × share (ground level)", bonCont * E * 1000],
    ["ticks × v in an exhaustion walk", 3000 * 1000 * POS_PER_MM],
    ["L", L],
    ["hpMax in µhp", (R.hpBase + floorDiv(R.hpPerKm * R.maxCourseMeters * 1000, 1_000_000)) * 1e6],
  ];

  for (const [name, value] of products)
    it(name, () => {
      expect(Number.isSafeInteger(value)).toBe(true);
    });

  it("spec bounds: cruise 1.37e15, plan gain below 9e15", () => {
    expect(vA).toBe(475_000);
    expect(vA * pwc * F * STYLE_PACE).toBe(1_368_000_000_000_000);
    expect(sPulse * E * bonPulse).toBeLessThan(9_007_199_254_740_991);
  });
});
