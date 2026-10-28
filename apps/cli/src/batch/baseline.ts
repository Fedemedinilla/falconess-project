/**
 * Diff of a balance report against a baseline (BRIEF §12: "el reporte incluye un diff contra la
 * línea base de main"). Cells are matched by metric id and cell id.
 */
import type { BalanceReport, BalanceUnit, BalanceVerdict } from "@falconess/schema";
import { formatDelta, formatInt, formatValue, formatVerdict, mdTable } from "./format.js";

export type DiffRow = {
  metric: string;
  number: number;
  cell: string;
  unit: BalanceUnit;
  /** `undefined` when the cell is missing on that side. */
  baseline: number | null | undefined;
  current: number | null | undefined;
  delta: number | null;
  baselineVerdict: BalanceVerdict | undefined;
  currentVerdict: BalanceVerdict | undefined;
};

export type BaselineDiff = {
  verdict: { baseline: BalanceVerdict; current: BalanceVerdict };
  metrics: {
    id: string;
    number: number;
    title: string;
    baseline: BalanceVerdict | undefined;
    current: BalanceVerdict | undefined;
  }[];
  rows: DiffRow[];
  /** Reasons the two reports are not like for like (profile, ruleset, engine, seeds, runs). */
  warnings: string[];
  baselineSummary: string;
};

export function verdictChanged(r: DiffRow): boolean {
  return r.baselineVerdict !== r.currentVerdict;
}

export function verdictChange(r: DiffRow): string {
  if (r.baselineVerdict === undefined) return `new (${r.currentVerdict ?? "—"})`;
  if (r.currentVerdict === undefined) return `removed (was ${r.baselineVerdict})`;
  if (r.baselineVerdict === r.currentVerdict) return "=";
  return `${r.baselineVerdict} → ${r.currentVerdict}`;
}

/**
 * `source` says where the baseline comes from (`--baseline-from`, e.g. the CI run and commit of
 * main), so a diff against an older baseline than expected is visible in its header.
 */
export function diffReports(
  baseline: BalanceReport,
  current: BalanceReport,
  source?: string,
): BaselineDiff {
  const warnings: string[] = [];
  const b = baseline.metadata;
  const c = current.metadata;
  if (b.profile !== c.profile) warnings.push(`profile ${b.profile} → ${c.profile}`);
  if (b.rulesetVersion !== c.rulesetVersion)
    warnings.push(`ruleset ${b.rulesetVersion} → ${c.rulesetVersion}`);
  if (b.engine !== c.engine) warnings.push(`engine ${b.engine} → ${c.engine}`);
  if (b.seasonEngine !== c.seasonEngine)
    warnings.push(`season engine ${b.seasonEngine} → ${c.seasonEngine}`);
  if (b.seedBase !== c.seedBase) warnings.push(`seed base "${b.seedBase}" → "${c.seedBase}"`);
  if (b.runs !== c.runs) warnings.push(`runs ${b.runs} → ${c.runs}`);

  const ids = [...new Set([...baseline.metrics, ...current.metrics].map((m) => m.id))];
  const rows: DiffRow[] = [];
  const metrics: BaselineDiff["metrics"] = [];
  for (const id of ids) {
    const bm = baseline.metrics.find((m) => m.id === id);
    const cm = current.metrics.find((m) => m.id === id);
    const ref = cm ?? bm;
    if (!ref) continue;
    metrics.push({
      id,
      number: ref.number,
      title: ref.title,
      baseline: bm?.verdict,
      current: cm?.verdict,
    });
    const cellIds = [...new Set([...(bm?.cells ?? []), ...(cm?.cells ?? [])].map((x) => x.id))];
    for (const cellId of cellIds) {
      const bc = bm?.cells.find((x) => x.id === cellId);
      const cc = cm?.cells.find((x) => x.id === cellId);
      const bv = bc?.value;
      const cv = cc?.value;
      rows.push({
        metric: id,
        number: ref.number,
        cell: cellId,
        unit: ref.unit,
        baseline: bv,
        current: cv,
        delta: typeof bv === "number" && typeof cv === "number" ? cv - bv : null,
        baselineVerdict: bc?.verdict,
        currentVerdict: cc?.verdict,
      });
    }
  }
  metrics.sort((x, y) => x.number - y.number);
  rows.sort((x, y) => x.number - y.number);
  return {
    verdict: { baseline: baseline.verdict, current: current.verdict },
    metrics,
    rows,
    warnings,
    baselineSummary: `\`${b.profile}\` · ${formatInt(b.races)} races · ruleset \`${b.rulesetVersion}\` · engine \`${b.engine}\`${source === undefined ? "" : ` · from ${source}`}`,
  };
}

function row(r: DiffRow): string[] {
  return [
    `${r.number}. ${r.metric}`,
    r.cell,
    formatValue(r.unit, r.baseline),
    formatValue(r.unit, r.current),
    formatDelta(r.unit, r.delta),
    verdictChange(r),
  ];
}

const COLUMNS = ["Metric", "Cell", "Baseline", "Current", "Delta", "Verdict change"];

export function renderDiffMarkdown(diff: BaselineDiff): string {
  const out: string[] = [];
  out.push("### Diff against the baseline");
  out.push("");
  out.push(
    `Baseline: ${diff.baselineSummary}. Verdict: ${formatVerdict(diff.verdict.baseline)} → ${formatVerdict(diff.verdict.current)}.`,
  );
  if (diff.warnings.length > 0) out.push("", `Not like for like: ${diff.warnings.join("; ")}.`);
  out.push("");
  out.push(
    mdTable(
      ["#", "Metric", "Baseline", "Current"],
      diff.metrics.map((m) => [
        m.number,
        m.title,
        formatVerdict(m.baseline),
        formatVerdict(m.current),
      ]),
    ),
  );
  const changed = diff.rows.filter(verdictChanged);
  out.push("");
  if (changed.length === 0) out.push("No cell changed verdict.");
  else {
    out.push(`Cells whose verdict changed (${changed.length}):`, "");
    out.push(mdTable(COLUMNS, changed.map(row)));
  }
  out.push("");
  out.push(`<details><summary>All cells (${diff.rows.length})</summary>`, "");
  out.push(mdTable(COLUMNS, diff.rows.map(row)));
  out.push("", "</details>");
  return out.join("\n");
}
