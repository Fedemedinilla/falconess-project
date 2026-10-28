/**
 * The field of a race outside the season (`pnpm sim:race`, the web's free race): the player
 * against class-matched rivals (`generateField`, spec 21.1), frozen entry inputs (`freezeEntry`,
 * 3.1) or eight neutral fixtures (3.4). Every entry comes from the engine through the port; this
 * module only reads content to build the player's EntryInput (spec 21.2 step 2).
 */
import {
  type ContentIndex,
  type Course,
  type EntryInput,
  type FalconessStats,
  type RaceEntry,
  STYLES,
} from "@falconess/schema";
import type { SimContext } from "@falconess/sim";
import type { RaceEnginePort } from "./engine-port.js";

/** The ranges a field accepts: a uniform stat value and the turn that sets the rivals' level. */
export const FIELD_LIMITS = {
  minStat: 1,
  maxStat: 1200,
  minTurn: 0,
  maxTurn: 48,
  /** Every stat of a neutral fixture unless asked otherwise. */
  neutralStats: 600,
} as const;

export type PlayerFieldSpec = {
  kind: "player";
  falconessId: string;
  /** Null = her signature frame. */
  frameId: string | null;
  parts: string[];
  skills: string[];
  /** Uniform value for every stat; null = the Falconess's base stats. */
  stats: number | null;
  /** The rivals' level follows the turn: 95 + 9 × turn per stat (21.1). */
  turn: number;
};

export type FieldSpec =
  | PlayerFieldSpec
  | { kind: "entries"; inputs: EntryInput[] }
  | { kind: "neutral"; stats: number };

/** A field that cannot be built from content (unknown id, a skill she cannot learn). */
export class FieldError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FieldError";
  }
}

export const uniformStats = (n: number): FalconessStats => ({
  agility: n,
  stamina: n,
  technique: n,
  courage: n,
  intelligence: n,
});

/** The signature frame of a Falconess, if content has one. */
export function signatureFrameOf(content: ContentIndex, falconessId: string): string | undefined {
  for (const frame of content.frames.values())
    if (frame.signatureOf === falconessId) return frame.id;
  return undefined;
}

/** Active skills a Falconess can carry into a race: generic ones and her own unique ones. */
export function learnableSkills(content: ContentIndex, falconessId: string): string[] {
  const out: string[] = [];
  for (const skill of content.skills.values())
    if (skill.kind === "active" && (skill.uniqueTo === undefined || skill.uniqueTo === falconessId))
      out.push(skill.id);
  return out;
}

function known<T>(map: ReadonlyMap<string, T>, id: string, kind: string): T {
  const item = map.get(id);
  if (item === undefined)
    throw new FieldError(`unknown ${kind} "${id}" (known: ${[...map.keys()].join(", ")})`);
  return item;
}

/**
 * Spec 21.2 step 2 for a race outside the season: the player's EntryInput from content (base or
 * uniform stats, mood 0, her aptitudes, full durability, no quirks).
 */
export function playerEntryInput(content: ContentIndex, spec: PlayerFieldSpec): EntryInput {
  const falconess = known(content.falconess, spec.falconessId, "falconess");
  const frameId = spec.frameId ?? signatureFrameOf(content, falconess.id);
  if (frameId === undefined)
    throw new FieldError(`"${falconess.id}" has no signature frame; pass --frame`);
  known(content.frames, frameId, "frame");
  for (const part of spec.parts) known(content.parts, part, "part");
  for (const id of spec.skills) {
    const skill = known(content.skills, id, "skill");
    if (skill.kind !== "active") throw new FieldError(`skill "${id}" is passive, not learnable`);
    if (skill.uniqueTo !== undefined && skill.uniqueTo !== falconess.id)
      throw new FieldError(`skill "${id}" is unique to ${skill.uniqueTo}`);
  }
  return {
    runnerId: "player",
    kind: "player",
    falconessId: falconess.id,
    baseStats: spec.stats === null ? { ...falconess.baseStats } : uniformStats(spec.stats),
    mood: 0,
    biomeAptitude: { ...falconess.biomeAptitude },
    styleAptitude: { ...falconess.styleAptitude },
    frameId,
    parts: [...spec.parts],
    quirks: [],
    learnedSkills: [...spec.skills],
    durability: null,
  };
}

/** Builds the field through the engine port; entries come back sorted by lane. */
export function buildField(
  engine: Pick<RaceEnginePort, "generateField" | "freezeEntry" | "neutralFixtureEntry">,
  ctx: SimContext,
  course: Course,
  seed: string,
  spec: FieldSpec,
): RaceEntry[] {
  switch (spec.kind) {
    case "player":
      return engine.generateField(ctx.ruleset, ctx.content, {
        course,
        turn: spec.turn,
        raceSeed: seed,
        player: playerEntryInput(ctx.content, spec),
      });
    case "entries":
      return spec.inputs.map((input, lane) =>
        engine.freezeEntry(ctx.ruleset, ctx.content, input, course, lane),
      );
    case "neutral":
      // Two per style: lanes 0-3 take the styles in schema order, lanes 4-7 repeat them.
      return Array.from({ length: 2 * STYLES.length }, (_, lane) => {
        const style = STYLES[lane % STYLES.length] ?? "dive";
        const n = Math.floor(lane / STYLES.length) + 1;
        return engine.neutralFixtureEntry({
          runnerId: `neutral-${style}-${n}`,
          laneIndex: lane,
          style,
          stats: uniformStats(spec.stats),
        });
      });
  }
}
