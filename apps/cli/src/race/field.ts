import {
  BiomeAptitudes,
  type ContentIndex,
  type Course,
  FalconessStats,
  Mood,
  Slug,
  STYLES,
  StyleAptitudes,
} from "@falconess/schema";
import type { SimContext } from "@falconess/sim";
import type { EntryInput, RaceEnginePort } from "./engine-port.js";
import type { RaceEntry } from "./log-view.js";
import { RaceArgsError } from "./options.js";

/** What `buildField` builds; the `--entries` file is already read and parsed. */
export type FieldSpec =
  | {
      kind: "player";
      falconessId: string;
      frameId: string | null;
      parts: string[];
      skills: string[];
      stats: number | null;
      turn: number;
    }
  | { kind: "entries"; inputs: EntryInput[] }
  | { kind: "neutral"; stats: number };

const uniformStats = (n: number): FalconessStats => ({
  agility: n,
  stamina: n,
  technique: n,
  courage: n,
  intelligence: n,
});

function signatureFrameOf(content: ContentIndex, falconessId: string): string {
  for (const frame of content.frames.values())
    if (frame.signatureOf === falconessId) return frame.id;
  throw new RaceArgsError(`"${falconessId}" has no signature frame; pass --frame`);
}

function known<T>(map: ReadonlyMap<string, T>, id: string, kind: string): T {
  const item = map.get(id);
  if (item === undefined)
    throw new RaceArgsError(`unknown ${kind} "${id}" (known: ${[...map.keys()].join(", ")})`);
  return item;
}

/**
 * Spec 21.2 step 2 for a race outside the season: the player's EntryInput from content (base or
 * uniform stats, mood 0, her aptitudes, full durability, no quirks).
 */
export function playerEntryInput(
  content: ContentIndex,
  spec: Extract<FieldSpec, { kind: "player" }>,
): EntryInput {
  const falconess = known(content.falconess, spec.falconessId, "falconess");
  const frameId = spec.frameId ?? signatureFrameOf(content, falconess.id);
  known(content.frames, frameId, "frame");
  for (const part of spec.parts) known(content.parts, part, "part");
  for (const id of spec.skills) {
    const skill = known(content.skills, id, "skill");
    if (skill.kind !== "active") throw new RaceArgsError(`skill "${id}" is passive, not learnable`);
    if (skill.uniqueTo !== undefined && skill.uniqueTo !== falconess.id)
      throw new RaceArgsError(`skill "${id}" is unique to ${skill.uniqueTo}`);
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
  engine: RaceEnginePort,
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

// TEMPORARY: replace with `EntryInput.array().min(1).max(8).parse` from @falconess/schema
// (race.ts) when the engine lands.
const ENTRY_KEYS = [
  "runnerId",
  "kind",
  "falconessId",
  "baseStats",
  "mood",
  "biomeAptitude",
  "styleAptitude",
  "frameId",
  "parts",
  "quirks",
  "learnedSkills",
  "durability",
] as const;

function slugList(v: unknown, where: string): string[] {
  if (!Array.isArray(v) || !v.every((s) => Slug.safeParse(s).success))
    throw new RaceArgsError(`${where}: expected an array of kebab-case ids`);
  return v.map(String);
}

function parseEntryInput(raw: unknown, where: string): EntryInput {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    throw new RaceArgsError(`${where}: expected an EntryInput object`);
  const o = raw as Record<string, unknown>;
  for (const key of Object.keys(o))
    if (!(ENTRY_KEYS as readonly string[]).includes(key))
      throw new RaceArgsError(`${where}: unknown field "${key}"`);
  for (const key of ENTRY_KEYS)
    if (!(key in o)) throw new RaceArgsError(`${where}: missing field "${key}"`);
  const { runnerId, kind, falconessId, frameId, durability } = o;
  if (typeof runnerId !== "string" || runnerId.length === 0)
    throw new RaceArgsError(`${where}.runnerId: expected a non-empty string`);
  if (kind !== "player" && kind !== "rival" && kind !== "ghost")
    throw new RaceArgsError(`${where}.kind: expected "player", "rival" or "ghost"`);
  if (falconessId !== null && !Slug.safeParse(falconessId).success)
    throw new RaceArgsError(`${where}.falconessId: expected a Falconess id or null`);
  if (typeof frameId !== "string" || !Slug.safeParse(frameId).success)
    throw new RaceArgsError(`${where}.frameId: expected a frame id`);
  if (durability !== null && (typeof durability !== "number" || !Number.isInteger(durability)))
    throw new RaceArgsError(`${where}.durability: expected an integer or null`);
  const baseStats = FalconessStats.safeParse(o.baseStats);
  if (!baseStats.success)
    throw new RaceArgsError(
      `${where}.baseStats: ${baseStats.error.issues[0]?.message ?? "invalid"}`,
    );
  const mood = Mood.safeParse(o.mood);
  if (!mood.success) throw new RaceArgsError(`${where}.mood: expected an integer in -2..2`);
  const biomeAptitude = BiomeAptitudes.safeParse(o.biomeAptitude);
  if (!biomeAptitude.success)
    throw new RaceArgsError(`${where}.biomeAptitude: expected a letter per biome`);
  const styleAptitude = StyleAptitudes.safeParse(o.styleAptitude);
  if (!styleAptitude.success)
    throw new RaceArgsError(`${where}.styleAptitude: expected a letter per style`);
  return {
    runnerId,
    kind,
    falconessId: typeof falconessId === "string" ? falconessId : null,
    baseStats: baseStats.data,
    mood: mood.data,
    biomeAptitude: biomeAptitude.data,
    styleAptitude: styleAptitude.data,
    frameId,
    parts: slugList(o.parts, `${where}.parts`),
    quirks: slugList(o.quirks, `${where}.quirks`),
    learnedSkills: slugList(o.learnedSkills, `${where}.learnedSkills`),
    durability: typeof durability === "number" ? durability : null,
  };
}

/** The `--entries` file: a JSON array of 1..8 EntryInput (spec 3.1), lane = array index. */
export function parseEntryInputs(raw: unknown, source: string): EntryInput[] {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 8)
    throw new RaceArgsError(
      `${source}: expected a JSON array of 1..8 EntryInput objects (docs/race-engine.md 3.1)`,
    );
  return raw.map((item, i) => parseEntryInput(item, `${source}[${i}]`));
}
