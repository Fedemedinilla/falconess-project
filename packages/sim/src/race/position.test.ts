import { createHash } from "node:crypto";
import { loadContent } from "@falconess/content";
import { Rng } from "@falconess/rng";
import {
  DEFAULT_POSITION,
  type EntryInput,
  POSITIONS,
  type Position,
  type RaceEntry,
  type RaceLog,
  STYLES,
  type Style,
} from "@falconess/schema";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { RULESET_V1, type Ruleset } from "../rulesets/index.js";
import { createController, selectMode } from "./controller.js";
import { simulateRace } from "./engine.js";
import { freezeEntry } from "./entry.js";
import { generateField } from "./field.js";
import { neutralFixtureEntry } from "./fixtures.js";
import { buildCourseGeometry, phaseOf } from "./geometry.js";
import { canonicalJson, GOLDEN_SCENARIOS, runGoldenScenario } from "./golden.js";
import {
  buildTables,
  createRaceArena,
  drawRaceBlock,
  ib,
  ibs,
  initState,
  ips,
  is,
} from "./state.js";
import { SPEC_RULESET } from "./testing/spec-ruleset.js";
import {
  MODE_DIVE_DESCENT,
  MODE_GLIDE_CHASE,
  MODE_GROUND_CONSTANT,
  MODE_HOVER_CATCHUP,
  PH_FINAL,
} from "./units.js";

/**
 * The race position of ADR-0008: the position picks the controller row of 9.4 (lead `GLIDE_CHASE`,
 * pack `GROUND_CONSTANT`, stalk `HOVER_CATCHUP`, closer `DIVE_DESCENT`), its keep, its hold and its
 * plan point, on any wings; the wings keep their physics (9.8); the pack position keeps a flyer's
 * jump reserve; the letter of the position scales Intelligence; and in the default position of
 * each wing style a race is the race of v1 as it was.
 */

const content = loadContent();
const S600 = { agility: 600, stamina: 600, technique: 600, courage: 600, intelligence: 600 };
const QUIET: Ruleset = {
  ...SPEC_RULESET,
  race: { ...SPEC_RULESET.race, paceHalfWidth: 0, paceCentreSpan: 0, planErrorMax: 0 },
};
const SPRINT = content.getCourse("sprint");
const RIDGE = content.getCourse("ridge");
const M = 225_000; // pu per metre
const FLYERS: readonly Style[] = ["dive", "hover", "glide"];

function fixture(style: Style, position: Position, lane = 0, stats = S600): RaceEntry {
  return neutralFixtureEntry({ runnerId: `fx-${lane}`, laneIndex: lane, style, position, stats });
}

/** Tables and the initial state of one runner, with `selectMode` at a position (pu). */
function setup(entry: RaceEntry, course = SPRINT, ruleset: Ruleset = QUIET) {
  const R = ruleset.race;
  const G = buildCourseGeometry(ruleset, course);
  const A = createRaceArena().reset(1, G);
  drawRaceBlock(ruleset, [entry], new Rng("position"), A);
  buildTables(ruleset, [entry], G, A);
  initState(ruleset, [entry], A);
  const T = A.tables;
  const S = A.state;
  const ctl = createController({ boostMode: () => {}, freeBoost: () => {}, pulse: () => {} });
  const mode = (x: number) => {
    S.pos[0] = x;
    let s = 0;
    while (s < G.S - 1 && x >= (G.segEnd[s] ?? 0)) s++;
    S.seg[0] = s;
    return selectMode(R, G, T, S, 0, phaseOf(G, x), ctl);
  };
  return { G, T, S, ctl, mode };
}

const sha = (v: unknown) =>
  createHash("sha256").update(canonicalJson(v)).digest("hex").slice(0, 16);

