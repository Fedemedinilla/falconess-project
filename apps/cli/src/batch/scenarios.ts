/**
 * Field construction of every race scenario of docs/race-engine.md §25.2, content side, through
 * the engine port only. Each builder returns the races of one job with their runners in a fixed
 * role order, so results are read by role, never by lane.
 */
import { Rng } from "@falconess/rng";
import {
  type ContentIndex,
  type Course,
  type FalconessStats,
  POSITIONS,
  type PositionAptitudes,
  STYLES,
} from "@falconess/schema";
import type { Ruleset } from "@falconess/sim";
import type { Catalog } from "./catalog.js";
import type { NeutralFixtureArgs, RaceEnginePort } from "./engine-port.js";
import type { EntryInput, FixtureBuild, RaceEntry, RaceSkill, RaceStats } from "./engine-types.js";
import { type Job, S8_INTELLIGENCE } from "./plan.js";

export type BuildContext = {
  port: RaceEnginePort;
  ruleset: Ruleset;
  content: ContentIndex;
  catalog: Catalog;
};

export type RaceSpec = {
  course: Course;
  seed: string;
  /** Entries in role order (`roles[i]` is `entries[i].runnerId`). */
  entries: RaceEntry[];
  roles: string[];
};

export type RaceJobSpec = {
  races: RaceSpec[];
  /** S2 real frames: the frame of each role (fillers: `fixture-neutral`). */
  frames?: string[];
  /** S5 and the quirk diagnostic: the role of the carrier (lane `k mod 8`). */
  carrierRole?: number;
};

export const FIELD_SIZE = 8;

/** §25.2: the reference build of S1, S2, S4, S5 and S8. */
export const STATS_600: RaceStats = {
  agility: 600,
  stamina: 600,
  technique: 600,
  courage: 600,
  intelligence: 600,
};

const BASE_600: FalconessStats = { ...STATS_600 };

/** S1 roles: two runners per style, in style order (`dive-1`, `dive-2`, `hover-1`, …). */
export const S1_ROLES: readonly string[] = STYLES.flatMap((s) => [`${s}-1`, `${s}-2`]);

/** S2 filler roles, after the five designated entries. */
export const S2_FILLERS: readonly string[] = ["none-1", "none-2", "none-3"];

export const S3_ROLES: readonly string[] = ["signature", "generic"];

export const S8_ROLES: readonly string[] = [
  "measured",
  ...Array.from({ length: FIELD_SIZE - 1 }, (_, i) => `field-${i + 1}`),
];

/** "Lanes shuffled per seed" (§25.2): `perm[role]` is that role's lane. */
export function shuffledLanes(seed: string, n: number): number[] {
  const lanes = Array.from({ length: n }, (_, i) => i);
  return new Rng(`${seed}/lanes`).shuffle("race", lanes);
}

function allB<K extends string>(keys: readonly K[]): Record<K, "B"> {
  return Object.fromEntries(keys.map((k) => [k, "B"])) as Record<K, "B">;
}

const ALL_B_LETTERS: PositionAptitudes = allB(POSITIONS);

function fixture(
  ctx: BuildContext,
  runnerId: string,
  laneIndex: number,
  style: RaceEntry["style"],
  stats: RaceStats,
  skills: readonly RaceSkill[] | undefined,
  build: FixtureBuild | undefined,
): RaceEntry {
  const args: NeutralFixtureArgs = { runnerId, laneIndex, style, stats };
  if (skills !== undefined) args.skills = skills;
  if (build !== undefined) args.build = build;
  return ctx.port.neutralFixtureEntry(args);
}

/**
 * The S1 field: 8 neutral fixtures, 2 per style, stats 600, lanes shuffled per seed. S4 gives every
 * runner `skills`; S5 and the quirk diagnostic give one carrier role a `build`.
 */
export function neutralField(
  ctx: BuildContext,
  seed: string,
  opts: { skills?: readonly RaceSkill[]; carrier?: { role: number; build: FixtureBuild } } = {},
): RaceEntry[] {
  const lanes = shuffledLanes(seed, FIELD_SIZE);
  return S1_ROLES.map((runnerId, role) =>
    fixture(
      ctx,
      runnerId,
      lanes[role] ?? role,
      STYLES[role >> 1] ?? "hover",
      STATS_600,
      opts.skills,
      opts.carrier?.role === role ? opts.carrier.build : undefined,
    ),
  );
}

