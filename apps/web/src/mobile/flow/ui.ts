/**
 * What the phone's flow keeps in React (plan §1.3): where the player went at idle, the beats this
 * mount finished, the notice. Everything else is derived from the stores (`deriveFlow`). Pure,
 * total and text-free: an event that changes nothing returns the same state, so a stale or
 * repeated tap renders nothing new.
 */
import type { StoryScene, TrainingKind } from "@falconess/schema";
import type { GameErrorKind } from "../../game/controller";
import type { Nav, WorkshopTab } from "./types";

/** A refused act or preview, named as `ui.error.<kind>` names it. */
export type Notice = {
  readonly kind: GameErrorKind;
  /** Tells one refusal from the next, the same kind again too: each is a notice of its own. */
  readonly n: number;
  /** Set on its first display. */
  readonly shown: boolean;
};

export type UiState = {
  readonly nav: Nav;
  /** Makes the keys of a watch, a replayed scene and a notice unique: a key that comes back is a new one. */
  readonly seq: number;
  /** The beats finished in this mount, by key. */
  readonly done: ReadonlySet<string>;
  /** The runs (fingerprints) whose race week was decided in this mount: a restored week opens covered. */
  readonly mine: ReadonlySet<string>;
  /** Where the race week's action was decided: the screen the emblem rises over. */
  readonly from: "menu" | "train" | "workshop";
  /** A scene asked for from «Historia». */
  readonly replay: { readonly scene: StoryScene; readonly n: number } | undefined;
  /** A refused act or preview, until it is closed or its time is up. */
  readonly notice: Notice | undefined;
  /**
   * The week whose track drawer already opened by itself (owner 2026-11-18): it opens once a race
   * week, so leaving to the workshop and coming back does not open it again, and closing it keeps
   * it closed until the next race week.
   */
  readonly trackWeek: number | undefined;
};

export type UiEvent =
  | { readonly type: "open"; readonly to: "menu" | "train" | "workshop" | "skills" | "plan" }
  | { readonly type: "select"; readonly kind: TrainingKind }
  | { readonly type: "tab"; readonly tab: WorkshopTab }
  /** A normal week committed: back to the menu. */
  | { readonly type: "acted" }
  /** A race week's action decided (its preview played). */
  | { readonly type: "decided"; readonly fp: string; readonly from: "menu" | "train" | "workshop" }
  /** «Correr» committed: back to the menu once the race mode ends. */
  | { readonly type: "raced" }
  /** Beats finished; a race's result (`…/race:result`) also ends a watch from it. */
  | { readonly type: "done"; readonly keys: readonly string[] }
  | { readonly type: "watch"; readonly turn: number; readonly from: "result" | "end" }
  | { readonly type: "watchStage"; readonly n: number; readonly stage: "finish" | "result" }
  | { readonly type: "watchDone"; readonly n: number }
  | { readonly type: "replay"; readonly scene: StoryScene | undefined }
  /** A refused act or preview (a new notice each time), or none. */
  | { readonly type: "notice"; readonly notice: GameErrorKind | undefined }
  | { readonly type: "noticeShown"; readonly n: number }
  | { readonly type: "noticeGone"; readonly n: number }
  /** The track drawer of a race week opened by itself (or the player closed it): once a week. */
  | { readonly type: "trackShown"; readonly turn: number };

const MENU: Nav = Object.freeze({ at: "menu" });

/** A new mount: the menu, nothing done. A new run or season remounts the run's view, so this. */
export const INITIAL_UI: UiState = Object.freeze({
  nav: MENU,
  seq: 0,
  done: new Set<string>(),
  mine: new Set<string>(),
  from: "menu",
  replay: undefined,
  notice: undefined,
  trackWeek: undefined,
});

/** The set with `items`, or the same set when it had them all. */
function adding(set: ReadonlySet<string>, items: readonly string[]): ReadonlySet<string> {
  if (items.every((i) => set.has(i))) return set;
  return new Set([...set, ...items]);
}

function navOf(to: Extract<UiEvent, { type: "open" }>["to"]): Nav {
  switch (to) {
    case "menu":
      return MENU;
    case "train":
      return { at: "train", selected: undefined };
    case "workshop":
      return { at: "workshop", tab: "wings" };
    case "skills":
      return { at: "workshop", tab: "skills" };
    case "plan":
      return { at: "plan" };
  }
}

/**
 * The state after `e`. Ignored, returning `ui` itself: a pick or a tab off its screen, a watch's
 * stage or end for another watch (a stale `n`) or with none, a notice shown or gone that is not
 * there, and anything that would change nothing.
 */
export function reduceUi(ui: UiState, e: UiEvent): UiState {
  switch (e.type) {
    case "open": {
      const nav = navOf(e.to);
      const same =
        nav.at === ui.nav.at &&
        (nav.at !== "workshop" || (ui.nav.at === "workshop" && ui.nav.tab === nav.tab)) &&
        (nav.at !== "train" || (ui.nav.at === "train" && ui.nav.selected === undefined));
      return same ? ui : { ...ui, nav };
    }
    case "select":
      if (ui.nav.at !== "train" || ui.nav.selected === e.kind) return ui;
      return { ...ui, nav: { at: "train", selected: e.kind } };
    case "tab":
      if (ui.nav.at !== "workshop" || ui.nav.tab === e.tab) return ui;
      return { ...ui, nav: { at: "workshop", tab: e.tab } };
    case "acted":
    case "raced":
      return ui.nav.at === "menu" ? ui : { ...ui, nav: MENU };
    case "decided": {
      const mine = adding(ui.mine, [e.fp]);
      return mine === ui.mine && ui.from === e.from ? ui : { ...ui, mine, from: e.from };
    }
    case "done": {
      const done = adding(ui.done, e.keys);
      const ends =
        ui.nav.at === "watch" &&
        ui.nav.from === "result" &&
        e.keys.some((k) => k.endsWith("/race:result"));
      if (done === ui.done && !ends) return ui;
      return { ...ui, done, nav: ends ? MENU : ui.nav };
    }
    case "watch": {
      const n = ui.seq + 1;
      return {
        ...ui,
        seq: n,
        nav: { at: "watch", turn: e.turn, from: e.from, n, stage: "replay" },
      };
    }
    case "watchStage":
      if (ui.nav.at !== "watch" || ui.nav.n !== e.n || ui.nav.stage === e.stage) return ui;
      return { ...ui, nav: { ...ui.nav, stage: e.stage } };
    case "watchDone":
      if (ui.nav.at !== "watch" || ui.nav.n !== e.n) return ui;
      return { ...ui, nav: MENU };
    case "replay": {
      if (e.scene === undefined) return ui.replay ? { ...ui, replay: undefined } : ui;
      const n = ui.seq + 1;
      return { ...ui, seq: n, replay: { scene: e.scene, n } };
    }
    case "notice": {
      if (e.notice === undefined) return ui.notice ? { ...ui, notice: undefined } : ui;
      const n = ui.seq + 1;
      return { ...ui, seq: n, notice: { kind: e.notice, n, shown: false } };
    }
    case "noticeShown":
      if (ui.notice?.n !== e.n || ui.notice.shown) return ui;
      return { ...ui, notice: { ...ui.notice, shown: true } };
    case "noticeGone":
      return ui.notice?.n === e.n ? { ...ui, notice: undefined } : ui;
    case "trackShown":
      return ui.trackWeek === e.turn ? ui : { ...ui, trackWeek: e.turn };
  }
}
