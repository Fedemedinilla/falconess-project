import { loadContent } from "@falconess/content";
import type { RunInput, SeasonState, TrainingKind, TurnLogEntry } from "@falconess/schema";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { generateField, PLAYER_RUNNER_ID, playerEntryInput } from "../race/field.js";
import { RULESET_V1, RULESET_V2, type Ruleset } from "../rulesets/index.js";
import { lowestStat, STAT_ORDER } from "../stats.js";
import { advanceSeason } from "./advance.js";
import { draft, rngForInput, type SimContext } from "./context.js";
import { gradeFor } from "./grade.js";
import { replaySeason } from "./replay.js";
import { nextTrainingDriftPm, restOptions, trainingRisk } from "./rules.js";
import { startSeason } from "./start.js";
import { mixedPolicy } from "./testing/mixed-policy.js";
import { trainingGain } from "./training.js";

const content = loadContent();
const V1: SimContext = { ruleset: RULESET_V1, content };
const V2: SimContext = { ruleset: RULESET_V2, content };
/** V2 without the luck events, which a training week can roll after the action (ADR-0006 D8). */
const V2_NO_LUCK: SimContext = {
  ruleset: RULESET_V2,
  content: { ...content, events: new Map([...content.events].filter(([, e]) => !e.auto)) },
};
const START: Extract<RunInput, { kind: "start" }> = {
  kind: "start",
  falconessId: "peregrina",
  hangar: ["shiden", "mule", "nimbus", "falke"],
  parents: [],
};
const KINDS: readonly TrainingKind[] = [
  "train:agility",
  "train:stamina",
  "train:technique",
  "train:risk-flight",
  "train:simulator",
];

function at(ctx: SimContext, seed: string, over: Partial<SeasonState> = {}): SeasonState {
  return { ...startSeason(ctx, seed, START), ...over };
}

/** The log entry of the week the input was applied on (the one that carries the input). */
function weekOf(s: SeasonState, turn: number): TurnLogEntry {
  const e = s.log.find((x) => x.turn === turn && x.input !== undefined);
  if (!e) throw new Error(`no action logged on turn ${turn}`);
  return e;
}

/** A log that ends in `streak` training weeks (turns 1 … streak); the state is on the next turn. */
function withStreak(s: SeasonState, streak: number): SeasonState {
  const log: TurnLogEntry[] = [...s.log];
  for (let t = 1; t <= streak; t++)
    log.push({ turn: t, input: { kind: "train:agility" }, notes: ["log.train.ok"], deltas: {} });
  return { ...s, log, turn: streak + 1 };
}

describe("training outcome = the exported chances (ADR-0006 D9)", () => {
  it("property: failure, injury and drift are the per-input draws against trainingRisk and nextTrainingDriftPm", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 8 }),
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: -2, max: 2 }),
        fc.constantFrom(...KINDS),
        fc.integer({ min: 0, max: 8 }),
        // the training's own draws, apart from a luck event the week may roll after it
        fc.constantFrom(V1, V2_NO_LUCK),
        (seed, fatigue, mood, kind, streak, ctx) => {
          const s0 = withStreak(
            at(ctx, seed, { fatigue, mood: mood as SeasonState["mood"] }),
            streak,
          );
          const after = advanceSeason(ctx, s0, { kind });
          const week = weekOf(after, s0.turn);
          const rng = rngForInput(seed, s0.inputsApplied);
          if (fatigue >= ctx.ruleset.season.forcedRestAt) {
            expect(week.notes).toContain("log.rest.forced");
            return;
          }
          const { failPm, injuryPm } = trainingRisk(ctx.ruleset, fatigue, kind);
          const roll = rng.nextPermille("training");
          const failed = roll < failPm;
          const injured = failed && roll < injuryPm;
          const gotFailed =
            week.notes.includes("log.train.fail") || week.notes.includes("log.train.injury");
          expect(gotFailed).toBe(failed);
          expect(week.notes.includes("log.train.injury")).toBe(injured);
          expect(after.injuryTurns).toBe(injured ? ctx.ruleset.season.injuryTurns : 0);
          const afterFail = failed ? Math.max(-2, mood - 1) : mood;
          expect(week.notes.includes("log.mood.failure")).toBe(afterFail !== mood);
          const driftPm = nextTrainingDriftPm(ctx.ruleset, s0);
          const drifted = driftPm > 0 && rng.chancePermille("training", driftPm);
          const final = drifted ? Math.max(-2, afterFail - 1) : afterFail;
          expect(week.notes.includes("log.mood.drift")).toBe(final !== afterFail);
          expect(after.mood).toBe(final);
          expect(week.moodDelta).toBe(final === mood ? undefined : final - mood);
        },
      ),
      { numRuns: 400 },
    );
  });
});

