import { loadContent } from "@falconess/content";
import type { BalanceMetric, BalanceScenario } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { buildCatalog } from "./catalog.js";
import type { JobResult, RaceRecord, SeasonRecord } from "./execute.js";
import { computeMetrics, type MetricsInput, s3CellsOf } from "./metrics.js";
import type { Job, Profile } from "./plan.js";
import { meanInterval, pointsFromTimeGain, wilson } from "./stats.js";

const content = loadContent();
const catalog = buildCatalog(content);

/** Omit distributed over the union, so each scenario keeps its own fields. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type Row = {
  job: DistributiveOmit<Job, "id" | "seed">;
  races?: RaceRecord[];
  extra?: Partial<JobResult>;
};

function input(
  rows: readonly Row[],
  scenarios: BalanceScenario[],
  profile: Profile = "pr",
): MetricsInput {
  const jobs = rows.map((r, id): Job => ({ ...r.job, id, seed: `t/${id}` }));
  const results: JobResult[] = rows.map((r, id) => ({
    id,
    races: r.races ?? [],
    dnf: 0,
    ...r.extra,
  }));
  return { profile, catalog, content, scenarios, jobs, results };
}

function metric(out: ReturnType<typeof computeMetrics>, id: string): BalanceMetric {
  const m = out.metrics.find((x) => x.id === id);
  if (!m) throw new Error(`no metric ${id}`);
  return m;
}

const race = (finish: (number | null)[], phaseTicks?: number[][]): RaceRecord =>
  phaseTicks ? { finish, phaseTicks } : { finish };

describe("S1 style metric and S6 dispersion", () => {
  const s1 = (course: string, k: number, finish: number[]): Row => ({
    job: { scenario: "S1", course, k },
    races: [
      race(
        finish,
        finish.map(() => [100, 300, 200]),
      ),
    ],
  });
  // Roles: dive-1, dive-2, hover-1, hover-2, glide-1, glide-2, ground-1, ground-2.
  const rows = [
    s1("desert-sprint", 0, [900, 1000, 1001, 1002, 1003, 1004, 1005, 1006]),
    s1("desert-sprint", 1, [1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000]),
    s1("desert-sprint", 2, [1010, 1010, 1010, 1010, 990, 1010, 1010, 1010]),
  ];

  it("counts style wins with dead heats split and gates the per-biome mean with Wilson", () => {
    const out = computeMetrics(input(rows, ["S1", "S6"]));
    const m1 = metric(out, "m1-style");
    const dive = m1.cells.find((c) => c.id === "desert/dive");
    // Race 0: dive wins; race 1: 8-way dead heat (2/8 to each style); race 2: glide wins.
    expect(dive?.value).toBeCloseTo((1 + 0.25) / 3, 6);
    expect(m1.cells.find((c) => c.id === "desert/glide")?.value).toBeCloseTo((0.25 + 1) / 3, 6);
    expect(m1.cells.find((c) => c.id === "desert/ground")?.value).toBeCloseTo(0.25 / 3, 6);
    const ci = wilson(1.25, 3);
    expect(dive?.interval.lo).toBeCloseTo(ci.lo ?? Number.NaN, 6);
    expect(dive?.n).toBe(3);
    const phases = out.diagnostics.find((d) => d.id === "s1-phases");
    expect(phases?.rows[0]).toEqual(["desert-sprint", "dive", 6.67, 20, 13.33]);
  });

  it("measures σ/mean per runner over the S1 seeds and averages the 8 runners", () => {
    const out = computeMetrics(input(rows, ["S1", "S6"]));
    const m6 = metric(out, "m6-dispersion");
    const cell = m6.cells[0];
    expect(cell?.id).toBe("desert-sprint");
    const cv = (xs: number[]) => {
      const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
      const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1));
      return sd / mean;
    };
    const byRole = [0, 1, 2, 3, 4, 5, 6, 7].map((r) =>
      cv(rows.map((x) => x.races?.[0]?.finish[r] ?? 0)),
    );
    const expected = byRole.reduce((a, b) => a + b, 0) / 8;
    expect(cell?.value).toBeCloseTo(expected, 6);
    expect(cell?.interval.method).toBe("sigma");
    expect(cell?.n).toBe(3);
  });
});

describe("S2 manufacturer cells", () => {
  it("gates only home and weak cells on the designated entry's win share", () => {
    // Roles 0..4 are altair, boneyard, koryu, lumiere, steinhaus; 5..7 the fillers.
    const rows: Row[] = [
      [1, 2, 3, 4, 5, 6, 7, 8],
      [2, 1, 3, 4, 5, 6, 7, 8],
      [8, 2, 3, 4, 5, 1, 7, 8],
      [1, 1, 3, 4, 5, 6, 7, 8],
    ].map((finish, k) => ({
      job: { scenario: "S2", variant: "real", course: "desert-sprint", k },
      races: [race(finish)],
      extra: {
        frames: [
          "horizon",
          "kite",
          "shiden",
          "etoile",
          "falke",
          "fixture-neutral",
          "fixture-neutral",
          "fixture-neutral",
        ],
      },
    }));
    const out = computeMetrics(input(rows, ["S2"]));
    const m2 = metric(out, "m2-manufacturer");
    // Sprint: altair weak, boneyard weak, koryu home, steinhaus weak; lumiere has no cell.
    expect(m2.cells.map((c) => c.id)).toEqual([
      "altair/desert-sprint",
      "boneyard/desert-sprint",
      "koryu/desert-sprint",
      "steinhaus/desert-sprint",
    ]);
    expect(m2.cells[0]?.value).toBeCloseTo(1.5 / 4, 6);
    expect(m2.cells[1]?.value).toBeCloseTo(1.5 / 4, 6);
    expect(m2.cells[0]?.target).toEqual({ min: null, max: 0.15 });
    expect(m2.cells[2]?.target).toEqual({ min: 0.3, max: 0.45 });
    const table = out.diagnostics.find((d) => d.id === "s2-real");
    const fillers = table?.rows.find((r) => String(r[0]).startsWith("none"));
    expect(fillers?.[3]).toBe(25);
    expect(out.diagnostics.some((d) => d.id === "s1-real-frames")).toBe(true);
  });
});

describe("S3 signature ratio", () => {
  const s3 = (k: number, a: number[], b: number[]): Row => ({
    job: { scenario: "S3", pair: "peregrina", course: "desert-ridge", k },
    races: [race(a), race(b)],
  });

  it("is generic wins / signature wins over paired samples, interval from the mean share", () => {
    const rows = [s3(0, [1, 2], [1, 2]), s3(1, [1, 2], [2, 1]), s3(2, [2, 1], [2, 1])];
    const cell = s3CellsOf(input(rows, ["S3"]))[0];
    expect(cell?.value).toBe(1);
    const mi = meanInterval([1, 0.5, 0]);
    expect(cell?.interval.lo).toBeCloseTo(
      (1 - Math.min(1, mi.hi ?? 1)) / Math.min(1, mi.hi ?? 1),
      6,
    );
    expect(cell?.interval.hi).toBeNull();
    expect(cell?.verdict).toBe("inconclusive");
  });

  it("splits a dead heat half and half, and fails a signature that always wins or never wins", () => {
    const tie = s3CellsOf(input([s3(0, [5, 5], [5, 5]), s3(1, [5, 5], [5, 5])], ["S3"]))[0];
    expect(tie?.value).toBe(1);
    const always = s3CellsOf(input([s3(0, [1, 2], [1, 2]), s3(1, [1, 2], [1, 2])], ["S3"]))[0];
    expect(always?.value).toBe(0);
    expect(always?.verdict).toBe("fail");
    const never = s3CellsOf(input([s3(0, [2, 1], [2, 1]), s3(1, [2, 1], [2, 1])], ["S3"]))[0];
    expect(never?.value).toBeNull();
    expect(never?.verdict).toBe("fail");
  });
});

describe("S4 skill gain in metres", () => {
  it("averages (timeOff − timeOn) × L / timeOff over runners, then over seeds", () => {
    const rows: Row[] = [0, 1, 2].map((k) => ({
      job: { scenario: "S4", skill: "last-gasp", course: "desert-sprint", k },
      races: [
        race([1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000]),
        race([1001, 1002, 1003, 1004, 1000, 1000, 1000, 1000 + k]),
      ],
    }));
    const out = computeMetrics(input(rows, ["S4"]));
    const cell = metric(out, "m4-skill").cells[0];
    const L = 1200;
    const seed = (k: number) =>
      [1, 2, 3, 4, 0, 0, 0, k].reduce((a, d) => a + (d * L) / (1000 + d), 0) / 8;
    expect(cell?.id).toBe("last-gasp/desert-sprint");
    expect(cell?.value).toBeCloseTo((seed(0) + seed(1) + seed(2)) / 3, 6);
    expect(cell?.interval.method).toBe("paired-normal");
  });
});

describe("S5 part ablation", () => {
  const s1Rows: Row[] = [0, 1, 2, 3].map((k) => ({
    job: { scenario: "S1", course: "desert-sprint", k },
    races: [
      race([1000, 1010, 990, 1000, 1005, 995, 1000, 1000].map((t, r) => t + ((r + k) % 3) * 7)),
    ],
  }));
  const s5Rows: Row[] = [0, 1, 2].map((k) => ({
    job: { scenario: "S5", part: "altair-battery", course: "desert-sprint", k },
    races: [
      race([998, 1001, 1002, 1003, 1004, 1005, 1006, 1007]),
      race([1000, 999, 1002, 1003, 1004, 1005, 1006, 1007]),
    ],
    extra: { carrierRole: 0 },
  }));

  it("pr: converts the paired time gain to points at this run's S6 σ", () => {
    const inp = input([...s1Rows, ...s5Rows], ["S1", "S5", "S6"]);
    const out = computeMetrics(inp);
    const sigma = metric(out, "m6-dispersion").cells[0]?.value ?? 0;
    const cell = metric(out, "m5-part").cells[0];
    expect(cell?.interval.method).toBe("converted");
    expect(cell?.value).toBeCloseTo(pointsFromTimeGain(2 / 1000, sigma), 4);
    const detail = out.diagnostics.find((d) => d.id === "s5-parts");
    // The carrier goes from second to first: Δwin = +1 on every seed.
    expect(detail?.rows[0]?.[3]).toBe(100);
  });

  it("full: judges the paired Δ win rate directly", () => {
    const out = computeMetrics(input([...s1Rows, ...s5Rows], ["S1", "S5", "S6"], "full"));
    const cell = metric(out, "m5-part").cells[0];
    expect(cell?.value).toBe(1);
    expect(cell?.interval.method).toBe("paired-normal");
    expect(cell?.verdict).toBe("fail");
  });
});

describe("S7 season grade", () => {
  const season = (
    grade: SeasonRecord["grade"],
    place12: number | null,
    place24: number | null = null,
  ): SeasonRecord => ({
    grade,
    score: { stats: 2800, skills: 40, races: 70, total: 2910 },
    goals: [
      { turn: 12, minPlace: 7, place: place12 },
      { turn: 24, minPlace: 6, place: place24 },
      { turn: 36, minPlace: 5, place: null },
    ],
    goalRaces: [place12, place24].filter((p) => p !== null).length,
    raceEngine: "stub",
  });
  it("is the share of seasons graded B or better, with Wilson, plus the goal table", () => {
    const grades: SeasonRecord["grade"][] = ["A", "B", "C", "S", "B"];
    const rows: Row[] = grades.map((g, k) => ({
      job: { scenario: "S7", falconess: "peregrina", k },
      extra: { season: season(g, k < 4 ? 2 : 8) },
    }));
    const out = computeMetrics(input(rows, ["S7"]));
    const m7 = metric(out, "m7-season");
    expect(m7.cells[0]?.value).toBeCloseTo(4 / 5, 6);
    expect(m7.notes.some((n) => n.includes("stub"))).toBe(true);
    const goals = out.diagnostics.find((d) => d.id === "s7-goals");
    expect(goals?.columns.slice(4)).toEqual([
      "reached %",
      "passed %",
      "passed / reached %",
      "won / reached %",
      "flag",
    ]);
    expect(goals?.rows[0]).toEqual(["peregrina", 12, "desert-sprint", 7, 100, 80, 80, 0, ""]);
    // no season reached T24: no rate and no flag
    expect(goals?.rows[1]?.slice(4)).toEqual([0, 0, null, null, ""]);
  });

  it("flags a goal on the seasons that reached it, never on the seasons an earlier goal ended (21.1)", () => {
    // 10 seasons: 4 end at T12 (≤ 7); of the 6 that run T24 (≤ 6), 5 pass it (83 %), 1 fails
    const places: [number, number | null][] = [
      [8, null],
      [8, null],
      [8, null],
      [8, null],
      [1, 1],
      [1, 2],
      [1, 3],
      [1, 1],
      [1, 2],
      [1, 7],
    ];
    const rows: Row[] = places.map(([p12, p24], k) => ({
      job: { scenario: "S7", falconess: "peregrina", k },
      extra: { season: season("C", p12, p24) },
    }));
    const out = computeMetrics(input(rows, ["S7"]));
    const goals = out.diagnostics.find((d) => d.id === "s7-goals");
    // T12: 6 of 10 pass (and win), all 10 ran it: flagged
    expect(goals?.rows[0]?.slice(4)).toEqual([100, 60, 60, 60, "under 80 %"]);
    // T24: 5 of all 10 seasons (50 %), but 5 of the 6 that ran it (83.3 %): not flagged; 2 won
    expect(goals?.rows[1]?.slice(4)).toEqual([60, 50, 83.3, 33.3, ""]);
    // 16 goal races: 8 won, 2 second, 1 third, 1 seventh, 4 eighth; no season won every goal
    const byPlace = out.diagnostics.find((d) => d.id === "s7-places");
    expect(byPlace?.columns).toEqual([
      "falconess",
      "goal races",
      "won %",
      "podium %",
      "1. %",
      "2. %",
      "3. %",
      "4. %",
      "5. %",
      "6. %",
      "7. %",
      "8. %",
      "all won %",
    ]);
    expect(byPlace?.rows[0]).toEqual([
      "peregrina",
      16,
      50,
      68.8,
      50,
      12.5,
      6.3,
      0,
      0,
      0,
      6.3,
      25,
      0,
    ]);
  });
});

describe("S8 Intelligence monotonicity", () => {
  // Five races per job (I 300, 510, 600, 630, 1000); role 0 is the measured runner.
  const won = [999, 1000, 1001, 1002, 1003, 1004, 1005, 1006];
  const lost = [1100, 1000, 1001, 1002, 1003, 1004, 1005, 1006];
  const s8 = (k: number, pattern: boolean[]): Row => ({
    job: { scenario: "S8", style: "hover", course: "desert-ridge", k },
    races: pattern.map((w) => race(w ? won : lost)),
  });

  it("pr: pools adjacent-I paired differences and fails only on a significant decrease", () => {
    const rows = [0, 1, 2, 3, 4, 5].map((k) => s8(k, [true, true, false, false, false]));
    const m8 = metric(computeMetrics(input(rows, ["S8"])), "m8-intelligence");
    expect(m8.cells.map((c) => c.id)).toEqual(["300-510", "510-600", "600-630", "630-1000"]);
    expect(m8.cells[0]?.value).toBe(0);
    expect(m8.cells[1]?.value).toBe(-1);
    expect(m8.cells[1]?.verdict).toBe("fail");
    expect(m8.verdict).toBe("fail");
  });

  it("full: one cell per (style, course), step and win / top-3", () => {
    const rows = [0, 1, 2].map((k) => s8(k, [false, true, true, true, true]));
    const m8 = metric(computeMetrics(input(rows, ["S8"], "full")), "m8-intelligence");
    expect(m8.cells).toHaveLength(8);
    expect(m8.cells[0]?.id).toBe("hover/desert-ridge/300-510/win");
    expect(m8.cells[0]?.value).toBe(1);
    expect(m8.cells[1]?.id).toBe("hover/desert-ridge/300-510/top3");
  });
});
