/**
 * Browser storage for the flow's node tests: a plain map, or one that refuses every access (a
 * private window, blocked site data), like `localStorage` can.
 */
import type { KeyValueStore } from "../../../game/storage";

/** A key-value store in memory, its map open to the test. */
export function memoryStore(
  seed: Readonly<Record<string, string>> = {},
): KeyValueStore & { readonly data: Map<string, string> } {
  const data = new Map(Object.entries(seed));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
    removeItem: (k) => {
      data.delete(k);
    },
  };
}

/** A store whose every access throws. */
export function blockedStore(): KeyValueStore {
  const refuse = (): never => {
    throw new Error("SecurityError");
  };
  return { getItem: refuse, setItem: refuse, removeItem: refuse };
}
