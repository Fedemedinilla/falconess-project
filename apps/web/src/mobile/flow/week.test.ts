import {
  DEFAULT_POSITION,
  type RunInput,
  type SeasonState,
  type TrainingKind,
} from "@falconess/schema";
import {
  advanceSeason,
  InvalidInputError,
  seasonGoalsOf,
  startSeason,
  WorkshopError,
} from "@falconess/sim";
import { describe, expect, it } from "vitest";
import type { Step } from "../../game/controller";
import type { WeekActionInput } from "../../screens/model/position";
import { LEGACY_POLICY, TARGET_POLICY } from "./policy";
import { testContext } from "./testing/content";
import type { Nav } from "./types";
import {
  isWeekAction,
  previewOf,
  previewResult,
  raceWings,
  screenFrom,
  trainBeat,
  trainingOutcome,
  tryPreview,
} from "./week";

const ctx = testContext("v3");
const startInput: Extract<RunInput, { kind: "start" }> = {
  kind: "start",
  falconessId: "peregrina",
  hangar: ["shiden", "mule", "nimbus", "falke"],
  parents: [],
};
const start = (seed: string): SeasonState => startSeason(ctx, seed, startInput);

/** A week's step played on the sim, as the controller keeps it. */
const play = (before: SeasonState, input: RunInput): Step => ({
  before,
  input,
  after: advanceSeason(ctx, before, input),
});

/** The first training step of `kind` whose log has `note`, on some seed (trains back to back). */
function trainingWith(kind: TrainingKind, note: string): Step {
  for (let seed = 0; seed < 60; seed++) {
    let state = start(`week-${seed}`);
    for (let i = 0; state.status === "active" && i < 30; i++) {
      const input: RunInput = state.pendingEvent ? { kind: "event:choose", option: 0 } : { kind };
      const step = play(state, input);
      const entry = step.after.log.find((e) => e.turn === state.turn && e.input?.kind === kind);
      if (input.kind === kind && entry?.notes.includes(note)) return step;
      state = step.after;
    }
  }
  throw new Error(`no ${kind} with ${note} found`);
}

/** Her first goal's race week, reached by resting. */
function raceWeek(seed: string): SeasonState {
  let state = start(seed);
  const first = [...seasonGoalsOf(ctx, state)].sort((a, b) => a.turn - b.turn)[0];
  if (!first) throw new Error("no goal");
  while (state.turn < first.turn)
    state = advanceSeason(
      ctx,
      state,
      state.pendingEvent ? { kind: "event:choose", option: 0 } : { kind: "rest" },
    );
  return state;
}

/** The same step with a crew at its training (or none). */
const withCrews = (step: Step, kind: TrainingKind, crews: readonly string[]): Step => ({
  ...step,
  before: { ...step.before, crewPresence: { ...step.before.crewPresence, [kind]: [...crews] } },
});

describe("trainingOutcome: what a training's result shows", () => {
  const ok = trainingWith("train:agility", "log.train.ok");

  it("a good training is a success, or a boost with a crew there", () => {
    expect(trainingOutcome(withCrews(ok, "train:agility", []), true)).toBe("success");
    expect(trainingOutcome(withCrews(ok, "train:agility", ["altair"]), true)).toBe("boost");
    expect(trainingOutcome(withCrews(ok, "train:agility", ["altair"]), false)).toBe("boost");
  });

  it("a failed training is a fail, and so is one that hurt her", () => {
    const failed = trainingWith("train:risk-flight", "log.train.fail");
    const hurt = trainingWith("train:risk-flight", "log.train.injury");
    for (const rested of [true, false]) {
      expect(trainingOutcome(failed, rested)).toBe("fail");
      expect(trainingOutcome(hurt, rested)).toBe("fail");
    }
  });

  it("an injured week's training rests by rule: «FALLÓ» under legacy, no result under target (F4)", () => {
    const injured = play({ ...start("week-injured"), injuryTurns: 1 }, { kind: "train:agility" });
    expect(injured.after.log.at(-1)?.notes).toContain("log.injured");
    expect(trainingOutcome(injured, LEGACY_POLICY.restedCue)).toBe("fail");
    expect(trainingOutcome(injured, TARGET_POLICY.restedCue)).toBeUndefined();
  });

  it("an action that is no training has no result", () => {
    const rest = play(start("week-rest"), { kind: "rest" });
    expect(trainingOutcome(rest, true)).toBeUndefined();
    expect(trainingOutcome(play(start("week-shop"), { kind: "outing" }), true)).toBeUndefined();
  });
});

