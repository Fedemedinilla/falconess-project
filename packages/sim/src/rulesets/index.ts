import {
  APTITUDE_MULT,
  FIELD,
  type FieldConstants,
  MOOD_MULT,
  moodMult,
  RACE,
  type RaceConstants,
  RULESET_VERSION,
  SEASON,
  TRAINING_SECONDARY,
  TRAINING_STAT,
} from "./v1/constants.js";

export type Ruleset = {
  readonly version: string;
  readonly season: typeof SEASON;
  readonly race: RaceConstants;
  readonly field: FieldConstants;
  readonly aptitudeMult: typeof APTITUDE_MULT;
  readonly moodMult: typeof MOOD_MULT;
  readonly trainingStat: typeof TRAINING_STAT;
  readonly trainingSecondary: typeof TRAINING_SECONDARY;
};

export const RULESET_V1: Ruleset = {
  version: RULESET_VERSION,
  season: SEASON,
  race: RACE,
  field: FIELD,
  aptitudeMult: APTITUDE_MULT,
  moodMult: MOOD_MULT,
  trainingStat: TRAINING_STAT,
  trainingSecondary: TRAINING_SECONDARY,
};

const RULESETS: Readonly<Record<string, Ruleset>> = { v1: RULESET_V1 };

/** Old rulesets stay available so any saved run can be replayed forever. */
export function getRuleset(version: string): Ruleset {
  const r = RULESETS[version];
  if (!r) throw new Error(`unknown ruleset "${version}"`);
  return r;
}

export type { FieldConstants, RaceConstants };
export { moodMult };
