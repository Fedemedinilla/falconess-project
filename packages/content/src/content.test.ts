import { courseLength, DEFAULT_POSITION, PART_TYPES, STYLES } from "@falconess/schema";
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

  it("each Falconess has a signature frame whose default is her preferred position, with identical stats to a generic", () => {
    for (const f of idx.falconess.values()) {
      const sig = [...idx.frames.values()].find((fr) => fr.signatureOf === f.id);
      expect(sig, f.id).toBeDefined();
      if (!sig) continue;
      expect(DEFAULT_POSITION[sig.style]).toBe(f.preferredPosition);
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

  it("each Falconess has exactly one unique active skill and an A in her preferred position", () => {
    for (const f of idx.falconess.values()) {
      expect(f.uniqueSkills.length).toBe(1);
      const sk = idx.getSkill(f.uniqueSkills[0] ?? "");
      expect(sk.kind).toBe("active");
      expect(sk.uniqueTo).toBe(f.id);
      expect(f.positionAptitude[f.preferredPosition]).toBe("A");
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
    expect(courseLength(idx.getCourse("sprint"))).toBe(1200);
    expect(courseLength(idx.getCourse("ridge"))).toBe(2000);
    expect(courseLength(idx.getCourse("canyon"))).toBe(3000);
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
      // her scenes with a choice; the luck events that name her (auto, ADR-0006) are not scenes
      const own = [...idx.events.values()].filter(
        (e) => e.source.kind === "falconess" && e.source.falconess === f.id && !e.auto,
      );
      expect(own.length, f.id).toBeGreaterThanOrEqual(2);
      expect(own.every((e) => e.handwritten)).toBe(true);
    }
  });

  describe("luck events (auto, ruleset v2; ADR-0006 «Eventos al azar: balance»)", () => {
    const luck = [...idx.events.values()].filter((e) => e.auto);
    const goalTurns = new Set(
      [...idx.falconess.values()].flatMap((f) => f.seasonGoals.map((g) => g.turn)),
    );
    /** An effect block the owner allows: bad lowers mood by 1 or vigor by 10-20; good gives one or two stats +5-10, vigor 10-20 or mood +1. */
    const kind = (fx: (typeof luck)[number]["options"][number]["effects"]): string => {
      const stats = Object.values(fx.stats);
      const only = (k: string) =>
        (["stats", "mood", "fatigue"] as const).every((key) =>
          key === k ? true : key === "stats" ? stats.length === 0 : fx[key] === 0,
        );
      const rest =
        Object.keys(fx.bond).length === 0 &&
        fx.skillPoints === 0 &&
        fx.scrap === 0 &&
        fx.feathers === 0 &&
        fx.durability === 0 &&
        fx.injuryTurns === 0 &&
        fx.learnSkill === undefined;
      if (!rest) return "other";
      if (stats.length === 0 && fx.mood === 0 && fx.fatigue === 0) return "none";
      if (only("stats") && stats.length <= 2 && stats.every((v) => v >= 5 && v <= 10))
        return "good";
      if (only("mood") && fx.mood === 1) return "good";
      if (only("mood") && fx.mood === -1) return "bad";
      if (only("fatigue") && fx.fatigue <= -10 && fx.fatigue >= -20) return "good";
      if (only("fatigue") && fx.fatigue >= 10 && fx.fatigue <= 20) return "bad";
      return "other";
    };

    it("are 12-16, only in v2 (and the v3 draft, which keeps v2's season), one option, and good or bad within the owner's ranges", () => {
      expect(luck.length).toBeGreaterThanOrEqual(12);
      expect(luck.length).toBeLessThanOrEqual(16);
      let good = 0;
      let bad = 0;
      for (const e of luck) {
        expect(e.rulesets, e.id).toEqual(["v2", "v3"]);
        expect(e.weight, e.id).not.toBeNull();
        expect(e.options, e.id).toHaveLength(1);
        const opt = e.options[0];
        if (!opt) continue;
        const outcomes = opt.chance
          ? opt.chance.map((b) => {
              expect(kind(opt.effects), e.id).toBe("none");
              expect(b.textKey, e.id).toBeDefined();
              return kind(b.effects);
            })
          : [kind(opt.effects)];
        for (const o of outcomes) expect(["good", "bad"], `${e.id}: ${o}`).toContain(o);
        if (outcomes.every((o) => o === "good")) good++;
        if (outcomes.every((o) => o === "bad")) bad++;
      }
      // roughly half and half; the rest are a coin between a good and a bad outcome
      expect(Math.abs(good - bad)).toBeLessThanOrEqual(2);
    });

    it("stay between goal races, so a race week keeps its race-result event", () => {
      for (const e of luck) {
        const [lo, hi] = e.conditions.turnRange;
        for (let t = lo; t <= hi; t++) expect(goalTurns.has(t), `${e.id} on turn ${t}`).toBe(false);
      }
    });
  });

  it("economy keeps the anti pay-to-win door: premium disabled, only falconess and frames in pools", () => {
    expect(idx.economy?.premiumEnabled).toBe(false);
    for (const pool of idx.economy?.pools ?? []) {
      for (const id of pool.items) expect(idx.falconess.has(id) || idx.frames.has(id)).toBe(true);
    }
  });
});
