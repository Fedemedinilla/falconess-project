import type { StoryScene } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { testScenes } from "./testing/content";
import { INITIAL_UI, reduceUi, type UiEvent, type UiState } from "./ui";

/** The flow's UI state (plan §1.3): every event, and each cell it ignores (the same state back). */

const after = (...events: UiEvent[]): UiState => events.reduce(reduceUi, INITIAL_UI);

const scene = (id: string): StoryScene => {
  const sc = testScenes().find((s) => s.id === id);
  if (!sc) throw new Error(id);
  return sc;
};

describe("reduceUi", () => {
  it("starts on the menu with nothing done, frozen", () => {
    expect(INITIAL_UI).toMatchObject({ nav: { at: "menu" }, seq: 0, from: "menu" });
    expect(INITIAL_UI.done.size + INITIAL_UI.mine.size).toBe(0);
    expect([INITIAL_UI.replay, INITIAL_UI.notice]).toEqual([undefined, undefined]);
    expect(Object.isFrozen(INITIAL_UI)).toBe(true);
  });

  it("open: each screen of the idle menu; the same screen again changes nothing", () => {
    expect(after({ type: "open", to: "train" }).nav).toEqual({ at: "train", selected: undefined });
    expect(after({ type: "open", to: "workshop" }).nav).toEqual({ at: "workshop", tab: "wings" });
    expect(after({ type: "open", to: "skills" }).nav).toEqual({ at: "workshop", tab: "skills" });
    expect(after({ type: "open", to: "plan" }).nav).toEqual({ at: "plan" });
    const train = after({ type: "open", to: "train" }, { type: "select", kind: "train:stamina" });
    expect(reduceUi(train, { type: "open", to: "menu" }).nav).toEqual({ at: "menu" });
    // reopened, the training screen forgets its pick
    expect(reduceUi(train, { type: "open", to: "train" }).nav).toEqual({
      at: "train",
      selected: undefined,
    });
    for (const to of ["menu", "train", "workshop", "skills", "plan"] as const) {
      const at = after({ type: "open", to });
      expect(reduceUi(at, { type: "open", to })).toBe(at);
    }
  });

  it("select and tab: only on their own screen", () => {
    const train = after({ type: "open", to: "train" });
    expect(reduceUi(train, { type: "select", kind: "train:agility" }).nav).toEqual({
      at: "train",
      selected: "train:agility",
    });
    const picked = reduceUi(train, { type: "select", kind: "train:agility" });
    expect(reduceUi(picked, { type: "select", kind: "train:agility" })).toBe(picked);
    const shop = after({ type: "open", to: "workshop" });
    expect(reduceUi(shop, { type: "tab", tab: "skills" }).nav).toEqual({
      at: "workshop",
      tab: "skills",
    });
    expect(reduceUi(shop, { type: "tab", tab: "wings" })).toBe(shop);
    // ignored off their screen
    expect(reduceUi(INITIAL_UI, { type: "select", kind: "train:agility" })).toBe(INITIAL_UI);
    expect(reduceUi(train, { type: "tab", tab: "skills" })).toBe(train);
  });

  it("acted and raced: back to the menu; decided: where it was decided, the nav kept, the week this mount's", () => {
    const train = after({ type: "open", to: "train" });
    const acted = reduceUi(train, { type: "acted" });
    expect(acted.nav).toEqual({ at: "menu" });
    expect(acted.mine.size).toBe(0);
    expect(reduceUi(acted, { type: "acted" })).toBe(acted);
    const decided = reduceUi(train, { type: "decided", fp: "b", from: "train" });
    expect(decided.nav).toBe(train.nav);
    expect([decided.from, [...decided.mine]]).toEqual(["train", ["b"]]);
    expect(reduceUi(decided, { type: "decided", fp: "b", from: "train" })).toBe(decided);
    const raced = reduceUi(decided, { type: "raced" });
    expect(raced.nav).toEqual({ at: "menu" });
    expect([...raced.mine]).toEqual(["b"]);
    expect(reduceUi(raced, { type: "raced" })).toBe(raced);
  });

  it("done: the keys accumulate; keys already done change nothing", () => {
    const one = after({ type: "done", keys: ["k1"] });
    const two = reduceUi(one, { type: "done", keys: ["k1", "k2"] });
    expect([...two.done]).toEqual(["k1", "k2"]);
    expect(reduceUi(two, { type: "done", keys: ["k2"] })).toBe(two);
    expect(reduceUi(two, { type: "done", keys: [] })).toBe(two);
  });

  it("done with a race's result ends a watch from that result (review 1 item 1); not a watch from the end", () => {
    const fromResult = after({ type: "watch", turn: 10, from: "result" });
    const ended = reduceUi(fromResult, { type: "done", keys: ["fp/race:result"] });
    expect(ended.nav).toEqual({ at: "menu" });
    expect(ended.done.has("fp/race:result")).toBe(true);
    // any other key leaves the watch alone
    expect(reduceUi(fromResult, { type: "done", keys: ["fp/race:replay"] }).nav).toBe(
      fromResult.nav,
    );
    const fromEnd = after({ type: "watch", turn: 10, from: "end" });
    expect(reduceUi(fromEnd, { type: "done", keys: ["fp/race:result"] }).nav).toBe(fromEnd.nav);
  });

  it("watch: a new number each time, from the replay; its stages and its end only for that number", () => {
    const first = after({ type: "watch", turn: 10, from: "end" });
    expect(first.nav).toEqual({ at: "watch", turn: 10, from: "end", n: 1, stage: "replay" });
    const finish = reduceUi(first, { type: "watchStage", n: 1, stage: "finish" });
    expect(finish.nav).toMatchObject({ n: 1, stage: "finish" });
    expect(reduceUi(finish, { type: "watchStage", n: 1, stage: "finish" })).toBe(finish);
    // a stale number (an earlier watch's timer) is ignored
    expect(reduceUi(finish, { type: "watchStage", n: 0, stage: "result" })).toBe(finish);
    expect(reduceUi(finish, { type: "watchDone", n: 2 })).toBe(finish);
    expect(reduceUi(finish, { type: "watchDone", n: 1 }).nav).toEqual({ at: "menu" });
    // no watch: nothing to move or end
    expect(reduceUi(INITIAL_UI, { type: "watchStage", n: 1, stage: "result" })).toBe(INITIAL_UI);
    expect(reduceUi(INITIAL_UI, { type: "watchDone", n: 1 })).toBe(INITIAL_UI);
    const second = reduceUi(reduceUi(finish, { type: "watchDone", n: 1 }), {
      type: "watch",
      turn: 20,
      from: "result",
    });
    expect(second.nav).toMatchObject({ turn: 20, from: "result", n: 2, stage: "replay" });
  });

  it("replay: a scene asked for, numbered with the watches; cleared once", () => {
    const prologue = scene("peregrina-prologue");
    const asked = after(
      { type: "watch", turn: 10, from: "end" },
      { type: "replay", scene: prologue },
    );
    expect(asked.replay).toEqual({ scene: prologue, n: 2 });
    expect(asked.seq).toBe(2);
    // the same scene again is a new instance
    expect(reduceUi(asked, { type: "replay", scene: prologue }).replay).toEqual({
      scene: prologue,
      n: 3,
    });
    const cleared = reduceUi(asked, { type: "replay", scene: undefined });
    expect(cleared.replay).toBeUndefined();
    expect(reduceUi(cleared, { type: "replay", scene: undefined })).toBe(cleared);
  });

  it("notice: a refused act or preview, each one a notice of its own, until cleared or gone", () => {
    const refused = after({ type: "notice", notice: "workshop" });
    expect(refused.notice).toEqual({ kind: "workshop", n: 1, shown: false });
    // the same kind again is another notice (its own time), not the one on screen
    const again = reduceUi(refused, { type: "notice", notice: "workshop" });
    expect(again.notice).toEqual({ kind: "workshop", n: 2, shown: false });
    const shown = reduceUi(again, { type: "noticeShown", n: 2 });
    expect(shown.notice?.shown).toBe(true);
    expect(reduceUi(shown, { type: "noticeShown", n: 2 })).toBe(shown);
    // a stale one (the notice before it) shows or goes nothing
    expect(reduceUi(shown, { type: "noticeShown", n: 1 })).toBe(shown);
    expect(reduceUi(shown, { type: "noticeGone", n: 1 })).toBe(shown);
    expect(reduceUi(shown, { type: "noticeGone", n: 2 }).notice).toBeUndefined();
    expect(reduceUi(shown, { type: "notice", notice: undefined }).notice).toBeUndefined();
    expect(reduceUi(INITIAL_UI, { type: "notice", notice: undefined })).toBe(INITIAL_UI);
  });
});
