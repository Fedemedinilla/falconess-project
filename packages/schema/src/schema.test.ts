import { describe, expect, it } from "vitest";
import { buildContentIndex, ContentError, type RawContent } from "./content-index.js";
import { DEFAULT_POSITION, FrameMods, POSITIONS, Position, STYLES } from "./core.js";
import { Course, courseLength } from "./course.js";
import { GameEvent } from "./event.js";
import { Falconess } from "./falconess.js";
import { Part } from "./frame.js";
import { GachaPool } from "./gacha.js";
import { RaceModifier } from "./modifiers.js";
import { RaceResultEntry, RunInput, TurnLogEntry } from "./season.js";
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
  it("a course has no biome and a canyon no wind (ADR-0007)", () => {
    const c = {
      id: "c",
      version: 1,
      textKey: "course.c",
      segments: [{ type: "flat", length: 400 }],
    };
    expect(Course.safeParse({ ...c, biome: "desert" }).success).toBe(false);
    const canyon = { type: "canyon", length: 400 };
    expect(Course.safeParse({ ...c, segments: [canyon] }).success).toBe(true);
    expect(Course.safeParse({ ...c, segments: [{ ...canyon, wind: 0.1 }] }).success).toBe(false);
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
  it("auto events have exactly one option; chance branches allowed (ADR-0006)", () => {
    const branches = [
      { p: 0.5, textKey: "ev.e.good", effects: { mood: 1 } },
      { p: 0.5, textKey: "ev.e.bad", effects: { fatigue: 10 } },
    ];
    const auto = {
      ...base,
      weight: 3,
      auto: true,
      options: [{ textKey: "ev.e.a", chance: branches }],
    };
    expect(GameEvent.safeParse(auto).success).toBe(true);
    const two = { ...auto, options: [{ textKey: "ev.e.a" }, { textKey: "ev.e.b" }] };
    expect(GameEvent.safeParse(two).success).toBe(false);
    expect(GameEvent.safeParse({ ...two, auto: false }).success).toBe(true);
    expect(GameEvent.parse(auto).options[0]?.chance?.[0]?.textKey).toBe("ev.e.good");
  });
  it("rulesets limits an event to ruleset versions; absent means every ruleset", () => {
    expect(GameEvent.safeParse({ ...base, weight: 1, rulesets: ["v2"] }).success).toBe(true);
    expect(GameEvent.safeParse({ ...base, weight: 1, rulesets: [] }).success).toBe(false);
    expect(GameEvent.safeParse({ ...base, weight: 1, rulesets: ["2"] }).success).toBe(false);
    expect(GameEvent.parse({ ...base, weight: 1 }).rulesets).toBeUndefined();
  });
});

