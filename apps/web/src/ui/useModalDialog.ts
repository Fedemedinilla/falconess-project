import { type RefObject, useLayoutEffect, useRef, useState } from "react";
import { useModalOpen } from "./modals";
import { useLatest } from "./useLatest";

/** Where a sheet is: out of the page, open, or closing (still in the page, already released). */
export type SheetPhase = "closed" | "open" | "closing";

/** A sheet's phase once its `open` prop is known: asked closed, an open sheet starts closing. */
export function sheetPhase(phase: SheetPhase, open: boolean): SheetPhase {
  if (open) return "open";
  return phase === "closed" ? "closed" : "closing";
}

/**
 * A sheet of the phone game as a native modal `<dialog>`: in the page only while it is open or
 * closing (`mounted`), shown with `showModal` (the focus moves in and the page behind is inert)
 * and closed natively before it leaves the page, so the focus goes back to what opened it. It
 * counts in `ui/modals` from its open until its close request.
 *
 * `onClose` hears every close, as the dialog's close event did when it stayed in the page: the
 * dialog's own (Escape, Android's back: put `onClose` on the `<dialog>` too), and the one this
 * hook makes when `open` turns false (a pick, «Cerrar», a wide screen).
 */
export function useModalDialog(
  open: boolean,
  onClose: () => void,
): { readonly ref: RefObject<HTMLDialogElement | null>; readonly mounted: boolean } {
  const ref = useRef<HTMLDialogElement>(null);
  const [phase, setPhase] = useState<SheetPhase>(open ? "open" : "closed");
  const next = sheetPhase(phase, open);
  if (next !== phase) setPhase(next);
  const closeRef = useLatest(onClose);
  useModalOpen(open);
  useLayoutEffect(() => {
    const d = ref.current;
    if (phase === "open") {
      if (d && !d.open) {
        if (typeof d.showModal === "function") d.showModal();
        else d.setAttribute("open", "");
      }
    } else if (phase === "closing") {
      if (d?.open) {
        if (typeof d.close === "function") d.close();
        else d.removeAttribute("open");
        closeRef.current();
      }
      setPhase("closed");
    }
  }, [phase, closeRef]);
  return { ref, mounted: next !== "closed" };
}
