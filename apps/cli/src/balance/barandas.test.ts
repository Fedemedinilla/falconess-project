import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  adrThresholdNumbers,
  crosses,
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
    });
    expect(v).toEqual({ pass: true, exitCode: 0, blocking: [], fragile: ["B2", "B3", "B6"] });
  });

  it("a fail is a fail even when marked fragile; a fail, an unmeasured or a missing guardrail blocks", () => {
    expect(guardrailStatus({ ok: false, fragile: true })).toBe("FALLA");
    expect(guardrailStatus({ ok: null, fragile: false })).toBe("SIN DATOS");
    const all = Object.fromEntries(GUARDRAIL_IDS.map((id) => [id, "PASA" as const]));
    expect(guardrailVerdict(all).exitCode).toBe(0);
    expect(guardrailVerdict({ ...all, B4: "FALLA" })).toMatchObject({
      pass: false,
      exitCode: 1,
      blocking: ["B4"],
    });
    expect(guardrailVerdict({ ...all, B7: "SIN DATOS" }).blocking).toEqual(["B7"]);
    const { B8: _gone, ...seven } = all;
    expect(guardrailVerdict(seven).blocking).toEqual(["B8"]);
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

describe("barandas.json keeps ADR-0010's thresholds", () => {
  const adr = readFileSync(adrFile, "utf8");
  type Spec = GuardrailSpec & { measurement: Record<string, unknown> };
  const spec = JSON.parse(readFileSync(specFile, "utf8")) as Spec | null;

  it("lists exactly B1-B8", () => {
    expect(spec?.guardrails.map((g) => g.id)).toEqual([...GUARDRAIL_IDS]);
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
