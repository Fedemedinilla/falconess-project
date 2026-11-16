import { useLayoutEffect, useSyncExternalStore } from "react";

/**
 * Which sheets are open (F10): a sheet of the phone game (`useModalDialog`) or its chat counts
 * from its open until its close request, never until it leaves the page, so a pick that closes a
 * sheet does not hold what comes next. EventDialog never registers: it is a layer of the week.
 */
export type ModalRegistry = {
  /** Counts one more sheet open; the returned release counts it closed (once, if run again). */
  readonly hold: () => () => void;
  readonly anyOpen: () => boolean;
  /** Calls `listener` whenever `anyOpen` changes; returns the unsubscribe. */
  readonly subscribe: (listener: () => void) => () => void;
};

export function createModalRegistry(): ModalRegistry {
  let count = 0;
  const listeners = new Set<() => void>();
  const set = (next: number) => {
    const was = count > 0;
    count = next;
    if (was !== count > 0) for (const listener of [...listeners]) listener();
  };
  return {
    hold: () => {
      set(count + 1);
      let held = true;
      return () => {
        if (!held) return;
        held = false;
        set(count - 1);
      };
    },
    anyOpen: () => count > 0,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** The page's registry. */
const modals = createModalRegistry();

/**
 * Counts this sheet open while `open` is true: its close request (`open` turning false) releases
 * it in the same commit, and so does leaving the page.
 */
export function useModalOpen(open: boolean): void {
  useLayoutEffect(() => (open ? modals.hold() : undefined), [open]);
}

/** Whether any sheet or the chat is open now, kept up to date. */
export function useAnyModalOpen(): boolean {
  return useSyncExternalStore(modals.subscribe, modals.anyOpen, modals.anyOpen);
}
