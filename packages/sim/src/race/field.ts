import { clamp, Rng } from "@falconess/rng";
import type {
  ContentIndex,
  Course,
  EntryInput,
  FalconessStats,
  Frame,
  Position,
  PositionAptitudes,
  RaceEntry,
  SeasonGoal,
  SeasonState,
  Style,
} from "@falconess/schema";
import { DEFAULT_POSITION } from "@falconess/schema";
import { resolveFrameBuild } from "../frame-build.js";
import type { Ruleset } from "../rulesets/index.js";
import type { SimContext } from "../season/context.js";
import { STAT_ORDER } from "../stats.js";
import { compareIds, freezeEntry } from "./entry.js";

/** `generateField` arguments (docs/race-engine.md 21.1, 23). */
export type GenerateFieldArgs = {
  readonly course: Course;
  readonly turn: number;
  readonly raceSeed: string;
  readonly player: EntryInput;
};

/** What a goal race needs (21.2): the course, its seed and the frozen field in lane order. */
export type GoalRaceSetup = { course: Course; raceSeed: string; entries: RaceEntry[] };

/** The season runner id of the player in every goal race (21.2 step 2). */
export const PLAYER_RUNNER_ID = "player";

/**
 * Base PW (‰) of a frame: no parts, no quirks. The telemetry cap is the ruleset's, as in
 * `freezeEntry`, so the band compares the PW the rivals actually race with (equal to the spec's
 * `resolveFrameBuild(content, id, [], [])` under v1).
 */
function basePw(ruleset: Ruleset, content: ContentIndex, frameId: string): number {
  return resolveFrameBuild(content, frameId, [], [], ruleset.race.telemetryPowerCap).powerToWeight;
}

/**
 * The generic frames of the player's PW class (21.1), id order: base PW within
 * `rivalPwBandPm` ‰ of `pw0`, the player's base PW; when fewer than `rivalMinPool` qualify, the
 * `rivalMinPool` generic frames nearest to `pw0` (ties by id). Picks are with replacement.
 */
export function rivalPool(ruleset: Ruleset, content: ContentIndex, playerFrameId: string): Frame[] {
  const F = ruleset.field;
  const pw0 = basePw(ruleset, content, playerFrameId);
  const generic = [...content.frames.values()]
    .filter((f) => f.signatureOf === undefined)
    .sort((a, b) => compareIds(a.id, b.id));
  const gap = new Map(generic.map((f) => [f.id, Math.abs(basePw(ruleset, content, f.id) - pw0)]));
  const gapOf = (f: Frame) => gap.get(f.id) ?? 0;
  const pool = generic.filter((f) => gapOf(f) * 1000 <= F.rivalPwBandPm * pw0);
  if (pool.length >= F.rivalMinPool) return pool;
  return [...generic]
    .sort((a, b) => gapOf(a) - gapOf(b) || compareIds(a.id, b.id))
    .slice(0, F.rivalMinPool);
}

/**
 * "A" for the position of the frame's style and "B" for the others (21.1). A rival runs in that
 * position (no `position` in its input: ADR-0008 leaves the choice to the player for now).
 */
function rivalAptitudes(style: Style): { positionAptitude: PositionAptitudes } {
  const positionAptitude: PositionAptitudes = { lead: "B", pack: "B", stalk: "B", closer: "B" };
  positionAptitude[DEFAULT_POSITION[style]] = "A";
  return { positionAptitude };
}

/**
 * Field of a goal race (docs/race-engine.md 21.1): the player plus `course.entries − 1` rivals on
 * generic frames of her PW class, with stats on the rival curve `5 × (rivalBase + rivalPerTurn ×
 * turn)` (± `rivalNoise` ‰ on the total, style weights, ± `rivalStatJitter` ‰ per stat),
 * `min(rivalMaxSkills, floor(turn / rivalTurnsPerSkill))` generic actives, no parts and no quirks
 * (ADR-0003 D37). Every draw comes from its own `Rng(`${raceSeed}/field`)`, stream `race`, in this
 * exact order: the player's lane; then per rival lane ascending: frame, total noise, five stat
 * jitters (STAT_ORDER), the skill shuffle (always taken, even when no skill is kept). The race and
 * the season draws never shift. Entries come back sorted by lane.
 */
