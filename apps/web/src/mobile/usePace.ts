import { useSyncExternalStore } from "react";
import { getPace, type Pace, subscribePace } from "./pace";

/** «Ritmo», kept up to date: every component that shows it re-renders when it changes. */
export function usePace(): Pace {
  return useSyncExternalStore(subscribePace, getPace, getPace);
}