function spec(course: Course, seed: string, entries: RaceEntry[]): RaceSpec {
  return { course, seed, entries, roles: entries.map((e) => e.runnerId) };
}

/**
 * S2: five designated entries (one per manufacturer, id order) and three `none` hover fillers.
 * Real frames: one `nextInt` per manufacturer from `new Rng(seed + "/frames")` over its
 * non-signature frames (stream `race`, the stream `generateField` uses), frozen at base 600 with
 * every letter B, no skills, parts or quirks. Equal-PW: the neutral fixture with the
 * manufacturer's rule.
 */
function buildS2(
  ctx: BuildContext,
  job: Extract<Job, { scenario: "S2" }>,
  course: Course,
): RaceJobSpec {
  const lanes = shuffledLanes(job.seed, FIELD_SIZE);
  const frameRng = new Rng(`${job.seed}/frames`);
  const entries: RaceEntry[] = [];
  const frames: string[] = [];
  ctx.catalog.manufacturers.forEach((m, role) => {
    const lane = lanes[role] ?? role;
    if (job.variant === "real") {
      const pool = ctx.catalog.s2Frames.get(m) ?? [];
      const frameId = pool[frameRng.nextInt("race", pool.length)];
      if (frameId === undefined) throw new Error(`S2: no frame for ${m}`);
      const input: EntryInput = {
        runnerId: m,
        kind: "rival",
        falconessId: null,
        baseStats: { ...BASE_600 },
        mood: 0,
        positionAptitude: { ...ALL_B_LETTERS },
        frameId,
        parts: [],
        quirks: [],
        learnedSkills: [],
        durability: null,
      };
      entries.push(ctx.port.freezeEntry(ctx.ruleset, ctx.content, input, course, lane));
      frames.push(frameId);
    } else {
      const rule = ctx.catalog.rules.get(m);
      if (rule === undefined) throw new Error(`S2: no rule for ${m}`);
      const base = fixture(ctx, m, lane, "hover", STATS_600, undefined, undefined);
      entries.push({ ...base, rule, manufacturer: m });
      frames.push(base.frameId);
    }
  });
  S2_FILLERS.forEach((runnerId, i) => {
    const role = ctx.catalog.manufacturers.length + i;
    const e = fixture(ctx, runnerId, lanes[role] ?? role, "hover", STATS_600, undefined, undefined);
    entries.push(e);
    frames.push(e.frameId);
  });
  const out: RaceJobSpec = { races: [spec(course, job.seed, entries)] };
  if (job.variant === "real") out.frames = frames;
  return out;
}

/**
 * S3: the same Falconess on her signature frame and on its generic, base 600 with her letters,
 * her unique skill(s) as the only actives, no parts or quirks. One paired sample is the two lane
 * orders of one seed: race 0 has the signature in lane 0, race 1 in lane 1.
 */
function buildS3(
  ctx: BuildContext,
  job: Extract<Job, { scenario: "S3" }>,
  course: Course,
): RaceJobSpec {
  const pair = ctx.catalog.s3Pairs.find((p) => p.falconessId === job.pair);
  if (!pair) throw new Error(`S3: unknown pair ${job.pair}`);
  const f = ctx.content.getFalconess(pair.falconessId);
  const input = (runnerId: string, frameId: string): EntryInput => ({
    runnerId,
    kind: "player",
    falconessId: f.id,
    baseStats: { ...BASE_600 },
    mood: 0,
    positionAptitude: { ...f.positionAptitude },
    frameId,
    parts: [],
    quirks: [],
    learnedSkills: [...f.uniqueSkills],
    durability: null,
  });
  const freeze = (runnerId: string, frameId: string, lane: number) =>
    ctx.port.freezeEntry(ctx.ruleset, ctx.content, input(runnerId, frameId), course, lane);
  return {
    races: [0, 1].map((sigLane) =>
      spec(course, job.seed, [
        freeze("signature", pair.signature, sigLane),
        freeze("generic", pair.generic, 1 - sigLane),
      ]),
    ),
  };
}

