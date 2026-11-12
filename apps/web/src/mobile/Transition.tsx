import { type CSSProperties, useEffect } from "react";
import s from "./Transition.module.css";

/** How long the whole transition lasts (keep in step with Transition.module.css). */
export const TRANSITION_MS = 1250;

/** The provisional Falconess emblem: a falcon with its wings spread (owner 2026-11-12). */
export function FalconEmblem({ className }: { className?: string | undefined }) {
  return (
    <svg className={className} viewBox="0 0 120 84" aria-hidden="true">
      <path d="M57 33 4 8l9 12-8-1 12 11-7 1 14 10-4 3 18 3 10-3z" />
      <path d="M63 33 116 8l-9 12 8-1-12 11 7 1-14 10 4 3-18 3-10-3z" />
      <path d="M52 33l8-9 8 9-2 19-6 7-6-7z" />
      <circle cx="60" cy="22" r="5.5" />
      <path d="M54 54l6 22 6-22-6 5z" />
    </svg>
  );
}

/**
 * The transition between screens (owner 2026-11-12, his sketch): the screen goes the sponsor's
 * first color; the emblem rises from below while a thin line of the second color opens in the
 * middle; at the center the emblem flips like a coin and shows its other face (first color on
 * the second); the line opens over everything while the emblem flies out at the top, and the
 * page shows the new screen. It starts fully covered, so the screen behind can change at once.
 * Taps wait until it ends. Reduced motion skips it.
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
