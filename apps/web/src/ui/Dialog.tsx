import { type ReactNode, useEffect, useId, useRef } from "react";
import { ui } from "../text/ui";
import { Button } from "./Button";
import { cx } from "./cx";
import s from "./Dialog.module.css";

export type DialogProps = {
  open: boolean;
  /** Called on Esc, on the close button, and whenever the dialog closes itself. */
  onClose: () => void;
  title: string;
  /** The dialog's buttons, right-aligned under the content. */
  footer?: ReactNode;
  size?: "md" | "lg";
  /** A stable id for the dialog element. */
  id?: string | undefined;
  children: ReactNode;
};

/**
 * A modal built into the page (the published page cannot use alert/confirm/prompt): the native
 * <dialog> in modal mode, so focus stays inside and Esc closes it.
 */
export function Dialog({ open, onClose, title, footer, size = "md", id, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const headingId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    } else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      id={id}
      className={cx(s.dialog, size === "lg" && s.lg)}
      aria-labelledby={headingId}
      onClose={onClose}
    >
      <header className={s.head}>
        <h2 className={s.title} id={headingId}>
          {title}
        </h2>
        <Button variant="ghost" size="sm" onClick={onClose}>
          {ui("ui.dialog.close")}
        </Button>
      </header>
      <div className={s.body}>{children}</div>
      {footer !== undefined && <footer className={s.foot}>{footer}</footer>}
    </dialog>
  );
}
