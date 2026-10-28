/**
 * Run budget, seeds and jobs of the balance batch (docs/race-engine.md §25.2, §25.2.1).
 *
 * A job is one sampling unit of a scenario (a race, a paired sample, a paired seed, an I sweep or a
 * season). Jobs are numbered in plan order and carry everything a worker needs, including their
 * seed, so results depend on the job index only, never on which worker ran it.
 */
import type { BalanceProfile, BalanceScenario, Slug, StatName, Style } from "@falconess/schema";
import { STAT_NAMES } from "@falconess/schema";
import type { Catalog } from "./catalog.js";

export type Profile = BalanceProfile;

export type Job =
  | { id: number; scenario: "S1"; course: Slug; k: number; seed: string }
  | {
      id: number;
      scenario: "S2";
      variant: "real" | "equal-pw";
      course: Slug;
      k: number;
      seed: string;
    }
  | { id: number; scenario: "S3"; pair: Slug; course: Slug; k: number; seed: string }
  | { id: number; scenario: "S4"; skill: Slug; course: Slug; k: number; seed: string }
  | { id: number; scenario: "S5"; part: Slug; course: Slug; k: number; seed: string }
  | { id: number; scenario: "S7"; falconess: Slug; k: number; seed: string }
  | { id: number; scenario: "S8"; style: Style; course: Slug; k: number; seed: string }
  | { id: number; scenario: "quirks"; quirk: Slug; course: Slug; k: number; seed: string }
  | { id: number; scenario: "stats"; stat: StatName; course: Slug; k: number; seed: string };

export type BudgetKey =
  | "S1"
  | "S2-real"
  | "S2-equal-pw"
  | "S3"
  | "S4"
  | "S5"
  | "S7"
  | "S8"
  | "quirks"
  | "stats";

export type BudgetRow = {
  key: BudgetKey;
  scenario: BalanceScenario;
  unit: string;
  /** Races per unit (S7: budgeted goal races per season; a failed goal ends the season early). */
  racesPerUnit: number;
  /** Units per cell in the `pr` profile at `--runs 10000` (S1 absorbs the remainder). */
  pr: number;
  /** Units per cell in the `full` profile. */
  full: number;
};

/** The table of §25.2.1, in plan order. */
export const BUDGET: readonly BudgetRow[] = [
  { key: "S1", scenario: "S1", unit: "8-runner race", racesPerUnit: 1, pr: 400, full: 800 },
  { key: "S2-real", scenario: "S2", unit: "8-runner race", racesPerUnit: 1, pr: 200, full: 600 },
  {
    key: "S2-equal-pw",
    scenario: "S2",
    unit: "8-runner race",
    racesPerUnit: 1,
    pr: 300,
    full: 600,
  },
  {
    key: "S3",
    scenario: "S3",
    unit: "paired sample (2 two-runner races)",
    racesPerUnit: 2,
    pr: 150,
    full: 4000,
  },
  {
    key: "S4",
    scenario: "S4",
    unit: "paired seed (2 8-runner races)",
    racesPerUnit: 2,
    pr: 20,
    full: 100,
  },
  {
    key: "S5",
    scenario: "S5",
    unit: "paired seed (2 8-runner races)",
    racesPerUnit: 2,
    pr: 30,
    full: 1500,
  },
  {
    key: "S7",
    scenario: "S7",
    unit: "season (4 goal races)",
    racesPerUnit: 4,
    pr: 60,
    full: 500,
  },
  {
    key: "S8",
    scenario: "S8",
    unit: "I sweep (5 8-runner races, one per I)",
    racesPerUnit: 5,
    pr: 20,
    full: 1500,
  },
  {
    key: "quirks",
    scenario: "quirks",
    unit: "paired seed (2 8-runner races)",
    racesPerUnit: 2,
    pr: 0,
    full: 200,
  },
  {
    key: "stats",
    scenario: "stats",
    unit: "paired seed (2 solo races)",
    racesPerUnit: 2,
    pr: 0,
    full: 100,
  },
];

/** `pr` budget reference: the counts of §25.2.1 are written for `--runs 10000`. */
export const PR_REFERENCE_RUNS = 10_000;

/** S8: the five Intelligence values (510 and 630 are letters E and A at base 600). */
export const S8_INTELLIGENCE = [300, 510, 600, 630, 1000] as const;

/** S3 `full`: samples double once (4000 → 8000) while a cell is inconclusive. */
export const S3_FULL_MAX_FACTOR = 2;

export const ALL_SCENARIOS: readonly BalanceScenario[] = [
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
];

export type BatchConfig = {
  profile: Profile;
  /** `--runs`; ignored by `full`. */
  runs: number;
  scenarios: readonly BalanceScenario[];
  /** Prefix of every seed; empty gives the literal seeds of §25.2. */
  seedBase: string;
};

export class PlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanError";
  }
}

/** Default scenario set: S1-S8, plus the two diagnostics in `full`. */
export function defaultScenarios(profile: Profile): BalanceScenario[] {
  return ALL_SCENARIOS.filter((s) => profile === "full" || (s !== "quirks" && s !== "stats"));
}

