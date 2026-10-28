import { floorDiv } from "@falconess/rng";
import { BIOMES, RACE_RULES } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { raceProperties } from "../../tests/support/race-properties.js";
import { compileRule } from "../rules/index.js";
import { RULESET_V1 } from "../rulesets/index.js";
import {
  accelVu,
  agilityCruiseVu,
  boostThrustVu,
  chainThrustVu,
  cruiseVu,
  drainCoefficients,
  drainMicro,
  finishMilliOf,
  hpMaxMicro,
  liftFactorPm,
  pulseThrustVu,
  weightedPower,
} from "./physics.js";
import { engineUnits, POS_PER_MM } from "./units.js";

/**
 * The live ruleset under the engine's invariants (ADR-0005, verifier note m2). The physics tests
 * pin numbers to SPEC_RULESET, so a balance pass that broke an invariant of the engine on
 * RULESET_V1 would pass them all. This file runs the number-free properties of
 * docs/race-engine.md 24.2 (P1-P7, P9 and the controller coverage check; the suite is
 * packages/sim/tests/support/race-properties.ts) on RULESET_V1, and evaluates the overflow table
 * of 1.5 with the live constants. Nothing here pins a measured value: a balance change fails only
 * if it breaks an invariant or pushes a product past 2^53.
 */

describe("RULESET_V1 (live)", () => raceProperties(RULESET_V1));

