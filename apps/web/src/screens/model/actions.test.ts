import type { RunInput, SeasonState } from "@falconess/schema";
import { advanceSeason, RULESET_V1, RULESET_V2, type Ruleset, startSeason } from "@falconess/sim";
import { describe, expect, it } from "vitest";
import { getContent } from "../../content/load";
import {
  ACTION_KINDS,
  actionBlock,
  actionPreview,
  DANGER_RISK_PM,
  driftPreview,
  HIGH_RISK_PM,
  outingPreview,
  previewGain,
  previewVigor,
  raceMoodPm,
  restPreview,
  riskLevel,
  TRAINING_KINDS,
  trainingPreview,
  trainMoodPm,
  vigorOf,
} from "./actions";

const content = getContent();
const v1 = { ruleset: RULESET_V1, content };
const v2 = { ruleset: RULESET_V2, content };
const HANGAR = ["shiden", "mule", "nimbus", "falke"];

function start(ctx: { ruleset: Ruleset }, seed: string, falconessId: string): SeasonState {
  return startSeason({ ruleset: ctx.ruleset, content }, seed, {
    kind: "start",
    falconessId,
    hangar: HANGAR,
    parents: [],
  });
}

/**
 * Whether the step applied a luck event by itself (v2 content): its effects land on the same log
 * entry as the action's, so the action's own numbers cannot be read off that entry.
 */
function luck(before: SeasonState, after: SeasonState): boolean {
  return after.log.some((e, i) => e.event?.auto === true && !before.log[i]?.event);
}

/** The log entry of the action taken on `turn`. */
function entryOf(state: SeasonState, turn: number, kind: string) {
  const entry = state.log.find((e) => e.turn === turn && e.input?.kind === kind);
  if (!entry) throw new Error(`no log entry for ${kind} on ${turn}`);
  return entry;
}

