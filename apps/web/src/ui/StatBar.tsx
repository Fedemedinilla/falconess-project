import { formatInt, formatSigned } from "../text/format";
import { cx } from "./cx";
import s from "./StatBar.module.css";

export type StatBarProps = {
  label: string;
  value: number;
  /** The scale's top (the ruleset's statMax for stats; 100 for fatigue). */
  max: number;
  /**
   * A change to preview on top of the bar, as the sim reports it (trainingGain): drawn as a ghost
   * extension and printed after the value.
   */
  preview?: number;
  /** The bar's color as a CSS value, e.g. `var(--warn)`; ink by default. */
  color?: string;
  size?: "sm" | "md";
};

function percent(part: number, max: number): string {
  if (max <= 0) return "0%";
  return `${Math.max(0, Math.min(100, (part / max) * 100))}%`;
}

/** A stat on a fixed scale with a ticked track, its value in tabular figures. */
export function StatBar({ label, value, max, preview, color, size = "md" }: StatBarProps) {
  const ghost = preview !== undefined && preview > 0 ? Math.min(preview, max - value) : 0;
  return (
    <div className={cx(s.row, size === "sm" && s.sm)}>
      <span className={s.label}>{label}</span>
      <meter className="visually-hidden" min={0} max={max} value={value} aria-label={label} />
      <span
        className={s.track}
        aria-hidden="true"
        style={color ? { "--bar-color": color } : undefined}
      >
        <span className={s.fill} style={{ width: percent(value, max) }} />
        {ghost > 0 && (
          <span
            className={s.ghost}
            style={{ left: percent(value, max), width: percent(ghost, max) }}
          />
        )}
      </span>
      <span className={s.value}>
        {formatInt(value)}
        {preview !== undefined && preview !== 0 && (
          <span className={cx(s.delta, preview < 0 && s.down)}>{formatSigned(preview)}</span>
        )}
      </span>
    </div>
  );
}
