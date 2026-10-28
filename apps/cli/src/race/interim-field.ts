/**
 * TEMPORARY stand-in for `generateField` (docs/race-engine.md 21.1) while it is being written in
 * `packages/sim/src/race/field.ts`.
 *
 * TODO(generateField): once `@falconess/sim` exports `generateField`, delete this file and bind the
 * real one in `engine-adapter.ts` (`import { generateField } from "@falconess/sim"`); the CLI
 * already reaches the field through the port, so nothing else changes.
 *
 * What it builds, the deterministic skeleton of 21.1 without the noise: the player plus
 * `course.entries − 1` rivals on generic frames of the player's PW class (base PW within
 * `field.rivalPwBandPm` ‰ of the player's frame, else the nearest `field.rivalMinPool` frames),
 * picked with replacement from `new Rng(raceSeed + "/field")`, which also places the player.
 * Rival stats follow the rival curve `rivalBase + rivalPerTurn × turn` per stat with the style's
 * `rivalWeights` (no `rivalNoise`, no `rivalStatJitter`), letters B with A on the frame's style,
 * `min(rivalMaxSkills, turn / rivalTurnsPerSkill)` generic actives, no parts and no quirks.
 * Draw order and values differ from the real `generateField`: a field for `pnpm sim:race` to
 * read, not the season's.
 */
import { Rng } from "@falconess/rng";
import type {
  BiomeAptitudes,
  ContentIndex,
  EntryInput,
  FalconessStats,
  Frame,
  RaceEntry,
  Style,
  StyleAptitudes,
} from "@falconess/schema";
import { freezeEntry, type Ruleset, resolveFrameBuild, STAT_ORDER } from "@falconess/sim";
import type { GenerateFieldArgs } from "./engine-port.js";

const MAX_BASE_STAT = 1200;

const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The generic frames of the player's PW class (21.1), id order. */
export function interimRivalPool(
  ruleset: Ruleset,
  content: ContentIndex,
  playerFrameId: string,
): Frame[] {
  const pwOf = (frameId: string) => resolveFrameBuild(content, frameId, [], []).powerToWeight;
  const pw0 = pwOf(playerFrameId);
  const generic = [...content.frames.values()].filter((f) => f.signatureOf === undefined);
  generic.sort(byId);
  const gap = (f: Frame) => Math.abs(pwOf(f.id) - pw0);
  const pool = generic.filter((f) => gap(f) * 1000 <= ruleset.field.rivalPwBandPm * pw0);
  if (pool.length >= ruleset.field.rivalMinPool) return pool;
  return [...generic]
    .sort((a, b) => gap(a) - gap(b) || byId(a, b))
    .slice(0, ruleset.field.rivalMinPool);
}

function rivalStats(ruleset: Ruleset, style: Style, turn: number): FalconessStats {
  const f = ruleset.field;
  const total = 5 * (f.rivalBase + f.rivalPerTurn * turn);
  const weights = f.rivalWeights[style];
  const stats: FalconessStats = {
    agility: 1,
    stamina: 1,
    technique: 1,
    courage: 1,
    intelligence: 1,
  };
  STAT_ORDER.forEach((stat, k) => {
    const share = Math.floor((total * (weights[k] ?? 200)) / 1000);
    stats[stat] = Math.min(MAX_BASE_STAT, Math.max(1, share));
  });
  return stats;
}

function rivalInput(
  ruleset: Ruleset,
  frame: Frame,
  k: number,
  turn: number,
  skills: string[],
): EntryInput {
  const biomeAptitude: BiomeAptitudes = {
    desert: "B",
    mountain: "B",
    coast: "B",
    urban: "B",
    tundra: "B",
  };
  const styleAptitude: StyleAptitudes = { dive: "B", hover: "B", glide: "B", ground: "B" };
  styleAptitude[frame.style] = "A";
  return {
    runnerId: `rival-${k}`,
    kind: "rival",
    falconessId: null,
    baseStats: rivalStats(ruleset, frame.style, turn),
    mood: 0,
    biomeAptitude,
    styleAptitude,
    frameId: frame.id,
    parts: [],
    quirks: [],
    learnedSkills: skills,
    durability: null,
  };
}

/** Same signature as the section 23 `generateField`; entries come back sorted by lane. */
export function interimGenerateField(
  ruleset: Ruleset,
  content: ContentIndex,
  args: GenerateFieldArgs,
): RaceEntry[] {
  const { course, turn, raceSeed, player } = args;
  const frng = new Rng(`${raceSeed}/field`);
  const n = course.entries;
  const pool = interimRivalPool(ruleset, content, player.frameId);
  const skillPool = [...content.skills.values()]
    .filter((s) => s.kind === "active" && s.uniqueTo === undefined)
    .sort(byId)
    .map((s) => s.id);
  const f = ruleset.field;
  const skillCount = Math.min(f.rivalMaxSkills, Math.floor(turn / f.rivalTurnsPerSkill));
  const playerLane = frng.nextInt("race", n);
  const entries: RaceEntry[] = [];
  let k = 0;
  for (let lane = 0; lane < n; lane++) {
    if (lane === playerLane) {
      entries.push(freezeEntry(ruleset, content, player, course, lane));
      continue;
    }
    k += 1;
    const frame = pool[frng.nextInt("race", pool.length)];
    if (frame === undefined) throw new Error(`no generic frame for ${player.frameId}'s class`);
    const skills = frng.shuffle("race", skillPool).slice(0, skillCount);
    entries.push(
      freezeEntry(ruleset, content, rivalInput(ruleset, frame, k, turn, skills), course, lane),
    );
  }
  return entries;
}
