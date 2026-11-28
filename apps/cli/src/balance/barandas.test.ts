import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ADR0012_E1,
  ALL_GUARDRAIL_IDS,
  adrThresholdNumbers,
  crosses,
  e1Outcome,
  GUARDRAIL_IDS,
  type GuardrailSpec,
  guardrailStatus,
  guardrailVerdict,
  specThresholdNumbers,
  wilson95,
} from "./barandas.js";

/**
 * ADR-0010: the machine-checkable gates (`barandas.json`, next to this file) keep the ADR's
 * thresholds and the design document's measurement.
 */
const root = new URL("../../../../", import.meta.url);
const adrFile = new URL("docs/decisions/ADR-0010-barandas-de-balance.md", root);
const designFile = new URL("docs/design/barandas-balance.md", root);
const specFile = new URL("./barandas.json", import.meta.url);

describe("barandas: the verdict rules", () => {
  it("a pass whose interval crosses the threshold is FRÁGIL, and FRÁGIL does not block", () => {
    expect(guardrailStatus({ ok: true, fragile: true })).toBe("FRÁGIL");
    expect(guardrailStatus({ ok: true, fragile: false })).toBe("PASA");
    const v = guardrailVerdict({
      B1: "PASA",
      B2: "FRÁGIL",
      B3: "FRÁGIL",
      B4: "PASA",
      B5: "PASA",
      B6: "FRÁGIL",
      B7: "PASA",
      B8: "PASA",
      E1: "FRÁGIL",
    });
    expect(v).toEqual({ pass: true, exitCode: 0, blocking: [], fragile: ["B2", "B3", "B6", "E1"] });
  });

  it("a fail is a fail even when marked fragile; a fail, an unmeasured or a missing guardrail blocks", () => {
    expect(guardrailStatus({ ok: false, fragile: true })).toBe("FALLA");
    expect(guardrailStatus({ ok: null, fragile: false })).toBe("SIN DATOS");
    const all = Object.fromEntries(ALL_GUARDRAIL_IDS.map((id) => [id, "PASA" as const]));
    expect(guardrailVerdict(all).exitCode).toBe(0);
    expect(guardrailVerdict({ ...all, B4: "FALLA" })).toMatchObject({
      pass: false,
      exitCode: 1,
      blocking: ["B4"],
    });
    expect(guardrailVerdict({ ...all, B7: "SIN DATOS" }).blocking).toEqual(["B7"]);
    const { B8: _gone, ...seven } = all;
    expect(guardrailVerdict(seven).blocking).toEqual(["B8"]);
    const { E1: _e1, ...eight } = all;
    expect(guardrailVerdict(eight).blocking).toEqual(["E1"]);
  });

  it("an interval crosses a floor or a ceiling; Wilson brackets the share", () => {
    expect(crosses(14.2, 16.1, 15, 40)).toBe(true);
    expect(crosses(38.5, 40.3, 15, 40)).toBe(true);
    expect(crosses(15.2, 39.9, 15, 40)).toBe(false);
    const [lo, hi] = wilson95(400, 1600);
    expect(lo).toBeLessThan(25);
    expect(hi).toBeGreaterThan(25);
    expect(hi - lo).toBeCloseTo(4.25, 1);
  });

  it("reads the threshold column of an ADR table (names like v2 or p95 are not numbers)", () => {
    const md = [
      "| #   | Baranda | Umbral |",
      "| --- | ------- | ------ |",
      "| B6  | Azar    | σ ≤ 1,05 × la de v2 en cada pista |",
      "| B7  | Rendimiento | `pnpm bench` p95 < 5 ms |",
    ].join("\n");
    expect(adrThresholdNumbers(md)).toEqual({ B6: [1.05], B7: [5] });
  });
});

