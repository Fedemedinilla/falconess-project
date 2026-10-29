import { RULESET_V1, RULESET_V2, trainingRisk } from "@falconess/sim";
import { describe, expect, it } from "vitest";
import { getContent } from "../../content/load";
import { type VigorBand, vigorBand, vigorMarks, vigorScale, vigorTone } from "./vigor";

describe("the vigor bar", () => {
  it("reads v2's bands from the sim's failure curve: 60 safe, 40–59 low, 21–39 high, ≤ 20 injury", () => {
    const scale = vigorScale(RULESET_V2);
    expect(scale).toEqual({
      max: 100,
      bands: { safeFrom: 60, highBelow: 40, injuryAt: 20 },
      forcedAt: undefined,
    });
    const band = (v: number) => vigorBand(scale, v);
    expect([100, 60, 59, 40, 39, 21, 20, 0].map(band)).toEqual([
      "safe",
      "safe",
      "low",
      "low",
      "high",
      "high",
      "injury",
      "injury",
    ]);
    expect(vigorMarks(scale)).toEqual([0.6, 0.4, 0.2]);
    // red only once a failure can be an injury, as on the training cards
    expect([60, 50, 30, 20].map((v) => vigorTone(scale, v))).toEqual([
      "good",
      "warn",
      "warn",
      "bad",
    ]);
  });

  it("agrees with the sim's chances: no failure while safe, an injury possible exactly in its band", () => {
    const scale = vigorScale(RULESET_V2);
    for (let v = 0; v <= 100; v++) {
      const risk = trainingRisk(RULESET_V2, 100 - v, "train:technique");
      const band = vigorBand(scale, v);
      if (band === "safe") expect(risk.failPm, `vigor ${v}`).toBe(0);
      if (band === "high") expect(risk.failPm, `vigor ${v}`).toBeGreaterThan(50);
      expect(risk.injuryPm > 0, `vigor ${v}`).toBe(band === "injury");
    }
  });

  it("names each band by how tired she is, never as safe: the risk flight fails at full vigor", () => {
    const content = getContent();
    const bands: VigorBand[] = ["safe", "low", "high", "injury"];
    const labels = bands.map((b) => content.t(`ui.turn.vigor.band.${b}`));
    expect(labels).toEqual(["Descansada", "Algo cansada", "Cansada", "Agotada"]);
    expect(trainingRisk(RULESET_V2, 0, "train:risk-flight").failPm).toBeGreaterThan(0);
    for (const label of labels) expect(label).not.toMatch(/riesgo|seguro|no falla/i);
  });

  it("keeps v1 as it played: no bands, the forced rest at vigor 20, amber 20 above it", () => {
    const scale = vigorScale(RULESET_V1);
    expect(scale.bands).toBeUndefined();
    expect(scale.forcedAt).toBe(20);
    expect(vigorBand(scale, 50)).toBeUndefined();
    expect(vigorMarks(scale)).toEqual([0.2]);
    expect([100, 41, 40, 21, 20].map((v) => vigorTone(scale, v))).toEqual([
      "neutral",
      "neutral",
      "warn",
      "warn",
      "bad",
    ]);
  });
});
