/**
 * The save format of a run (BRIEF section 2, rule 3; ROADMAP D26): seed + RunInput[] with the
 * save's `schemaVersion` and the `rulesetVersion` it was played on. Never a state snapshot: the
 * state comes back by replaying. It is also what "Copiar partida" copies and "Cargar partida"
 * reads, so a tester can paste a run into a message and anyone can replay it exactly.
 *
 * The pieces are the schema's own (`RunInput`, `RulesetVersion`); only the envelope is defined
 * here. It belongs in packages/schema once the owner approves a schema change.
 */
import { RulesetVersion, RunInput } from "@falconess/schema";
import { z } from "zod";

export const SAVE_SCHEMA_VERSION = 1;

const inputsSchema = z
  .array(RunInput)
  .min(1)
  .refine((inputs) => inputs[0]?.kind === "start", "the first input must be `start`");

const SavedRunSchema = z.strictObject({
  schemaVersion: z.literal(SAVE_SCHEMA_VERSION),
  rulesetVersion: RulesetVersion,
  seed: z.string().min(1),
  inputs: inputsSchema,
});
export type SavedRun = z.infer<typeof SavedRunSchema>;

/** `pnpm play` prints `replay: {"seed": ..., "inputs": [...]}` on exit: accepted as well. */
const CliReplaySchema = z.strictObject({ seed: z.string().min(1), inputs: inputsSchema });

export type ParseRunResult =
  | { readonly ok: true; readonly run: SavedRun }
  | { readonly ok: false; readonly error: "json" | "format" | "version"; readonly detail: string };

function issues(error: z.ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((i) => `$${i.path.length > 0 ? `.${i.path.join(".")}` : ""}: ${i.message}`)
    .join("; ");
}

/**
 * Read a pasted or stored run. `currentRuleset` is the version a CLI replay (which carries none)
 * was played on. The ruleset itself is checked by the caller, which knows the rulesets it has.
 */
export function parseSavedRun(text: string, currentRuleset: string): ParseRunResult {
  const trimmed = text.trim().replace(/^replay:\s*/, "");
  let data: unknown;
  try {
    data = JSON.parse(trimmed);
  } catch (e) {
    return { ok: false, error: "json", detail: e instanceof Error ? e.message : String(e) };
  }
  if (typeof data === "object" && data !== null && "schemaVersion" in data) {
    const version: unknown = Reflect.get(data, "schemaVersion");
    if (version !== SAVE_SCHEMA_VERSION)
      return { ok: false, error: "version", detail: `schemaVersion ${String(version)}` };
    const parsed = SavedRunSchema.safeParse(data);
    return parsed.success
      ? { ok: true, run: parsed.data }
      : { ok: false, error: "format", detail: issues(parsed.error) };
  }
  const cli = CliReplaySchema.safeParse(data);
  if (!cli.success) return { ok: false, error: "format", detail: issues(cli.error) };
  return {
    ok: true,
    run: {
      schemaVersion: SAVE_SCHEMA_VERSION,
      rulesetVersion: currentRuleset,
      seed: cli.data.seed,
      inputs: cli.data.inputs,
    },
  };
}

/** One line of JSON, field order fixed: easy to paste into a chat or an issue. */
export function serializeRun(run: SavedRun): string {
  return JSON.stringify({
    schemaVersion: run.schemaVersion,
    rulesetVersion: run.rulesetVersion,
    seed: run.seed,
    inputs: run.inputs,
  });
}
