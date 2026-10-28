/**
 * The metrics of BRIEF §12 and the gates and diagnostics of docs/race-engine.md §25.2, computed
 * from the merged job results. Pure and order-deterministic: jobs are visited in id order.
 */
import {
  type BalanceCell,
  type BalanceIntervalMethod,
  type BalanceMetric,
  type BalanceScenario,
  type BalanceTable,
  type BalanceTarget,
  type ContentIndex,
  courseLength,
  GRADES,
  type Grade,
  type Slug,
  STAT_NAMES,
  STYLES,
  type Style,
} from "@falconess/schema";
import { goalFlagged, goalPassRate } from "../goal-rate.js";
import type { Catalog } from "./catalog.js";
import type { JobResult } from "./execute.js";
import { type Job, type Profile, S8_INTELLIGENCE } from "./plan.js";
import { S2_FILLERS } from "./scenarios.js";
import {
  coefficientOfVariation,
  type Interval,
  mean,
  meanInterval,
  pointsFromTimeGain,
  sigmaInterval,
  topShares,
  wilson,
  winShares,
} from "./stats.js";
import { cellVerdict, combineVerdicts } from "./verdict.js";

export type MetricsInput = {
  profile: Profile;
  catalog: Catalog;
  content: ContentIndex;
  scenarios: readonly BalanceScenario[];
  jobs: readonly Job[];
  /** One per job, in the same order. */
  results: readonly JobResult[];
};

export type MetricsOutput = { metrics: BalanceMetric[]; diagnostics: BalanceTable[] };

type Pair<S extends Job["scenario"]> = { job: Extract<Job, { scenario: S }>; result: JobResult };

const BAND = {
  style: { min: 0.15, max: 0.35 },
  home: { min: 0.3, max: 0.45 },
  weak: { min: null, max: 0.15 },
  signature: { min: 0.85, max: 0.9 },
  skill: { min: 0.5, max: 8 },
  part: { min: null, max: 0.03 },
  dispersion: { min: 0.008, max: 0.02 },
  season: { min: 0.6, max: null },
  monotone: { min: 0, max: null },
} as const satisfies Record<string, BalanceTarget>;

/** Values are rounded to 6 decimals so the JSON reads cleanly; rounding is deterministic. */
export function round6(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}

function r6(x: number | null): number | null {
  return x === null || !Number.isFinite(x) ? null : round6(x);
}

/** A table number: percentage with `digits` decimals, or `null`. */
function pct(x: number | null, digits = 1): number | null {
  if (x === null || !Number.isFinite(x)) return null;
  const f = 10 ** digits;
  return Math.round(x * 100 * f) / f;
}

function fixed(x: number | null, digits: number): number | null {
  if (x === null || !Number.isFinite(x)) return null;
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}

function makeCell(
  id: string,
  value: number | null,
  interval: Interval,
  method: BalanceIntervalMethod,
  target: BalanceTarget,
  n: number,
  note?: string,
): BalanceCell {
  const rounded = { lo: r6(interval.lo), hi: r6(interval.hi) };
  const cell: BalanceCell = {
    id,
    value: r6(value),
    interval: { ...rounded, method },
    target: { ...target },
    verdict: cellVerdict(rounded, target),
    n,
  };
  if (note !== undefined) cell.note = note;
  return cell;
}

function makeMetric(
  def: Omit<BalanceMetric, "verdict" | "cells" | "notes">,
  cells: BalanceCell[],
  notes: string[],
): BalanceMetric | undefined {
  if (cells.length === 0) return undefined;
  return { ...def, verdict: combineVerdicts(cells.map((c) => c.verdict)), cells, notes };
}

function table(
  id: string,
  scenario: BalanceScenario,
  title: string,
  columns: string[],
  rows: (string | number | null)[][],
  notes: string[] = [],
): BalanceTable {
  return { id, scenario, title, columns, rows, notes };
}

function pairs<S extends Job["scenario"]>(input: MetricsInput, scenario: S): Pair<S>[] {
  const out: Pair<S>[] = [];
  input.jobs.forEach((job, i) => {
    const result = input.results[i];
    if (job.scenario !== scenario || !result) return;
    if (result.id !== job.id) throw new Error(`result ${result.id} does not match job ${job.id}`);
    out.push({ job: job as Extract<Job, { scenario: S }>, result });
  });
  return out;
}

function groupBy<T>(items: readonly T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const t of items) {
    const k = key(t);
    const list = m.get(k);
    if (list) list.push(t);
    else m.set(k, [t]);
  }
  return m;
}

function lengthM(input: MetricsInput, courseId: Slug): number {
  return courseLength(input.content.getCourse(courseId));
}

function finishOf(r: JobResult, race: number): (number | null)[] {
  return r.races[race]?.finish ?? [];
}

const styleOfRole = (role: number): Style => STYLES[role >> 1] ?? "hover";

