import { loadContent } from "@falconess/content";
import type { Course, EntryInput, RaceEntry, RaceRule, Style } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { RULESET_V1, type Ruleset } from "../rulesets/index.js";
import { simulateRace, simulateRaceProbed } from "./engine.js";
import { freezeEntry } from "./entry.js";
import { neutralFixtureEntry } from "./fixtures.js";
import { buildCourseGeometry, type CourseGeometry } from "./geometry.js";
import { createRaceArena } from "./state.js";

/**
 * The measured anchors of docs/race-engine.md 25.4 ("Other measured anchors"), 13.1 (S2 equal PW)
 * and 17.3 (same-build dispersion), re-measured with the seed schemes of the spec prototype's
 * scripts (.work/proto/proto2: crash.mjs, disp.mjs, s1.mjs, s2eq.mjs, mono.mjs). The engine agrees
 * with the prototype race by race (differential harness, .work/impl/diff), so every number the
 * spec prints comes out exactly, not statistically: a change here is a change to an agreed number
 * and needs its spec table regenerated (25.4: ±0.5 % or a documented change).
 */

const content = loadContent();
const QUIET: Ruleset = {
  ...RULESET_V1,
  race: { ...RULESET_V1.race, paceHalfWidth: 0, paceCentreSpan: 0, planErrorMax: 0 },
};
/** A boost tick costs more than any tank: the physics without the controller's thrust. */
const NO_BOOST: Ruleset = { ...QUIET, race: { ...QUIET.race, kE: 1_000_000 } };
const COURSES = ["desert-sprint", "desert-ridge", "desert-canyon"].map((id) =>
  content.getCourse(id),
);
const APT_B = { desert: "B", mountain: "B", coast: "B", urban: "B", tundra: "B" } as const;

function stats(over: Partial<RaceEntry["stats"]> = {}): RaceEntry["stats"] {
  return { agility: 600, stamina: 600, technique: 600, courage: 600, intelligence: 600, ...over };
}
function neutral(style: Style, lane = 0, st = stats(), over: Partial<RaceEntry> = {}): RaceEntry {
  return {
    ...neutralFixtureEntry({ runnerId: `n${lane}`, laneIndex: lane, style, stats: st }),
    ...over,
  };
}
function frame(frameId: string, course: Course, st = stats(), lane = 0): RaceEntry {
  const input: EntryInput = {
    runnerId: `f${lane}`,
    kind: "rival",
    falconessId: null,
    baseStats: st,
    mood: 0,
    biomeAptitude: APT_B,
    styleAptitude: { dive: "B", hover: "B", glide: "B", ground: "B" },
    frameId,
    parts: [],
    quirks: [],
    learnedSkills: [],
    durability: null,
  };
  return freezeEntry(RULESET_V1, content, input, course, lane);
}
function course(id: string, segments: Course["segments"]): Course {
  return {
    id,
    version: 1,
    biome: "desert",
    traits: [],
    entries: 8,
    segments,
    textKey: `course.${id}`,
  };
}
function solo(ruleset: Ruleset, e: RaceEntry, c: Course, seed = "s") {
  const r = simulateRace(ruleset, [e], c, seed, { detail: "results" }).results[0];
  if (!r || r.finishMilli === null) throw new Error("no finish");
  return r;
}
const sec = (milli: number) => milli / 15_000;

/** A batch runner: one arena and one cached geometry per course, detail "results". */
function batch() {
  const arena = createRaceArena();
  const geo = new Map<string, CourseGeometry>();
  return (ruleset: Ruleset, entries: RaceEntry[], c: Course, seed: string) => {
    let g = geo.get(c.id);
    if (!g) {
      g = buildCourseGeometry(ruleset, c);
      geo.set(c.id, g);
    }
    return simulateRace(ruleset, entries, c, seed, { detail: "results", arena, geometry: g });
  };
}

