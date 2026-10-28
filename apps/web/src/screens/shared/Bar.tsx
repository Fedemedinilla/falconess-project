import { cx } from "../../ui/cx";
import { Icon } from "../../ui/Icon";
import type { IconName } from "../../ui/icons";
import s from "./Bar.module.css";

export type BarProps = {
  label: string;
  /** The concept emoji before the label (ui/icons.ts). */
  icon?: IconName | undefined;
  /** The value as it is printed (already formatted). */
  value: string;
  /** Filled share of the track, 0–1. */
  fraction: number;
  /**
   * A change drawn on the track, as a share of it: a positive one extends the fill (a previewed
   * gain), a negative one marks the end of the fill (what a rest takes away, what a season added).
   */
  ghost?: number | undefined;
  /** A threshold to mark on the track, 0–1 (e.g. forced rest). */
  mark?: number | undefined;
  /** The fill color as a CSS value; ink by default. */
  color?: string | undefined;
  /** Extra text after the value: a change, a unit. */
  after?: string | undefined;
  /** Tone of `after`. */
  afterTone?: "up" | "down" | "muted" | undefined;
  size?: "sm" | "md";
  /**
   * The raw value on its scale, for assistive technology: a hidden `<meter>` named by `label`
   * (fatigue on the Turn screen). Without it the bar is only drawn.
   */
  meter?: { value: number; max: number } | undefined;
};

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const pct = (x: number) => `${clamp01(x) * 100}%`;

/**
 * A labelled value on a track: frame stats, base stats, fatigue. Numbers are formatted by the
 * caller (Spanish style), the bar only draws shares.
 */
export function Bar({
  label,
  icon,
  value,
  fraction,
  ghost,
  mark,
  color,
  after,
  afterTone = "muted",
  size = "md",
  meter,
}: BarProps) {
  const fill = clamp01(fraction);
  const g = ghost ?? 0;
  const ghostStyle =
    g > 0
      ? { left: pct(fill), width: pct(Math.min(g, 1 - fill)) }
      : g < 0
        ? { left: pct(fill + g), width: pct(Math.min(-g, fill)) }
        : undefined;
  return (
    <div className={cx(s.row, size === "sm" && s.sm)}>
      <span className={s.label}>
        {icon && <Icon name={icon} />}
        {label}
      </span>
      {meter && (
        <meter
          className="visually-hidden"
          min={0}
          max={meter.max}
          value={meter.value}
          aria-label={label}
        />
      )}
      <span
        className={s.track}
        aria-hidden="true"
        style={color ? { "--bar-color": color } : undefined}
      >
        <span className={s.fill} style={{ width: pct(fill) }} />
        {ghostStyle && <span className={cx(s.ghost, g < 0 && s.within)} style={ghostStyle} />}
        {mark !== undefined && <span className={s.mark} style={{ left: pct(mark) }} />}
      </span>
      <span className={s.value}>
        {value}
        {after !== undefined && <span className={cx(s.after, s[afterTone])}>{after}</span>}
      </span>
    </div>
  );
}
