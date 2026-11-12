import type { StoryScene } from "@falconess/schema";
import { useEffect, useRef } from "react";
import { gameText, ui } from "../text/ui";
import { cx } from "../ui/cx";
import s from "./Mobile.module.css";

/** «Historia» in the menu: every scene of this Falconess already seen in this browser, to watch again. */
export function StoryListSheet({
  open,
  scenes,
  onWatch,
  onClose,
}: {
  open: boolean;
  scenes: readonly StoryScene[];
  onWatch: (scene: StoryScene) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      if (typeof d.showModal === "function") d.showModal();
      else d.setAttribute("open", "");
    } else if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={s.sheet}
      id="m-historia"
      aria-labelledby="m-historia-titulo"
      onClose={onClose}
    >
      <div className={s.dl}>
        <h2 className={s.dlTitle} id="m-historia-titulo">
          {ui("ui.m.story.title")}
        </h2>
        {scenes.length === 0 && <p className={s.exportWhat}>{ui("ui.m.story.empty")}</p>}
        <ul className={s.histList}>
          {scenes.map((sc) => (
            <li key={sc.id} className={s.histRow} data-scene={sc.id}>
              <span className={s.histT}>
                <span>{gameText(sc.kickerKey)}</span>
                <b>{gameText(sc.titleKey)}</b>
              </span>
              <button type="button" className={s.histBtn} onClick={() => onWatch(sc)}>
                {ui("ui.m.story.watch")}
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className={cx(s.btn, s.btnDark)}
          id="m-historia-cerrar"
          onClick={onClose}
        >
          {ui("ui.m.close")}
        </button>
      </div>
    </dialog>
  );
}
