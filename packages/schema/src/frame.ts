import { z } from "zod";
import { FrameMods, FrameStats, Rarity, Slug, Style, TextKey, Version } from "./core.js";
import { RaceModifier } from "./modifiers.js";

/** A complete set of wings. */
export const Frame = z.strictObject({
  id: Slug,
  version: Version,
  manufacturer: Slug,
  style: Style,
  rarity: Rarity,
  stats: FrameStats,
  /** Passive skill id (kind: "passive"). Boneyard frames have none: their quirks are the passive. */
  passive: Slug.optional(),
  signatureOf: Slug.optional(),
  quirkSlots: z.number().int().min(0).max(2),
  textKey: TextKey,
});
export type Frame = z.infer<typeof Frame>;

export const PartType = z.enum(["turbine", "battery", "stabilizer", "firmware"]);
export type PartType = z.infer<typeof PartType>;
export const PART_TYPES = PartType.options;

export const Part = z.strictObject({
  id: Slug,
  version: Version,
  type: PartType,
  manufacturer: Slug,
  mods: FrameMods.prefault({}),
  modifiers: z.array(RaceModifier).default([]),
  textKey: TextKey,
});
export type Part = z.infer<typeof Part>;

/** Boneyard quirk: rolled onto a frame's quirk slots, re-rollable with scrap. */
export const Quirk = z.strictObject({
  id: Slug,
  version: Version,
  mods: FrameMods.prefault({}),
  modifiers: z.array(RaceModifier).default([]),
  textKey: TextKey,
});
export type Quirk = z.infer<typeof Quirk>;

export const QuirkList = z.strictObject({ version: Version, quirks: z.array(Quirk).min(1) });
export type QuirkList = z.infer<typeof QuirkList>;
