import { z } from "zod";
import { BlackBox } from "./blackbox.js";
import {
  BiomeAptitudes,
  FalconessStats,
  Grade,
  Mood,
  RulesetVersion,
  Slug,
  StatName,
  StyleAptitudes,
} from "./core.js";

/** Workshop operations, batched into one `workshop` input. */
export const WorkshopOp = z.discriminatedUnion("op", [
  z.strictObject({ op: z.literal("equip-frame"), frameId: Slug }),
  z.strictObject({ op: z.literal("install-part"), partId: Slug }),
  z.strictObject({ op: z.literal("remove-part"), partId: Slug }),
  z.strictObject({ op: z.literal("repair") }),
  z.strictObject({ op: z.literal("reroll-quirks"), frameId: Slug }),
  z.strictObject({ op: z.literal("learn-skill"), skillId: Slug }),
]);
export type WorkshopOp = z.infer<typeof WorkshopOp>;

/**
 * Every player decision. A run is `seed + RunInput[]`; state is never saved, only replayed.
 * Kinds follow BRIEF §8 literally; `start` and `event:choose` are the two structural inputs.
 */
export const RunInput = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("start"),
    falconessId: Slug,
    hangar: z.array(Slug).min(1).max(4),
    parents: z.array(BlackBox).max(2).default([]),
  }),
  z.strictObject({ kind: z.literal("train:agility") }),
  z.strictObject({ kind: z.literal("train:stamina") }),
  z.strictObject({ kind: z.literal("train:technique") }),
  z.strictObject({ kind: z.literal("train:risk-flight") }),
  z.strictObject({ kind: z.literal("train:simulator") }),
  z.strictObject({ kind: z.literal("workshop"), ops: z.array(WorkshopOp).min(1).max(8) }),
  z.strictObject({ kind: z.literal("rest") }),
  z.strictObject({ kind: z.literal("outing"), manufacturer: Slug.optional() }),
  z.strictObject({ kind: z.literal("event:choose"), option: z.number().int().min(0).max(2) }),
]);
export type RunInput = z.infer<typeof RunInput>;
export type RunInputKind = RunInput["kind"];

export const TrainingKind = z.enum([
  "train:agility",
  "train:stamina",
  "train:technique",
  "train:risk-flight",
  "train:simulator",
]);
export type TrainingKind = z.infer<typeof TrainingKind>;

/** Which crews showed up this turn and for which training. Rolled at the start of each turn. */
export const CrewPresence = z.record(z.string(), z.array(Slug));

export const RaceResultEntry = z.strictObject({
  courseId: Slug,
  turn: z.number().int(),
  place: z.number().int().min(1),
  fieldSize: z.number().int().min(2),
  /** Finish time in ticks (1/15 s). */
  timeTicks: z.number().int().min(0),
  frameId: Slug,
  /** `stub` while the race engine is not wired in (phase 1); `v1` once it is. */
  engine: z.enum(["stub", "v1"]),
});
export type RaceResultEntry = z.infer<typeof RaceResultEntry>;

export const TurnLogEntry = z.strictObject({
  turn: z.number().int(),
  input: RunInput.optional(),
  /** Text keys describing what happened, for the CLI and the UI to render. */
  notes: z.array(z.string()),
  deltas: z.partialRecord(StatName, z.number().int()).default({}),
});
export type TurnLogEntry = z.infer<typeof TurnLogEntry>;

export const PendingEvent = z.strictObject({ eventId: Slug, turn: z.number().int() });

export const RaceOutcome = z.enum(["win", "podium", "lose", "goal-failed"]);
export type RaceOutcome = z.infer<typeof RaceOutcome>;

export const SeasonStatus = z.enum(["active", "ended"]);
export const SeasonEndReason = z.enum(["completed", "goal-failed"]);

/** Full state of one raising season. Reconstructed from seed + inputs; never trusted from a save. */
export const SeasonState = z.strictObject({
  rulesetVersion: RulesetVersion,
  seed: z.string().min(1),
  /** Number of RunInputs applied so far; the per-input RNG is derived from seed + this counter. */
  inputsApplied: z.number().int().min(0),
  status: SeasonStatus,
  endReason: SeasonEndReason.optional(),
  turn: z.number().int().min(0).max(48),
  falconessId: Slug,
  stats: FalconessStats,
  biomeAptitude: BiomeAptitudes,
  styleAptitude: StyleAptitudes,
  mood: Mood,
  fatigue: z.number().int().min(0).max(100),
  injuryTurns: z.number().int().min(0),
  skillPoints: z.number().int().min(0),
  learnedSkills: z.array(Slug),
  bond: z.record(Slug, z.number().int().min(0).max(100)),
  hangar: z.array(Slug).max(4),
  equippedFrame: Slug,
  installedParts: z.array(Slug).max(4),
  /** Quirks rolled per Boneyard frame in the hangar. */
  frameQuirks: z.record(Slug, z.array(Slug).max(2)),
  frameDurability: z.record(Slug, z.number().int().min(0)),
  rerollsThisSeason: z.number().int().min(0),
  wallet: z.strictObject({ feathers: z.number().int().min(0), scrap: z.number().int().min(0) }),
  /** Uses per training kind; facility level = 1 + floor(uses / usesPerLevel), max 5. */
  facilityUses: z.record(TrainingKind, z.number().int().min(0)),
  crewPresence: CrewPresence,
  /** Outcome of the race run this turn, if any; drives `race-result` events. */
  lastRace: z.strictObject({ turn: z.number().int(), outcome: RaceOutcome }).optional(),
  pendingEvent: PendingEvent.optional(),
  eventHistory: z.record(Slug, z.number().int().min(0)),
  raceResults: z.array(RaceResultEntry),
  log: z.array(TurnLogEntry),
  grade: Grade.optional(),
});
export type SeasonState = z.infer<typeof SeasonState>;
