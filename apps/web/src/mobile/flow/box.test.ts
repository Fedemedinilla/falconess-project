import type { RunInput, SeasonState } from "@falconess/schema";
import { advanceSeason, blackBoxFor, startSeason } from "@falconess/sim";
import { describe, expect, it } from "vitest";
import { boxToKeep } from "./box";
import { testContext } from "./testing/content";

const startInput: Extract<RunInput, { kind: "start" }> = {
  kind: "start",
  falconessId: "peregrina",
  hangar: ["shiden", "mule", "nimbus", "falke"],
  parents: [],
};

/** A season played by resting until it ends or `weeks` pass. */
function rested(version: string, seed: string, weeks: number) {
  const ctx = testContext(version);
  let state: SeasonState = startSeason(ctx, seed, startInput);
  const inputs: RunInput[] = [startInput];
  for (let i = 0; i < weeks && state.status === "active"; i++) {
    const input: RunInput = state.pendingEvent
      ? { kind: "event:choose", option: 0 }
      : { kind: "rest" };
    inputs.push(input);
    state = advanceSeason(ctx, state, input);
  }
  return { ctx, state, inputs };
}

/** A v3 season that ended at a lost goal race. */
function endedV3() {
  for (let seed = 0; seed < 40; seed++) {
    const run = rested("v3", `box-${seed}`, 48);
    if (run.state.status === "ended") return run;
  }
  throw new Error("no season of rests ended in 40 seeds");
}

describe("boxToKeep: the black box a season leaves (ADR-0013, critic (c)9)", () => {
  it("an ended v3 season leaves its box", () => {
    const { ctx, state, inputs } = endedV3();
    expect(boxToKeep(ctx, { state, inputs })).toEqual(blackBoxFor(ctx, state, inputs));
  });

  it("a season still in play leaves none", () => {
    const { ctx, state, inputs } = rested("v3", "box-active", 3);
    expect(state.status).toBe("active");
    expect(boxToKeep(ctx, { state, inputs })).toBeUndefined();
  });

  it("an ended season of an older ruleset leaves none (no inheritance before v3)", () => {
    const { ctx, state, inputs } = rested("v2", "box-v2", 3);
    const ended: SeasonState = { ...state, status: "ended", endReason: "completed" };
    expect(boxToKeep(ctx, { state: ended, inputs })).toBeUndefined();
  });
});