/** S4: every runner of the S1 field carries the skill; "off" disables it on all 8 (D49). */
function buildS4(
  ctx: BuildContext,
  job: Extract<Job, { scenario: "S4" }>,
  course: Course,
): RaceJobSpec {
  const skill = ctx.port.freezeSkill(ctx.content, job.skill);
  const on = neutralField(ctx, job.seed, { skills: [skill] });
  const off = on.map((e) => ctx.port.disableSkill(e, skill.id));
  return { races: [spec(course, job.seed, on), spec(course, job.seed, off)] };
}

/**
 * S5 and the quirk diagnostic: the carrier is the runner in lane `k mod 8`; race 0 gives it the
 * fixture build, race 1 is the plain field. Every other runner is identical in both.
 */
function buildCarrier(
  ctx: BuildContext,
  seed: string,
  k: number,
  course: Course,
  build: FixtureBuild,
): RaceJobSpec {
  const lanes = shuffledLanes(seed, FIELD_SIZE);
  const carrierRole = lanes.indexOf(k % FIELD_SIZE);
  const withPart = neutralField(ctx, seed, { carrier: { role: carrierRole, build } });
  const without = neutralField(ctx, seed);
  return {
    races: [spec(course, seed, withPart), spec(course, seed, without)],
    carrierRole,
  };
}

/**
 * S8: 8 neutral fixtures of one style, stats 600; the measured runner sits in lane `k mod 8` with
 * I ∈ {300, 510, 600, 630, 1000}, the others fill the remaining lanes in order. The five races of a
 * job share the seed, so adjacent-I differences are paired.
 */
function buildS8(
  ctx: BuildContext,
  job: Extract<Job, { scenario: "S8" }>,
  course: Course,
): RaceJobSpec {
  const measuredLane = job.k % FIELD_SIZE;
  const others = Array.from({ length: FIELD_SIZE }, (_, i) => i).filter((l) => l !== measuredLane);
  return {
    races: S8_INTELLIGENCE.map((intelligence) =>
      spec(
        course,
        job.seed,
        S8_ROLES.map((runnerId, role) =>
          role === 0
            ? fixture(
                ctx,
                runnerId,
                measuredLane,
                job.style,
                { ...STATS_600, intelligence },
                undefined,
                undefined,
              )
            : fixture(
                ctx,
                runnerId,
                others[role - 1] ?? role,
                job.style,
                STATS_600,
                undefined,
                undefined,
              ),
        ),
      ),
    ),
  };
}

/** Stat diagnostic: solo neutral hover at 600, then the same seed with the stat at 700. */
function buildStat(
  ctx: BuildContext,
  job: Extract<Job, { scenario: "stats" }>,
  course: Course,
): RaceJobSpec {
  const solo = (stats: RaceStats) =>
    spec(course, job.seed, [fixture(ctx, "solo", 0, "hover", stats, undefined, undefined)]);
  return {
    races: [solo(STATS_600), solo({ ...STATS_600, [job.stat]: STATS_600[job.stat] + 100 })],
  };
}

/** Races of one job (every scenario but S7, which plays seasons). */
export function buildRaceJob(
  ctx: BuildContext,
  job: Exclude<Job, { scenario: "S7" }>,
): RaceJobSpec {
  const course = ctx.content.getCourse(job.course);
  switch (job.scenario) {
    case "S1":
      return { races: [spec(course, job.seed, neutralField(ctx, job.seed))] };
    case "S2":
      return buildS2(ctx, job, course);
    case "S3":
      return buildS3(ctx, job, course);
    case "S4":
      return buildS4(ctx, job, course);
    case "S5":
      return buildCarrier(
        ctx,
        job.seed,
        job.k,
        course,
        ctx.port.fixtureBuild(ctx.content, [job.part], []),
      );
    case "quirks":
      return buildCarrier(
        ctx,
        job.seed,
        job.k,
        course,
        ctx.port.fixtureBuild(ctx.content, [], [job.quirk]),
      );
    case "S8":
      return buildS8(ctx, job, course);
    case "stats":
      return buildStat(ctx, job, course);
  }
}
