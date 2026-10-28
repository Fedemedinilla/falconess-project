import { floorDiv, toPermille } from "@falconess/rng";
import type { RaceModifier, RaceStats, RaceTraits } from "@falconess/schema";
import { SEGMENT_TYPES } from "@falconess/schema";

/**
 * The 16 RaceModifier kinds compiled into integer traits (docs/race-engine.md 16). One handler per
 * kind in an exhaustive switch: a new kind fails the build here until it has one. Aggregation is
 * commutative (sum, min, max, OR, or a product in ascending value order with a floor per step), so
 * the order of the modifiers never matters. Decimals become ‰ with `toPermille`, the only
 * content-load rounding.
 */

/** Traits of a runner with no passive, part or quirk: every default of section 16. */
export function defaultTraits(): RaceTraits {
  return {
    segOverridePm: [0, 0, 0, 0, 0, 0, 0],
    segMultiplyPm: [1000, 1000, 1000, 1000, 1000, 1000, 1000],
    curvesScalePm: 1000,
    heatImmune: false,
    heatImmuneUntilMm: null,
    obstacleArmor: false,
    obstacleArmorExtraTicks: 0,
    regenMe: 0,
    packRegenMultPm: 1000,
    freeFirstBoostMask: 0,
    pulseChainIndex: 0,
    pulseChainBonusPm: 0,
    pulseCooldown: [0, 0, 0, 0, 0, 0, 0],
    activationBonusPm: { start: 0, middle: 0, final: 0, any: 0 },
    heatToEnergyPm: 0,
    liftBonusPm: 0,
    noPulse: false,
    randomSkillGuaranteed: false,
  };
}

/** Product of per-mille factors in ascending value order, flooring after every step. */
function sortedProduct(values: readonly number[]): number {
  let p = 1000;
  for (const v of [...values].sort((a, b) => a - b)) p = floorDiv(p * v, 1000);
  return p;
}

export function compileTraits(modifiers: readonly RaceModifier[]): RaceTraits {
  const t = defaultTraits();
  const multiply: number[][] = SEGMENT_TYPES.map(() => []);
  const curves: number[] = [];
  const pack: number[] = [];
  let immuneWholeRace = false;
  let immuneUntilMeters = 0;

  for (const m of modifiers) {
    switch (m.kind) {
      case "falconess-stat":
        // F: added to the effective stat by freezeEntry (3.1 step 3); not a trait. See statDeltas.
        break;
      case "segment-factor": {
        const k = SEGMENT_TYPES.indexOf(m.segment);
        const v = toPermille(m.value);
        if (m.mode === "override") t.segOverridePm[k] = Math.max(t.segOverridePm[k] ?? 0, v);
        else multiply[k]?.push(v);
        break;
      }
      case "curves-penalty-scale":
        curves.push(toPermille(m.scale));
        break;
      case "heat-penalty-immunity":
        t.heatImmune = true;
        if (m.untilMeters === undefined) immuneWholeRace = true;
        else immuneUntilMeters = Math.max(immuneUntilMeters, m.untilMeters);
        break;
      case "obstacle-armor":
        t.obstacleArmor = true;
        t.obstacleArmorExtraTicks = Math.max(t.obstacleArmorExtraTicks, m.extraTicks);
        break;
      case "regen":
        t.regenMe += toPermille(m.perTick);
        break;
      case "regen-pack-multiplier":
        pack.push(toPermille(m.factor));
        break;
      case "free-first-boost":
        t.freeFirstBoostMask |= 1 << SEGMENT_TYPES.indexOf(m.segment);
        break;
      case "pulse-chain-accel":
        t.pulseChainIndex =
          t.pulseChainIndex === 0 ? m.chainIndex : Math.min(t.pulseChainIndex, m.chainIndex);
        t.pulseChainBonusPm = Math.max(t.pulseChainBonusPm, toPermille(m.accelBonus));
        break;
      case "pulse-cooldown": {
        const k = SEGMENT_TYPES.indexOf(m.segment);
        const cur = t.pulseCooldown[k] ?? 0;
        t.pulseCooldown[k] = cur === 0 ? m.cooldownTicks : Math.min(cur, m.cooldownTicks);
        break;
      }
      case "activation-bonus":
        t.activationBonusPm[m.phase] += toPermille(m.bonus);
        break;
      case "heat-to-energy":
        t.heatToEnergyPm = Math.min(1000, t.heatToEnergyPm + toPermille(m.ratio));
        break;
      case "lift-bonus":
        t.liftBonusPm += toPermille(m.factor);
        break;
      case "no-pulse":
        t.noPulse = true;
        break;
      case "random-skill-guaranteed":
        t.randomSkillGuaranteed = true;
        break;
      case "power-cap":
        // F: already applied by resolveFrameBuild / fixtureBuild (min); the engine does nothing.
        break;
      default:
        return unknownModifier(m);
    }
  }

  multiply.forEach((values, k) => {
    if (values.length > 0) t.segMultiplyPm[k] = sortedProduct(values);
  });
  if (curves.length > 0) t.curvesScalePm = sortedProduct(curves);
  if (pack.length > 0) t.packRegenMultPm = sortedProduct(pack);
  // "absent wins": an immunity without untilMeters covers the whole race (null).
  if (t.heatImmune) t.heatImmuneUntilMm = immuneWholeRace ? null : immuneUntilMeters * 1000;
  return t;
}

/** Summed `falconess-stat` deltas per stat (kind #1, added after mood and aptitude). */
export function statDeltas(modifiers: readonly RaceModifier[]): RaceStats {
  const d = { agility: 0, stamina: 0, technique: 0, courage: 0, intelligence: 0 };
  for (const m of modifiers) if (m.kind === "falconess-stat") d[m.stat] += m.delta;
  return d;
}

function unknownModifier(m: never): never {
  throw new Error(`no handler for race modifier ${JSON.stringify(m)}`);
}
