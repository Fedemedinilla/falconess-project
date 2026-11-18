import { type RefObject, useLayoutEffect, useRef, useState } from "react";
import { MOTION } from "../mobile/motion";
import { sheetClosed, useModalOpen } from "./modals";
import { useLatest } from "./useLatest";
import { useReducedMotion } from "./useMedia";

/** Where a sheet is: out of the page, open, or closing (still in the page, already released). */
export type SheetPhase = "closed" | "open" | "closing";

/** A sheet's phase once its `open` prop is known: asked closed, an open sheet starts closing. */
export function sheetPhase(phase: SheetPhase, open: boolean): SheetPhase {
  if (open) return "open";
  return phase === "closed" ? "closed" : "closing";
}

/**
 * Where a sheet of the phone game is, from its `open` prop (M9): on its close request it stays
 * closing for its way out (`MOTION.sheetOut`; at once under reduced motion), then `onEnd` runs and
 * it leaves the page. A timer ends the closing, never the animation's end; asked open again while
 * closing, it is open again (the same element).
 */
export function useSheetPhase(open: boolean, onEnd?: () => void): SheetPhase {
  const [phase, setPhase] = useState<SheetPhase>(open ? "open" : "closed");
  const next = sheetPhase(phase, open);
  if (next !== phase) setPhase(next);
  const end = useLatest(onEnd);
  const outMs = useReducedMotion() ? 0 : MOTION.sheetOut;
  useLayoutEffect(() => {
    if (phase !== "closing") return;
    const done = () => {
      end.current?.();
      setPhase("closed");
    };
    if (outMs === 0) {
      done();
      return;
    }
    const timer = setTimeout(done, outMs);
    return () => clearTimeout(timer);
  }, [phase, outMs, end]);
  return next;
}

/**
 * What a sheet shows: `value` while it is open; once it closes, the last value it had open, so it
 * fades out with what it showed (a panel, a save, a crew's bond before the outing it started).
 */
export function useHeld<T>(value: T, open: boolean): T {
  const last = useRef(value);
  useLayoutEffect(() => {
    if (open) last.current = value;
  });
  return open ? value : last.current;
}

/**
 * What had the focus when a sheet opened, and the sheet it sat in, if any: a sheet opened from
 * another one's button (Metas, «Temporadas anteriores», «Historia», «Exportar partida» from
 * «Menú») opens while that one is still on its way out (6.9), so the button it would give the
 * focus back to leaves the page with it. Then the focus goes back to what opened that sheet.
 */
type Opener = { readonly el: Element | null; readonly from: HTMLDialogElement | null };
const openers = new WeakMap<HTMLDialogElement, Opener>();

/** Where a sheet's focus goes back to: its opener, else (through the sheets it was opened from) theirs. */
function returnTarget(d: HTMLDialogElement): HTMLElement | undefined {
  return targetOf(openers.get(d));
}

/** `o`'s element if it is still live, else (through the sheets it was opened from) theirs. */
function targetOf(first: Opener | undefined): HTMLElement | undefined {
  let o = first;
  for (let hops = 0; o && hops < 8; hops++) {
    const el = o.el;
    if (
      el instanceof HTMLElement &&
      el !== document.body &&
      el.isConnected &&
      !el.closest("[inert]")
    )
      return el;
    o = o.from ? openers.get(o.from) : undefined;
  }
  return undefined;
}

/** A sheet's own title, the element it is named by (`aria-labelledby`), if it is in it. */
function title(d: HTMLDialogElement): HTMLElement | null {
  const id = d.getAttribute("aria-labelledby");
  return id ? d.querySelector<HTMLElement>(`#${CSS.escape(id)}`) : null;
}

/** Whether the focus fell out of the game: on the page, gone with its element, or under `inert`. */
function focusLost(): boolean {
  const a = document.activeElement;
  return a === null || a === document.body || !a.isConnected || a.closest("[inert]") !== null;
}

