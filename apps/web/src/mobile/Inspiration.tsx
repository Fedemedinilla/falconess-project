import type { BlackBox } from "@falconess/schema";
import { useEffect } from "react";
import { gameText, ui } from "../text/ui";
import { cx } from "../ui/cx";
import { runnerArt } from "./art";
import s from "./Inspiration.module.css";
import type { InspirationScene } from "./inspirationScene";
import { playSound } from "./sfx";

/**
 * «¡Herencia!» / «¡Inspiración!» (owner 2026-11-11, like a Pokémon evolving): her art glows and
 * flashes, sparks fly, then the card says what each parent's box gave: the stat and how much
 * (or that it was at the cap, or that it did not inspire her this time) and a lifted letter.
 * Reduced motion skips straight to the card.
 */
export function InspirationOverlay({
  scene,
  falconessId,
  parents,
  onDone,
}: {
  scene: InspirationScene;
  falconessId: string;
  parents: readonly BlackBox[];
  onDone: () => void;
}) {
  const art = runnerArt(falconessId);
  useEffect(() => {
    playSound("boost");
  }, []);
  return (
    <div
      className={s.overlay}
      id="m-inspiracion"
      data-kind={scene.kind}
      role="dialog"
      aria-modal="true"
      aria-labelledby="m-inspiracion-titulo"
    >
      <div className={s.stage} aria-hidden="true">
        <div className={s.rays} />
        {art && <img className={s.art} src={art.chibi} alt="" draggable={false} />}
        {Array.from({ length: 10 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed decorative sparks
          <span key={i} className={s.spark} style={{ "--i": i }} />
        ))}
      </div>
      <div className={s.card}>
        <h2 className={s.title} id="m-inspiracion-titulo">
          {scene.kind === "start" ? ui("ui.m.inspire.start") : ui("ui.m.inspire.title")}
        </h2>
        <p className={s.sub}>
          {scene.kind === "start"
            ? ui("ui.m.inspire.start.sub")
            : ui("ui.m.inspire.sub", { turn: scene.turn })}
        </p>
        <ul className={s.list}>
          {scene.records.map((r) => {
            const box = parents[r.parent];
            const f = box && gameText(`falconess.${box.falconessId}`);
            return (
              <li
                key={r.parent}
                className={cx(s.row, !r.inspired && s.rowOff)}
                data-parent={r.parent}
                data-inspired={r.inspired}
              >
                <span className={s.box}>
                  {ui("ui.m.inspire.box", { name: f ?? "?", stars: "★".repeat(r.stars) })}
                </span>
                <span className={s.gain}>
                  {!r.inspired
                    ? ui("ui.m.inspire.none")
                    : r.gain > 0
                      ? ui("ui.m.inspire.gain", {
                          stat: gameText(`stat.${r.stat}`),
                          n: r.gain,
                        })
                      : ui("ui.m.inspire.capped", { stat: gameText(`stat.${r.stat}`) })}
                </span>
                {r.letter && (
                  <span className={s.letter}>
                    {ui("ui.m.inspire.letter", {
                      position: gameText(`position.${r.letter.position}`),
                      from: r.letter.from,
                      to: r.letter.to,
                    })}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        <button type="button" className={s.go} id="m-inspiracion-seguir" onClick={onDone}>
          {ui("ui.m.close.continue")}
        </button>
      </div>
    </div>
  );
}
