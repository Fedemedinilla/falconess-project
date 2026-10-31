import { clamp, floorDiv } from "@falconess/rng";
import type {
  ContentIndex,
  Course,
  EntryInput,
  FalconessStats,
  Mood,
  RaceEntry,
  RaceLog,
  Slug,
  Style,
  StyleAptitudes,
} from "@falconess/schema";
import { RULESET_V1 } from "../rulesets/index.js";
import { simulateRace } from "./engine.js";
import { compareIds, freezeEntry } from "./entry.js";
import { generateField, PLAYER_RUNNER_ID } from "./field.js";

/**
 * The golden races of docs/race-engine.md 24.3 (ROADMAP D13): 3 courses × 4 fields, each run with
 * `detail: "full"` under ruleset v1 and frozen byte for byte as canonical JSON in
 * `tests/golden/v1/<name>.json` (`pnpm golden:update -- --yes` writes them, with an ADR;
 * `pnpm test:golden` compares them).
 *
 * Fields (a) and (d) are plain `EntryInput` data frozen here (stats, letters, frames, parts,
 * quirks, skills, durability) with `freezeEntry`; fields (b) and (c) are `generateField`'s output
 * around a hand-built player, so a change of `generateField` or of `FIELD` moves g04-g09 and
 * `pnpm test:golden` catches it (24.3). A golden race never holds `rule: "none"` or a disabled
 * skill (ADR-0003 D42, D49).
 *
 * - (a) `generic`: 8 different generic frames, every stat 600, letters B, 4 actives each. Each
 *   course leaves out a different pair of the 10 generic frames (never both of one manufacturer),
 *   so every field holds the 5 manufacturer rules and the 4 styles, and every frame races twice
 *   or three times.
 * - (b) `turn-24` and (c) `turn-46`: `generateField` (21.1) at that turn around a Falconess on her
 *   signature frame (sprint: Caracara, ridge: Peregrina, canyon: Cernícala; each one's turn-24
 *   goal course), with the scenario's seed as `raceSeed`: 7 rivals of her frame's PW class, her
 *   lane drawn by the field. The player is fixed data: stats at par on the v1 rival curve
 *   (`5 × (95 + 9 t)` split by her frame style's v1 weights, no draws), her own letters, unique
 *   skill and learned actives, parts, mood and, at turn 46, a worn frame.
 * - (d) `edge`: Boneyard frames with lucky-bolt, stutter, hot-head, glider-tape and mud-runner; an
 *   Intelligence-100 runner; a Stamina-150 runner (exhaustion); a Steinhaus frame driven into its
 *   overheat licence (low courage, low dissipation, big tank); a pulse frame at mood −2; worn
 *   frames (a mule at 90, a horizon at 8 that breaks on the canyon's water) and a frame that starts
 *   broken (durability 0).
 *
 * A forced `jumpFail` (24.3 (d)) cannot be built from v1 content: the smallest tank `freezeEntry`
 * can make is 40 energy (étoile or sylphe, 60 − 2 × patched-tank), exactly the need of the ridge's
 * 20-lift jump at technique 1 (`liftF` 500 ‰), so the jump reserve (14.4) always lets it lift.
 */

/** A golden race: `name` is the file stem under `tests/golden/v1/`. */
export type GoldenScenario = {
  readonly name: string;
  readonly courseId: Slug;
  readonly seed: string;
  readonly field: "generic" | "turn-24" | "turn-46" | "edge" | "duel";
  /** One line for test names and the generator's output. */
  readonly summary: string;
  /** The frozen field on `course` in lane order (`laneIndex` = index); `seed` is the race seed. */
  readonly entries: (content: ContentIndex, course: Course, seed: string) => RaceEntry[];
};

/** A field builder of `GoldenScenario.entries`. */
type FieldBuilder = GoldenScenario["entries"];

/** Freeze hand-built `EntryInput` data on the course, lane = index. */
function byLane(inputs: (content: ContentIndex) => EntryInput[]): FieldBuilder {
  return (content, course) =>
    inputs(content).map((input, lane) => freezeEntry(RULESET_V1, content, input, course, lane));
}

