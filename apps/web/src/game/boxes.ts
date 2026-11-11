import { BlackBox } from "@falconess/schema";
import { browserStore, type KeyValueStore, readKey, writeKey } from "./storage";

/**
 * The black boxes this browser's seasons left (ADR-0013): the newest first, at most `MAX_BOXES`,
 * one per box id. A finished season adds its own; the character select offers them as parents.
 * Anything stored that is not a valid box is dropped on read.
 */
export const BOXES_KEY = "falconess.juego.cajas";
export const MAX_BOXES = 20;

export function readBoxes(store: KeyValueStore | undefined = browserStore()): BlackBox[] {
  const raw = readKey(store, BOXES_KEY);
  if (raw === undefined) return [];
  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  const out: BlackBox[] = [];
  for (const item of list) {
    const parsed = BlackBox.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

/** Keep `box` (newest first); a box already kept stays where it was. True when stored. */
export function addBox(box: BlackBox, store: KeyValueStore | undefined = browserStore()): boolean {
  const boxes = readBoxes(store);
  if (boxes.some((b) => b.id === box.id)) return true;
  return writeKey(store, BOXES_KEY, JSON.stringify([box, ...boxes].slice(0, MAX_BOXES)));
}
