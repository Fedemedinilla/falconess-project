import { cx } from "../ui/cx";
import { isRepeatTap } from "../ui/tap";
import { Glyph } from "./Glyph";
import s from "./Mobile.module.css";

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

/** A boosted training under the label. */
export type TrainChip = {
  readonly key: string;
  readonly label: string;
  /** ADR-0016: a crew in sintonía stands at this training. */
  readonly sync?: boolean;
};

export type TrainBarProps = {
  id: string;
  label: string;
  /** The accessible name (the label plus what is boosted). */
  ariaLabel: string;
  /** School (manufacturer id) of the emblem. */
  school: string;
  chips: readonly TrainChip[];
  disabled?: boolean;
  onClick: () => void;
};

/**
 * «Entrenar» as a wide enamelled bar (owner 2026-11-14, «Esmalte» but light): the school's color,
 * its emblem as a watermark at the right, and the week's boosted trainings as chips under the label.
 */
export function TrainBar({
  id,
  label,
  ariaLabel,
  school,
  chips,
  disabled = false,
  onClick,
}: TrainBarProps) {
  return (
    <button
      type="button"
      id={id}
      className={s.tbar}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={(e) => {
        // the second click of a double click lands on the next week's button: ignore it
        if (isRepeatTap(e)) return;
        onClick();
      }}
    >
      <svg
        className={s.tbarWm}
        viewBox="-70 20 140 120"
        aria-hidden="true"
        style={{ color: school === "altair" ? "#ffffff" : "#000000" }}
      >
        <g fill="currentColor" stroke="currentColor" strokeWidth="0">
          <Emblem school={school} />
        </g>
      </svg>
      <Glyph name="dumbbell" size={32} color="#ffffff" weight={2.6} />
      <span className={s.tbarText}>
        <span className={s.tbarLabel}>{label}</span>
        {chips.length > 0 && (
          <span className={s.tbarChips} aria-hidden="true">
            {chips.slice(0, 3).map((c) => (
              <span
                key={c.key}
                className={cx(s.boostChip, c.sync && s.boostChipSync)}
                data-sync={c.sync ? "true" : undefined}
              >
                {c.label}
              </span>
            ))}
          </span>
        )}
      </span>
    </button>
  );
}