/** [agility, stamina, technique, courage, intelligence] */
type Stats5 = readonly [number, number, number, number, number];

const STYLE_B: StyleAptitudes = { dive: "B", hover: "B", glide: "B", ground: "B" };
const S600: Stats5 = [600, 600, 600, 600, 600];

function stats([agility, stamina, technique, courage, intelligence]: Stats5): FalconessStats {
  return { agility, stamina, technique, courage, intelligence };
}

type RunnerOpts = {
  readonly stats?: Stats5;
  readonly skills?: readonly Slug[];
  readonly parts?: readonly Slug[];
  readonly quirks?: readonly Slug[];
  readonly mood?: Mood;
  readonly durability?: number | null;
  readonly styleAptitude?: StyleAptitudes;
};

function rival(runnerId: string, frameId: Slug, o: RunnerOpts = {}): EntryInput {
  return {
    runnerId,
    kind: "rival",
    falconessId: null,
    baseStats: stats(o.stats ?? S600),
    mood: o.mood ?? 0,
    styleAptitude: { ...(o.styleAptitude ?? STYLE_B) },
    frameId,
    parts: [...(o.parts ?? [])],
    quirks: [...(o.quirks ?? [])],
    learnedSkills: [...(o.skills ?? [])],
    durability: o.durability ?? null,
  };
}

/** (a) eight generic frames, every stat 600, letters B; runner ids follow the lanes. */
function genericField(rows: readonly (readonly [Slug, readonly Slug[]])[]): FieldBuilder {
  return byLane(() =>
    rows.map(([frameId, skills], lane) => rival(`rival-${lane + 1}`, frameId, { skills })),
  );
}

/**
 * The v1 rival weights (‰ of a total per stat, FIELD.rivalWeights at the time the goldens were
 * frozen), for the player's par stats only: copied so a balance change of FIELD moves the rivals
 * of `generateField` (which the goldens must catch) but never the hand-built player.
 */
const WEIGHTS: Record<Style, Stats5> = {
  glide: [240, 210, 170, 180, 200],
  dive: [250, 180, 170, 220, 180],
  hover: [220, 200, 170, 170, 240],
  ground: [200, 230, 220, 190, 160],
};

/** Par stats on the v1 rival curve: `fl(5 × (95 + 9 t) × 1000 × w, 10^6)`, clamped to [1, 1200]. */
function parStats(turn: number, style: Style): Stats5 {
  const total = 5 * (95 + 9 * turn) * 1000;
  const w = WEIGHTS[style];
  const at = (k: number) => clamp(floorDiv(total * (w[k] ?? 0), 1_000_000), 1, 1200);
  return [at(0), at(1), at(2), at(3), at(4)];
}

type FalconessSetup = {
  readonly id: Slug;
  readonly frameId: Slug;
  readonly skills: { readonly 24: readonly Slug[]; readonly 46: readonly Slug[] };
  readonly parts: { readonly 24: readonly Slug[]; readonly 46: readonly Slug[] };
  /** Season durability carried into the race (null = full). */
  readonly durability: { readonly 24: number | null; readonly 46: number | null };
  readonly mood: { readonly 24: Mood; readonly 46: Mood };
};

const CARACARA: FalconessSetup = {
  id: "caracara",
  frameId: "caracara-signature",
  skills: {
    24: ["clean-start", "corner-carver", "scavenger-stride"],
    46: ["clean-start", "corner-carver", "last-gasp", "pack-shadow", "scavenger-stride"],
  },
  parts: { 24: [], 46: ["boneyard-battery"] },
  durability: { 24: null, 46: 120 },
  mood: { 24: 1, 46: 0 },
};

const PEREGRINA: FalconessSetup = {
  id: "peregrina",
  frameId: "peregrina-signature",
  skills: {
    24: ["gravity-friend", "last-gasp", "stoop-strike"],
    46: ["clean-start", "gravity-friend", "iron-wings", "last-gasp", "stoop-strike"],
  },
  parts: { 24: [], 46: ["koryu-firmware"] },
  durability: { 24: null, 46: 70 },
  mood: { 24: 0, 46: 2 },
};

