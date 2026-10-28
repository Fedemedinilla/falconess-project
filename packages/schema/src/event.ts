import { z } from "zod";
import { RulesetVersion, Slug, StatName, TextKey, Version } from "./core.js";

/** What an option does. Everything is a delta applied by the season reducer. */
export const EventEffects = z.strictObject({
  stats: z.partialRecord(StatName, z.number().int().min(-40).max(40)).default({}),
  mood: z.number().int().min(-2).max(2).default(0),
  fatigue: z.number().int().min(-60).max(60).default(0),
  bond: z.record(Slug, z.number().int().min(-30).max(30)).default({}),
  skillPoints: z.number().int().min(-50).max(50).default(0),
  scrap: z.number().int().min(-200).max(200).default(0),
  feathers: z.number().int().min(-500).max(500).default(0),
  durability: z.number().int().min(-80).max(80).default(0),
  injuryTurns: z.number().int().min(0).max(4).default(0),
  learnSkill: Slug.optional(),
});
export type EventEffects = z.infer<typeof EventEffects>;

const ChanceBranch = z.strictObject({
  p: z.number().min(0).max(1),
  effects: EventEffects.prefault({}),
  /** What this outcome reads as ("it went well"), logged when the branch is drawn (ADR-0006). */
  textKey: TextKey.optional(),
});

export const EventOption = z.strictObject({
  textKey: TextKey,
  effects: EventEffects.prefault({}),
  /** Optional random branches; probabilities must sum to 1. Uses stream `events`. */
  chance: z.array(ChanceBranch).optional(),
});
export type EventOption = z.infer<typeof EventOption>;

export const EventSource = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("crew"),
    manufacturer: Slug,
    minBond: z.number().int().min(0).max(100).default(0),
  }),
  z.strictObject({ kind: z.literal("falconess"), falconess: Slug }),
  z.strictObject({ kind: z.literal("random") }),
  z.strictObject({
    kind: z.literal("race-result"),
    result: z.enum(["win", "podium", "lose", "goal-failed"]),
  }),
]);
export type EventSource = z.infer<typeof EventSource>;

export const GameEvent = z
  .strictObject({
    id: Slug,
    version: Version,
    source: EventSource,
    conditions: z
      .strictObject({
        turnRange: z
          .tuple([z.number().int().min(1).max(48), z.number().int().min(1).max(48)])
          .default([1, 48]),
        maxOccurrences: z.number().int().min(1).max(48).default(1),
        /** Ids of events that must have occurred before. */
        requires: z.array(Slug).default([]),
      })
      .prefault({}),
    /** Weighted pick among eligible events. `null` = story event at `fixedTurn`. */
    weight: z.number().int().min(1).max(20).nullable(),
    fixedTurn: z.number().int().min(1).max(48).optional(),
    handwritten: z.boolean().default(false),
    /**
     * Ruleset versions this event exists in (ADR-0006); absent = every ruleset. Filtered before
     * any draw, so events limited to a newer ruleset leave older runs' draws unchanged.
     */
    rulesets: z.array(RulesetVersion).min(1).optional(),
    /**
     * A luck event (ADR-0006): applied the turn it is rolled, with no choice and no extra input.
     * Exactly one option, which may have chance branches.
     */
    auto: z.boolean().optional(),
    textKey: TextKey,
    options: z.array(EventOption).min(1).max(3),
  })
  .refine((e) => (e.weight === null) === (e.fixedTurn !== undefined), {
    message: "story events have weight null and a fixedTurn; weighted events have neither",
  })
  .refine(
    (e) =>
      e.options.every(
        (o) => !o.chance || Math.abs(o.chance.reduce((s, b) => s + b.p, 0) - 1) < 1e-6,
      ),
    {
      message: "chance branches must sum to 1",
    },
  )
  .refine((e) => !e.auto || e.options.length === 1, {
    message: "auto events have exactly one option",
  });
export type GameEvent = z.infer<typeof GameEvent>;