describe("season log entry (ADR-0006)", () => {
  it("keeps parsing the entries v1 wrote", () => {
    expect(TurnLogEntry.parse({ turn: 3, notes: ["log.rest"] })).toEqual({
      turn: 3,
      notes: ["log.rest"],
      deltas: {},
    });
  });
  it("carries mood and fatigue deltas and the event resolved that week", () => {
    const e = {
      turn: 5,
      input: { kind: "rest" },
      notes: ["log.rest", "log.mood.rest"],
      deltas: {},
      moodDelta: 1,
      fatigueDelta: -50,
      event: { id: "lucky-wind", option: 0, branch: 1, auto: true },
    };
    expect(TurnLogEntry.parse(e)).toEqual(e);
    expect(TurnLogEntry.safeParse({ ...e, event: { id: "x", option: 0, extra: 1 } }).success).toBe(
      false,
    );
    expect(TurnLogEntry.safeParse({ ...e, moodDelta: 0.5 }).success).toBe(false);
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

  it("an action input may carry a race position; start and event:choose may not (ADR-0008)", () => {
    for (const kind of ["train:agility", "rest", "outing"])
      expect(RunInput.safeParse({ kind, position: "stalk" }).success, kind).toBe(true);
    expect(
      RunInput.safeParse({ kind: "workshop", ops: [{ op: "repair" }], position: "lead" }).success,
    ).toBe(true);
    expect(RunInput.safeParse({ kind: "rest", position: "front" }).success).toBe(false);
    expect(RunInput.safeParse({ kind: "event:choose", option: 0, position: "lead" }).success).toBe(
      false,
    );
  });
});

describe("race positions (ADR-0008)", () => {
  it("are four, front to back, and each wing style defaults to a different one", () => {
    expect(POSITIONS).toEqual(["lead", "pack", "stalk", "closer"]);
    expect(Position.safeParse("dive").success).toBe(false);
    expect(STYLES.map((s) => DEFAULT_POSITION[s])).toEqual(["closer", "stalk", "lead", "pack"]);
    expect(new Set(Object.values(DEFAULT_POSITION))).toEqual(new Set(POSITIONS));
    // every default race (and the invariance proof) reads it: frozen like the rulesets
    expect(Object.isFrozen(DEFAULT_POSITION)).toBe(true);
  });

  it("a Falconess has one letter per position and a preferred position; the style fields are gone", () => {
    const f = {
      id: "peregrina",
      version: 1,
      species: "Falco peregrinus",
      baseStats: { agility: 100, stamina: 90, technique: 80, courage: 70, intelligence: 60 },
      growth: { agility: 0.2, stamina: 0, technique: 0.1, courage: 0, intelligence: 0 },
      positionAptitude: { lead: "B", pack: "E", stalk: "C", closer: "A" },
      preferredPosition: "closer",
      uniqueSkills: [],
      sponsor: "koryu",
      seasonGoals: [{ turn: 12, courseId: "sprint", minPlace: 5 }],
      textKey: "falconess.peregrina",
    };
    expect(Falconess.parse(f)).toEqual(f);
    const { closer: _c, ...three } = f.positionAptitude;
    expect(Falconess.safeParse({ ...f, positionAptitude: three }).success).toBe(false);
    expect(Falconess.safeParse({ ...f, preferredPosition: "dive" }).success).toBe(false);
    const { positionAptitude: _p, preferredPosition: _q, ...rest } = f;
    expect(
      Falconess.safeParse({
        ...rest,
        styleAptitude: { dive: "A", hover: "C", glide: "B", ground: "E" },
        preferredStyle: "dive",
      }).success,
    ).toBe(false);
  });

  it("a season race result records the position she ran", () => {
    const r = {
      courseId: "ridge",
      turn: 12,
      place: 2,
      fieldSize: 8,
      timeTicks: 1300,
      frameId: "shiden",
      position: "closer",
      engine: "v1",
    };
    expect(RaceResultEntry.parse(r)).toEqual(r);
    const { position: _p, ...without } = r;
    expect(RaceResultEntry.safeParse(without).success).toBe(false);
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
        positionAptitude: { lead: "B", pack: "E", stalk: "C", closer: "A" },
        preferredPosition: "closer",
        uniqueSkills: [],
        sponsor: "koryu",
        seasonGoals: [{ turn: 12, courseId: "sprint", minPlace: 5 }],
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
        id: "sprint",
        version: 1,
        textKey: "course.sprint",
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
      "course.sprint": "Sprint",
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

  it("checks the text key of every chance branch that has one (ADR-0006)", () => {
    const raw = minimal();
    (raw.events[0] as { options: unknown[] }).options = [
      {
        textKey: "ev.koryu.data1.a",
        chance: [
          { p: 0.5, textKey: "ev.koryu.data1.good" },
          { p: 0.5, effects: { mood: -1 } },
        ],
      },
    ];
    expect(() => buildContentIndex(raw)).toThrow(/missing text key "ev.koryu.data1.good"/);
    raw.text["ev.koryu.data1.good"] = "Sale bien";
    expect(buildContentIndex(raw).getEvent("koryu-data-session-1").options).toHaveLength(1);
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
