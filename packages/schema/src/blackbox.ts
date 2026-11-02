import { z } from "zod";
import { Aptitude, Grade, Position, RulesetVersion, Slug, StatName } from "./core.js";

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
    skills: z.array(Slug).max(3),
    frameAffinity: Slug,
  }),
  seed: z.string().min(1),
  /** FNV-1a of the canonical RunInput[] JSON, to verify a replay. */
  inputsHash: z.string().min(1),
});
export type BlackBox = z.infer<typeof BlackBox>;
