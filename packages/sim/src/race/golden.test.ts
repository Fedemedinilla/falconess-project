import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadContent } from "@falconess/content";
import {
  type EntryInput,
  ManufacturerRule,
  type RaceEntry,
  RaceEvent,
  RaceLog,
  Style,
} from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { RULESET_V1 } from "../rulesets/index.js";
import { simulateRace } from "./engine.js";
import { generateField, rivalPool } from "./field.js";
import { buildCourseGeometry } from "./geometry.js";
import {
  canonicalJson,
  DETERMINISM_EXTRAS,
  GOLDEN_SCENARIOS,
  type GoldenScenario,
  goldenDiffHint,
  goldenEntries,
  runGoldenScenario,
} from "./golden.js";
import { createRaceArena } from "./state.js";

/**
 * Golden logs and determinism (docs/race-engine.md 24.3, ROADMAP D13). Each scenario of
 * `golden.ts` runs with detail "full" and its canonical JSON must equal
 * `tests/golden/v1/<name>.json` byte for byte. The lead writes those files with
 * `pnpm golden:update -- --yes` and an ADR; until the directory exists the comparison is skipped
 * with a warning. `pnpm test:golden` runs this file alone; `FALCONESS_GOLDEN_DIR=<dir>` compares
 * against another directory (a candidate written with `--dir`).
 */

const content = loadContent();
const GOLDEN_DIR =
  process.env.FALCONESS_GOLDEN_DIR ??
  fileURLToPath(new URL("../../../../tests/golden/v1/", import.meta.url));
const SHOWN_DIR = process.env.FALCONESS_GOLDEN_DIR ?? "tests/golden/v1";
const SIM_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const GOLDEN_MODULE = new URL("./golden.ts", import.meta.url).href;
const REGENERATE = "pnpm golden:update -- --yes (and record why in an ADR)";

const logs = new Map<string, RaceLog>();
function logOf(s: GoldenScenario): RaceLog {
  const cached = logs.get(s.name);
  if (cached !== undefined) return cached;
  const log = runGoldenScenario(content, s);
  logs.set(s.name, log);
  return log;
}

function eventsOf(s: GoldenScenario): RaceEvent[] {
  return logOf(s).events ?? [];
}