describe("E1 (ADR-0012): Exigente at the owner's level", () => {
  const gate = { minPct: 55, maxPct: 85, seasonsPerBase: 100 };
  const want = { falconess: ["a", "b"], bases: ["x", "y"] };
  const row = (falconess: string, base: string, completed: number, runs = 100) => ({
    falconess,
    base,
    runs,
    completed,
  });
  const rows = (c: number[]) => [
    row("a", "x", c[0] ?? 0),
    row("a", "y", c[1] ?? 0),
    row("b", "x", c[2] ?? 0),
    row("b", "y", c[3] ?? 0),
  ];

  it("passes on the point value inside 55-85 % in every Falconess and base", () => {
    const o = e1Outcome(rows([70, 66, 72, 68]), gate, want);
    expect(o).toMatchObject({ ok: true, fragile: false });
    expect(o.cells.map((c) => c.pct)).toEqual([70, 66, 72, 68]);
  });

  it("fails when one Falconess in one base is under 55 or over 85 (the limits pass)", () => {
    expect(e1Outcome(rows([70, 54, 72, 68]), gate, want).ok).toBe(false);
    expect(e1Outcome(rows([70, 66, 86, 68]), gate, want).ok).toBe(false);
    expect(e1Outcome(rows([55, 85, 70, 70]), gate, want).ok).toBe(true);
  });

  it("a pass whose Wilson interval crosses 55 or 85 is fragile, not a fail", () => {
    const o = e1Outcome(rows([57, 70, 70, 70]), gate, want);
    expect(o).toMatchObject({ ok: true, fragile: true });
    expect(guardrailStatus(o)).toBe("FRÁGIL");
  });

  it("no verdict (SIN DATOS) with a missing cell or fewer seasons than the gate asks", () => {
    expect(e1Outcome(rows([70, 70, 70, 70]).slice(1), gate, want).ok).toBeNull();
    const short = [...rows([70, 70, 70]).slice(0, 3), row("b", "y", 70, 99)];
    expect(e1Outcome(short, gate, want).ok).toBeNull();
    expect(e1Outcome(rows([10, 70, 70, 70]).slice(0, 3), gate, want).ok).toBeNull();
  });
});

describe("barandas.json keeps ADR-0010's thresholds", () => {
  const adr = readFileSync(adrFile, "utf8");
  type Spec = GuardrailSpec & { measurement: Record<string, unknown> };
  const spec = JSON.parse(readFileSync(specFile, "utf8")) as Spec | null;

  it("lists exactly B1-B8 and E1", () => {
    expect(spec?.guardrails.map((g) => g.id)).toEqual([...ALL_GUARDRAIL_IDS]);
  });

  it("E1 keeps ADR-0012's threshold and the method the owner approved (2026-11-28)", () => {
    const e1 = spec?.guardrails.find((g) => g.id === "E1")?.gate;
    expect(e1).toMatchObject({
      difficulty: "exigente",
      minPct: 55,
      maxPct: 85,
      statScalePm: 1200,
      seasonsPerBase: 1000,
      falconess: ["peregrina", "cernicala", "caracara"],
      parents: {
        peregrina: [
          { stat: "agility", stars: 2 },
          { stat: "stamina", stars: 2 },
        ],
      },
    });
    const adr12 = readFileSync(new URL(ADR0012_E1, root), "utf8").replace(/\s+/g, " ");
    expect(adr12).toContain("entre el 55 y el 85 % de las temporadas pasan todas las metas");
    expect(adr12).toContain("stats × 1,2");
  });

  it("every guardrail's numbers are the ADR table's", () => {
    expect(spec).not.toBeNull();
    if (spec === null) return;
    const fromAdr = adrThresholdNumbers(adr);
    expect(Object.keys(fromAdr).sort()).toEqual([...GUARDRAIL_IDS]);
    expect(specThresholdNumbers(spec)).toEqual(fromAdr);
  });

  it("measures as the design document says (bases, levels, tracks, sizes)", () => {
    const m = spec?.measurement;
    expect(m?.seedBases).toEqual(["v3a", "v3b"]);
    expect(m?.levels).toEqual([300, 450, 600, 750]);
    expect(m?.tracks).toHaveLength(9);
    expect(m?.tracks).toContain("breakaway");
    expect(m?.minRacesPerCell).toBe(1600);
    expect(m?.minSeasonsPerFalconessPerBase).toBe(1000);
    const doc = readFileSync(designFile, "utf8").replace(/\s+/g, " ");
    expect(doc).toContain("300, 450, 600 y 750");
    expect(doc).toContain("al menos 1600 carreras por celda");
    expect(doc).toContain("1000 temporadas por Falconess y base");
    expect(doc).toContain("las 9 del catálogo v3");
  });
});
