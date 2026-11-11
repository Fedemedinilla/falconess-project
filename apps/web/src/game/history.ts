import { Difficulty, Grade, SeasonEndReason } from "@falconess/schema";
import { z } from "zod";
import { parseSavedRun, SAVE_SCHEMA_VERSION, type SavedRun, serializeRun } from "./run";
import { type KeyValueStore, readKey, writeKey } from "./storage";

/**
 * This browser's seasons (owner 2026-11-11: «exportar temporadas anteriores»): every run played
 * here, finished or not, newest first, one entry per seed, at most `MAX_SEASONS`. Each entry keeps
 * the save itself (seed + inputs, what «Exportar» hands out) and a few facts for the list. The
 * controller updates the entry of the run in play after every step, so starting a new season
 * never loses the old one. Anything stored that does not read back is dropped.
 */
export const HISTORY_KEY = "falconess.juego.temporadas";
export const MAX_SEASONS = 30;

const Entry = z.strictObject({
  seed: z.string().min(1),
  falconessId: z.string().min(1),
  difficulty: Difficulty,
  turn: z.number().int(),
  status: z.enum(["active", "ended"]),
  endReason: SeasonEndReason.optional(),
  grade: Grade.optional(),
  /** When it was last played, ISO 8601 (this browser's clock). */
  updatedAt: z.string(),
  /** The save, as `serializeRun` writes it. */
  save: z.string(),
});
export type SeasonEntry = z.infer<typeof Entry>;

export function readHistory(store: KeyValueStore | undefined): SeasonEntry[] {
  const raw = readKey(store, HISTORY_KEY);
  if (raw === undefined) return [];
  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  const out: SeasonEntry[] = [];
  for (const item of list) {
    const parsed = Entry.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/** Keep `entry` first, replacing the entry of the same seed. True when stored. */
export function putHistory(store: KeyValueStore | undefined, entry: SeasonEntry): boolean {
  const rest = readHistory(store).filter((e) => e.seed !== entry.seed);
  return writeKey(store, HISTORY_KEY, JSON.stringify([entry, ...rest].slice(0, MAX_SEASONS)));
}

/** The entry's save, read back (undefined if it no longer parses). */
export function entrySave(entry: SeasonEntry): SavedRun | undefined {
  const parsed = parseSavedRun(entry.save, "v1");
  return parsed.ok && parsed.run.schemaVersion === SAVE_SCHEMA_VERSION ? parsed.run : undefined;
}

/** A file name for an exported season: `falconess-peregrina-s48-265138.json`. */
export function exportFileName(entry: Pick<SeasonEntry, "falconessId" | "turn" | "seed">): string {
  const seed = entry.seed.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 16) || "temporada";
  return `falconess-${entry.falconessId}-s${entry.turn}-${seed}.json`;
}

export { serializeRun };
