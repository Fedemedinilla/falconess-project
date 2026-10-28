import { ceilDiv, clamp, floorDiv, scale } from "@falconess/rng";
import type { Biome, RaceEntry, RaceTraits, Style } from "@falconess/schema";
import type { RuleTerms } from "../rules/rule-spec.js";
import type { RaceConstants } from "../rulesets/index.js";
import type { CourseGeometry } from "./geometry.js";
import {
  SEG_CANYON,
  SEG_CLIMB,
  SEG_CURVES,
  SEG_DESCENT,
  SEG_FLAT,
  SEG_JUMP,
  SEG_WATER,
} from "./units.js";

/**
 * Pure scalar helpers of the race tables (docs/race-engine.md 3.3, 6, 7, 14.2): integer formulas
 * with one floor per written division, each a unit-test target. Rule-dependent factors come from
 * the runner's compiled `RuleTerms` (13.1), never from a rule name.
 */

/**
 * Base terrain factor of a segment before modifiers (section 7), ‰. `agility` and `curvesScalePm`
 * matter only on curves (`curvesScalePm` already carries the rule's curve term).
 */
export function baseSegmentFactor(
  R: RaceConstants,
  type: number,
  gradePm: number,
  dragPm: number,
  windPm: number,
  agility: number,
  curvesScalePm: number,
): number {
  switch (type) {
    case SEG_FLAT:
    case SEG_JUMP:
      return 1000;
    case SEG_CLIMB:
      return 1000 - floorDiv(R.kClimb * gradePm, 1000);
    case SEG_DESCENT:
      return 1000 + floorDiv(R.kDescent * gradePm, 1000);
    case SEG_WATER:
      return 1000 - floorDiv(R.kWater * dragPm, 1000);
    case SEG_CANYON:
      return 1000 + floorDiv(R.kWind * windPm, 1000);
    case SEG_CURVES:
      return (
        1000 - floorDiv(R.kCurves * (1200 - Math.min(agility, 1200)) * curvesScalePm, 1_200_000)
      );
    default:
      throw new Error(`unknown segment type code ${type}`);
  }
}

/**
 * `f_seg` of one segment for one runner (section 7): base factor with
 * `curvesScale = fl(traits.curvesScalePm × terms.curvesPm, 1000)`, then the max override of its
 * type, then the sorted multiply product, then the clamp `[R.segFactorMin, R.segFactorMax]`.
 */
export function segmentFactor(
  R: RaceConstants,
  G: CourseGeometry,
  s: number,
  agility: number,
  traits: RaceTraits,
  terms: Pick<RuleTerms, "curvesPm">,
): number {
  const type = G.segType[s] ?? SEG_FLAT;
  const curvesScale = floorDiv(traits.curvesScalePm * terms.curvesPm, 1000);
  let f = baseSegmentFactor(
    R,
    type,
    G.gradePm[s] ?? 0,
    G.dragPm[s] ?? 0,
    G.windPm[s] ?? 0,
    agility,
    curvesScale,
  );
  const override = traits.segOverridePm[type] ?? 0;
  if (override > 0) f = override;
  f = floorDiv(f * (traits.segMultiplyPm[type] ?? 1000), 1000);
  return clamp(f, R.segFactorMin, R.segFactorMax);
}

/** The `f[s]` table of one runner (computed once per race, section 7). */
export function segmentFactors(
  R: RaceConstants,
  G: CourseGeometry,
  entry: Pick<RaceEntry, "stats" | "traits">,
  terms: Pick<RuleTerms, "curvesPm">,
): Int32Array {
  const f = new Int32Array(G.S);
  for (let s = 0; s < G.S; s++)
    f[s] = segmentFactor(R, G, s, entry.stats.agility, entry.traits, terms);
  return f;
}

/**
 * Acceleration in vu per tick (table 3.3 `acc`):
 * `fl(fl(R.kAcc × (600 + T) × pwc × f, 1 200 000 000) × accRule, 1000)`, the brief's
 * `k_acc·(0.5 + T/1200)·PW·f` in mm/s² with the telemetry term of 13.1.
 */
export function accelVu(
  R: RaceConstants,
  technique: number,
  pwc: number,
  f: number,
  terms: Pick<RuleTerms, "accelPm">,
): number {
  const brief = floorDiv(R.kAcc * (600 + technique) * pwc * f, 1_200_000_000);
  return floorDiv(brief * terms.accelPm, 1000);
}

/**
 * hp drain coefficients (section 6), µhp per tick at v = vBase: `[nonfinal, final]` with the
 * fatigue of the final phase and the telemetry term of 13.1 (glide's lead variant is applied by the
 * caller with `R.glideLeadDrainPm`).
 */
