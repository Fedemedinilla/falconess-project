import { describe, expect, it } from "vitest";
import { buildContentIndex, ContentError, type RawContent } from "./content-index.js";
import { FrameMods } from "./core.js";
import { Course, courseLength } from "./course.js";
import { GameEvent } from "./event.js";
import { Part } from "./frame.js";
import { GachaPool } from "./gacha.js";
import { RaceModifier } from "./modifiers.js";
import { RunInput } from "./season.js";
import { Skill } from "./skill.js";

describe("primitives and defaults", () => {
  it("FrameMods fills defaults", () => {
    expect(FrameMods.parse({})).toEqual({
      powerToWeight: 0,
      energy: 0,
      dissipation: 0,
      durability: 0,
      skillSlots: 0,
    });
  });

  it("nested prefault runs inner defaults", () => {
    const p = Part.parse({
      id: "x",
      version: 1,
      type: "battery",
      manufacturer: "boneyard",
      textKey: "part.x",
    });
    expect(p.mods.energy).toBe(0);
    expect(p.modifiers).toEqual([]);
  });

  it("rejects unknown keys (strict objects catch typos)", () => {
    const res = Part.safeParse({
      id: "x",
      version: 1,
      type: "battery",
      manufacturer: "b",
      textKey: "part.x",
      modz: {},
    });
    expect(res.success).toBe(false);
  });

  it("rejects non-kebab ids", () => {
    expect(
      Part.safeParse({
        id: "Bad_Id",
        version: 1,
        type: "battery",
        manufacturer: "b",
        textKey: "part.x",
      }).success,
    ).toBe(false);
  });
});

describe("skills and modifiers", () => {
  it("active skill defaults trigger and effect", () => {
    const s = Skill.parse({ id: "s", version: 1, kind: "active", textKey: "skill.s" });
    expect(s.kind).toBe("active");
    if (s.kind === "active") {
      expect(s.trigger.phase).toBe("any");
      expect(s.trigger.once).toBe(true);
      expect(s.effect.speed).toBe(0);
      expect(s.activationBase).toBe(1);
    }
  });

  it("passive skill requires at least one modifier", () => {
    expect(
      Skill.safeParse({ id: "p", version: 1, kind: "passive", textKey: "skill.p", modifiers: [] })
        .success,
    ).toBe(false);
  });

  it("modifier union rejects unknown kinds", () => {
    expect(RaceModifier.safeParse({ kind: "teleport" }).success).toBe(false);
    expect(RaceModifier.parse({ kind: "activation-bonus", bonus: 0.1 })).toEqual({
      kind: "activation-bonus",
      phase: "any",
      bonus: 0.1,
    });
  });
});

describe("courses", () => {
  it("segments carry their own parameters", () => {
    const c = Course.parse({
      id: "c",
      version: 1,
      biome: "desert",
      textKey: "course.c",
      segments: [
        { type: "flat", length: 400 },
        { type: "jump", length: 100, liftRequired: 20 },
      ],
    });
    expect(courseLength(c)).toBe(500);
    expect(c.entries).toBe(8);
    expect(Course.safeParse({ ...c, segments: [{ type: "jump", length: 100 }] }).success).toBe(
      false,
    );
  });
});

describe("events", () => {
  const base = {
    id: "e",
    version: 1,
    source: { kind: "random" },
    textKey: "ev.e",
    options: [{ textKey: "ev.e.a" }],
  };
  it("weighted events have no fixedTurn; story events have both", () => {
    expect(GameEvent.safeParse({ ...base, weight: 10 }).success).toBe(true);
    expect(GameEvent.safeParse({ ...base, weight: null, fixedTurn: 5 }).success).toBe(true);
    expect(GameEvent.safeParse({ ...base, weight: null }).success).toBe(false);
    expect(GameEvent.safeParse({ ...base, weight: 5, fixedTurn: 5 }).success).toBe(false);
  });
  it("chance branches must sum to 1", () => {
    const bad = {
      ...base,
      weight: 1,
      options: [{ textKey: "ev.e.a", chance: [{ p: 0.5 }, { p: 0.3 }] }],
    };
    expect(GameEvent.safeParse(bad).success).toBe(false);
    const ok = {
      ...base,
      weight: 1,
      options: [{ textKey: "ev.e.a", chance: [{ p: 0.7 }, { p: 0.3 }] }],
    };
    expect(GameEvent.safeParse(ok).success).toBe(true);
  });
});

describe("gacha pool (open door)", () => {
  it("rates must sum to 1000", () => {
    const pool = {
      id: "p",
      version: 1,
      kind: "frames",
      rates: { SSR: 10, SR: 100, R: 890 },
      pity: 80,
      items: ["a"],
    };
    expect(GachaPool.safeParse(pool).success).toBe(true);
    expect(GachaPool.safeParse({ ...pool, rates: { SSR: 10, SR: 100, R: 800 } }).success).toBe(
      false,
    );
  });
});

