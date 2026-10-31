import { fnv1a32 } from "@falconess/rng";
import type { Aptitude, BlackBox, Grade, RunInput, Style } from "@falconess/schema";
import { aptitudeRank, highestStat, statTotal } from "../stats.js";
import type { Draft, SimContext } from "./context.js";

export function seasonScore(ctx: SimContext, d: Draft): number {
  const S = ctx.ruleset.season;
  let score = statTotal(d.stats) + d.learnedSkills.length * S.scorePerSkill;
  for (const r of d.raceResults) {
    if (r.place === 1) score += S.scoreWinBonus;
    else if (r.place <= 3) score += S.scorePodiumBonus;
  }
  return score;
}

export function gradeFor(ctx: SimContext, d: Draft): Grade {
  const score = seasonScore(ctx, d);
  let grade: Grade = "G";
  for (const [g, min] of ctx.ruleset.season.gradeThresholds) {
    if (score >= min) {
      grade = g;
      break;
    }
  }
  if (d.endReason === "goal-failed") {
    const order: Grade[] = ["G", "F", "E", "D", "C", "B", "A", "S", "SS"];
    const cap = order.indexOf(ctx.ruleset.season.gradeCapOnGoalFailure);
    if (order.indexOf(grade) > cap) grade = order[cap] ?? "C";
  }
  return grade;
}

export function stableInputsHash(inputs: readonly RunInput[]): string {
  return fnv1a32(JSON.stringify(inputs)).toString(16).padStart(8, "0");
}

/** Inheritance record (BRIEF §8, caja negra). Produced once at season end. */
export function createBlackBox(ctx: SimContext, d: Draft, inputs: readonly RunInput[]): BlackBox {
  const stat = highestStat(d.stats);
  const v = d.stats[stat];
  const stars = v >= 1000 ? 3 : v >= 800 ? 2 : 1;

  let best: BlackBox["factors"]["aptitude"] | undefined;
  const consider = (key: Style, letter: Aptitude) => {
    const s = letter === "S" ? 3 : letter === "A" ? 2 : 1;
    if (!best || aptitudeRank(letter) > aptitudeRank(best.letter))
      best = { kind: "style", key, letter, stars: s };
  };
  for (const [k, l] of Object.entries(d.styleAptitude) as [Style, Aptitude][]) consider(k, l);

  const wins = new Map<string, number>();
  for (const r of d.raceResults) {
    if (r.place === 1) wins.set(r.frameId, (wins.get(r.frameId) ?? 0) + 1);
  }
  let affinityFrame = d.equippedFrame;
  let max = 0;
  for (const [f, n] of wins) {
    if (n > max) {
      max = n;
      affinityFrame = f;
    }
  }
  const grade = d.grade ?? gradeFor(ctx, d);
  return {
    id: `${d.seed}:${stableInputsHash(inputs)}`,
    rulesetVersion: d.rulesetVersion,
    falconessId: d.falconessId,
    grade,
    factors: {
      stat: { stat, stars },
      aptitude: best ?? {
        kind: "style",
        key: ctx.content.getFalconess(d.falconessId).preferredStyle,
        letter: "B",
        stars: 1,
      },
      skills: d.learnedSkills
        .filter((s) => ctx.content.getSkill(s).uniqueTo === undefined)
        .slice(0, 3),
      frameAffinity: ctx.content.getFrame(affinityFrame).manufacturer,
    },
    seed: d.seed,
    inputsHash: stableInputsHash(inputs),
  };
}
