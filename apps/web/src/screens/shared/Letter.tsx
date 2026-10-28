import type { Aptitude } from "@falconess/schema";
import { cx } from "../../ui/cx";
import s from "./Letter.module.css";

const TONE: Readonly<Record<Aptitude, string | undefined>> = {
  S: s.top,
  A: s.good,
  B: undefined,
  C: undefined,
  D: s.weak,
  E: s.weak,
  F: s.bad,
  G: s.bad,
};

/** An aptitude letter (S … G) in a square, tinted from strong to weak. */
export function Letter({ letter }: { letter: Aptitude }) {
  return <span className={cx(s.letter, TONE[letter])}>{letter}</span>;
}