describe("the position picks the controller row on any wings (docs/race-engine.md 9.4, ADR-0008)", () => {
  it("closer spends on descents before the final, keeping 50 % beyond the jump reserve", () => {
    for (const style of STYLES) {
      const x = setup(fixture(style, "closer"), RIDGE);
      const jr = x.T.jr[is(0, 1)] ?? 0; // the first descent (segment 1)
      x.S.energy[0] = 51_000 + jr;
      expect([x.mode(400 * M), x.ctl.want], style).toEqual([MODE_DIVE_DESCENT, true]);
      x.S.energy[0] = 50_999 + jr;
      expect([x.mode(400 * M), x.ctl.want], style).toEqual([MODE_DIVE_DESCENT, false]);
      x.S.energy[0] = 100_000;
      expect(x.mode(1400 * M), `${style}: the final's descent is the plan's`).not.toBe(
        MODE_DIVE_DESCENT,
      );
    }
  });

  it("stalk catches up from behind the middle pack (keep 50 %) and plans its sprint at 70 %", () => {
    for (const style of STYLES) {
      const x = setup(fixture(style, "stalk"));
      x.S.energy[0] = 60_000;
      x.S.posFrac[0] = 857;
      expect([x.mode(500 * M), x.ctl.want], style).toEqual([MODE_HOVER_CATCHUP, true]);
      expect(x.T.planPoint[0], style).toBe(x.G.hoverAttack);
      for (const p of POSITIONS.filter((q) => q !== "stalk"))
        expect(setup(fixture(style, p)).T.planPoint[0], `${style} ${p}`).toBe(x.G.finalStart);
    }
  });

  it("lead chases the lead before the final, keeping 60 %", () => {
    for (const style of STYLES) {
      const x = setup(fixture(style, "lead"));
      x.S.energy[0] = 61_000;
      x.S.ahead[0] = 1;
      expect([x.mode(500 * M), x.ctl.want], style).toEqual([MODE_GLIDE_CHASE, true]);
      x.S.holdLeft[0] = 0;
      x.S.energy[0] = 60_999;
      expect([x.mode(500 * M), x.ctl.want], style).toEqual([MODE_GLIDE_CHASE, false]);
    }
  });

  it("pack runs its even level while 40 % of the tank beyond the reserve is left; no other position has one", () => {
    for (const style of STYLES) {
      const x = setup(fixture(style, "pack"), RIDGE);
      const level = x.T.groundLevel[ib(0, 0)] ?? 0;
      expect(level, style).toBeGreaterThan(0);
      x.S.energy[0] = 100_000;
      expect([x.mode(200 * M), x.ctl.level], style).toEqual([MODE_GROUND_CONSTANT, level]);
      for (const p of POSITIONS.filter((q) => q !== "pack"))
        expect(setup(fixture(style, p), RIDGE).T.groundLevel[ib(0, 0)], `${style} ${p}`).toBe(0);
    }
  });

  it("the hold of 12 ticks follows the position (lead and stalk), not the wings", () => {
    for (const style of STYLES)
      for (const position of POSITIONS) {
        const x = setup(fixture(style, position));
        x.S.energy[0] = 90_000; // below the sprint's SURPLUS line (capFinal 99 000)
        x.S.ahead[0] = 1;
        x.S.posFrac[0] = 1000;
        x.mode(500 * M);
        const held = position === "lead" || position === "stalk";
        expect(x.S.holdLeft[0], `${style} ${position}`).toBe(
          held ? QUIET.race.style.styleHoldTicks : 0,
        );
      }
  });
});

describe("the wings keep their physics in any position (docs/race-engine.md 9.8, ADR-0008)", () => {
  it("dive's stoop, glide's launch, ground's route and its half damage go with the wings", () => {
    for (const style of STYLES)
      for (const position of POSITIONS) {
        const { G, T } = setup(fixture(style, position), RIDGE);
        const label = `${style} ${position}`;
        const descent = 1; // ridge segment 1 is a descent, middle phase
        expect(T.stoop[ips(0, 1, descent)], label).toBe(
          style === "dive" ? QUIET.race.style.diveStoopPm : 1000,
        );
        expect(T.stoop[ips(0, PH_FINAL, 0)], label).toBe(
          style === "dive" ? QUIET.race.style.diveStoopPm : 1000,
        );
        const acc = T.acc[ibs(0, 0, 0)] ?? 0;
        expect(T.accStart[ibs(0, 0, 0)], label).toBe(
          style === "glide" ? Math.floor((acc * QUIET.race.style.glideStartAccelPm) / 1000) : acc,
        );
        expect(T.detour[0], label).toBe(style === "ground" ? QUIET.race.groundDetourMult : 1000);
        expect(T.styleDmg[0], label).toBe(style === "ground" ? QUIET.race.groundDamagePm : 1000);
        // the jump reserve and the kick are physics: ground never jumps
        expect(T.jr[0] === 0, label).toBe(style === "ground");
        expect(T.kickAt[0], label).toBe(G.reserveAt);
      }
  });

  it("through simulateRace the hover slipstream drafts in every position, and only hover wings", () => {
    for (const position of POSITIONS) {
      const entries = Array.from({ length: 8 }, (_, lane) =>
        fixture(STYLES[lane % 4] ?? "dive", position, lane),
      );
      const log = simulateRace(RULESET_V1, entries, SPRINT, `wings/${position}`, {
        detail: "results",
      });
      let hoverDraft = 0;
      for (const r of log.results) {
        const style = entries[r.lane]?.style;
        if (style === "hover") hoverDraft += r.ledger.draftTicks;
        else expect(r.ledger.draftTicks, `${style} ${position}`).toBe(0);
      }
      expect(hoverDraft, position).toBeGreaterThan(0);
    }
  });
});

