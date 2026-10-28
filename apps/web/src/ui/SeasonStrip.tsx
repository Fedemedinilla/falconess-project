import type { CSSProperties } from "react";
import { cx } from "./cx";
import s from "./SeasonStrip.module.css";

export type SeasonMark = {
  readonly turn: number;
  /** Shown under the mark ("T12"). */
  readonly label: string;
};

export type SeasonStripProps = {
  /** Weeks in the season (the ruleset's `season.turns`). */
  turns: number;
  /** Goal races and other fixed dates. */
  marks: readonly SeasonMark[];
  /** The week in play, if a season is running: weeks before it are shown as done. */
  current?: number;
  /** What the strip shows, for screen readers. */
  label: string;
};

/** The season as a row of weeks: done, in play, and the fixed dates ahead. */
export function SeasonStrip({ turns, marks, current, label }: SeasonStripProps) {
  const marked = new Set(marks.map((m) => m.turn));
  const weeks = Array.from({ length: turns }, (_, i) => i + 1);
  const columns: CSSProperties = { gridTemplateColumns: `repeat(${turns}, minmax(0, 1fr))` };
  return (
    <div className={s.strip} role="img" aria-label={label}>
      <div className={s.weeks} style={columns}>
        {weeks.map((w) => (
          <span
            key={w}
            className={cx(
              s.week,
              current !== undefined && w < current && s.done,
              w === current && s.current,
              marked.has(w) && s.mark,
            )}
          />
        ))}
      </div>
      <div className={s.labels} style={columns} aria-hidden="true">
        {marks.map((m) => (
          <span key={m.turn} className={s.label} style={{ gridColumn: `${m.turn}` }}>
            {m.label}
          </span>
        ))}
      </div>
    </div>
  );
}
