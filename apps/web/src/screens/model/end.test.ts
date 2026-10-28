import type { RunInput, SeasonState } from "@falconess/schema";
import { advanceSeason, blackBoxFor, RULESET_V1, startSeason } from "@falconess/sim";
import { describe, expect, it } from "vitest";
import { getContent } from "../../content/load";
import { seasonSummary } from "./end";

const ctx = { ruleset: RULESET_V1, content: getContent() };
const START: RunInput = {
  kind: "start",
  falconessId: "cernicala",
  hangar: ["nimbus", "horizon", "falke", "mule"],
  parents: [],
};

function policy(s: SeasonState): RunInput {
  if (s.pendingEvent) return { kind: "event:choose", option: 0 };
  if (s.fatigue >= 60) return { kind: "rest" };
  const kinds = ["train:agility", "train:stamina", "train:technique", "train:simulator"] as const;
  return { kind: kinds[s.turn % kinds.length] ?? "train:agility" };
}

describe("season summary", () => {
  it("reads grade, score, ladder, feathers, start stats and black box from the sim", () => {
    if (START.kind !== "start") throw new Error("fixture");
    const inputs: RunInput[] = [START];
    let s = startSeason(ctx, "end-1", START);
    while (s.status === "active") {
      const input = policy(s);
      s = advanceSeason(ctx, s, input);
      inputs.push(input);
    }
    const summary = seasonSummary(ctx, s, "end-1", inputs);
    expect(summary.grade).toBe(s.grade);
    expect(summary.endReason).toBe(s.endReason);
    expect(summary.ladder.map((r) => r.grade)).toEqual([
      "G",
      "F",
      "E",
      "D",
      "C",
      "B",
      "A",
      "S",
      "SS",
    ]);
    const step = summary.ladder.find((r) => r.grade === summary.grade);
    expect(summary.score).toBeGreaterThanOrEqual(step?.min ?? Number.POSITIVE_INFINITY);
    expect(summary.feathers).toBe(ctx.content.economy?.feathersByGrade[summary.grade]);
    expect(summary.startStats).toEqual(ctx.content.getFalconess("cernicala").baseStats);
    expect(summary.blackBox).toEqual(blackBoxFor(ctx, s, inputs));
    if (s.endReason === "goal-failed") {
      expect(summary.cap).toBe(RULESET_V1.season.gradeCapOnGoalFailure);
      expect(summary.failedTurn).toBe(s.raceResults.at(-1)?.turn);
    } else {
      expect(summary.cap).toBeUndefined();
      expect(summary.failedTurn).toBeUndefined();
    }
  });
});
