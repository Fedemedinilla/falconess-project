import type { RunInput, SeasonState } from "@falconess/schema";
import { advanceSeason, RULESET_V1, startSeason } from "@falconess/sim";
import { describe, expect, it } from "vitest";
import { getContent } from "../../content/load";
import {
  ACTION_KINDS,
  actionBlock,
  actionPreview,
  outingPreview,
  previewFatigue,
  previewGain,
  restPreview,
  TRAINING_KINDS,
  trainingPreview,
} from "./actions";

const ctx = { ruleset: RULESET_V1, content: getContent() };
const HANGAR = ["shiden", "mule", "nimbus", "falke"];

function start(seed: string, falconessId: string): SeasonState {
  return startSeason(ctx, seed, { kind: "start", falconessId, hangar: HANGAR, parents: [] });
}

describe("action previews", () => {
  it("are what advanceSeason applies: gains on a success, half lost on a failure", () => {
    let successes = 0;
    let failures = 0;
    for (const seed of ["p1", "p2", "p3", "p4"]) {
      for (const falconessId of ["peregrina", "cernicala", "caracara"]) {
        let s = start(seed, falconessId);
        for (let t = 0; t < 40 && s.status === "active"; t++) {
          if (s.pendingEvent) {
            s = advanceSeason(ctx, s, { kind: "event:choose", option: 0 });
            continue;
          }
          const kind = TRAINING_KINDS[t % TRAINING_KINDS.length] ?? "train:agility";
          if (actionBlock(ctx, s, kind) !== undefined) {
            s = advanceSeason(ctx, s, { kind: "rest" });
            continue;
          }
          const preview = trainingPreview(ctx, s, kind);
          const next = advanceSeason(ctx, s, { kind });
          const entry = next.log.find((e) => e.turn === s.turn && e.input?.kind === kind);
          if (!entry) throw new Error("no log entry for the training");
          if (entry.notes.includes("log.train.ok")) {
            successes += 1;
            for (const g of preview.gains) expect(entry.deltas[g.stat], kind).toBe(g.gain);
            expect(next.skillPoints - s.skillPoints).toBe(preview.skillPoints);
          } else {
            failures += 1;
            for (const g of preview.gains)
              expect(entry.deltas[g.stat], kind).toBe(-Math.max(1, Math.floor(g.gain / 2)));
          }
          expect(next.fatigue).toBe(previewFatigue(ctx, s, actionPreview(ctx, s, kind)));
          s = next;
        }
      }
    }
    expect(successes).toBeGreaterThan(100);
    expect(failures).toBeGreaterThan(0);
  });

  it("names the crews present, the risk and the training's facility level", () => {
    const s = start("crews", "peregrina");
    for (const kind of TRAINING_KINDS) {
      const p = trainingPreview(ctx, s, kind);
      expect(p.level).toBe(1);
      expect(p.crews.map((c) => c.manufacturer)).toEqual(s.crewPresence[kind] ?? []);
      for (const c of p.crews) expect(c.bonusPm).toBeGreaterThan(0);
    }
    expect(trainingPreview(ctx, s, "train:simulator").failPm).toBe(0);
    expect(trainingPreview(ctx, s, "train:agility").failPm).toBe(RULESET_V1.season.failBase);
    const risk = trainingPreview(ctx, s, "train:risk-flight");
    expect(risk.failPm).toBe(RULESET_V1.season.riskFlightFail);
    expect(risk.injuryPm).toBe(RULESET_V1.season.riskFlightInjury);
    expect(risk.gains.map((g) => g.stat)).toEqual(["courage", "agility"]);
  });

  it("says when a week is blocked: injured rests whatever, high fatigue turns training into rest", () => {
    const s = start("blocks", "peregrina");
    const tired = { ...s, fatigue: RULESET_V1.season.forcedRestAt };
    expect(actionBlock(ctx, tired, "train:stamina")).toBe("forced-rest");
    expect(actionBlock(ctx, tired, "outing")).toBeUndefined();
    expect(actionPreview(ctx, tired, "train:stamina")).toEqual({
      kind: "train:stamina",
      gains: [],
      fatigue: restPreview(ctx).fatigue,
    });
    const injured = { ...s, injuryTurns: 1 };
    for (const kind of ACTION_KINDS) expect(actionBlock(ctx, injured, kind)).toBe("injured");

    // the sim agrees: the tired training rests
    const next = advanceSeason(ctx, tired, { kind: "train:stamina" });
    const notes = next.log.filter((e) => e.turn === s.turn).flatMap((e) => e.notes);
    expect(notes).toContain("log.rest.forced");
  });

  it("previews the outing with the hangar's crews, the equipped frame's first", () => {
    const s = start("outing", "peregrina");
    const o = outingPreview(ctx, s);
    expect(o.crews[0]).toBe(ctx.content.getFrame(s.equippedFrame).manufacturer);
    expect(new Set(o.crews).size).toBe(o.crews.length);
    const input: RunInput = { kind: "outing", manufacturer: o.crews[1] ?? "" };
    const next = advanceSeason(ctx, s, input);
    expect(next.bond[o.crews[1] ?? ""]).toBe(o.bond);
    expect(previewGain(actionPreview(ctx, s, "outing"), "agility")).toBeUndefined();
  });
});
