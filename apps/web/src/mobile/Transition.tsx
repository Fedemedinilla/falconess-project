import type { CSSProperties } from "react";
import { cx } from "../ui/cx";
import { useFlowTimer } from "../ui/flowTimer";
import { FalconEmblem } from "./Emblem";
import { useLayerPhase, useLid } from "./LayerHost";
import { EMBLEM_MS, MOTION } from "./motion";
import s from "./Transition.module.css";

/** The emblem's timers count from its first frame, as its CSS does (a slow commit starts both late). */
const FROM_FRAME = { fromFrame: true } as const;

/**
 * The emblem transition from the week into race mode, the only place it plays (owner 2026-11-13;
 * his sketch of 2026-11-12; O6): the sponsor's first color fades in over the screen the week
 * ended on (160 ms); once it is opaque it says so (`onCovered`) and the race mode takes that
 * screen's place under it. Then the emblem rises from below while a thin line of the second color
 * opens in the middle; at the center the emblem flips like a coin and shows its other face (first
 * color on the second); the line opens over everything while the emblem flies out at the top. At
 * 1240 ms it ends (`onDone`) and fades out over 280 ms onto the race mode (the scene before the
 * race on its own black, or the decided card) as an id-less copy that takes no tap. A week
 * restored from storage (`fadeIn` false) opens on the full cover, already covered. Both timers
 * quote the emblem's beat key and count from its first frame, so a re-render never restarts them;
 * a leaving copy runs none. Taps wait until it ends. Reduced motion skips it.
 */
export function ScreenTransition({
  beat,
  fadeIn,
  primary,
  secondary,
  onCovered,
  onDone,
}: {
  /** The emblem beat's key: one transition per key. */
  beat: string;
  /** False: opaque from its first frame (a week restored from storage), already covered. */
  fadeIn: boolean;
  primary: string;
  secondary: string;
  onCovered: (beat: string) => void;
  onDone: (beat: string) => void;
}) {
  const lid = useLid();
  const front = useLayerPhase() === "in";
  useFlowTimer(
    front && fadeIn ? MOTION.emblemIn : undefined,
    () => onCovered(beat),
    beat,
    FROM_FRAME,
  );
  useFlowTimer(front ? EMBLEM_MS : undefined, () => onDone(beat), beat, FROM_FRAME);
  const style = { "--t1": primary, "--t2": secondary } as CSSProperties;
  return (
    <div
      className={cx(s.cover, !fadeIn && s.opaque, !front && s.out)}
      style={style}
      id={lid("m-transicion")}
      aria-hidden="true"
    >
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