describe("the pack position on flying wings keeps the jump reserve (ADR-0008)", () => {
  it("spends fl(Emax × 600, 1000) − jrStart evenly over the thrust-capable ticks before the final", () => {
    for (const style of FLYERS) {
      const { T } = setup(fixture(style, "pack"), RIDGE, RULESET_V1);
      expect(T.jrStart[0], style).toBe(35_000); // ridge at T 600 (14.4)
      const ground = setup(fixture("ground", "pack"), RIDGE, RULESET_V1).T;
      expect(ground.jrStart[0]).toBe(0);
      // a flyer plans 25 of its 100 energy before the final, ground 60
      expect(T.groundLevel[ib(0, 0)] ?? 0, style).toBeLessThan(
        Math.floor(((T.Bon[ib(0, 0)] ?? 0) * 60_000) / (1000 * 1000)),
      );
    }
  });

  it("reaches the final with 40 % of the tank plus the reserve of the jumps still ahead", () => {
    for (const style of FLYERS) {
      const entries = [fixture(style, "pack")];
      const log = simulateRace(RULESET_V1, entries, RIDGE, `pack/${style}`, { detail: "full" });
      const runner = log.frames?.runners[0];
      if (!runner) throw new Error("full log");
      const before = runner.posMm.filter((p) => p < log.geometry.finalStartMm).length - 1;
      // 100 − 25 spent at the even level − 20 lifted at jump 1 = 55 = 40 + the 15 of jump 2, one
      // on-tick either way: the level is exact to one on-tick (9.5) and the row checks its 40 %
      // before the boost (9.4)
      const left = runner.energy[before] ?? 0;
      expect(Math.abs(left - 55_000), style).toBeLessThanOrEqual(RULESET_V1.race.kE);
      expect(
        log.events?.filter((e) => e.kind === "jumpFail"),
        style,
      ).toEqual([]);
    }
  });

  it("fails only the jumps it would fail without ever boosting (fast-check, 120 fields of eight pack flyers)", () => {
    // what the tank × technique alone allow (14.2): from a full tank, lift each jump in order
    const jumps = RIDGE.segments.flatMap((s) => (s.type === "jump" ? [s.liftRequired * 1000] : []));
    const unboosted = (energyMe: number, liftPm: number): number[] => {
      let e = energyMe;
      const failed: number[] = [];
      for (const req of jumps) {
        if (Math.floor((e * liftPm) / 1000) >= req) e -= Math.min(e, req);
        else failed.push(req);
      }
      return failed;
    };
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            style: fc.constantFrom(...FLYERS),
            technique: fc.integer({ min: 1, max: 1200 }),
            stamina: fc.integer({ min: 200, max: 1200 }),
            agility: fc.integer({ min: 200, max: 1200 }),
            energy: fc.integer({ min: 40, max: 140 }),
          }),
          { minLength: 8, maxLength: 8 },
        ),
        fc.integer({ min: 0, max: 1_000_000 }),
        (rows, n) => {
          const entries = rows.map((r, lane) => ({
            ...fixture(r.style, "pack", lane, {
              ...S600,
              technique: r.technique,
              stamina: r.stamina,
              agility: r.agility,
            }),
            energy: r.energy,
          }));
          const log: RaceLog = simulateRace(RULESET_V1, entries, RIDGE, `jr/${n}`, {
            detail: "full",
          });
          entries.forEach((entry, lane) => {
            const failed = (log.events ?? []).flatMap((e) =>
              e.kind === "jumpFail" && e.lane === lane ? [e.required] : [],
            );
            // spending at the even level never costs a jump: a failure is a build problem (14.4)
            expect(failed, `lane ${lane}`).toEqual(
              unboosted(entry.energy * 1000, log.derived[lane]?.liftPm ?? 0),
            );
          });
        },
      ),
      { numRuns: 120 },
    );
  });
});

