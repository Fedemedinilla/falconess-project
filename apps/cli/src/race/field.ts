/**
 * The field of `pnpm sim:race`. Building it (player and rivals, frozen entry inputs, neutral
 * fixtures) is shared with the web's free race in `@falconess/race-view`; reading the
 * `--entries` file is the CLI's own.
 */
import { EntryInput } from "@falconess/schema";
import { RaceArgsError } from "./options.js";

export { buildField, type FieldSpec, playerEntryInput } from "@falconess/race-view";

type EntryIssue = NonNullable<ReturnType<typeof EntryInput.safeParse>["error"]>["issues"][number];

/** `f.json[0].parts[1]` from the issue path, under the item's own location. */
function issuePath(where: string, path: readonly PropertyKey[]): string {
  return path.reduce<string>(
    (out, key) => (typeof key === "number" ? `${out}[${key}]` : `${out}.${String(key)}`),
    where,
  );
}

function describeIssue(raw: unknown, where: string, issue: EntryIssue): string {
  if (issue.code === "unrecognized_keys")
    return `${where}: unknown field ${issue.keys.map((k) => `"${k}"`).join(", ")}`;
  const [key] = issue.path;
  if (
    issue.path.length === 1 &&
    typeof key === "string" &&
    typeof raw === "object" &&
    raw !== null &&
    !(key in raw)
  )
    return `${where}: missing field "${key}"`;
  return `${issuePath(where, issue.path)}: ${issue.message}`;
}

/** The `--entries` file: a JSON array of 1..8 `EntryInput` (spec 3.1), lane = array index. */
export function parseEntryInputs(raw: unknown, source: string): EntryInput[] {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 8)
    throw new RaceArgsError(
      `${source}: expected a JSON array of 1..8 EntryInput objects (docs/race-engine.md 3.1)`,
    );
  return raw.map((item: unknown, i) => {
    const where = `${source}[${i}]`;
    const parsed = EntryInput.safeParse(item);
    if (parsed.success) return parsed.data;
    const issue = parsed.error.issues[0];
    throw new RaceArgsError(issue ? describeIssue(item, where, issue) : `${where}: invalid`);
  });
}