describe("v2 training (ADR-0006 D3)", () => {
  it("never forces a rest: an empty-vigor training trains, and can fail or injure", () => {
    let fails = 0;
    let injuries = 0;
    for (let i = 0; i < 200; i++) {
      const s0 = at(V2, `empty-${i}`, { fatigue: 100 });
      const week = weekOf(advanceSeason(V2, s0, { kind: "train:technique" }), 1);
      expect(week.notes).not.toContain("log.rest.forced");
      if (week.notes.includes("log.train.fail")) fails++;
      if (week.notes.includes("log.train.injury")) {
        injuries++;
        expect(week.notes).toContain("log.vigor.exhausted");
      }
    }
    // 600 ‰ fail, 150 ‰ of it an injury: about 90 plain failures and 30 injuries in 200
    expect(fails + injuries).toBeGreaterThan(90);
    expect(fails + injuries).toBeLessThan(150);
    expect(injuries).toBeGreaterThan(10);
    expect(injuries).toBeLessThan(55);
  });

  it("a training costs vigor and the log says so in fatigueDelta", () => {
    const s0 = at(V2, "cost", { fatigue: 10 });
    const after = advanceSeason(V2, s0, { kind: "train:risk-flight" });
    expect(after.fatigue).toBe(40);
    expect(weekOf(after, 1).fatigueDelta).toBe(30);
  });

  it("trains ×0.80 … ×1.20 by mood", () => {
    const d = draft(at(V2, "gain"));
    for (const k of KINDS) d.crewPresence[k] = [];
    const gains = ([-2, -1, 0, 1, 2] as const).map((mood) => {
      d.mood = mood;
      return trainingGain(V2, d, "train:stamina", "stamina");
    });
    expect(gains).toEqual([35, 39, 44, 48, 52]);
  });
});