// ----- S1 (metric 1) and S6 (metric 6) ----------------------------------------------------------

type S1Course = {
  races: number;
  wins: Record<Style, number>;
  phases: Record<Style, [number, number, number]>;
  finishes: number[][];
};

function s1ByCourse(input: MetricsInput): Map<Slug, S1Course> {
  const out = new Map<Slug, S1Course>();
  for (const { job, result } of pairs(input, "S1")) {
    let c = out.get(job.course);
    if (!c) {
      c = {
        races: 0,
        wins: { dive: 0, hover: 0, glide: 0, ground: 0 },
        phases: { dive: [0, 0, 0], hover: [0, 0, 0], glide: [0, 0, 0], ground: [0, 0, 0] },
        finishes: [],
      };
      out.set(job.course, c);
    }
    const race = result.races[0];
    if (!race) continue;
    c.races += 1;
    const shares = winShares(race.finish);
    race.finish.forEach((t, role) => {
      const style = styleOfRole(role);
      c.wins[style] += shares[role] ?? 0;
      const list = c.finishes[role] ?? [];
      if (t !== null) list.push(t);
      c.finishes[role] = list;
      const ph = race.phaseTicks?.[role];
      if (ph) for (let i = 0; i < 3; i++) c.phases[style][i as 0 | 1 | 2] += ph[i] ?? 0;
    });
  }
  return out;
}

function s1Metric(input: MetricsInput, byCourse: Map<Slug, S1Course>): MetricsOutput {
  const cells: BalanceCell[] = [];
  for (const { biome, courseIds } of input.catalog.biomes) {
    const courses = courseIds.filter((id) => (byCourse.get(id)?.races ?? 0) > 0);
    if (courses.length === 0) continue;
    const n = courses.reduce((s, id) => s + (byCourse.get(id)?.races ?? 0), 0);
    for (const style of STYLES) {
      const rates = courses.map((id) => {
        const c = byCourse.get(id);
        return c ? c.wins[style] / c.races : 0;
      });
      const value = mean(rates) ?? 0;
      cells.push(
        makeCell(
          `${biome}/${style}`,
          value,
          wilson(value * n, n),
          "wilson",
          BAND.style,
          n,
          `mean of ${courses.length} course(s)`,
        ),
      );
    }
  }
  const courseRows = [...byCourse.entries()].map(([id, c]) => [
    id,
    c.races,
    ...STYLES.map((s) => pct(c.wins[s] / c.races)),
  ]);
  const phaseRows = [...byCourse.entries()].flatMap(([id, c]) =>
    STYLES.map((s) => [id, s, ...c.phases[s].map((ticks) => fixed(ticks / (2 * c.races) / 15, 2))]),
  );
  const metric = makeMetric(
    {
      id: "m1-style",
      number: 1,
      scenario: "S1",
      title: "Style win rate per biome, equal stats",
      unit: "rate",
      targetText: "each style 15-35 % in each biome (per-biome mean of the course rates)",
    },
    cells,
    [
      "S1: 8 neutral fixtures (rule none, PW 1.0), 2 per style, stats 600, no skills, lanes shuffled per seed; dead heats for first split the win.",
      "Interval: Wilson at the biome mean with n = the biome's races.",
    ],
  );
  return {
    metrics: metric ? [metric] : [],
    diagnostics: [
      table(
        "s1-courses",
        "S1",
        "S1 style win rate per course (%)",
        ["course", "races", ...STYLES],
        courseRows,
      ),
      table(
        "s1-phases",
        "S1",
        "S1 mean phase splits (s)",
        ["course", "style", "start", "middle", "final"],
        phaseRows,
        ["From ledger.phaseTicks / 15, mean over the style's two runners."],
      ),
    ],
  };
}

/** S6 value per course: mean over the 8 S1 runners of σ/mean of the finish time. */
function s6Sigma(byCourse: Map<Slug, S1Course>): Map<Slug, { value: number; n: number }> {
  const out = new Map<Slug, { value: number; n: number }>();
  for (const [id, c] of byCourse) {
    const cvs = c.finishes
      .map((f) => coefficientOfVariation(f))
      .filter((v): v is number => v !== null);
    const value = mean(cvs);
    if (value !== null) out.set(id, { value, n: c.races });
  }
  return out;
}

function s6Metric(sigma: Map<Slug, { value: number; n: number }>): BalanceMetric | undefined {
  const cells = [...sigma.entries()].map(([id, { value, n }]) =>
    makeCell(id, value, sigmaInterval(value, n), "sigma", BAND.dispersion, n),
  );
  return makeMetric(
    {
      id: "m6-dispersion",
      number: 6,
      scenario: "S6",
      title: "Same-build finish-time dispersion σ/mean",
      unit: "fraction",
      targetText: "0.8-2 % of the mean time on every course",
    },
    cells,
    [
      "S6: no extra races; each of the 8 S1 runners is a fixed build over the S1 seeds; value = mean over the 8 runners. Field interactions add a little variance (R10).",
      "Interval: σ × (1 ± 1.96 / √(2(N − 1))) with N = races per course.",
    ],
  );
}

