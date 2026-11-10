/**
 * The eight guardrails' evaluation (ADR-0010, docs/design/barandas-balance.md §4) from the merged
 * job sums, ported from the prototype (`.work/design7/harness/barandas.ts`): same statistics,
 * same fragile rules. Pure: no I/O.
 */
import { type Calendar, calendarOptionalRuns } from "@falconess/schema";
import {
  crosses,
  type GuardrailId,
  type GuardrailStatus,
  guardrailStatus,
  wilson95,
} from "./barandas.js";

export type Json = Record<string, unknown>;

/** The machine-checkable gates (`barandas.json`). */
export type BarandasSpec = {
  measurement: {
    seedBases: string[];
    levels: number[];
    tracks: string[];
    minRacesPerCell: number;
    minSeasonsPerFalconessPerBase: number;
  };
  guardrails: { id: GuardrailId; name: string; gate: Json }[];
};

export type Merged = Record<string, { acc: Record<string, number>; t?: number[][] }>;
export type BenchRun = { detail: string; v3: number; v2: number };
export type B8Check = { id: string; ok: boolean; detail: string };

export type GuardrailResult = {
  id: GuardrailId;
  name: string;
  ok: boolean | null;
  fragile: boolean;
  status: GuardrailStatus;
  key: string;
  notes: string[];
};

export type EvalInput = {
  spec: BarandasSpec;
  merged: Merged;
  bench: BenchRun[];
  /** null = B8 not run (`--skip-b8`). */
  b8: B8Check[] | null;
  calendar: Calendar;
  /** Expected goal races per season on each track (the Falconess's goals, mean of the three). */
  goalsPerSeason: Record<string, number>;
  /** Track length in m, for the distance groups and B7. */
  lengthM: (track: string) => number;
  longest: string;
  quick: boolean;
};

const POS = ["lead", "pack", "stalk", "closer"] as const;
const POS_ES: Record<string, string> = {
  lead: "Punta",
  pack: "Pelotón",
  stalk: "Acecho",
  closer: "Remate",
};
const STATS = ["agility", "stamina", "technique", "courage", "intelligence"] as const;
const STAT_ES: Record<string, string> = {
  agility: "Agilidad",
  stamina: "Resistencia",
  technique: "Técnica",
  courage: "Coraje",
  intelligence: "Inteligencia",
};
const Z = 1.959964;
const r1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1).replace(".", ",") : "—");
const r2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2).replace(".", ",") : "—");
const gnum = (g: Json, k: string): number => {
  const v = g[k];
  if (typeof v !== "number") throw new Error(`barandas.json: gate.${k} is not a number`);
  return v;
};
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  if (s.length === 0) return Number.NaN;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] ?? Number.NaN) : ((s[m - 1] ?? 0) + (s[m] ?? 0)) / 2;
};

/** The distance group of a length (ADR-0011: sprint ≤ 1400 m, mile ≤ 1800, medium ≤ 2400). */
export const distanceGroupEs = (m: number): string =>
  m <= 1400 ? "Sprint" : m <= 1800 ? "Milla" : m <= 2400 ? "Media" : "Larga";

/** B3's weight of each track: goal races plus the optional runs of the calendar. */
export function calendarWeights(
  calendar: Calendar,
  goalsPerSeason: Record<string, number>,
): Record<string, number> {
  const opt = calendarOptionalRuns(calendar);
  return Object.fromEntries(
    calendar.catalogue.map((t) => [t, (goalsPerSeason[t] ?? 0) + (opt[t] ?? 0)]),
  );
}

