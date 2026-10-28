/** Assembles `out/balance.json` (validated by `BalanceReport`) and renders it as Markdown. */
import { type BalanceBudgetLine, BalanceReport, type BalanceTable } from "@falconess/schema";
import { type BaselineDiff, renderDiffMarkdown } from "./baseline.js";
import type { JobResult, Timing } from "./execute.js";
import {
  formatInt,
  formatInterval,
  formatTarget,
  formatValue,
  formatVerdict,
  mdTable,
} from "./format.js";
import type { MetricsOutput } from "./metrics.js";
import { type BudgetKey, type Job, type Plan, plannedRaces, seedPattern } from "./plan.js";
import { combineVerdicts } from "./verdict.js";

/** First line of the Markdown: the CI finds its sticky PR comment by it. */
export const REPORT_MARKER = "<!-- falconess-balance-report -->";

export type ReportInput = {
  plan: Plan;
  rulesetVersion: string;
  engineId: string;
  results: readonly JobResult[];
  metrics: MetricsOutput;
  timing: Timing;
  workers: number;
  wallMs: number;
};

function keyOf(job: Job): BudgetKey {
  if (job.scenario === "S2") return job.variant === "real" ? "S2-real" : "S2-equal-pw";
  return job.scenario;
}

function racesOf(r: JobResult): number {
  return r.season ? r.season.goalRaces : r.races.length;
}

const ms = (x: number) => Math.round(x * 10) / 10;

export function assembleReport(input: ReportInput): BalanceReport {
  const { plan } = input;
  const ran = new Map<BudgetKey, number>();
  let dnf = 0;
  const seasonEngines = new Set<string>();
  plan.jobs.forEach((job, i) => {
    const r = input.results[i];
    if (!r) throw new Error(`no result for job ${job.id}`);
    const key = keyOf(job);
    ran.set(key, (ran.get(key) ?? 0) + racesOf(r));
    dnf += r.dnf;
    if (r.season) seasonEngines.add(r.season.raceEngine);
  });
  const budget: BalanceBudgetLine[] = plan.lines.map((l) => ({
    key: l.row.key,
    scenario: l.row.scenario,
    unit: l.row.unit,
    racesPerUnit: l.row.racesPerUnit,
    perCell: [...l.perCell],
    plannedRaces: l.perCell.reduce((s, n) => s + n * l.row.racesPerUnit, 0),
    races: ran.get(l.row.key) ?? 0,
  }));
  const planned = plannedRaces(plan);
  const races = budget.reduce((s, b) => s + b.races, 0);
  const t = input.timing;
  const report = {
    kind: "falconess-balance-report" as const,
    schemaVersion: 1 as const,
    metadata: {
      rulesetVersion: input.rulesetVersion,
      engine: input.engineId,
      seasonEngine: seasonEngines.size === 0 ? "none" : [...seasonEngines].sort().join("+"),
      profile: plan.config.profile,
      runs: plan.config.profile === "pr" ? plan.config.runs : planned,
      plannedRaces: planned,
      races,
      seedBase: plan.config.seedBase,
      seedPattern: seedPattern(plan.config.seedBase),
      scenarios: [...plan.config.scenarios],
      budget,
      dnf,
      timing: {
        races: t.races,
        engineMs: ms(t.engineMs),
        msPerRace: t.races > 0 ? Math.round((t.engineMs / t.races) * 1000) / 1000 : null,
        seasons: t.seasons,
        seasonMs: ms(t.seasonMs),
        wallMs: ms(input.wallMs),
        workers: input.workers,
      },
    },
    verdict: combineVerdicts(input.metrics.metrics.map((m) => m.verdict)),
    metrics: input.metrics.metrics,
    diagnostics: input.metrics.diagnostics,
  };
  return BalanceReport.parse(report);
}

function counts(cells: readonly { verdict: string }[]): string {
  const n = (v: string) => cells.filter((c) => c.verdict === v).length;
  return `${n("pass")} / ${n("fail")} / ${n("inconclusive")}`;
}

function renderTable(t: BalanceTable): string {
  const notes = t.notes.length > 0 ? `\n\n${t.notes.map((n) => `_${n}_`).join("\n")}` : "";
  return `#### ${t.title}\n\n${mdTable(t.columns, t.rows)}${notes}`;
}

export type MarkdownOptions = {
  diff?: BaselineDiff;
  /** Quoted lines under the summary: a skipped baseline or gate report, the gate's cells. */
  notices?: readonly string[];
  /** GitHub comments hold 65 536 characters; diagnostics are dropped first when over this. */
  maxLength?: number;
};

