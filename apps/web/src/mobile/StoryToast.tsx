import { useLayoutEffect, useRef, useState } from "react";
import { cx } from "../ui/cx";
import st from "./Story.module.css";

/**
 * The notice after a story scene (owner 2026-11-13): just over the goal's track tab, never over
 * the menu's buttons; without that card on screen, under the top bar.
 */
export function StoryToast({
  children,
  long = false,
}: {
  children: React.ReactNode;
  long?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [spot, setSpot] = useState<React.CSSProperties>({ visibility: "hidden" });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // the notice is fixed: viewport coordinates
    // the track hides in its edge tab (owner 2026-11-14): just over the tab
    const track = document.getElementById("m-pista-tab")?.getBoundingClientRect();
    const height = el.getBoundingClientRect().height;
    const top = track && track.height > 0 ? track.top - height - 10 : 124;
    setSpot({ top: Math.max(8, Math.round(top)) });
  }, []);
  return (
    <div
      ref={ref}
      className={cx(st.toast, long && st.toastLong)}
      id="m-capitulo-aviso"
      role="status"
      style={spot}
    >
      {children}
    </div>
  );
}