// ----- S2 (metric 2) ------------------------------------------------------------------------------

type S2Course = { races: number; wins: number[]; fillers: number };

function s2Tally(input: MetricsInput, variant: "real" | "equal-pw"): Map<Slug, S2Course> {
  const out = new Map<Slug, S2Course>();
  const nm = input.catalog.manufacturers.length;
  for (const { job, result } of pairs(input, "S2")) {
    if (job.variant !== variant) continue;
    let c = out.get(job.course);
    if (!c) {
      c = { races: 0, wins: new Array<number>(nm).fill(0), fillers: 0 };
      out.set(job.course, c);
    }
    const shares = winShares(finishOf(result, 0));
    c.races += 1;
    shares.forEach((s, role) => {
      if (role < nm) c.wins[role] = (c.wins[role] ?? 0) + s;
      else c.fillers += s;
    });
  }
  return out;
}

function s2Cells(input: MetricsInput, tally: Map<Slug, S2Course>): BalanceCell[] {
  const cells: BalanceCell[] = [];
  input.catalog.manufacturers.forEach((m, role) => {
    for (const course of input.catalog.courses) {
      const kind = input.catalog.s2Cells.get(`${m}/${course.id}`);
      const c = tally.get(course.id);
      if (!c || (kind !== "home" && kind !== "weak")) continue;
      const wins = c.wins[role] ?? 0;
      cells.push(
        makeCell(
          `${m}/${course.id}`,
          wins / c.races,
          wilson(wins, c.races),
          "wilson",
          kind === "home" ? BAND.home : BAND.weak,
          c.races,
          kind,
        ),
      );
    }
  });
  return cells;
}

function s2Table(
  input: MetricsInput,
  tally: Map<Slug, S2Course>,
  id: string,
  title: string,
  withVerdict: boolean,
): BalanceTable {
  const rows: (string | number | null)[][] = [];
  for (const course of input.catalog.courses) {
    const c = tally.get(course.id);
    if (!c) continue;
    input.catalog.manufacturers.forEach((m, role) => {
      const kind = input.catalog.s2Cells.get(`${m}/${course.id}`) ?? "none";
      const wins = c.wins[role] ?? 0;
      const ci = wilson(wins, c.races);
      const gated = kind === "home" || kind === "weak";
      const verdict = gated
        ? cellVerdict(ci, kind === "home" ? BAND.home : BAND.weak)
        : "reported only";
      rows.push([
        m,
        course.id,
        kind,
        pct(wins / c.races),
        pct(ci.lo),
        pct(ci.hi),
        withVerdict ? verdict : gated ? "gated above" : "reported only",
      ]);
    });
    const ci = wilson(c.fillers, c.races);
    rows.push([
      `none (${S2_FILLERS.length} runners)`,
      course.id,
      "fillers",
      pct(c.fillers / c.races),
      pct(ci.lo),
      pct(ci.hi),
      "reported only",
    ]);
  }
  return table(
    id,
    "S2",
    title,
    ["manufacturer", "course", "cell", "win %", "95 % lo", "95 % hi", "verdict"],
    rows,
  );
}

/** Diagnostics read from the S2 real-frame races: style shares and per-frame dispersion. */
function s2RealFrameDiagnostics(input: MetricsInput): BalanceTable[] {
  const nm = input.catalog.manufacturers.length;
  const styleWins = new Map<Slug, { races: number; wins: Record<Style, number> }>();
  const frameTimes = new Map<string, number[]>();
  for (const { job, result } of pairs(input, "S2")) {
    if (job.variant !== "real" || !result.frames) continue;
    const finish = finishOf(result, 0);
    const shares = winShares(finish);
    let s = styleWins.get(job.course);
    if (!s) {
      s = { races: 0, wins: { dive: 0, hover: 0, glide: 0, ground: 0 } };
      styleWins.set(job.course, s);
    }
    s.races += 1;
    result.frames.forEach((frameId, role) => {
      const style: Style = role < nm ? input.content.getFrame(frameId).style : "hover";
      s.wins[style] += shares[role] ?? 0;
      const t = finish[role];
      if (role < nm && t !== undefined && t !== null) {
        const key = `${frameId}/${job.course}`;
        const list = frameTimes.get(key) ?? [];
        list.push(t);
        frameTimes.set(key, list);
      }
    });
  }
  if (styleWins.size === 0) return [];
  const styleRows = [...styleWins.entries()].map(([id, s]) => [
    id,
    s.races,
    ...STYLES.map((st) => pct(s.wins[st] / s.races)),
  ]);
  const frameRows = [...frameTimes.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([key, times]) => {
      const [frameId, course] = key.split("/");
      const cv = coefficientOfVariation(times);
      const ci = cv === null ? { lo: null, hi: null } : sigmaInterval(cv, times.length);
      return [frameId ?? key, course ?? "", times.length, pct(cv, 2), pct(ci.lo, 2), pct(ci.hi, 2)];
    });
  return [
    table(
      "s1-real-frames",
      "S1",
      "S1 real-frame variant (diagnostic): style win rate in the S2 real-frame field (%)",
      ["course", "races", ...STYLES],
      styleRows,
      [
        "Read from the S2 real-frame races (5 designated real frames + 3 neutral hover fillers): measures frame power more than style (every dive frame is PW 1.4), so it is never gated.",
      ],
    ),
    table(
      "s6-real-frames",
      "S6",
      "S6 real-frame dispersion (diagnostic): σ/mean per designated frame in the S2 real-frame field (%)",
      ["frame", "course", "races", "σ/mean %", "95 % lo", "95 % hi"],
      frameRows,
      ["shiden is the hp-tight reference of R6 (≈ 0.61 % on the sprint at revision 2)."],
    ),
  ];
}

