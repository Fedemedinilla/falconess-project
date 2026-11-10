import { DEFAULT_POSITION, POSITIONS, type RunInput, type SeasonState } from "@falconess/schema";
import {
  advanceSeason,
  buildCourseGeometry,
  distanceOfLength,
  flightOf,
  goalForTurn,
  RULESET_V1,
  RULESET_V2,
  RULESET_V3,
  type Ruleset,
  startSeason,
} from "@falconess/sim";
import { describe, expect, it } from "vitest";
import { getContent } from "../../content/load";
import {
  chosenFor,
  isRaceWeek,
  positionOptions,
  raceDistance,
  raceFrame,
  wingsPosition,
  withPosition,
} from "./position";

const content = getContent();
const HANGAR = ["shiden", "mule", "nimbus", "falke"];

/** A season of rests up to the week of its first goal race (no event waiting). */
function raceWeek(ruleset: Ruleset, falconessId: string): SeasonState {
  const ctx = { ruleset, content };
  let state = startSeason(ctx, `pos-${falconessId}`, {
    kind: "start",
    falconessId,
    hangar: HANGAR,
    parents: [],
  });
  for (let i = 0; i < 80 && !isRaceWeek(ctx, state); i++) {
    const input: RunInput = state.pendingEvent
      ? { kind: "event:choose", option: 0 }
      : { kind: "rest" };
    state = advanceSeason(ctx, state, input);
  }
  return state;
}

describe("the pre-race position (ADR-0008)", () => {
  it("defaults to the position of the wings, as the sim does", () => {
    for (const frame of content.frames.values())
      expect(wingsPosition(content, frame.id)).toBe(DEFAULT_POSITION[frame.style]);
  });

  it("races with the last frame a workshop order equips, none on an injured week", () => {
    const at = { equippedFrame: "shiden", injuryTurns: 0, fatigue: 0 };
    const swap = [
      { op: "equip-frame", frameId: "mule" },
      { op: "equip-frame", frameId: "falke" },
    ] as const;
    expect(raceFrame(RULESET_V2, at)).toBe("shiden");
    expect(raceFrame(RULESET_V2, at, [{ op: "repair" }])).toBe("shiden");
    expect(raceFrame(RULESET_V2, at, swap)).toBe("falke");
    // an injured week rests whatever the input: the wings stay
    expect(raceFrame(RULESET_V2, { ...at, injuryTurns: 2 }, swap)).toBe("shiden");
    expect(raceFrame(RULESET_V1, { ...at, injuryTurns: 1 }, swap)).toBe("shiden");
  });

  it("lists the four positions front to back with her letters and her wings' one", () => {
    const peregrina = content.getFalconess("peregrina");
    const options = positionOptions(peregrina.positionAptitude, "closer");
    expect(options.map((o) => o.position)).toEqual([...POSITIONS]);
    expect(options.map((o) => o.letter)).toEqual(
      POSITIONS.map((p) => peregrina.positionAptitude[p]),
    );
    expect(options.filter((o) => o.wings).map((o) => o.position)).toEqual(["closer"]);
  });

  it("puts a chosen position on the week's input, and nothing without one", () => {
    expect(withPosition({ kind: "rest" }, undefined)).toEqual({ kind: "rest" });
    expect(withPosition({ kind: "train:agility" }, "lead")).toEqual({
      kind: "train:agility",
      position: "lead",
    });
    expect(withPosition({ kind: "workshop", ops: [{ op: "repair" }] }, "pack")).toEqual({
      kind: "workshop",
      ops: [{ op: "repair" }],
      position: "pack",
    });
  });

  it("keeps a choice for the week it was made in only", () => {
    const state = raceWeek(RULESET_V1, "peregrina");
    expect(chosenFor({ turn: state.turn, position: "lead" }, state)).toBe("lead");
    expect(chosenFor({ turn: state.turn - 1, position: "lead" }, state)).toBeUndefined();
    expect(chosenFor(undefined, state)).toBeUndefined();
  });

  for (const ruleset of [RULESET_V1, RULESET_V2])
    it(`offers the card on a goal race week only, and the sim takes what it sends (${ruleset.version})`, () => {
      const ctx = { ruleset, content };
      const state = raceWeek(ruleset, "caracara");
      expect(isRaceWeek(ctx, state)).toBe(true);
      expect(goalForTurn(ctx, state)).toBeDefined();
      const wings = wingsPosition(content, state.equippedFrame);
      const other = POSITIONS.find((p) => p !== wings) ?? "lead";
      const after = advanceSeason(ctx, state, withPosition({ kind: "rest" }, other));
      expect(after.raceResults.at(-1)?.position).toBe(other);
      const bare = advanceSeason(ctx, state, withPosition({ kind: "rest" }, undefined));
      expect(bare.raceResults.at(-1)?.position).toBe(wings);
      // once it ran, no card: the week after has no race (and the sim refuses a position there),
      // or the race ended the season
      expect(isRaceWeek(ctx, after)).toBe(false);
      if (after.status !== "active") return;
      const next = after.pendingEvent
        ? advanceSeason(ctx, after, { kind: "event:choose", option: 0 })
        : after;
      expect(isRaceWeek(ctx, next)).toBe(false);
      expect(() => advanceSeason(ctx, next, withPosition({ kind: "rest" }, other))).toThrow();
    });
});

describe("the race's distance on the pre-race card (v3)", () => {
  const v3 = { ruleset: RULESET_V3, content };

  it("names the goal's distance, her letter and her passive; nothing on v2", () => {
    const state = raceWeek(RULESET_V3, "peregrina");
    const goal = goalForTurn(v3, state);
    if (!goal) throw new Error("no goal race");
    const d = raceDistance(v3, state, goal.courseId);
    const F = flightOf(RULESET_V3);
    if (!d || !F) throw new Error("v3 has distance letters");
    const geometry = buildCourseGeometry(RULESET_V3, content.getCourse(goal.courseId));
    expect(d.lengthMm).toBe(geometry.lengthMm);
    expect(d.distance).toBe(distanceOfLength(F, geometry.lengthMm));
    expect(d.letter).toBe(state.distanceAptitude?.[d.distance]);
    expect(d.bornAs).toBeNull();
    expect(d.passive).toBe("talon-lock");
    expect(
      raceDistance(
        { ruleset: RULESET_V2, content },
        raceWeek(RULESET_V2, "peregrina"),
        goal.courseId,
      ),
    ).toBeUndefined();
  });

  it("gives the birth letter when her black box lifted that distance", () => {
    const state = raceWeek(RULESET_V3, "caracara");
    const goal = goalForTurn(v3, state);
    if (!goal) throw new Error("no goal race");
    const d0 = raceDistance(v3, state, goal.courseId);
    if (!d0) throw new Error("v3");
    const born = content.getFalconess("caracara").distanceAptitude?.[d0.distance];
    const lifted = raceDistance(
      v3,
      {
        ...state,
        distanceBoost: d0.distance,
        distanceAptitude: {
          ...state.distanceAptitude,
          [d0.distance]: "B",
        } as SeasonState["distanceAptitude"],
      },
      goal.courseId,
    );
    expect(lifted?.letter).toBe("B");
    expect(lifted?.bornAs).toBe(born);
  });
});
