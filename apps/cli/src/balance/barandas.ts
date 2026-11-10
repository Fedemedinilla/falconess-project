/**
 * The eight balance guardrails of ADR-0010 (docs/design/barandas-balance.md): the verdict rules
 * shared by the measurement harness (`.work/design7/harness/barandas.ts`, later `sim:batch` and
 * `sim:season-batch`) and the reader of the ADR's threshold table, so the machine-checkable gates
 * (`barandas.json`) cannot drift from the decision silently. Pure functions, no I/O.
 */

export const GUARDRAIL_IDS = ["B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8"] as const;
export type GuardrailId = (typeof GUARDRAIL_IDS)[number];

/** PASA, FALLA, FRÁGIL (passes, but the interval crosses the threshold) or SIN DATOS. */
export type GuardrailStatus = "PASA" | "FALLA" | "FRÁGIL" | "SIN DATOS";

/** A measured guardrail: `ok` null = it could not be measured. */
export type GuardrailOutcome = { ok: boolean | null; fragile: boolean };

/**
 * A guardrail's status: a fail is a fail whatever its interval; a pass whose interval crosses the
 * threshold is FRÁGIL; a guardrail that could not be measured is SIN DATOS.
 */
export function guardrailStatus(o: GuardrailOutcome): GuardrailStatus {
  if (o.ok === null) return "SIN DATOS";
  if (!o.ok) return "FALLA";
  return o.fragile ? "FRÁGIL" : "PASA";
}

/**
 * ADR-0010 §2: a change goes in only if the eight pass. FRÁGIL passes (it is noted, not blocking);
 * FALLA blocks, and so does SIN DATOS (an unmeasured guardrail cannot be said to pass) or a
 * guardrail missing from the list.
 */
export function guardrailVerdict(statuses: Partial<Record<GuardrailId, GuardrailStatus>>): {
  pass: boolean;
  exitCode: 0 | 1;
  blocking: GuardrailId[];
  fragile: GuardrailId[];
} {
  const blocking = GUARDRAIL_IDS.filter((id) => {
    const s = statuses[id];
    return s === undefined || s === "FALLA" || s === "SIN DATOS";
  });
  const fragile = GUARDRAIL_IDS.filter((id) => statuses[id] === "FRÁGIL");
  const pass = blocking.length === 0;
  return { pass, exitCode: pass ? 0 : 1, blocking, fragile };
}

/** Wilson 95 % interval of k successes in n, in percent. */
export function wilson95(k: number, n: number): [number, number] {
  if (n <= 0) return [0, 100];
  const z = 1.959964;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [100 * Math.max(0, c - h), 100 * Math.min(1, c + h)];
}

/** Whether a passing value's interval [lo, hi] crosses a lower (`min`) or upper (`max`) threshold. */
export function crosses(lo: number, hi: number, min?: number, max?: number): boolean {
  return (min !== undefined && lo < min) || (max !== undefined && hi > max);
}

/**
 * The numbers of each guardrail's threshold column in ADR-0010's table (`| B1 | name | threshold |`).
 * A number glued to a letter (v2, p95) is a name, not a threshold; a decimal comma is read as a
 * point (1,05 → 1.05).
 */
export function adrThresholdNumbers(markdown: string): Partial<Record<GuardrailId, number[]>> {
  const out: Partial<Record<GuardrailId, number[]>> = {};
  for (const line of markdown.split("\n")) {
    const cells = line.split("|").map((c) => c.trim());
    const id = GUARDRAIL_IDS.find((g) => g === cells[1]);
    if (id === undefined || cells.length < 5) continue;
    const text = cells[3] ?? "";
    const nums = [...text.matchAll(/(?<![\p{L}\d.,])\d+(?:,\d+)?(?![\p{L}\d])/gu)].map((m) =>
      Number(m[0].replace(",", ".")),
    );
    out[id] = [...new Set(nums)].sort((a, b) => a - b);
  }
  return out;
}

/** The parts of `barandas.json` whose numbers ADR-0010's table states. */
export type GuardrailSpec = {
  measurement: { levels: number[]; tracks: string[] };
  guardrails: { id: string; gate: Record<string, unknown> }[];
};

const num = (g: Record<string, unknown>, k: string): number => {
  const v = g[k];
  if (typeof v !== "number") throw new Error(`barandas.json: gate.${k} is not a number`);
  return v;
};

/**
 * The numbers each guardrail of `barandas.json` must share with ADR-0010's table: B1 its floor,
 * ceiling, 9 tracks and 4 levels; B2 one home within 2 points; B3 22-28 % at its levels; B4 60 %
 * and 12 points; B5 the +100; B6 1.05; B7 5 ms; B8 0 bytes.
 */
export function specThresholdNumbers(spec: GuardrailSpec): Partial<Record<GuardrailId, number[]>> {
  const gate = (id: GuardrailId) => {
    const g = spec.guardrails.find((x) => x.id === id);
    if (g === undefined) throw new Error(`barandas.json: ${id} is missing`);
    return g.gate;
  };
  const levels = (g: Record<string, unknown>) => {
    const v = g.levels;
    if (!Array.isArray(v) || v.some((x) => typeof x !== "number")) throw new Error("levels");
    return v.map(Number);
  };
  const b1 = gate("B1");
  const b2 = gate("B2");
  const b3 = gate("B3");
  const b4 = gate("B4");
  const sets: Record<GuardrailId, number[]> = {
    B1: [
      num(b1, "minPct"),
      num(b1, "maxPct"),
      spec.measurement.tracks.length,
      spec.measurement.levels.length,
    ],
    B2: [num(b2, "minHomesPerLevel"), num(b2, "homeGapPts")],
    B3: [num(b3, "minPct"), num(b3, "maxPct"), ...levels(b3)],
    B4: [num(b4, "wilsonLowMinPct"), num(b4, "maxSpreadPts")],
    B5: [num(gate("B5"), "bumpPts")],
    B6: [num(gate("B6"), "maxSigmaRatioV2")],
    B7: [num(gate("B7"), "maxP95Ms")],
    B8: [num(gate("B8"), "maxDiffBytes")],
  };
  const out: Partial<Record<GuardrailId, number[]>> = {};
  for (const id of GUARDRAIL_IDS) out[id] = [...new Set(sets[id])].sort((a, b) => a - b);
  return out;
}
