import { RULE_TELEMETRY } from "../race/units.js";
import { neutralTerms, type RuleSpec } from "./rule-spec.js";

/**
 * Altair (docs/race-engine.md 13): (1) `capLim = D`, a gate at raw dissipation (heat never exceeds
 * it); (2) a defensive clamp `heat ≤ D`; never overheated, no licence; (3) +`telemetryActivationBonus`
 * on every skill check; (4) the PW cap 1100 is applied by resolveFrameBuild. Rule term (13.1): the
 * power governor, hp drain ×`telemetryDrainPm` and acceleration ×`telemetryAccelPm`, on every
 * segment of every course.
 */
export const TELEMETRY: RuleSpec = {
  rule: "telemetry",
  code: RULE_TELEMETRY,
  compile: (R) => ({
    ...neutralTerms(RULE_TELEMETRY),
    capLimRaw: true,
    clampHeatAtD: true,
    licence: "never",
    activationBonusPm: R.telemetryActivationBonus,
    drainPm: R.telemetryDrainPm,
    accelPm: R.telemetryAccelPm,
  }),
};
