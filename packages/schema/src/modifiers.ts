import { z } from "zod";
import { RacePhase, SegmentType, StatName } from "./core.js";

/**
 * RaceModifier is the single vocabulary for "special" effects: frame passives, Boneyard quirks and
 * part extras all speak it. The race engine implements exactly one handler per `kind`; adding a new
 * kind means adding a union member here and its handler in packages/sim/src/race/modifiers.ts.
 * Numeric factors are decimals in content; the engine converts to per-mille on freeze.
 */
export const RaceModifier = z.discriminatedUnion("kind", [
  /** Flat bonus to an effective Falconess stat for the race (e.g. firmware: intelligence +30). */
  z.strictObject({
    kind: z.literal("falconess-stat"),
    stat: StatName,
    delta: z.number().int().min(-100).max(100),
  }),
  /** Override or multiply the segment speed factor for one segment type. */
  z.strictObject({
    kind: z.literal("segment-factor"),
    segment: SegmentType,
    mode: z.enum(["override", "multiply"]),
    value: z.number().min(0.5).max(1.5),
  }),
  /** Scale the curves penalty (0.5 = half penalty). */
  z.strictObject({ kind: z.literal("curves-penalty-scale"), scale: z.number().min(0).max(1) }),
  /** No speed penalty from heat, optionally only for the first N metres. */
  z.strictObject({
    kind: z.literal("heat-penalty-immunity"),
    untilMeters: z.number().int().positive().optional(),
  }),
  /** Failed jumps and water drag cost ticks instead of durability. */
  z.strictObject({
    kind: z.literal("obstacle-armor"),
    extraTicks: z.number().int().min(0).max(60).default(10),
  }),
  /** Energy regeneration per tick while not boosting (added to manufacturer regen if any). */
  z.strictObject({ kind: z.literal("regen"), perTick: z.number().min(0).max(2) }),
  /** Multiply regeneration while in the middle of the pack. */
  z.strictObject({ kind: z.literal("regen-pack-multiplier"), factor: z.number().min(1).max(3) }),
  /** The first boost in a given segment type costs no energy. */
  z.strictObject({ kind: z.literal("free-first-boost"), segment: SegmentType }),
  /** Nth consecutive pulse gains extra acceleration. */
  z.strictObject({
    kind: z.literal("pulse-chain-accel"),
    chainIndex: z.number().int().min(2).max(5),
    accelBonus: z.number().min(0).max(1),
  }),
  /** Pulses fired in a given segment type use a shorter cooldown. */
  z.strictObject({
    kind: z.literal("pulse-cooldown"),
    segment: SegmentType,
    cooldownTicks: z.number().int().min(5).max(60),
  }),
  /** Additive bonus to skill activation probability, optionally limited to a phase. */
  z.strictObject({
    kind: z.literal("activation-bonus"),
    phase: RacePhase.default("any"),
    bonus: z.number().min(0).max(0.5),
  }),
  /** On entering the final phase, convert accumulated heat to energy at `ratio`. */
  z.strictObject({ kind: z.literal("heat-to-energy"), ratio: z.number().min(0).max(1) }),
  /** Multiply the lift produced at jumps. */
  z.strictObject({ kind: z.literal("lift-bonus"), factor: z.number().min(0).max(0.5) }),
  /** Pulses are unavailable (quirk `stutter`). */
  z.strictObject({ kind: z.literal("no-pulse") }),
  /** One random learned skill gets activationBase 1.0 (quirk `lucky-bolt`). Uses stream `quirks`. */
  z.strictObject({ kind: z.literal("random-skill-guaranteed") }),
  /** Caps powerToWeight at a value (e.g. Altair telemetry 1.1). */
  z.strictObject({ kind: z.literal("power-cap"), max: z.number().min(0.5).max(1.6) }),
]);
export type RaceModifier = z.infer<typeof RaceModifier>;
export type RaceModifierKind = RaceModifier["kind"];
