import type {
  ContentIndex,
  RaceEntry,
  RaceStats,
  RaceTraits,
  Slug,
  Style,
} from "@falconess/schema";
import { RaceSkill } from "@falconess/schema";
import { applyBuild } from "../frame-build.js";
import { RULESET_V1 } from "../rulesets/index.js";
import { addStatDeltas, compareIds } from "./entry.js";
import { compileTraits, statDeltas } from "./modifiers.js";

/**
 * Neutral fixture entries (docs/race-engine.md 3.4) for tests and the batch (S1, S2 fillers, S4,
 * S5, S8, sanity anchors): a runner with no manufacturer rule, built without content, to which the
 * batch can add one skill or one part. Never used by the season: `freezeEntry` cannot produce
 * `rule: "none"`.
 */

export const FIXTURE_FRAME_ID = "fixture-neutral";
export const FIXTURE_MANUFACTURER = "none";

/** The neutral frame values: PW 1.0, energy 100, dissipation 60, durability 100. */
const NEUTRAL_FRAME = { powerToWeight: 1000, energy: 100, dissipation: 60, durability: 100 };

/** Parts and quirks applied to the neutral frame (3.4). Internal TS type, not a data format. */
export type FixtureBuild = {
  readonly parts: readonly Slug[];
  readonly quirks: readonly Slug[];
  readonly powerToWeight: number;
  readonly energy: number;
  readonly dissipation: number;
  readonly durabilityMax: number;
  /** Summed `falconess-stat` deltas, added to the fixture's stats with the clamp of 3.1 step 3. */
  readonly statDelta: RaceStats;
  readonly traits: RaceTraits;
};

/**
 * Apply parts and quirks to the neutral frame values with the arithmetic, `power-cap` and clamps
 * of `resolveFrameBuild` (one shared helper). No passive, rule "none": the telemetry PW cap does
 * not apply. Content side; never called by `simulateRace`.
 */
export function fixtureBuild(
  content: ContentIndex,
  parts: readonly Slug[],
  quirks: readonly Slug[],
): FixtureBuild {
  const v = applyBuild(
    NEUTRAL_FRAME,
    [],
    parts.map((id) => content.getPart(id)),
    quirks.map((id) => content.getQuirk(id)),
    null,
  );
  return {
    parts: [...parts],
    quirks: [...quirks],
    powerToWeight: v.powerToWeight,
    energy: v.energy,
    dissipation: v.dissipation,
    durabilityMax: v.durabilityMax,
    statDelta: statDeltas(v.modifiers),
    traits: compileTraits(v.modifiers),
  };
}

/**
 * A neutral fixture entry with fixed values: kind rival, no Falconess, frame "fixture-neutral",
 * manufacturer and rule "none", no passive, mood 0, letters B, `stats` as given (already
 * effective), and the neutral frame (or `build`). `skills` must already be frozen
 * (`freezeSkill`), unique and id-sorted, at most `maxSkills`; throws otherwise.
 */
export function neutralFixtureEntry(args: {
  runnerId: string;
  laneIndex: number;
  style: Style;
  stats: RaceStats;
  skills?: readonly RaceSkill[];
  build?: FixtureBuild;
}): RaceEntry {
  const skills = args.skills ?? [];
  const maxSkills = RULESET_V1.race.maxSkills;
  if (skills.length > maxSkills)
    throw new Error(`fixture ${args.runnerId}: ${skills.length} skills, at most ${maxSkills}`);
  skills.forEach((s, j) => {
    if (!RaceSkill.safeParse(s).success)
      throw new Error(`fixture ${args.runnerId}: skill ${j} is not a frozen RaceSkill`);
    const prev = skills[j - 1];
    if (prev !== undefined && compareIds(prev.id, s.id) >= 0)
      throw new Error(`fixture ${args.runnerId}: skills must be unique and id-sorted`);
  });
  const b = args.build;
  return {
    runnerId: args.runnerId,
    kind: "rival",
    falconessId: null,
    laneIndex: args.laneIndex,
    frameId: FIXTURE_FRAME_ID,
    manufacturer: FIXTURE_MANUFACTURER,
    rule: "none",
    style: args.style,
    passive: null,
    parts: b ? [...b.parts] : [],
    quirks: b ? [...b.quirks] : [],
    mood: 0,
    biomeAptitude: "B",
    styleAptitude: "B",
    stats: b ? addStatDeltas(RULESET_V1, args.stats, b.statDelta) : { ...args.stats },
    powerToWeight: b ? b.powerToWeight : NEUTRAL_FRAME.powerToWeight,
    energy: b ? b.energy : NEUTRAL_FRAME.energy,
    dissipation: b ? b.dissipation : NEUTRAL_FRAME.dissipation,
    durabilityMax: b ? b.durabilityMax : NEUTRAL_FRAME.durability,
    durabilityStart: b ? b.durabilityMax : NEUTRAL_FRAME.durability,
    skills: skills.map((s) => ({ ...s })),
    traits: b ? b.traits : compileTraits([]),
  };
}

/**
 * A copy of `entry` with skill `skillId` disabled (3.2, ADR-0003 D49): p = 0, while it keeps its
 * id-order index, its pre-drawn slots and its place in the lucky pick. The only writer of
 * `disabled: true` (S4's "off" run). Throws if the entry does not carry the skill.
 */
export function disableSkill(entry: RaceEntry, skillId: Slug): RaceEntry {
  if (!entry.skills.some((s) => s.id === skillId))
    throw new Error(`${entry.runnerId} does not carry skill "${skillId}"`);
  return {
    ...entry,
    skills: entry.skills.map((s) => (s.id === skillId ? { ...s, disabled: true } : s)),
  };
}
