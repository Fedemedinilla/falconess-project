/** Number formatting shared by the report and the baseline diff (Markdown and console). */
import type { BalanceTarget, BalanceUnit, BalanceVerdict } from "@falconess/schema";

const INF = 1e6;

export function formatValue(unit: BalanceUnit, v: number | null | undefined): string {
  if (v === undefined) return "—";
  if (v === null) return unit === "ratio" ? "∞" : "n/a";
  switch (unit) {
    case "rate":
      return `${(v * 100).toFixed(1)} %`;
    case "points":
      return `${(v * 100).toFixed(1)} pts`;
    case "fraction":
      return `${(v * 100).toFixed(2)} %`;
    case "ratio":
      return Math.abs(v) >= INF ? "∞" : v.toFixed(3);
    case "metres":
      return `${v.toFixed(2)} m`;
  }
}

function bare(unit: BalanceUnit, v: number): string {
  switch (unit) {
    case "rate":
    case "points":
      return (v * 100).toFixed(1);
    case "fraction":
      return (v * 100).toFixed(2);
    case "ratio":
      return Math.abs(v) >= INF ? "∞" : v.toFixed(3);
    case "metres":
      return v.toFixed(2);
  }
}

function suffix(unit: BalanceUnit): string {
  switch (unit) {
    case "rate":
    case "fraction":
      return " %";
    case "points":
      return " pts";
    case "metres":
      return " m";
    case "ratio":
      return "";
  }
}

export function formatInterval(unit: BalanceUnit, lo: number | null, hi: number | null): string {
  const l = lo === null ? "−∞" : bare(unit, lo);
  const h = hi === null ? "∞" : bare(unit, hi);
  return `[${l}, ${h}]${suffix(unit)}`;
}

export function formatTarget(unit: BalanceUnit, t: BalanceTarget): string {
  if (t.min !== null && t.max !== null)
    return `${bare(unit, t.min)}-${bare(unit, t.max)}${suffix(unit)}`;
  if (t.max !== null) return `≤ ${bare(unit, t.max)}${suffix(unit)}`;
  if (t.min !== null) return `≥ ${bare(unit, t.min)}${suffix(unit)}`;
  return "—";
}

/** Delta in the cell's unit: percentage points for rates, fractions and points. */
export function formatDelta(unit: BalanceUnit, d: number | null): string {
  if (d === null) return "—";
  const sign = d > 0 ? "+" : d < 0 ? "−" : "±";
  const a = Math.abs(d);
  switch (unit) {
    case "rate":
    case "points":
      return `${sign}${(a * 100).toFixed(1)} pp`;
    case "fraction":
      return `${sign}${(a * 100).toFixed(2)} pp`;
    case "ratio":
      return a >= INF ? "—" : `${sign}${a.toFixed(3)}`;
    case "metres":
      return `${sign}${a.toFixed(2)} m`;
  }
}

export function formatVerdict(v: BalanceVerdict | undefined): string {
  if (v === undefined) return "—";
  return v === "fail" ? "**FAIL**" : v;
}

export function formatInt(n: number): string {
  return n.toLocaleString("en-US").replace(/,/g, " ");
}

/** Escapes a value for a Markdown table cell. */
export function mdCell(v: string | number | null): string {
  if (v === null) return "—";
  return String(v).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export function mdTable(
  columns: readonly string[],
  rows: readonly (string | number | null)[][],
): string {
  const head = `| ${columns.map(mdCell).join(" | ")} |`;
  const sep = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${r.map(mdCell).join(" | ")} |`);
  return [head, sep, ...body].join("\n");
}