export function renderMarkdown(report: BalanceReport, opts: MarkdownOptions = {}): string {
  const full = render(report, opts, true);
  if (opts.maxLength === undefined || full.length <= opts.maxLength) return full;
  return render(report, opts, false);
}

function render(report: BalanceReport, opts: MarkdownOptions, diagnostics: boolean): string {
  const m = report.metadata;
  const t = m.timing;
  const out: string[] = [REPORT_MARKER, `## Balance report: ${formatVerdict(report.verdict)}`, ""];
  out.push(
    `\`${m.profile}\` profile · ${formatInt(m.races)} races (${formatInt(m.plannedRaces)} planned) · ruleset \`${m.rulesetVersion}\` · engine \`${m.engine}\` · season goal races \`${m.seasonEngine}\` · seeds \`${m.seedPattern}\` · DNF ${m.dnf}`,
  );
  out.push(
    `Timing: ${formatInt(t.races)} engine races in ${(t.engineMs / 1000).toFixed(1)} s (${t.msPerRace === null ? "n/a" : t.msPerRace.toFixed(2)} ms per race), ${formatInt(t.seasons)} seasons in ${(t.seasonMs / 1000).toFixed(1)} s, wall ${(t.wallMs / 1000).toFixed(1)} s on ${t.workers} worker(s).`,
  );
  if (m.engine !== "v1")
    out.push(
      "",
      `> Engine \`${m.engine}\` is not the race engine: these numbers mean nothing for balance.`,
    );
  out.push("");
  out.push(
    mdTable(
      ["#", "Metric", "Target", "Cells pass / fail / inconclusive", "Verdict"],
      report.metrics.map((x) => [
        x.number,
        `${x.title} (${x.scenario})`,
        x.targetText,
        counts(x.cells),
        formatVerdict(x.verdict),
      ]),
    ),
  );
  out.push(
    "",
    "_Verdicts (§25.2.1): pass = the 95 % interval lies inside the target; fail = entirely outside; inconclusive = straddles an edge (the next `full` run decides)._",
  );
  if (opts.notices && opts.notices.length > 0) out.push("", ...opts.notices.map((n) => `> ${n}`));
  if (opts.diff) out.push("", renderDiffMarkdown(opts.diff));
  for (const x of report.metrics) {
    out.push("", `### ${x.number}. ${x.title} (${x.scenario}): ${formatVerdict(x.verdict)}`, "");
    out.push(
      mdTable(
        ["Cell", "Value", "95 % interval", "Target", "n", "Verdict", "Note"],
        x.cells.map((c) => [
          c.id,
          formatValue(x.unit, c.value),
          formatInterval(x.unit, c.interval.lo, c.interval.hi),
          formatTarget(x.unit, c.target),
          c.n,
          formatVerdict(c.verdict),
          c.note ?? "",
        ]),
      ),
    );
    if (x.notes.length > 0) out.push("", ...x.notes.map((n) => `- ${n}`));
  }
  if (diagnostics && report.diagnostics.length > 0) {
    out.push(
      "",
      `<details><summary>Diagnostics (${report.diagnostics.length} tables)</summary>`,
      "",
    );
    out.push(report.diagnostics.map(renderTable).join("\n\n"));
    out.push("", "</details>");
  } else if (report.diagnostics.length > 0) {
    out.push(
      "",
      "_Diagnostics omitted to fit the comment: see `out/balance.json` in the job artifact._",
    );
  }
  out.push("", "<details><summary>Run budget (§25.2.1)</summary>", "");
  out.push(
    mdTable(
      ["Line", "Unit", "Cells", "Units per cell", "Planned races", "Races"],
      m.budget.map((b) => {
        const lo = Math.min(...b.perCell);
        const hi = Math.max(...b.perCell);
        return [
          b.key,
          b.unit,
          b.perCell.length,
          lo === hi ? lo : `${lo}-${hi}`,
          b.plannedRaces,
          b.races,
        ];
      }),
    ),
  );
  out.push("", "</details>", "");
  return out.join("\n");
}

/** Short console summary. */
export function renderSummary(report: BalanceReport): string {
  const lines = [
    `balance: ${report.verdict.toUpperCase()} (${report.metadata.profile}, ${report.metadata.races} races, engine ${report.metadata.engine})`,
  ];
  for (const x of report.metrics)
    lines.push(`  ${x.number}. ${x.title}: ${x.verdict} (${counts(x.cells)})`);
  const t = report.metadata.timing;
  lines.push(
    `  timing: ${t.races} engine races, ${(t.engineMs / 1000).toFixed(1)} s engine, ${t.msPerRace === null ? "n/a" : t.msPerRace.toFixed(2)} ms/race, wall ${(t.wallMs / 1000).toFixed(1)} s, ${t.workers} worker(s)`,
  );
  return lines.join("\n");
}
