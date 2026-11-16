import type { StoryScene } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { testScenes } from "./testing/content";
import { INITIAL_UI, reduceUi, type Toast, type UiEvent, type UiState } from "./ui";

/** The flow's UI state (plan §1.3): every event, and each cell it ignores (the same state back). */

const after = (...events: UiEvent[]): UiState => events.reduce(reduceUi, INITIAL_UI);

const scene = (id: string): StoryScene => {
  const sc = testScenes().find((s) => s.id === id);
  if (!sc) throw new Error(id);
  return sc;
};

const toast = (id: string, kind: Toast["kind"] = "seen"): Toast => ({
  id,
  sceneId: id,
  kind,
  shown: false,
});

describe("reduceUi", () => {
  it("starts on the menu with nothing done, frozen", () => {
    expect(INITIAL_UI).toMatchObject({ nav: { at: "menu" }, seq: 0, from: "menu", toasts: [] });
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

  it("toasts: first in, first out, two at most; a newer one replaces the second, never the first (review 1 item 14)", () => {
    const a = toast("a");
    const b = toast("b", "passed");
    const c = toast("c", "skipped");
    const two = after({ type: "toast", toast: a }, { type: "toast", toast: b });
    expect(two.toasts.map((t) => t.id)).toEqual(["a", "b"]);
    // the first, unshown yet, stays; the newest takes the second place
    expect(reduceUi(two, { type: "toast", toast: c }).toasts.map((t) => t.id)).toEqual(["a", "c"]);
    // StrictMode's second run: the same id again adds nothing
    expect(reduceUi(two, { type: "toast", toast: a })).toBe(two);
    const shown = reduceUi(two, { type: "toastShown", id: "a" });
    expect(shown.toasts.map((t) => t.shown)).toEqual([true, false]);
    expect(reduceUi(shown, { type: "toastShown", id: "a" })).toBe(shown);
    expect(reduceUi(shown, { type: "toastShown", id: "z" })).toBe(shown);
    const gone = reduceUi(shown, { type: "toastGone", id: "a" });
    expect(gone.toasts.map((t) => t.id)).toEqual(["b"]);
    expect(reduceUi(gone, { type: "toastGone", id: "a" })).toBe(gone);
  });

  it("notice: a refused act or preview, until cleared", () => {
    const refused = after({ type: "notice", notice: "workshop" });
    expect(refused.notice).toBe("workshop");
    expect(reduceUi(refused, { type: "notice", notice: "workshop" })).toBe(refused);
    expect(reduceUi(refused, { type: "notice", notice: undefined }).notice).toBeUndefined();
  });
});
