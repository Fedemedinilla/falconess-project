import {
  APTITUDE_MULT,
  MOOD_MULT,
  moodMult,
  RACE,
  RULESET_VERSION,
  SEASON,
  STUB_RACE,
  TRAINING_SECONDARY,
  TRAINING_STAT,
} from "./v1/constants.js";

export type Ruleset = {
  readonly version: string;
  readonly season: typeof SEASON;
  readonly race: typeof RACE;
  readonly aptitudeMult: typeof APTITUDE_MULT;
  readonly moodMult: typeof MOOD_MULT;
  readonly trainingStat: typeof TRAINING_STAT;
  readonly trainingSecondary: typeof TRAINING_SECONDARY;
  readonly stubRace: typeof STUB_RACE;
};

export const RULESET_V1: Ruleset = {
  version: RULESET_VERSION,
  season: SEASON,
  race: RACE,
  aptitudeMult: APTITUDE_MULT,
  moodMult: MOOD_MULT,
  trainingStat: TRAINING_STAT,
  trainingSecondary: TRAINING_SECONDARY,
  stubRace: STUB_RACE,
};

const RULESETS: Readonly<Record<string, Ruleset>> = { v1: RULESET_V1 };

/** Old rulesets stay available so any saved run can be replayed forever. */
export function getRuleset(version: string): Ruleset {
  const r = RULESETS[version];
  if (!r) throw new Error(`unknown ruleset "${version}"`);
  return r;
}

export { moodMult };
