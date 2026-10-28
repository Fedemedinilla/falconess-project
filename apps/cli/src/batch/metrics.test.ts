import { loadContent } from "@falconess/content";
import type { BalanceMetric, BalanceScenario } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { buildCatalog } from "./catalog.js";
import type { JobResult, RaceRecord, SeasonRecord } from "./execute.js";
import { computeMetrics, type MetricsInput, S3_PR_OUTSIDE_NOTE, s3CellsOf } from "./metrics.js";
import type { Job, Profile } from "./plan.js";
import { meanInterval, pairedScoreInterval, pointsFromTimeGain, wilson } from "./stats.js";
import { cellVerdict } from "./verdict.js";

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

  /** Share of the signature → ratio (1 − p) / p, the band's unit. */
  const ratioOf = (share: number) => (1 - share) / share;
  /** `sweeps` samples where the signature wins both races, the rest one race each. */
  const sweepRows = (n: number, sweeps: number): Row[] =>
    Array.from({ length: n }, (_, k) =>
      k < sweeps ? s3(k, [1, 2], [1, 2]) : s3(k, [1, 2], [2, 1]),
    );

  it("is generic wins / signature wins over paired samples, score interval of the sweep rates", () => {
    // A signature sweep, a split and a generic sweep: one discordant sample on each side.
    const rows = [s3(0, [1, 2], [1, 2]), s3(1, [1, 2], [2, 1]), s3(2, [2, 1], [2, 1])];
    const cell = s3CellsOf(input(rows, ["S3"], "full"))[0];
    expect(cell?.value).toBe(1);
    const ci = pairedScoreInterval(1, 1, 3);
    expect(cell?.interval.lo).toBeCloseTo(ratioOf(0.5 + (ci.hi ?? 0) / 2), 6);
    expect(cell?.interval.hi).toBeCloseTo(ratioOf(0.5 + (ci.lo ?? 0) / 2), 6);
    expect(cell?.interval.method).toBe("share-ratio");
    expect(cell?.verdict).toBe("inconclusive");
    expect(cell?.note).toBe("signature wins 50 % (sweeps: signature 1, generic 1, of 3)");
  });

  it("splits a dead heat half and half, and fails (full) a signature that always or never wins", () => {
    const tie = s3CellsOf(input([s3(0, [5, 5], [5, 5]), s3(1, [5, 5], [5, 5])], ["S3"]))[0];
    expect(tie?.value).toBe(1);
    const half = s3CellsOf(input([s3(0, [1, 2], [5, 5]), s3(1, [1, 2], [2, 1])], ["S3"]))[0];
    expect(half?.note).toBe("signature wins 62.5 % (sweeps: signature 0.5, generic 0, of 2)");
    // Two sweeps out of two prove nothing (the old interval had zero width there and failed it).
    const twice = s3CellsOf(input(sweepRows(2, 2), ["S3"], "full"))[0];
    expect(twice?.value).toBe(0);
    expect(twice?.verdict).toBe("inconclusive");
    const always = s3CellsOf(input(sweepRows(20, 20), ["S3"], "full"))[0];
    expect(always?.value).toBe(0);
    expect(always?.verdict).toBe("fail");
    const neverRows = Array.from({ length: 20 }, (_, k) => s3(k, [2, 1], [2, 1]));
    const never = s3CellsOf(input(neverRows, ["S3"], "full"))[0];
    expect(never?.value).toBeNull();
    expect(never?.interval.hi).toBeNull();
    expect(never?.verdict).toBe("fail");
  });

  it("no longer false-fails 4 sweeps in 150 samples (alt1 cernicala/desert-ridge, ADR-0005)", () => {
    // ADR-0005 «Métricas 3 y 4», propuesta 1: alt1 read 51.3 % (4 sweeps, 146 splits) while
    // 8000 samples read 52.9 %, inside the band. The old interval, the normal interval of the
    // mean share, used the sample's own variance: 4 sweeps gave ±1.3 points and a fail.
    const rows = sweepRows(150, 4);
    const shares = [...new Array<number>(4).fill(1), ...new Array<number>(146).fill(0.5)];
    const old = meanInterval(shares);
    const oldRatioLo = ratioOf(old.hi ?? 1);
    expect(oldRatioLo).toBeGreaterThan(0.9);
    expect(cellVerdict({ lo: oldRatioLo, hi: ratioOf(old.lo ?? 0) }, { min: 0.85, max: 0.9 })).toBe(
      "fail",
    );
    for (const profile of ["pr", "full"] as const) {
      const cell = s3CellsOf(input(rows, ["S3"], profile))[0];
      expect(cell?.value).toBeCloseTo(146 / 154, 6);
      // Score interval: share 50.05-53.33 % (ratio 0.875-0.998), straddling the band's 0.90 edge.
      expect(cell?.interval.lo).toBeCloseTo(0.8751, 3);
      expect(cell?.interval.hi).toBeCloseTo(0.998, 3);
      expect(cell?.verdict).toBe("inconclusive");
      expect(cell?.note).not.toContain(S3_PR_OUTSIDE_NOTE);
    }
  });

  it("never fails in pr: an inert signature (150 splits) reads inconclusive with a note, fails in full", () => {
    const rows = sweepRows(150, 0);
    const full = computeMetrics(input(rows, ["S3"], "full"));
    expect(metric(full, "m3-signature").verdict).toBe("fail");
    const fullCell = s3CellsOf(input(rows, ["S3"], "full"))[0];
    // With no sweep the interval is ±z² / (n + z²) of the share's distance from even, not a point.
    const w = (1.96 * 1.96) / (150 + 1.96 * 1.96);
    expect(fullCell?.interval.lo).toBeCloseTo(ratioOf(0.5 + w / 2), 6);
    expect(fullCell?.interval.hi).toBeCloseTo(ratioOf(0.5 - w / 2), 6);
    expect(fullCell?.verdict).toBe("fail");
    expect(fullCell?.note).not.toContain(S3_PR_OUTSIDE_NOTE);

    const pr = computeMetrics(input(rows, ["S3"], "pr"));
    const m3 = metric(pr, "m3-signature");
    expect(m3.verdict).toBe("inconclusive");
    expect(m3.cells[0]?.interval).toEqual(fullCell?.interval);
    expect(m3.cells[0]?.verdict).toBe("inconclusive");
    expect(m3.cells[0]?.note).toContain(S3_PR_OUTSIDE_NOTE);
    expect(m3.notes.some((n) => n.startsWith("pr: metric 3 is pass or inconclusive"))).toBe(true);
    expect(metric(full, "m3-signature").notes.some((n) => n.startsWith("pr:"))).toBe(false);
    // An overpowered signature (share 60 %) is no pr fail either.
    expect(s3CellsOf(input(sweepRows(150, 30), ["S3"], "pr"))[0]?.verdict).toBe("inconclusive");
    expect(s3CellsOf(input(sweepRows(150, 30), ["S3"], "full"))[0]?.verdict).toBe("fail");
  });

  it("passes in pr only when the interval fits the band (a pr run large enough to resolve it)", () => {
    // 3000 samples at 7 % sweeps: share 53.5 %, interval ≈ ±0.45 points, inside 52.6-54.1 %.
    const cell = s3CellsOf(input(sweepRows(3000, 210), ["S3"], "pr"))[0];
    expect(cell?.verdict).toBe("pass");
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
