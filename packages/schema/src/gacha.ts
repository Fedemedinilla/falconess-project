import { z } from "zod";
import { Rarity, Slug, Version } from "./core.js";

/**
 * Out of scope for the MVP (ADR-0001) but kept as the open door: pools, rates, pity and selector.
 * Anti pay-to-win invariant 1 is enforced structurally: items may only be falconess or frame ids
 * (checked in buildContentIndex), never parts or quirks.
 */
export const GachaPool = z
  .strictObject({
    id: Slug,
    version: Version,
    kind: z.enum(["falconess", "frames"]),
    /** Per-mille rates by rarity; must sum to 1000. */
    rates: z.record(Rarity, z.number().int().min(0).max(1000)),
    pity: z.number().int().min(10).max(200),
    /** Number of frames the player may mark for the guaranteed SSR (frames pool only). */
    selectorSize: z.number().int().min(0).max(4).default(0),
    items: z.array(Slug).min(1),
    featured: z.array(Slug).default([]),
  })
  .refine((p) => Object.values(p.rates).reduce((a, b) => a + b, 0) === 1000, {
    message: "rates must sum to 1000",
  });
export type GachaPool = z.infer<typeof GachaPool>;

export const Economy = z.strictObject({
  version: Version,
  pullCost: z.number().int().min(1),
  premiumEnabled: z.literal(false),
  /** Feathers awarded at season end by grade, G…SS. */
  feathersByGrade: z.record(
    z.enum(["G", "F", "E", "D", "C", "B", "A", "S", "SS"]),
    z.number().int().min(0),
  ),
  /** Scrap for re-rolling quirks: base × (1 + rerollsThisSeason). */
  rerollBaseScrap: z.number().int().min(1),
  pools: z.array(GachaPool),
});
export type Economy = z.infer<typeof Economy>;