function s2Metric(input: MetricsInput): MetricsOutput {
  const real = s2Tally(input, "real");
  const equal = s2Tally(input, "equal-pw");
  const metric = makeMetric(
    {
      id: "m2-manufacturer",
      number: 2,
      scenario: "S2",
      title: "Manufacturer win rate in home and weak cells",
      unit: "rate",
      targetText: "home 30-45 %, weak ≤ 15 % (one designated entry each: fair share 12.5 %)",
    },
    s2Cells(input, real),
    [
      "S2 real frames: one designated entry per manufacturer (uniform non-signature frame, base 600, letters B, no skills, parts or quirks) + 3 neutral hover fillers; win share of the designated entry, dead heats split.",
      "A course matching both home and weak is neutral and only reported. The equal-PW variant is a sanity table (diagnostics), not gated.",
    ],
  );
  const diagnostics: BalanceTable[] = [];
  if (real.size > 0)
    diagnostics.push(s2Table(input, real, "s2-real", "S2 real frames: every cell", false));
  if (equal.size > 0)
    diagnostics.push(
      s2Table(
        input,
        equal,
        "s2-equal-pw",
        "S2 equal-PW variant (sanity): designated entries on the neutral fixture with their rule, style hover",
        true,
      ),
    );
  diagnostics.push(...s2RealFrameDiagnostics(input));
  return { metrics: metric ? [metric] : [], diagnostics };
}

// ----- S3 (metric 3) ------------------------------------------------------------------------------

/** Stands in for an infinite lower ratio bound (the signature never wins, even at the bound). */
const RATIO_CAP = 1e9;

/** Mean signature share p over paired samples, mapped to the ratio (1 − p) / p. */
function shareToRatio(p: number | null): number | null {
  if (p === null || p <= 0) return null;
  return (1 - p) / p;
}

/** Ratio cells of S3, one per (pair, course), in plan order. */
export function s3CellsOf(input: MetricsInput): (BalanceCell & { pair: Slug; course: Slug })[] {
  const groups = groupBy(pairs(input, "S3"), (p) => `${p.job.pair}/${p.job.course}`);
  const out: (BalanceCell & { pair: Slug; course: Slug })[] = [];
  for (const [id, list] of groups) {
    const first = list[0];
    if (!first) continue;
    let sig = 0;
    let gen = 0;
    const shares = list.map(({ result }) => {
      let s = 0;
      for (let race = 0; race < 2; race++) {
        const w = winShares(finishOf(result, race));
        s += w[0] ?? 0;
        gen += w[1] ?? 0;
      }
      sig += s;
      return s / 2;
    });
    const mi = meanInterval(shares);
    const pLo = mi.lo === null ? 0 : Math.max(0, mi.lo);
    const pHi = mi.hi === null ? 1 : Math.min(1, mi.hi);
    const ratioLo = pHi <= 0 ? RATIO_CAP : (1 - pHi) / pHi;
    const ratioHi = shareToRatio(pLo);
    const value = sig > 0 ? gen / sig : null;
    const cell = makeCell(
      id,
      value,
      { lo: ratioLo, hi: ratioHi },
      "share-ratio",
      BAND.signature,
      list.length,
      `signature wins ${pct(sig / (2 * list.length))} %`,
    );
    out.push({ ...cell, pair: first.job.pair, course: first.job.course });
  }
  return out;
}

