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
});
