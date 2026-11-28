import type { RunInput, SeasonState } from "@falconess/schema";
import { canonicalJson } from "@falconess/sim";
import { describe, expect, it } from "vitest";
import { getContent } from "../content/load";
import { GameController } from "./controller";
import { goalRaceLog, stepRaceLog } from "./goal-race";
import { findRacePick } from "./race-pick";
import type { KeyValueStore } from "./storage";

/**
 * «Correr» keeps the race it ran (ADR-0017, open decision 6): `act` keeps the goal race's full log
 * on its step, and the race screen reads it instead of running the race again. A reload has no
 * kept log: the race is run again, and it is the same log byte for byte.
 */

const content = getContent();

function memoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
    removeItem: (k) => {
      data.delete(k);
    },
  };
}

function policy(s: SeasonState): RunInput {
  if (s.pendingEvent) return { kind: "event:choose", option: 0 };
  if (s.fatigue >= 60) return { kind: "rest" };
  return { kind: "train:agility" };
}

/** A run played up to its first goal race, that race's input the last one applied. */
function toFirstRace(store: KeyValueStore): GameController {
  const game = new GameController(content, store);
  expect(game.start("peregrina", ["shiden", "mule", "nimbus", "falke"], "kept-race")).toBe(true);
  for (let i = 0; i < 60; i++) {
    const run = game.getSnapshot().run;
    if (!run) throw new Error("no run");
    expect(game.act(policy(run.state))).toBe(true);
    const step = game.getSnapshot().lastStep;
    if (!step) throw new Error("no step");
    if (step.after.raceResults.length > step.before.raceResults.length) return game;
    // a week without a goal race keeps nothing
    expect(step.raceLog).toBeUndefined();
  }
  throw new Error("no goal race");
}

describe("the goal race «Correr» ran, kept", () => {
  it("act keeps the race's full log on its step: the rebuild's, byte for byte", () => {
    const game = toFirstRace(memoryStore());
    const step = game.getSnapshot().lastStep;
    if (!step?.raceLog) throw new Error("no kept log");
    expect(step.raceLog.detail).toBe("full");
    expect(canonicalJson(step.raceLog)).toBe(
      canonicalJson(goalRaceLog(game.context(), step.before, step.input)),
    );
  });

  it("the race screen reads the kept log itself; a reload has none and runs the race again", () => {
    const store = memoryStore();
    const game = toFirstRace(store);
    const snap = game.getSnapshot();
    const run = snap.run;
    const turn = run?.state.raceResults.at(-1)?.turn;
    if (!run || turn === undefined) throw new Error("no race");
    const pick = findRacePick(game.context(), run, turn, snap.lastStep);
    if (!pick) throw new Error("no pick");
    expect(stepRaceLog(game.context(), pick.step)).toBe(snap.lastStep?.raceLog);

    const reloaded = new GameController(content, store);
    expect(reloaded.continueSaved()).toBe(true);
    const again = reloaded.getSnapshot();
    if (!again.run || !again.lastStep) throw new Error("no run after the reload");
    expect(again.lastStep.raceLog).toBeUndefined();
    const repick = findRacePick(reloaded.context(), again.run, turn, again.lastStep);
    if (!repick) throw new Error("no pick after the reload");
    const rebuilt = stepRaceLog(reloaded.context(), repick.step);
    expect(rebuilt).toBeDefined();
    expect(canonicalJson(rebuilt)).toBe(canonicalJson(snap.lastStep?.raceLog));
  });
});
