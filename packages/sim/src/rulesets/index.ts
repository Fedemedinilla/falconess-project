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
  type SeasonConstants,
  TRAINING_SECONDARY,
  TRAINING_STAT,
} from "./v1/constants.js";
import * as V2 from "./v2/constants.js";

export type Ruleset = {
  readonly version: string;
  readonly season: SeasonConstants;
  readonly race: RaceConstants;
  readonly field: FieldConstants;
  readonly aptitudeMult: typeof APTITUDE_MULT;
  /** Mood multiplier on race stats. */
  readonly moodMult: typeof MOOD_MULT;
  /** Mood multiplier on training gains (v1: the race table). */
  readonly trainMoodMult: typeof MOOD_MULT;
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
  trainMoodMult: MOOD_MULT,
  trainingStat: TRAINING_STAT,
  trainingSecondary: TRAINING_SECONDARY,
};

/** ADR-0006: vigor, failure curve, weightier mood, harder field. Same race engine as v1. */
export const RULESET_V2: Ruleset = {
  ...RULESET_V1,
  version: V2.RULESET_VERSION,
  season: V2.SEASON,
  field: V2.FIELD,
  moodMult: V2.MOOD_MULT,
  trainMoodMult: V2.TRAIN_MOOD_MULT,
};

/** The ruleset new runs start on. Saved runs keep the version they started with. */
export const CURRENT_RULESET: Ruleset = RULESET_V2;

const RULESETS: Readonly<Record<string, Ruleset>> = { v1: RULESET_V1, v2: RULESET_V2 };

/** Old rulesets stay available so any saved run can be replayed forever. */
export function getRuleset(version: string): Ruleset {
  const r = RULESETS[version];
  if (!r) throw new Error(`unknown ruleset "${version}"`);
  return r;
}

export type { FieldConstants, RaceConstants, SeasonConstants };
export { moodMult };