export function generateField(
  ruleset: Ruleset,
  content: ContentIndex,
  args: GenerateFieldArgs,
): RaceEntry[] {
  const { course, turn, raceSeed, player } = args;
  const F = ruleset.field;
  const S = ruleset.season;
  const frng = new Rng(`${raceSeed}/field`);
  const n = course.entries;
  const pool = rivalPool(ruleset, content, player.frameId);
  if (pool.length === 0) throw new Error(`no rival frame for ${player.frameId}'s class`);
  const skillPool = [...content.skills.values()]
    .filter((s) => s.kind === "active" && s.uniqueTo === undefined)
    .map((s) => s.id)
    .sort(compareIds);
  const mu = F.rivalBase + F.rivalPerTurn * turn;
  const skillCount = Math.min(F.rivalMaxSkills, Math.floor(turn / F.rivalTurnsPerSkill));

  const playerLane = frng.nextInt("race", n);
  const entries: RaceEntry[] = [];
  let k = 0;
  for (let lane = 0; lane < n; lane++) {
    if (lane === playerLane) continue;
    k += 1;
    const frame = pool[frng.nextInt("race", pool.length)];
    if (frame === undefined) throw new Error("rival pool draw out of range");
    const weights = F.rivalWeights[frame.style];
    const total = Math.floor(
      (STAT_ORDER.length * mu * (1000 + frng.nextRange("race", -F.rivalNoise, F.rivalNoise))) /
        1000,
    );
    const baseStats: FalconessStats = {
      agility: 1,
      stamina: 1,
      technique: 1,
      courage: 1,
      intelligence: 1,
    };
    for (let i = 0; i < STAT_ORDER.length; i++) {
      const stat = STAT_ORDER[i];
      const weight = weights[i];
      if (stat === undefined || weight === undefined) throw new Error("rivalWeights row too short");
      const jitter = frng.nextRange("race", -F.rivalStatJitter, F.rivalStatJitter);
      const raw = Math.floor((total * weight * (1000 + jitter)) / 1_000_000);
      baseStats[stat] = clamp(raw, S.statMin, S.statMax);
    }
    const learnedSkills = frng.shuffle("race", skillPool).slice(0, skillCount);
    const input: EntryInput = {
      runnerId: `rival-${k}`,
      kind: "rival",
      falconessId: null,
      baseStats,
      mood: 0,
      ...rivalAptitudes(frame.style),
      frameId: frame.id,
      parts: [],
      quirks: [],
      learnedSkills,
      durability: null,
    };
    entries.push(freezeEntry(ruleset, content, input, course, lane));
  }
  entries.push(freezeEntry(ruleset, content, player, course, playerLane));
  return entries.sort((a, b) => a.laneIndex - b.laneIndex);
}

/**
 * The player's `EntryInput` for a goal race (21.2 step 2): stats, mood, her position letters and
 * the race position (absent = her wings' default, ADR-0008), the equipped frame with its installed
 * parts and rolled quirks, learned skills, and the frame's persisted durability (D35; absent = full).
 */
export function playerEntryInput(state: SeasonState, position?: Position): EntryInput {
  const frameId = state.equippedFrame;
  return {
    runnerId: PLAYER_RUNNER_ID,
    kind: "player",
    falconessId: state.falconessId,
    baseStats: { ...state.stats },
    mood: state.mood,
    positionAptitude: { ...state.positionAptitude },
    ...(position === undefined ? {} : { position }),
    frameId,
    parts: [...state.installedParts],
    quirks: [...(state.frameQuirks[frameId] ?? [])],
    learnedSkills: [...state.learnedSkills],
    durability: state.frameDurability[frameId] ?? null,
  };
}

/**
 * Everything a goal race runs on (21.2), shared by `season/goals.ts` and any replay or viewer so
 * both freeze identical entries: the goal's course, `raceSeed = `${seed}/race/${turn}`` and the
 * field of `generateField` around the player's entry. `state` is the season state at the race
 * (after the turn's action, before the race); the goal's turn is the state's turn there.
 * `position` is the one the week's input chose (`inputPosition`); absent = her wings' default
 * (ADR-0008). A viewer passes the same input's position, so both runs freeze the same player.
 */
export function goalRaceSetup(
  ctx: SimContext,
  state: SeasonState,
  goal: SeasonGoal,
  position?: Position,
): GoalRaceSetup {
  const course = ctx.content.getCourse(goal.courseId);
  const raceSeed = `${state.seed}/race/${goal.turn}`;
  const entries = generateField(ctx.ruleset, ctx.content, {
    course,
    turn: goal.turn,
    raceSeed,
    player: playerEntryInput(state, position),
  });
  return { course, raceSeed, entries };
}
