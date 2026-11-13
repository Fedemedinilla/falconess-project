import type { RunInput, SeasonState } from "@falconess/schema";
import { advanceSeason, startSeason } from "@falconess/sim";
import { describe, expect, it } from "vitest";
import { simContext } from "../content/load";
import { weekFx } from "./weekFx";

const ctx = simContext("v3");
const start: Extract<RunInput, { kind: "start" }> = {
  kind: "start",
  falconessId: "peregrina",
  hangar: ["shiden", "mule", "nimbus", "falke"],
  parents: [],
};

describe("weekFx (owner 2026-11-13)", () => {
  it("a rest shows how she slept, and a mood change shows its direction", () => {
    for (let i = 0; i < 20; i++) {
      const before: SeasonState = startSeason(ctx, `fx-${i}`, start);
      const after = advanceSeason(ctx, before, { kind: "rest" });
      const fx = weekFx({ before, input: { kind: "rest" }, after });
      expect(fx.filter((e) => e.kind.startsWith("sleep-"))).toHaveLength(1);
      const mood = after.mood - before.mood;
      expect(fx.some((e) => e.kind === "mood-up")).toBe(mood > 0);
      expect(fx.some((e) => e.kind === "mood-down")).toBe(mood < 0);
    }
  });
  it("a training that injures her shows the injury, in blue", () => {
    let found = false;
    for (let i = 0; i < 300 && !found; i++) {
      let s: SeasonState = startSeason(ctx, `fx-inj-${i}`, start);
      for (let w = 0; w < 6 && !found; w++) {
        const before = s;
        s = advanceSeason(ctx, s, { kind: "train:agility" });
        const fx = weekFx({ before, input: { kind: "train:agility" }, after: s });
        const injury = fx.find((e) => e.kind === "injury");
        if (s.injuryTurns > before.injuryTurns) {
          expect(injury?.good).toBe(false);
          found = true;
        }
        if (s.pendingEvent || s.status !== "active") break;
      }
    }
    expect(found).toBe(true);
  });
  it("a race shows the skill points it paid; a bond and a learned skill show too", () => {
    const before: SeasonState = startSeason(ctx, "fx-misc", start);
    const raced: SeasonState = {
      ...before,
      raceResults: [
        {
          courseId: "sprint",
          turn: 1,
          place: 2,
          fieldSize: 8,
          timeTicks: 900,
          frameId: before.equippedFrame,
          position: "closer",
          engine: "v1",
        },
      ],
      bond: { ...before.bond, koryu: (before.bond.koryu ?? 0) + 5 },
      learnedSkills: [...before.learnedSkills, "last-gasp", "hill-lungs"],
    };
    const fx = weekFx({ before, input: { kind: "rest" }, after: raced }, ctx.ruleset);
    expect(fx.find((e) => e.kind === "points")?.amount).toBe(
      ctx.ruleset.season.skillPointsByPlace?.[1],
    );
    expect(fx.find((e) => e.kind === "bond")?.crews).toEqual(["koryu"]);
    expect(fx.find((e) => e.kind === "skills")?.skills).toEqual(["last-gasp", "hill-lungs"]);
  });
});

describe("weekFx parts of a race week (owner 2026-11-13)", () => {
  it("the action's part has no race effects, the race's only the mood and the points", () => {
    const before: SeasonState = startSeason(ctx, "fx-part", start);
    const after: SeasonState = {
      ...before,
      mood: before.mood + 1,
      learnedSkills: [...before.learnedSkills, "second-wind"],
    };
    const step = { before, input: { kind: "workshop", ops: [] } as RunInput, after };
    expect(weekFx(step, undefined, "action").map((e) => e.kind)).toEqual(["skills"]);
    expect(weekFx(step, undefined, "race").map((e) => e.kind)).toEqual(["mood-up"]);
    expect(weekFx(step).map((e) => e.kind)).toEqual(["mood-up", "skills"]);
  });
});
