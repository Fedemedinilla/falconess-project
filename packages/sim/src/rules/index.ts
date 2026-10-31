import type { RaceRule } from "@falconess/schema";
import type { RaceConstants } from "../rulesets/index.js";
import { MASS_THRUST } from "./mass-thrust.js";
import { NONE } from "./none.js";
import { PULSE } from "./pulse.js";
import { REGEN } from "./regen.js";
import { REPAIRABLE } from "./repairable.js";
import type { RuleSpec, RuleTerms } from "./rule-spec.js";
import { TELEMETRY } from "./telemetry.js";

/**
 * Every rule a race entry can run (docs/race-engine.md 3.4, 13): the five manufacturer rules and
 * the neutral fixture's `none`. Exhaustive over `RaceRule`: a new rule fails the build here.
 */
export const RULES: Readonly<Record<RaceRule, RuleSpec>> = {
  "mass-thrust": MASS_THRUST,
  regen: REGEN,
  pulse: PULSE,
  telemetry: TELEMETRY,
  repairable: REPAIRABLE,
  none: NONE,
};

/** The rule's numeric fields (compiled once per runner at race start). */
export function compileRule(R: RaceConstants, rule: RaceRule): RuleTerms {
  return RULES[rule].compile(R);
}

export {
  createPulseOutput,
  createPulseState,
  endBurst,
  initPulseLane,
  type PulseInput,
  type PulseOutput,
  type PulseState,
  pulseStep,
} from "./pulse.js";
export type { LicenceKind, RuleSpec, RuleTerms } from "./rule-spec.js";
export { neutralTerms } from "./rule-spec.js";
