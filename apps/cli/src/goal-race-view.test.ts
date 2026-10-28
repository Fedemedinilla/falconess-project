import { loadContent } from "@falconess/content";
import type { RunInput, SeasonState } from "@falconess/schema";
import { advanceSeason, RULESET_V1, type SimContext, startSeason } from "@falconess/sim";
import { describe, expect, it } from "vitest";
import { goalRaceLog, goalRaceView } from "./goal-race-view.js";
import { lowestStatPolicy, REFERENCE_HANGAR } from "./policy.js";

const ctx: SimContext = { ruleset: RULESET_V1, content: loadContent() };

/** The first goal race of a reference season: the state before it, its input and the result. */
function firstGoalRace(falconessId: string) {
  let s: SeasonState = startSeason(ctx, `view-${falconessId}`, {
    kind: "start",
    falconessId,
    hangar: [...REFERENCE_HANGAR],
    parents: [],
  });
  for (;;) {
    const input: RunInput = lowestStatPolicy(ctx, s);
    const next = advanceSeason(ctx, s, input);
    const result = next.raceResults.at(-1);
    if (result && next.raceResults.length > s.raceResults.length)
      return { before: s, input, result };
    if (next.status === "ended") throw new Error("no goal race");
    s = next;
  }
}

describe("pnpm play goal-race view", () => {
  it("rebuilds the season's race with detail full: same place and time (P7)", () => {
    for (const who of ["peregrina", "cernicala", "caracara"]) {
      const { before, input, result } = firstGoalRace(who);
      const log = goalRaceLog(ctx, before, input);
      expect(log?.detail).toBe("full");
      const me = log?.results.find((r) => r.runnerId === "player");
      expect(me?.place).toBe(result.place);
      expect(me?.timeTicks).toBe(result.timeTicks);
      expect(log?.courseId).toBe(result.courseId);
    }
  });

  it("prints the classification and the player's phases, gains and time sinks", () => {
    const { before, input, result } = firstGoalRace("peregrina");
    const lines = goalRaceView(ctx, before, input);
    expect(lines[0]).toBe("  CLASIFICACIÓN");
    expect(lines.filter((l) => /^\s+»?\d+\s/.test(l))).toHaveLength(8);
    expect(lines.some((l) => l.includes(`»${result.place}`))).toBe(true);
    expect(lines.some((l) => l.trimStart().startsWith(`${result.place}º Peregrina`))).toBe(true);
    for (const row of ["fases", "ganancias", "pérdidas"])
      expect(lines.some((l) => l.trimStart().startsWith(row))).toBe(true);
    expect(lines.some((l) => l.trimStart().startsWith("tramos"))).toBe(false);
  });

  it("prints nothing for a step without a goal race", () => {
    const s = startSeason(ctx, "quiet", {
      kind: "start",
      falconessId: "peregrina",
      hangar: [...REFERENCE_HANGAR],
      parents: [],
    });
    expect(goalRaceView(ctx, s, { kind: "rest" })).toEqual([]);
  });
});