describe("v2 rest and outing (ADR-0006 D4)", () => {
  it("draws +30 / +50 / +70 at 25 / 50 / 25 %, then the 25 % mood roll", () => {
    const counts = new Map<number, number>();
    const options = restOptions(RULESET_V2);
    for (let i = 0; i < 400; i++) {
      const s0 = at(V2, `rest-${i}`, { fatigue: 100, mood: 0 });
      const after = advanceSeason(V2, s0, { kind: "rest" });
      const rng = rngForInput(s0.seed, s0.inputsApplied);
      const pick =
        options[
          rng.pickWeighted(
            "training",
            options.map((o) => o.weight),
          )
        ]?.recovery;
      const recovered = 100 - after.fatigue;
      expect(recovered).toBe(pick);
      counts.set(recovered, (counts.get(recovered) ?? 0) + 1);
      const up = rng.chancePermille("training", RULESET_V2.season.restMoodUpChance);
      expect(after.mood).toBe(up ? 1 : 0);
      const week = weekOf(after, 1);
      expect(week.notes[0]).toBe("log.rest");
      const quality = recovered === 30 ? "poor" : recovered === 70 ? "great" : "normal";
      expect(week.notes).toContain(`log.vigor.rest.${quality}`);
      expect(week.notes.includes("log.mood.rest")).toBe(up);
      expect(week.fatigueDelta).toBe(-recovered);
    }
    expect([...counts.keys()].sort((a, b) => a - b)).toEqual([30, 50, 70]);
    expect(counts.get(30)).toBeGreaterThan(70);
    expect(counts.get(30)).toBeLessThan(130);
    expect(counts.get(50)).toBeGreaterThan(160);
    expect(counts.get(50)).toBeLessThan(240);
    expect(counts.get(70)).toBeGreaterThan(70);
    expect(counts.get(70)).toBeLessThan(130);
  });

  it("v1 takes no rest draw: always 40, and the mood roll is the first draw", () => {
    for (let i = 0; i < 50; i++) {
      const s0 = at(V1, `rest-${i}`, { fatigue: 60, mood: 0 });
      const after = advanceSeason(V1, s0, { kind: "rest" });
      expect(after.fatigue).toBe(20);
      const up = rngForInput(s0.seed, s0.inputsApplied).chancePermille("training", 500);
      expect(after.mood).toBe(up ? 1 : 0);
      expect(weekOf(after, 1).notes.some((n) => n.startsWith("log.vigor."))).toBe(false);
    }
  });

  it("an injured week recovers 50 vigor without a draw", () => {
    const s0 = at(V2, "hurt", { fatigue: 90, injuryTurns: 2, mood: 0 });
    const after = advanceSeason(V2, s0, { kind: "train:agility" });
    expect(after.fatigue).toBe(40);
    expect(after.injuryTurns).toBe(1);
    expect(after.mood).toBe(0);
    expect(weekOf(after, 1).notes).toEqual(["log.injured"]);
  });

  it("an outing gives +20 vigor and +1 mood, and says why", () => {
    const after = advanceSeason(V2, at(V2, "out", { fatigue: 50, mood: 0 }), { kind: "outing" });
    expect(after.fatigue).toBe(30);
    expect(after.mood).toBe(1);
    const week = weekOf(after, 1);
    expect(week.notes.slice(0, 2)).toEqual(["log.outing", "log.mood.outing"]);
    expect(week.moodDelta).toBe(1);
    expect(week.fatigueDelta).toBe(-20);
    const happy = advanceSeason(V2, at(V2, "out", { fatigue: 50, mood: 2 }), { kind: "outing" });
    expect(weekOf(happy, 1).notes).not.toContain("log.mood.outing");
    expect(weekOf(happy, 1).moodDelta).toBeUndefined();
  });
});

describe("v2 mood drift (ADR-0006 D5)", () => {
  it("drifts more the longer the training streak: 2 % … 14 % on the fifth week", () => {
    const rate = (streak: number) => {
      let drifts = 0;
      const n = 1500;
      for (let i = 0; i < n; i++) {
        const s0 = withStreak(at(V2, `drift-${streak}-${i}`, { fatigue: 0, mood: 1 }), streak);
        const week = weekOf(advanceSeason(V2, s0, { kind: "train:simulator" }), s0.turn);
        if (week.notes.includes("log.mood.drift")) drifts++;
      }
      return (drifts * 1000) / n;
    };
    const first = rate(0);
    const fifth = rate(4);
    expect(first).toBeGreaterThan(8);
    expect(first).toBeLessThan(35);
    expect(fifth).toBeGreaterThan(115);
    expect(fifth).toBeLessThan(170);
  });

  it("a rest cuts the streak", () => {
    let s = at(V2, "streak", { fatigue: 0 });
    for (const kind of ["train:simulator", "train:simulator", "train:simulator"] as const) {
      s = advanceSeason(V2, { ...s, fatigue: 0 }, { kind });
      if (s.pendingEvent) s = advanceSeason(V2, s, { kind: "event:choose", option: 0 });
    }
    expect(nextTrainingDriftPm(RULESET_V2, s)).toBe(100);
    s = advanceSeason(V2, s, { kind: "rest" });
    if (s.pendingEvent) s = advanceSeason(V2, s, { kind: "event:choose", option: 0 });
    expect(nextTrainingDriftPm(RULESET_V2, s)).toBe(20);
  });
});

