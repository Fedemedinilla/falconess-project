/**
 * The page's language (owner 2026-11-11: Spanish and English, chosen in the menu). Every text
 * comes from `packages/content/text/<lang>.json`; Spanish is the source and the default, and a key
 * English lacks falls back to it. The choice is kept in this browser (when storage works) and the
 * page re-renders in place: the run in play is untouched, it is only words.
 */

export type Lang = "es" | "en";
export const LANGS: readonly Lang[] = ["es", "en"];

const KEY = "falconess.lang";
const LOCALES: Readonly<Record<Lang, string>> = { es: "es-ES", en: "en-US" };

function stored(): Lang {
  try {
    const v = globalThis.localStorage?.getItem(KEY);
    return v === "en" || v === "es" ? v : "es";
  } catch {
    return "es";
  }
}

let current: Lang = stored();
const listeners = new Set<() => void>();

/** The language in use. */
export function lang(): Lang {
  return current;
}

/** Its locale for `Intl` (numbers, lists, dates, plurals, upper case). */
export function locale(): string {
  return LOCALES[current];
}

/** The other language: what the menu's switch offers. */
export function otherLang(l: Lang = current): Lang {
  return l === "es" ? "en" : "es";
}

/** Switch the language: kept for the next visit, and every subscriber re-renders. */
export function setLang(next: Lang): void {
  if (next === current) return;
  current = next;
  try {
    globalThis.localStorage?.setItem(KEY, next);
  } catch {
    // no storage (a sandboxed frame): the choice lasts this visit
  }
  if (typeof document !== "undefined") document.documentElement.lang = next;
  for (const f of listeners) f();
}

/** Call `f` after every switch; returns the unsubscribe. */
export function onLangChange(f: () => void): () => void {
  listeners.add(f);
  return () => {
    listeners.delete(f);
  };
}

/** A value built once per language (an `Intl` formatter, a content index). */
export function perLang<T>(build: (l: Lang) => T): () => T {
  const cache = new Map<Lang, T>();
  return () => {
    let v = cache.get(current);
    if (v === undefined) {
      v = build(current);
      cache.set(current, v);
    }
    return v;
  };
}
