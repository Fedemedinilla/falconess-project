/**
 * Deterministic stand-in for the race, for the batch's unit tests and for timing the batch itself
 * (`--engine fake`; the report says `engine: "fake"`). Only `simulateRace` (and `generateField`)
 * are fake: the content side (`freezeEntry`, `freezeSkill`, `neutralFixtureEntry`, `fixtureBuild`,
 * `disableSkill`, `buildCourseGeometry`, `createRaceArena`) is the real engine's, so the entries
 * the batch builds are the real ones. `simulateRace` is NOT a model of the race: finish time is an
 * integer formula of the entry (stats, PW, energy, style and rule terms per segment type, enabled
 * skills whose segment exists) plus a pace offset drawn from `(seed, laneIndex)` only, exactly like
 * the real engine's pre-drawn block (§17.1), so paired ablations line up draw for draw. Optional
 * coarse rounding of `finishMilli` forces dead heats.
 */
import { fnv1a32, Rng, uPm, uRange } from "@falconess/rng";
import { type ContentIndex, type Course, courseLength, type SegmentType } from "@falconess/schema";
import {
  buildCourseGeometry,
  createRaceArena,
  disableSkill,
  fixtureBuild,
  freezeEntry,
  freezeSkill,
  neutralFixtureEntry,
  type Ruleset,
} from "@falconess/sim";
import type { GenerateFieldArgs, RaceEnginePort } from "./engine-port.js";
import type {
  BatchRaceLog,
  BatchRaceResult,
  RaceEntry,
  RaceSkill,
  SimulateOptions,
} from "./engine-types.js";

export type FakeEngineOptions = {
  /** Round `finishMilli` down to a multiple of this (1 = exact). Large values force dead heats. */
  tieGranularityMilli?: number;
  /** Half-width of the pace offset in ‰ (default 21: σ/mean ≈ 1.2 %). */
  paceHalfWidthPm?: number;
  /**
   * Busy-wait this many ms per race, scaled by runners / 8 (default 0). Lets `sim:batch` be timed
   * against the engine budget of §22 (≈ 5 ms per 8-runner race) without the real engine.
   */
  costMsPer8Runners?: number;
};

function burn(ms: number): void {
  const end = performance.now() + ms;
  let spins = 0;
  while (performance.now() < end) spins++;
  if (spins < 0) throw new Error("unreachable");
}

const DRAWS_PER_RUNNER = 12;
const MAX_RUNNERS = 8;

type Weights = Partial<Record<SegmentType, number>>;

/** mm/s per unit share of the course, by style (arbitrary but structured: one niche each). */
const STYLE_TERMS: Record<RaceEntry["style"], Weights> = {
  dive: { descent: 900, flat: 150 },
  hover: { canyon: 500, flat: 100, curves: 150 },
  glide: { climb: 600, flat: 200 },
  ground: { jump: 4000, curves: 300, water: 300 },
};

/** mm/s per unit share of the course, by rule; `trait` bonuses are added separately. */
const RULE_TERMS: Record<RaceEntry["rule"], Weights> = {
  pulse: { descent: 500, water: -2500, flat: 150 },
  regen: { flat: 200, jump: -4000 },
  telemetry: {},
  repairable: { jump: 6000, curves: -1500 },
  "mass-thrust": { flat: -150, canyon: -150 },
  none: {},
};

function segmentShareTerm(course: Course, weights: Weights): number {
  const total = courseLength(course);
  let sum = 0;
  for (const seg of course.segments) sum += (weights[seg.type] ?? 0) * seg.length;
  return Math.trunc(sum / total);
}

function ruleTerm(rule: RaceEntry["rule"], course: Course): number {
  let v = segmentShareTerm(course, RULE_TERMS[rule]);
  if (rule === "telemetry") {
    if (course.traits.includes("long")) v += 600;
    if (course.traits.includes("sprint")) v -= 900;
  }
  if (rule === "mass-thrust" && course.biome === "desert") v -= 200;
  if (rule === "pulse" && course.biome === "desert") v += 200;
  return v;
}

function hasSegment(course: Course, type: SegmentType | null): boolean {
  return type === null || course.segments.some((s) => s.type === type);
}

function skillGainMm(skill: RaceSkill, course: Course, u: number, intelligence: number): number {
  if (skill.disabled || !hasSegment(course, skill.trigger.segment)) return 0;
  const p = Math.floor((skill.activationBasePm * Math.min(1000, 300 + intelligence)) / 1000);
  if (uPm(u) >= p) return 0;
  const e = skill.effect;
  return (
    Math.floor((e.speedMms * e.durationTicks) / 15) +
    Math.floor((e.accelMms2 * e.durationTicks) / 20) +
    Math.floor(e.energyRefundMilli / 40) +
    Math.floor(e.heatCoolMilli / 80) +
    (e.durabilityGuard ? 300 : 0)
  );
}

/** A small, fixed, id-derived speed term per frame passive (signature vs generic differ in S3). */
function passiveTerm(passive: string | null): number {
  if (passive === null) return 0;
  return ((fnv1a32(passive) % 41) - 20) * 3;
}

function speedMms(e: RaceEntry, course: Course): number {
  const s = e.stats;
  const long = courseLength(course) >= 2000 ? 1 : 0;
  const v =
    20_000 +
    4 * (s.agility - 600) +
    12 * (e.powerToWeight - 1000) +
    (s.intelligence - 600) +
    Math.floor((s.technique - 600) / 2) +
    long * Math.floor((s.stamina - 600) / 2) +
    Math.floor((s.courage - 600) / 4) +
    3 * (e.energy - 100) +
    (e.dissipation - 60) +
    segmentShareTerm(course, STYLE_TERMS[e.style]) +
    ruleTerm(e.rule, course) +
    passiveTerm(e.passive);
  return Math.max(5000, v);
}