/** A turn-12 state that loses its goal race badly: every stat at the minimum. */
function hopeless(ctx: SimContext): SeasonState {
  const s = at(ctx, "hopeless", { mood: 0 });
  const stats = { agility: 1, stamina: 1, technique: 1, courage: 1, intelligence: 1 };
  return { ...s, turn: 12, stats };
}

describe("v2 race-loss mood (ADR-0006 D5)", () => {
  it("a goal race finished 6th or worse costs 1 mood after the race; v1 never", () => {
    const repair: RunInput = { kind: "workshop", ops: [{ op: "repair" }] };
    const v2 = advanceSeason(V2, hopeless(V2), repair);
    expect(v2.raceResults.at(-1)?.place).toBe(8);
    expect(v2.mood).toBe(-1);
    const week = weekOf(v2, 12);
    expect(week.notes.indexOf("log.mood.race-loss")).toBeGreaterThan(
      week.notes.indexOf("log.race"),
    );
    expect(week.moodDelta).toBe(-1);
    const v1 = advanceSeason(V1, hopeless(V1), repair);
    expect(v1.raceResults.at(-1)?.place).toBe(8);
    expect(v1.mood).toBe(0);
    expect(weekOf(v1, 12).notes).not.toContain("log.mood.race-loss");
  });

  it("the threshold is raceLossMoodAt: the place itself counts", () => {
    const withAt = (raceLossMoodAt: number): SimContext => ({
      content,
      ruleset: { ...RULESET_V2, season: { ...RULESET_V2.season, raceLossMoodAt } },
    });
    const repair: RunInput = { kind: "workshop", ops: [{ op: "repair" }] };
    expect(advanceSeason(withAt(8), hopeless(V2), repair).mood).toBe(-1);
    expect(advanceSeason(withAt(9), hopeless(V2), repair).mood).toBe(0);
  });
});

describe("v2 grades and rival field (ADR-0006)", () => {
  it("grade thresholds ×1.1: 3000 is B in v1 and C in v2; 3190 is B in v2", () => {
    const score = (ctx: SimContext, total: number) => {
      const d = draft(at(ctx, "grade"));
      d.learnedSkills = [];
      d.raceResults = [];
      const each = total / 5;
      d.stats = {
        agility: each,
        stamina: each,
        technique: each,
        courage: each,
        intelligence: each,
      };
      return gradeFor(ctx, d);
    };
    expect(score(V1, 3000)).toBe("B");
    expect(score(V2, 3000)).toBe("C");
    expect(score(V2, 3190)).toBe("B");
    expect(score(V2, 4070)).toBe("A");
    expect(score(V1, 4070)).toBe("A");
    expect(score(V2, 3700)).toBe("B");
  });

  it("rivals average 60 + 11 per turn per stat", () => {
    const flat: Ruleset = {
      ...RULESET_V2,
      field: { ...RULESET_V2.field, rivalNoise: 0, rivalStatJitter: 0 },
    };
    const player = playerEntryInput(at(V2, "field"));
    const course = content.getCourse("ridge");
    for (const [turn, mu] of [
      [12, 192],
      [24, 324],
      [36, 456],
      [46, 566],
    ] as const) {
      const entries = generateField(flat, content, { course, turn, raceSeed: `f/${turn}`, player });
      for (const e of entries) {
        if (e.runnerId === PLAYER_RUNNER_ID) continue;
        const w = flat.field.rivalWeights[e.style][1] ?? 0;
        // stamina is neither mood- (rivals race at mood 0) nor aptitude-scaled
        expect(e.stats.stamina).toBe(Math.floor((5 * mu * w) / 1000));
      }
    }
  });
});

