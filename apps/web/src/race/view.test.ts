import { describe, expect, it } from "vitest";
import { badgeAt, cellRuns } from "./view";

describe("cellRuns", () => {
  it("merges consecutive equal cells into runs that cover every column once", () => {
    const cells = ["normal", "normal", "boost", "boost", "boost", "normal", "finish", "after"];
    const runs = cellRuns(cells);
    expect(runs).toEqual([
      { cell: "normal", from: 0, span: 2 },
      { cell: "boost", from: 2, span: 3 },
      { cell: "normal", from: 5, span: 1 },
      { cell: "finish", from: 6, span: 1 },
      { cell: "after", from: 7, span: 1 },
    ]);
    expect(runs.reduce((n, r) => n + r.span, 0)).toBe(cells.length);
    expect(cellRuns([])).toEqual([]);
  });
});

describe("badgeAt", () => {
  const badges = [
    { tick: 30, text: "Salto" },
    { tick: 40, text: "Picada certera" },
    { tick: 200, text: "Sin hp" },
  ];

  it("shows the last key event for two seconds, then nothing", () => {
    expect(badgeAt(badges, 10)).toBe("");
    expect(badgeAt(badges, 30)).toBe("Salto");
    expect(badgeAt(badges, 45)).toBe("Picada certera");
    expect(badgeAt(badges, 70)).toBe("Picada certera");
    expect(badgeAt(badges, 71)).toBe("");
    expect(badgeAt(badges, 215)).toBe("Sin hp");
  });
});