function s3Metric(input: MetricsInput): MetricsOutput {
  const cells = s3CellsOf(input).map(({ pair: _p, course: _c, ...cell }) => cell);
  const metric = makeMetric(
    {
      id: "m3-signature",
      number: 3,
      scenario: "S3",
      title: "Generic vs signature, same Falconess (ratio of wins)",
      unit: "ratio",
      targetText: "0.85-0.90 in every (pair, course) cell (the signature wins 52.6-54.1 %)",
    },
    cells,
    [
      "S3: 1v1, both lane orders of one seed form a paired sample; both entries are the same Falconess (base 600, her letters, her unique skill as the only active, no parts or quirks).",
      "Ratio = generic wins / signature wins (a dead heat counts half each). Interval: normal interval of the signature's mean share per sample, mapped through (1 − p) / p.",
      "Home biome read as desert for all three pairs in v1 (D47).",
    ],
  );
  return { metrics: metric ? [metric] : [], diagnostics: [] };
}

// ----- S4 (metric 4) ------------------------------------------------------------------------------

function s4Metric(input: MetricsInput): MetricsOutput {
  const groups = groupBy(pairs(input, "S4"), (p) => `${p.job.skill}/${p.job.course}`);
  const cells: BalanceCell[] = [];
  for (const [id, list] of groups) {
    const first = list[0];
    if (!first) continue;
    const L = lengthM(input, first.job.course);
    const perSeed = list.map(({ result }) => {
      const on = finishOf(result, 0);
      const off = finishOf(result, 1);
      const gains: number[] = [];
      on.forEach((tOn, r) => {
        const tOff = off[r];
        if (tOn === null || tOff === null || tOff === undefined || tOff === 0) return;
        gains.push(((tOff - tOn) * L) / tOff);
      });
      return mean(gains) ?? 0;
    });
    const mi = meanInterval(perSeed);
    cells.push(makeCell(id, mi.mean, mi, "paired-normal", BAND.skill, list.length));
  }
  const metric = makeMetric(
    {
      id: "m4-skill",
      number: 4,
      scenario: "S4",
      title: "Skill leave-one-out: mean gain",
      unit: "metres",
      targetText: "0.5-8 m in every (skill, course) cell where the trigger can occur",
    },
    cells,
    [
      "S4: the S1 field where every runner carries the skill; paired runs per seed, 'off' disables it on all 8 (draws aligned, D49). Gain per runner = (timeOff − timeOn) × L / timeOff, mean over 8 runners, then over seeds.",
      "Position triggers fire for whoever is in range in the 'on' run: the gain is the skill's value in a field where everyone has it.",
    ],
  );
  return { metrics: metric ? [metric] : [], diagnostics: [] };
}

// ----- S5 (metric 5) and the quirk diagnostic ----------------------------------------------------

type CarrierStats = {
  id: string;
  course: Slug;
  n: number;
  dWin: ReturnType<typeof meanInterval>;
  gain: ReturnType<typeof meanInterval>;
  withoutRate: number | null;
};

function carrierStats(
  list: readonly { job: Job & { course: Slug }; result: JobResult }[],
  id: string,
): CarrierStats | undefined {
  const first = list[0];
  if (!first) return undefined;
  const dWins: number[] = [];
  const gains: number[] = [];
  const without: number[] = [];
  for (const { result } of list) {
    const c = result.carrierRole;
    if (c === undefined) continue;
    const withF = finishOf(result, 0);
    const withoutF = finishOf(result, 1);
    const w1 = winShares(withF)[c] ?? 0;
    const w0 = winShares(withoutF)[c] ?? 0;
    dWins.push(w1 - w0);
    without.push(w0);
    const t1 = withF[c];
    const t0 = withoutF[c];
    if (t1 !== null && t1 !== undefined && t0 !== null && t0 !== undefined && t0 > 0)
      gains.push((t0 - t1) / t0);
  }
  return {
    id,
    course: first.job.course,
    n: list.length,
    dWin: meanInterval(dWins),
    gain: meanInterval(gains),
    withoutRate: mean(without),
  };
}

function carrierRow(
  input: MetricsInput,
  s: CarrierStats,
  sigma: number | undefined,
): (string | number | null)[] {
  const L = lengthM(input, s.course);
  const converted =
    sigma !== undefined && sigma > 0 && s.gain.mean !== null
      ? pointsFromTimeGain(s.gain.mean, sigma)
      : null;
  return [
    s.id.split("/")[0] ?? s.id,
    s.course,
    s.n,
    pct(s.dWin.mean),
    pct(s.dWin.lo),
    pct(s.dWin.hi),
    pct(s.withoutRate),
    pct(s.gain.mean, 3),
    pct(s.gain.lo, 3),
    pct(s.gain.hi, 3),
    fixed(s.gain.mean === null ? null : s.gain.mean * L, 2),
    pct(sigma ?? null, 2),
    pct(converted),
  ];
}

const CARRIER_COLUMNS = [
  "item",
  "course",
  "seeds",
  "Δwin pts",
  "95 % lo",
  "95 % hi",
  "without %",
  "time gain %",
  "95 % lo",
  "95 % hi",
  "metres",
  "S6 σ %",
  "converted pts",
];

