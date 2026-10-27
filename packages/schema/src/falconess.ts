import { z } from "zod";
import {
  BiomeAptitudes,
  FalconessStats,
  Slug,
  StatName,
  Style,
  StyleAptitudes,
  TextKey,
  Version,
} from "./core.js";

export const SeasonGoal = z.strictObject({
  turn: z.number().int().min(1).max(48),
  courseId: Slug,
  minPlace: z.number().int().min(1).max(8),
});
export type SeasonGoal = z.infer<typeof SeasonGoal>;

/**
 * A playable character. Art is out of scope; `species` and `textKey` are the only identity fields.
 * Growth: per-stat training multiplier bonus (0.3 = +30 % gains on that stat).
 */
export const Falconess = z.strictObject({
  id: Slug,
  version: Version,
  species: z.string().min(1),
  baseStats: FalconessStats,
  growth: z.record(StatName, z.number().min(0).max(0.3)),
  biomeAptitude: BiomeAptitudes,
  styleAptitude: StyleAptitudes,
  preferredStyle: Style,
  uniqueSkills: z.array(Slug).max(2),
  sponsor: Slug,
  seasonGoals: z.array(SeasonGoal).min(1).max(8),
  textKey: TextKey,
});
export type Falconess = z.infer<typeof Falconess>;