export function evaluateGuardrails(I: EvalInput): GuardrailResult[] {
  const { spec, merged: M } = I;
  const BASES = spec.measurement.seedBases;
  const LEVELS = spec.measurement.levels;
  const CAT = spec.measurement.tracks;
  const gate = (id: GuardrailId): Json => {
    const g = spec.guardrails.find((x) => x.id === id);
    if (!g) throw new Error(`barandas.json: ${id} missing`);
    return g.gate;
  };
  const name = (id: GuardrailId) => spec.guardrails.find((g) => g.id === id)?.name ?? id;
  const out: GuardrailResult[] = [];
  const push = (r: Omit<GuardrailResult, "status">) =>
    out.push({ ...r, status: guardrailStatus(r) });
  const field = (t: string, s: number, b: string) => M[`field/${t}/${s}/${b}`]?.acc ?? null;
  const nOf = (t: string, s: number, b: string) => field(t, s, b)?.races ?? 0;
  const posPct = (t: string, s: number, p: string, b: string): number | null => {
    const a = field(t, s, b);
    return a?.races ? (100 * (a[`pos.${p}`] ?? 0)) / a.races : null;
  };
  const allField = BASES.every((b) => CAT.every((t) => LEVELS.every((s) => nOf(t, s, b) > 0)));

  {
    // B1
    const g = gate("B1");
    const minPct = gnum(g, "minPct");
    const maxPct = gnum(g, "maxPct");
    let ok = true;
    let fragile = false;
    let mn = 101;
    let mx = -1;
    let mnAt = "";
    let mxAt = "";
    const edge: string[] = [];
    for (const b of BASES)
      for (const t of CAT)
        for (const s of LEVELS)
          for (const p of POS) {
            const v = posPct(t, s, p, b);
            if (v === null) continue;
            const n = nOf(t, s, b);
            const [lo, hi] = wilson95((v / 100) * n, n);
            if (v < minPct || v > maxPct) ok = false;
            else if (crosses(lo, hi, minPct, maxPct)) {
              fragile = true;
              edge.push(`${POS_ES[p]} ${t} ${s} ${b} ${r1(v)} [${r1(lo)}-${r1(hi)}]`);
            }
            if (v < mn) [mn, mnAt] = [v, `${POS_ES[p]} ${t} ${s} ${b}`];
            if (v > mx) [mx, mxAt] = [v, `${POS_ES[p]} ${t} ${s} ${b}`];
          }
    push({
      id: "B1",
      name: name("B1"),
      ok: allField ? ok : null,
      fragile,
      key: `mín ${r1(mn)} % · máx ${r1(mx)} %`,
      notes: [
        `Mínimo: ${mnAt} (${r1(mn)} %). Máximo: ${mxAt} (${r1(mx)} %).`,
        edge.length
          ? `Celdas frágiles: ${edge.join("; ")}.`
          : `Ninguna celda con el intervalo cruzando ${minPct} o ${maxPct}.`,
      ],
    });
  }
  {
    // B2
    const g = gate("B2");
    const gap0 = gnum(g, "homeGapPts");
    const minHomesPerLevel = gnum(g, "minHomesPerLevel");
    let ok = true;
    let fragile = false;
    const lines: string[] = [];
    const weak: string[] = [];
    let minHomes = 99;
    for (const s of LEVELS)
      for (const p of POS) {
        const per: string[] = [];
        for (const b of BASES) {
          const homes: string[] = [];
          let firm = false;
          for (const t of CAT) {
            const vals = POS.map((q) => posPct(t, s, q, b) ?? Number.NaN);
            const best = Math.max(...vals);
            const v = posPct(t, s, p, b) ?? Number.NaN;
            const gap = best - v;
            if (!(gap <= gap0)) continue;
            homes.push(t);
            const n = nOf(t, s, b);
            const se =
              100 * Math.sqrt(((best / 100) * (1 - best / 100) + (v / 100) * (1 - v / 100)) / n);
            if (gap === 0 || gap + Z * se <= gap0) firm = true;
          }
          minHomes = Math.min(minHomes, homes.length);
          if (homes.length < minHomesPerLevel) ok = false;
          else if (!firm) {
            fragile = true;
            weak.push(`${POS_ES[p]} ${s} ${b}`);
          }
          per.push(homes.join("+") || "—");
        }
        lines.push(`${POS_ES[p]} ${s}: ${per.join(" / ")}`);
      }
    push({
      id: "B2",
      name: name("B2"),
      ok: allField ? ok : null,
      fragile,
      key: `casas mín. ${minHomes}${weak.length ? ` · dudosas: ${weak.length}` : ""}`,
      notes: [
        `Casas (${BASES.join(" / ")}): ${lines.join(" · ")}.`,
        weak.length
          ? `Sin casa firme (todas a ≤ ${gap0} dentro del ruido): ${weak.join("; ")}.`
          : "Toda posición tiene una casa firme en cada nivel.",
      ],
    });
  }
  {
    // B3
    const g = gate("B3");
    const minPct = gnum(g, "minPct");
    const maxPct = gnum(g, "maxPct");
    const levels = (g.levels as number[]) ?? LEVELS;
    const W = calendarWeights(I.calendar, I.goalsPerSeason);
    const wt = CAT.reduce((a, t) => a + (W[t] ?? 0), 0);
    let ok = true;
    let fragile = false;
    let worst = { v: 25, at: "" };
    const rows: string[] = [];
    const edge: string[] = [];
    for (const s of levels)
      for (const p of POS) {
        const vb: string[] = [];
        for (const b of BASES) {
          let sum = 0;
          let vv = 0;
          for (const t of CAT) {
            const v = posPct(t, s, p, b) ?? Number.NaN;
            const w = W[t] ?? 0;
            sum += w * v;
            vv += (w * w * v * (100 - v)) / Math.max(1, nOf(t, s, b));
          }
          const v = sum / wt;
          const se = Math.sqrt(vv) / wt;
          if (!(v >= minPct && v <= maxPct)) ok = false;
          else if (crosses(v - Z * se, v + Z * se, minPct, maxPct)) {
            fragile = true;
            edge.push(`${POS_ES[p]} ${s} ${b} ${r2(v)} [${r1(v - Z * se)}-${r1(v + Z * se)}]`);
          }
          if (Math.abs(v - 25) > Math.abs(worst.v - 25))
            worst = { v, at: `${POS_ES[p]} ${s} ${b}` };
          vb.push(r1(v));
        }
        rows.push(`${POS_ES[p]} ${s} ${vb.join(" / ")}`);
      }
    push({
      id: "B3",
      name: name("B3"),
      ok: allField ? ok : null,
      fragile,
      key: `más lejos de 25: ${worst.at} ${r1(worst.v)} %`,
      notes: [
        `Pesos (carreras por temporada): ${CAT.map((t) => `${t} ${r2(W[t] ?? 0)}`).join(" · ")}.`,
        `Reparto (${BASES.join(" / ")}): ${rows.join(" · ")}.`,
        edge.length
          ? `Frágil: ${edge.join("; ")}.`
          : `Ningún intervalo cruza ${minPct} ni ${maxPct}.`,
      ],
    });
  }
  {
    // B4
    const g = gate("B4");
    const FAL = g.falconess as string[];
    const lowMin = gnum(g, "wilsonLowMinPct");
    const maxSpread = gnum(g, "maxSpreadPts");
    const need = I.quick ? 1 : gnum(g, "seasonsPerBase");
    let ok: boolean | null = true;
    let fragile = false;
    const rows: string[] = [];
    const spreads: string[] = [];
    let lowest = { lo: 101, at: "" };
    for (const b of BASES) {
      const xs = FAL.map((f) => {
        const a = M[`m7/${f}/${b}`]?.acc;
        const n = a?.runs ?? 0;
        const k = a?.bOrBetter ?? 0;
        return { f, n, pct: n ? (100 * k) / n : Number.NaN, ci: wilson95(k, n) };
      });
      if (xs.some((x) => x.n < need)) ok = null;
      for (const x of xs) {
        if (ok !== null && x.ci[0] < lowMin) ok = false;
        if (x.ci[0] < lowest.lo) lowest = { lo: x.ci[0], at: `${x.f} ${b}` };
        rows.push(`${x.f} ${b} ${r1(x.pct)} [${r1(x.ci[0])}-${r1(x.ci[1])}] (${x.n})`);
      }
      if (xs.length === 0) continue;
      const hi = xs.reduce((p, q) => (q.pct > p.pct ? q : p));
      const lo = xs.reduce((p, q) => (q.pct < p.pct ? q : p));
      const spread = hi.pct - lo.pct;
      const se = Math.sqrt((hi.pct * (100 - hi.pct)) / hi.n + (lo.pct * (100 - lo.pct)) / lo.n);
      if (ok !== null && !(spread <= maxSpread)) ok = false;
      else if (spread + Z * se > maxSpread) fragile = true;
      spreads.push(`${b} ${r1(spread)} (${hi.f} − ${lo.f}, hasta ${r1(spread + Z * se)})`);
    }
    push({
      id: "B4",
      name: name("B4"),
      ok,
      fragile,
      key: `cota mín. ${r1(lowest.lo)} % (${lowest.at}) · brecha ${spreads.map((s) => s.split(" ")[1]).join(" / ")}`,
      notes: [`Métrica 7: ${rows.join(" · ")}.`, `Mejor − peor: ${spreads.join(" · ")} puntos.`],
    });
  }
  {
    // B5
    let ok: boolean | null = true;
    let fragile = false;
    const rows: string[] = [];
    const edge: string[] = [];
    const target: string[] = [];
    let agiMin = Number.POSITIVE_INFINITY;
    let agiMax = Number.NEGATIVE_INFINITY;
    let margin = Number.POSITIVE_INFINITY;
    for (const t of CAT)
      for (const b of BASES) {
        const a = M[`statValue/${t}/${b}`]?.acc;
        if (!a?.n) {
          ok = null;
          continue;
        }
        const n = a.n;
        const m = Object.fromEntries(STATS.map((s) => [s, (a[`m.${s}`] ?? 0) / n]));
        const others = STATS.filter((s) => s !== "agility").sort(
          (x, y) => (m[y] ?? 0) - (m[x] ?? 0),
        );
        const second = others[0] ?? "stamina";
        const d = (a[`d.${second}`] ?? 0) / n;
        const sd = Math.sqrt(Math.max(0, (a[`dq.${second}`] ?? 0) / n - d * d));
        const lo = d - (Z * sd) / Math.sqrt(n);
        if (ok !== null && !((m.agility ?? 0) > (m[second] ?? 0))) ok = false;
        else if (lo <= 0) {
          fragile = true;
          edge.push(`${t} ${b}`);
        }
        agiMin = Math.min(agiMin, m.agility ?? 0);
        agiMax = Math.max(agiMax, m.agility ?? 0);
        margin = Math.min(margin, d);
        rows.push(
          `${t} ${b}: ${STATS.map((s) => `${(STAT_ES[s] ?? s).slice(0, 3)} ${r1(m[s] ?? 0)}`).join(" ")}`,
        );
        const dist = distanceGroupEs(I.lengthM(t));
        if ((dist === "Media" || dist === "Larga") && second !== "stamina")
          target.push(`${t} ${b} (2.ª ${STAT_ES[second]})`);
      }
    push({
      id: "B5",
      name: name("B5"),
      ok,
      fragile,
      key: `Agilidad +100 = ${r1(agiMin)}-${r1(agiMax)} m · margen mín. ${r1(margin)} m`,
      notes: [
        `Metros de +100 (default ${gnum(gate("B5"), "level")}): ${rows.join(" · ")}.`,
        edge.length
          ? `Frágil: ${edge.join(", ")}.`
          : "La Agilidad gana con el intervalo lejos de 0 en todas.",
        `Objetivo (no puerta), Resistencia 2.ª en Media y Larga: ${target.length ? `no en ${target.join(", ")}` : "cumple"}.`,
      ],
    });
  }
  {
    // B6
    const g = gate("B6");
    const maxRatio = gnum(g, "maxSigmaRatioV2");
    const sig = (rs: string, t: string, b: string) => {
      const m = M[`sigma/${rs}/${t}/${b}`];
      if (!m?.t) return null;
      const L = m.acc.L ?? 0;
      const per = m.t.map((a) => {
        const mean = a.reduce((p, q) => p + q, 0) / a.length;
        const sd = Math.sqrt(a.reduce((p, q) => p + (q - mean) * (q - mean), 0) / a.length);
        return (sd / mean) * L;
      });
      return { s: per.reduce((p, q) => p + q, 0) / per.length, n: m.t[0]?.length ?? 0 };
    };
    let ok: boolean | null = true;
    let fragile = false;
    let worst = { r: 0, at: "" };
    const rows: string[] = [];
    const edge: string[] = [];
    for (const t of CAT) {
      const vb: string[] = [];
      for (const b of BASES) {
        const a = sig("v3", t, b);
        const c = sig("v2", t, b);
        if (!a || !c) {
          ok = null;
          continue;
        }
        const r = a.s / c.s;
        const rel = Math.sqrt(1 / (2 * (a.n - 1)) + 1 / (2 * (c.n - 1)));
        if (ok !== null && !(r <= maxRatio)) ok = false;
        else if (r * Math.exp(Z * rel) > maxRatio) {
          fragile = true;
          edge.push(`${t} ${b} ${r2(r)}`);
        }
        if (r > worst.r) worst = { r, at: `${t} ${b}` };
        vb.push(`${r1(a.s)}/${r1(c.s)} m (${r2(r)})`);
      }
      rows.push(`${t} ${vb.join(" · ")}`);
    }
    push({
      id: "B6",
      name: name("B6"),
      ok,
      fragile,
      key: `razón máx. ${r2(worst.r)} (${worst.at})`,
      notes: [
        `σ v3/v2 en metros (${BASES.join(" · ")}): ${rows.join(" — ")}.`,
        edge.length
          ? `Intervalo cruza ${r2(maxRatio)}: ${edge.join(", ")}.`
          : `Ningún intervalo cruza ${r2(maxRatio)}.`,
      ],
    });
  }
  {
    // B7
    const g = gate("B7");
    const maxMs = gnum(g, "maxP95Ms");
    const res = I.bench.filter((x) => x.detail === g.detail).map((x) => x.v3);
    const full = I.bench.filter((x) => x.detail === "full").map((x) => x.v3);
    const ratio = median(I.bench.map((x) => x.v3 / x.v2));
    const p = median(res);
    const ok = res.length ? p < maxMs : null;
    const fragile = ok === true && Math.max(...res) >= maxMs;
    push({
      id: "B7",
      name: name("B7"),
      ok,
      fragile,
      key: `p95 ${r2(p)} ms (${I.longest}, ${res.length} corridas)`,
      notes: [
        `p95 v3 ${String(g.detail)} en ${I.longest} (${I.lengthM(I.longest)} m): ${res.map(r2).join(" · ")} ms; mediana ${r2(p)}.`,
        `Informe: full ${full.map(r2).join(" · ")} ms (mediana ${r2(median(full))}); razón v3/v2 ${r2(ratio)} (no bloquea).`,
      ],
    });
  }
  {
    // B8
    const b8 = I.b8;
    const bad = (b8 ?? []).filter((c) => !c.ok).map((c) => c.id);
    push({
      id: "B8",
      name: name("B8"),
      ok: b8 === null ? null : bad.length === 0,
      fragile: false,
      key:
        b8 === null
          ? "no se corrió (--skip-b8)"
          : bad.length
            ? `distinto: ${bad.join(", ")}`
            : `0 bytes (${b8.length} chequeos)`,
      notes: (b8 ?? []).map((c) => `${c.ok ? "ok" : "FALLA"} · ${c.detail}`),
    });
  }
  return out;
}
