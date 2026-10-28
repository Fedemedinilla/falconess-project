import { loadContent } from "@falconess/content";
import type { RunInput, SeasonState, TrainingKind, TurnLogEntry } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { CURRENT_RULESET, RULESET_V1, RULESET_V2 } from "../rulesets/index.js";
import { moodMultiplier } from "../stats.js";
import { seasonContext } from "./context.js";
import {
  actionBlock,
  moodDriftPm,
  nextTrainingDriftPm,
  raceLossCostsMood,
  restOptions,
  trainingMoodMultiplier,
  trainingRisk,
  trainingStreak,
  vigor,
} from "./rules.js";

const SIMPLE: readonly TrainingKind[] = ["train:agility", "train:stamina", "train:technique"];

/** Fatigue for a vigor value (vigor = 100 − fatigue in both rulesets). */
const atVigor = (v: number) => 100 - v;

describe("trainingRisk (ADR-0006 D3)", () => {
  it("v2: a simple training never fails with vigor 60 or more, then follows the curve", () => {
    const table: Array<[number, number]> = [
      [100, 0],
      [80, 0],
      [60, 0],
      [59, 0],
      [50, 16],
      [40, 66],
      [30, 150],
      [20, 266],
      [10, 416],
      [0, 600],
    ];
    for (const kind of SIMPLE)
      for (const [v, failPm] of table)
        expect(trainingRisk(RULESET_V2, atVigor(v), kind).failPm, `${kind} vigor ${v}`).toBe(
          failPm,
        );
  });

  it("v2: the curve never goes down as vigor drains", () => {
    let prev = -1;
    for (let f = 0; f <= 100; f++) {
      const { failPm } = trainingRisk(RULESET_V2, f, "train:agility");
      expect(failPm).toBeGreaterThanOrEqual(prev);
      prev = failPm;
    }
  });

  it("v2: the simulator fails at half the curve, one floor", () => {
    expect(trainingRisk(RULESET_V2, atVigor(60), "train:simulator").failPm).toBe(0);
    expect(trainingRisk(RULESET_V2, atVigor(50), "train:simulator").failPm).toBe(8);
    expect(trainingRisk(RULESET_V2, atVigor(20), "train:simulator").failPm).toBe(133);
    expect(trainingRisk(RULESET_V2, atVigor(0), "train:simulator").failPm).toBe(300);
  });

  it("v2: a risk flight fails at 120 ‰ plus the curve, a quarter of it an injury", () => {
    for (const [v, failPm] of [
      [100, 120],
      [60, 120],
      [40, 186],
      [20, 386],
      [0, 720],
    ] as const) {
      const r = trainingRisk(RULESET_V2, atVigor(v), "train:risk-flight");
      expect(r.failPm, `vigor ${v}`).toBe(failPm);
      expect(r.injuryPm, `vigor ${v}`).toBe(Math.floor((failPm * 250) / 1000));
    }
  });

  it("v2: from vigor 20 down a quarter of every failure is an injury", () => {
    expect(trainingRisk(RULESET_V2, atVigor(21), "train:stamina")).toEqual({
      failPm: 253,
      injuryPm: 0,
    });
    expect(trainingRisk(RULESET_V2, atVigor(20), "train:stamina")).toEqual({
      failPm: 266,
      injuryPm: 66,
    });
    expect(trainingRisk(RULESET_V2, atVigor(0), "train:technique")).toEqual({
      failPm: 600,
      injuryPm: 150,
    });
    expect(trainingRisk(RULESET_V2, atVigor(0), "train:simulator")).toEqual({
      failPm: 300,
      injuryPm: 75,
    });
  });

  it("v1: the linear model, the simulator never fails, risk flight 120 / 30", () => {
    for (let f = 0; f <= 100; f += 5) {
      for (const kind of SIMPLE)
        expect(trainingRisk(RULESET_V1, f, kind)).toEqual({
          failPm: 50 + Math.floor(f / 4),
          injuryPm: 0,
        });
      expect(trainingRisk(RULESET_V1, f, "train:simulator")).toEqual({ failPm: 0, injuryPm: 0 });
      expect(trainingRisk(RULESET_V1, f, "train:risk-flight")).toEqual({
        failPm: 120,
        injuryPm: 30,
      });
    }
  });
});

describe("vigor and mood multipliers", () => {
  it("vigor = fatigueMax − fatigue in both rulesets", () => {
    for (const r of [RULESET_V1, RULESET_V2]) {
      expect(vigor(r, 0)).toBe(100);
      expect(vigor(r, 35)).toBe(65);
      expect(vigor(r, 100)).toBe(0);
    }
  });

  it("v2 trains ×0.80 … ×1.20 and races ×0.96 … ×1.04; v1 uses its race table for both", () => {
    const moods = [-2, -1, 0, 1, 2] as const;
    expect(moods.map((m) => trainingMoodMultiplier(RULESET_V2, m))).toEqual([
      800, 900, 1000, 1100, 1200,
    ]);
    expect(moods.map((m) => moodMultiplier(RULESET_V2, m))).toEqual([960, 980, 1000, 1020, 1040]);
    expect(moods.map((m) => trainingMoodMultiplier(RULESET_V1, m))).toEqual(
      moods.map((m) => moodMultiplier(RULESET_V1, m)),
    );
  });
});

