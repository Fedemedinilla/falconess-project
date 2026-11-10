import { useSyncExternalStore } from "react";

/** Below this width the screens use their phone layout (the CSS breakpoint of the same name). */
export const NARROW_QUERY = "(max-width: 40rem)";

export function mediaList(query: string): MediaQueryList | undefined {
  return typeof window === "undefined" || typeof window.matchMedia !== "function"
    ? undefined
    : window.matchMedia(query);
}

/**
 * Whether a media query matches, kept up to date. For layouts that change what is rendered (a
 * table becomes a list, details fold away), where CSS alone would duplicate ids.
 */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = mediaList(query);
      if (!list) return () => undefined;
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => mediaList(query)?.matches ?? false,
    () => false,
  );
}

/** The phone layout (`NARROW_QUERY`). */
export function useNarrow(): boolean {
  return useMedia(NARROW_QUERY);
}

/** Smooth scrolling unless the viewer asked for reduced motion. */
export function scrollBehavior(): ScrollBehavior {
  return mediaList("(prefers-reduced-motion: reduce)")?.matches ? "auto" : "smooth";
}
