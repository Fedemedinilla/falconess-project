import { BIOMES, courseLength, PART_TYPES, STYLES } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { loadContent } from "./node.js";

const idx = loadContent();

describe("MVP content", () => {
  it("has the MVP roster", () => {
    expect([...idx.falconess.keys()].sort()).toEqual(["caracara", "cernicala", "peregrina"]);
    expect(idx.manufacturers.size).toBe(5);
    expect(idx.frames.size).toBe(13);
    expect(idx.parts.size).toBe(8);
    expect(idx.quirks.size).toBe(12);
    expect(idx.courses.size).toBe(3);
  });

  it("every manufacturer has at least two frames and one part", () => {
    for (const m of idx.manufacturers.values()) {
      const frames = [...idx.frames.values()].filter((f) => f.manufacturer === m.id);
      const parts = [...idx.parts.values()].filter((p) => p.manufacturer === m.id);
      expect(frames.length, m.id).toBeGreaterThanOrEqual(2);
      expect(parts.length, m.id).toBeGreaterThanOrEqual(1);
    }
  });

  it("every style has a generic frame and every part type exists", () => {
    for (const s of STYLES) {
      expect(
        [...idx.frames.values()].some((f) => f.style === s && f.signatureOf === undefined),
        s,
      ).toBe(true);
    }
    for (const t of PART_TYPES)
      expect(
        [...idx.parts.values()].some((p) => p.type === t),
        t,
      ).toBe(true);
  });

  it("each Falconess has a signature frame of her preferred style with identical stats to a generic", () => {
    for (const f of idx.falconess.values()) {
      const sig = [...idx.frames.values()].find((fr) => fr.signatureOf === f.id);
      expect(sig, f.id).toBeDefined();
      if (!sig) continue;
      expect(sig.style).toBe(f.preferredStyle);
      expect(sig.manufacturer).toBe(f.sponsor);
      const generic = [...idx.frames.values()].find(
        (fr) =>
          fr.signatureOf === undefined &&
          fr.manufacturer === sig.manufacturer &&
          fr.style === sig.style,
      );
      expect(generic, `generic for ${sig.id}`).toBeDefined();
      expect(generic?.stats).toEqual(sig.stats);
    }
  });

  it("each Falconess has exactly one unique active skill and aptitudes for every biome", () => {
    for (const f of idx.falconess.values()) {
      expect(f.uniqueSkills.length).toBe(1);
      const sk = idx.getSkill(f.uniqueSkills[0] ?? "");
      expect(sk.kind).toBe("active");
      expect(sk.uniqueTo).toBe(f.id);
      for (const b of BIOMES) expect(f.biomeAptitude[b]).toBeDefined();
      expect(f.styleAptitude[f.preferredStyle]).toBe("A");
    }
  });

  it("season goals reference courses and are ordered by turn", () => {
    for (const f of idx.falconess.values()) {
      const turns = f.seasonGoals.map((g) => g.turn);
      expect([...turns].sort((a, b) => a - b)).toEqual(turns);
      for (const g of f.seasonGoals) expect(idx.courses.has(g.courseId)).toBe(true);
    }
  });

  it("courses have the planned lengths and cover every segment type", () => {
    expect(courseLength(idx.getCourse("desert-sprint"))).toBe(1200);
    expect(courseLength(idx.getCourse("desert-ridge"))).toBe(2000);
    expect(courseLength(idx.getCourse("desert-canyon"))).toBe(3000);
    const types = new Set([...idx.courses.values()].flatMap((c) => c.segments.map((s) => s.type)));
    expect([...types].sort()).toEqual([
      "canyon",
      "climb",
      "curves",
      "descent",
      "flat",
      "jump",
      "water",
    ]);
  });

  it("has at least 15 active skills and one passive per non-Boneyard frame", () => {
    const actives = [...idx.skills.values()].filter((s) => s.kind === "active");
    expect(actives.length).toBeGreaterThanOrEqual(15);
    for (const fr of idx.frames.values()) {
      if (fr.quirkSlots > 0) expect(fr.passive).toBeUndefined();
      else expect(fr.passive, fr.id).toBeDefined();
    }
  });

  it("handwritten story events exist for each Falconess", () => {
    for (const f of idx.falconess.values()) {
      const own = [...idx.events.values()].filter(
        (e) => e.source.kind === "falconess" && e.source.falconess === f.id,
      );
      expect(own.length, f.id).toBeGreaterThanOrEqual(2);
      expect(own.every((e) => e.handwritten)).toBe(true);
    }
  });

  it("economy keeps the anti pay-to-win door: premium disabled, only falconess and frames in pools", () => {
    expect(idx.economy?.premiumEnabled).toBe(false);
    for (const pool of idx.economy?.pools ?? []) {
      for (const id of pool.items) expect(idx.falconess.has(id) || idx.frames.has(id)).toBe(true);
    }
  });
});