describe("2^53 bounds of docs/race-engine.md 1.5 on the live constants", () => {
  const R = RULESET_V1.race;
  const SAFE = BigInt(Number.MAX_SAFE_INTEGER);
  const n = (x: number) => BigInt(x);
  const { vBase: VBASE, kBoost: KBOOST, velPerMms: VEL } = engineUnits(R);

  // the validator's maxima (1.4, 1.5), as in units.test.ts and physics.test.ts
  const STAT = R.maxEffectiveStat;
  const PW = 1600;
  const F = R.segFactorMax;
  const E = 200_000; // me
  const L = R.maxCourseMeters * 1000 * POS_PER_MM; // pu
  const PACE = R.paceHalfWidth + Math.ceil(R.paceCentreSpan / 2);
  const CHAIN = 1000; // pulse-chain-accel accelBonus ≤ 1 (schema)
  const SKILL_SPEED = 3000; // mm/s per active skill (schema: speed ≤ 3 m/s)

  // the live per-mille multipliers: the style terms and every rule's terms on every biome
  const terms = RACE_RULES.flatMap((rule) => BIOMES.map((biome) => compileRule(R, rule, biome)));
  const STYLE_PACE = Math.max(...Object.values(R.stylePace).flat());
  const AIR = Math.max(...terms.flatMap((t) => t.pulseAirPm));
  const BIOME_PULSE = Math.max(...terms.map((t) => t.pulseBiomePm));
  const MULT = Math.max(
    R.style.diveStoopPm,
    R.style.hoverDraftPm,
    R.style.glideStartAccelPm,
    ...terms.flatMap((t) => [t.accelPm, t.drainPm, t.landLossPm, t.coolPm, t.curvesPm]),
  );

  // the fastest moved speed under the live constants: cruise at every maximum + the chained pulse
  // burst with the largest air term and the stoop + eight skills at +3 m/s (1.5)
  const pwc = weightedPower(R.pwCruiseWeight, PW);
  const pwb = weightedPower(R.pwBoostWeight, PW);
  const vA = agilityCruiseVu(R, VBASE, STAT);
  const vC = cruiseVu(vA, pwc, F, STYLE_PACE, PACE);
  const Bpc = chainThrustVu(pulseThrustVu(R, KBOOST, pwb), CHAIN);
  const burst = floorDiv(floorDiv(Bpc * AIR, 1000) * R.style.diveStoopPm, 1000);
  const V_MAX = vC + burst + R.maxSkills * SKILL_SPEED * VEL;
  const V = Math.max(V_MAX, 2_000_000); // the speed rows of 1.5 are evaluated at 2e6 vu
  const DRAIN_PM = Math.max(1000, ...terms.map((t) => t.drainPm));
  const [, DK_MAX] = drainCoefficients(R, 1, 0, { drainPm: DRAIN_PM });
  const rPm = floorDiv(V * 1000, VBASE);
  // the plan's thrust per boosted tick as the tables build it (3.3 `Bon`): a pulse frame takes
  // the unchained burst × the biome term × the stoop, a continuous frame the boost × the stoop
  const Bp = pulseThrustVu(R, KBOOST, pwb);
  const bonPulse = floorDiv(floorDiv(Bp * BIOME_PULSE, 1000) * R.style.diveStoopPm, 1000);
  const sPulse = floorDiv(bonPulse * R.pulseTicks, R.pulseTicks + R.pulseCooldownTicks);
  const bonCont = floorDiv(boostThrustVu(KBOOST, pwb) * R.style.diveStoopPm, 1000);
  const accMax = accelVu(R, STAT, pwc, F, { accelPm: MULT });

  it("the fastest live moved speed stays under the 2e6 vu that 1.5 evaluates its speed rows at", () => {
    expect(V_MAX).toBeLessThan(2_000_000);
  });

  const products: ReadonlyArray<[string, number]> = [
    ["vA × pwc × f × stylePace (cruise)", vA * pwc * F * STYLE_PACE],
    ["cruise × (1000 + pace)", floorDiv(vA * pwc * F * STYLE_PACE, 1e9) * (1000 + PACE)],
    ["kAcc × (600 + T) × pwc × f", R.kAcc * (600 + STAT) * pwc * F],
    ["acc × accelPm", accMax * MULT],
    ["weighted PW × brokenSpeedPm (broken variant)", Math.max(pwc, pwb) * R.brokenSpeedPm],
    ["kHp × 1000 × 1.2e6 × fat", R.kHp * 1000 * 1_200_000 * R.fatigueBase],
    ["rPm × rPm × dK (drain)", rPm * rPm * DK_MAX],
    ["Bpc × airPm (pulse burst)", Bpc * AIR],
    ["burst × diveStoopPm", floorDiv(Bpc * AIR, 1000) * R.style.diveStoopPm],
    ["s × Ep × Bon (plan gain, pulse)", sPulse * E * bonPulse],
    ["s × Ep × Bon (plan gain, continuous)", bonCont * E * bonCont],
    ["Ep × Bon (plan ticks)", E * Math.max(bonPulse, bonCont)],
    ["(L − prevPos) × 1000 (finish)", V * 1000],
    ["disp × fA (margins)", V * 1000],
    ["u32 × 1000", (4_294_967_296 - 1) * 1000],
    ["u32 × (2W + 1)", (4_294_967_296 - 1) * (2 * R.paceHalfWidth + 1)],
    ["energy × liftF (lift)", E * liftFactorPm(STAT, 500)],
    ["vCore × landPm, tgt × hoverDraftPm, acc × glideStartAccelPm", V * MULT],
    ["B × Emax × share (ground level)", bonCont * E * 1000],
    ["ticks × v in an exhaustion walk", 3000 * 1000 * POS_PER_MM],
    ["L", L],
    ["hpMax in µhp", hpMaxMicro(R, R.maxCourseMeters * 1000)],
  ];

  for (const [name, value] of products)
    it(name, () => {
      expect(Number.isSafeInteger(value), `${name}: ${value}`).toBe(true);
    });

  it("the helpers return the exact floor at the live maxima (BigInt reference)", () => {
    const fl = (a: bigint, b: bigint): bigint => {
      expect(a <= SAFE, `${a} exceeds 2^53 − 1`).toBe(true);
      return a / b;
    };
    expect(cruiseVu(vA, pwc, F, STYLE_PACE, PACE)).toBe(
      Number(fl(fl(n(vA) * n(pwc) * n(F) * n(STYLE_PACE), n(1e9)) * n(1000 + PACE), n(1000))),
    );
    expect(pulseThrustVu(R, KBOOST, pwb)).toBe(
      Number(fl(n(KBOOST) * n(pwb) * n(R.pulseBoostMult), n(1_000_000))),
    );
    for (const v of [V_MAX, V]) {
      const r = fl(n(v) * n(1000), n(VBASE));
      expect(drainMicro(v, VBASE, DK_MAX)).toBe(Number(fl(r * r * n(DK_MAX), n(1_000_000))));
      const T_MAX = R.dnfTicksPerMeter * R.maxCourseMeters + R.dnfTicksBase;
      expect(finishMilliOf(T_MAX - 1, L, L - v, v)).toBe(
        Number(n(T_MAX - 1) * n(1000) + fl(n(v) * n(1000), n(v))),
      );
    }
  });
});
