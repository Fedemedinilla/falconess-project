import { useLayoutEffect, useSyncExternalStore } from "react";
import { useLatest } from "./useLatest";

/**
 * Which sheets are open (F10): a sheet of the phone game (`useModalDialog`) or its chat counts
 * from its open until its close request, never until it leaves the page, so a pick that closes a
 * sheet does not hold what comes next. EventDialog never registers: it is a layer of the week.
 */
export type ModalRegistry = {
  /**
   * Counts one more sheet open, with the close its own «Cerrar» makes; the returned release counts
   * it closed (once, if run again).
   */
  readonly hold: (close?: () => void) => () => void;
  readonly anyOpen: () => boolean;
  /**
   * Closes the sheet opened last of those still open, as its own «Cerrar» does (the back gesture,
   * O10): false when none is open.
   */
  readonly closeTop: () => boolean;
  /** Calls `listener` whenever `anyOpen` changes; returns the unsubscribe. */
  readonly subscribe: (listener: () => void) => () => void;
};

export function createModalRegistry(): ModalRegistry {
  // the sheets open, in the order they opened
  const open: { readonly close: (() => void) | undefined }[] = [];
  const listeners = new Set<() => void>();
  const changed = (was: boolean) => {
    if (was !== open.length > 0) for (const listener of [...listeners]) listener();
  };
  return {
    hold: (close) => {
      const sheet = { close };
      const was = open.length > 0;
      open.push(sheet);
      changed(was);
      let held = true;
      return () => {
        if (!held) return;
        held = false;
        const before = open.length > 0;
        open.splice(open.indexOf(sheet), 1);
        changed(before);
      };
    },
    anyOpen: () => open.length > 0,
    closeTop: () => {
      const top = open.at(-1);
      if (!top) return false;
      top.close?.();
      return true;
    },
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
 * it in the same commit, and so does leaving the page. `onClose` is what its own «Cerrar» does.
 */
export function useModalOpen(open: boolean, onClose: () => void): void {
  const close = useLatest(onClose);
  useLayoutEffect(() => (open ? modals.hold(() => close.current()) : undefined), [open, close]);
}

/** Whether any sheet or the chat is open now, kept up to date. */
export function useAnyModalOpen(): boolean {
  return useSyncExternalStore(modals.subscribe, modals.anyOpen, modals.anyOpen);
}

/** Closes the sheet (or the chat) opened last, as its own «Cerrar» does: false when none is open. */
export function closeTopModal(): boolean {
  return modals.closeTop();
}

/** Who hears that a sheet has just closed natively (`useLayerFocus`). */
const closedListeners = new Set<() => void>();

/**
 * A sheet has just closed natively, at the end of its way out (`useModalDialog`): the focus it
 * gave back to what opened it may have found nothing live (a layer came in under it).
 */
export function sheetClosed(): void {
  for (const listener of [...closedListeners]) listener();
}

/** Calls `listener` each time a sheet has closed natively; returns the unsubscribe. */
export function onSheetClosed(listener: () => void): () => void {
  closedListeners.add(listener);
  return () => {
    closedListeners.delete(listener);
  };
}
