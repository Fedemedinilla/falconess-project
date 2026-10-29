/**
 * `pnpm sim:batch -- --runs 10000 [--profile pr|full] [--scenarios S1,S3] [--seed base]
 *   [--report out/balance.json] [--baseline out/baseline.json [--baseline-from TEXT]]
 *   [--markdown out/balance.md] [--workers N] [--fail-on-verdict [--gate-report PATH]]
 *   [--max-wall-ms MS] [--ruleset v1|v2]`
 *
 * The balance batch of BRIEF §12 with the scenarios, run budget and verdicts of
 * docs/race-engine.md §25.2 (ADR-0003 D40, D47, D48, D49). The race engine sits behind the port
 * of `batch/engine-port.ts`, bound to `@falconess/sim` by `batch/engine-adapter.ts`.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadContent } from "@falconess/content";
import type { BalanceReport } from "@falconess/schema";
import { getRuleset } from "@falconess/sim";
import { type BaselineDiff, diffReports, renderDiffMarkdown } from "./batch/baseline.js";
import { exitDecision, parseReportText, type ReportRead } from "./batch/gate.js";
import { parseBatchArgs, USAGE, UsageError } from "./batch/options.js";
import { PlanError } from "./batch/plan.js";
import { createPort } from "./batch/pool.js";
import { REPORT_MARKER, renderMarkdown, renderSummary } from "./batch/report.js";
import { runBatch } from "./batch/run.js";

/** GitHub caps a comment at 65 536 characters. */
const COMMENT_LIMIT = 60_000;

function readReport(path: string): ReportRead {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (e) {
    return { ok: false, reason: `unreadable (${e instanceof Error ? e.message : String(e)})` };
  }
  return parseReportText(text);
}

function write(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

async function main(argv: readonly string[]): Promise<number> {
  let opts: ReturnType<typeof parseBatchArgs>;
  try {
    opts = parseBatchArgs(argv);
  } catch (e) {
    if (e instanceof UsageError) {
      console.error(`sim:batch: ${e.message}\n\n${USAGE}`);
      return 64;
    }
    throw e;
  }
  if (opts.help) {
    console.log(USAGE);
    return 0;
  }

  const engineId = createPort(opts.engine).engineId;

  let report: BalanceReport;
  try {
    report = await runBatch({
      config: opts.config,
      workers: opts.workers,
      engine: opts.engine,
      engineId,
      ruleset: getRuleset(opts.rulesetVersion),
      content: loadContent(),
    });
  } catch (e) {
    if (e instanceof PlanError) {
      console.error(`sim:batch: ${e.message}`);
      return 64;
    }
    throw e;
  }
  write(opts.reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(renderSummary(report));
  console.log(`report: ${opts.reportPath}`);

  const notices: string[] = [];
  let diff: BaselineDiff | undefined;
  if (opts.baselinePath !== undefined) {
    const baseline = readReport(opts.baselinePath);
    if (baseline.ok) {
      diff = diffReports(baseline.report, report, opts.baselineFrom);
      console.log(`\n${renderDiffMarkdown(diff)}\n`);
    } else {
      const from = opts.baselineFrom === undefined ? "" : ` (${opts.baselineFrom})`;
      const line = `Baseline ${opts.baselinePath}${from} skipped, ${baseline.reason}: no diff in this report.`;
      console.warn(`sim:batch: warning: ${line}`);
      notices.push(line);
    }
  }

  const gate =
    opts.failOnVerdict && opts.gateReportPath !== undefined
      ? readReport(opts.gateReportPath)
      : undefined;
  const decision = exitDecision(report, {
    failOnVerdict: opts.failOnVerdict,
    maxWallMs: opts.maxWallMs,
    gate,
    ...(opts.gateReportPath === undefined ? {} : { gatePath: opts.gateReportPath }),
  });
  if (gate !== undefined && !gate.ok)
    notices.push(`Gate report ${opts.gateReportPath} skipped, ${gate.reason}.`);
  if (decision.gate !== undefined && decision.gate.length > 0)
    notices.push(
      `Gate (fail cells of the last full report of main, §25.2.1): ${decision.gate
        .map((g) => `${g.number}. ${g.metric} \`${g.cell}\` ${g.status} (${g.reason})`)
        .join("; ")}.`,
    );

  if (opts.markdownPath !== undefined) {
    const md = renderMarkdown(report, {
      ...(diff ? { diff } : {}),
      notices,
      maxLength: COMMENT_LIMIT,
    });
    write(opts.markdownPath, md.startsWith(REPORT_MARKER) ? md : `${REPORT_MARKER}\n${md}`);
    console.log(`markdown: ${opts.markdownPath}`);
  }

  for (const line of decision.lines) console.error(line);
  return decision.code;
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (e: unknown) => {
    console.error(e);
    process.exitCode = 1;
  },
);