describe("v2 seasons", () => {
  it("refuses a state played on another ruleset", () => {
    const v1 = startSeason(V1, "mix", START);
    expect(() => advanceSeason(V2, v1, { kind: "rest" })).toThrow(/ruleset v1.*v2/);
  });

  it("property: mixed-policy v2 seasons end, stay in bounds and replay byte for byte", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 8 }),
        fc.constantFrom("peregrina", "cernicala", "caracara"),
        (seed, falconessId) => {
          const start: RunInput = { ...START, falconessId };
          let s = startSeason(V2, seed, { ...START, falconessId });
          const inputs: RunInput[] = [start];
          while (s.status === "active") {
            const input = mixedPolicy(content, s);
            inputs.push(input);
            s = advanceSeason(V2, s, input);
            const S = RULESET_V2.season;
            for (const k of STAT_ORDER)
              if (s.stats[k] < S.statMin || s.stats[k] > S.statMax) return false;
            if (s.fatigue < 0 || s.fatigue > S.fatigueMax || s.mood < -2 || s.mood > 2)
              return false;
          }
          expect(s.rulesetVersion).toBe("v2");
          return JSON.stringify(replaySeason(V2, seed, inputs)) === JSON.stringify(s);
        },
      ),
      { numRuns: 25 },
    );
  });

  it("logs every mood and vigor change: the log's deltas add up to the state, each mood change has a cause", () => {
    const sum = (s: SeasonState, k: "moodDelta" | "fatigueDelta") =>
      s.log.reduce((a, e) => a + (e[k] ?? 0), 0);
    const causes = (s: SeasonState) =>
      s.log.flatMap((e) => e.notes).filter((n) => n.startsWith("log.mood.")).length;
    const reference = (s: SeasonState): RunInput => {
      if (s.pendingEvent) return { kind: "event:choose", option: 0 };
      if (s.fatigue >= 60) return { kind: "rest" };
      return { kind: KINDS[STAT_ORDER.indexOf(lowestStat(s.stats))] ?? "train:agility" };
    };
    for (let i = 0; i < 16; i++) {
      const policy = i % 2 === 0 ? reference : (s: SeasonState) => mixedPolicy(content, s);
      let s = startSeason(V2, `causes-${i}`, START);
      expect([s.mood, s.fatigue]).toEqual([0, 0]);
      while (s.status === "active") {
        const prev = s;
        s = advanceSeason(V2, s, policy(s));
        expect(sum(s, "moodDelta")).toBe(s.mood);
        expect(sum(s, "fatigueDelta")).toBe(s.fatigue);
        if (s.mood !== prev.mood) expect(causes(s)).toBeGreaterThan(causes(prev));
      }
    }
  });

  it("every note the engine writes has a text, and every ADR-0006 cause note shows up", () => {
    const CAUSES = [
      "log.mood.failure",
      "log.mood.drift",
      "log.mood.race-loss",
      "log.mood.rest",
      "log.mood.outing",
      "log.mood.event.up",
      "log.mood.event.down",
      "log.vigor.rest.poor",
      "log.vigor.rest.normal",
      "log.vigor.rest.great",
      "log.vigor.event.up",
      "log.vigor.event.down",
      "log.vigor.exhausted",
    ];
    const seen = new Set<string>();
    for (const ctx of [V1, V2])
      for (let i = 0; i < 12; i++) {
        let s = startSeason(ctx, `texts-${i}`, {
          ...START,
          falconessId: i % 2 ? "caracara" : "peregrina",
        });
        while (s.status === "active") {
          // a third trains one stat, a third rests whenever tired (many rest draws, so the three
          // rest outcomes show up whatever the content's events do to the trajectories)
          const input: RunInput =
            !s.pendingEvent && i % 3 === 0 && s.turn % 4 !== 0
              ? { kind: "train:technique" }
              : !s.pendingEvent && i % 3 === 1 && s.fatigue >= 60
                ? { kind: "rest" }
                : mixedPolicy(content, s);
          s = advanceSeason(ctx, s, input);
        }
        for (const n of s.log.flatMap((e) => e.notes)) seen.add(n);
      }
    for (const n of seen) expect(content.text.has(n), n).toBe(true);
    for (const n of CAUSES) expect(content.text.has(n), n).toBe(true);
    expect(CAUSES.filter((n) => !seen.has(n) && n !== "log.mood.race-loss")).toEqual([]);
  });
});
