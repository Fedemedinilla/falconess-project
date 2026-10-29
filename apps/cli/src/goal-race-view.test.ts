import { loadContent } from "@falconess/content";
import type { RunInput, SeasonState } from "@falconess/schema";
import {
  advanceSeason,
  RULESET_V1,
  RULESET_V2,
  type SimContext,
  startSeason,
} from "@falconess/sim";
import { describe, expect, it } from "vitest";
import { goalRaceLog, goalRaceView } from "./goal-race-view.js";
import { REFERENCE_HANGAR, referencePolicy } from "./policy.js";
import { ADVICE_FROM_PLACE, NO_ADVICE } from "./race/render-race.js";

const ctx: SimContext = { ruleset: RULESET_V1, content: loadContent() };

/** The first goal race of a reference season: the state before it, its input and the result. */
function firstGoalRace(falconessId: string, seed = `view-${falconessId}`, at: SimContext = ctx) {
  let s: SeasonState = startSeason(at, seed, {
    kind: "start",
    falconessId,
    hangar: [...REFERENCE_HANGAR],
    parents: [],
  });
  for (;;) {
    const input: RunInput = referencePolicy(at, s);
    const next = advanceSeason(at, s, input);
    const result = next.raceResults.at(-1);
    if (result && next.raceResults.length > s.raceResults.length)
      return { before: s, input, result };
    if (next.status === "ended") throw new Error("no goal race");
    s = next;
  }
}

describe("pnpm play goal-race view", () => {
  it.each([RULESET_V1, RULESET_V2])(
    "rebuilds the season's race with detail full: same place and time (P7, $version)",
    (ruleset) => {
      const at: SimContext = { ruleset, content: ctx.content };
      for (const who of ["peregrina", "cernicala", "caracara"]) {
        const { before, input, result } = firstGoalRace(who, `view-${who}`, at);
        const log = goalRaceLog(at, before, input);
        expect(log?.detail).toBe("full");
        const me = log?.results.find((r) => r.runnerId === "player");
        expect(me?.place).toBe(result.place);
        expect(me?.timeTicks).toBe(result.timeTicks);
        expect(log?.courseId).toBe(result.courseId);
      }
    },
  );

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

  it("tells the player what to train after a goal race she finished 3rd or worse", () => {
    const tip = /^ {2}¡.+! Quizás deberías (entrenar|pasar por el) /;
    const lost = firstGoalRace("caracara", "a");
    expect(lost.result.place).toBeGreaterThanOrEqual(ADVICE_FROM_PLACE);
    const lines = goalRaceView(ctx, lost.before, lost.input);
    expect(lines.filter((l) => tip.test(l)).length).toBeGreaterThan(0);
    // a 4th place with better stats than the winner: nothing a stat would fix
    const unlucky = firstGoalRace("peregrina");
    expect(unlucky.result.place).toBeGreaterThanOrEqual(ADVICE_FROM_PLACE);
    expect(goalRaceView(ctx, unlucky.before, unlucky.input).at(-1)).toBe(`  ${NO_ADVICE}`);
    const won = firstGoalRace("caracara");
    expect(won.result.place).toBeLessThan(ADVICE_FROM_PLACE);
    const quiet = goalRaceView(ctx, won.before, won.input).join("\n");
    expect(quiet).not.toContain("Quizás deberías");
    expect(quiet).not.toContain(NO_ADVICE);
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