describe("trainBeat: a training's result as a beat", () => {
  it("a committed step counts its own points up (after − before): the race's too", () => {
    const state = raceWeek("week-race");
    const step = play(state, { kind: "train:simulator" });
    expect(trainingOutcome(step, true)).not.toBe("fail");
    const own = step.after.skillPoints - step.before.skillPoints;
    // the race paid points on top of the Simulator's own
    expect(own).toBeGreaterThan(ctx.ruleset.season.simulatorSkillPoints);
    const beat = trainBeat(ctx, step, "step", "fp/result", TARGET_POLICY);
    expect(beat).toMatchObject({ kind: "train-result", key: "fp/result" });
    expect(beat?.result.points).toBe(own);
    expect(beat?.before).toBe(step.before);
    expect(beat?.after).toBe(step.after);
  });

  it("a race week's preview counts only the Simulator's points (the race's are not hers yet)", () => {
    const state = raceWeek("week-race");
    const step = play(state, { kind: "train:simulator" });
    const beat = trainBeat(ctx, step, "preview", "fp/w:result", TARGET_POLICY);
    expect(beat?.result.points).toBe(ctx.ruleset.season.simulatorSkillPoints);
    const agility = play(state, { kind: "train:agility" });
    expect(trainBeat(ctx, agility, "preview", "fp/w:result", TARGET_POLICY)?.result.points).toBe(0);
  });

  it("is the same object for the same step and key, every call", () => {
    const step = trainingWith("train:agility", "log.train.ok");
    const a = trainBeat(ctx, step, "step", "k/result", TARGET_POLICY);
    expect(a).toBeDefined();
    expect(trainBeat(ctx, step, "step", "k/result", TARGET_POLICY)).toBe(a);
    expect(trainBeat(ctx, step, "step", "k2/result", TARGET_POLICY)).not.toBe(a);
  });

  it("none for a rest; an injured week's only under legacy (a «FALLÓ»)", () => {
    expect(
      trainBeat(ctx, play(start("week-rest"), { kind: "rest" }), "step", "r", TARGET_POLICY),
    ).toBeUndefined();
    const injured = play({ ...start("week-injured"), injuryTurns: 1 }, { kind: "train:agility" });
    expect(trainBeat(ctx, injured, "step", "i", TARGET_POLICY)).toBeUndefined();
    expect(trainBeat(ctx, injured, "step", "i", LEGACY_POLICY)?.result.outcome).toBe("fail");
  });
});

describe("previewResult: one simulation per state and input (critic b: the race ran three times)", () => {
  /** An `advance` that counts its calls. */
  function counting(impl: typeof advanceSeason = advanceSeason) {
    const calls: RunInput[] = [];
    const advance: typeof advanceSeason = (c, s, input) => {
      calls.push(input);
      return impl(c, s, input);
    };
    return { calls, advance };
  }

  it("calls its advance once per state and input, and gives the same result", () => {
    const state = raceWeek("week-preview");
    const { calls, advance } = counting();
    const a = previewResult(ctx, state, { kind: "rest" }, advance);
    const b = previewResult(ctx, state, { kind: "rest" }, advance);
    expect(a).toBe(b);
    expect(calls).toHaveLength(1);
    if (!a.ok) throw new Error("the rest failed");
    expect(a.step.before).toBe(state);
    // the week's race ran in it
    expect(a.step.after.raceResults).toHaveLength(state.raceResults.length + 1);
    // another state, another simulation
    previewResult(ctx, { ...state }, { kind: "rest" }, advance);
    expect(calls).toHaveLength(2);
  });

  it("ignores the position: the action's part does not depend on it (rule 44)", () => {
    const state = raceWeek("week-preview");
    const { calls, advance } = counting();
    const placed: WeekActionInput = { kind: "train:agility", position: "lead" };
    const a = previewResult(ctx, state, placed, advance);
    const b = previewResult(ctx, state, { kind: "train:agility" }, advance);
    expect(b).toBe(a);
    expect(calls).toEqual([{ kind: "train:agility" }]);
    if (!a.ok) throw new Error("the training failed");
    expect(a.step.input).toEqual({ kind: "train:agility" });
  });

  it("keeps a refusal too, named as the controller names it", () => {
    const state = raceWeek("week-preview");
    const refusing = (e: Error) =>
      counting(() => {
        throw e;
      });
    const cases = [
      [new InvalidInputError("no"), "invalid-input"],
      [new WorkshopError("no"), "workshop"],
      [new Error("bug"), "unexpected"],
    ] as const;
    for (const [i, [error, kind]] of cases.entries()) {
      const input: WeekActionInput = { kind: "outing", manufacturer: `m${i}` };
      const { calls, advance } = refusing(error);
      const a = previewResult(ctx, state, input, advance);
      expect(a).toEqual({ ok: false, kind });
      expect(previewResult(ctx, state, input, advance)).toBe(a);
      expect(calls).toHaveLength(1);
    }
  });

  it("a workshop order the sim refuses is a refusal, not a throw", () => {
    const state = raceWeek("week-preview");
    const order: WeekActionInput = {
      kind: "workshop",
      ops: [{ op: "equip-frame", frameId: "no-such-frame" }],
    };
    expect(previewResult(ctx, state, order).ok).toBe(false);
  });

  it("tryPreview and previewOf share the one simulation", () => {
    const state = raceWeek("week-shared");
    const { calls, advance } = counting();
    const first = previewResult(ctx, state, { kind: "rest" }, advance);
    expect(tryPreview(ctx, state, { kind: "rest" })).toBe(first);
    expect(tryPreview(ctx, state, { kind: "rest", position: "closer" })).toBe(first);
    if (!first.ok) throw new Error("the rest failed");
    expect(previewOf(ctx, state, { kind: "rest" })).toBe(first.step);
    expect(calls).toHaveLength(1);
    const refused = { kind: "outing", manufacturer: "nobody" } as const;
    previewResult(ctx, state, refused, () => {
      throw new InvalidInputError("no");
    });
    expect(previewOf(ctx, state, refused)).toBeUndefined();
  });
});