describe("25.4 other measured anchors (solo, noise off)", () => {
  it("failed jump +3.35 s and −25 durability; obstacle-armor +2.00 s, no damage; 200 m of water +3.11 s and −10", () => {
    // crash.mjs: glide, St 1200, energy 40 against a 60-energy lift
    const base = neutral("glide", 0, stats({ stamina: 1200 }), { energy: 40 });
    const armored = {
      ...base,
      traits: { ...base.traits, obstacleArmor: true, obstacleArmorExtraTicks: 10 },
    };
    const flat = course("flat-2000", [{ type: "flat", length: 2000 }]);
    const jump = course("jump-fail", [
      { type: "flat", length: 800 },
      { type: "jump", length: 100, liftRequired: 60 },
      { type: "flat", length: 1100 },
    ]);
    const water = course("water-200", [
      { type: "flat", length: 900 },
      { type: "water", length: 200, drag: 0.2 },
      { type: "flat", length: 900 },
    ]);
    const runs = [
      solo(QUIET, base, flat),
      solo(QUIET, base, jump),
      solo(QUIET, armored, jump),
      solo(QUIET, base, water),
    ];
    expect(runs.map((r) => [r.finishMilli, r.durabilityEnd, r.ledger.stallTicks])).toEqual([
      [1_300_800, 100_000, 0],
      [1_351_040, 75_000, 20],
      [1_330_800, 100_000, 30],
      [1_347_474, 90_000, 0],
    ]);
    const delta = runs
      .slice(1)
      .map((r) => sec((r.finishMilli ?? 0) - (runs[0]?.finishMilli ?? 0)).toFixed(2));
    expect(delta).toEqual(["3.35", "2.00", "3.11"]);
  });

  it("landing at T 600: 23.5 → 20.2 m/s, ≈ 13.5 m (0.57 s); Lumière 16.9 m/s ≈ 54 m; Boneyard 21.9 m/s ≈ 3.4 m", () => {
    // one landing on [flat 1000, jump 100, flat 1900] against flat 3000, no boost, no exhaustion
    const flat = course("flat-3000", [{ type: "flat", length: 3000 }]);
    const jump = course("landing", [
      { type: "flat", length: 1000 },
      { type: "jump", length: 100, liftRequired: 20 },
      { type: "flat", length: 1900 },
    ]);
    const rows = (["none", "regen", "repairable"] as const).map((rule: RaceRule) => {
      const e = neutral("hover", 0, stats({ stamina: 1200 }), { rule });
      const a = solo(NO_BOOST, e, flat);
      const b = solo(NO_BOOST, e, jump);
      const lost = (b.finishMilli ?? 0) - (a.finishMilli ?? 0);
      return [
        b.ledger.landingLossMms,
        ((23_500 - b.ledger.landingLossMms) / 1000).toFixed(1),
        lost,
        (sec(lost) * 23.5).toFixed(1),
      ];
    });
    expect(rows).toEqual([
      [3290, "20.2", 8567, "13.4"],
      [6580, "16.9", 34_405, "53.9"],
      [1645, "21.9", 2125, "3.3"],
    ]);
  });

  it("launch to cruise on flat: T 300 20.3 s, T 600 15.3 s (309 m), T 900 12.2 s; PW 1.4 27.7 s; PW 0.7 8.1 s (121 m)", () => {
    // the first tick whose vCore reaches the cruise target, no boost (thrust never enters vCore)
    const flat = course("flat-3000", [{ type: "flat", length: 3000 }]);
    const rows = (
      [
        [300, 1000],
        [600, 1000],
        [900, 1000],
        [600, 1400],
        [600, 700],
      ] as const
    ).map(([technique, powerToWeight]) => {
      let ticks = -1;
      let pos = 0;
      simulateRaceProbed(
        NO_BOOST,
        [neutral("hover", 0, stats({ technique }), { powerToWeight })],
        flat,
        "launch",
        (t, A) => {
          if (ticks < 0 && (A.state.vCore[0] ?? 0) >= (A.tables.vC[0] ?? 0)) {
            ticks = t + 1;
            pos = A.state.pos[0] ?? 0;
          }
        },
      );
      return `${(ticks / 15).toFixed(1)} s ${(pos / 225_000).toFixed(0)} m`;
    });
    // 25.4 prints 707 m for PW 1.4: a boosted run (SURPLUS at the gun) on a ~1.5 km course; the
    // thrust-free launch covers 695 m in the same 27.7 s
    expect(rows).toEqual([
      "20.3 s 412 m",
      "15.3 s 309 m",
      "12.2 s 246 m",
      "27.7 s 695 m",
      "8.1 s 121 m",
    ]);
  });
});

