/**
 * Deterministic stand-in for the race engine, for tests and for exercising `sim:batch` before
 * the real engine lands (`--engine fake`; the report says `engine: "fake"`). It is NOT a model of
 * the race: finish time is an integer formula of the entry (stats, PW, energy, style and rule
 * terms per segment type, enabled skills whose segment exists) plus a pace offset drawn from
 * `(seed, laneIndex)` only, exactly like the real engine's pre-drawn block (§17.1), so paired
 * ablations line up draw for draw. Optional coarse rounding of `finishMilli` forces dead heats.
 */
import { clamp, fnv1a32, Rng, toPermille, uPm, uRange } from "@falconess/rng";
import {
  type ContentIndex,
  type Course,
  courseLength,
  type RaceModifier,
  type SegmentType,
  type Slug,
} from "@falconess/schema";
import { effectiveStats, type Ruleset, resolveFrameBuild } from "@falconess/sim";
import type { GenerateFieldArgs, NeutralFixtureArgs, RaceEnginePort } from "./engine-port.js";
import type {
  EntryInput,
  FixtureBuild,
  RaceEntry,
  RaceLog,
  RaceResult,
  RaceSkill,
  RaceStats,
  SimulateOptions,
} from "./engine-types.js";

export type FakeEngineOptions = {
  /** Round `finishMilli` down to a multiple of this (1 = exact). Large values force dead heats. */
  tieGranularityMilli?: number;
  /** Half-width of the pace offset in ‰ (default 21: σ/mean ≈ 1.2 %). */
  paceHalfWidthPm?: number;
  /**
   * Busy-wait this many ms per race, scaled by runners / 8 (default 0). Lets `sim:batch` be timed
   * against the engine budget of §22 (≈ 5 ms per 8-runner race) before the engine exists.
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
): RaceLog {
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
    return { e, finishMilli, ticks, phaseTicks: [start, middle, ticks - start - middle] };
  });
  const ordered = [...rows].sort(
    (a, b) => a.finishMilli - b.finishMilli || a.e.laneIndex - b.e.laneIndex,
  );
  const results: RaceResult[] = ordered.map((r, i) => ({
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

function freezeSkill(content: ContentIndex, id: Slug): RaceSkill {
  const s = content.getSkill(id);
  if (s.kind !== "active") throw new Error(`freezeSkill: ${id} is a passive`);
  const t = s.trigger;
  const pos = t.positionRange;
  return {
    id: s.id,
    uniqueTo: s.uniqueTo ?? null,
    activationBasePm: toPermille(s.activationBase),
    trigger: {
      phase: t.phase,
      segment: t.segment ?? null,
      posLoPm: pos ? toPermille(pos[0]) : null,
      posHiPm: pos ? toPermille(pos[1]) : null,
      heatAboveMilli: t.heatAbove === undefined ? null : t.heatAbove * 1000,
      energyBelowMilli: t.energyBelow === undefined ? null : t.energyBelow * 1000,
      once: t.once,
    },
    effect: {
      speedMms: toPermille(s.effect.speed),
      accelMms2: toPermille(s.effect.accel),
      energyRefundMilli: s.effect.energyRefund * 1000,
      heatCoolMilli: s.effect.heatCool * 1000,
      durabilityGuard: s.effect.durabilityGuard,
      durationTicks: s.effect.durationTicks,
    },
    disabled: false,
  };
}

function statDeltaOf(modifiers: readonly RaceModifier[]): RaceStats {
  const d: RaceStats = { agility: 0, stamina: 0, technique: 0, courage: 0, intelligence: 0 };
  for (const m of modifiers) if (m.kind === "falconess-stat") d[m.stat] += m.delta;
  return d;
}

function addStats(a: RaceStats, b: RaceStats): RaceStats {
  const c = (x: number) => clamp(x, 1, 2000);
  return {
    agility: c(a.agility + b.agility),
    stamina: c(a.stamina + b.stamina),
    technique: c(a.technique + b.technique),
    courage: c(a.courage + b.courage),
    intelligence: c(a.intelligence + b.intelligence),
  };
}

function fixtureBuild(
  content: ContentIndex,
  parts: readonly Slug[],
  quirks: readonly Slug[],
): FixtureBuild {
  const sources = [
    ...parts.map((p) => content.getPart(p)),
    ...quirks.map((q) => content.getQuirk(q)),
  ];
  let pw = 1000;
  let energy = 100;
  let dissipation = 60;
  let durability = 100;
  const modifiers: RaceModifier[] = [];
  for (const s of sources) {
    pw += toPermille(s.mods.powerToWeight);
    energy += s.mods.energy;
    dissipation += s.mods.dissipation;
    durability += s.mods.durability;
    modifiers.push(...s.modifiers);
  }
  for (const m of modifiers) if (m.kind === "power-cap") pw = Math.min(pw, toPermille(m.max));
  return {
    parts: [...parts],
    quirks: [...quirks],
    powerToWeight: clamp(pw, 500, 1600),
    energy: clamp(energy, 20, 200),
    dissipation: clamp(dissipation, 20, 120),
    durabilityMax: clamp(durability, 20, 260),
    statDelta: statDeltaOf(modifiers),
    traits: { modifiers: modifiers.length },
  };
}

function neutralFixtureEntry(args: NeutralFixtureArgs): RaceEntry {
  const skills = [...(args.skills ?? [])];
  validateSkills(skills);
  const b = args.build;
  return {
    runnerId: args.runnerId,
    kind: "rival",
    falconessId: null,
    laneIndex: args.laneIndex,
    frameId: "fixture-neutral",
    manufacturer: "none",
    rule: "none",
    style: args.style,
    passive: null,
    parts: b ? [...b.parts] : [],
    quirks: b ? [...b.quirks] : [],
    mood: 0,
    biomeAptitude: "B",
    styleAptitude: "B",
    stats: b ? addStats(args.stats, b.statDelta) : { ...args.stats },
    powerToWeight: b?.powerToWeight ?? 1000,
    energy: b?.energy ?? 100,
    dissipation: b?.dissipation ?? 60,
    durabilityMax: b?.durabilityMax ?? 100,
    durabilityStart: b?.durabilityMax ?? 100,
    skills,
    traits: b?.traits ?? {},
  };
}

function freezeEntry(
  ruleset: Ruleset,
  content: ContentIndex,
  input: EntryInput,
  course: Course,
  laneIndex: number,
): RaceEntry {
  const fb = resolveFrameBuild(content, input.frameId, input.parts, input.quirks);
  const eff = effectiveStats(
    ruleset,
    input.baseStats,
    input.mood,
    input.biomeAptitude,
    input.styleAptitude,
    course.biome,
    fb.style,
  );
  const ids = [...new Set(input.learnedSkills)].sort();
  const skills = ids.map((id) => {
    const s = freezeSkill(content, id);
    if (s.uniqueTo !== null && s.uniqueTo !== input.falconessId)
      throw new Error(`freezeEntry: ${id} is unique to ${s.uniqueTo}`);
    return s;
  });
  const frame = content.getFrame(input.frameId);
  return {
    runnerId: input.runnerId,
    kind: input.kind,
    falconessId: input.falconessId,
    laneIndex,
    frameId: input.frameId,
    manufacturer: fb.manufacturer,
    rule: fb.rule,
    style: fb.style,
    passive: frame.passive ?? null,
    parts: [...input.parts],
    quirks: [...input.quirks],
    mood: input.mood,
    biomeAptitude: input.biomeAptitude[course.biome] ?? "B",
    styleAptitude: input.styleAptitude[fb.style] ?? "B",
    stats: addStats(eff, statDeltaOf(fb.modifiers)),
    powerToWeight: fb.powerToWeight,
    energy: fb.energy,
    dissipation: fb.dissipation,
    durabilityMax: fb.durabilityMax,
    durabilityStart: Math.min(fb.durabilityMax, input.durability ?? fb.durabilityMax),
    skills,
    traits: { modifiers: fb.modifiers.length },
  };
}

function disableSkill(entry: RaceEntry, skillId: Slug): RaceEntry {
  if (!entry.skills.some((s) => s.id === skillId))
    throw new Error(`disableSkill: ${entry.runnerId} does not carry ${skillId}`);
  return {
    ...entry,
    skills: entry.skills.map((s) => (s.id === skillId ? { ...s, disabled: true } : s)),
  };
}

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
    buildCourseGeometry: (_ruleset, course) => ({
      courseId: course.id,
      lengthMm: courseLength(course) * 1000,
    }),
    freezeEntry,
    generateField,
    simulateRace: (ruleset, entries, course, seed, opts) =>
      simulateRace(ruleset, entries, course, seed, opts, resolved),
    createRaceArena: () => ({ kind: "fake-arena" }),
    freezeSkill,
    neutralFixtureEntry,
    fixtureBuild,
    disableSkill,
  };
}