const CERNICALA: FalconessSetup = {
  id: "cernicala",
  frameId: "cernicala-signature",
  skills: {
    24: ["canyon-sense", "hill-lungs", "wind-hover"],
    46: ["canyon-sense", "cool-head", "hill-lungs", "water-skimmer", "wind-hover"],
  },
  parts: { 24: ["altair-battery"], 46: ["altair-battery", "altair-firmware"] },
  durability: { 24: null, 46: 60 },
  mood: { 24: -1, 46: 1 },
};

/** The Falconess of (b), (c): at par on her signature frame, with her setup at that turn. */
function goalPlayer(content: ContentIndex, f: FalconessSetup, turn: 24 | 46): EntryInput {
  const falconess = content.getFalconess(f.id);
  return {
    runnerId: PLAYER_RUNNER_ID,
    kind: "player",
    falconessId: f.id,
    baseStats: stats(parStats(turn, content.getFrame(f.frameId).style)),
    mood: f.mood[turn],
    styleAptitude: { ...falconess.styleAptitude },
    frameId: f.frameId,
    parts: [...f.parts[turn]],
    quirks: [],
    learnedSkills: [...f.skills[turn]],
    durability: f.durability[turn],
  };
}

/** (b), (c): `generateField` at `turn` around the Falconess, `raceSeed` = the scenario's seed. */
function goalField(f: FalconessSetup, turn: 24 | 46): FieldBuilder {
  return (content, course, seed) =>
    generateField(RULESET_V1, content, {
      course,
      turn,
      raceSeed: seed,
      player: goalPlayer(content, f, turn),
    });
}

/** (d) the edge field, the same eight runners on every course. */
function edgeField(): EntryInput[] {
  return [
    rival("rival-1", "kite", {
      quirks: ["glider-tape", "lucky-bolt"],
      skills: ["clean-start", "iron-wings", "last-gasp", "pack-shadow"],
    }),
    rival("rival-2", "mule", {
      quirks: ["hot-head", "mud-runner"],
      skills: ["clean-start", "second-wind"],
      durability: 90,
    }),
    rival("rival-3", "horizon", {
      stats: [600, 600, 600, 600, 100],
      skills: ["corner-carver", "hill-lungs", "lead-guard"],
      durability: 8,
    }),
    rival("rival-4", "sylphe", {
      stats: [600, 150, 600, 600, 600],
      skills: ["last-gasp", "second-wind"],
    }),
    rival("rival-5", "falke", {
      stats: [600, 600, 600, 150, 600],
      parts: ["boneyard-battery", "steinhaus-turbine"],
      skills: ["last-gasp"],
    }),
    rival("rival-6", "shiden", { mood: -2 }),
    rival("rival-7", "mule", {
      quirks: ["lucky-bolt", "stutter"],
      skills: ["canyon-sense", "corner-carver", "gravity-friend"],
    }),
    rival("rival-8", "nimbus", { mood: 2, durability: 0, skills: ["cool-head"] }),
  ];
}

const GENERIC_SPRINT = genericField([
  ["falke", ["clean-start", "cool-head", "corner-carver", "last-gasp"]],
  ["erzherzog", ["clean-start", "corner-carver", "pack-shadow", "second-wind"]],
  ["etoile", ["cool-head", "corner-carver", "last-gasp", "lead-guard"]],
  ["kite", ["clean-start", "iron-wings", "last-gasp", "pack-shadow"]],
  ["horizon", ["corner-carver", "lead-guard", "pack-shadow", "second-wind"]],
  ["nimbus", ["clean-start", "cool-head", "corner-carver", "second-wind"]],
  ["shiden", ["corner-carver", "last-gasp", "lead-guard", "pack-shadow"]],
  ["sylphe", ["clean-start", "cool-head", "iron-wings", "last-gasp"]],
]);