export function drainCoefficients(
  R: RaceConstants,
  stamina: number,
  courage: number,
  terms: Pick<RuleTerms, "drainPm">,
): readonly [number, number] {
  const stamDiv = staminaDivisor(R, stamina);
  const fat = fatiguePm(R, courage);
  const nonFinal = floorDiv(R.kHp * 1000 * 1_200_000, stamDiv);
  const final = floorDiv(R.kHp * 1000 * 1_200_000 * fat, stamDiv * 1000);
  return [floorDiv(nonFinal * terms.drainPm, 1000), floorDiv(final * terms.drainPm, 1000)];
}

/**
 * Heat removed per tick without boost (table 3.3 `coolTick`), mh:
 * `max(1, fl(cool0 × coolRule, 1000))` with
 * `cool0 = max(1, fl(R.kCool × R.biomeCool[biome] × dissF, 1 000 000))` and
 * `dissF = 1000 + fl(R.coolDissWeight × (fl(dissipation × 1000, R.dissRef) − 1000), 1000)`.
 */
export function coolTick(
  R: RaceConstants,
  biome: Biome,
  dissipation: number,
  terms: Pick<RuleTerms, "coolPm">,
): number {
  const dissF =
    1000 + floorDiv(R.coolDissWeight * (floorDiv(dissipation * 1000, R.dissRef) - 1000), 1000);
  const cool0 = Math.max(1, floorDiv(R.kCool * R.biomeCool[biome] * dissF, 1_000_000));
  return Math.max(1, floorDiv(cool0 * terms.coolPm, 1000));
}

/**
 * Durability lost per overheated tick (table 3.3 `dmgTick`), md:
 * `fl(R.overheatDurPerTick × ruleMult × styleDmg, 1 000 000)`, ground ×`groundDamagePm`.
 */
export function overheatDamage(
  R: RaceConstants,
  style: Style,
  terms: Pick<RuleTerms, "overheatDurPm">,
): number {
  const styleDmg = style === "ground" ? R.groundDamagePm : 1000;
  return floorDiv(R.overheatDurPerTick * terms.overheatDurPm * styleDmg, 1_000_000);
}

/**
 * ‰ of `vCore` kept on landing (14.2, table 3.3 `landPm`):
 * `landBase = R.landBasePm + fl(R.landTechPm × min(T, 1200), 1200)`,
 * `landPm = max(0, 1000 − fl((1000 − landBase) × landRule, 1000))`.
 */
export function landingKeepPm(
  R: RaceConstants,
  technique: number,
  terms: Pick<RuleTerms, "landLossPm">,
): number {
  const landBase = R.landBasePm + floorDiv(R.landTechPm * Math.min(technique, 1200), 1200);
  return Math.max(0, 1000 - floorDiv((1000 - landBase) * terms.landLossPm, 1000));
}

/**
 * Length of the ground route over a jump segment, ‰ of the segment (table 3.3 `detour`, ground
 * runners only): `1000 + fl((R.groundDetourMult − 1000) × detourRule, 1000)`.
 */
export function groundDetourPm(R: RaceConstants, terms: Pick<RuleTerms, "detourExtraPm">): number {
  return 1000 + floorDiv((R.groundDetourMult - 1000) * terms.detourExtraPm, 1000);
}

// --- PW, cruise, acceleration, exhaustion and thrust tables (3.3, 5, 6) -------------------------

/** PW of table variant b (3.3): `PW₀ = PW` intact, `PW₁ = fl(PW × R.durabilityZeroPowerMult, 1000)`. */
export function powerVariant(R: RaceConstants, pw: number, b: number): number {
  return b === 0 ? pw : floorDiv(pw * R.durabilityZeroPowerMult, 1000);
}

/** `pwc` / `pwb` of 3.3: `1000 + fl(weight × (PW − 1000), 1000)` (weight 1000 = the brief's PW). */
export function weightedPower(weightPm: number, pw: number): number {
  return 1000 + floorDiv(weightPm * (pw - 1000), 1000);
}

/** `vA = fl(VBASE × (1 200 000 + R.kA × A), 1 200 000)` vu: the brief's `v_base·(1 + k_a·A/1200)`. */
export function agilityCruiseVu(R: RaceConstants, vBaseVu: number, agility: number): number {
  return floorDiv(vBaseVu * (1_200_000 + R.kA * agility), 1_200_000);
}

/**
 * Cruise of one table cell (3.3 `vC`): `fl(fl(vA × pwc × f × stylePace, 10^9) × (1000 + pace), 1000)`.
 * The inner floor is forced by the 2^53 bound (1.5) and loses less than 1 vu.
 */
