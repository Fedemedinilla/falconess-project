import type { ContentIndex, Course, RaceEntry, RaceLog, Slug, Style } from "@falconess/schema";
import { RULESET_V3 } from "../rulesets/index.js";
import { simulateRace } from "./engine.js";
import { generateField } from "./field.js";
import { neutralFixtureEntry } from "./fixtures.js";
import { CARACARA, CERNICALA, type FalconessSetup, goalPlayer, PEREGRINA } from "./golden.js";

/**
 * The golden races of ruleset v3 (ADR-0011 §8): each run with `detail: "full"` under ruleset v3
 * and frozen byte for byte as canonical JSON in `tests/golden/v3/<name>.json`
 * (`pnpm golden:update -- --set v3 --yes`, with an ADR; `pnpm test:golden` compares them).
 *
 * - `v3-01` … `v3-09`, one per track of the v3 catalogue: `generateField` (rivals B at every
 *   distance) at turn 46 around a Falconess on her signature frame (her setup of the v1 goldens),
 *   with her distance letters and her own passive (Garra fija's dive for Peregrina). The three
 *   Falconess rotate over the tracks.
 * - `v3-10` … `v3-12`, the equal field of the guardrails (ADR-0010) on the Sprint, the Pista de
 *   saltos and the Travesía: 2 runners per position, every wing, letters B, stats 450-750, so
 *   every position's flight (skims, the stalk's high band, the closer's great dive, the two lines,
 *   the kick on low hp) shows in a log.
 */
export type GoldenV3Scenario = {
  readonly name: string;
  readonly courseId: Slug;
  readonly seed: string;
  readonly summary: string;
  readonly entries: (content: ContentIndex, course: Course, seed: string) => RaceEntry[];
};

const CATALOGUE: readonly Slug[] = [
  "sprint",
  "steps",
  "overlook",
  "ridge",
  "breakaway",
  "circuit",
  "open-sky",
  "canyon",
  "crossing",
];
const SETUPS: readonly FalconessSetup[] = [PEREGRINA, CERNICALA, CARACARA];

function goalFieldV3(f: FalconessSetup) {
  return (content: ContentIndex, course: Course, seed: string): RaceEntry[] => {
    const player = goalPlayer(content, f, 46);
    const letters = content.getFalconess(f.id).distanceAptitude;
    return generateField(RULESET_V3, content, {
      course,
      turn: 46,
      raceSeed: seed,
      player: letters === undefined ? player : { ...player, distanceAptitude: { ...letters } },
    });
  };
}

const WINGS: readonly Style[] = ["dive", "hover", "glide", "ground"];

function equalField(_content: ContentIndex, _course: Course, _seed: string): RaceEntry[] {
  const positions = ["lead", "lead", "pack", "pack", "stalk", "stalk", "closer", "closer"] as const;
  return positions.map((position, lane) => {
    const s = 450 + (lane % 4) * 100;
    const style = WINGS[lane % 4] ?? "glide";
    const e = neutralFixtureEntry({
      runnerId: `rival-${lane + 1}`,
      laneIndex: lane,
      style,
      position,
      stats: { agility: s, stamina: 1200 - s, technique: s, courage: 600, intelligence: 600 },
    });
    return { ...e, distanceAptitude: "B" };
  });
}

/** The twelve v3 golden races, in file order. */
export const GOLDEN_V3_SCENARIOS: readonly GoldenV3Scenario[] = [
  ...CATALOGUE.map((courseId, k) => {
    const f = SETUPS[k % SETUPS.length] ?? PEREGRINA;
    const name = `v3-${String(k + 1).padStart(2, "0")}-${courseId}-${f.id}`;
    return {
      name,
      courseId,
      seed: `golden-v3/${name}`,
      summary: `generateField at turn 46 around ${f.id} on her signature frame`,
      entries: goalFieldV3(f),
    };
  }),
  ...(["sprint", "ridge", "crossing"] as const).map((courseId, k) => {
    const name = `v3-${String(k + 10).padStart(2, "0")}-${courseId}-equal`;
    return {
      name,
      courseId,
      seed: `golden-v3/${name}`,
      summary: "the guardrails' equal field: 2 per position, every wing, letters B",
      entries: equalField,
    };
  }),
];

/** Run a v3 scenario with `detail: "full"`; `courseOf` resolves the catalogue tracks. */
export function runGoldenV3Scenario(
  content: ContentIndex,
  courseOf: (id: Slug) => Course,
  s: GoldenV3Scenario,
): RaceLog {
  const course = courseOf(s.courseId);
  return simulateRace(RULESET_V3, s.entries(content, course, s.seed), course, s.seed, {
    detail: "full",
  });
}