function validate(entries: readonly RaceEntry[]): void {
  const n = entries.length;
  if (n < 1 || n > MAX_RUNNERS) throw new Error(`fake engine: ${n} runners`);
  const lanes = new Set(entries.map((e) => e.laneIndex));
  for (let i = 0; i < n; i++) if (!lanes.has(i)) throw new Error("fake engine: lanes not 0..n-1");
  if (new Set(entries.map((e) => e.runnerId)).size !== n)
    throw new Error("fake engine: duplicate runnerId");
  for (const e of entries) validateSkills(e.skills);
}

function validateSkills(skills: readonly RaceSkill[]): void {
  if (skills.length > MAX_RUNNERS) throw new Error("fake engine: more than 8 skills");
  for (let i = 1; i < skills.length; i++) {
    const a = skills[i - 1]?.id ?? "";
    const b = skills[i]?.id ?? "";
    if (!(a < b)) throw new Error("fake engine: skills must be unique and id-sorted");
  }
}

function simulateRace(
  ruleset: Ruleset,
  entries: readonly RaceEntry[],
  course: Course,
  seed: string,
  opts: SimulateOptions | undefined,
  options: Required<FakeEngineOptions>,
): BatchRaceLog {
  validate(entries);
  if (options.costMsPer8Runners > 0) burn((options.costMsPer8Runners * entries.length) / 8);
  const byLane = [...entries].sort((a, b) => a.laneIndex - b.laneIndex);
  const rng = new Rng(seed);
  const lengthMm = courseLength(course) * 1000;
  const W = options.paceHalfWidthPm;
  const g = options.tieGranularityMilli;
  const rows = byLane.map((e) => {
    const u: number[] = [];
    for (let i = 0; i < DRAWS_PER_RUNNER; i++) u.push(rng.nextU32("race"));
    const pace = uRange(u[0] ?? 0, -W, W);
    let gain = 0;
    e.skills.forEach((skill, j) => {
      gain += skillGainMm(skill, course, u[1 + j] ?? 0, e.stats.intelligence);
    });
    const v = Math.floor((speedMms(e, course) * (1000 + pace)) / 1000);
    const exact = Math.floor(((lengthMm - gain) * 15_000) / v);
    const finishMilli = g > 1 ? Math.floor(exact / g) * g : exact;
    const ticks = Math.ceil(finishMilli / 1000);
    const start = Math.floor(ticks / 6);
    const middle = Math.floor(ticks / 2);
    const phaseTicks: [number, number, number] = [start, middle, ticks - start - middle];
    return { e, finishMilli, ticks, phaseTicks };
  });
  const ordered = [...rows].sort(
    (a, b) => a.finishMilli - b.finishMilli || a.e.laneIndex - b.e.laneIndex,
  );
  const results: BatchRaceResult[] = ordered.map((r, i) => ({
    lane: r.e.laneIndex,
    runnerId: r.e.runnerId,
    place: i + 1,
    finishMilli: r.finishMilli,
    timeTicks: r.ticks,
    deadHeat: rows.some((o) => o !== r && o.finishMilli === r.finishMilli),
    dnf: false,
    ledger: { phaseTicks: r.phaseTicks },
  }));
  if (opts?.arena) arenaUses.set(opts.arena, (arenaUses.get(opts.arena) ?? 0) + 1);
  return {
    rulesetVersion: ruleset.version,
    seed,
    courseId: course.id,
    detail: opts?.detail ?? "full",
    results,
  };
}

/** Test hook: how many races each arena served (proves the batch reuses one per worker). */
export const arenaUses = new WeakMap<object, number>();

function generateField(
  ruleset: Ruleset,
  content: ContentIndex,
  args: GenerateFieldArgs,
): RaceEntry[] {
  const frng = new Rng(`${args.raceSeed}/field`);
  const n = args.course.entries;
  const playerLane = frng.nextInt("race", n);
  const out: RaceEntry[] = [];
  let k = 0;
  for (let lane = 0; lane < n; lane++) {
    if (lane === playerLane) {
      out.push(freezeEntry(ruleset, content, args.player, args.course, lane));
      continue;
    }
    k += 1;
    const total = 95 + 9 * args.turn;
    out.push(
      neutralFixtureEntry({
        runnerId: `rival-${k}`,
        laneIndex: lane,
        style: "hover",
        stats: {
          agility: total,
          stamina: total,
          technique: total,
          courage: total,
          intelligence: total,
        },
      }),
    );
  }
  return out;
}

export function createFakeEngine(options: FakeEngineOptions = {}): RaceEnginePort {
  const resolved: Required<FakeEngineOptions> = {
    tieGranularityMilli: options.tieGranularityMilli ?? 1,
    paceHalfWidthPm: options.paceHalfWidthPm ?? 21,
    costMsPer8Runners: options.costMsPer8Runners ?? 0,
  };
  return {
    engineId: "fake",
    buildCourseGeometry,
    freezeEntry,
    generateField,
    simulateRace: (ruleset, entries, course, seed, opts) =>
      simulateRace(ruleset, entries, course, seed, opts, resolved),
    createRaceArena,
    freezeSkill,
    neutralFixtureEntry,
    fixtureBuild,
    disableSkill,
  };
}
