/**
 * `pnpm sim:race -- --seed <s> --course <courseId> [--falconess <id> --frame <frameId>
 *   [--parts a,b] [--skills x,y] [--stats n] [--turn t] | --entries <file.json> | --neutral]
 *   [--detail full|results] [--json]`
 * One race through the engine port, printed from the RaceLog alone: header, classification,
 * timeline, key events and the "why" table (ROADMAP D14, docs/race-engine.md 20.6). Deterministic:
 * the same arguments print the same bytes.
 */
import { readFileSync } from "node:fs";
import { loadContent } from "@falconess/content";
import { RULESET_V1, type SimContext } from "@falconess/sim";
import { createRaceEngine } from "./race/engine-adapter.js";
import type { RaceEnginePort } from "./race/engine-port.js";
import { buildField, type FieldSpec, parseEntryInputs } from "./race/field.js";
import { contentLabels } from "./race/labels.js";
import { type FieldRequest, parseRaceArgs, RACE_USAGE, RaceArgsError } from "./race/options.js";
import { renderRace } from "./race/render-race.js";

export type SimRaceDeps = {
  engine: RaceEnginePort;
  ctx: SimContext;
  readText(path: string): string;
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
  const { content, ruleset } = deps.ctx;
  const course = content.courses.get(opts.courseId);
  if (!course)
    throw new RaceArgsError(
      `unknown course "${opts.courseId}" (known: ${[...content.courses.keys()].join(", ")})`,
    );
  const entries = buildField(
    deps.engine,
    deps.ctx,
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
      ctx: { ruleset: RULESET_V1, content: loadContent() },
      readText: (path) => readFileSync(path, "utf8"),
    });
    console.log(output);
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }
}
