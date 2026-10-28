import { useSyncExternalStore } from "react";
import { browserStore, readKey, THEME_KEY, writeKey } from "../game/storage";

/**
 * Theme: the viewer's system setting until they press the toggle, which sets `data-theme` on
 * <html> (the tokens in styles/tokens.css follow it). The choice is remembered when storage works.
 */
export type Theme = "light" | "dark";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function systemTheme(): Theme {
  return typeof window.matchMedia === "function" && window.matchMedia(DARK_QUERY).matches
    ? "dark"
    : "light";
}

function explicitTheme(): Theme | undefined {
  const value = document.documentElement.getAttribute("data-theme");
  return value === "light" || value === "dark" ? value : undefined;
}

/** The theme on screen now. */
export function effectiveTheme(): Theme {
  return explicitTheme() ?? systemTheme();
}

const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  const media = typeof window.matchMedia === "function" ? window.matchMedia(DARK_QUERY) : undefined;
  media?.addEventListener("change", onChange);
  return () => {
    listeners.delete(onChange);
    media?.removeEventListener("change", onChange);
  };
}

export function setTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
  writeKey(browserStore(), THEME_KEY, theme);
  for (const listener of listeners) listener();
}

/** Apply a remembered choice before the first render. */
export function restoreTheme(): void {
  const saved = readKey(browserStore(), THEME_KEY);
  if (saved === "light" || saved === "dark")
    document.documentElement.setAttribute("data-theme", saved);
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, effectiveTheme, () => "light" as const);
}