export function cruiseVu(
  vA: number,
  pwc: number,
  f: number,
  stylePacePm: number,
  pacePm: number,
): number {
  return floorDiv(floorDiv(vA * pwc * f * stylePacePm, 1_000_000_000) * (1000 + pacePm), 1000);
}

/**
 * Exhaustion speed of one table cell (3.3 `vMin`, section 6), relative to the runner's PW and
 * terrain, no agility: `fl(fl(VBASE × R.exhaustSpeedPm × pwc × f, 10^9) × (1000 + pace), 1000)`.
 */
export function exhaustSpeedVu(
  R: RaceConstants,
  vBaseVu: number,
  pwc: number,
  f: number,
  pacePm: number,
): number {
  return floorDiv(
    floorDiv(vBaseVu * R.exhaustSpeedPm * pwc * f, 1_000_000_000) * (1000 + pacePm),
    1000,
  );
}

/** Continuous thrust `B = fl(KBOOST × pwb, 1000)` vu (3.3). */
export function boostThrustVu(kBoostVu: number, pwb: number): number {
  return floorDiv(kBoostVu * pwb, 1000);
}

/** Pulse thrust `Bp = fl(KBOOST × pwb × R.pulseBoostMult, 10^6)` vu (3.3, 12). */
export function pulseThrustVu(R: RaceConstants, kBoostVu: number, pwb: number): number {
  return floorDiv(kBoostVu * pwb * R.pulseBoostMult, 1_000_000);
}

/** Chain pulse thrust `Bpc = fl(Bp × (1000 + traits.pulseChainBonusPm), 1000)` vu (3.3, 12). */
export function chainThrustVu(bp: number, chainBonusPm: number): number {
  return floorDiv(bp * (1000 + chainBonusPm), 1000);
}

// --- hp (4, 6) ------------------------------------------------------------------------------------

/** `hpMax = (R.hpBase + fl(R.hpPerKm × Lmm, 10^6)) × 10^6` µhp (section 4); stamina is not in it. */
export function hpMaxMicro(R: RaceConstants, lengthMm: number): number {
  return (R.hpBase + floorDiv(R.hpPerKm * lengthMm, 1_000_000)) * 1_000_000;
}

/** `stamDiv = 1 200 000 + R.kS × St`: the brief's drain divisor `(1 + k_s·St/1200)` × 1.2e6. */
export function staminaDivisor(R: RaceConstants, stamina: number): number {
  return 1_200_000 + R.kS * stamina;
}

/** Final-phase fatigue `fat = max(1000, R.fatigueBase − fl(R.fatigueCourage × C, 1200))` ‰. */
export function fatiguePm(R: RaceConstants, courage: number): number {
  return Math.max(1000, R.fatigueBase - floorDiv(R.fatigueCourage * courage, 1200));
}

/**
 * hp drained by one moved tick (section 6), µhp: `rPm = fl(vOut × 1000, VBASE)`,
 * `fl(rPm × rPm × dK, 10^6)`. The square is an integer product, never a power function.
 */
export function drainMicro(vOut: number, vBaseVu: number, dK: number): number {
  const rPm = floorDiv(vOut * 1000, vBaseVu);
  return floorDiv(rPm * rPm * dK, 1_000_000);
}

// --- heat (8) ---------------------------------------------------------------------------------------

/** Courage tolerance `tol = 1000 + fl(R.heatToleranceCourage × C, 1200)` ‰ (8.2). */
export function heatTolerancePm(R: RaceConstants, courage: number): number {
  return 1000 + floorDiv(R.heatToleranceCourage * courage, 1200);
}

/** The single overheat threshold `heatCap = fl(D × tol, 1000)` mh (8.2), D = dissipation × 1000. */
export function heatCapMh(dissipation: number, tolPm: number): number {
  return floorDiv(dissipation * 1000 * tolPm, 1000);
}

/** Moved speed while penalised: `fl(vTot × R.heatPenaltyMult, 1000)` (8.3, on output only). */
export function penalisedVu(R: RaceConstants, vTot: number): number {
  return scale(vTot, R.heatPenaltyMult);
}

// --- speed (5) ------------------------------------------------------------------------------------

/**
 * The start or recovery dash ends (5, 5.2) once `vCore ≥ fl(min(VBASE, tgt) × R.dashUntilPm, 1000)`:
 * slow frames dash to 0.85 × their own target instead of overshooting it.
 */
export function dashEnds(R: RaceConstants, vBaseVu: number, vCore: number, tgt: number): boolean {
  return vCore >= floorDiv(Math.min(vBaseVu, tgt) * R.dashUntilPm, 1000);
}