function s5Metric(
  input: MetricsInput,
  sigma: Map<Slug, { value: number; n: number }>,
): MetricsOutput {
  const groups = groupBy(pairs(input, "S5"), (p) => `${p.job.part}/${p.job.course}`);
  const stats: CarrierStats[] = [];
  for (const [id, list] of groups) {
    const s = carrierStats(list, id);
    if (s) stats.push(s);
  }
  const cells = stats.map((s) => {
    if (input.profile === "full")
      return makeCell(s.id, s.dWin.mean, s.dWin, "paired-normal", BAND.part, s.n);
    const sg = sigma.get(s.course)?.value;
    if (sg === undefined || sg <= 0 || s.gain.mean === null)
      return makeCell(
        s.id,
        null,
        { lo: null, hi: null },
        "converted",
        BAND.part,
        s.n,
        "no S6 σ for this course: cannot convert",
      );
    const at = (g: number | null) => (g === null ? null : pointsFromTimeGain(g, sg));
    return makeCell(
      s.id,
      at(s.gain.mean),
      { lo: at(s.gain.lo), hi: at(s.gain.hi) },
      "converted",
      BAND.part,
      s.n,
      `time gain ${pct(s.gain.mean, 3)} % at σ ${pct(sg, 2)} %`,
    );
  });
  const metric = makeMetric(
    {
      id: "m5-part",
      number: 5,
      scenario: "S5",
      title: "Part ablation: carrier win-rate gain",
      unit: "points",
      targetText:
        input.profile === "full"
          ? "≤ 3 points on every course (paired Δ win rate)"
          : "≤ 3 points on every course (pr: paired time gain converted at S6's σ)",
    },
    cells,
    [
      "S5: the S1 field; the carrier is the runner in lane k mod 8 with fixtureBuild(content, [part], []), paired against the plain fixture.",
      input.profile === "full"
        ? "full: Δ win rate measured directly (normal interval of the paired difference)."
        : "pr: the paired time gain (draws coincide) is converted to points with the equal-field model (one runner δ faster than 7 others, normal times of relative σ = this run's S6 value).",
    ],
  );
  const rows = stats.map((s) => carrierRow(input, s, sigma.get(s.course)?.value));
  return {
    metrics: metric ? [metric] : [],
    diagnostics: [
      table(
        "s5-parts",
        "S5",
        "S5 part ablation detail",
        ["part", ...CARRIER_COLUMNS.slice(1)],
        rows,
        [
          "Δwin pts is measured directly; converted pts uses the time gain and this run's S6 σ (the pr verdict).",
        ],
      ),
    ],
  };
}

function quirkDiagnostic(
  input: MetricsInput,
  sigma: Map<Slug, { value: number; n: number }>,
): BalanceTable[] {
  const groups = groupBy(pairs(input, "quirks"), (p) => `${p.job.quirk}/${p.job.course}`);
  const rows: (string | number | null)[][] = [];
  for (const [id, list] of groups) {
    const s = carrierStats(list, id);
    if (s) rows.push(carrierRow(input, s, sigma.get(s.course)?.value));
  }
  if (rows.length === 0) return [];
  return [
    table(
      "quirks",
      "quirks",
      "Quirk diagnostic (informative): carrier with fixtureBuild(content, [], [quirk])",
      ["quirk", ...CARRIER_COLUMNS.slice(1)],
      rows,
    ),
  ];
}

// ----- S7 (metric 7) ------------------------------------------------------------------------------

const B_INDEX = GRADES.indexOf("B");

