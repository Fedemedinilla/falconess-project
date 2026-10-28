/** Command line of `pnpm sim:batch` (docs/race-engine.md §25.2.1, BRIEF §12). */
import { type BalanceScenario, BalanceScenario as ScenarioEnum } from "@falconess/schema";
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
  --fail-on-verdict    exit 1 when the report's verdict is fail
  --gate-report PATH   with --fail-on-verdict, also exit 1 when that report (last full of main) fails
  --help               this text

Exit codes: 0 done, 1 verdict fail (with --fail-on-verdict) or DNF, 2 engine not available, 64 usage.`;

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

export type BatchOptions = {
  config: BatchConfig;
  workers: number;
  engine: EngineChoice;
  reportPath: string;
  baselinePath: string | undefined;
  markdownPath: string | undefined;
  failOnVerdict: boolean;
  gateReportPath: string | undefined;
  help: boolean;
};

const KNOWN = new Set([
  "runs",
  "profile",
  "scenarios",
  "seed",
  "report",
  "baseline",
  "markdown",
  "workers",
  "engine",
  "fail-on-verdict",
  "gate-report",
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
  const engine: EngineChoice =
    engineArg === "fake" ? { kind: "fake", options: {} } : { kind: "real" };

  const runsArg = str("runs");
  const workersArg = str("workers");
  return {
    config: {
      profile,
      runs: runsArg === undefined ? 10_000 : positiveInt("runs", runsArg),
      scenarios,
      seedBase: str("seed") ?? "",
    },
    workers: workersArg === undefined ? defaultWorkers() : positiveInt("workers", workersArg),
    engine,
    reportPath: str("report") ?? "out/balance.json",
    baselinePath: str("baseline"),
    markdownPath: str("markdown"),
    failOnVerdict: flag("fail-on-verdict"),
    gateReportPath: str("gate-report"),
    help: flag("help"),
  };
}