/**
 * Scenarios that must also run: S6 is computed from S1's races, and S5's `pr` verdict converts the
 * time gain with the σ that S6 measures in the same run (§25.2).
 */
export function resolveScenarios(
  profile: Profile,
  requested: readonly BalanceScenario[],
): BalanceScenario[] {
  for (const s of requested)
    if ((s === "quirks" || s === "stats") && profile !== "full")
      throw new PlanError(`scenario ${s} runs only in the full profile`);
  const set = new Set(requested);
  if (set.has("S6") || (profile === "pr" && set.has("S5"))) {
    set.add("S1");
    set.add("S6");
  }
  if (set.has("S1")) set.add("S6");
  return ALL_SCENARIOS.filter((s) => set.has(s));
}

/** `${seedBase/}${profile}/${scenario}/${course}/${cell}/${k}` (§25.2 "Common rules"). */
export function seedFor(
  seedBase: string,
  profile: Profile,
  scenario: string,
  course: string,
  cell: string,
  k: number,
): string {
  const core = `${profile}/${scenario}/${course}/${cell}/${k}`;
  return seedBase === "" ? core : `${seedBase}/${core}`;
}

export function seedPattern(seedBase: string): string {
  const core = "<profile>/<scenario>/<course>/<cell>/<k>";
  return seedBase === "" ? core : `${seedBase}/${core}`;
}

/** One cell of a budget line: what its seeds are made of and how to build its job. */
export type PlanCell = {
  seedCourse: string;
  seedCell: string;
  make(id: number, k: number, seed: string): Job;
};

/** The cells of each budget line, in plan order, derived from the catalog. */
export function planCells(key: BudgetKey, catalog: Catalog): PlanCell[] {
  const courses = catalog.courses.map((c) => c.id);
  switch (key) {
    case "S1":
      return courses.map((course) => ({
        seedCourse: course,
        seedCell: "field",
        make: (id, k, seed) => ({ id, scenario: "S1", course, k, seed }),
      }));
    case "S2-real":
    case "S2-equal-pw": {
      const variant = key === "S2-real" ? "real" : "equal-pw";
      return courses.map((course) => ({
        seedCourse: course,
        seedCell: variant,
        make: (id, k, seed) => ({ id, scenario: "S2", variant, course, k, seed }),
      }));
    }
    case "S3":
      return catalog.s3Pairs.flatMap((p) =>
        courses.map((course) => ({
          seedCourse: course,
          seedCell: p.falconessId,
          make: (id, k, seed) => ({
            id,
            scenario: "S3" as const,
            pair: p.falconessId,
            course,
            k,
            seed,
          }),
        })),
      );
    case "S4":
      return catalog.s4Cells.map(({ skillId, courseId }) => ({
        seedCourse: courseId,
        seedCell: skillId,
        make: (id, k, seed) => ({ id, scenario: "S4", skill: skillId, course: courseId, k, seed }),
      }));
    case "S5":
      return catalog.parts.flatMap((part) =>
        courses.map((course) => ({
          seedCourse: course,
          seedCell: part,
          make: (id, k, seed) => ({ id, scenario: "S5" as const, part, course, k, seed }),
        })),
      );
    case "S7":
      return catalog.falconess.map((falconess) => ({
        seedCourse: "season",
        seedCell: falconess,
        make: (id, k, seed) => ({ id, scenario: "S7", falconess, k, seed }),
      }));
    case "S8":
      return catalog.styles.flatMap((style) =>
        courses.map((course) => ({
          seedCourse: course,
          seedCell: style,
          make: (id, k, seed) => ({ id, scenario: "S8" as const, style, course, k, seed }),
        })),
      );
    case "quirks":
      return catalog.quirks.flatMap((quirk) =>
        courses.map((course) => ({
          seedCourse: course,
          seedCell: quirk,
          make: (id, k, seed) => ({ id, scenario: "quirks" as const, quirk, course, k, seed }),
        })),
      );
    case "stats":
      return STAT_NAMES.flatMap((stat) =>
        courses.map((course) => ({
          seedCourse: course,
          seedCell: stat,
          make: (id, k, seed) => ({ id, scenario: "stats" as const, stat, course, k, seed }),
        })),
      );
  }
}

/**
 * `pr` units per cell of every line but S1 (each count × runs / 10 000, floored, at least 1 per
 * cell; a line whose `pr` count is 0 stays 0). Returns the races they take; fills `out` if given.
 */
function prOthers(
  runs: number,
  cellCounts: ReadonlyMap<BudgetKey, number>,
  out?: Map<BudgetKey, number[]>,
): number {
  let used = 0;
  for (const row of BUDGET) {
    if (row.key === "S1") continue;
    const cells = cellCounts.get(row.key) ?? 0;
    const per = row.pr === 0 ? 0 : Math.max(1, Math.floor((row.pr * runs) / PR_REFERENCE_RUNS));
    out?.set(row.key, new Array<number>(cells).fill(per));
    used += per * cells * row.racesPerUnit;
  }
  return used;
}

