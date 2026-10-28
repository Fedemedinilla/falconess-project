import { clamp, floorDiv } from "@falconess/rng";
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
  const stamDiv = 1_200_000 + R.kS * stamina;
  const fat = Math.max(1000, R.fatigueBase - floorDiv(R.fatigueCourage * courage, 1200));
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
