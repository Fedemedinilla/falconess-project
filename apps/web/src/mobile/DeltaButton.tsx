import { useId } from "react";
import s from "./Mobile.module.css";

/**
 * The raised «Entrenar» button, option 3B of the approved prototype: an enamelled inverted delta
 * with a white edge, the school's second color as its stripe, a sheen and the school's emblem as a
 * watermark; under the label, chips with the week's boosted trainings, glowing softly (nothing
 * extra when none is boosted).
 */

/** The delta's outline: a feathered top edge and the point at the bottom. */
function deltaPath(): { d: string; top: string } {
  const n = 8;
  const x0 = -90;
  const w = 180 / n;
  let top = "M-90 14";
  for (let i = 0; i < n; i++) {
    const xa = x0 + i * w;
    const xb = xa + w;
    const mid = (xa + xb) / 2;
    const out = mid < 0 ? -1 : 1;
    const ty = 4 - (1 - Math.abs(mid) / 90) * 3;
    top += `Q${(xa + w * 0.15).toFixed(1)} ${ty.toFixed(1)} ${(mid + out * w * 0.32).toFixed(1)} ${ty.toFixed(1)}L${xb.toFixed(1)} ${i === n - 1 ? 14 : 13}`;
  }
  return { d: `${top}C84 56 46 148 10 188Q0 198 -10 188C-46 148 -84 56 -90 14Z`, top };
}

const DELTA = deltaPath();

/** The school's emblem, as a watermark: Altair's star, Boneyard's gear and wrench, Kōryū's falcon. */
function Emblem({ school }: { school: string }) {
  if (school === "altair")
    return (
      <>
        <path d="M0 44L10 77L42 86L10 95L0 128L-10 95L-42 86L-10 77Z" />
        <ellipse
          cx="0"
          cy="86"
          rx="62"
          ry="21"
          transform="rotate(-18 0 86)"
          fill="none"
          strokeWidth="7"
        />
        <circle cx="52" cy="64" r="7" />
      </>
    );
  if (school === "boneyard") {
    const gx = -14;
    const gy = 90;
    const n = 8;
    let g = "";
    for (let i = 0; i < n * 2; i++) {
      const a0 = ((i - 0.5) / (n * 2)) * Math.PI * 2;
      const a1 = ((i + 0.5) / (n * 2)) * Math.PI * 2;
      const r = i % 2 ? 29 : 38;
      g += `${i ? "L" : "M"}${(gx + Math.cos(a0) * r).toFixed(1)} ${(gy + Math.sin(a0) * r).toFixed(1)}L${(gx + Math.cos(a1) * r).toFixed(1)} ${(gy + Math.sin(a1) * r).toFixed(1)}`;
    }
    g += `ZM${gx + 13} ${gy}A13 13 0 1 0 ${gx - 13} ${gy}A13 13 0 1 0 ${gx + 13} ${gy}Z`;
    return (
      <>
        <path fillRule="evenodd" d={g} />
        <path
          d="M-62 -6H26L34 -15A17 17 0 0 1 60 -9L47 -5V5L60 9A17 17 0 0 1 34 15L26 6H-62A6 6 0 0 1 -62 -6Z"
          transform="translate(4 92) rotate(-38)"
        />
      </>
    );
  }
  return (
    <>
      <path d="M-64 42L0 120L64 42L44 38L0 92L-44 38Z" />
      <path d="M0 26C9 38 11 56 7 74L0 134L-7 74C-11 56 -9 38 0 26Z" />
    </>
  );
}

export type DeltaChip = { readonly key: string; readonly label: string };

export type DeltaButtonProps = {
  id: string;
  label: string;
  /** The accessible name (the label plus what is boosted). */
  ariaLabel: string;
  /** School (manufacturer id) of the emblem. */
  school: string;
  chips: readonly DeltaChip[];
  icon: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
};

export function DeltaButton({
  id,
  label,
  ariaLabel,
  school,
  chips,
  icon,
  disabled = false,
  onClick,
}: DeltaButtonProps) {
  const uid = useId().replace(/:/g, "");
  const boosted = chips.length > 0;
  const wm = school === "altair" ? { c: "#ffffff", o: 0.12 } : { c: "#000000", o: 0.15 };
  const n = 8;
  const w = 180 / n;
  return (
    <button
      type="button"
      id={id}
      className={`${s.delta} ${boosted ? s.deltaBoost : ""}`}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      style={{ "--cy": boosted ? "58px" : "76px" }}
    >
      <svg className={s.deltaArt} viewBox="-110 0 220 210" aria-hidden="true" focusable="false">
        <defs>
          <clipPath id={`${uid}c`}>
            <path d={DELTA.d} />
          </clipPath>
          <linearGradient id={`${uid}f`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: "color-mix(in srgb, var(--acc) 62%, #fff)" }} />
            <stop offset="0.28" style={{ stopColor: "var(--acc)" }} />
            <stop offset="1" style={{ stopColor: "color-mix(in srgb, var(--acc) 62%, #000)" }} />
          </linearGradient>
          <linearGradient id={`${uid}g`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path className={s.deltaHit} d={DELTA.d} fill={`url(#${uid}f)`} />
        <g clipPath={`url(#${uid}c)`}>
          <g fill={wm.c} stroke={wm.c} fillOpacity={wm.o} strokeOpacity={wm.o} strokeWidth="0">
            <Emblem school={school} />
          </g>
          <path d="M-110 0H110V44C60 30 -60 30 -110 44Z" fill={`url(#${uid}g)`} />
          <path
            d={DELTA.top}
            fill="none"
            stroke="#ffffff"
            strokeOpacity="0.6"
            strokeWidth="2"
            transform="translate(0 4)"
            strokeLinejoin="round"
          />
          {Array.from({ length: n - 1 }, (_, i) => {
            const x = -90 + (i + 1) * w;
            return (
              <path
                key={x}
                d={`M${x.toFixed(1)} 13L${(x * 0.92).toFixed(1)} 21`}
                stroke="rgba(0,0,0,.28)"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            );
          })}
          <path
            d="M-70 44C-62 82 -36 140 -8 172"
            fill="none"
            stroke="#ffffff"
            strokeOpacity="0.22"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path
            d={DELTA.d}
            fill="none"
            stroke="rgba(20,32,43,.35)"
            strokeWidth="15"
            strokeLinejoin="round"
          />
          <path
            d={DELTA.d}
            fill="none"
            stroke="var(--sec)"
            strokeWidth="13"
            strokeLinejoin="round"
          />
        </g>
        <path d={DELTA.d} fill="none" stroke="#ffffff" strokeWidth="4.5" strokeLinejoin="round" />
        {boosted && (
          <path
            className={s.deltaGlow}
            d={DELTA.d}
            fill="none"
            stroke="#ffe27a"
            strokeWidth="4.5"
            strokeLinejoin="round"
          />
        )}
        <path className={s.deltaOutline} d={DELTA.d} />
      </svg>
      <span className={s.deltaLabel}>
        {icon}
        <span>{label}</span>
      </span>
      {boosted && (
        <span className={s.deltaChips} aria-hidden="true">
          {chips.slice(0, 3).map((c) => (
            <span key={c.key} className={s.boostChip}>
              {c.label}
            </span>
          ))}
        </span>
      )}
    </button>
  );
}
