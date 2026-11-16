import { type CSSProperties, useEffect, useLayoutEffect } from "react";
import { useLatest } from "../ui/useLatest";
import { FalconEmblem } from "./Emblem";
import { useLid } from "./LayerHost";
import s from "./Transition.module.css";

/** How long the whole transition lasts (keep in step with Transition.module.css). */
export const TRANSITION_MS = 1250;

/**
 * The emblem transition from the week into race mode, the only place it plays (owner 2026-11-13;
 * his sketch of 2026-11-12): the screen goes the sponsor's first color; the emblem rises from
 * below while a thin line of the second color opens in the middle; at the center the emblem flips
 * like a coin and shows its other face (first color on the second); the line opens over
 * everything while the emblem flies out at the top, and the page shows the race mode. It starts
 * fully covered, so it says so (`onCovered`) before its first frame is painted and the screen
 * behind changes at once; it ends (`onDone`) after `TRANSITION_MS`. Both quote the emblem's beat
 * key and are read when they fire, so a re-render never restarts it. Taps wait until it ends.
 * Reduced motion skips it.
 */
export function ScreenTransition({
  beat,
  primary,
  secondary,
  onCovered,
  onDone,
}: {
  /** The emblem beat's key: one transition per key. */
  beat: string;
  primary: string;
  secondary: string;
  onCovered: (beat: string) => void;
  onDone: (beat: string) => void;
}) {
  const lid = useLid();
  const covered = useLatest(onCovered);
  const done = useLatest(onDone);
  // opaque from its first frame (until 6.4's fade-in): covered before paint, never on a timer
  useLayoutEffect(() => {
    covered.current(beat);
  }, [beat, covered]);
  useEffect(() => {
    const t = setTimeout(() => done.current(beat), TRANSITION_MS);
    return () => clearTimeout(t);
  }, [beat, done]);
  const style = { "--t1": primary, "--t2": secondary } as CSSProperties;
  return (
    <div className={s.cover} style={style} id={lid("m-transicion")} aria-hidden="true">
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