describe("17.3 / 25.4 same-build dispersion: σ/mean over 300 seeds (disp.mjs seeds)", () => {
  it("neutral dive I 600 / 300 / 1000, shiden, falke on the three courses; mean +0.8 % at I 300, −1.0 % at I 1000", {
    timeout: 30_000,
  }, () => {
    const run = batch();
    const builds: [string, (c: Course) => RaceEntry][] = [
      ["dive I600", () => neutral("dive", 0, stats())],
      ["dive I300", () => neutral("dive", 0, stats({ intelligence: 300 }))],
      ["dive I1000", () => neutral("dive", 0, stats({ intelligence: 1000 }))],
      ["shiden", (c) => frame("shiden", c)],
      ["falke", (c) => frame("falke", c)],
    ];
    const cv: Record<string, string> = {};
    const mean: Record<string, number[]> = {};
    for (const [label, mk] of builds) {
      const cells: string[] = [];
      mean[label] = [];
      for (const c of COURSES) {
        const e = mk(c);
        const xs: number[] = [];
        for (let k = 0; k < 300; k++)
          xs.push(run(RULESET_V1, [e], c, `seed-${k}`).results[0]?.finishMilli ?? 0);
        const m = xs.reduce((a, b) => a + b, 0) / xs.length;
        const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1));
        cells.push(((100 * sd) / m).toFixed(2));
        mean[label]?.push(m);
      }
      cv[label] = cells.join(" / ");
    }
    expect(cv).toEqual({
      "dive I600": "1.18 / 1.31 / 0.99",
      "dive I300": "1.21 / 1.33 / 1.00",
      "dive I1000": "1.14 / 1.27 / 0.99",
      shiden: "0.61 / 0.78 / 1.08",
      falke: "1.21 / 1.32 / 1.00",
    });
    const shift = (label: string) => {
      const a = mean[label] ?? [];
      const b = mean["dive I600"] ?? [];
      return ((100 * a.reduce((s, x, k) => s + x / (b[k] ?? 1) - 1, 0)) / a.length).toFixed(1);
    };
    expect([shift("dive I300"), shift("dive I1000")]).toEqual(["0.8", "-1.0"]);
  });
});

describe("25.4 agility monotonicity (mono.mjs: 1500 random frame builds on flat courses, noise off)", () => {
  it("no boost 0 / 1500; boost without exhaustion 15 / 977, worst 121 mt continuous and 1106 mt (pulse); with exhaustion 3 / 523, worst 0.05 %", {
    timeout: 30_000,
  }, () => {
    let seed = 12_345;
    const rnd = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed / 2_147_483_648;
    };
    const frames = [
      "falke",
      "erzherzog",
      "sylphe",
      "etoile",
      "shiden",
      "hayate",
      "nimbus",
      "horizon",
      "mule",
      "kite",
    ];
    const NEUTRALISED: Ruleset = { ...QUIET, race: { ...QUIET.race, kBoost: 0, kH: 0 } };
    const tiers = { a: [0, 0, 0], b: [0, 0, 0], c: [0, 0, 0] };
    let continuousWorst = 0;
    for (let k = 0; k < 1500; k++) {
      const len = 200 + Math.floor(rnd() * 2800);
      const c = course(`flat-${len}`, [{ type: "flat", length: len }]);
      const st = stats({
        agility: 50 + Math.floor(rnd() * 1100),
        stamina: 50 + Math.floor(rnd() * 1100),
        technique: 50 + Math.floor(rnd() * 1100),
        courage: 50 + Math.floor(rnd() * 1100),
        intelligence: 50 + Math.floor(rnd() * 1100),
      });
      const f = frames[Math.floor(rnd() * frames.length)] ?? "falke";
      const d = 1 + Math.floor(rnd() * 200);
      const e1 = frame(f, c, st);
      const e2 = frame(f, c, { ...st, agility: st.agility + d });
      for (const tier of ["a", "bc"] as const) {
        const rs = tier === "a" ? NEUTRALISED : QUIET;
        const r1 = solo(rs, e1, c, "m");
        const r2 = solo(rs, e2, c, "m");
        const key =
          tier === "a"
            ? "a"
            : r1.ledger.hpEmptyMm === null && r2.ledger.hpEmptyMm === null
              ? "b"
              : "c";
        const x = tiers[key];
        x[0] = (x[0] ?? 0) + 1;
        const f1 = r1.finishMilli ?? 0;
        const f2 = r2.finishMilli ?? 0;
        if (f2 > f1) {
          x[1] = (x[1] ?? 0) + 1;
          x[2] = Math.max(x[2] ?? 0, key === "c" ? f2 / f1 - 1 : f2 - f1);
          if (key === "b" && e1.rule !== "pulse")
            continuousWorst = Math.max(continuousWorst, f2 - f1);
        }
      }
    }
    expect([tiers.a, tiers.b, continuousWorst]).toEqual([[1500, 0, 0], [977, 15, 1106], 121]);
    expect([tiers.c[0], tiers.c[1], (100 * (tiers.c[2] ?? 0)).toFixed(2)]).toEqual([
      523,
      3,
      "0.05",
    ]);
  });
});