function s7Metric(input: MetricsInput): MetricsOutput {
  const groups = groupBy(pairs(input, "S7"), (p) => p.job.falconess);
  const cells: BalanceCell[] = [];
  const gradeRows: (string | number | null)[][] = [];
  const scoreRows: (string | number | null)[][] = [];
  const goalRows: (string | number | null)[][] = [];
  const engines = new Set<string>();
  const order: Grade[] = [...GRADES].reverse();
  for (const [falconess, list] of groups) {
    const seasons = list.map((p) => p.result.season).filter((s) => s !== undefined);
    const n = seasons.length;
    if (n === 0) continue;
    for (const s of seasons) engines.add(s.raceEngine);
    const good = seasons.filter((s) => GRADES.indexOf(s.grade) >= B_INDEX).length;
    cells.push(makeCell(falconess, good / n, wilson(good, n), "wilson", BAND.season, n));
    gradeRows.push([
      falconess,
      n,
      ...order.map((g) => pct(seasons.filter((s) => s.grade === g).length / n)),
    ]);
    const avg = (f: (s: (typeof seasons)[number]) => number) =>
      fixed(seasons.reduce((a, s) => a + f(s), 0) / n, 1);
    scoreRows.push([
      falconess,
      avg((s) => s.score.stats),
      avg((s) => s.score.skills),
      avg((s) => s.score.races),
      avg((s) => s.score.total),
      avg((s) => s.goalRaces),
    ]);
    for (const goal of input.content.getFalconess(falconess).seasonGoals) {
      const rows = seasons.map((s) => s.goals.find((g) => g.turn === goal.turn));
      const reached = rows.filter((g) => g !== undefined && g.place !== null).length;
      const passed = rows.filter(
        (g) => g !== undefined && g.place !== null && g.place <= goal.minPlace,
      ).length;
      goalRows.push([
        falconess,
        goal.turn,
        goal.courseId,
        goal.minPlace,
        pct(reached / n),
        pct(passed / n),
        pct(goalPassRate(passed, reached)),
        goalFlagged(passed, reached) ? "under 80 %" : "",
      ]);
    }
  }
  const notes = [
    "S7: seasons through the season engine with the reference policy 'train the lowest stat' (repairing a frame below 50 % durability) and the reference hangar (shiden, mule, nimbus, falke); metric = share of seasons with gradeFor ≥ B (score ≥ 2900 and no failed goal).",
  ];
  if (engines.has("stub"))
    notes.push(
      "Goal races ran on the race stub: the real engine is not wired into the season yet (ROADMAP D12).",
    );
  const metric = makeMetric(
    {
      id: "m7-season",
      number: 7,
      scenario: "S7",
      title: "Season grade ≥ B with the fixed policy",
      unit: "rate",
      targetText: "≥ 60 % of seasons per Falconess",
    },
    cells,
    notes,
  );
  return {
    metrics: metric ? [metric] : [],
    diagnostics:
      cells.length === 0
        ? []
        : [
            table(
              "s7-grades",
              "S7",
              "S7 grade distribution (%)",
              ["falconess", "seasons", ...order],
              gradeRows,
            ),
            table(
              "s7-score",
              "S7",
              "S7 mean seasonScore split",
              ["falconess", "stat total", "skills", "race bonuses", "total", "goal races"],
              scoreRows,
            ),
            table(
              "s7-goals",
              "S7",
              "S7 goal pass rates (reached % and passed %: of all seasons; passed / reached %: of the seasons that ran the race, flagged under 80 %, not gated)",
              [
                "falconess",
                "turn",
                "course",
                "min place",
                "reached %",
                "passed %",
                "passed / reached %",
                "flag",
              ],
              goalRows,
            ),
          ],
  };
}

// ----- S8 (metric 8) ------------------------------------------------------------------------------

function s8Metric(input: MetricsInput): MetricsOutput {
  const list = pairs(input, "S8");
  const nI = S8_INTELLIGENCE.length;
  const steps = Array.from({ length: nI - 1 }, (_, j) => j);
  const stepId = (j: number) => `${S8_INTELLIGENCE[j]}-${S8_INTELLIGENCE[j + 1]}`;
  const pooledWin = new Array<number>(nI).fill(0);
  const pooledTop = new Array<number>(nI).fill(0);
  const pooledDw: number[][] = steps.map(() => []);
  const cellsData = new Map<
    string,
    { win: number[]; top: number[]; n: number; dw: number[][]; dt: number[][] }
  >();
  for (const { job, result } of list) {
    const key = `${job.style}/${job.course}`;
    let c = cellsData.get(key);
    if (!c) {
      c = {
        win: new Array<number>(nI).fill(0),
        top: new Array<number>(nI).fill(0),
        n: 0,
        dw: steps.map(() => []),
        dt: steps.map(() => []),
      };
      cellsData.set(key, c);
    }
    const w = result.races.map((r) => winShares(r.finish)[0] ?? 0);
    const t = result.races.map((r) => topShares(r.finish, 3)[0] ?? 0);
    c.n += 1;
    for (let i = 0; i < nI; i++) {
      c.win[i] = (c.win[i] ?? 0) + (w[i] ?? 0);
      c.top[i] = (c.top[i] ?? 0) + (t[i] ?? 0);
      pooledWin[i] = (pooledWin[i] ?? 0) + (w[i] ?? 0);
      pooledTop[i] = (pooledTop[i] ?? 0) + (t[i] ?? 0);
    }
    for (const j of steps) {
      const dw = (w[j + 1] ?? 0) - (w[j] ?? 0);
      const dt = (t[j + 1] ?? 0) - (t[j] ?? 0);
      c.dw[j]?.push(dw);
      c.dt[j]?.push(dt);
      pooledDw[j]?.push(dw);
    }
  }
  const total = list.length;
  const cells: BalanceCell[] = [];
  if (input.profile === "full") {
    for (const [key, c] of cellsData)
      for (const j of steps)
        for (const [kind, diffs] of [
          ["win", c.dw[j] ?? []],
          ["top3", c.dt[j] ?? []],
        ] as const) {
          const mi = meanInterval(diffs);
          cells.push(
            makeCell(
              `${key}/${stepId(j)}/${kind}`,
              mi.mean,
              mi,
              "paired-normal",
              BAND.monotone,
              c.n,
            ),
          );
        }
  } else {
    for (const j of steps) {
      const mi = meanInterval(pooledDw[j] ?? []);
      cells.push(makeCell(stepId(j), mi.mean, mi, "paired-normal", BAND.monotone, total));
    }
  }
  const metric = makeMetric(
    {
      id: "m8-intelligence",
      number: 8,
      scenario: "S8",
      title: "Intelligence never lowers the win rate",
      unit: "points",
      targetText:
        input.profile === "full"
          ? "win and top-3 rate non-decreasing in I in every (style, course) cell"
          : "adjacent-I win-rate difference, pooled over styles and courses, not significantly negative",
    },
    cells,
    [
      "S8: 8 neutral fixtures of one style, stats 600; the measured runner (lane k mod 8) at I 300 / 510 / 600 / 630 / 1000 with shared seeds, so adjacent-I differences are paired.",
      "A step fails only when its 95 % interval lies entirely below 0; an interval straddling 0 is inconclusive.",
    ],
  );
  const pooledRows = S8_INTELLIGENCE.map((I, i) => [
    I,
    total,
    pct(total > 0 ? (pooledWin[i] ?? 0) / total : null),
    pct(total > 0 ? (pooledTop[i] ?? 0) / total : null),
  ]);
  const cellRows = [...cellsData.entries()].map(([key, c]) => {
    const [style, course] = key.split("/");
    return [style ?? key, course ?? "", c.n, ...c.win.map((w) => pct(w / c.n))];
  });
  return {
    metrics: metric ? [metric] : [],
    diagnostics:
      total === 0
        ? []
        : [
            table(
              "s8-pooled",
              "S8",
              "S8 measured runner, pooled over styles and courses (%)",
              ["I", "races per I", "win %", "top-3 %"],
              pooledRows,
            ),
            table(
              "s8-cells",
              "S8",
              "S8 measured runner win % per (style, course) and I",
              ["style", "course", "races per I", ...S8_INTELLIGENCE.map((I) => `I ${I}`)],
              cellRows,
            ),
          ],
  };
}

