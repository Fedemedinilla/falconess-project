import { z } from "zod";
import { Slug, TextKey, Version } from "./core.js";

/**
 * Story scenes and the Falconess chat (owner 2026-11-12, docs/design/historia-peregrina.md). Pure
 * presentation: they change no state and draw nothing, so the simulation never reads them. The
 * page decides when one shows from the season's week and its goal results, already in the state.
 */

/** Her face in a line (the waist-up portraits of docs/design/prompts-arte-provisional.md). */
export const StoryExpression = z.enum([
  "calm",
  "happy",
  "eager",
  "bored",
  "annoyed",
  "surprised",
  "focused",
  "tired",
  "sad",
  "blank",
]);
export type StoryExpression = z.infer<typeof StoryExpression>;

/**
 * Who says a line: `narrator` (no name plate), `sfx` (a sound written big), `trainer` (the
 * player) or a character with a `speaker.<id>` text (a Falconess, the crew chief...).
 */
export const StoryLine = z.strictObject({
  speaker: Slug,
  textKey: TextKey,
  expression: StoryExpression.optional(),
  /** A key line: the cinematic style sets it large in the middle of the screen. */
  key: z.boolean().optional(),
});
export type StoryLine = z.infer<typeof StoryLine>;

/** When a scene shows. `goal` is the index of the season goal (0 = the first one). */
export const StoryTrigger = z.discriminatedUnion("kind", [
  /** The season's first week, before anything else. */
  z.strictObject({ kind: z.literal("start") }),
  /** The menu of this week (once). */
  z.strictObject({ kind: z.literal("turn"), turn: z.number().int().min(1).max(48) }),
  /** The menu of the goal's race week, before the race. */
  z.strictObject({ kind: z.literal("goal-before"), goal: z.number().int().min(0).max(9) }),
  /**
   * Back on the menu after the goal race: `win` (first), `pass` (any passing place), `placed`
   * (passed without winning: a «run» goal such as Peregrina's Larga, ADR-0014).
   */
  z.strictObject({
    kind: z.literal("goal-after"),
    goal: z.number().int().min(0).max(9),
    result: z.enum(["win", "pass", "placed"]),
  }),
  /** The season's end screen: every goal passed, or one failed. */
  z.strictObject({ kind: z.literal("end"), result: z.enum(["completed", "goal-failed"]) }),
]);
export type StoryTrigger = z.infer<typeof StoryTrigger>;

/** The painted backdrop of a scene (docs/design/prompts-arte-provisional.md, «Fondos»). */
export const StoryBackground = z.enum(["hangar", "track", "finish"]);
export type StoryBackground = z.infer<typeof StoryBackground>;

export const StoryScene = z.strictObject({
  id: Slug,
  version: Version,
  falconess: Slug,
  /** `box`: the dialogue box (a common scene); `cine`: the cinematic (a key scene). */
  style: z.enum(["box", "cine"]),
  /** Its backdrop; absent, the game shows through blurred (box) or a dark sky (cine). */
  background: StoryBackground.optional(),
  /** The chapter's name: on its title card, the skip notice and «Historia». */
  titleKey: TextKey,
  /** The chapter's label above the name («Prólogo», «Capítulo 1»). */
  kickerKey: TextKey,
  trigger: StoryTrigger,
  lines: z.array(StoryLine).min(1),
});
export type StoryScene = z.infer<typeof StoryScene>;

/** One question of the chat with a Falconess: the player asks, she answers in her own voice. */
export const ChatTopic = z.strictObject({
  id: Slug,
  version: Version,
  falconess: Slug,
  /** The pill the player taps (and the player's bubble). */
  questionKey: TextKey,
  /** From which week it can be asked; 1 = from the start. */
  fromTurn: z.number().int().min(1).max(48).default(1),
  /** Her answer, one bubble per key. */
  replyKeys: z.array(TextKey).min(1).max(6),
});
export type ChatTopic = z.infer<typeof ChatTopic>;
