import type { ContentIndex } from "@falconess/schema";
import { type CSSProperties, useEffect, useState } from "react";
import { gameBrief } from "../text/brief";
import { formatSigned } from "../text/format";
import { gameText, ui } from "../text/ui";
import { cx } from "../ui/cx";
import { FX, fxSpots, fxTotalMs } from "./flow/fxTimeline";
import { Glyph, type GlyphName } from "./Glyph";
import { crewInitials } from "./model";
import { paceScale } from "./pace";
import { playSound } from "./sfx";
import f from "./WeekFx.module.css";
import type { WeekFx, WeekFxKind } from "./weekFx";

const GLYPH: Partial<Record<WeekFxKind, GlyphName>> = {
  "mood-up": "heart",
  "mood-down": "heart",
  injury: "cross",
  recovery: "cross",
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
            style={{ animationDelay: `${at + 250 + k * FX.perSkill}ms` }}
          >
            <Glyph name="book" size={20} weight={2.4} />
            <span>
              <b>{gameText(skill.textKey)}</b>
              {gameBrief(skill.textKey) && <small>{gameBrief(skill.textKey)}</small>}
            </span>
            <i className={f.shine} style={{ animationDelay: `${at + 450 + k * FX.perSkill}ms` }} />
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
  const starts = fx.map((_, i) => FX.stagger * i);
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