/** Units per cell of every budget line, before any selection. */
export type Allocation = ReadonlyMap<BudgetKey, readonly number[]>;

/**
 * §25.2.1. `full`: the fixed counts. `pr`: each count × runs / 10 000, floored, at least 1 per
 * cell (lines whose `pr` count is 0 stay 0); S1 absorbs the remainder so the budgeted races add up
 * to exactly `runs`, spread over its cells as evenly as possible (earlier cells take the extra
 * race). Computed over every line, so a `--scenarios` selection never changes a cell's count.
 */
export function allocate(
  profile: Profile,
  runs: number,
  cellCounts: ReadonlyMap<BudgetKey, number>,
): Allocation {
  const out = new Map<BudgetKey, number[]>();
  const cellsOf = (key: BudgetKey): number => cellCounts.get(key) ?? 0;
  if (profile === "full") {
    for (const row of BUDGET) out.set(row.key, new Array<number>(cellsOf(row.key)).fill(row.full));
    return out;
  }
  if (!Number.isInteger(runs) || runs < 1)
    throw new PlanError(`--runs must be a positive integer, got ${runs}`);
  const s1Cells = cellsOf("S1");
  const used = prOthers(runs, cellCounts, out);
  const remainder = runs - used;
  if (s1Cells > 0 && remainder < s1Cells) {
    let next = runs + 1;
    while (next - prOthers(next, cellCounts) < s1Cells) next++;
    throw new PlanError(
      `--runs ${runs} is too small for the pr budget: the other scenarios take ${used} races and S1 needs at least ${s1Cells}; the next budget that fits is --runs ${next}`,
    );
  }
  const base = s1Cells > 0 ? Math.floor(remainder / s1Cells) : 0;
  const extra = s1Cells > 0 ? remainder % s1Cells : 0;
  out.set(
    "S1",
    Array.from({ length: s1Cells }, (_, i) => base + (i < extra ? 1 : 0)),
  );
  return out;
}

export type PlanLine = {
  row: BudgetRow;
  cells: readonly PlanCell[];
  perCell: readonly number[];
};

export type Plan = {
  config: BatchConfig;
  lines: readonly PlanLine[];
  jobs: readonly Job[];
};

function cellCountsOf(catalog: Catalog): Map<BudgetKey, number> {
  return new Map(BUDGET.map((r) => [r.key, planCells(r.key, catalog).length]));
}

/** The plan of the selected scenarios: budget lines and numbered jobs, in §25.2.1 order. */
export function buildPlan(config: BatchConfig, catalog: Catalog): Plan {
  const allocation = allocate(config.profile, config.runs, cellCountsOf(catalog));
  const lines: PlanLine[] = [];
  const jobs: Job[] = [];
  for (const row of BUDGET) {
    if (!config.scenarios.includes(row.scenario)) continue;
    const cells = planCells(row.key, catalog);
    const perCell = allocation.get(row.key) ?? [];
    if (perCell.every((n) => n === 0)) continue;
    lines.push({ row, cells, perCell });
    cells.forEach((cell, i) => {
      const count = perCell[i] ?? 0;
      for (let k = 0; k < count; k++) {
        const seed = seedFor(
          config.seedBase,
          config.profile,
          row.scenario,
          cell.seedCourse,
          cell.seedCell,
          k,
        );
        jobs.push(cell.make(jobs.length, k, seed));
      }
    });
  }
  return { config, lines, jobs };
}

/** Races the plan budgets (S7 counts its full 4 goal races per season). */
export function plannedRaces(plan: Plan): number {
  let n = 0;
  for (const line of plan.lines)
    for (const count of line.perCell) n += count * line.row.racesPerUnit;
  return n;
}

/**
 * S3 `full`: extra samples k = n..2n−1 for the given (pair, course) cells, numbered after the
 * existing jobs. The budget line's per-cell counts are updated in the returned plan.
 */
export function extendS3(
  plan: Plan,
  cells: readonly { pair: Slug; course: Slug }[],
): { plan: Plan; jobs: Job[] } {
  const line = plan.lines.find((l) => l.row.key === "S3");
  if (!line || cells.length === 0) return { plan, jobs: [] };
  const perCell = line.perCell.slice();
  const extra: Job[] = [];
  let id = plan.jobs.length;
  line.cells.forEach((cell, i) => {
    if (!cells.some((c) => c.pair === cell.seedCell && c.course === cell.seedCourse)) return;
    const n = line.perCell[i] ?? 0;
    for (let k = n; k < n * S3_FULL_MAX_FACTOR; k++) {
      const seed = seedFor(
        plan.config.seedBase,
        plan.config.profile,
        "S3",
        cell.seedCourse,
        cell.seedCell,
        k,
      );
      extra.push(cell.make(id++, k, seed));
    }
    perCell[i] = n * S3_FULL_MAX_FACTOR;
  });
  const lines = plan.lines.map((l) => (l === line ? { ...l, perCell } : l));
  return { plan: { ...plan, lines, jobs: [...plan.jobs, ...extra] }, jobs: extra };
}