const GENERIC_RIDGE = genericField([
  ["kite", ["clean-start", "gravity-friend", "iron-wings", "pack-shadow"]],
  ["shiden", ["clean-start", "cool-head", "gravity-friend", "iron-wings"]],
  ["erzherzog", ["clean-start", "gravity-friend", "last-gasp", "pack-shadow"]],
  ["sylphe", ["gravity-friend", "last-gasp", "pack-shadow", "second-wind"]],
  ["mule", ["cool-head", "last-gasp", "lead-guard", "pack-shadow"]],
  ["falke", ["gravity-friend", "iron-wings", "lead-guard", "second-wind"]],
  ["nimbus", ["gravity-friend", "last-gasp", "lead-guard", "second-wind"]],
  ["hayate", ["cool-head", "gravity-friend", "last-gasp", "second-wind"]],
]);

const GENERIC_CANYON = genericField([
  ["nimbus", ["cool-head", "hill-lungs", "pack-shadow", "second-wind"]],
  ["etoile", ["canyon-sense", "cool-head", "hill-lungs", "last-gasp"]],
  ["mule", ["canyon-sense", "clean-start", "hill-lungs", "last-gasp"]],
  ["horizon", ["clean-start", "hill-lungs", "lead-guard", "water-skimmer"]],
  ["shiden", ["canyon-sense", "last-gasp", "lead-guard", "water-skimmer"]],
  ["kite", ["canyon-sense", "iron-wings", "second-wind", "water-skimmer"]],
  ["sylphe", ["canyon-sense", "cool-head", "hill-lungs", "iron-wings"]],
  ["erzherzog", ["canyon-sense", "hill-lungs", "pack-shadow", "water-skimmer"]],
]);

const SUMMARY: Record<GoldenScenario["field"], string> = {
  generic: "(a) 8 generic frames, every stat 600, letters B, 4 actives each",
  "turn-24": "(b) generateField at turn 24 around a Falconess on her signature frame",
  "turn-46": "(c) generateField at turn 46 around a Falconess on her signature frame",
  edge: "(d) quirks, I 100, St 150, Steinhaus licence, pulse frame, worn and broken frames",
  duel: "a 2-runner race (the S3 shape)",
};

function scenario(
  name: string,
  courseId: Slug,
  field: GoldenScenario["field"],
  entries: GoldenScenario["entries"],
): GoldenScenario {
  return { name, courseId, seed: `golden-v1/${name}`, field, summary: SUMMARY[field], entries };
}

/** The twelve golden races of 24.3, in file order. */
export const GOLDEN_SCENARIOS: readonly GoldenScenario[] = [
  scenario("g01-sprint-generic", "sprint", "generic", GENERIC_SPRINT),
  scenario("g02-ridge-generic", "ridge", "generic", GENERIC_RIDGE),
  scenario("g03-canyon-generic", "canyon", "generic", GENERIC_CANYON),
  scenario("g04-sprint-caracara-t24", "sprint", "turn-24", goalField(CARACARA, 24)),
  scenario("g05-ridge-peregrina-t24", "ridge", "turn-24", goalField(PEREGRINA, 24)),
  scenario("g06-canyon-cernicala-t24", "canyon", "turn-24", goalField(CERNICALA, 24)),
  scenario("g07-sprint-caracara-t46", "sprint", "turn-46", goalField(CARACARA, 46)),
  scenario("g08-ridge-peregrina-t46", "ridge", "turn-46", goalField(PEREGRINA, 46)),
  scenario("g09-canyon-cernicala-t46", "canyon", "turn-46", goalField(CERNICALA, 46)),
  scenario("g10-sprint-edge", "sprint", "edge", byLane(edgeField)),
  scenario("g11-ridge-edge", "ridge", "edge", byLane(edgeField)),
  scenario("g12-canyon-edge", "canyon", "edge", byLane(edgeField)),
];

/**
 * Extra races of the determinism test only (never golden files): Peregrina's turn-46 build
 * against the first rival of her generated field, a 2-runner race like every S3 race of the batch.
 */
export const DETERMINISM_EXTRAS: readonly GoldenScenario[] = [
  scenario("x01-ridge-duel", "ridge", "duel", (content, course, seed) => {
    const field = goalField(PEREGRINA, 46)(content, course, seed);
    const player = field.find((e) => e.kind === "player");
    const rival = field.find((e) => e.kind === "rival");
    if (player === undefined || rival === undefined) throw new Error("x01: no duel in the field");
    return [
      { ...rival, laneIndex: 0 },
      { ...player, laneIndex: 1 },
    ];
  }),
];

