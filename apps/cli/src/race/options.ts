import { parseArgs } from "../args.js";

export const RACE_USAGE = `pnpm sim:race -- --seed <s> --course <courseId> [field] [--detail full|results] [--json]

field (one of):
  --falconess <id> [--frame <frameId>] [--parts a,b] [--skills x,y] [--stats <n>] [--turn <t>]
      the player plus class-matched rivals on generic frames of her PW class (default: peregrina
      on her signature frame, base stats, turn 1; --stats gives every stat the same value; the
      rivals' level follows --turn: 95 + 9 × turn per stat; generateField, docs/race-engine.md 21.1)
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
  "entries",
  "detail",
] as const;
const FLAG_KEYS = ["json", "neutral", "help"] as const;
const PLAYER_KEYS = ["falconess", "frame", "parts", "skills", "turn"] as const;
// `pnpm sim:race -- --seed 1` may pass the bare `--` through; parseArgs records it as key "".
const KNOWN = new Set<string>(["", ...VALUE_KEYS, ...FLAG_KEYS]);

const MAX_STAT = 1200;
const MAX_TURN = 48;

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
    field = { kind: "neutral", stats: stats ?? 600 };
  } else {
    const turnRaw = value("turn");
    field = {
      kind: "player",
      falconessId: value("falconess") ?? "peregrina",
      frameId: value("frame") ?? null,
      parts: list(value("parts")),
      skills: list(value("skills")),
      stats,
      turn: turnRaw === undefined ? 1 : intInRange(turnRaw, "turn", 0, MAX_TURN),
    };
  }

  return {
    help: flag("help"),
    seed: value("seed") ?? "42",
    courseId: value("course") ?? "desert-sprint",
    detail,
    json: flag("json"),
    field,
  };
}
