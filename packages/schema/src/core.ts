import { z } from "zod";

/** kebab-case identifiers for every content entity. */
export const Slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "expected kebab-case slug");
export type Slug = z.infer<typeof Slug>;

/** Ruleset versions are `v1`, `v2`, … Old rulesets are never deleted. */
export const RulesetVersion = z.string().regex(/^v\d+$/);
export type RulesetVersion = z.infer<typeof RulesetVersion>;

export const Version = z.number().int().min(1);

/** Text keys point into packages/content/text/<lang>.json. Code never holds game prose. */
export const TextKey = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(\.[a-z0-9-]+)+$/, "expected dotted text key");
export type TextKey = z.infer<typeof TextKey>;

/** Falconess stats, Umamusume scale. */
export const Stat = z.number().int().min(1).max(1200);
export type Stat = z.infer<typeof Stat>;

export const StatName = z.enum(["agility", "stamina", "technique", "courage", "intelligence"]);
export type StatName = z.infer<typeof StatName>;
export const STAT_NAMES = StatName.options;

export const FrameStatName = z.enum(["powerToWeight", "energy", "dissipation", "durability"]);
export type FrameStatName = z.infer<typeof FrameStatName>;

export const Aptitude = z.enum(["S", "A", "B", "C", "D", "E", "F", "G"]);
export type Aptitude = z.infer<typeof Aptitude>;
export const APTITUDES = Aptitude.options;

/**
 * Wing styles: Picada, Suspensión, Planeo, Rasante. Since ADR-0008 the style sets only the wings'
 * physics (stoop, slipstream, launch, ground route); how she spends energy is her `Position`.
 */
export const Style = z.enum(["dive", "hover", "glide", "ground"]);
export type Style = z.infer<typeof Style>;
export const STYLES = Style.options;

/**
 * Race position, chosen before each race (ADR-0008): how she manages her energy. Punta (lead),
 * Pelotón (pack), Acecho (stalk), Remate (closer), front to back.
 */
export const Position = z.enum(["lead", "pack", "stalk", "closer"]);
export type Position = z.infer<typeof Position>;
export const POSITIONS = Position.options;

/**
 * The position each wing style raced before ADR-0008, and the default when none is chosen: a race
 * in these positions is the race of ruleset v1 as it was.
 */
export const DEFAULT_POSITION: Readonly<Record<Style, Position>> = Object.freeze({
  dive: "closer",
  hover: "stalk",
  glide: "lead",
  ground: "pack",
});

export const SegmentType = z.enum([
  "flat",
  "climb",
  "descent",
  "jump",
  "water",
  "canyon",
  "curves",
]);
export type SegmentType = z.infer<typeof SegmentType>;
export const SEGMENT_TYPES = SegmentType.options;

/** Descriptive course traits used by manufacturers' home/weak declarations and balance reports. */
export const CourseTrait = z.enum(["sprint", "long", "obstacles", "pure-speed"]);
export type CourseTrait = z.infer<typeof CourseTrait>;

export const Rarity = z.enum(["R", "SR", "SSR"]);
export type Rarity = z.infer<typeof Rarity>;

export const RacePhase = z.enum(["start", "middle", "final", "any"]);
export type RacePhase = z.infer<typeof RacePhase>;

/** Season grades, worst to best. */
export const Grade = z.enum(["G", "F", "E", "D", "C", "B", "A", "S", "SS"]);
export type Grade = z.infer<typeof Grade>;
export const GRADES = Grade.options;

/** Mood: five levels, −2 (worst) … +2 (best). */
export const Mood = z.number().int().min(-2).max(2);
export type Mood = z.infer<typeof Mood>;

export const HexColor = z.string().regex(/^#[0-9a-f]{6}$/);

export const FalconessStats = z.strictObject({
  agility: Stat,
  stamina: Stat,
  technique: Stat,
  courage: Stat,
  intelligence: Stat,
});
export type FalconessStats = z.infer<typeof FalconessStats>;

/** Exhaustive letter per race position (ADR-0008: the letter moved from the wing style). */
export const PositionAptitudes = z.record(Position, Aptitude);
export type PositionAptitudes = z.infer<typeof PositionAptitudes>;

/** Wing stats as content authors write them (decimals). The engine converts to per-mille on freeze. */
export const FrameStats = z.strictObject({
  powerToWeight: z.number().min(0.5).max(1.6),
  energy: z.number().int().min(40).max(140),
  dissipation: z.number().int().min(30).max(100),
  durability: z.number().int().min(50).max(200),
});
export type FrameStats = z.infer<typeof FrameStats>;

/** Additive deltas to frame stats; parts and quirks use it. */
export const FrameMods = z.strictObject({
  powerToWeight: z.number().min(-0.5).max(0.5).default(0),
  energy: z.number().int().min(-60).max(60).default(0),
  dissipation: z.number().int().min(-40).max(40).default(0),
  durability: z.number().int().min(-80).max(80).default(0),
  skillSlots: z.number().int().min(0).max(2).default(0),
});
export type FrameMods = z.infer<typeof FrameMods>;
export const EMPTY_FRAME_MODS: FrameMods = {
  powerToWeight: 0,
  energy: 0,
  dissipation: 0,
  durability: 0,
  skillSlots: 0,
};
