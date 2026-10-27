import type { Rng } from "@falconess/rng";
import type { RaceOutcome } from "@falconess/schema";
import { resolveFrameBuild } from "../frame-build.js";
import { raceStub } from "../race/stub.js";
import { effectiveStats } from "../stats.js";
import { type Draft, note, type SimContext } from "./context.js";

export function goalForTurn(ctx: SimContext, d: Draft) {
  return ctx.content.getFalconess(d.falconessId).seasonGoals.find((g) => g.turn === d.turn);
}

/** Run this turn's goal race (if any). Returns the outcome or undefined when no race was due. */
export function runGoalRace(ctx: SimContext, d: Draft, rng: Rng): RaceOutcome | undefined {
  const goal = goalForTurn(ctx, d);
  if (!goal) return undefined;
  const falconess = ctx.content.getFalconess(d.falconessId);
  const course = ctx.content.getCourse(goal.courseId);
  const build = resolveFrameBuild(
    ctx.content,
    d.equippedFrame,
    d.installedParts,
    d.frameQuirks[d.equippedFrame] ?? [],
  );
  const eff = effectiveStats(
    ctx.ruleset,
    d.stats,
    d.mood,
    d.biomeAptitude,
    d.styleAptitude,
    course.biome,
    build.style,
  );
  const res = raceStub(
    ctx.ruleset,
    rng,
    course,
    d.turn,
    eff,
    build,
    build.style === falconess.preferredStyle,
  );

  d.raceResults.push({
    courseId: course.id,
    turn: d.turn,
    place: res.place,
    fieldSize: res.fieldSize,
    timeTicks: res.timeTicks,
    frameId: d.equippedFrame,
    engine: "stub",
  });
  d.wallet.scrap += ctx.ruleset.season.scrapByPlace[res.place - 1] ?? 10;
  note(d, "log.race");

  const outcome: RaceOutcome =
    res.place > goal.minPlace
      ? "goal-failed"
      : res.place === 1
        ? "win"
        : res.place <= 3
          ? "podium"
          : "lose";
  d.lastRace = { turn: d.turn, outcome };
  return outcome;
}
