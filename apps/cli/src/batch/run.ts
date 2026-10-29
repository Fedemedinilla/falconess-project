/** The batch without its CLI: plan, execute (with workers), extend S3 in `full`, measure, report. */
import type { BalanceReport, ContentIndex } from "@falconess/schema";
import type { Ruleset } from "@falconess/sim";
import { buildCatalog } from "./catalog.js";
import type { JobResult } from "./execute.js";
import { computeMetrics, type MetricsInput, s3CellsOf } from "./metrics.js";
import { type BatchConfig, buildPlan, extendS3, type Plan } from "./plan.js";
import { createExecutor, type EngineChoice } from "./pool.js";
import { assembleReport } from "./report.js";

export type RunOptions = {
  config: BatchConfig;
  workers: number;
  engine: EngineChoice;
  engineId: string;
  ruleset: Ruleset;
  content: ContentIndex;
  now?: () => number;
};

function metricsInput(
  opts: RunOptions,
  plan: Plan,
  results: readonly JobResult[],
  catalog: MetricsInput["catalog"],
): MetricsInput {
  return {
    profile: plan.config.profile,
    ruleset: opts.ruleset,
    catalog,
    content: opts.content,
    scenarios: plan.config.scenarios,
    jobs: plan.jobs,
    results,
  };
}

export async function runBatch(opts: RunOptions): Promise<BalanceReport> {
  const now = opts.now ?? (() => performance.now());
  const catalog = buildCatalog(opts.content);
  let plan = buildPlan(opts.config, catalog);
  const executor = createExecutor({
    workers: opts.workers,
    engine: opts.engine,
    ruleset: opts.ruleset,
    content: opts.content,
    catalog,
  });
  const t0 = now();
  let results: JobResult[];
  let timing: Awaited<ReturnType<typeof executor.close>>;
  try {
    results = await executor.run(plan.jobs);
    if (plan.config.profile === "full" && plan.config.scenarios.includes("S3")) {
      // §25.2: S3 `full` doubles a cell's samples (4000 → 8000) while its interval straddles an edge.
      const open = s3CellsOf(metricsInput(opts, plan, results, catalog))
        .filter((c) => c.verdict === "inconclusive")
        .map((c) => ({ pair: c.pair, course: c.course }));
      const extended = extendS3(plan, open);
      if (extended.jobs.length > 0) {
        results = [...results, ...(await executor.run(extended.jobs))];
        plan = extended.plan;
      }
    }
  } finally {
    timing = await executor.close();
  }
  const wallMs = now() - t0;
  const metrics = computeMetrics(metricsInput(opts, plan, results, catalog));
  return assembleReport({
    plan,
    rulesetVersion: opts.ruleset.version,
    engineId: opts.engineId,
    results,
    metrics,
    timing,
    workers: executor.workers,
    wallMs,
  });
}
