import { describe, expect, it } from "vitest";
import { runFingerprint } from "../../game/run";
import { decide, factsFor, fpOf, loadSave, runOf, testGame } from "./testing/game";
import { previewResult } from "./week";

/** The flow's facts, read from the stores (plan §1.1). */

describe("factsOf", () => {
  it("the run as the controller has it, its fingerprint, and the stores' own readings", () => {
    const t = loadSave("peregrina-w10");
    const snap = t.game.getSnapshot();
    const f = factsFor(t, { pace: "fast", reduced: true, sheetOpen: true });
    expect(f.run.run).toBe(runOf(t));
    expect(f.run.fp).toBe(runFingerprint(runOf(t)));
    expect([f.run.step, f.run.stepSeen]).toEqual([snap.lastStep, true]);
    expect(f.seenInRun).toBe(t.story.seenInRun("1"));
    expect(f.seenEver).toBe(t.story.seenEver());
    expect(f.cardsShown).toBe(t.cards.shown("1"));
    expect([f.pace, f.reduced, f.sheetOpen]).toEqual(["fast", true, true]);
    expect([f.record, f.preview]).toEqual([undefined, undefined]);
    // read again: the same readings
    const g = factsFor(t, { pace: "fast", reduced: true, sheetOpen: true });
    expect([g.seenInRun, g.seenEver, g.cardsShown, g.run.run]).toEqual([
      f.seenInRun,
      f.seenEver,
      f.cardsShown,
      f.run.run,
    ]);
  });

  it("a decided week of this run, with its preview from the one cache", () => {
    const t = loadSave("peregrina-w10");
    decide(t, { kind: "rest" });
    const f = factsFor(t);
    expect(f.record).toBe(t.weeks.getSnapshot());
    const cached = previewResult(t.game.context(), runOf(t).state, { kind: "rest" });
    expect(cached.ok && f.preview).toBe(cached.ok ? cached.step : undefined);
    expect(factsFor(t).preview).toBe(f.preview);
  });

  it("a record of another run (or another week) reads as none", () => {
    const t = loadSave("peregrina-w10");
    t.weeks.plan("v3|1|9|other", 10, "lead");
    expect(factsFor(t).record).toBeUndefined();
    t.weeks.plan(fpOf(t), 9, "lead");
    expect(factsFor(t).record).toBeUndefined();
    t.weeks.plan(fpOf(t), 10, "lead");
    expect(factsFor(t).record).toEqual({
      phase: "planned",
      fp: fpOf(t),
      turn: 10,
      position: "lead",
    });
    const fresh = testGame();
    fresh.game.start("caracara", ["shiden", "mule", "nimbus", "falke"], "s1");
    fresh.weeks.plan(fpOf(fresh), 1, "lead");
    // week 1 is no race week
    expect(factsFor(fresh).record).toBeUndefined();
  });
});
