import { useEffect } from "react";
import type { GameErrorKind } from "../game/controller";
import { ui } from "../text/ui";
import { cx } from "../ui/cx";
import { useLatest } from "../ui/useLatest";
import { useLayersIdle } from "./LayerHost";
import st from "./Story.module.css";

/** How long the notice stays (plan §1.9: an error's notice lives as long as a passed scene's). */
const ERROR_MS = 6000;

/**
 * What a tap could not do (F7, critic b): a refused week's action or «Correr», or a race week's
 * preview that failed, in `ui.error.<kind>`'s words, under the top bar until it is closed or its
 * time is up; the week stays as it was. It waits while a layer is in front. Minimal: 5.9 folds it
 * into the notices' host.
 */
export function ErrorNotice({
  kind,
  onClose,
}: {
  readonly kind: GameErrorKind;
  readonly onClose: () => void;
}) {
  const idle = useLayersIdle();
  const close = useLatest(onClose);
  useEffect(() => {
    if (!idle) return;
    const t = setTimeout(() => close.current(), ERROR_MS);
    return () => clearTimeout(t);
  }, [idle, close]);
  if (!idle) return null;
  return (
    <div
      className={cx(st.toast, st.toastLong)}
      id="m-aviso-error"
      role="alert"
      style={{ top: 124 }}
    >
      <span className={st.toastRow}>
        {ui(`ui.error.${kind}`)}
        <button type="button" className={st.toastBtn} onClick={onClose}>
          {ui("ui.error.dismiss")}
        </button>
      </span>
    </div>
  );
}