/**
 * One tick of the body speed towards its target (5): up by `up` (never below 0) when below,
 * down by `kDecel` when above, never past the target.
 */
export function approachVu(vCore: number, tgt: number, up: number, kDecel: number): number {
  if (vCore < tgt) return Math.min(tgt, vCore + Math.max(0, up));
  if (vCore > tgt) return Math.max(tgt, vCore - kDecel);
  return vCore;
}

/** Durability multiplier of a style: ground ×`R.groundDamagePm` ("resiste daño"), else 1000 (9.7). */
export function styleDamagePm(R: RaceConstants, style: Style): number {
  return style === "ground" ? R.groundDamagePm : 1000;
}

// --- jumps and water (14) --------------------------------------------------------------------------

/** `liftF = fl((600 + T) × (1000 + traits.liftBonusPm), 1200)` ‰ of energy (table 3.3, 16 #13). */
export function liftFactorPm(technique: number, liftBonusPm: number): number {
  return floorDiv((600 + technique) * (1000 + liftBonusPm), 1200);
}

/** `lift = fl(energy × liftF, 1000)` me (14.2): true energy, never perceived. */
export function liftMe(energy: number, liftF: number): number {
  return floorDiv(energy * liftF, 1000);
}

/** Energy one jump needs: `need = ceilDiv(liftReq × 10^6, liftF)` me (3.3, 14.4). */
export function jumpNeedMe(liftReq: number, liftF: number): number {
  return ceilDiv(liftReq * 1_000_000, liftF);
}

/** Durability lost by a failed jump without guard or armor: `fl(R.kCrash × 1000 × styleDmg, 1000)` md. */
export function crashDamageMd(R: RaceConstants, styleDmgPm: number): number {
  return floorDiv(R.kCrash * 1000 * styleDmgPm, 1000);
}

/** Durability lost on entering water without guard or armor: `fl(dragPm × R.waterHitPerDrag × styleDmg, 1000)` md (14.6). */
export function waterHitMd(R: RaceConstants, dragPm: number, styleDmgPm: number): number {
  return floorDiv(dragPm * R.waterHitPerDrag * styleDmgPm, 1000);
}

/** Progress on a ground detour (14.5): `fl(vOut × 1000, detour)` pu, the longer route at full speed. */
export function detourDisp(vOut: number, detourPm: number): number {
  return floorDiv(vOut * 1000, detourPm);
}

// --- Intelligence and skills (10, 15) --------------------------------------------------------------

/**
 * Centre of the pace window (10): `c = fl(R.paceCentreSpan × min(I, 1200), 1200) − fl(R.paceCentreSpan, 2)`
 * ‰ (span 43: I 0 → −21, I 600 → 0, I ≥ 1200 → +22).
 */
export function paceCentrePm(R: RaceConstants, intelligence: number): number {
  return (
    floorDiv(R.paceCentreSpan * Math.min(intelligence, 1200), 1200) - floorDiv(R.paceCentreSpan, 2)
  );
}

/** Plan perception half-width `We = fl(R.planErrorMax × (1200 − min(I, 1200)), 1200)` ‰ (10). */
export function planErrWindowPm(R: RaceConstants, intelligence: number): number {
  return floorDiv(R.planErrorMax * (1200 - Math.min(intelligence, 1200)), 1200);
}

/** `pAct = max(R.activationFloor, 1000 − ceilDiv(R.activationNumerator × 1000, I))` ‰ (15.2). */
export function activationPm(R: RaceConstants, intelligence: number): number {
  return Math.max(R.activationFloor, 1000 - ceilDiv(R.activationNumerator * 1000, intelligence));
}

// --- finish (19) --------------------------------------------------------------------------------------

/**
 * Milli-tick finish time of a runner crossing L during tick t (19):
 * `t × 1000 + fl((L − prevPos) × 1000, disp)` ∈ [1000 t, 1000 t + 1000].
 */
export function finishMilliOf(t: number, L: number, prevPos: number, disp: number): number {
  return t * 1000 + floorDiv((L - prevPos) * 1000, disp);
}

/**
 * Distance behind (mm) of a runner B at the instant A crossed (19): B's own tick move up to the
 * fraction `fA` (‰ of the tick), `posB = prevPos + fl(disp × fA, 1000)`, gap `max(0, fl(L − posB, 225))`.
 */
export function marginGapMm(
  L: number,
  prevPos: number,
  disp: number,
  fA: number,
  posPerMm: number,
): number {
  const posB = prevPos + floorDiv(disp * fA, 1000);
  return Math.max(0, floorDiv(L - posB, posPerMm));
}
