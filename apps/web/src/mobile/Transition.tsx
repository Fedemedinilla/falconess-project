import { type CSSProperties, useEffect } from "react";
import { FalconEmblem } from "./Emblem";
import s from "./Transition.module.css";

/** How long the whole transition lasts (keep in step with Transition.module.css). */
export const TRANSITION_MS = 1250;

/**
 * The emblem transition from the week into race mode, the only place it plays (owner 2026-11-13;
 * his sketch of 2026-11-12): the screen goes the sponsor's first color; the emblem rises from
 * below while a thin line of the second color opens in the middle; at the center the emblem flips
 * like a coin and shows its other face (first color on the second); the line opens over
 * everything while the emblem flies out at the top, and the page shows the race mode. It starts
 * fully covered, so the screen behind can change at once. Taps wait until it ends. Reduced motion
 * skips it.
 */
export function ScreenTransition({
  primary,
  secondary,
  onDone,
}: {
  primary: string;
  secondary: string;
  onDone: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDone, TRANSITION_MS);
    return () => clearTimeout(t);
  }, [onDone]);
  const style = { "--t1": primary, "--t2": secondary } as CSSProperties;
  return (
    <div className={s.cover} style={style} id="m-transicion" aria-hidden="true">
      <div className={s.line} />
      <div className={s.rise}>
        <div className={s.coin}>
          <div className={s.face}>
            <FalconEmblem className={s.bird} />
          </div>
          <div className={`${s.face} ${s.back}`}>
            <FalconEmblem className={s.bird} />
          </div>
        </div>
      </div>
    </div>
  );
}
