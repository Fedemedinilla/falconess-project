/** Command line of `pnpm sim:batch` (docs/race-engine.md §25.2.1, BRIEF §12). */
import { type BalanceScenario, BalanceScenario as ScenarioEnum } from "@falconess/schema";
import { getRuleset, RULESET_V1 } from "@falconess/sim";
import { parseArgs } from "../args.js";
import { type BatchConfig, defaultScenarios, type Profile, resolveScenarios } from "./plan.js";
import { defaultWorkers, type EngineChoice } from "./pool.js";

export const USAGE = `pnpm sim:batch -- [options]

  --runs N             races of the pr profile (default 10000; ignored by full)
  --profile pr|full    pr (alias: default) is the per-PR batch; full is the nightly profile
  --scenarios S1,S3    subset of S1..S8, quirks, stats (S6 and S5-pr pull in S1)
  --seed BASE          prefix every seed with BASE/ (default: the literal seeds of §25.2)
  --report PATH        JSON report (default out/balance.json)
  --baseline PATH      previous report to diff against (Markdown diff to stdout and --markdown)
  --markdown PATH      write the report as Markdown (PR comment)
  --workers N          worker threads (default min(4, cpus - 1)); 1 runs in process
  --engine real|fake   fake is a deterministic stand-in for development (default real)
  --ruleset vN         ruleset of the batch (default v1); S7 plays that ruleset's reference
                       policy (v1 lowest stat, v2 careful; ADR-0006)
  --fake-cost-ms MS    with --engine fake, busy-wait MS per 8-runner race (time the budget)
  --baseline-from TEXT where the baseline comes from (run id, commit), shown in the diff header
  --fail-on-verdict    exit 1 when the report's verdict is fail
  --gate-report PATH   with --fail-on-verdict, also exit 1 while a fail cell of that report (the
                       last full of main) is neither passing nor re-targeted in this report
  --max-wall-ms MS     exit 1 when the batch's wall time reaches MS (the 24.4 budgets: 6000 for
                       --runs 1000, 60000 for --runs 10000)
  --help               this text

Exit codes: 0 done, 1 verdict or gate fail (with --fail-on-verdict), DNF or over --max-wall-ms,
2 engine not available, 64 usage. An unreadable --baseline or --gate-report is a warning.`;

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

export type BatchOptions = {
  config: BatchConfig;
  /** `--ruleset`: v1 until the CI baseline moves to v2 (ADR-0006 «Métrica 7»). */
  rulesetVersion: string;
  workers: number;
  engine: EngineChoice;
  reportPath: string;
  baselinePath: string | undefined;
  baselineFrom: string | undefined;
  markdownPath: string | undefined;
  failOnVerdict: boolean;
  gateReportPath: string | undefined;
  maxWallMs: number | undefined;
  help: boolean;
};

const KNOWN = new Set([
  "runs",
  "profile",
  "scenarios",
  "seed",
  "report",
  "baseline",
  "baseline-from",
  "markdown",
  "workers",
  "engine",
  "ruleset",
  "fake-cost-ms",
  "fail-on-verdict",
  "gate-report",
  "max-wall-ms",
  "help",
]);

function positiveInt(name: string, v: string): number {
  if (!/^\d+$/.test(v) || Number.parseInt(v, 10) < 1)
    throw new UsageError(`--${name} must be a positive integer, got "${v}"`);
  return Number.parseInt(v, 10);
}

export function parseBatchArgs(argv: readonly string[]): BatchOptions {
  const args = parseArgs(argv);
  for (const key of Object.keys(args))
    if (key !== "" && !KNOWN.has(key)) throw new UsageError(`unknown option --${key}`);
  const str = (key: string): string | undefined => {
    const v = args[key];
    if (v === true) throw new UsageError(`--${key} needs a value`);
    return v;
  };
  const flag = (key: string): boolean => {
    const v = args[key];
    if (typeof v === "string") throw new UsageError(`--${key} takes no value`);
    return v === true;
  };

  const profileArg = str("profile") ?? "pr";
  if (!["pr", "default", "full"].includes(profileArg))
    throw new UsageError(`--profile must be pr, default or full, got "${profileArg}"`);
  const profile: Profile = profileArg === "full" ? "full" : "pr";

  const scenariosArg = str("scenarios");
  let requested: BalanceScenario[] = defaultScenarios(profile);
  if (scenariosArg !== undefined) {
    requested = scenariosArg
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s !== "")
      .map((s) => {
        const parsed = ScenarioEnum.safeParse(s);
        if (!parsed.success) throw new UsageError(`unknown scenario "${s}"`);
        return parsed.data;
      });
    if (requested.length === 0) throw new UsageError("--scenarios is empty");
  }
  let scenarios: BalanceScenario[];
  try {
    scenarios = resolveScenarios(profile, requested);
  } catch (e) {
    throw new UsageError(e instanceof Error ? e.message : String(e));
  }

  const engineArg = str("engine") ?? "real";
  if (engineArg !== "real" && engineArg !== "fake")
    throw new UsageError(`--engine must be real or fake, got "${engineArg}"`);
  const costArg = str("fake-cost-ms");
  if (costArg !== undefined && engineArg !== "fake")
    throw new UsageError("--fake-cost-ms needs --engine fake");
  const engine: EngineChoice =
    engineArg === "fake"
      ? {
          kind: "fake",
          options:
            costArg === undefined
              ? {}
              : { costMsPer8Runners: positiveInt("fake-cost-ms", costArg) },
        }
      : { kind: "real" };

  const rulesetVersion = str("ruleset") ?? RULESET_V1.version;
  try {
    getRuleset(rulesetVersion);
  } catch {
    throw new UsageError(`--ruleset: unknown ruleset "${rulesetVersion}"`);
  }

  const runsArg = str("runs");
  const workersArg = str("workers");
  const wallArg = str("max-wall-ms");
  return {
    config: {
      profile,
      runs: runsArg === undefined ? 10_000 : positiveInt("runs", runsArg),
      scenarios,
      seedBase: str("seed") ?? "",
    },
    rulesetVersion,
    workers: workersArg === undefined ? defaultWorkers() : positiveInt("workers", workersArg),
    engine,
    reportPath: str("report") ?? "out/balance.json",
    baselinePath: str("baseline"),
    baselineFrom: str("baseline-from"),
    markdownPath: str("markdown"),
    failOnVerdict: flag("fail-on-verdict"),
    gateReportPath: str("gate-report"),
    maxWallMs: wallArg === undefined ? undefined : positiveInt("max-wall-ms", wallArg),
    help: flag("help"),
  };
}
