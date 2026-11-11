import { z } from "zod";
import {
  DistanceAptitudes,
  FalconessStats,
  Position,
  PositionAptitudes,
  Slug,
  StatName,
  TextKey,
  Version,
} from "./core.js";

/** The rounds of the Copa (ADR-0012), the end of an Exigente season. */
export const CupRound = z.enum(["qualifier", "semifinal", "final"]);
export type CupRound = z.infer<typeof CupRound>;

export const SeasonGoal = z.strictObject({
  turn: z.number().int().min(1).max(48),
  courseId: Slug,
  minPlace: z.number().int().min(1).max(8),
  /** ADR-0012: a round of the Copa (its name on screen). */
  cup: CupRound.optional(),
  /** ADR-0012: the rival built on the player's own Falconess runs in this race. */
  mirrorRival: z.boolean().optional(),
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
  /** One letter per race position (ADR-0008); it scales her Intelligence in that position. */
  positionAptitude: PositionAptitudes,
  /** Her best position: the season starts on the first hangar wings whose default it is. */
  preferredPosition: Position,
  uniqueSkills: z.array(Slug).max(2),
  /**
   * v3 (owner 2026-11-08, wings lose their stats): her signature frame's passive as her own
   * skill, racing with her on any wings. v1 and v2 never read it (there the frame carries it).
   */
  passive: Slug.optional(),
  /**
   * v3 (owner 2026-11-09): one letter per race distance, a staircase. It acts on flight (the
   * distance is played in the air); v1 and v2 never read it.
   */
  distanceAptitude: DistanceAptitudes.optional(),
  sponsor: Slug,
  seasonGoals: z.array(SeasonGoal).min(1).max(8),
  /** ADR-0012: her goals on Exigente (from the ruleset's calendar); absent = `seasonGoals`. */
  exigenteGoals: z.array(SeasonGoal).min(1).max(8).optional(),
  textKey: TextKey,
});
export type Falconess = z.infer<typeof Falconess>;
