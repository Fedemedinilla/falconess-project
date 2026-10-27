import { z } from "zod";
import { Biome, CourseTrait, Slug, TextKey, Version } from "./core.js";

const Len = z.number().int().min(50).max(3000);

/** One stretch of track. Lengths in metres; the engine multiplies by 1000. */
export const Segment = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("flat"), length: Len }),
  z.strictObject({ type: z.literal("climb"), length: Len, grade: z.number().min(0.05).max(1) }),
  z.strictObject({ type: z.literal("descent"), length: Len, grade: z.number().min(0.05).max(1) }),
  z.strictObject({
    type: z.literal("jump"),
    length: Len,
    liftRequired: z.number().int().min(5).max(60),
  }),
  z.strictObject({ type: z.literal("water"), length: Len, drag: z.number().min(0.05).max(0.5) }),
  z.strictObject({ type: z.literal("canyon"), length: Len, wind: z.number().min(-0.3).max(0.3) }),
  z.strictObject({
    type: z.literal("curves"),
    length: Len,
    radius: z.number().int().min(10).max(200),
  }),
]);
export type Segment = z.infer<typeof Segment>;

export const Course = z.strictObject({
  id: Slug,
  version: Version,
  biome: Biome,
  traits: z.array(CourseTrait).default([]),
  segments: z.array(Segment).min(1).max(24),
  /** Field size for goal races. */
  entries: z.number().int().min(2).max(8).default(8),
  textKey: TextKey,
});
export type Course = z.infer<typeof Course>;

export function courseLength(course: Pick<Course, "segments">): number {
  return course.segments.reduce((sum, s) => sum + s.length, 0);
}
