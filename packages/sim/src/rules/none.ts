import { RULE_NONE } from "../race/units.js";
import { neutralTerms, type RuleSpec } from "./rule-spec.js";

/**
 * The neutral fixture's rule (docs/race-engine.md 3.4): no regen, `capLim = heatCap`, `ruleMult`
 * 1000, no activation bonus, no repair, no licence of its own, no pulses, no rule term of 13.1.
 * Never produced by `freezeEntry`; tests and batch only.
 */
export const NONE: RuleSpec = {
  rule: "none",
  code: RULE_NONE,
  compile: () => neutralTerms(RULE_NONE),
};
