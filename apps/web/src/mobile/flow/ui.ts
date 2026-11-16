/**
 * What the phone's flow keeps in React (plan §1.3): where the player went at idle, the beats this
 * mount finished, the notices. Everything else is derived from the stores (`deriveFlow`). Pure,
 * total and text-free: an event that changes nothing returns the same state, so a stale or
 * repeated tap renders nothing new.
 */
import type { StoryScene, TrainingKind } from "@falconess/schema";
import type { GameErrorKind } from "../../game/controller";
import type { Nav, WorkshopTab } from "./types";

/** A notice about a story scene: played («skipped», «seen») or passed by (seen in another season). */
export type Toast = {
  /** `${fp}/${sceneId}/${kind}`: the same for the same moment, so StrictMode's second run adds nothing. */
  readonly id: string;
  readonly sceneId: string;
  readonly kind: "skipped" | "seen" | "passed";
  /** Set on its first display; once shown and gone it never comes back (F23). */
  readonly shown: boolean;
};

export type UiState = {
  readonly nav: Nav;
  /** Makes the keys of a watch and of a replayed scene unique: a key that comes back is a new one. */
  readonly seq: number;
  /** The beats finished in this mount, by key. */
  readonly done: ReadonlySet<string>;
  /** The runs (fingerprints) whose race week was decided in this mount: a restored week opens covered. */
  readonly mine: ReadonlySet<string>;
  /** Where the race week's action was decided: the screen the emblem rises over. */
  readonly from: "menu" | "train" | "workshop";
  /** A scene asked for from «Historia» or «Ver». */
  readonly replay: { readonly scene: StoryScene; readonly n: number } | undefined;
  /** First in, first out, two at most: a newer one replaces the second, never the first. */
  readonly toasts: readonly Toast[];
  /** A refused act or preview, named as `ui.error.<kind>` names it. */
  readonly notice: GameErrorKind | undefined;
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
  | { readonly type: "toast"; readonly toast: Toast }
  | { readonly type: "toastShown"; readonly id: string }
  | { readonly type: "toastGone"; readonly id: string }
  | { readonly type: "notice"; readonly notice: GameErrorKind | undefined };

const MENU: Nav = Object.freeze({ at: "menu" });

/** A new mount: the menu, nothing done. A new run or season remounts the run's view, so this. */
export const INITIAL_UI: UiState = Object.freeze({
  nav: MENU,
  seq: 0,
  done: new Set<string>(),
  mine: new Set<string>(),
  from: "menu",
  replay: undefined,
  toasts: [],
  notice: undefined,
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
 * stage or end for another watch (a stale `n`) or with none, a toast already queued, a toast
 * shown or gone that is not there, and anything that would change nothing.
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
    case "toast": {
      if (ui.toasts.some((t) => t.id === e.toast.id)) return ui;
      const [first] = ui.toasts;
      return {
        ...ui,
        toasts: first && ui.toasts.length >= 2 ? [first, e.toast] : [...ui.toasts, e.toast],
      };
    }
    case "toastShown":
      if (!ui.toasts.some((t) => t.id === e.id && !t.shown)) return ui;
      return { ...ui, toasts: ui.toasts.map((t) => (t.id === e.id ? { ...t, shown: true } : t)) };
    case "toastGone":
      if (!ui.toasts.some((t) => t.id === e.id)) return ui;
      return { ...ui, toasts: ui.toasts.filter((t) => t.id !== e.id) };
    case "notice":
      return ui.notice === e.notice ? ui : { ...ui, notice: e.notice };
  }
}
