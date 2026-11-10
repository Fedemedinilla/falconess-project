import { FIELD_LIMITS } from "@falconess/race-view";
import { POSITIONS, type Position } from "@falconess/schema";
import { parseArgs } from "../args.js";

export const RACE_USAGE = `pnpm sim:race -- --seed <s> --course <courseId> [field] [--ruleset v1|v2|v3] [--detail full|results] [--json]

--ruleset   the race rules (default: the current ruleset, v3 with flight, ADR-0011); on v3
            --course also takes the catalogue tracks (steps, overlook, breakaway, circuit,
            open-sky, crossing) and the text view adds the VUELO block

field (one of):
  --falconess <id> [--frame <frameId>] [--parts a,b] [--skills x,y] [--stats <n>] [--turn <t>]
      [--position lead|pack|stalk|closer]
      the player plus class-matched rivals on generic frames of her PW class (default: peregrina
      on her signature frame, base stats, turn 1; --stats gives every stat the same value; the
      rivals' level follows --turn: 95 + 9 × turn per stat; generateField, docs/race-engine.md 21.1);
      --position is her race position (Punta, Pelotón, Acecho, Remate; default: the one of her
      wings' style, ADR-0008); the rivals run in the position of their wings
  --entries <file.json>
      a JSON array of 1..8 EntryInput objects (docs/race-engine.md 3.1), lane = array index
  --neutral [--stats <n>]
      eight neutral fixtures (rule "none"), two per style, every stat <n> (default 600)

--detail results  runs without frames and events (classification and ledger only)
--json            prints the RaceLog as JSON instead of the text view`;

export class RaceArgsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RaceArgsError";
  }
}

export type FieldRequest =
  | {
      kind: "player";
      falconessId: string;
      frameId: string | null;
      parts: string[];
      skills: string[];
      /** Uniform value for every stat; null = the Falconess's base stats. */
      stats: number | null;
      turn: number;
      /** Her race position; null = the default of her frame's style (ADR-0008). */
      position: Position | null;
    }
  | { kind: "entries"; file: string }
  | { kind: "neutral"; stats: number };

export type RaceCliOptions = {
  help: boolean;
  seed: string;
  courseId: string;
  detail: "full" | "results";
  json: boolean;
  field: FieldRequest;
  /** `--ruleset`; null = the current ruleset. */
  ruleset: string | null;
};

const VALUE_KEYS = [
  "seed",
  "course",
  "falconess",
  "frame",
  "parts",
  "skills",
  "stats",
  "turn",
  "position",
  "entries",
  "detail",
  "ruleset",
] as const;
const FLAG_KEYS = ["json", "neutral", "help"] as const;
const PLAYER_KEYS = ["falconess", "frame", "parts", "skills", "turn", "position"] as const;
// `pnpm sim:race -- --seed 1` may pass the bare `--` through; parseArgs records it as key "".
const KNOWN = new Set<string>(["", ...VALUE_KEYS, ...FLAG_KEYS]);

const MAX_STAT = FIELD_LIMITS.maxStat;
const MAX_TURN = FIELD_LIMITS.maxTurn;

function intInRange(raw: string, key: string, min: number, max: number): number {
  if (!/^\d+$/.test(raw)) throw new RaceArgsError(`--${key} expects an integer, got "${raw}"`);
  const n = Number.parseInt(raw, 10);
  if (n < min || n > max) throw new RaceArgsError(`--${key} must be in ${min}..${max}, got ${n}`);
  return n;
}

function list(raw: string | undefined): string[] {
  return raw === undefined
    ? []
    : raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}

/** `--position`: one of `POSITIONS` (ADR-0008). */
function position(raw: string): Position {
  const p = POSITIONS.find((x) => x === raw);
  if (p === undefined)
    throw new RaceArgsError(`--position must be one of ${POSITIONS.join(", ")}, got "${raw}"`);
  return p;
}

/** Parses `pnpm sim:race` arguments; throws RaceArgsError with a message for the user. */
export function parseRaceArgs(argv: readonly string[]): RaceCliOptions {
  const args = parseArgs(argv);
  for (const key of Object.keys(args))
    if (!KNOWN.has(key)) throw new RaceArgsError(`unknown option --${key}\n\n${RACE_USAGE}`);

  const value = (key: (typeof VALUE_KEYS)[number]): string | undefined => {
    const v = args[key];
    if (v === true) throw new RaceArgsError(`--${key} needs a value`);
    return v;
  };
  const flag = (key: (typeof FLAG_KEYS)[number]): boolean => {
    const v = args[key];
    if (typeof v === "string") throw new RaceArgsError(`--${key} takes no value, got "${v}"`);
    return v === true;
  };

  const detail = value("detail") ?? "full";
  if (detail !== "full" && detail !== "results")
    throw new RaceArgsError(`--detail must be "full" or "results", got "${detail}"`);

  const statsRaw = value("stats");
  const stats = statsRaw === undefined ? null : intInRange(statsRaw, "stats", 1, MAX_STAT);
  const entriesFile = value("entries");
  const neutral = flag("neutral");
  const playerKeys = PLAYER_KEYS.filter((k) => args[k] !== undefined);

  let field: FieldRequest;
  if (entriesFile !== undefined) {
    const extra = [
      ...playerKeys,
      ...(neutral ? ["neutral"] : []),
      ...(stats !== null ? ["stats"] : []),
    ];
    if (extra.length > 0)
      throw new RaceArgsError(`--entries cannot be combined with --${extra.join(", --")}`);
    field = { kind: "entries", file: entriesFile };
  } else if (neutral) {
    if (playerKeys.length > 0)
      throw new RaceArgsError(`--neutral cannot be combined with --${playerKeys.join(", --")}`);
    field = { kind: "neutral", stats: stats ?? FIELD_LIMITS.neutralStats };
  } else {
    const turnRaw = value("turn");
    const positionRaw = value("position");
    field = {
      kind: "player",
      falconessId: value("falconess") ?? "peregrina",
      frameId: value("frame") ?? null,
      parts: list(value("parts")),
      skills: list(value("skills")),
      stats,
      turn: turnRaw === undefined ? 1 : intInRange(turnRaw, "turn", 0, MAX_TURN),
      position: positionRaw === undefined ? null : position(positionRaw),
    };
  }

  return {
    help: flag("help"),
    seed: value("seed") ?? "42",
    courseId: value("course") ?? "sprint",
    detail,
    json: flag("json"),
    field,
    ruleset: value("ruleset") ?? null,
  };
}