describe("action previews", () => {
  for (const ctx of [v1, v2])
    it(`are what advanceSeason applies (${ctx.ruleset.version}): gains on a success, a part lost on a failure`, () => {
      const S = ctx.ruleset.season;
      let successes = 0;
      let failures = 0;
      for (const seed of ["p1", "p2", "p3", "p4"]) {
        for (const falconessId of ["peregrina", "cernicala", "caracara"]) {
          let s = start(ctx, seed, falconessId);
          for (let t = 0; t < 40 && s.status === "active"; t++) {
            if (s.pendingEvent) {
              s = advanceSeason(ctx, s, { kind: "event:choose", option: 0 });
              continue;
            }
            const kind = TRAINING_KINDS[t % TRAINING_KINDS.length] ?? "train:agility";
            // v2 has no forced rest: rest only every few weeks so the vigor runs low too
            if (actionBlock(ctx, s, kind) !== undefined || (t % 7 === 6 && s.fatigue >= 70)) {
              const next = advanceSeason(ctx, s, { kind: "rest" });
              const range = previewVigor(ctx, s, actionPreview(ctx, s, "rest"));
              if (!luck(s, next)) {
                expect(vigorOf(ctx, next)).toBeGreaterThanOrEqual(range?.min ?? -1);
                expect(vigorOf(ctx, next)).toBeLessThanOrEqual(range?.max ?? -1);
              }
              s = next;
              continue;
            }
            const preview = trainingPreview(ctx, s, kind);
            const next = advanceSeason(ctx, s, { kind });
            if (luck(s, next)) {
              s = next;
              continue;
            }
            const entry = entryOf(next, s.turn, kind);
            if (entry.notes.includes("log.train.ok")) {
              successes += 1;
              for (const g of preview.gains) expect(entry.deltas[g.stat], kind).toBe(g.gain);
              expect(next.skillPoints - s.skillPoints).toBe(preview.skillPoints);
            } else {
              failures += 1;
              expect(preview.failPm).toBeGreaterThan(0);
              for (const g of preview.gains)
                expect(entry.deltas[g.stat], kind).toBe(
                  -Math.max(1, Math.floor((g.gain * S.failLossPm) / 1000)),
                );
            }
            const vigor = previewVigor(ctx, s, actionPreview(ctx, s, kind));
            expect(vigorOf(ctx, next)).toBe(vigor?.min);
            expect(vigor?.min).toBe(vigor?.max);
            s = next;
          }
        }
      }
      expect(successes).toBeGreaterThan(100);
      expect(failures).toBeGreaterThan(0);
    });

  it("names the crews present, the risk and the training's facility level", () => {
    const s = start(v1, "crews", "peregrina");
    for (const kind of TRAINING_KINDS) {
      const p = trainingPreview(v1, s, kind);
      expect(p.level).toBe(1);
      expect(p.crews.map((c) => c.manufacturer)).toEqual(s.crewPresence[kind] ?? []);
      for (const c of p.crews) expect(c.bonusPm).toBeGreaterThan(0);
    }
    expect(trainingPreview(v1, s, "train:simulator").failPm).toBe(0);
    expect(trainingPreview(v1, s, "train:agility").failPm).toBe(RULESET_V1.season.failBase);
    const risk = trainingPreview(v1, s, "train:risk-flight");
    expect(risk.failPm).toBe(RULESET_V1.season.riskFlightFail);
    expect(risk.injuryPm).toBe(RULESET_V1.season.riskFlightInjury);
    expect(risk.gains.map((g) => g.stat)).toEqual(["courage", "agility"]);
    expect(risk.risk).toBe("high");
  });

  it("reads v2's curve: no risk rested, the simulator at half, injuries from exhaustion", () => {
    const s = start(v2, "curve", "peregrina");
    for (const kind of TRAINING_KINDS) {
      const p = trainingPreview(v2, s, kind);
      expect(p.vigor).toBe(-RULESET_V2.season.fatigueCost[kind]);
      if (kind === "train:risk-flight") expect(p.failPm).toBe(RULESET_V2.season.riskFlightFail);
      else expect(p.failPm, kind).toBe(0);
    }
    // vigor 30 (fatigue 70): 15 % for a simple training, 7,5 % for the simulator
    const tired = { ...s, fatigue: 70 };
    expect(trainingPreview(v2, tired, "train:stamina")).toMatchObject({
      failPm: 150,
      injuryPm: 0,
      risk: "high",
    });
    expect(trainingPreview(v2, tired, "train:simulator").failPm).toBe(75);
    // and gives a little vigor back (study §9): its card reads «Vigor +5»
    expect(trainingPreview(v2, s, "train:simulator").vigor).toBe(5);
    // vigor 20: a quarter of the failures are injuries
    const spent = { ...s, fatigue: 80 };
    expect(trainingPreview(v2, spent, "train:agility")).toMatchObject({
      failPm: 266,
      injuryPm: 66,
      risk: "danger",
    });
  });

  it("says the simulator gives vigor back only where it does: every ruleset with the curve", () => {
    // the v2 legend (the bands' legend, shown for the curve) says so, with the ruleset's number
    expect(getContent().t("ui.turn.actions.legend.v2")).toContain("devuelve un poco de vigor");
    expect(getContent().t("ui.turn.actions.legend.v2.brief")).toContain(
      "devuelve un poco de vigor",
    );
    for (const r of [RULESET_V1, RULESET_V2].filter((r) => r.season.failModel === "curve"))
      expect(-r.season.fatigueCost["train:simulator"], r.version).toBeGreaterThan(0);
  });

  it("grades a chance's tone: one in ten warns, one in four or an exhausted injury alarms", () => {
    expect(riskLevel(0, 0, false)).toBe("none");
    expect(riskLevel(HIGH_RISK_PM - 1, 0, false)).toBe("low");
    expect(riskLevel(HIGH_RISK_PM, 0, false)).toBe("high");
    expect(riskLevel(DANGER_RISK_PM, 0, false)).toBe("danger");
    expect(riskLevel(120, 30, false)).toBe("high");
    expect(riskLevel(60, 15, true)).toBe("danger");
  });

  it("says when a week is blocked: injured rests whatever; only v1 turns a tired training into rest", () => {
    const s = start(v1, "blocks", "peregrina");
    const tired = { ...s, fatigue: RULESET_V1.season.forcedRestAt };
    expect(actionBlock(v1, tired, "train:stamina")).toBe("forced-rest");
    expect(actionBlock(v1, tired, "outing")).toBeUndefined();
    expect(actionPreview(v1, tired, "train:stamina")).toEqual({
      kind: "train:stamina",
      gains: [],
      vigor: { min: 40, max: 40 },
    });
    const injured = { ...s, injuryTurns: 1 };
    for (const kind of ACTION_KINDS) expect(actionBlock(v1, injured, kind)).toBe("injured");

    // the sim agrees: the tired training rests
    const next = advanceSeason(v1, tired, { kind: "train:stamina" });
    const notes = next.log.filter((e) => e.turn === s.turn).flatMap((e) => e.notes);
    expect(notes).toContain("log.rest.forced");

    // v2: no forced rest, even with the bar empty
    const empty = { ...start(v2, "blocks", "peregrina"), fatigue: 100 };
    for (const kind of TRAINING_KINDS) expect(actionBlock(v2, empty, kind)).toBeUndefined();
  });

  it("previews a risk flight injury as the sim applies it: a part lost, then injured weeks", () => {
    for (const ctx of [v1, v2]) {
      const S = ctx.ruleset.season;
      let checked = false;
      for (let n = 0; n < 400 && !checked; n++) {
        const s = start(ctx, `injury-${n}`, "peregrina");
        const preview = trainingPreview(ctx, s, "train:risk-flight");
        expect(preview.injuryPm).toBeGreaterThan(0);
        const next = advanceSeason(ctx, s, { kind: "train:risk-flight" });
        const entry = entryOf(next, s.turn, "train:risk-flight");
        if (!entry.notes.includes("log.train.injury") || luck(s, next)) continue;
        for (const g of preview.gains)
          expect(entry.deltas[g.stat]).toBe(
            -Math.max(1, Math.floor((g.gain * S.failLossPm) / 1000)),
          );
        expect(next.injuryTurns).toBe(S.injuryTurns);
        let after = next;
        while (after.pendingEvent)
          after = advanceSeason(ctx, after, { kind: "event:choose", option: 0 });
        for (const kind of ACTION_KINDS) expect(actionBlock(ctx, after, kind)).toBe("injured");
        // the injured week rests whatever the input, with the injured week's recovery
        const rested = advanceSeason(ctx, after, { kind: "train:agility" });
        if (luck(after, rested)) continue;
        const notes = rested.log.filter((e) => e.turn === after.turn).flatMap((e) => e.notes);
        expect(notes).toContain("log.injured");
        const range = previewVigor(ctx, after, actionPreview(ctx, after, "train:agility"));
        expect(vigorOf(ctx, rested)).toBe(range?.min);
        expect(range?.max).toBe(range?.min);
        checked = true;
      }
      expect(checked, `no seed gave a risk flight injury on ${ctx.ruleset.version}`).toBe(true);
    }
  });

  it("trains right below v1's forced-rest threshold, with the fatigue's fail chance", () => {
    const S = RULESET_V1.season;
    const s = { ...start(v1, "edge", "peregrina"), fatigue: S.forcedRestAt - 1 };
    expect(actionBlock(v1, s, "train:stamina")).toBeUndefined();
    const p = trainingPreview(v1, s, "train:stamina");
    expect(p.failPm).toBe(S.failBase + Math.floor((S.forcedRestAt - 1) / S.failPerFatigue));
    const next = advanceSeason(v1, s, { kind: "train:stamina" });
    const notes = next.log.filter((e) => e.turn === s.turn).flatMap((e) => e.notes);
    expect(notes.some((n) => n === "log.train.ok" || n === "log.train.fail")).toBe(true);
    expect(notes).not.toContain("log.rest.forced");
    expect(vigorOf(v1, next)).toBe(previewVigor(v1, s, actionPreview(v1, s, "train:stamina"))?.min);
  });

  it("caps a previewed gain at statMax, as the sim does", () => {
    const S = RULESET_V1.season;
    let checked = false;
    for (let n = 0; n < 50 && !checked; n++) {
      const base = start(v1, `cap-${n}`, "peregrina");
      const s = { ...base, stats: { ...base.stats, agility: S.statMax - 1 } };
      const p = trainingPreview(v1, s, "train:agility");
      expect(p.gains[0]).toEqual({ stat: "agility", gain: 1 });
      const next = advanceSeason(v1, s, { kind: "train:agility" });
      const entry = entryOf(next, s.turn, "train:agility");
      if (!entry.notes.includes("log.train.ok")) continue;
      for (const g of p.gains) expect(entry.deltas[g.stat] ?? 0).toBe(g.gain);
      expect(next.stats.agility).toBe(S.statMax);
      checked = true;
    }
    expect(checked, "no seed gave a successful training").toBe(true);
  });

  it("previews the rest: v1 gives back 40, v2 30, 50 or 70 with its chances", () => {
    expect(restPreview(v1)).toMatchObject({
      options: [{ vigor: 40, chancePm: 1000 }],
      vigorMin: 40,
      vigorMax: 40,
      moodUpPm: 500,
      injuredVigor: 40,
    });
    expect(restPreview(v2)).toMatchObject({
      options: [
        { vigor: 30, chancePm: 250 },
        { vigor: 50, chancePm: 500 },
        { vigor: 70, chancePm: 250 },
      ],
      vigorMin: 30,
      vigorMax: 70,
      moodUpPm: 250,
      injuredVigor: 50,
    });
    // the bar's range is clamped: a rested Falconess cannot pass the top
    const s = start(v2, "rest", "peregrina");
    expect(previewVigor(v2, s, actionPreview(v2, s, "rest"))).toEqual({ min: 100, max: 100 });
    const tired = { ...s, fatigue: 60 };
    expect(previewVigor(v2, tired, actionPreview(v2, tired, "rest"))).toEqual({
      min: 70,
      max: 100,
    });
  });

  it("previews the outing with the hangar's crews, the equipped frame's first", () => {
    for (const ctx of [v1, v2]) {
      const s = { ...start(ctx, "outing", "peregrina"), fatigue: 50 };
      const o = outingPreview(ctx, s);
      expect(o.vigor).toBe(-ctx.ruleset.season.fatigueCost.outing);
      expect(o.crews[0]).toBe(ctx.content.getFrame(s.equippedFrame).manufacturer);
      expect(new Set(o.crews).size).toBe(o.crews.length);
      const input: RunInput = { kind: "outing", manufacturer: o.crews[1] ?? "" };
      const next = advanceSeason(ctx, s, input);
      expect(next.bond[o.crews[1] ?? ""]).toBe(o.bond);
      expect(vigorOf(ctx, next)).toBe(previewVigor(ctx, s, actionPreview(ctx, s, "outing"))?.min);
      expect(previewGain(actionPreview(ctx, s, "outing"), "agility")).toBeUndefined();
    }
    expect(outingPreview(v2, start(v2, "o", "peregrina")).vigor).toBe(20);
  });

  it("gives no mood point when she is already at the top, as the sim keeps it at +2", () => {
    for (const ctx of [v1, v2]) {
      const s = { ...start(ctx, "top", "peregrina"), fatigue: 50 };
      expect(outingPreview(ctx, { ...s, mood: 1 }).mood).toBe(1);
      const top = { ...s, mood: 2 as const };
      expect(outingPreview(ctx, top).mood).toBe(0);
      expect(advanceSeason(ctx, top, { kind: "outing" }).mood).toBe(2);
    }
  });

  it("weighs mood twice in v2 (training ×0,80 … ×1,20, race ×0,96 … ×1,04), the same table in v1", () => {
    const s = start(v2, "mood", "peregrina");
    expect(trainMoodPm(v2, { ...s, mood: 1 })).toBe(1100);
    expect(raceMoodPm(v2, { ...s, mood: 1 })).toBe(1020);
    expect(trainMoodPm(v2, { ...s, mood: -2 })).toBe(800);
    expect(trainMoodPm(v1, { ...s, mood: 2 })).toBe(raceMoodPm(v1, { ...s, mood: 2 }));
  });

  it("says when a training streak makes the next drift likelier, as the sim rolls it", () => {
    let s = start(v2, "streak", "peregrina");
    expect(driftPreview(v2, s)).toEqual({ streak: 0, nextPm: 20, rising: false });
    const seen: number[] = [];
    for (let week = 0; week < 3; week++) {
      while (s.pendingEvent) s = advanceSeason(v2, s, { kind: "event:choose", option: 0 });
      s = advanceSeason(v2, s, { kind: "train:simulator" });
      while (s.pendingEvent) s = advanceSeason(v2, s, { kind: "event:choose", option: 0 });
      seen.push(driftPreview(v2, s).nextPm);
    }
    expect(seen).toEqual([20, 60, 100]);
    expect(driftPreview(v2, s)).toMatchObject({ streak: 3, rising: true });
    // at the lowest mood the drift has nowhere to take her: no chance, no warning
    for (let week = 0; week < 3; week++) {
      while (s.pendingEvent) s = advanceSeason(v2, s, { kind: "event:choose", option: 0 });
      s = advanceSeason(v2, s, { kind: "train:simulator" });
    }
    while (s.pendingEvent) s = advanceSeason(v2, s, { kind: "event:choose", option: 0 });
    expect(driftPreview(v2, { ...s, mood: -1 })).toMatchObject({ streak: 6, rising: true });
    expect(driftPreview(v2, { ...s, mood: -1 }).nextPm).toBeGreaterThan(0);
    expect(driftPreview(v2, { ...s, mood: -2 })).toEqual({ streak: 6, nextPm: 0, rising: false });
    // v1 has no drift
    expect(driftPreview(v1, start(v1, "streak", "peregrina")).nextPm).toBe(0);
  });
});
