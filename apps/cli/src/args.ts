import { CURRENT_RULESET, getRuleset, type Ruleset } from "@falconess/sim";

/** Tiny `--key value` / `--flag` parser; no dependency needed. */
export function parseArgs(argv: readonly string[]): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a?.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      out[key] = next;
      i++;
    } else out[key] = true;
  }
  return out;
}

export function argString(
  args: Record<string, string | true>,
  key: string,
  fallback: string,
): string {
  const v = args[key];
  return typeof v === "string" ? v : fallback;
}

/**
 * `--ruleset vN`: the ruleset a new run starts on (ADR-0006 D1). Default `CURRENT_RULESET`; an
 * unknown version throws.
 */
export function argRuleset(
  args: Record<string, string | true>,
  fallback: string = CURRENT_RULESET.version,
): Ruleset {
  return getRuleset(argString(args, "ruleset", fallback));
}
