import type { ReactNode } from "react";
import { cx } from "./cx";
import s from "./Table.module.css";

export type TableColumn = {
  readonly key: string;
  readonly label: string;
  /** Numbers align to the end. */
  readonly align?: "start" | "end" | "center";
  /** A long header that may break into lines (headers stay on one line by default). */
  readonly wrap?: boolean;
};

export type TableRow = {
  readonly key: string;
  readonly cells: readonly ReactNode[];
  /** The player's row in a classification. */
  readonly highlight?: boolean;
};

export type TableProps = {
  columns: readonly TableColumn[];
  rows: readonly TableRow[];
  /** Read by screen readers; also names the scroll region. */
  caption: string;
  dense?: boolean;
  /**
   * A wide table: the first column stays in place while the rest scrolls, and a shade at the
   * right edge shows there is more.
   */
  sticky?: boolean;
};

/** A data table in its own horizontal scroll box, so the page never scrolls sideways. */
export function Table({ columns, rows, caption, dense = false, sticky = false }: TableProps) {
  return (
    <div className={cx(s.scroll, sticky && s.cue)}>
      <table className={cx(s.table, dense && s.dense, sticky && s.sticky)}>
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cx(s[c.align ?? "start"], c.wrap && s.wrap)}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className={row.highlight ? s.highlight : undefined}>
              {row.cells.map((cell, i) => (
                <td key={columns[i]?.key ?? i} className={s[columns[i]?.align ?? "start"]}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