describe("the letter of the chosen position scales Intelligence (docs/race-engine.md 10, ADR-0008)", () => {
  const peregrina = content.getFalconess("peregrina");
  const input = (position?: Position): EntryInput => ({
    runnerId: "player",
    kind: "player",
    falconessId: "peregrina",
    baseStats: S600,
    mood: 0,
    positionAptitude: { ...peregrina.positionAptitude },
    ...(position === undefined ? {} : { position }),
    frameId: "peregrina-signature",
    parts: [],
    quirks: [],
    learnedSkills: [],
    durability: null,
  });

  it("each position gives its own letter; without one she runs in her wings' default", () => {
    for (const position of POSITIONS) {
      const e = freezeEntry(RULESET_V1, content, input(position), SPRINT, 0);
      const letter = peregrina.positionAptitude[position];
      expect([e.position, e.positionAptitude, e.style]).toEqual([position, letter, "dive"]);
      expect(e.stats.intelligence).toBe(Math.floor((600 * RULESET_V1.aptitudeMult[letter]) / 1000));
    }
    const wings = freezeEntry(RULESET_V1, content, input(), SPRINT, 0);
    expect(wings).toEqual(freezeEntry(RULESET_V1, content, input("closer"), SPRINT, 0));
  });

  it("rivals keep the position of their wings and their A there, whatever the player picks", () => {
    for (const position of POSITIONS) {
      const entries = generateField(RULESET_V1, content, {
        course: SPRINT,
        turn: 24,
        raceSeed: "rivals",
        player: input(position),
      });
      for (const e of entries.filter((x) => x.kind === "rival")) {
        expect(e.position).toBe(DEFAULT_POSITION[e.style]);
        expect(e.positionAptitude).toBe("A");
      }
      expect(entries.find((e) => e.kind === "player")?.position).toBe(position);
    }
  });
});

/**
 * Hashes of the 12 golden logs as `tests/golden/v1` held them before ADR-0008 (commit 34f91aa,
 * canonical JSON, sha256, 16 hex): the races of the wing styles.
 */
const PRE_POSITION_GOLDENS: Readonly<Record<string, string>> = {
  "g01-sprint-generic": "31dc7bcec4eb3c1a",
  "g02-ridge-generic": "8d411de907c18a93",
  "g03-canyon-generic": "2f3718ddc3073b82",
  "g04-sprint-caracara-t24": "13370c87cfdbbb39",
  "g05-ridge-peregrina-t24": "3dc4920bdb738ce7",
  "g06-canyon-cernicala-t24": "90fbda33f949db31",
  "g07-sprint-caracara-t46": "9699c2d824d96f53",
  "g08-ridge-peregrina-t46": "d4b02ad1467b79e0",
  "g09-canyon-cernicala-t46": "77583e30aab3f3af",
  "g10-sprint-edge": "2f256555871df3e1",
  "g11-ridge-edge": "8f2f1a33c6d35bbb",
  "g12-canyon-edge": "bb75bd08c9821481",
};

describe("in the default positions a race is the race of v1 as it was (ADR-0008)", () => {
  it("every golden log, ADR-0008's entry fields undone, hashes as before the change", () => {
    expect(Object.keys(PRE_POSITION_GOLDENS)).toEqual(GOLDEN_SCENARIOS.map((s) => s.name));
    for (const s of GOLDEN_SCENARIOS) {
      const log = runGoldenScenario(content, s);
      for (const e of log.entries) expect(e.position, s.name).toBe(DEFAULT_POSITION[e.style]);
      const legacy = {
        ...log,
        entries: log.entries.map(({ position: _p, positionAptitude, ...rest }) => ({
          ...rest,
          styleAptitude: positionAptitude,
        })),
      };
      expect(sha(legacy), s.name).toBe(PRE_POSITION_GOLDENS[s.name]);
    }
  });

  it("an explicit default position freezes the same entry and runs the same race", () => {
    for (const course of content.courses.values()) {
      const implicit = STYLES.map((style, lane) =>
        neutralFixtureEntry({ runnerId: `n-${lane}`, laneIndex: lane, style, stats: S600 }),
      );
      const explicit = STYLES.map((style, lane) => ({
        ...fixture(style, DEFAULT_POSITION[style], lane),
        runnerId: `n-${lane}`,
      }));
      expect(explicit).toEqual(implicit);
      expect(simulateRace(RULESET_V1, explicit, course, "d", { detail: "full" })).toEqual(
        simulateRace(RULESET_V1, implicit, course, "d", { detail: "full" }),
      );
    }
  });

  it("another position changes the race: the row is the position's, not the wings'", () => {
    const base = STYLES.map((style, lane) => fixture(style, DEFAULT_POSITION[style], lane));
    const time = (entries: RaceEntry[]) =>
      simulateRace(RULESET_V1, entries, RIDGE, "other", { detail: "results" }).results.map(
        (r) => r.finishMilli,
      );
    const all = time(base);
    for (const position of POSITIONS) {
      const moved = base.map((e) => ({ ...e, position }));
      expect(time(moved), position).not.toEqual(all);
    }
  });
});
