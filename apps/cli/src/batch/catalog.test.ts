import { loadContent } from "@falconess/content";
import type { Course } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { buildCatalog, staticTriggerPossible } from "./catalog.js";

const content = loadContent();
const catalog = buildCatalog(content);

describe("catalog from v1 content (§25.2)", () => {
  it("orders the courses sprint, ridge, canyon", () => {
    expect(catalog.courses.map((c) => c.id)).toEqual(["sprint", "ridge", "canyon"]);
  });

  it("derives exactly the S2 cells from traits and segments (no biome, ADR-0007)", () => {
    const cells = Object.fromEntries(catalog.s2Cells);
    expect(cells).toEqual({
      "altair/sprint": "weak",
      "altair/ridge": "none",
      "altair/canyon": "home",
      "boneyard/sprint": "weak",
      "boneyard/ridge": "home",
      "boneyard/canyon": "none",
      "koryu/sprint": "none",
      "koryu/ridge": "home",
      "koryu/canyon": "weak",
      "lumiere/sprint": "none",
      "lumiere/ridge": "weak",
      "lumiere/canyon": "none",
      "steinhaus/sprint": "none",
      "steinhaus/ridge": "none",
      "steinhaus/canyon": "none",
    });
  });

  it("draws S2 frames from the non-signature frames of each manufacturer, id order", () => {
    expect(Object.fromEntries(catalog.s2Frames)).toEqual({
      altair: ["horizon", "nimbus"],
      boneyard: ["kite", "mule"],
      koryu: ["hayate", "shiden"],
      lumiere: ["etoile", "sylphe"],
      steinhaus: ["erzherzog", "falke"],
    });
  });

  it("pairs each signature with the generic of the same style and manufacturer (S3)", () => {
    expect(catalog.s3Pairs.map((p) => [p.falconessId, p.signature, p.generic])).toEqual([
      ["caracara", "caracara-signature", "mule"],
      ["cernicala", "cernicala-signature", "nimbus"],
      ["peregrina", "peregrina-signature", "shiden"],
    ]);
  });

  it("has the 31 S4 cells: 8 untriggered actives on every course, 7 segment skills on one", () => {
    expect(catalog.s4Cells).toHaveLength(31);
    const coursesOf = (id: string) =>
      catalog.s4Cells.filter((c) => c.skillId === id).map((c) => c.courseId);
    expect(coursesOf("stoop-strike")).toEqual(["ridge"]);
    expect(coursesOf("canyon-sense")).toEqual(["canyon"]);
    expect(coursesOf("corner-carver")).toEqual(["sprint"]);
    expect(coursesOf("water-skimmer")).toEqual(["canyon"]);
    expect(coursesOf("last-gasp")).toHaveLength(3);
    expect(coursesOf("wind-hover")).toHaveLength(3);
    expect(coursesOf("still-air")).toEqual([]);
  });

  it("lists 8 parts, 12 quirks and 3 Falconess", () => {
    expect(catalog.parts).toHaveLength(8);
    expect(catalog.quirks).toHaveLength(12);
    expect(catalog.falconess).toEqual(["caracara", "cernicala", "peregrina"]);
  });
});

describe("static trigger check (S4)", () => {
  const course: Course = {
    id: "test-course",
    version: 1,
    traits: [],
    entries: 8,
    textKey: "course.test",
    segments: [
      { type: "descent", length: 300, grade: 0.2 },
      { type: "flat", length: 1500 },
    ],
  };
  it("needs the segment on the course and, for a phase trigger, inside that phase", () => {
    expect(staticTriggerPossible(course, "any", "descent")).toBe(true);
    expect(staticTriggerPossible(course, "start", "descent")).toBe(true);
    expect(staticTriggerPossible(course, "final", "descent")).toBe(false);
    expect(staticTriggerPossible(course, "final", "water")).toBe(false);
    expect(staticTriggerPossible(course, "middle", undefined)).toBe(true);
  });
});
