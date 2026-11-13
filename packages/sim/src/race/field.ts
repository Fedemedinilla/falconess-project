import { clamp, Rng } from "@falconess/rng";
import type {
  ContentIndex,
  Course,
  DistanceAptitudes,
  EntryInput,
  FalconessStats,
  Frame,
  NamedRival,
  Position,
  PositionAptitudes,
  RaceEntry,
  SeasonGoal,
  SeasonState,
  SpecialistField,
  Style,
} from "@falconess/schema";
import { DEFAULT_POSITION } from "@falconess/schema";
import { resolveFrameBuild } from "../frame-build.js";
import type { Ruleset } from "../rulesets/index.js";
import type { SimContext } from "../season/context.js";
import { STAT_ORDER } from "../stats.js";
import { compareIds, freezeEntry } from "./entry.js";
import { flightOf } from "./flight.js";

/** `generateField` arguments (docs/race-engine.md 21.1, 23). */
export type GenerateFieldArgs = {
  readonly course: Course;
  readonly turn: number;
  readonly raceSeed: string;
  readonly player: EntryInput;
  /**
   * ADR-0014: the goal's grade, the rival curve's mean × this ‰. Absent = the field as before
   * (no draw moves either way).
   */
  readonly fieldPm?: number;
  /** ADR-0015: every rival a specialist of this race (her stat shares and distance letter). */
  readonly specialists?: SpecialistField;
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
function rivalAptitudes(
  ruleset: Ruleset,
  style: Style,
): { positionAptitude: PositionAptitudes; distanceAptitude?: DistanceAptitudes } {
  const positionAptitude: PositionAptitudes = { lead: "B", pack: "B", stalk: "B", closer: "B" };
  positionAptitude[DEFAULT_POSITION[style]] = "A";
  // v3 (owner 2026-11-09): a rival is B at every distance (no specialists in the field)
  const F = flightOf(ruleset);
  if (F === null || !F.distanceLetters) return { positionAptitude };
  return {
    positionAptitude,
    distanceAptitude: { sprint: "B", mile: "B", medium: "B", long: "B" },
  };
}

/** ADR-0015: a specialist field's letter at every distance (v3; v1/v2 have no distance letters). */
function specialize<T extends { distanceAptitude?: DistanceAptitudes }>(
  apt: T,
  specialists: SpecialistField | undefined,
): T {
  if (specialists === undefined || apt.distanceAptitude === undefined) return apt;
  const l = specialists.distanceLetter;
  return { ...apt, distanceAptitude: { sprint: l, mile: l, medium: l, long: l } };
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
  const curve = F.rivalBase + F.rivalPerTurn * turn;
  const mu = args.fieldPm === undefined ? curve : Math.floor((curve * args.fieldPm) / 1000);
  const skillCount = Math.min(F.rivalMaxSkills, Math.floor(turn / F.rivalTurnsPerSkill));

  const playerLane = frng.nextInt("race", n);
  const entries: RaceEntry[] = [];
  let k = 0;
  for (let lane = 0; lane < n; lane++) {
    if (lane === playerLane) continue;
    k += 1;
    const frame = pool[frng.nextInt("race", pool.length)];
    if (frame === undefined) throw new Error("rival pool draw out of range");
    const weights = args.specialists?.sharesPm ?? F.rivalWeights[frame.style];
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
      ...specialize(rivalAptitudes(ruleset, frame.style), args.specialists),
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
    ...(state.distanceAptitude === undefined
      ? {}
      : { distanceAptitude: { ...state.distanceAptitude } }),
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
  const player = playerEntryInput(state, position);
  const entries = generateField(ctx.ruleset, ctx.content, {
    course,
    turn: goal.turn,
    raceSeed,
    player,
    ...(goal.fieldPm === undefined ? {} : { fieldPm: goal.fieldPm }),
    ...(goal.field === undefined ? {} : { specialists: goal.field }),
  });
  // ADR-0015: a named rival takes the lane and wings of the first rival the mirror does not use
  const named = goal.namedRival;
  if (named !== undefined) {
    const slotId = goal.mirrorRival === true ? "rival-2" : "rival-1";
    const i = entries.findIndex((e) => e.runnerId === slotId);
    const slot = entries[i];
    if (slot === undefined) throw new Error(`goal race ${raceSeed}: no lane for ${named.id}`);
    const input = namedRivalInput(ctx, player, goal.turn, slot.frameId, named);
    entries[i] = freezeEntry(ctx.ruleset, ctx.content, input, course, slot.laneIndex);
  }
  const M = ctx.ruleset.season.mirrorRival;
  if (goal.mirrorRival !== true || M === undefined) return { course, raceSeed, entries };
  // ADR-0012: the Copa's rival takes the lane and wings of «rival-1» (the field's draws stay as
  // they were), built on the player's Falconess
  const i = entries.findIndex((e) => e.runnerId === "rival-1");
  const slot = entries[i];
  if (slot === undefined) throw new Error(`goal race ${raceSeed}: no rival lane for the mirror`);
  const input = mirrorRivalInput(ctx, player, goal.turn, slot.frameId);
  entries[i] = freezeEntry(ctx.ruleset, ctx.content, input, course, slot.laneIndex);
  return { course, raceSeed, entries };
}

/** ADR-0015: a named rival's runner id is this prefix and her id («named-milana»). */
export const NAMED_RUNNER_PREFIX = "named-";

/**
 * ADR-0015: a named rival's entry, on the player's level like the mirror (`mirrorRivalInput`) but
 * in her own shares, position, distance letter and skills. No draw.
 */
export function namedRivalInput(
  ctx: SimContext,
  player: EntryInput,
  turn: number,
  frameId: string,
  named: NamedRival,
): EntryInput {
  const S = ctx.ruleset.season;
  const F = ctx.ruleset.field;
  const floor = Math.floor(
    (STAT_ORDER.length * (F.rivalBase + F.rivalPerTurn * turn) * named.floorPm) / 1000,
  );
  let total = 0;
  for (const stat of STAT_ORDER) total += player.baseStats[stat];
  const target = floor + Math.floor((Math.max(0, total - floor) * named.excessPm) / 1000);
  const baseStats: FalconessStats = { ...player.baseStats };
  STAT_ORDER.forEach((stat, i) => {
    baseStats[stat] = clamp(
      Math.floor((target * (named.sharesPm[i] ?? 0)) / 1000),
      S.statMin,
      S.statMax,
    );
  });
  const positionAptitude: PositionAptitudes = { lead: "B", pack: "B", stalk: "B", closer: "B" };
  positionAptitude[named.position] = "A";
  const l = named.distanceLetter;
  return {
    runnerId: `${NAMED_RUNNER_PREFIX}${named.id}`,
    kind: "rival",
    falconessId: null,
    baseStats,
    mood: 0,
    positionAptitude,
    ...(player.distanceAptitude === undefined
      ? {}
      : { distanceAptitude: { sprint: l, mile: l, medium: l, long: l } }),
    position: named.position,
    frameId,
    parts: [],
    quirks: [],
    learnedSkills: [...named.skills],
    durability: null,
  };
}

/** The runner id of the Copa's rival (ADR-0012): the race view names her. */
export const MIRROR_RUNNER_ID = "mirror";

/**
 * The Copa's rival (ADR-0012, «Gerifalte»), built on the player's entry: her stat total is the
 * field's mean total at `turn` × `floorPm` ‰ plus `excessPm` ‰ of the player's total above that,
 * spread in the player's own shares (capped at `statMax`); she has the player's letters, runs in
 * the player's position and knows the player's generic skills (no unique ones, no signature
 * passive: she is nobody's Falconess). No draw.
 */
export function mirrorRivalInput(
  ctx: SimContext,
  player: EntryInput,
  turn: number,
  frameId: string,
): EntryInput {
  const S = ctx.ruleset.season;
  const M = S.mirrorRival;
  if (M === undefined) throw new Error(`ruleset ${ctx.ruleset.version} has no mirror rival`);
  const F = ctx.ruleset.field;
  const floor = Math.floor(
    (STAT_ORDER.length * (F.rivalBase + F.rivalPerTurn * turn) * M.floorPm) / 1000,
  );
  let total = 0;
  for (const stat of STAT_ORDER) total += player.baseStats[stat];
  const target = floor + Math.floor((Math.max(0, total - floor) * M.excessPm) / 1000);
  const baseStats: FalconessStats = { ...player.baseStats };
  for (const stat of STAT_ORDER)
    baseStats[stat] = clamp(
      Math.floor((player.baseStats[stat] * target) / Math.max(1, total)),
      S.statMin,
      S.statMax,
    );
  return {
    runnerId: MIRROR_RUNNER_ID,
    kind: "rival",
    falconessId: null,
    baseStats,
    mood: 0,
    positionAptitude: { ...player.positionAptitude },
    ...(player.distanceAptitude === undefined
      ? {}
      : { distanceAptitude: { ...player.distanceAptitude } }),
    // her position is the player's (the player's wings' default when the week chose none)
    position: player.position ?? DEFAULT_POSITION[ctx.content.getFrame(player.frameId).style],
    frameId,
    parts: [],
    quirks: [],
    learnedSkills: player.learnedSkills.filter(
      (id) => ctx.content.getSkill(id).uniqueTo === undefined,
    ),
    durability: null,
  };
}