describe("golden scenarios (docs/race-engine.md 24.3)", () => {
  it("are 3 courses × 4 fields with unique names in file order and unique seeds", () => {
    const names = GOLDEN_SCENARIOS.map((s) => s.name);
    expect(names).toHaveLength(12);
    expect([...names].sort()).toEqual(names);
    for (const [k, name] of names.entries())
      expect(name).toMatch(new RegExp(`^g${String(k + 1).padStart(2, "0")}-[a-z0-9-]+$`));
    expect(new Set(GOLDEN_SCENARIOS.map((s) => s.seed)).size).toBe(12);
    for (const courseId of content.courses.keys())
      expect(
        GOLDEN_SCENARIOS.filter((s) => s.courseId === courseId)
          .map((s) => s.field)
          .sort(),
      ).toEqual(["edge", "generic", "turn-24", "turn-46"]);
    for (const s of DETERMINISM_EXTRAS) expect(names).not.toContain(s.name);
  });

  it("run valid full logs of freezeEntry fields: no rule none, no disabled skill (ADR-0003 D42, D49)", () => {
    for (const s of GOLDEN_SCENARIOS) {
      const log = logOf(s);
      expect(() => RaceLog.parse(log), s.name).not.toThrow();
      expect(log.detail).toBe("full");
      expect(log.entries.map((e) => e.rule)).not.toContain("none");
      expect(log.entries.flatMap((e) => e.skills).filter((k) => k.disabled)).toEqual([]);
      expect(log.results.filter((r) => r.dnf)).toEqual([]);
    }
  });

  it("cover every course, manufacturer rule, style and signature frame", () => {
    const entries = GOLDEN_SCENARIOS.flatMap((s) => logOf(s).entries);
    expect(new Set(GOLDEN_SCENARIOS.map((s) => s.courseId))).toEqual(
      new Set(content.courses.keys()),
    );
    expect(new Set(entries.map((e) => e.rule))).toEqual(new Set(ManufacturerRule.options));
    expect(new Set(entries.map((e) => e.style))).toEqual(new Set(Style.options));
    const frames = new Set(entries.map((e) => e.frameId));
    for (const frame of content.frames.values()) expect(frames, frame.id).toContain(frame.id);
    for (const falconess of content.falconess.keys())
      expect(entries.filter((e) => e.falconessId === falconess && e.kind === "player")).not.toEqual(
        [],
      );
    // (a): eight different generic frames holding every rule and every style, on each course
    for (const s of GOLDEN_SCENARIOS.filter((g) => g.field === "generic")) {
      const field = logOf(s).entries;
      expect(new Set(field.map((e) => e.frameId)).size, s.name).toBe(8);
      expect(field.filter((e) => content.getFrame(e.frameId).signatureOf !== undefined)).toEqual(
        [],
      );
      expect(new Set(field.map((e) => e.rule)), s.name).toEqual(new Set(ManufacturerRule.options));
      expect(new Set(field.map((e) => e.style)), s.name).toEqual(new Set(Style.options));
    }
  });

  it("build (b) and (c) with generateField around the player, the scenario seed as raceSeed", () => {
    const goal = GOLDEN_SCENARIOS.filter((g) => g.field === "turn-24" || g.field === "turn-46");
    expect(goal).toHaveLength(6);
    const rivalsOf = (entries: readonly RaceEntry[]) =>
      canonicalJson(entries.filter((e) => e.kind === "rival"));
    for (const s of goal) {
      const turn = s.field === "turn-24" ? 24 : 46;
      const course = content.getCourse(s.courseId);
      const entries = goldenEntries(content, s);
      const player = entries.find((e) => e.kind === "player");
      if (player === undefined) throw new Error(`${s.name}: no player`);
      expect(
        entries.map((e) => e.laneIndex),
        s.name,
      ).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
      expect(content.getFrame(player.frameId).signatureOf, s.name).toBe(player.falconessId);
      const pool = rivalPool(RULESET_V1, content, player.frameId).map((f) => f.id);
      for (const e of entries.filter((x) => x.kind === "rival")) {
        expect(pool, `${s.name} ${e.runnerId}`).toContain(e.frameId);
        expect([e.parts, e.quirks], `${s.name} ${e.runnerId}`).toEqual([[], []]);
        expect(e.skills, `${s.name} ${e.runnerId}`).toHaveLength(
          Math.min(3, Math.floor(turn / 12)),
        );
      }
      // generateField's rivals and lane depend on the player only through her frame: the same
      // call around any player on that frame must give the golden rivals byte for byte ...
      const probe: EntryInput = {
        runnerId: "player",
        kind: "player",
        falconessId: player.falconessId,
        baseStats: { agility: 300, stamina: 300, technique: 300, courage: 300, intelligence: 300 },
        mood: 0,
        positionAptitude: { lead: "B", pack: "B", stalk: "B", closer: "B" },
        frameId: player.frameId,
        parts: [],
        quirks: [],
        learnedSkills: [],
        durability: null,
      };
      const args = { course, turn, raceSeed: s.seed, player: probe };
      const generated = generateField(RULESET_V1, content, args);
      expect(rivalsOf(generated), s.name).toBe(rivalsOf(entries));
      expect(generated.find((e) => e.kind === "player")?.laneIndex, s.name).toBe(player.laneIndex);
      // ... so a change of FIELD (here the rival curve) moves the golden input
      const moved = { ...RULESET_V1, field: { ...RULESET_V1.field, rivalPerTurn: 10 } };
      expect(rivalsOf(generateField(moved, content, args)), s.name).not.toBe(rivalsOf(entries));
    }
  });

  it("log every event kind except jumpFail (unreachable with v1 content) and dnf (an engine bug)", () => {
    const seen = new Set(GOLDEN_SCENARIOS.flatMap((s) => eventsOf(s).map((e) => e.kind)));
    // the flight events of the ruleset v3 draft (design7) never appear in a v1/v2 golden
    const v3Only = new Set(["takeoff", "dive", "touchdown", "noLift"]);
    const kinds = RaceEvent.options.map((o) => o.shape.kind.value).filter((k) => !v3Only.has(k));
    expect(kinds.filter((k) => !seen.has(k)).sort()).toEqual(["dnf", "jumpFail"]);
    expect([...seen].filter((k) => v3Only.has(k))).toEqual([]);
  });

  it("exercise what the fields were built for", () => {
    const all = GOLDEN_SCENARIOS.map(logOf);
    const runners = all.flatMap((log) =>
      log.results.map((r) => ({ r, e: log.entries[r.lane], d: log.derived[r.lane] })),
    );
    // overheat licence: a mass-thrust runner overheats and keeps more than 25 % of its durability
    const licensed = runners.filter(
      ({ r, e }) => e?.rule === "mass-thrust" && r.ledger.overheatTicks,
    );
    expect(licensed).not.toEqual([]);
    for (const { r, e } of licensed)
      expect(r.durabilityEnd * 4).toBeGreaterThan((e?.durabilityMax ?? 0) * 1000);
    // lucky-bolt picks, exhaustion, a frame that starts broken, a Falconess unique skill
    expect(runners.filter(({ d }) => d?.luckySkill !== null)).not.toEqual([]);
    expect(runners.filter(({ r }) => r.exhausted)).not.toEqual([]);
    expect(runners.filter(({ r, e }) => r.broken && e?.durabilityStart === 0)).not.toEqual([]);
    const uniques = runners.filter(({ r, e }) =>
      e?.skills.some((k) => k.uniqueTo !== null && r.ledger.skillsActivated.includes(k.id)),
    );
    expect(uniques).not.toEqual([]);
    // every edge race carries the five quirks of 24.3 (d), an I 100 and an St 150 runner
    for (const s of GOLDEN_SCENARIOS.filter((g) => g.field === "edge")) {
      const entries = logOf(s).entries;
      const quirks = new Set(entries.flatMap((e) => e.quirks));
      for (const q of ["lucky-bolt", "stutter", "hot-head", "glider-tape", "mud-runner"])
        expect(quirks, `${s.name} ${q}`).toContain(q);
      expect(entries.some((e) => e.stats.intelligence === 100)).toBe(true);
      expect(entries.some((e) => e.stats.stamina === 150)).toBe(true);
    }
  });
});

