import { useEffect, useState } from "react";

/**
 * False on the first render, true from the next animation frame on: what mounts with it waits
 * until the frame that painted its parent (open decision 6 of ADR-0017: «Correr» paints the race
 * screen, then its replay mounts). A hidden tab paints no frame, so it waits until the tab shows.
 */
export function useNextFrame(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const f = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(f);
  }, []);
  return on;
}
