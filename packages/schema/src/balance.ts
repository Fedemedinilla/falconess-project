import { z } from "zod";
import { RulesetVersion } from "./core.js";

/**
 * `out/balance.json`, written by `pnpm sim:batch` (BRIEF §12, docs/race-engine.md §25.2).
 * Verdicts follow §25.2.1: pass when the 95 % interval lies inside the target, fail when it lies
 * entirely outside, inconclusive when it straddles an edge. A metric passes only if every cell
 * passes and fails if any cell fails.
 */
export const BalanceVerdict = z.enum(["pass", "fail", "inconclusive"]);
export type BalanceVerdict = z.infer<typeof BalanceVerdict>;

/** `pr` is the per-PR batch (`--runs N`); `full` is the nightly profile (§25.2.1). */
export const BalanceProfile = z.enum(["pr", "full"]);
export type BalanceProfile = z.infer<typeof BalanceProfile>;

/** Scenarios of §25.2; `quirks` and `stats` are the `full`-only diagnostics. */
export const BalanceScenario = z.enum([
  "S1",
  "S2",
  "S3",
  "S4",
  "S5",
  "S6",
  "S7",
  "S8",
  "quirks",
  "stats",
]);
export type BalanceScenario = z.infer<typeof BalanceScenario>;

/**
 * How a cell value reads: `rate` and `points` are fractions shown in % and percentage points,
 * `fraction` is σ/mean, `ratio` is generic wins / signature wins, `metres` is a distance.
 */
export const BalanceUnit = z.enum(["rate", "points", "fraction", "ratio", "metres"]);
export type BalanceUnit = z.infer<typeof BalanceUnit>;

/**
 * `wilson`: win rate over independent races. `paired-normal`: normal interval of a mean paired
 * difference. `sigma`: σ × (1 ± 1.96 / √(2(N − 1))). `share-ratio`: paired score interval (Tango)
 * of the signature's mean share, mapped through (1 − p) / p (S3; the normal interval of the mean
 * until ADR-0005 «Pasada 2»). `converted`: S5's paired time gain mapped to win-rate points with the
 * equal-field model.
 */
export const BalanceIntervalMethod = z.enum([
  "wilson",
  "paired-normal",
  "sigma",
  "share-ratio",
  "converted",
]);
export type BalanceIntervalMethod = z.infer<typeof BalanceIntervalMethod>;

/** `null` bounds are unbounded (too few samples, or a ratio whose denominator can reach 0). */
export const BalanceInterval = z.strictObject({
  lo: z.number().nullable(),
  hi: z.number().nullable(),
  method: BalanceIntervalMethod,
});
export type BalanceInterval = z.infer<typeof BalanceInterval>;

/** Inclusive band; a one-sided target leaves the other side `null` (e.g. "weak ≤ 15 %"). */
export const BalanceTarget = z
  .strictObject({ min: z.number().nullable(), max: z.number().nullable() })
  .refine((t) => t.min !== null || t.max !== null, "a target needs at least one bound");
export type BalanceTarget = z.infer<typeof BalanceTarget>;

export const BalanceCell = z.strictObject({
  /** Stable key used by the baseline diff, e.g. `koryu/desert-sprint`. */
  id: z.string().min(1),
  /** `null` when the estimate is undefined (a ratio over zero signature wins). */
  value: z.number().nullable(),
  interval: BalanceInterval,
  target: BalanceTarget,
  verdict: BalanceVerdict,
  /** Sample count behind the interval: races, paired samples, paired seeds or seasons. */
  n: z.number().int().min(0),
  note: z.string().optional(),
});
export type BalanceCell = z.infer<typeof BalanceCell>;

export const BalanceMetric = z.strictObject({
  /** `m1-style` … `m8-intelligence`. */
  id: z.string().min(1),
  /** BRIEF §12 metric number; 8 is the Intelligence gate added by §25.2 (S8). */
  number: z.number().int().min(1).max(8),
  scenario: BalanceScenario,
  title: z.string().min(1),
  unit: BalanceUnit,
  targetText: z.string().min(1),
  verdict: BalanceVerdict,
  cells: z.array(BalanceCell).min(1),
  notes: z.array(z.string()),
});
export type BalanceMetric = z.infer<typeof BalanceMetric>;

/** Informative table (diagnostics of §25.2); never part of a verdict. */
export const BalanceTable = z
  .strictObject({
    id: z.string().min(1),
    scenario: BalanceScenario,
    title: z.string().min(1),
    columns: z.array(z.string()).min(1),
    rows: z.array(z.array(z.union([z.string(), z.number(), z.null()]))),
    notes: z.array(z.string()),
  })
  .refine(
    (t) => t.rows.every((r) => r.length === t.columns.length),
    "every row needs one value per column",
  );
export type BalanceTable = z.infer<typeof BalanceTable>;

/** One line of the run budget of §25.2.1. */
export const BalanceBudgetLine = z.strictObject({
  key: z.string().min(1),
  scenario: BalanceScenario,
  unit: z.string().min(1),
  racesPerUnit: z.number().int().min(1),
  /** Units per cell, in cell order (S1 absorbs the rounding remainder, S3 `full` may double). */
  perCell: z.array(z.number().int().min(0)),
  plannedRaces: z.number().int().min(0),
  /** Races actually run (S7 runs fewer when a goal fails and ends the season). */
  races: z.number().int().min(0),
});
export type BalanceBudgetLine = z.infer<typeof BalanceBudgetLine>;

export const BalanceTiming = z.strictObject({
  /** Races run through the race engine port (S7 goal races run inside the season engine). */
  races: z.number().int().min(0),
  /** Time spent inside `simulateRace`, summed over workers. */
  engineMs: z.number().min(0),
  msPerRace: z.number().min(0).nullable(),
  seasons: z.number().int().min(0),
  seasonMs: z.number().min(0),
  wallMs: z.number().min(0),
  workers: z.number().int().min(1),
});
export type BalanceTiming = z.infer<typeof BalanceTiming>;

export const BalanceReport = z.strictObject({
  kind: z.literal("falconess-balance-report"),
  schemaVersion: z.literal(1),
  metadata: z.strictObject({
    rulesetVersion: RulesetVersion,
    /** Race engine behind the batch's port: `v1`, or `fake` for the development stand-in. */
    engine: z.string().min(1),
    /** Engine of the season goal races (S7): `stub` until the season is wired, then `v1`. */
    seasonEngine: z.string().min(1),
    profile: BalanceProfile,
    /** `--runs` of the `pr` profile; the fixed budget total in `full`. */
    runs: z.number().int().min(1),
    plannedRaces: z.number().int().min(0),
    races: z.number().int().min(0),
    seedBase: z.string(),
    seedPattern: z.string().min(1),
    scenarios: z.array(BalanceScenario).min(1),
    budget: z.array(BalanceBudgetLine),
    /** Must be 0: a DNF means an engine bug (§19). */
    dnf: z.number().int().min(0),
    /** Machine-dependent; everything else in the report is a pure function of the inputs. */
    timing: BalanceTiming,
  }),
  verdict: BalanceVerdict,
  metrics: z.array(BalanceMetric),
  diagnostics: z.array(BalanceTable),
});
export type BalanceReport = z.infer<typeof BalanceReport>;