describe("raceWings: the position her wings race in by default", () => {
  const frame = (id: string) => ctx.content.getFrame(id);

  it("with no action, or one that equips nothing, the equipped frame's", () => {
    const state = raceWeek("week-wings");
    expect(raceWings(ctx, state)).toBe(DEFAULT_POSITION[frame(state.equippedFrame).style]);
    expect(raceWings(ctx, state, { kind: "rest" })).toBe(raceWings(ctx, state));
    expect(raceWings(ctx, state, { kind: "workshop", ops: [{ op: "repair" }] })).toBe(
      raceWings(ctx, state),
    );
    const other = [...ctx.content.frames.values()].find(
      (f) => f.style !== frame(state.equippedFrame).style,
    );
    if (!other) throw new Error("one style only");
    expect(raceWings(ctx, { ...state, equippedFrame: other.id })).toBe(
      DEFAULT_POSITION[other.style],
    );
  });

  it("a workshop equip-frame on a race week: the frame it equips, the one the sim races (F5)", () => {
    const state = raceWeek("week-wings");
    const other = state.hangar.find((id) => frame(id).style !== frame(state.equippedFrame).style);
    if (!other) throw new Error("no frame of another style in her hangar");
    const input: WeekActionInput = {
      kind: "workshop",
      ops: [{ op: "equip-frame", frameId: other }],
    };
    const wings = raceWings(ctx, state, input);
    expect(wings).toBe(DEFAULT_POSITION[frame(other).style]);
    expect(wings).not.toBe(raceWings(ctx, state));
    // with no position on the input, the race runs in the new wings' own
    const ran = advanceSeason(ctx, state, input).raceResults.at(-1);
    expect(ran?.turn).toBe(state.turn);
    expect(ran?.frameId).toBe(other);
    expect(ran?.position).toBe(wings);
  });

  it("an injured week rests whatever the order: her wings stay the equipped ones", () => {
    const state = { ...raceWeek("week-wings"), injuryTurns: 1 };
    const other = state.hangar.find((id) => frame(id).style !== frame(state.equippedFrame).style);
    if (!other) throw new Error("no frame of another style in her hangar");
    expect(
      raceWings(ctx, state, { kind: "workshop", ops: [{ op: "equip-frame", frameId: other }] }),
    ).toBe(raceWings(ctx, state));
  });
});

describe("isWeekAction and screenFrom", () => {
  it("a week's action is any input but the start and an event's answer", () => {
    expect(isWeekAction(startInput)).toBe(false);
    expect(isWeekAction({ kind: "event:choose", option: 0 })).toBe(false);
    for (const input of [
      { kind: "rest" },
      { kind: "outing" },
      { kind: "train:stamina", position: "stalk" },
      { kind: "workshop", ops: [{ op: "repair" }] },
    ] as const satisfies readonly RunInput[])
      expect(isWeekAction(input)).toBe(true);
  });

  it("a race week is decided from the menu, the training picker or the workshop", () => {
    const navs: readonly [Nav, string][] = [
      [{ at: "menu" }, "menu"],
      [{ at: "train", selected: "train:agility" }, "train"],
      [{ at: "workshop", tab: "skills" }, "workshop"],
      [{ at: "plan" }, "menu"],
      [{ at: "watch", turn: 10, from: "result", n: 1, stage: "replay" }, "menu"],
    ];
    for (const [nav, from] of navs) expect(screenFrom(nav)).toBe(from);
  });
});
