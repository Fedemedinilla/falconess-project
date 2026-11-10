import { z } from "zod";
import { Aptitude, Distance, Grade, Position, RulesetVersion, Slug, StatName } from "./core.js";

const Stars = z.number().int().min(1).max(3);

/** Inheritance record produced at season end. Umamusume's blue/red/green factors. */
export const BlackBox = z.strictObject({
  id: z.string().min(1),
  rulesetVersion: RulesetVersion,
  falconessId: Slug,
  grade: Grade,
  factors: z.strictObject({
    stat: z.strictObject({ stat: StatName, stars: Stars }),
    aptitude: z.discriminatedUnion("kind", [
      /** A race position's letter (ADR-0008; it was the wing style's before). */
      z.strictObject({
        kind: z.literal("position"),
        key: Position,
        letter: Aptitude,
        stars: Stars,
      }),
    ]),
    /**
     * v3 (owner 2026-11-09): her best birth distance letter. A child's season lifts that
     * distance one step, capped at B (never up to a specialist's A); absent in v1 and v2 boxes.
     */
    distance: z.strictObject({ key: Distance, letter: Aptitude }).optional(),
    skills: z.array(Slug).max(3),
    frameAffinity: Slug,
  }),
  seed: z.string().min(1),
  /** FNV-1a of the canonical RunInput[] JSON, to verify a replay. */
  inputsHash: z.string().min(1),
});
export type BlackBox = z.infer<typeof BlackBox>;
