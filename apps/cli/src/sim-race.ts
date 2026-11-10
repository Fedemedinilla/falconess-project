/**
 * `pnpm sim:race -- --seed <s> --course <courseId> [--falconess <id> --frame <frameId>
 *   [--parts a,b] [--skills x,y] [--stats n] [--turn t] | --entries <file.json> | --neutral]
 *   [--detail full|results] [--json]`
 * One race through the engine port, printed from the RaceLog alone: header, classification,
 * timeline, key events and the "why" table (ROADMAP D14, docs/race-engine.md 20.6). Deterministic:
 * the same arguments print the same bytes.
 */
import { readFileSync } from "node:fs";
import { loadCatalogueCourses, loadContent } from "@falconess/content";
import type { Course } from "@falconess/schema";
import { CURRENT_RULESET, flightOf, getRuleset, type SimContext } from "@falconess/sim";
import { createRaceEngine } from "./race/engine-adapter.js";
import type { RaceEnginePort } from "./race/engine-port.js";
import { buildField, type FieldSpec, parseEntryInputs } from "./race/field.js";
import { contentLabels } from "./race/labels.js";
import { type FieldRequest, parseRaceArgs, RACE_USAGE, RaceArgsError } from "./race/options.js";
import { renderRace } from "./race/render-race.js";

export type SimRaceDeps = {
  engine: RaceEnginePort;
  /** The content; `ctx.ruleset` is the default ruleset when `--ruleset` is absent. */
  ctx: SimContext;
  readText(path: string): string;
  /** The v3 catalogue tracks outside the content index (ADR-0011 §6). */
  catalogue?: readonly Course[];
};

function fieldSpec(request: FieldRequest, readText: (path: string) => string): FieldSpec {
  if (request.kind !== "entries") return request;
  let raw: unknown;
  try {
    raw = JSON.parse(readText(request.file));
  } catch (e) {
    throw new RaceArgsError(`${request.file}: ${e instanceof Error ? e.message : String(e)}`);
  }
  return { kind: "entries", inputs: parseEntryInputs(raw, request.file) };
}

/** Everything `pnpm sim:race` prints, as one string. */
export function runSimRace(argv: readonly string[], deps: SimRaceDeps): string {
  const opts = parseRaceArgs(argv);
  if (opts.help) return RACE_USAGE;
  const { content } = deps.ctx;
  let ruleset = deps.ctx.ruleset;
  if (opts.ruleset !== null)
    try {
      ruleset = getRuleset(opts.ruleset);
    } catch (e) {
      throw new RaceArgsError(e instanceof Error ? e.message : String(e));
    }
  const ctx: SimContext = { ruleset, content };
  // the catalogue tracks fly: only a ruleset with flight races them
  const courses = new Map(content.courses);
  if (flightOf(ruleset) !== null) for (const c of deps.catalogue ?? []) courses.set(c.id, c);
  const course = courses.get(opts.courseId);
  if (!course)
    throw new RaceArgsError(
      `unknown course "${opts.courseId}" on ${ruleset.version} (known: ${[...courses.keys()].join(", ")})`,
    );
  const entries = buildField(
    deps.engine,
    ctx,
    course,
    opts.seed,
    fieldSpec(opts.field, deps.readText),
  );
  const log = deps.engine.simulateRace(ruleset, entries, course, opts.seed, {
    detail: opts.detail,
  });
  return opts.json ? JSON.stringify(log) : renderRace(log, contentLabels(content)).join("\n");
}

const isMain = process.argv[1]?.endsWith("sim-race.ts") || process.argv[1]?.endsWith("sim-race.js");
if (isMain) {
  try {
    const output = runSimRace(process.argv.slice(2), {
      engine: createRaceEngine(),
      ctx: { ruleset: CURRENT_RULESET, content: loadContent() },
      readText: (path) => readFileSync(path, "utf8"),
      catalogue: loadCatalogueCourses(),
    });
    console.log(output);
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}
