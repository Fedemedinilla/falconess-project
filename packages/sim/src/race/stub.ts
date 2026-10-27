import type { Rng } from "@falconess/rng";
import { scale } from "@falconess/rng";
import type { Course, FalconessStats } from "@falconess/schema";
import { courseLength } from "@falconess/schema";
import type { FrameBuild } from "../frame-build.js";
import type { Ruleset } from "../rulesets/index.js";
import { statTotal } from "../stats.js";

/**
 * TEMPORARY race resolver for phase 1 (ROADMAP D5). Ranks the player against a deterministic field
 * by a power score; replaced by simulateRace in phase 2 (D12) and never used by golden tests.
 * Power = Σ effective stats + powerToWeight bonus + style-match bonus, plus field noise.
 */
export type StubRaceResult = { place: number; fieldSize: number; timeTicks: number };

export function raceStub(
  ruleset: Ruleset,
  rng: Rng,
  course: Course,
  turn: number,
  effective: FalconessStats,
  build: FrameBuild,
  styleMatches: boolean,
): StubRaceResult {
  const K = ruleset.stubRace;
  const playerPower =
    statTotal(effective) +
    scale(K.powerToWeightBonus, build.powerToWeight) +
    (styleMatches ? K.styleMatchBonus : 0);
  // Rivals scale with the season: around 5 × (rivalBase + rivalPerTurn × turn) ± rivalNoise.
  const rivalBase = 5 * (K.rivalBase + K.rivalPerTurn * turn);
  let beaten = 0;
  const rivals = course.entries - 1;
  for (let i = 0; i < rivals; i++) {
    const noise = rng.nextRange("race", -K.rivalNoise, K.rivalNoise); // per-mille
    const rival = scale(rivalBase, 1000 + noise);
    if (rival > playerPower) beaten++;
  }
  const place = 1 + beaten;
  // Rough time: course length at ~20 m/s adjusted by power, in ticks of 1/15 s.
  const speedMms = scale(
    20_000,
    Math.max(700, Math.min(1300, Math.floor((playerPower * 1000) / Math.max(1, rivalBase)))),
  );
  const timeTicks = Math.floor((courseLength(course) * 1000 * 15) / speedMms);
  return { place, fieldSize: course.entries, timeTicks };
}