const goldenDirExists = existsSync(GOLDEN_DIR);
if (!goldenDirExists)
  console.warn(
    `[golden] ${SHOWN_DIR} does not exist: the ${GOLDEN_SCENARIOS.length} golden comparisons ` +
      `are skipped. Generate the files with ${REGENERATE}.`,
  );

describe.skipIf(!goldenDirExists)(`golden files ${SHOWN_DIR} (byte for byte)`, () => {
  for (const s of GOLDEN_SCENARIOS)
    it(`${s.name} (${s.courseId}): ${s.summary}`, () => {
      const file = join(GOLDEN_DIR, `${s.name}.json`);
      if (!existsSync(file))
        throw new Error(`${SHOWN_DIR}/${s.name}.json is missing: generate it with ${REGENERATE}`);
      const actual = canonicalJson(logOf(s));
      const expected = readFileSync(file);
      if (expected.equals(Buffer.from(actual, "utf8"))) return;
      const hint = goldenDiffHint(expected.toString("utf8"), actual) ?? "same text, other bytes";
      throw new Error(
        `${s.name} differs from ${SHOWN_DIR}/${s.name}.json, ${hint}. ` +
          `If the engine change is intended, regenerate with ${REGENERATE}.`,
      );
    });

  it("holds no file that no scenario writes", () => {
    const names = new Set(GOLDEN_SCENARIOS.map((s) => `${s.name}.json`));
    const stale = readdirSync(GOLDEN_DIR).filter((f) => f.endsWith(".json") && !names.has(f));
    expect(stale, "stale golden files: delete them or restore their scenario").toEqual([]);
  });
});

describe("determinism (docs/race-engine.md 24.3, P1)", () => {
  const scenarios = [...GOLDEN_SCENARIOS, ...DETERMINISM_EXTRAS];

  it("the same scenario twice in-process gives identical bytes, with or without a reused arena", () => {
    const arena = createRaceArena();
    for (const s of scenarios) {
      const course = content.getCourse(s.courseId);
      const first = canonicalJson(runGoldenScenario(content, s));
      const second = canonicalJson(runGoldenScenario(content, s));
      const reused = canonicalJson(
        simulateRace(RULESET_V1, goldenEntries(content, s), course, s.seed, {
          detail: "full",
          arena,
          geometry: buildCourseGeometry(RULESET_V1, course),
        }),
      );
      expect(goldenDiffHint(first, second), s.name).toBeNull();
      expect(goldenDiffHint(first, reused), s.name).toBeNull();
    }
  });

  it("a fresh child process gives the same bytes", () => {
    const code = [
      `const { loadContent } = await import("@falconess/content");`,
      `const g = await import(${JSON.stringify(GOLDEN_MODULE)});`,
      "const content = loadContent();",
      "for (const s of [...g.GOLDEN_SCENARIOS, ...g.DETERMINISM_EXTRAS])",
      `  process.stdout.write(s.name + "\\t" + g.canonicalJson(g.runGoldenScenario(content, s)) + "\\n");`,
    ].join("\n");
    const child = spawnSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "--eval", code],
      { cwd: SIM_ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
    );
    expect(child.status, child.stderr).toBe(0);
    const out = new Map(
      child.stdout
        .split("\n")
        .filter((line) => line !== "")
        .map((line) => [line.slice(0, line.indexOf("\t")), line.slice(line.indexOf("\t") + 1)]),
    );
    expect([...out.keys()]).toEqual(scenarios.map((s) => s.name));
    for (const s of scenarios)
      expect(goldenDiffHint(canonicalJson(logOf(s)), out.get(s.name) ?? ""), s.name).toBeNull();
  }, 120_000);
});

describe("canonicalJson and goldenDiffHint", () => {
  it("sorts keys at every depth, drops undefined properties and writes no whitespace", () => {
    expect(canonicalJson({ b: [1, { z: true, a: null }], a: "x y", c: undefined })).toBe(
      '{"a":"x y","b":[1,{"a":null,"z":true}]}',
    );
    expect(canonicalJson([undefined, -0, 12])).toBe("[null,0,12]");
    expect(() => canonicalJson({ v: Number.NaN })).toThrow(/non-finite/);
  });

  it("names the first differing JSON path, or the byte offset of unparsable text", () => {
    expect(goldenDiffHint("{}", "{}")).toBeNull();
    expect(goldenDiffHint('{"a":[1,2],"b":3}', '{"a":[1,5],"b":3}')).toMatch(
      /byte 8 .*\$\.a\[1\]: 2 → 5/,
    );
    expect(goldenDiffHint('{"a":1}', '{"a":1,"b":2}')).toMatch(/\$\.b: \(missing\) → 2/);
    expect(goldenDiffHint("{x", "{y")).toMatch(/byte 1 .*expected/);
  });
});
