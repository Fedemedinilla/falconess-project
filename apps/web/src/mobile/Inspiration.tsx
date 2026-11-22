import type { BlackBox } from "@falconess/schema";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { gameText, ui } from "../text/ui";
import { cx } from "../ui/cx";
import { useFlowTimer } from "../ui/flowTimer";
import { isRepeatTap } from "../ui/tap";
import { reducedMotion } from "../ui/useMedia";
import { runnerArt } from "./art";
import s from "./Inspiration.module.css";
import type { InspirationScene } from "./inspirationScene";
import { useLayerFocus, useLayerPhase, useLid } from "./LayerHost";
import { MOTION } from "./motion";
import { playSound } from "./sfx";

/** How the card came to show whole: its intro ended, or a tap hurried it. */
type Revealed = "time" | "tap";

/**
 * «¡Herencia!» / «¡Inspiración!» (owner 2026-11-11, like a Pokémon evolving): her art glows and
 * flashes, sparks fly, then the card says what each parent's box gave: the stat and how much
 * (or that it was at the cap, or that it did not inspire her this time) and a lifted letter.
 * A tap during the intro shows the card at once (L1); «Continuar» takes taps only once the card
 * shows (never a card dismissed unseen, nor by the second click of a double tap on the week's
 * effects). Its way out fades the whole card. Reduced motion shows the card from the start.
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
  const lid = useLid();
  const [revealed, setRevealed] = useState<Revealed | undefined>(() =>
    reducedMotion() ? "time" : undefined,
  );
  const shown = revealed !== undefined;
  const playing = useLayerPhase() === "in";
  // the card pops in at the end of the intro, and «Continuar» takes taps from then
  useFlowTimer(
    playing && !shown ? MOTION.cardReveal : undefined,
    () => setRevealed((r) => r ?? "time"),
    "reveal",
    { fromFrame: true },
  );
  const reveal = useRef<HTMLButtonElement>(null);
  const go = useRef<HTMLButtonElement>(null);
  useLayerFocus(reveal, !shown);
  useLayerFocus(go, shown);
  useEffect(() => {
    playSound("boost");
  }, []);
  return (
    <div
      className={cx(s.overlay, !playing && s.out)}
      style={{ "--insp-reveal": `${MOTION.cardReveal}ms` } as CSSProperties}
      id={lid("m-inspiracion")}
      data-kind={scene.kind}
      data-revealed={revealed}
      role="dialog"
      aria-modal="true"
      aria-labelledby={lid("m-inspiracion-titulo")}
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
        <h2 className={s.title} id={lid("m-inspiracion-titulo")}>
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
        <button
          ref={go}
          type="button"
          className={s.go}
          id={lid("m-inspiracion-seguir")}
          // not before the card shows: no tap, no key
          disabled={!shown}
          onClick={(e) => {
            if (!isRepeatTap(e)) onDone();
          }}
        >
          {ui("ui.m.close.continue")}
        </button>
      </div>
      {!shown && (
        // a tap anywhere during the intro shows the card at once; the second click of a double
        // tap (on the week's effects under the finger) does nothing
        <button
          ref={reveal}
          type="button"
          className={s.reveal}
          aria-label={ui("ui.m.result.next")}
          onClick={(e) => {
            if (!isRepeatTap(e)) setRevealed("tap");
          }}
        />
      )}
    </div>
  );
}
