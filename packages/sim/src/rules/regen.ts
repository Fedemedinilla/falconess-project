import { RULE_REGEN } from "../race/units.js";
import { neutralTerms, type RuleSpec } from "./rule-spec.js";

/**
 * Lumière (docs/race-engine.md 13): every non-boost tick regenerates `regenPerTick` (0.5 energy),
 * on top of any `regen` trait, ×`packRegenMultPm` in the pack. "Capacidad baja" is the frames' low
 * tank (content). Rule term (13.1): light airframe, the landing loss ×`regenLandLossPm` (×2).
 */
export const REGEN: RuleSpec = {
  rule: "regen",
  code: RULE_REGEN,
  compile: (R) => ({
    ...neutralTerms(RULE_REGEN),
    regenMe: R.regenPerTick,
    landLossPm: R.regenLandLossPm,
  }),
};
