/**
 * Runs one job: its races through the engine port (`detail: "results"`, the context's arena and
 * cached geometry) or, for S7, one season through the season engine with the reference policy.
 * Results are plain data keyed by job id, so any worker can run any job.
 */
import type { ContentIndex, Grade } from "@falconess/schema";
import {
  advanceSeason,
  buildCourseGeometry,
  type Ruleset,
  raceMaxTicks,
  type SimContext,
  seasonScore,
  startSeason,
  statTotal,
} from "@falconess/sim";
import { lowestStatPolicy, REFERENCE_HANGAR } from "../policy.js";
import type { Catalog } from "./catalog.js";
import type { RaceEnginePort } from "./engine-port.js";
import type { CourseGeometry, RaceArena } from "./engine-types.js";
import type { Job } from "./plan.js";
import { type BuildContext, buildRaceJob, type RaceSpec } from "./scenarios.js";

export type RaceRecord = {
  /** `finishMilli` per role (`null` = DNF). */
  finish: (number | null)[];
  /** `ledger.phaseTicks` per role (S1 only: the phase-split table). */
  phaseTicks?: number[][];
};

export type SeasonRecord = {
  grade: Grade;
  score: { stats: number; skills: number; races: number; total: number };
  goals: { turn: number; minPlace: number; place: number | null }[];
  goalRaces: number;
  /** `RaceResultEntry.engine` of the goal races (`v1` since the season runs the race engine, D12). */
  raceEngine: string;
};

export type JobResult = {
  id: number;
  races: RaceRecord[];
  frames?: string[];
  carrierRole?: number;
  season?: SeasonRecord;
  dnf: number;
};

export type Timing = {
  races: number;
  engineMs: number;
  seasons: number;
  seasonMs: number;
};

export type ExecContext = BuildContext & {
  arena: RaceArena;
  geometry: Map<string, CourseGeometry>;
  /** DNF guard per course id of the season's goal races (the season runs the real engine). */
  goalMaxTicks: Map<string, number>;
  timing: Timing;
  now: () => number;
};

export function emptyTiming(): Timing {
  return { races: 0, engineMs: 0, seasons: 0, seasonMs: 0 };
}

export function createExecContext(
  port: RaceEnginePort,
  ruleset: Ruleset,
  content: ContentIndex,
  catalog: Catalog,
  now: () => number = () => performance.now(),
): ExecContext {
  return {
    port,
    ruleset,
    content,
    catalog,
    arena: port.createRaceArena(),
    geometry: new Map(),
    goalMaxTicks: new Map(),
    timing: emptyTiming(),
    now,
  };
}

function runRace(ctx: ExecContext, race: RaceSpec, withPhases: boolean): RaceRecord {
  let geometry = ctx.geometry.get(race.course.id);
  if (!geometry) {
    geometry = ctx.port.buildCourseGeometry(ctx.ruleset, race.course);
    ctx.geometry.set(race.course.id, geometry);
  }
  const t0 = ctx.now();
  const log = ctx.port.simulateRace(ctx.ruleset, race.entries, race.course, race.seed, {
    detail: "results",
    arena: ctx.arena,
    geometry,
  });
  ctx.timing.engineMs += ctx.now() - t0;
  ctx.timing.races += 1;
  const byId = new Map(log.results.map((r) => [r.runnerId, r]));
  const rows = race.roles.map((id) => {
    const r = byId.get(id);
    if (!r) throw new Error(`race ${race.seed}: no result for runner ${id}`);
    return r;
  });
  const record: RaceRecord = { finish: rows.map((r) => (r.dnf ? null : r.finishMilli)) };
  if (withPhases) record.phaseTicks = rows.map((r) => [...r.ledger.phaseTicks]);
  return record;
}

/**
 * Player DNFs of a season's goal races: the season records a DNF as last place with the course's
 * `maxTicks` (docs/race-engine.md 21.2 step 4), a time no healthy finisher comes near (the guard
 * is 8 ticks per metre + 2400). Rival DNFs never reach the season state, so the batch cannot
 * count them (the S7 note says so).
 */
function goalDnfs(
  ctx: ExecContext,
  s: { raceResults: readonly { courseId: string; timeTicks: number }[] },
): number {
  let dnf = 0;
  for (const r of s.raceResults) {
    let maxTicks = ctx.goalMaxTicks.get(r.courseId);
    if (maxTicks === undefined) {
      const geometry = buildCourseGeometry(ctx.ruleset, ctx.content.getCourse(r.courseId));
      maxTicks = raceMaxTicks(ctx.ruleset, geometry);
      ctx.goalMaxTicks.set(r.courseId, maxTicks);
    }
    if (r.timeTicks >= maxTicks) dnf++;
  }
  return dnf;
}

function runSeason(
  ctx: ExecContext,
  job: Extract<Job, { scenario: "S7" }>,
): { season: SeasonRecord; dnf: number } {
  const sim: SimContext = { ruleset: ctx.ruleset, content: ctx.content };
  const t0 = ctx.now();
  let s = startSeason(sim, job.seed, {
    kind: "start",
    falconessId: job.falconess,
    hangar: [...REFERENCE_HANGAR],
    parents: [],
  });
  while (s.status === "active") s = advanceSeason(sim, s, lowestStatPolicy(sim, s));
  ctx.timing.seasonMs += ctx.now() - t0;
  ctx.timing.seasons += 1;
  if (s.grade === undefined) throw new Error(`season ${job.seed} ended without a grade`);
  const stats = statTotal(s.stats);
  const skills = s.learnedSkills.length * ctx.ruleset.season.scorePerSkill;
  const total = seasonScore(sim, s);
  const goals = ctx.content.getFalconess(job.falconess).seasonGoals.map((g) => ({
    turn: g.turn,
    minPlace: g.minPlace,
    place: s.raceResults.find((r) => r.turn === g.turn)?.place ?? null,
  }));
  const season: SeasonRecord = {
    grade: s.grade,
    score: { stats, skills, races: total - stats - skills, total },
    goals,
    goalRaces: s.raceResults.length,
    raceEngine: s.raceResults[0]?.engine ?? "none",
  };
  return { season, dnf: goalDnfs(ctx, s) };
}

export function runJob(ctx: ExecContext, job: Job): JobResult {
  if (job.scenario === "S7") return { id: job.id, races: [], ...runSeason(ctx, job) };
  const spec = buildRaceJob(ctx, job);
  const races = spec.races.map((r) => runRace(ctx, r, job.scenario === "S1"));
  let dnf = 0;
  for (const r of races) for (const t of r.finish) if (t === null) dnf++;
  const out: JobResult = { id: job.id, races, dnf };
  if (spec.frames !== undefined) out.frames = spec.frames;
  if (spec.carrierRole !== undefined) out.carrierRole = spec.carrierRole;
  return out;
}
