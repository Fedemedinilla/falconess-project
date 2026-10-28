/**
 * Browser storage is a convenience, never a requirement: it can be missing or throw (private
 * windows, blocked site data, sandboxed frames), so every access is guarded and the app works
 * without it. A run that must survive is copied out with "Copiar partida".
 */

/** The part of `Storage` the app uses; tests pass a plain object. */
export type KeyValueStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export const RUN_KEY = "falconess.pruebas.partida";
export const THEME_KEY = "falconess.pruebas.tema";
/** "brief" or "full": how much the cards explain by default (app/explain.ts). */
export const EXPLAIN_KEY = "falconess.pruebas.explicaciones";
/**
 * The run whose last week the player has already read in «Lo que pasó» (`runFingerprint`), so a
 * reload does not show it again. Kept apart from the run: the save format stays seed + inputs.
 */
export const SEEN_KEY = "falconess.pruebas.vista";

/** `localStorage` when the browser lets the page use it, else undefined. */
export function browserStore(): KeyValueStore | undefined {
  try {
    const store = globalThis.localStorage;
    if (!store) return undefined;
    const probe = "falconess.pruebas.sonda";
    store.setItem(probe, "1");
    store.removeItem(probe);
    return store;
  } catch {
    return undefined;
  }
}

export function readKey(store: KeyValueStore | undefined, key: string): string | undefined {
  if (!store) return undefined;
  try {
    return store.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

/** True when the value was stored. */
export function writeKey(store: KeyValueStore | undefined, key: string, value: string): boolean {
  if (!store) return false;
  try {
    store.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeKey(store: KeyValueStore | undefined, key: string): void {
  if (!store) return;
  try {
    store.removeItem(key);
  } catch {
    // nothing to do: the key stays, and the next write replaces it
  }
}
