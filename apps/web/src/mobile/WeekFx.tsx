import type { ContentIndex } from "@falconess/schema";
import { type CSSProperties, useEffect, useState } from "react";
import { gameBrief } from "../text/brief";
import { formatSigned } from "../text/format";
import { gameText, ui } from "../text/ui";
import { cx } from "../ui/cx";
import { Glyph, type GlyphName } from "./Glyph";
import { crewInitials } from "./model";
import { paceScale } from "./pace";
import { playSound } from "./sfx";
import f from "./WeekFx.module.css";
import type { WeekFx, WeekFxKind } from "./weekFx";

/**
 * Each effect's time on screen (owner 2026-11-13: long enough to read, never a blink); learned
 * skills stay longer the more there are. All the week's effects show together (owner 2026-11-13:
 * one after another took too long), each a moment after the one before.
 */
export const FX_MS = 1800;
const PER_SKILL_MS = 450;
const STAGGER_MS = 160;
export function fxMs(e: WeekFx): number {
  return e.kind === "skills"
    ? FX_MS + PER_SKILL_MS * Math.max(0, (e.skills?.length ?? 1) - 1)
    : FX_MS;
}
export function fxTotalMs(fx: readonly WeekFx[]): number {
  return Math.max(0, ...fx.map((e, i) => STAGGER_MS * i + fxMs(e))) + 500;
}

/** A spot of the screen, in percent of its width and height (the effect's center). */
type Spot = { readonly x: number; readonly y: number };

/**
 * Where each effect shows (owner 2026-11-13): somewhere new each week, never on top of another
 * and well inside the screen. The screen is cut in two columns and three rows; each effect takes
 * a cell of its own at random and moves a little inside it. Learned skills (a wide list) take a
 * whole row, centered.
 */
export function fxSpots(fx: readonly WeekFx[], random: () => number = Math.random): Spot[] {
  const rows = shuffle([30, 50, 70], random);
  const skillsRow = fx.some((e) => e.kind === "skills") ? rows.pop() : undefined;
  const cells = shuffle(
    rows.flatMap((y) => [27, 73].map((x) => ({ x, y }))),
    random,
  );
  const jitter = (n: number) => (random() * 2 - 1) * n;
  return fx.map((e, i) => {
    if (e.kind === "skills") return { x: 50, y: (skillsRow ?? 50) + jitter(4) };
    // more effects than cells (never with today's six kinds): the center
    const c = cells[i % Math.max(1, cells.length)] ?? { x: 50, y: 50 };
    // sideways only a little: two in a row never touch (each is 40 % of the width)
    return { x: c.x + jitter(3), y: c.y + jitter(5) };
  });
}

function shuffle<T>(xs: readonly T[], random: () => number): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const a = out[i] as T;
    out[i] = out[j] as T;
    out[j] = a;
  }
  return out;
}

const GLYPH: Partial<Record<WeekFxKind, GlyphName>> = {
  "mood-up": "heart",
  "mood-down": "heart",
  injury: "cross",
  "sleep-great": "bed",
  "sleep-normal": "bed",
  "sleep-poor": "bed",
};

/** The chevrons over (good) or under (bad) an effect's icon, one after another. */
function Chevrons({ at }: { at: number }) {
  return (
    <span className={f.arrows} aria-hidden="true">
      {[0, 1, 2].map((k) => (
        <svg
          key={k}
          className={f.chev}
          viewBox="0 0 24 12"
          aria-hidden="true"
          style={{ animationDelay: `${at + 200 + k * 140}ms` }}
        >
          <polyline className={f.edge} points="3,10 12,3 21,10" />
          <polyline points="3,10 12,3 21,10" />
        </svg>
      ))}
    </span>
  );
}

