import { clamp, toPermille } from "@falconess/rng";
import type {
  ContentIndex,
  Course,
  EntryInput,
  RaceEntry,
  RaceSkill,
  RaceStats,
  Slug,
} from "@falconess/schema";
import { STAT_NAMES } from "@falconess/schema";
import { resolveFrameBuild } from "../frame-build.js";
import type { Ruleset } from "../rulesets/index.js";
import { effectiveStats } from "../stats.js";
import { compileTraits, statDeltas } from "./modifiers.js";

/**
 * Freeze one active skill for the race (docs/race-engine.md 3.2). Content decimals become ‰ or
 * milli-units here, with `toPermille` as the only rounding: `positionRange` → ‰; `heatAbove`,
 * `energyBelow`, `energyRefund`, `heatCool` × 1000; `speed` m/s → mm/s; `accel` m/s² → mm/s²;
 * `activationBase` → ‰. A passive id throws. `uniqueTo` is copied, not checked (freezeEntry
 * checks it), so the batch can measure a unique skill on a neutral fixture. `disabled` is false.
 */
export function freezeSkill(content: ContentIndex, id: Slug): RaceSkill {
  const skill = content.getSkill(id);
  if (skill.kind !== "active") throw new Error(`skill "${id}" is passive: it never enters a race`);
  const { trigger: tr, effect: ef } = skill;
  return {
    id: skill.id,
    uniqueTo: skill.uniqueTo ?? null,
    activationBasePm: toPermille(skill.activationBase),
    trigger: {
      phase: tr.phase,
      segment: tr.segment ?? null,
      posLoPm: tr.positionRange ? toPermille(tr.positionRange[0]) : null,
      posHiPm: tr.positionRange ? toPermille(tr.positionRange[1]) : null,
      heatAboveMilli: tr.heatAbove !== undefined ? tr.heatAbove * 1000 : null,
      energyBelowMilli: tr.energyBelow !== undefined ? tr.energyBelow * 1000 : null,
      once: tr.once,
    },
    effect: {
      speedMms: toPermille(ef.speed),
      accelMms2: toPermille(ef.accel),
      energyRefundMilli: ef.energyRefund * 1000,
      heatCoolMilli: ef.heatCool * 1000,
      durabilityGuard: ef.durabilityGuard,
      durationTicks: ef.durationTicks,
    },
    disabled: false,
  };
}

/** Plain string order ("id order", 0.1); never locale-dependent. */
export function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** `clamp(stat + delta, 1, R.maxEffectiveStat)` per stat (3.1 step 3). */
export function addStatDeltas(ruleset: Ruleset, stats: RaceStats, delta: RaceStats): RaceStats {
  const out = { ...stats };
  for (const k of STAT_NAMES) out[k] = clamp(stats[k] + delta[k], 1, ruleset.race.maxEffectiveStat);
  return out;
}

/**
 * Freeze one runner for a race on `course` (docs/race-engine.md 3.1; content side, outside the
 * pure race): frame build, effective stats with the course biome and the frame's style,
 * `falconess-stat` deltas, id-sorted frozen actives, compiled traits and starting durability.
 * Always writes the frame manufacturer's rule; only the fixtures of 3.4 write "none".
 */
export function freezeEntry(
  ruleset: Ruleset,
  content: ContentIndex,
  input: EntryInput,
  course: Course,
  laneIndex: number,
): RaceEntry {
  const lanes = ruleset.race.maxRunners;
  if (!Number.isInteger(laneIndex) || laneIndex < 0 || laneIndex >= lanes)
    throw new Error(`laneIndex ${laneIndex} outside 0..${lanes - 1}`);

  // 1. frame build (telemetry PW cap, power-cap, clamps)
  const fb = resolveFrameBuild(content, input.frameId, input.parts, input.quirks);
  const frame = content.getFrame(input.frameId);

  // 2. effective stats: mood on all five, biome letter on agility, frame-style letter on intelligence
  const eff = effectiveStats(
    ruleset,
    input.baseStats,
    input.mood,
    input.biomeAptitude,
    input.styleAptitude,
    course.biome,
    fb.style,
  );

  // 3. falconess-stat deltas after step 2, clamped to [1, maxEffectiveStat]
  const stats = addStatDeltas(ruleset, eff, statDeltas(fb.modifiers));

  // 4. skills: actives only, uniqueTo must match, deduplicated, id order, at most maxSkills
  const ids = [...new Set(input.learnedSkills)].sort(compareIds);
  if (ids.length > ruleset.race.maxSkills)
    throw new Error(
      `${input.runnerId}: ${ids.length} actives, at most ${ruleset.race.maxSkills} per race`,
    );
  const skills = ids.map((id) => {
    const s = freezeSkill(content, id);
    if (s.uniqueTo !== null && s.uniqueTo !== input.falconessId)
      throw new Error(`${input.runnerId}: skill "${id}" is unique to "${s.uniqueTo}"`);
    return s;
  });

  // 5. traits; 6. starting durability
  const traits = compileTraits(fb.modifiers);
  const durabilityStart = Math.min(fb.durabilityMax, input.durability ?? fb.durabilityMax);

  return {
    runnerId: input.runnerId,
    kind: input.kind,
    falconessId: input.falconessId,
    laneIndex,
    frameId: fb.frameId,
    manufacturer: fb.manufacturer,
    rule: fb.rule,
    style: fb.style,
    passive: frame.passive ?? null,
    parts: [...fb.parts],
    quirks: [...fb.quirks],
    mood: input.mood,
    biomeAptitude: input.biomeAptitude[course.biome],
    styleAptitude: input.styleAptitude[fb.style],
    stats,
    powerToWeight: fb.powerToWeight,
    energy: fb.energy,
    dissipation: fb.dissipation,
    durabilityMax: fb.durabilityMax,
    durabilityStart,
    skills,
    traits,
  };
}