describe("rest options (ADR-0006 D4)", () => {
  it("v1 has one option (no draw); v2 draws +30 / +50 / +70 at 25 / 50 / 25 %", () => {
    expect(restOptions(RULESET_V1)).toEqual([{ recovery: 40, weight: 1, chancePm: 1000 }]);
    expect(restOptions(RULESET_V2)).toEqual([
      { recovery: 30, weight: 1, chancePm: 250 },
      { recovery: 50, weight: 2, chancePm: 500 },
      { recovery: 70, weight: 1, chancePm: 250 },
    ]);
  });

  it("each ruleset has one weight per rest option", () => {
    for (const r of [RULESET_V1, RULESET_V2])
      expect(r.season.restRecoveryWeights).toHaveLength(r.season.restRecovery.length);
  });
});

type WeekKind = Exclude<RunInput["kind"], "start" | "event:choose">;

function inputOf(kind: WeekKind): RunInput {
  if (kind === "workshop") return { kind, ops: [{ op: "repair" }] };
  if (kind === "outing") return { kind };
  return { kind };
}

function logOf(...weeks: Array<[WeekKind, string[]]>): Pick<SeasonState, "log"> {
  const log: TurnLogEntry[] = [{ turn: 1, notes: ["log.season.start"], deltas: {} }];
  weeks.forEach(([kind, notes], i) => {
    log.push({ turn: i + 1, input: inputOf(kind), notes, deltas: {} });
  });
  return { log };
}

describe("mood drift (ADR-0006 D5)", () => {
  it("counts the training weeks that end the log; rest, outing, workshop, injury and forced rest cut it", () => {
    expect(trainingStreak(logOf())).toBe(0);
    expect(trainingStreak(logOf(["train:agility", ["log.train.ok"]]))).toBe(1);
    expect(
      trainingStreak(
        logOf(
          ["train:agility", ["log.train.ok"]],
          ["rest", ["log.rest"]],
          ["train:stamina", ["log.train.fail"]],
          ["train:simulator", ["log.train.ok", "ev.sandstorm-week"]],
        ),
      ),
    ).toBe(2);
    for (const cut of [
      ["outing", ["log.outing"]],
      ["workshop", ["log.workshop"]],
      ["train:agility", ["log.injured"]],
      ["train:agility", ["log.rest.forced"]],
    ] as const)
      expect(
        trainingStreak(logOf(["train:agility", ["log.train.ok"]], [cut[0], [...cut[1]]])),
      ).toBe(0);
  });

  it("v2: 2 % for the first two, then +4 % per training in a row; v1 never drifts", () => {
    expect([1, 2, 3, 4, 5, 6].map((n) => moodDriftPm(RULESET_V2, n))).toEqual([
      20, 20, 60, 100, 140, 180,
    ]);
    expect(moodDriftPm(RULESET_V2, 40)).toBe(1000);
    for (const n of [1, 3, 10, 48]) expect(moodDriftPm(RULESET_V1, n)).toBe(0);
  });

  it("previews the drift chance of the next training week", () => {
    const three = logOf(
      ["train:agility", ["log.train.ok"]],
      ["train:agility", ["log.train.ok"]],
      ["train:agility", ["log.train.ok"]],
    );
    expect(nextTrainingDriftPm(RULESET_V2, three)).toBe(100);
    expect(nextTrainingDriftPm(RULESET_V2, logOf())).toBe(20);
    expect(nextTrainingDriftPm(RULESET_V1, three)).toBe(0);
  });
});

describe("race-loss mood and action blocks", () => {
  it("v2: a goal race finished 6th or worse costs mood; v1 never", () => {
    expect(raceLossCostsMood(RULESET_V2, 5)).toBe(false);
    expect(raceLossCostsMood(RULESET_V2, 6)).toBe(true);
    expect(raceLossCostsMood(RULESET_V2, 8)).toBe(true);
    for (let place = 1; place <= 8; place++)
      expect(raceLossCostsMood(RULESET_V1, place)).toBe(false);
  });

  it("an injury rests whatever the input; only v1 forces rest on a tired training", () => {
    const tired = { injuryTurns: 0, fatigue: 100 };
    expect(actionBlock(RULESET_V1, tired, "train:agility")).toBe("forced-rest");
    expect(actionBlock(RULESET_V1, { injuryTurns: 0, fatigue: 79 }, "train:agility")).toBe(
      undefined,
    );
    expect(actionBlock(RULESET_V1, tired, "outing")).toBe(undefined);
    expect(actionBlock(RULESET_V2, tired, "train:agility")).toBe(undefined);
    expect(actionBlock(RULESET_V2, { injuryTurns: 1, fatigue: 0 }, "rest")).toBe("injured");
  });
});

describe("seasonContext", () => {
  it("starts new runs on the current ruleset (v2) and keeps any version on request", () => {
    const content = loadContent();
    expect(CURRENT_RULESET.version).toBe("v2");
    expect(seasonContext(content).ruleset).toBe(CURRENT_RULESET);
    expect(seasonContext(content, "v1").ruleset).toBe(RULESET_V1);
    expect(() => seasonContext(content, "v9")).toThrow(/unknown ruleset/);
  });
});