/**
 * The focus of a sheet that is no native `<dialog>` (the chat, which stays inside the game's
 * column): what had it when the sheet opened (and the sheet that sat in), and at its close request
 * the focus goes back there, or through the sheets it was opened from to theirs, if it fell out of
 * the game (it was in the sheet, which is inert from then).
 */
export function useFocusReturn(open: boolean): void {
  const opener = useRef<Opener | undefined>(undefined);
  // read as the open is asked (its render): the commit that opens it can make the opener inert
  // (the wide screen's panel under the chat), and an element made inert loses the focus at once
  if (open && opener.current === undefined) {
    const el = document.activeElement;
    opener.current = { el, from: el?.closest("dialog") ?? null };
  }
  useLayoutEffect(() => {
    if (open) return;
    const o = opener.current;
    opener.current = undefined;
    if (o && focusLost()) targetOf(o)?.focus({ preventScroll: true });
  }, [open]);
}

/**
 * A sheet of the phone game as a native modal `<dialog>`: in the page only while it is open or
 * closing (`mounted`), shown with `showModal` (the focus moves in and the page behind is inert)
 * and closed natively before it leaves the page, so the focus goes back to what opened it. It
 * counts in `ui/modals` from its open until its close request, with `onClose` as what the back
 * gesture does to it (O10: the browser's Back and iOS's swipe; Android's back and Escape ask it
 * to close here, as its «Cerrar» does).
 *
 * Its way in is CSS (`.sheet[open]`, 220 ms); on its close request it is released at once (what
 * it started goes on under it) but stays modal and `inert` with `data-closing` for its 180 ms way
 * out (`useSheetPhase`), then closes natively and leaves.
 *
 * `onClose` hears every close, as the dialog's close event did when it stayed in the page: the
 * dialog's own (put `onClose` on the `<dialog>` too), and the one this hook makes when it leaves
 * (a pick, «Cerrar», a wide screen).
 */
export function useModalDialog(
  open: boolean,
  onClose: () => void,
): { readonly ref: RefObject<HTMLDialogElement | null>; readonly mounted: boolean } {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useLatest(onClose);
  useModalOpen(open, onClose);
  const phase = useSheetPhase(open, () => {
    const d = ref.current;
    if (d?.open) {
      if (typeof d.close === "function") d.close();
      else d.removeAttribute("open");
      // the native close gives the focus back to what had it at the open; when that left the
      // page (a button of «Menú», which closed meanwhile), to what opened «Menú»
      if (focusLost()) returnTarget(d)?.focus({ preventScroll: true });
      closeRef.current();
      sheetClosed();
    }
  });
  useLayoutEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (phase === "open") {
      d.removeAttribute("data-closing");
      d.inert = false;
      if (!d.open) {
        const el = document.activeElement;
        openers.set(d, { el, from: el?.closest("dialog") ?? null });
        if (typeof d.showModal === "function") d.showModal();
        else d.setAttribute("open", "");
        // A sheet opens at its top (L6): `showModal` focuses the first control in it, and a sheet
        // longer than the screen (the guide) scrolled to its end to show it. Its title takes the
        // focus instead, which also names the sheet to a screen reader.
        title(d)?.focus({ preventScroll: true });
        d.scrollTop = 0;
      }
    } else if (phase === "closing") {
      // its way out: still over the page, nothing of it takes a tap or a key
      d.setAttribute("data-closing", "");
      d.inert = true;
    }
  }, [phase]);
  // Escape (and Android's back) ask it to close as its «Cerrar» does, so it leaves the same way
  const mounted = phase !== "closed";
  useLayoutEffect(() => {
    const d = ref.current;
    if (!mounted || !d) return;
    const cancel = (e: Event) => {
      e.preventDefault();
      closeRef.current();
    };
    d.addEventListener("cancel", cancel);
    return () => d.removeEventListener("cancel", cancel);
  }, [mounted, closeRef]);
  return { ref, mounted };
}
