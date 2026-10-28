import { describe, expect, it } from "vitest";
import { interpolate } from "./interpolate";

describe("interpolate", () => {
  it("fills placeholders, numbers in Spanish style", () => {
    expect(interpolate("Semana {turn} de {turns}", { turn: 12, turns: 48 })).toBe(
      "Semana 12 de 48",
    );
    expect(interpolate("{n} puntos", { n: 12000 })).toBe("12.000 puntos");
    expect(interpolate("semilla {seed}", { seed: "381204" })).toBe("semilla 381204");
  });

  it("leaves a placeholder without a value visible", () => {
    expect(interpolate("T{turn}/{turns}", { turn: 3 })).toBe("T3/{turns}");
    expect(interpolate("sin variables {x}")).toBe("sin variables {x}");
  });
});