// ----- Stat diagnostic ----------------------------------------------------------------------------

function statDiagnostic(input: MetricsInput): BalanceTable[] {
  const groups = groupBy(pairs(input, "stats"), (p) => `${p.job.stat}/${p.job.course}`);
  const rows: (string | number | null)[][] = [];
  for (const stat of STAT_NAMES)
    for (const course of input.catalog.courses) {
      const list = groups.get(`${stat}/${course.id}`);
      if (!list) continue;
      const L = courseLength(course);
      const metres = list
        .map(({ result }) => {
          const t600 = finishOf(result, 0)[0];
          const t700 = finishOf(result, 1)[0];
          if (t600 === null || t600 === undefined || t700 === null || t700 === undefined)
            return null;
          return ((t600 - t700) * L) / t600;
        })
        .filter((m): m is number => m !== null);
      const mi = meanInterval(metres);
      rows.push([
        stat,
        course.id,
        list.length,
        fixed(mi.mean, 2),
        fixed(mi.lo, 2),
        fixed(mi.hi, 2),
      ]);
    }
  if (rows.length === 0) return [];
  return [
    table(
      "stats",
      "stats",
      "Stat diagnostic (informative): metres per +100 of each stat from 600 (solo neutral hover, paired)",
      ["stat", "course", "seeds", "metres", "95 % lo", "95 % hi"],
      rows,
    ),
  ];
}

// ----- Assembly -----------------------------------------------------------------------------------

export function computeMetrics(input: MetricsInput): MetricsOutput {
  const metrics: BalanceMetric[] = [];
  const diagnostics: BalanceTable[] = [];
  const add = (o: MetricsOutput) => {
    metrics.push(...o.metrics);
    diagnostics.push(...o.diagnostics);
  };
  const has = (s: BalanceScenario) => input.scenarios.includes(s);
  const byCourse = s1ByCourse(input);
  const sigma = s6Sigma(byCourse);
  if (has("S1")) add(s1Metric(input, byCourse));
  if (has("S2")) add(s2Metric(input));
  if (has("S3")) add(s3Metric(input));
  if (has("S4")) add(s4Metric(input));
  if (has("S5")) add(s5Metric(input, sigma));
  if (has("S6")) {
    const m = s6Metric(sigma);
    if (m) metrics.push(m);
  }
  if (has("S7")) add(s7Metric(input));
  if (has("S8")) add(s8Metric(input));
  if (has("quirks")) diagnostics.push(...quirkDiagnostic(input, sigma));
  if (has("stats")) diagnostics.push(...statDiagnostic(input));
  metrics.sort((a, b) => a.number - b.number);
  return { metrics, diagnostics };
}
