import type { ContentIndex } from "@falconess/schema";
import { type CSSProperties, useEffect } from "react";
import { gameBrief } from "../text/brief";
import { formatSigned } from "../text/format";
import { gameText, ui } from "../text/ui";
import { cx } from "../ui/cx";
import { Glyph, type GlyphName } from "./Glyph";
import { crewInitials } from "./model";
import { playSound } from "./sfx";
import f from "./WeekFx.module.css";
import type { WeekFx, WeekFxKind } from "./weekFx";

/**
 * Each effect's time on screen (owner 2026-11-13: long enough to read, never a blink); learned
 * skills stay longer the more there are, and the last effect stays more when more happened.
 */
export const FX_MS = 1800;
const PER_SKILL_MS = 450;
export function fxMs(e: WeekFx): number {
  return e.kind === "skills"
    ? FX_MS + PER_SKILL_MS * Math.max(0, (e.skills?.length ?? 1) - 1)
    : FX_MS;
}
export function fxTotalMs(fx: readonly WeekFx[]): number {
  return fx.reduce((t, e) => t + fxMs(e), 0) + 800 + 400 * fx.length;
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
  if (e.kind === "bond")
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
 * The week's effects shown, not told (owner 2026-11-13): one after the other, a stamp like a
 * training's «¡ÉXITO!» with chevrons, gold and rising for good news, blue and falling for bad.
 * A tap ends them; «Lo que pasó» waits for them.
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
  const starts = fx.map((_, i) => fx.slice(0, i).reduce((t, e) => t + fxMs(e), 0));
  const total = fxTotalMs(fx);
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
        const last = i === fx.length - 1;
        return (
          <span
            key={e.kind}
            className={cx(f.fx, e.good ? f.good : f.bad, last && f.last)}
            data-fx={e.kind}
            style={{
              animationDelay: `${at}ms`,
              animationDuration: `${last ? total - at : fxMs(e)}ms`,
            }}
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
