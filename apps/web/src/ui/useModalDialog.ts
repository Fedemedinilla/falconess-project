import { type RefObject, useCallback, useLayoutEffect, useRef, useState } from "react";
import { MOTION } from "../mobile/motion";
import { sheetClosed, useModalOpen } from "./modals";
import { useLatest } from "./useLatest";
import { useReducedMotion } from "./useMedia";

/** Where a sheet is: out of the page, open, or closing (its way out playing, already released). */
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
 * closing, it is open again (the same element). A native sheet is already closed while closing:
 * only its copy fades (`useModalDialog`).
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
      !el.closest("[inert]") &&
      // a sheet closed at its close request stays in the page for its way out, hidden
      !el.closest("dialog:not([open])")
    )
      return el;
    o = o.from ? openers.get(o.from) : undefined;
  }
  return undefined;
}

/**
 * Whether `o`, through the sheets it was opened from, comes from `d` itself: «Volver» on a level
 * of «Menú» opens the root again from a button of the level, which the root opened. The root keeps
 * what opened it first then, or the focus would go round in that circle.
 */
function leadsTo(first: Opener, d: HTMLDialogElement): boolean {
  let o: Opener | undefined = first;
  for (let hops = 0; o?.from && hops < 8; hops++) {
    if (o.from === d) return true;
    o = openers.get(o.from);
  }
  return false;
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
 * closing (`mounted`), shown with `showModal` (the focus moves in and the page behind is inert).
 * It counts in `ui/modals` from its open until its close request, with `onClose` as what the back
 * gesture does to it (O10: the browser's Back and iOS's swipe; Android's back and Escape ask it
 * to close here, as its «Cerrar» does).
 *
 * Its way in is CSS (`.sheet[open]`, 220 ms). On its close request it closes natively at once
 * (ADR-0017 §9; open decision 2, resolved 2026-11-28): the page is in reach again from that tap, the
 * focus goes back to what opened it (or to what opened that), and `sheetClosed()` is said. Its
 * 180 ms way out plays on a copy (`fadingCopy`): what it showed, with its scrim, id-less, `inert`,
 * `aria-hidden`, taking no pointer, as the game's leaving layers do; a timer removes it, never the
 * animation's end. Asked open again meanwhile, the copy goes and the same `<dialog>` opens again,
 * on its title. Reduced motion: no copy, it goes at once.
 *
 * `onClose` hears every close: the one asked (a pick, «Cerrar», Escape, a wide screen) and one the
 * browser makes by itself (a close request it does not let the page cancel). The `<dialog>` takes
 * no `onClose` of its own: this hook listens to it.
 */
export function useModalDialog(
  open: boolean,
  onClose: () => void,
): { readonly ref: RefObject<HTMLDialogElement | null>; readonly mounted: boolean } {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useLatest(onClose);
  useModalOpen(open, onClose);
  const reducedRef = useLatest(useReducedMotion());
  // the copy its way out plays on, while it is in the page
  const copy = useRef<HTMLElement | null>(null);
  const dropCopy = useCallback(() => {
    copy.current?.remove();
    copy.current = null;
  }, []);
  const phase = useSheetPhase(open, dropCopy);
  const phaseRef = useLatest(phase);
  useLayoutEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (phase === "open") {
      dropCopy();
      if (!d.open) {
        const el = document.activeElement;
        const opener: Opener = { el, from: el?.closest("dialog") ?? null };
        const before = openers.get(d);
        openers.set(d, before && leadsTo(opener, d) ? before : opener);
        if (typeof d.showModal === "function") d.showModal();
        else d.setAttribute("open", "");
        // A sheet opens at its top (L6): `showModal` focuses the first control in it, and a sheet
        // longer than the screen (the guide) scrolled to its end to show it. Its title takes the
        // focus instead, which also names the sheet to a screen reader.
        title(d)?.focus({ preventScroll: true });
        d.scrollTop = 0;
      }
    } else if (phase === "closing") {
      if (d.open) {
        if (!reducedRef.current) copy.current = fadingCopy(d);
        if (typeof d.close === "function") d.close();
        else d.removeAttribute("open");
      }
      // the native close gives the focus back to what had it at the open; when that cannot take
      // it (it left the page, or it is inert or hidden now), the focus would stay a moment on a
      // control of the closed sheet: it leaves it, and goes back to what opened the sheet, or
      // (a button of «Menú», which closed meanwhile) to what opened «Menú»
      const a = document.activeElement;
      if (a instanceof HTMLElement && d.contains(a)) a.blur();
      if (focusLost()) returnTarget(d)?.focus({ preventScroll: true });
      closeRef.current();
      sheetClosed();
    }
  }, [phase, dropCopy, closeRef, reducedRef]);
  // the copy goes with the sheet's component, wherever that leaves the page
  useLayoutEffect(() => dropCopy, [dropCopy]);
  // Escape (and Android's back) ask it to close as its «Cerrar» does, so it leaves the same way; a
  // close the browser makes by itself while it is open is heard as one asked
  const mounted = phase !== "closed";
  useLayoutEffect(() => {
    const d = ref.current;
    if (!mounted || !d) return;
    const cancel = (e: Event) => {
      e.preventDefault();
      closeRef.current();
    };
    const closed = () => {
      if (phaseRef.current === "open") closeRef.current();
    };
    d.addEventListener("cancel", cancel);
    d.addEventListener("close", closed);
    return () => {
      d.removeEventListener("cancel", cancel);
      d.removeEventListener("close", closed);
    };
  }, [mounted, closeRef, phaseRef]);
  return { ref, mounted };
}

/**
 * The copy a sheet fades out on (ADR-0017 §9, open decision 2 resolved 2026-11-28): what the sheet
 * showed as its close was asked, in its place over the page, with its scrim, but id-less, `inert`,
 * `aria-hidden` and taking no pointer, as the game's leaving layers are. A manual popover, so it
 * stands in the top layer, where the sheet was, without making the page under it inert. None
 * where the browser has no popovers: the sheet just goes at once there.
 */
function fadingCopy(d: HTMLDialogElement): HTMLElement | null {
  if (typeof d.showPopover !== "function") return null;
  const box = d.getBoundingClientRect();
  const copy = document.createElement("div");
  copy.className = d.className;
  copy.setAttribute("data-closing", "");
  copy.setAttribute("data-sheet-copy", "");
  copy.setAttribute("aria-hidden", "true");
  copy.inert = true;
  copy.popover = "manual";
  Object.assign(copy.style, {
    position: "fixed",
    inset: "auto",
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    margin: "0",
    overflow: "hidden",
  });
  for (const child of d.childNodes) copy.append(child.cloneNode(true));
  // one element per id, and no radio of it joins a group of the page
  for (const el of copy.querySelectorAll("[id], [name]")) {
    el.removeAttribute("id");
    el.removeAttribute("name");
  }
  d.after(copy);
  copy.showPopover();
  copy.scrollTop = d.scrollTop;
  return copy;
}
