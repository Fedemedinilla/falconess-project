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
        if (typeof d.showModal === "function") d.showModal();
        else d.setAttribute("open", "");
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
