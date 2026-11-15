import type { SeasonState, TrainingKind } from "@falconess/schema";
import { advanceSeason, startSeason } from "@falconess/sim";
import { describe, expect, it } from "vitest";
import type { Step } from "../../game/controller";
import { paceScale } from "../pace";
import { testContext } from "./testing/content";
import {
  RESULT,
  resultTimeline,
  type TrainResult,
  trainingCue,
  trainResultOf,
} from "./trainResult";

const ctx = testContext("v3");
const start = (seed: string): SeasonState =>
  startSeason(ctx, seed, {
    kind: "start",
    falconessId: "peregrina",
    hangar: ["shiden", "mule", "nimbus", "falke"],
    parents: [],
  });

/** Three gains, skill points, a vigor change and two crews, both bonded. */
const RICH: TrainResult = {
  kind: "train:agility",
  outcome: "success",
  gains: [
    { stat: "agility", delta: 12 },
    { stat: "technique", delta: 4 },
    { stat: "stamina", delta: 2 },
  ],
  points: 5,
  from: { agility: 100, stamina: 100, technique: 100, courage: 100, intelligence: 100 },
  fromPoints: 0,
  vigor: -20,
  bonds: [
    { manufacturer: "altair", delta: 5 },
    { manufacturer: "koryu", delta: 5 },
  ],
  sync: [],
  crews: ["altair", "koryu"],
};

describe("resultTimeline: when each «+N» lands and when the result ends", () => {
  it("Normal: the stats, the points, the vigor, then each bond, 300 ms apart", () => {
    const t = resultTimeline(RICH, paceScale("normal"));
    expect(t.stats).toEqual({ agility: 520, technique: 820, stamina: 1120 });
    expect(t.points).toBe(1420);
    expect(t.vigor).toBe(1720);
    // D28: no «+N» shows for a bond any more, but its slot keeps the crews' cards up to be read
    expect(t.bonds).toEqual({ altair: 2020, koryu: 2320 });
    expect(t.end).toBe(2320 + RESULT.hold);
  });
  it("Rápido and Directo shorten the steps and the hold, not the first pop", () => {
    const fast = resultTimeline(RICH, paceScale("fast"));
    expect(fast.stats.agility).toBe(RESULT.firstPop);
    expect(fast.end).toBeCloseTo(2260, 6);
    const direct = resultTimeline(RICH, paceScale("direct"));
    expect(direct.stats.agility).toBe(RESULT.firstPop);
    expect(direct.end).toBeCloseTo(1535, 6);
  });
  it("a result with no pops after its stats ends with the crews' cards if they come in later", () => {
    const lone: TrainResult = {
      ...RICH,
      gains: [{ stat: "agility", delta: 1 }],
      points: 0,
      vigor: 0,
      bonds: [],
      crews: ["altair", "boneyard", "koryu", "lumiere"],
    };
    const t = resultTimeline(lone, 1);
    expect(t.points).toBeUndefined();
    expect(t.vigor).toBeUndefined();
    // the crews: 540 + 150 × 3 + 450 = 1440 > the lone pop at 520
    expect(t.end).toBe(1440 + RESULT.hold);
  });
});

/** The first training step of `kind` whose log says `ok` (or not) on some seed. */
function trainingStep(kind: TrainingKind, ok: boolean): Step {
  for (let seed = 0; seed < 40; seed++) {
    let state = start(`cue-${seed}`);
    for (let i = 0; state.status === "active" && i < 30; i++) {
      const input = state.pendingEvent
        ? ({ kind: "event:choose", option: 0 } as const)
        : ({ kind } as const);
      const after = advanceSeason(ctx, state, input);
      const entry = after.log.find((e) => e.turn === state.turn && e.input?.kind === kind);
      if (input.kind === kind && entry && entry.notes.includes("log.train.ok") === ok)
        if (ok || entry.notes.includes("log.train.fail")) return { before: state, input, after };
      state = after;
    }
  }
  throw new Error(`no ${ok ? "good" : "failed"} ${kind} found`);
}

describe("trainingCue: what a week's action sounds like", () => {
  const card = (boosted: boolean) => [{ kind: "train:agility" as const, boosted }];
  it("a good training is a success, or a boost with a crew there", () => {
    const step = trainingStep("train:agility", true);
    const input = { kind: "train:agility" } as const;
    expect(trainingCue(input, step.before.turn, step.after, card(false))).toBe("success");
    expect(trainingCue(input, step.before.turn, step.after, card(true))).toBe("boost");
  });
  it("a failed training is a fail; an action that is no training, a confirm", () => {
    const step = trainingStep("train:agility", false);
    const input = { kind: "train:agility" } as const;
    expect(trainingCue(input, step.before.turn, step.after, card(true))).toBe("fail");
    expect(trainingCue({ kind: "rest" }, step.before.turn, step.after, card(false))).toBe(
      "confirm",
    );
    expect(trainingCue(input, step.before.turn, undefined, card(false))).toBe("confirm");
  });
  it("an injured week's training rests by rule, yet sounds like a failure", () => {
    const before = { ...start("cue-injured"), injuryTurns: 1 };
    const input = { kind: "train:agility" } as const;
    const after = advanceSeason(ctx, before, input);
    expect(after.log.at(-1)?.notes).toContain("log.injured");
    // F4: changes in 5.8 (an injured week has no training result)
    expect(trainingCue(input, before.turn, after, card(false))).toBe("fail");
  });
});

describe("trainResultOf: a training step's result", () => {
  it("reads the gains, the vigor and the bonds from the step, the same object every time", () => {
    const step = trainingStep("train:agility", true);
    const points = step.after.skillPoints - step.before.skillPoints;
    const result = trainResultOf(ctx, "train:agility", "success", step, points);
    expect(result.gains.length).toBeGreaterThan(0);
    for (const g of result.gains)
      expect(g.delta).toBe(step.after.stats[g.stat] - step.before.stats[g.stat]);
    expect(result.from).toBe(step.before.stats);
    expect(result.crews).toEqual(step.before.crewPresence["train:agility"] ?? []);
    expect(trainResultOf(ctx, "train:agility", "success", step, points)).toBe(result);
    expect(trainResultOf(ctx, "train:agility", "success", step, points + 1)).not.toBe(result);
  });
});
