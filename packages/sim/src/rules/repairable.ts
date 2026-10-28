import { RULE_REPAIRABLE } from "../race/units.js";
import { neutralTerms, type RuleSpec } from "./rule-spec.js";

/**
 * Boneyard (docs/race-engine.md 13): entering a flat segment by crossing its start (index ≥ 1)
 * restores `repairablePerFlatSegment` durability up to the maximum; it never clears `broken`. The
 * two quirk slots are a frame property (content). Rule term (13.1): rugged but clumsy, the landing
 * loss and the detour's extra length ×`repairableRuggedPm` (halved), the curve penalty
 * ×`repairableCurvesPm` (×1.5).
 */
export const REPAIRABLE: RuleSpec = {
  rule: "repairable",
  code: RULE_REPAIRABLE,
  compile: (R) => ({
    ...neutralTerms(RULE_REPAIRABLE),
    repairMd: R.repairablePerFlatSegment * 1000,
    landLossPm: R.repairableRuggedPm,
    detourExtraPm: R.repairableRuggedPm,
    curvesPm: R.repairableCurvesPm,
  }),
};
