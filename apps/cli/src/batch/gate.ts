/**
 * What `pnpm sim:batch` decides after the report is written: how it reads another report (the
 * `--baseline` and `--gate-report` files), how it judges the gate report of docs/race-engine.md
 * §25.2.1 against the current report, and its exit code. Pure: the caller does the IO.
 */
import { BalanceReport, type BalanceTarget } from "@falconess/schema";
import { cellVerdict } from "./verdict.js";

export type ReportRead =
  | { readonly ok: true; readonly report: BalanceReport }
  | { readonly ok: false; readonly reason: string };

/**
 * Parse a report file's text. A report from another revision of `BalanceReport` (another
 * `schemaVersion`, a field or enum value this revision does not know) or a broken file is a
 * `reason`, never a throw: a PR that changes the report format must still get its own report.
 */
export function parseReportText(text: string): ReportRead {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return { ok: false, reason: `not JSON (${e instanceof Error ? e.message : String(e)})` };
  }
  const parsed = BalanceReport.safeParse(json);
  if (parsed.success) return { ok: true, report: parsed.data };
  const first = parsed.error.issues[0];
  const where = first && first.path.length > 0 ? `${first.path.join(".")}: ` : "";
  const more = parsed.error.issues.length > 1 ? ` (+${parsed.error.issues.length - 1} more)` : "";
  return {
    ok: false,
    reason: `another report schema or a damaged file: ${where}${first?.message ?? "invalid"}${more}`,
  };
}

/** One fail cell of the gate report and what the current report says about it. */
export type GateCell = {
  readonly metric: string;
  readonly number: number;
  readonly cell: string;
  /** `failing`: the cell still blocks; `lifted`: this PR fixed it or moved its target. */
  readonly status: "failing" | "lifted";
  readonly reason: string;
};

const sameTarget = (a: BalanceTarget, b: BalanceTarget) => a.min === b.min && a.max === b.max;

/**
 * §25.2.1: while the last `full` report of `main` holds a fail, a PR fails "until a PR fixes the
 * metric or attaches an ADR that moves the target". Judged per fail cell of the gate report,
 * matched to the current report by metric id and cell id:
 * - lifted when the current cell passes (the PR fixed the metric, measured at its own sample size);
 * - lifted when the current cell's target differs from the gate cell's and the gate's interval
 *   no longer fails under it (the PR moved the target; the ADR goes with it);
 * - lifted when the current report ran the metric's scenario and no longer has the cell (the PR
 *   removed what it measured); a scenario the current run left out keeps the cell failing;
 * - failing otherwise. An inconclusive current cell does not lift it: at `pr` size every PR that
 *   leaves a marginal fail alone would read inconclusive, and the gate would never hold. A fix
 *   the `pr` sample cannot show goes through the ADR label of balance.yml.
 */
export function judgeGate(gate: BalanceReport, current: BalanceReport): GateCell[] {
  const out: GateCell[] = [];
  for (const gm of gate.metrics) {
    const cm = current.metrics.find((m) => m.id === gm.id);
    for (const gc of gm.cells) {
      if (gc.verdict !== "fail") continue;
      const base = { metric: gm.id, number: gm.number, cell: gc.id };
      const cc = cm?.cells.find((c) => c.id === gc.id);
      if (cc === undefined) {
        out.push(
          current.metadata.scenarios.includes(gm.scenario)
            ? { ...base, status: "lifted", reason: "no longer in the current report" }
            : { ...base, status: "failing", reason: `scenario ${gm.scenario} not run` },
        );
        continue;
      }
      if (cc.verdict === "pass") {
        out.push({ ...base, status: "lifted", reason: "passes in the current report" });
        continue;
      }
      if (!sameTarget(cc.target, gc.target)) {
        const rejudged = cellVerdict(gc.interval, cc.target);
        if (rejudged !== "fail") {
          out.push({
            ...base,
            status: "lifted",
            reason: `target moved: the gate's interval is ${rejudged} under the current target`,
          });
          continue;
        }
      }
      out.push({ ...base, status: "failing", reason: `current cell ${cc.verdict}` });
    }
  }
  return out.sort((a, b) => a.number - b.number);
}

export type ExitChecks = {
  /** `--fail-on-verdict`. */
  readonly failOnVerdict: boolean;
  /** `--max-wall-ms`: the time budget of docs/race-engine.md 24.4. */
  readonly maxWallMs: number | undefined;
  /** The `--gate-report` file, read (only used with `failOnVerdict`). */
  readonly gate: ReportRead | undefined;
  /** `--gate-report` path, for messages. */
  readonly gatePath?: string;
};

export type ExitDecision = {
  readonly code: 0 | 1;
  /** Lines for stderr (the reasons of a non-zero exit, and warnings). */
  readonly lines: readonly string[];
  /** The judged gate cells, when a gate report was read and judged. */
  readonly gate: readonly GateCell[] | undefined;
};

/**
 * Exit code after the report is written: 1 on any DNF (an engine bug, §19), on a wall time at or
 * over `--max-wall-ms` (24.4) and, with `--fail-on-verdict`, on a fail verdict or a gate cell that
 * still fails. A gate report this revision cannot read is skipped with a warning (it comes from
 * `main`, which cannot read a format the PR introduces until the PR merges).
 */
export function exitDecision(report: BalanceReport, checks: ExitChecks): ExitDecision {
  const lines: string[] = [];
  let code: 0 | 1 = 0;
  const m = report.metadata;
  if (m.dnf > 0) {
    lines.push(`sim:batch: ${m.dnf} DNF results: an engine bug (§19), not balance`);
    code = 1;
  }
  if (checks.maxWallMs !== undefined && m.timing.wallMs >= checks.maxWallMs) {
    lines.push(
      `sim:batch: wall time ${Math.round(m.timing.wallMs)} ms for ${m.races} races is over the ${checks.maxWallMs} ms budget (docs/race-engine.md 24.4)`,
    );
    code = 1;
  }
  let gate: GateCell[] | undefined;
  if (checks.failOnVerdict) {
    if (report.verdict === "fail") {
      lines.push("sim:batch: verdict fail (BRIEF §12: a metric out of range blocks the merge)");
      code = 1;
    }
    const where = checks.gatePath ?? "the gate report";
    if (checks.gate !== undefined && !checks.gate.ok)
      lines.push(`sim:batch: warning: ${where} skipped, ${checks.gate.reason}`);
    if (checks.gate?.ok) {
      gate = judgeGate(checks.gate.report, report);
      const failing = gate.filter((g) => g.status === "failing");
      if (failing.length > 0) {
        lines.push(
          `sim:batch: ${where} holds ${failing.length} fail cell(s) this PR neither fixes nor re-targets (§25.2.1: fix the metric or attach an ADR):`,
          ...failing.map((g) => `  ${g.number}. ${g.metric} ${g.cell}: ${g.reason}`),
        );
        code = 1;
      }
    }
  }
  return { code, lines, gate };
}
