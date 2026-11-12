import { useState } from "react";
import { ui } from "../text/ui";
import { playSound } from "./sfx";
import s from "./TitleScreen.module.css";
import { FalconEmblem } from "./Transition";

/** How long the title takes to clear after the tap. */
const LEAVE_MS = 450;

/**
 * The title screen (owner 2026-11-12, like Umamusume's): a sky that slowly changes color, the
 * game's name and «Tocá para empezar» breathing in and out. A tap anywhere starts; that first tap
 * is also the gesture the browser needs before it plays sound or music.
 */
export function TitleScreen({ onStart }: { onStart: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const start = () => {
    if (leaving) return;
    setLeaving(true);
    playSound("confirm");
    setTimeout(onStart, LEAVE_MS);
  };
  return (
    <button
      type="button"
      className={s.title}
      data-leaving={leaving || undefined}
      id="m-titulo"
      aria-label={ui("ui.m.title.tap")}
      onClick={start}
    >
      <span className={s.sky} aria-hidden="true" />
      <span className={s.glow} aria-hidden="true" />
      <span className={s.logo} aria-hidden="true">
        <FalconEmblem className={s.emblem} />
        <span className={s.name}>
          <span className={s.outline}>FALCONESS</span>
          <span className={s.word}>FALCONESS</span>
        </span>
      </span>
      <span className={s.tap}>{ui("ui.m.title.tap")}</span>
    </button>
  );
}