/** Freeze a scenario's field on its course (lane = index). */
export function goldenEntries(content: ContentIndex, s: GoldenScenario): RaceEntry[] {
  return s.entries(content, content.getCourse(s.courseId), s.seed);
}

/** Run a scenario under ruleset v1 with `detail: "full"`. */
export function runGoldenScenario(content: ContentIndex, s: GoldenScenario): RaceLog {
  const course = content.getCourse(s.courseId);
  return simulateRace(RULESET_V1, goldenEntries(content, s), course, s.seed, { detail: "full" });
}

/**
 * Canonical JSON: object keys in plain string order (`compareIds`), no whitespace, `undefined`
 * properties dropped and `undefined` array items written as `null` (as `JSON.stringify` does).
 * Throws on a non-finite number, which a race log never holds (P8).
 */
export function canonicalJson(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "number":
      if (!Number.isFinite(value)) throw new Error(`canonicalJson: non-finite number ${value}`);
      return JSON.stringify(value);
    case "string":
    case "boolean":
      return JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) {
        const items: unknown[] = value;
        return `[${items.map((v) => (v === undefined ? "null" : canonicalJson(v))).join(",")}]`;
      }
      const fields: [string, unknown][] = Object.entries(value);
      return `{${fields
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => compareIds(a, b))
        .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`)
        .join(",")}}`;
    }
    default:
      throw new Error(`canonicalJson: cannot encode a ${typeof value}`);
  }
}

/**
 * A short hint at where two canonical JSON texts first differ: the JSON path and both values when
 * both parse, else the byte offset with some context. `null` when they are equal.
 */
export function goldenDiffHint(expected: string, actual: string): string | null {
  if (expected === actual) return null;
  let parsed: [unknown, unknown] | null = null;
  try {
    parsed = [JSON.parse(expected), JSON.parse(actual)];
  } catch {
    parsed = null;
  }
  const where = parsed === null ? null : firstDifference(parsed[0], parsed[1], "$");
  let i = 0;
  while (i < expected.length && i < actual.length && expected[i] === actual[i]) i += 1;
  const around = (s: string) => JSON.stringify(s.slice(Math.max(0, i - 30), i + 30));
  const sizes = `${expected.length} → ${actual.length} bytes`;
  const head = `first difference at byte ${i} (${sizes})`;
  return where === null
    ? `${head}: expected …${around(expected)}…, got …${around(actual)}…`
    : `${head}: ${where}`;
}

function show(v: unknown): string {
  const s = v === undefined ? "(missing)" : JSON.stringify(v);
  return s.length > 60 ? `${s.slice(0, 57)}...` : s;
}

function firstDifference(a: unknown, b: unknown, path: string): string | null {
  if (Object.is(a, b)) return null;
  if (Array.isArray(a) && Array.isArray(b)) {
    const xs: unknown[] = a;
    const ys: unknown[] = b;
    for (let k = 0; k < Math.min(xs.length, ys.length); k++) {
      const d = firstDifference(xs[k], ys[k], `${path}[${k}]`);
      if (d !== null) return d;
    }
    return xs.length === ys.length ? null : `${path}: length ${xs.length} → ${ys.length}`;
  }
  if (
    typeof a === "object" &&
    a !== null &&
    typeof b === "object" &&
    b !== null &&
    !Array.isArray(a) &&
    !Array.isArray(b)
  ) {
    const ea = new Map<string, unknown>(Object.entries(a));
    const eb = new Map<string, unknown>(Object.entries(b));
    const keys = [...new Set([...ea.keys(), ...eb.keys()])].sort(compareIds);
    for (const k of keys) {
      const d = firstDifference(ea.get(k), eb.get(k), `${path}.${k}`);
      if (d !== null) return d;
    }
    return null;
  }
  return `${path}: ${show(a)} → ${show(b)}`;
}
