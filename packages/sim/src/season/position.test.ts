import { loadContent } from "@falconess/content";
import {
  BlackBox,
  DEFAULT_POSITION,
  POSITIONS,
  type Position,
  RunInput,
  type SeasonState,
} from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { simulateRace } from "../race/engine.js";
import { goalRaceSetup, PLAYER_RUNNER_ID } from "../race/field.js";
import { CURRENT_RULESET, RULESET_V1 } from "../rulesets/index.js";
import { advanceSeason, goalRaceState, InvalidInputError } from "./advance.js";
import type { SimContext } from "./context.js";
import { goalForTurn, inputPosition } from "./goals.js";
import { createBlackBox } from "./grade.js";
import { startSeason } from "./start.js";

/**
 * The race position in the season (ADR-0008): the action input of a goal race week carries an
 * optional `position`; the race runs her in it (absent: her wings' default) and the result records
 * the position she ran; any other week rejects one; a viewer that rebuilds the race with the same
 * input's position gets the recorded result. Her letters, the black box and the first wings follow
 * the positions.
 */

const content = loadContent();
const START: Extract<RunInput, { kind: "start" }> = {
  kind: "start",
  falconessId: "peregrina",
  hangar: ["shiden", "mule", "nimbus", "falke"],
  parents: [],
};

/** The state at the start of turn 12 (her first goal race), resting through every week. */
function atFirstGoal(ctx: SimContext, seed: string): SeasonState {
  let s = startSeason(ctx, seed, START);
  while (s.turn < 12) {
    if (s.pendingEvent) s = advanceSeason(ctx, s, { kind: "event:choose", option: 0 });
    else s = advanceSeason(ctx, s, { kind: "rest" });
  }
  return s;
}

describe("a goal race week carries the race position (ADR-0008)", () => {
  for (const ruleset of [RULESET_V1, CURRENT_RULESET]) {
    const ctx: SimContext = { ruleset, content };

    it(`${ruleset.version}: runs and records the chosen position; without one, her wings' default`, () => {
      const s = atFirstGoal(ctx, `pos-${ruleset.version}`);
      expect(goalForTurn(ctx, s)).toBeDefined();
      const wings = DEFAULT_POSITION[content.getFrame(s.equippedFrame).style];
      const plain = advanceSeason(ctx, s, { kind: "rest" });
      expect(plain.raceResults.at(-1)?.position).toBe(wings);
      const runs = new Map<Position, string>();
      for (const position of POSITIONS) {
        const input: RunInput = { kind: "rest", position };
        const after = advanceSeason(ctx, s, input);
        const result = after.raceResults.at(-1);
        expect(result?.position).toBe(position);
        expect(after.log.at(-1)?.input).toEqual(input);
        if (position === wings) expect(after).toEqual({ ...plain, log: after.log });
        // the viewer's rebuild with the input's position gives the recorded result (P7)
        const at = goalRaceState(ctx, s, input);
        const goal = at && goalForTurn(ctx, at);
        if (!at || !goal) throw new Error("turn 12 has a goal");
        const setup = goalRaceSetup(ctx, at, goal, inputPosition(input));
        const player = setup.entries.find((e) => e.runnerId === PLAYER_RUNNER_ID);
        expect(player?.position).toBe(position);
        expect(player?.positionAptitude).toBe(s.positionAptitude[position]);
        for (const e of setup.entries.filter((x) => x.kind === "rival"))
          expect(e.position).toBe(DEFAULT_POSITION[e.style]);
        const log = simulateRace(ctx.ruleset, setup.entries, setup.course, setup.raceSeed, {
          detail: "full",
        });
        const me = log.results.find((r) => r.runnerId === PLAYER_RUNNER_ID);
        expect([me?.place, me?.timeTicks]).toEqual([result?.place, result?.timeTicks]);
        runs.set(position, `${result?.place}/${result?.timeTicks}`);
      }
      expect(new Set(runs.values()).size, "the position changes her race").toBeGreaterThan(1);
    });

    it(`${ruleset.version}: a week without a goal race rejects a position`, () => {
      const s = startSeason(ctx, `nopos-${ruleset.version}`, START);
      expect(goalForTurn(ctx, s)).toBeUndefined();
      expect(() => advanceSeason(ctx, s, { kind: "train:agility", position: "lead" })).toThrow(
        InvalidInputError,
      );
      expect(advanceSeason(ctx, s, { kind: "train:agility" }).turn).toBe(2);
    });
  }

  it("the position goes on the week's action inputs only, and must be one of the four", () => {
    const actions: RunInput[] = [
      { kind: "train:agility", position: "lead" },
      { kind: "train:stamina", position: "pack" },
      { kind: "train:technique", position: "stalk" },
      { kind: "train:risk-flight", position: "closer" },
      { kind: "train:simulator", position: "lead" },
      { kind: "rest", position: "pack" },
      { kind: "outing", manufacturer: "koryu", position: "stalk" },
      { kind: "workshop", ops: [{ op: "repair" }], position: "closer" },
    ];
    for (const input of actions) expect(RunInput.parse(input)).toEqual(input);
    expect(() => RunInput.parse({ kind: "event:choose", option: 0, position: "lead" })).toThrow();
    expect(() => RunInput.parse({ ...START, position: "lead" })).toThrow();
    expect(() => RunInput.parse({ kind: "rest", position: "front" })).toThrow();
    expect(inputPosition({ kind: "event:choose", option: 0 })).toBeUndefined();
    expect(inputPosition({ kind: "rest" })).toBeUndefined();
    expect(inputPosition({ kind: "rest", position: "stalk" })).toBe("stalk");
  });
});

describe("the letters live on the positions (ADR-0008)", () => {
  const ctx: SimContext = { ruleset: CURRENT_RULESET, content };

  it("she starts on the first hangar wings whose default is her preferred position", () => {
    for (const f of content.falconess.values()) {
      const s = startSeason(ctx, "first-wings", {
        kind: "start",
        falconessId: f.id,
        hangar: ["falke", "mule", "nimbus", "shiden"],
        parents: [],
      });
      expect(DEFAULT_POSITION[content.getFrame(s.equippedFrame).style]).toBe(f.preferredPosition);
      expect(s.positionAptitude).toEqual(f.positionAptitude);
    }
  });

  it("the black box carries a position's letter; a parent's letter raises that position", () => {
    const s = advanceSeason(ctx, atFirstGoal(ctx, "box"), { kind: "rest" });
    const box = BlackBox.parse(createBlackBox(ctx, s, [START]));
    expect(box.factors.aptitude).toEqual({
      kind: "position",
      key: "closer",
      letter: "A",
      stars: 2,
    });
    expect(() =>
      BlackBox.parse({
        ...box,
        factors: {
          ...box.factors,
          aptitude: { kind: "style", key: "dive", letter: "A", stars: 2 },
        },
      }),
    ).toThrow();
    const parent = {
      ...box,
      factors: { ...box.factors, aptitude: { ...box.factors.aptitude, key: "pack", stars: 3 } },
    } satisfies BlackBox;
    // stars 3 inherit at the highest chance; over a few seeds the pack letter rises from E to D
    const raised = ["a", "b", "c", "d", "e", "f"].some(
      (seed) =>
        startSeason(ctx, seed, { ...START, parents: [parent] }).positionAptitude.pack === "D",
    );
    expect(raised).toBe(true);
  });
});
