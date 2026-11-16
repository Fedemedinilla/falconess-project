import { useLayoutEffect } from "react";
import { flushSync } from "react-dom";
import { parseHash } from "../app/route";
import { closeTopModal, useAnyModalOpen } from "../ui/modals";
import { useLatest } from "../ui/useLatest";
import { isInstant } from "./flow/beats";
import type { Flow } from "./flow/types";

/**
 * What the back gesture (Android's back, iOS's edge swipe, the browser's Back) does where the
 * player is in #juego (owner O10, plan-final 5.6b):
 * - `rest`: the menu or the season's end, free: it leaves #juego, as it always did;
 * - `back`: a screen with «Volver» (training, the workshop, the planning card) or a sheet open:
 *   it does what «Volver», or the sheet's own «Cerrar», does;
 * - `hold`: anything of the week in front (its training's result, its effects, a card, a scene,
 *   the event), the emblem, the decided card (no «Volver» there, owner 2026-11-12), the race mode
 *   and a race seen again from the end: nothing, the player stays where she is.
 */
export type Gesture = "rest" | "back" | "hold";

/**
 * Where the gesture is, from the flow (a sheet open comes first: `useBackGesture`). Undefined for
 * an instant beat: it renders nothing, and the next commit shows what comes after it.
 */
export function gestureAt(flow: Pick<Flow, "top" | "screen" | "layer">): Gesture | undefined {
  if (isInstant(flow.top)) return undefined;
  if (flow.top.kind !== "idle" || flow.layer !== undefined) return "hold";
  switch (flow.screen.kind) {
    case "train":
    case "workshop":
    case "plan":
      return "back";
    case "menu":
    case "end":
      return "rest";
    default:
      // a race seen again from the end
      return "hold";
  }
}

/** The tab's history as the gesture uses it (`window.history`; a fake one in the tests). */
export type GestureHistory = {
  readonly state: unknown;
  pushState(data: unknown, unused: string): void;
  back(): void;
  forward(): void;
};

/** The page's back gesture over its history. */
export type BackGesture = {
  /**
   * Where the player is now, after each commit that changes it, and what `back` does there;
   * undefined: no view of #juego shows (it neither pushes nor acts).
   */
  at(where: Gesture | undefined, onBack?: () => void): void;
  /** The tab moved in its history (`popstate`). */
  popped(): void;
};

/** What the gesture's own entries carry: `{ juego: <where it was pushed> }`. */
const MARK = "juego";

function isOurs(state: unknown): boolean {
  return typeof state === "object" && state !== null && MARK in state;
}

const nothing = (): void => undefined;

/**
 * The back gesture over a tab's history (plan-final 5.6b's mechanism). Away from rest the game
 * keeps one entry of its own above #juego's (same address: the hash route never changes), so the
 * gesture lands in the game: on a screen with «Volver» it runs `onBack`; where the week plays (or
 * where `onBack` lands still away from rest: a sheet closed over the planning card) the game
 * steps forward onto its entry again, so the player stays. It never pushes a new entry for that:
 * one pushed without a tap is one the browser's own Back may skip, and the next gesture would
 * then leave #juego. Back at rest by any other way («Volver», the week's beats over, a reload on
 * the menu), the game takes its entry back with a step back of its own. The game's own steps
 * land in a task of their own; their `popstate` is not the player's, and nothing is pushed until
 * they landed: entries never pile up, and from the menu the gesture leaves #juego as it always
 * did.
 *
 * `onGame` tells whether the tab shows #juego: off it, nothing is pushed.
 */
export function backGesture(history: GestureHistory, onGame: () => boolean): BackGesture {
  let where: Gesture | undefined;
  let onBack: () => void = nothing;
  /** The game's own steps (back or forward) not landed yet: their `popstate` is not the player's. */
  let pending = 0;
  /** A gesture is being answered: where `onBack` lands settles once it is over. */
  let answering = false;
  /** The history as the place wants it: one entry of the game's away from rest, none at rest. */
  const settle = (): void => {
    if (pending > 0 || where === undefined || answering) return;
    const ours = isOurs(history.state);
    if (where === "rest") {
      if (!ours) return;
      pending += 1;
      history.back();
      return;
    }
    if (ours || !onGame()) return;
    try {
      // no address: the entry keeps #juego's (a sandboxed page refuses one, even its own)
      history.pushState({ [MARK]: where }, "");
    } catch {
      // a page that cannot push one: the gesture leaves #juego, as it did before
    }
  };
  return {
    at(next, back) {
      where = next;
      onBack = back ?? nothing;
      settle();
    },
    popped() {
      if (pending > 0) {
        pending -= 1;
        settle();
        return;
      }
      if (where === undefined || isOurs(history.state) || !onGame()) {
        settle();
        return;
      }
      // the player's gesture took the game's entry: it is one step ahead
      if (where === "back") {
        answering = true;
        try {
          onBack();
        } finally {
          answering = false;
        }
      }
      // still away from rest (the week plays, «Volver» changed nothing, a sheet closed over the
      // planning card): onto the same entry again
      if (where !== "back" && where !== "hold") return;
      pending += 1;
      history.forward();
    },
  };
}

/** The page's gesture: one per tab, listening from its first use on. */
let page: BackGesture | undefined;

function pageGesture(): BackGesture {
  if (page === undefined) {
    const gesture = backGesture(window.history, () => parseHash(window.location.hash) === "juego");
    window.addEventListener("popstate", () => gesture.popped());
    page = gesture;
  }
  return page;
}

/**
 * The back gesture of the view that shows #juego (the run's, or the selection's): `where` from
 * the flow (`gestureAt`), and `onBack`, what the screen's «Volver» does. A sheet open (or the
 * chat) comes first: the gesture closes the one opened last, as its «Cerrar» does; Android's back
 * closes a native sheet itself before it reaches the history, and then the game's entry is taken
 * back. What the gesture runs renders at once (`flushSync`), so the entry is settled for the place
 * it lands on before the next gesture.
 */
export function useBackGesture(where: Gesture | undefined, onBack?: () => void): void {
  const sheet = useAnyModalOpen();
  const back = useLatest(onBack);
  const now: Gesture | undefined = sheet ? "back" : where;
  useLayoutEffect(() => {
    // an instant beat: the next commit says
    if (now === undefined) return;
    pageGesture().at(now, () =>
      flushSync(() => {
        if (sheet) closeTopModal();
        else back.current?.();
      }),
    );
  }, [now, sheet, back]);
  // the view goes (another run, the selection, the test view): the next one says where it is
  useLayoutEffect(() => () => pageGesture().at(undefined), []);
}
