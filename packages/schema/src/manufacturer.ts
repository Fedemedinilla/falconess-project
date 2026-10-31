import { z } from "zod";
import { CourseTrait, HexColor, SegmentType, Slug, StatName, TextKey, Version } from "./core.js";

/**
 * Each manufacturer has exactly one mechanical rule, implemented as code in packages/sim/src/rules/.
 * A new manufacturer with a new rule adds a member here and a file there; nothing else changes.
 */
export const ManufacturerRule = z.enum([
  "mass-thrust",
  "regen",
  "pulse",
  "telemetry",
  "repairable",
]);
export type ManufacturerRule = z.infer<typeof ManufacturerRule>;

/** Crew = the manufacturer's people. They are the support cards: training bonuses and own events. */
export const Crew = z.strictObject({
  stats: z.array(StatName).min(1).max(2),
  trainingBonus: z.number().min(0.05).max(0.4),
  signatureEvent: Slug,
  textKey: TextKey,
});
export type Crew = z.infer<typeof Crew>;

/**
 * Home or weak terrain of a manufacturer (§25.2 S2 cells). `everywhere` marks every course: it is
 * what a biome-wide home or weakness collapsed to when ADR-0007 removed biomes (Kōryū home, Steinhaus
 * weak, both from the desert every v1 course had).
 */
const Terrain = z.strictObject({
  everywhere: z.boolean().default(false),
  segments: z.array(SegmentType).default([]),
  traits: z.array(CourseTrait).default([]),
});

export const Manufacturer = z.strictObject({
  id: Slug,
  version: Version,
  rule: ManufacturerRule,
  palette: z.strictObject({ primary: HexColor, secondary: HexColor }),
  crew: Crew,
  home: Terrain.prefault({}),
  weak: Terrain.prefault({}),
  sponsors: z.array(Slug).default([]),
  inGacha: z.boolean(),
  textKey: TextKey,
});
export type Manufacturer = z.infer<typeof Manufacturer>;
