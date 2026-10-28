import { describe, expect, it } from "vitest";
import { formatFixed, formatInt, formatPermille, formatSeconds, formatSigned } from "./format";

describe("Spanish number formats", () => {
  it("groups from five digits and writes a typographic minus", () => {
    expect(formatInt(7)).toBe("7");
    expect(formatInt(1200)).toBe("1200");
    expect(formatInt(12345)).toBe("12.345");
    expect(formatInt(-3)).toBe("−3");
  });

  it("rounds integers half away from zero before writing a decimal comma", () => {
    expect(formatFixed(12345, 1000, 2)).toBe("12,35");
    expect(formatFixed(12344, 1000, 2)).toBe("12,34");
    expect(formatFixed(-1250, 1000, 1)).toBe("−1,3");
    expect(formatFixed(5, 1000, 2)).toBe("0,01");
    expect(formatFixed(4, 1000, 2)).toBe("0,00");
    expect(formatFixed(1234567, 1, 0)).toBe("1.234.567");
    expect(() => formatFixed(1, 0, 0)).toThrow();
  });

  it("signs changes, prints percentages and seconds", () => {
    expect(formatSigned(12)).toBe("+12");
    expect(formatSigned(-4)).toBe("−4");
    expect(formatSigned(0)).toBe("0");
    expect(formatPermille(125, 1)).toBe("12,5 %");
    expect(formatPermille(50)).toBe("5 %");
    expect(formatSeconds(183, 1)).toBe("12,2");
  });
});
