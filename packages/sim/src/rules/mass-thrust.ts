import { RULE_MASS_THRUST } from "../race/units.js";
import { neutralTerms, type RuleSpec } from "./rule-spec.js";

/**
 * Steinhaus (docs/race-engine.md 13): overheated ticks never apply ×0.92, each costs
 * `massThrustDurMult` ×2 durability ("calor excedente drena durability ×2"), and the rule holds the
 * overheat licence of 9.3. Rule term (13.1): ambient cooling `massThrustCoolPm` (one value on
 * every course since ADR-0007).
 */
export const MASS_THRUST: RuleSpec = {
  rule: "mass-thrust",
  code: RULE_MASS_THRUST,
  compile: (R) => ({
    ...neutralTerms(RULE_MASS_THRUST),
    heatPenalty: false,
    licence: "always",
    overheatDurPm: R.massThrustDurMult,
    coolPm: R.massThrustCoolPm,
  }),
};
