import type { ReactNode } from "react";
import { cx } from "./cx";
import s from "./Pill.module.css";

export type PillTone = "neutral" | "accent" | "good" | "warn" | "bad";

export type PillProps = {
  tone?: PillTone;
  /** A filled pill for the one state that needs attention. */
  solid?: boolean;
  title?: string;
  children: ReactNode;
};

/** A state chip: "Lesionada", "Carrera objetivo", "7.º". */
export function Pill({ tone = "neutral", solid = false, title, children }: PillProps) {
  return (
    <span className={cx(s.pill, s[tone], solid && s.solid)} title={title}>
      {children}
    </span>
  );
}
