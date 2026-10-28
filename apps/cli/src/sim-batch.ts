/**
 * `pnpm sim:batch -- --runs 10000 [--profile pr|full] [--scenarios S1,S3] [--seed base]
 *   [--report out/balance.json] [--baseline out/baseline.json] [--markdown out/balance.md]
 *   [--workers N]`
 *
 * The balance batch of BRIEF §12 with the scenarios, run budget and verdicts of
 * docs/race-engine.md §25.2 (ADR-0003 D40, D47, D48, D49). The race engine sits behind the port
 * of `batch/engine-port.ts`, bound to `@falconess/sim` by `batch/engine-adapter.ts`.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadContent } from "@falconess/content";
import { BalanceReport } from "@falconess/schema";
import { RULESET_V1 } from "@falconess/sim";
import { type BaselineDiff, diffReports, renderDiffMarkdown } from "./batch/baseline.js";
import { parseBatchArgs, USAGE, UsageError } from "./batch/options.js";
import { PlanError } from "./batch/plan.js";
import { createPort } from "./batch/pool.js";
import { REPORT_MARKER, renderMarkdown, renderSummary } from "./batch/report.js";
import { runBatch } from "./batch/run.js";

/** GitHub caps a comment at 65 536 characters. */
const COMMENT_LIMIT = 60_000;

function readReport(path: string): BalanceReport {
  return BalanceReport.parse(JSON.parse(readFileSync(path, "utf8")));
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
      ruleset: RULESET_V1,
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

  let diff: BaselineDiff | undefined;
  if (opts.baselinePath !== undefined) {
    diff = diffReports(readReport(opts.baselinePath), report);
    console.log(`\n${renderDiffMarkdown(diff)}\n`);
  }
  if (opts.markdownPath !== undefined) {
    const md = renderMarkdown(report, {
      ...(diff ? { diff } : {}),
      maxLength: COMMENT_LIMIT,
    });
    write(opts.markdownPath, md.startsWith(REPORT_MARKER) ? md : `${REPORT_MARKER}\n${md}`);
    console.log(`markdown: ${opts.markdownPath}`);
  }

  if (report.metadata.dnf > 0) {
    console.error(
      `sim:batch: ${report.metadata.dnf} DNF results: an engine bug (§19), not balance`,
    );
    return 1;
  }
  if (opts.failOnVerdict) {
    if (report.verdict === "fail") {
      console.error("sim:batch: verdict fail (BRIEF §12: a metric out of range blocks the merge)");
      return 1;
    }
    if (opts.gateReportPath !== undefined && readReport(opts.gateReportPath).verdict === "fail") {
      console.error(
        `sim:batch: the gate report ${opts.gateReportPath} holds a fail (§25.2.1: fix the metric or attach an ADR)`,
      );
      return 1;
    }
  }
  return 0;
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
