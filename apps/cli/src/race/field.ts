import {
  type ContentIndex,
  type Course,
  EntryInput,
  type FalconessStats,
  type RaceEntry,
  STYLES,
} from "@falconess/schema";
import type { SimContext } from "@falconess/sim";
import type { RaceEnginePort } from "./engine-port.js";
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

type EntryIssue = NonNullable<ReturnType<typeof EntryInput.safeParse>["error"]>["issues"][number];

/** `f.json[0].parts[1]` from the issue path, under the item's own location. */
function issuePath(where: string, path: readonly PropertyKey[]): string {
  return path.reduce<string>(
    (out, key) => (typeof key === "number" ? `${out}[${key}]` : `${out}.${String(key)}`),
    where,
  );
}

function describeIssue(raw: unknown, where: string, issue: EntryIssue): string {
  if (issue.code === "unrecognized_keys")
    return `${where}: unknown field ${issue.keys.map((k) => `"${k}"`).join(", ")}`;
  const [key] = issue.path;
  if (
    issue.path.length === 1 &&
    typeof key === "string" &&
    typeof raw === "object" &&
    raw !== null &&
    !(key in raw)
  )
    return `${where}: missing field "${key}"`;
  return `${issuePath(where, issue.path)}: ${issue.message}`;
}

/** The `--entries` file: a JSON array of 1..8 `EntryInput` (spec 3.1), lane = array index. */
export function parseEntryInputs(raw: unknown, source: string): EntryInput[] {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 8)
    throw new RaceArgsError(
      `${source}: expected a JSON array of 1..8 EntryInput objects (docs/race-engine.md 3.1)`,
    );
  return raw.map((item: unknown, i) => {
    const where = `${source}[${i}]`;
    const parsed = EntryInput.safeParse(item);
    if (parsed.success) return parsed.data;
    const issue = parsed.error.issues[0];
    throw new RaceArgsError(issue ? describeIssue(item, where, issue) : `${where}: invalid`);
  });
}
