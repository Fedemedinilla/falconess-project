import { z } from "zod";
import { RacePhase, Rarity, SegmentType, Slug, TextKey, Version } from "./core.js";
import { RaceModifier } from "./modifiers.js";

export const SkillTrigger = z.strictObject({
  phase: RacePhase.default("any"),
  segment: SegmentType.optional(),
  /** Position range as fraction of the field, 0 = leader, 1 = last. */
  positionRange: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]).optional(),
  heatAbove: z.number().int().optional(),
  energyBelow: z.number().int().optional(),
  once: z.boolean().default(true),
});
export type SkillTrigger = z.infer<typeof SkillTrigger>;

export const SkillEffect = z.strictObject({
  /** m/s added while active. */
  speed: z.number().min(-3).max(3).default(0),
  /** m/s² added while active. */
  accel: z.number().min(-1).max(1).default(0),
  energyRefund: z.number().int().min(0).max(60).default(0),
  heatCool: z.number().int().min(0).max(60).default(0),
  durabilityGuard: z.boolean().default(false),
  durationTicks: z.number().int().min(0).max(300).default(0),
});
export type SkillEffect = z.infer<typeof SkillEffect>;

const SkillBase = {
  id: Slug,
  version: Version,
  rarity: Rarity.default("R"),
  /** Skill points to learn. 0 for passives and unique skills. */
  cost: z.number().int().min(0).max(400).default(0),
  /** Set when only one Falconess can learn it. */
  uniqueTo: Slug.optional(),
  textKey: TextKey,
};

export const ActiveSkill = z.strictObject({
  ...SkillBase,
  kind: z.literal("active"),
  trigger: SkillTrigger.prefault({}),
  effect: SkillEffect.prefault({}),
  /** 1 = use the Intelligence formula; lower values multiply it. */
  activationBase: z.number().min(0).max(1).default(1),
});
export type ActiveSkill = z.infer<typeof ActiveSkill>;

/**
 * ADR-0009 (draft, ruleset v3 only): what a passive does in the air. v1 and v2 never read it, and
 * v3 reads it only with the flight constant `skillFlight` on. A dive from band `diveFromBand` or
 * higher gains `diveVPm` ‰ more Δv (Garra fija: the great dive from the ceiling).
 */
export const SkillFlight = z.strictObject({
  diveFromBand: z.number().int().min(2).max(3),
  diveVPm: z.number().int().min(0).max(500),
});
export type SkillFlight = z.infer<typeof SkillFlight>;

export const PassiveSkill = z.strictObject({
  ...SkillBase,
  kind: z.literal("passive"),
  modifiers: z.array(RaceModifier).min(1),
  /** ADR-0009 (draft): the passive's flight effect in ruleset v3; absent = none. */
  flight: SkillFlight.optional(),
});
export type PassiveSkill = z.infer<typeof PassiveSkill>;

export const Skill = z.discriminatedUnion("kind", [ActiveSkill, PassiveSkill]);
export type Skill = z.infer<typeof Skill>;