/** What sits in the effect's circle: a glyph, the crews' portraits, or the points. */
function Badge({ e, at, content }: { e: WeekFx; at: number; content: ContentIndex }) {
  if (e.kind === "bond" || e.kind === "sync")
    return (
      <span className={f.crews} style={{ animationDelay: `${at}ms` }}>
        {(e.crews ?? []).map((id) => {
          const maker = content.getManufacturer(id);
          return (
            <span
              key={id}
              className={f.crew}
              data-crew={id}
              style={
                { "--bc": maker.palette.primary, "--bc2": maker.palette.secondary } as CSSProperties
              }
            >
              {crewInitials(gameText(maker.textKey))}
            </span>
          );
        })}
        <Chevrons at={at} />
      </span>
    );
  if (e.kind === "points")
    return (
      <span className={f.icon} style={{ animationDelay: `${at}ms` }}>
        <span className={f.amount}>{formatSigned(e.amount ?? 0)}</span>
        <Chevrons at={at} />
      </span>
    );
  return (
    <span className={f.icon} style={{ animationDelay: `${at}ms` }}>
      <Glyph name={GLYPH[e.kind] ?? "check"} size={44} weight={2.4} />
      <Chevrons at={at} />
    </span>
  );
}

/** The skills she learned: compact shining cards, up to five without crowding. */
function Skills({ e, at, content }: { e: WeekFx; at: number; content: ContentIndex }) {
  const ids = e.skills ?? [];
  return (
    <ul className={cx(f.skills, ids.length > 3 && f.skillsMany)}>
      {ids.map((id, k) => {
        const skill = content.getSkill(id);
        return (
          <li
            key={id}
            className={f.skill}
            data-skill={id}
            style={{ animationDelay: `${at + 250 + k * PER_SKILL_MS}ms` }}
          >
            <Glyph name="book" size={20} weight={2.4} />
            <span>
              <b>{gameText(skill.textKey)}</b>
              {gameBrief(skill.textKey) && <small>{gameBrief(skill.textKey)}</small>}
            </span>
            <i className={f.shine} style={{ animationDelay: `${at + 450 + k * PER_SKILL_MS}ms` }} />
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The week's effects shown, not told (owner 2026-11-13): all together, each in a random spot of
 * the screen, a stamp like a training's «¡ÉXITO!» with chevrons, gold and rising for good news,
 * blue and falling for bad. A tap ends them.
 */
export function WeekFxOverlay({
  fx,
  content,
  onDone,
}: {
  fx: readonly WeekFx[];
  content: ContentIndex;
  onDone: () => void;
}) {
  const starts = fx.map((_, i) => STAGGER_MS * i);
  // «Ritmo» (owner 2026-11-14): the effects leave sooner, after they popped in
  const total = Math.max(900, Math.round(fxTotalMs(fx) * paceScale()));
  const [spots] = useState(() => fxSpots(fx));
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per mount (keyed by the step)
  useEffect(() => {
    const timers = fx.map((e, i) =>
      setTimeout(
        () => playSound(e.kind === "skills" ? "boost" : e.good ? "success" : "fail"),
        starts[i],
      ),
    );
    timers.push(setTimeout(onDone, total));
    return () => {
      for (const t of timers) clearTimeout(t);
    };
  }, []);
  const label = (e: WeekFx) =>
    e.kind === "skills"
      ? ui(e.skills && e.skills.length > 1 ? "ui.m.fx.skills.many" : "ui.m.fx.skills", {
          n: e.skills?.length ?? 1,
        })
      : ui(`ui.m.fx.${e.kind}`);
  return (
    <button
      type="button"
      className={f.layer}
      id="m-efectos"
      aria-label={fx.map(label).join(" · ")}
      onClick={onDone}
    >
      {fx.map((e, i) => {
        const at = starts[i] ?? 0;
        const spot = spots[i] ?? { x: 50, y: 50 };
        return (
          <span
            key={e.kind}
            className={cx(f.fx, e.good ? f.good : f.bad, e.kind === "skills" && f.wide)}
            data-fx={e.kind}
            style={
              {
                animationDelay: `${at}ms`,
                animationDuration: `${total - at}ms`,
                "--x": `${spot.x}%`,
                "--y": `${spot.y}%`,
              } as CSSProperties
            }
          >
            {e.kind !== "skills" && <Badge e={e} at={at} content={content} />}
            <span
              className={cx(f.stamp, label(e).length > 14 && f.stampLong)}
              style={{ animationDelay: `${at + 120}ms` }}
            >
              {label(e)}
            </span>
            {e.kind === "skills" && <Skills e={e} at={at} content={content} />}
          </span>
        );
      })}
    </button>
  );
}
