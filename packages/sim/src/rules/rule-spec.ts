import type { Biome, RaceRule } from "@falconess/schema";
import type { RaceConstants } from "../rulesets/index.js";

/**
 * Who may run past the heat cap (docs/race-engine.md 9.3): `always` for mass-thrust, `immunity`
 * for any rule whose runner holds a `heat-penalty-immunity` trait (inside its window), `never` for
 * telemetry (its gate is a hard governor at raw dissipation).
 */
export type LicenceKind = "always" | "immunity" | "never";

/**
 * The numeric fields one manufacturer rule contributes to a runner, compiled once at race start
 * (docs/race-engine.md 13, 13.1 and table 3.3). The hot loop reads these scalars and switches on
 * `code`; it never dispatches on a rule name. Every multiplier is ‰ (1000 = neutral).
 */
export type RuleTerms = {
  /** Small integer of the rule, `RACE_RULES` order (`RULE_NONE` = 5). */
  readonly code: number;

  // --- mechanism (section 13) ----------------------------------------------------------------
  /** Boost governor limit: true → `capLim = D` (raw dissipation), false → `heatCap`. */
  readonly capLimRaw: boolean;
  /** Defensive clamp `heat = min(heat, D)` after every heat update (8.1). */
  readonly clampHeatAtD: boolean;
  /** An overheated tick multiplies the moved speed by `heatPenaltyMult` (8.3). */
  readonly heatPenalty: boolean;
  /** Overheat licence holder (9.3). */
  readonly licence: LicenceKind;
  /** Bursts of section 12 instead of continuous boost (unless the runner has `noPulse`). */
  readonly pulses: boolean;
  /** `ruleMult` of `dmgTick` (3.3): durability lost per overheated tick, ‰. */
  readonly overheatDurPm: number;
  /** Rule part of `regenTick`, me per non-boost tick (traits add `regenMe` on top). */
  readonly regenMe: number;
  /** Added to every skill check, ‰ (15.2). */
  readonly activationBonusPm: number;
  /** md restored on entering a flat segment by crossing its start (index ≥ 1); 0 = none. */
  readonly repairMd: number;

  // --- rule terms (13.1; numeric, ADR-0003 D45) ------------------------------------------------
  /** × the course cooling `cool0` (`coolRule` of `coolTick`). */
  readonly coolPm: number;
  /** × the landing loss `1000 − landBase` (`landRule` of `landPm`, 14.2). */
  readonly landLossPm: number;
  /** × the extra length of the ground detour `groundDetourMult − 1000` (table 3.3 `detour`). */
  readonly detourExtraPm: number;
  /** × `traits.curvesScalePm` in the curve penalty (section 7). */
  readonly curvesPm: number;
  /** × `dK` (`drainRule`, section 6). */
  readonly drainPm: number;
  /** × `acc` (`accRule`, table 3.3). */
  readonly accelPm: number;
  /**
   * Burst thrust per segment type, `SEGMENT_TYPES` order, biome included:
   * `fl(R.pulseAirPm[k] × R.pulseBiomePm[biome], 1000)` (table 3.3 `airPm`). The engine applies
   * it only to pulse frames (`pulses && !traits.noPulse`); 1000 everywhere for other rules.
   */
  readonly pulseAirPm: readonly number[];
  /** The plan's biome factor on `Bp` (`Bon`, table 3.3); applied only to pulse frames. */
  readonly pulseBiomePm: number;
};

/**
 * One manufacturer rule (`packages/sim/src/rules/<rule>.ts`). `compile` reads the ruleset's race
 * constants and the course biome; it runs once per runner at race start.
 */
export type RuleSpec = {
  readonly rule: RaceRule;
  readonly code: number;
  compile(R: RaceConstants, biome: Biome): RuleTerms;
};

/** Every term neutral: the base of each rule and the whole of the `none` fixture rule. */
export function neutralTerms(code: number): RuleTerms {
  return {
    code,
    capLimRaw: false,
    clampHeatAtD: false,
    heatPenalty: true,
    licence: "immunity",
    pulses: false,
    overheatDurPm: 1000,
    regenMe: 0,
    activationBonusPm: 0,
    repairMd: 0,
    coolPm: 1000,
    landLossPm: 1000,
    detourExtraPm: 1000,
    curvesPm: 1000,
    drainPm: 1000,
    accelPm: 1000,
    pulseAirPm: [1000, 1000, 1000, 1000, 1000, 1000, 1000],
    pulseBiomePm: 1000,
  };
}
