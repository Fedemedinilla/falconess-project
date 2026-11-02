import type { Position } from "@falconess/schema";
import { cx } from "./cx";
import s from "./PositionMark.module.css";

/**
 * The shape of each race position (ADR-0008), front to back: ▲ Punta, ■ Pelotón, ◆ Acecho,
 * ▼ Remate. Drawn, not typed: the four have the same size on every system (as text they come
 * from whatever font has them). Like a concept's emoji (ui/icons.ts) they are presentation: the
 * label next to one always names the position.
 */
const SHAPE: Readonly<Record<Position, string>> = {
  lead: "M8 1.5 L14.5 13.5 H1.5 Z",
  pack: "M2.5 2.5 H13.5 V13.5 H2.5 Z",
  stalk: "M8 1 L15 8 L8 15 L1 8 Z",
  closer: "M1.5 2.5 H14.5 L8 14.5 Z",
};

export type PositionMarkProps = {
  position: Position;
  /** "lg" on the pre-race card; inline text size otherwise. */
  size?: "md" | "lg";
  className?: string | undefined;
};

/** A race position's shape before its name, hidden from assistive technology (the name says it). */
export function PositionMark({ position, size = "md", className }: PositionMarkProps) {
  return (
    <svg
      className={cx(s.mark, size === "lg" && s.lg, className)}
      viewBox="0 0 16 16"
      aria-hidden="true"
      data-position={position}
    >
      <path d={SHAPE[position]} />
    </svg>
  );
}
