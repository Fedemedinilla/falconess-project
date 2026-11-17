import { useSyncExternalStore } from "react";

/**
 * A hidden tab (plan §2.3, 6.11; critic b: two clocks): the player switched to another tab, went
 * to the phone's home screen or locked it. The game's flow timers pause while it is hidden and go
 * on with the time each had left (`ui/timer.ts` `pauseWhileHidden`), the column's CSS stops with
 * them (`data-hidden`, Mobile.module.css), and what counts its own time reads `visibleNow`, a clock
 * that stands still while the tab is hidden. So nothing of a beat ends, sounds or comes in out of
 * sight, and what was on screen goes on from where it was.
 */

/** Where the visibility comes from: the page (`document`), or a test's. */
export type VisibilitySource = {
  /** Whether the page is hidden now. */
  readonly hidden: () => boolean;
  /** Calls `changed` whenever it may have changed; returns what stops listening. */
  readonly listen: (changed: () => void) => () => void;
  /** The time, ms (`performance.now()`). */
  readonly now: () => number;
};

export type Visibility = {
  /** Whether the tab is hidden. */
  readonly hidden: () => boolean;
  /** `listener` hears each change of `hidden`; returns what stops it. */
  readonly subscribe: (listener: () => void) => () => void;
  /** The time the tab has been in sight, ms: `now()` less every moment it was hidden. */
  readonly visibleNow: () => number;
};

/** The visibility of `source`, followed from now on. */
export function createVisibility(source: VisibilitySource): Visibility {
  let hidden = source.hidden();
  /** When the tab was hidden last (while it is). */
  let hiddenAt = source.now();
  /** How long it was hidden before that, in all. */
  let away = 0;
  const listeners = new Set<() => void>();
  source.listen(() => {
    const next = source.hidden();
    if (next === hidden) return;
    const now = source.now();
    if (next) hiddenAt = now;
    else away += now - hiddenAt;
    hidden = next;
    for (const listener of [...listeners]) listener();
  });
  return {
    hidden: () => hidden,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    visibleNow: () => (hidden ? hiddenAt : source.now()) - away,
  };
}

/** The page's own: `document.hidden` and `visibilitychange` (never hidden without a document). */
const PAGE_SOURCE: VisibilitySource = {
  hidden: () => typeof document !== "undefined" && document.hidden,
  listen: (changed) => {
    if (typeof document === "undefined") return () => undefined;
    document.addEventListener("visibilitychange", changed);
    return () => document.removeEventListener("visibilitychange", changed);
  },
  now: () => performance.now(),
};

let page: Visibility | undefined;

/** The page's visibility, followed from its first use. */
export function pageVisibility(): Visibility {
  page ??= createVisibility(PAGE_SOURCE);
  return page;
}

/** The time the page has been in sight, ms (`performance.now()` less the time it was hidden). */
export function visibleNow(): number {
  return pageVisibility().visibleNow();
}

/** Whether the page is hidden right now. */
export function isHidden(): boolean {
  return pageVisibility().hidden();
}

/** Whether the page is hidden, kept up to date: for what a component renders. */
export function useHidden(): boolean {
  const v = pageVisibility();
  return useSyncExternalStore(v.subscribe, v.hidden, () => false);
}