describe("RunInput", () => {
  it("accepts the brief's action names", () => {
    for (const kind of [
      "train:agility",
      "train:stamina",
      "train:technique",
      "train:risk-flight",
      "train:simulator",
      "rest",
    ]) {
      expect(RunInput.safeParse({ kind }).success).toBe(true);
    }
    expect(RunInput.safeParse({ kind: "workshop", ops: [{ op: "repair" }] }).success).toBe(true);
    expect(RunInput.safeParse({ kind: "train:courage" }).success).toBe(false);
  });
});

describe("buildContentIndex", () => {
  const minimal = (): RawContent => ({
    falconess: [
      {
        id: "peregrina",
        version: 1,
        species: "Falco peregrinus",
        baseStats: { agility: 100, stamina: 90, technique: 80, courage: 70, intelligence: 60 },
        growth: { agility: 0.2, stamina: 0, technique: 0.1, courage: 0, intelligence: 0 },
        biomeAptitude: { desert: "A", mountain: "B", coast: "C", urban: "B", tundra: "D" },
        styleAptitude: { dive: "A", hover: "C", glide: "B", ground: "E" },
        preferredStyle: "dive",
        uniqueSkills: [],
        sponsor: "koryu",
        seasonGoals: [{ turn: 12, courseId: "desert-sprint", minPlace: 5 }],
        textKey: "falconess.peregrina",
      },
    ],
    manufacturers: [
      {
        id: "koryu",
        version: 1,
        rule: "pulse",
        palette: { primary: "#c0392b", secondary: "#f1c40f" },
        crew: {
          stats: ["agility", "intelligence"],
          trainingBonus: 0.15,
          signatureEvent: "koryu-data-session-1",
          textKey: "crew.koryu",
        },
        sponsors: ["peregrina"],
        inGacha: true,
        textKey: "mfr.koryu",
      },
    ],
    frames: [],
    parts: [],
    quirks: {
      version: 1,
      quirks: [
        {
          id: "cheap-fuel",
          version: 1,
          mods: { energy: 15, dissipation: -10 },
          textKey: "quirk.cheap-fuel",
        },
      ],
    },
    skills: [],
    events: [
      {
        id: "koryu-data-session-1",
        version: 1,
        source: { kind: "crew", manufacturer: "koryu", minBond: 20 },
        weight: 10,
        textKey: "ev.koryu.data1",
        options: [
          { textKey: "ev.koryu.data1.a", effects: { stats: { intelligence: 12 }, mood: -1 } },
        ],
      },
    ],
    courses: [
      {
        id: "desert-sprint",
        version: 1,
        biome: "desert",
        textKey: "course.desert-sprint",
        segments: [{ type: "flat", length: 1200 }],
      },
    ],
    text: {
      "falconess.peregrina": "Peregrina",
      "mfr.koryu": "Kōryū Racing",
      "crew.koryu": "Equipo Kōryū",
      "quirk.cheap-fuel": "Combustible barato",
      "ev.koryu.data1": "Sesión de datos",
      "ev.koryu.data1.a": "Analizar toda la noche",
      "course.desert-sprint": "Sprint del desierto",
    },
  });

  it("builds an index from valid content", () => {
    const idx = buildContentIndex(minimal());
    expect(idx.getFalconess("peregrina").sponsor).toBe("koryu");
    expect(idx.getQuirk("cheap-fuel").mods.energy).toBe(15);
    expect(idx.t("mfr.koryu")).toBe("Kōryū Racing");
    expect(() => idx.getFrame("nope")).toThrow(/unknown frame/);
  });

  it("aggregates every problem instead of stopping at the first", () => {
    const raw = minimal();
    (raw.falconess[0] as { sponsor: string }).sponsor = "ghost";
    (raw.falconess[0] as { seasonGoals: unknown[] }).seasonGoals = [
      { turn: 12, courseId: "no-course", minPlace: 5 },
    ];
    delete raw.text["mfr.koryu"];
    try {
      buildContentIndex(raw);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ContentError);
      const problems = (e as ContentError).problems;
      expect(problems.some((p) => p.includes('unknown manufacturer "ghost"'))).toBe(true);
      expect(problems.some((p) => p.includes('unknown course "no-course"'))).toBe(true);
      expect(problems.some((p) => p.includes('missing text key "mfr.koryu"'))).toBe(true);
      expect(problems.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("requires sponsor lists to agree in both directions", () => {
    const raw = minimal();
    (raw.manufacturers[0] as { sponsors: string[] }).sponsors = [];
    expect(() => buildContentIndex(raw)).toThrow(/does not list it in sponsors/);
  });

  it("keeps parts and quirks out of gacha pools", () => {
    const raw = minimal();
    raw.economy = {
      version: 1,
      pullCost: 150,
      premiumEnabled: false,
      feathersByGrade: {
        G: 0,
        F: 100,
        E: 200,
        D: 400,
        C: 800,
        B: 1200,
        A: 1500,
        S: 1800,
        SS: 2000,
      },
      rerollBaseScrap: 50,
      pools: [
        {
          id: "frames-std",
          version: 1,
          kind: "frames",
          rates: { SSR: 10, SR: 100, R: 890 },
          pity: 80,
          items: ["cheap-fuel"],
        },
      ],
    };
    expect(() => buildContentIndex(raw)).toThrow(/never in gacha/);
  });
});
