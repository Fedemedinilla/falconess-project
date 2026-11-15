import type { RunInput, SeasonState } from "@falconess/schema";
import { advanceSeason, RULESET_V1, startSeason } from "@falconess/sim";
import { describe, expect, it } from "vitest";
import { getContent } from "../../content/load";
import type { ActiveRun, Step } from "../../game/controller";
import { stepUnread } from "./stepRead";

const ctx = { ruleset: RULESET_V1, content: getContent() };
const SEED = "step-read";
const START: RunInput = {
  kind: "start",
  falconessId: "peregrina",
  hangar: ["shiden", "mule", "nimbus", "falke"],
  parents: [],
};

const before: SeasonState = startSeason(ctx, SEED, START);
const rest: RunInput = { kind: "rest" };
const after = advanceSeason(ctx, before, rest);
const step: Step = { before, input: rest, after };

function run(state: SeasonState, inputs: readonly RunInput[]): ActiveRun {
  return { seed: SEED, rulesetVersion: RULESET_V1.version, inputs, state };
}

describe("stepUnread: the last step waits for the player", () => {
  it("is unread right after it was applied", () => {
    expect(
      stepUnread({ run: run(after, [START, rest]), lastStep: step, lastStepSeen: false }),
    ).toBe(true);
  });

  it("is read once acknowledged", () => {
    expect(stepUnread({ run: run(after, [START, rest]), lastStep: step, lastStepSeen: true })).toBe(
      false,
    );
  });

  it("no longer waits when the run moved on past it (another input, undo, a new season)", () => {
    const later = advanceSeason(ctx, after, rest);
    expect(
      stepUnread({ run: run(later, [START, rest, rest]), lastStep: step, lastStepSeen: false }),
    ).toBe(false);
    expect(stepUnread({ run: run(before, [START]), lastStep: step, lastStepSeen: false })).toBe(
      false,
    );
    expect(stepUnread({ run: undefined, lastStep: step, lastStepSeen: false })).toBe(false);
  });

  it("is never unread without a step", () => {
    expect(
      stepUnread({ run: run(before, [START]), lastStep: undefined, lastStepSeen: false }),
    ).toBe(false);
  });
});
