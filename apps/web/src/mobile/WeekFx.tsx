import type { ContentIndex } from "@falconess/schema";
import { type CSSProperties, useRef, useState } from "react";
import { gameBrief } from "../text/brief";
import { formatSigned } from "../text/format";
import { gameText, ui } from "../text/ui";
import { cx } from "../ui/cx";
import { useFlowTimer, useFlowTimers } from "../ui/flowTimer";
import { isRepeatTap } from "../ui/tap";
import { useReducedMotion } from "../ui/useMedia";
import { type FxCell, fxGrid, fxTimeline } from "./flow/fxTimeline";
import { Glyph, type GlyphName } from "./Glyph";
import { useLayerFocus, useLayerPhase, useLid } from "./LayerHost";
import { crewInitials } from "./model";
import { type Pace, paceScale } from "./pace";
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

/** The skills she learned: compact shining cards, up to five without crowding; each pops at `pops[k]`. */
function Skills({
  e,
  pops,
  content,
}: {
  e: WeekFx;
  pops: readonly number[];
  content: ContentIndex;
}) {
  const ids = e.skills ?? [];
  return (
    <ul className={cx(f.skills, ids.length > 3 && f.skillsMany)}>
      {ids.map((id, k) => {
        const skill = content.getSkill(id);
        const pop = pops[k] ?? 0;
        return (
          <li key={id} className={f.skill} data-skill={id} style={{ animationDelay: `${pop}ms` }}>
            <Glyph name="book" size={20} weight={2.4} />
            <span>
              <b>{gameText(skill.textKey)}</b>
              {gameBrief(skill.textKey) && <small>{gameBrief(skill.textKey)}</small>}
            </span>
            <i className={f.shine} style={{ animationDelay: `${pop + SHINE_AFTER}ms` }} />
          </li>
        );
      })}
    </ul>
  );
}

/**
 * A stamp too long for its cell at the full size: many letters, or one long word (at the smaller
 * size «RECUPERACIÓN» fits its cell on a 360 px phone without breaking).
 */
function long(label: string): boolean {
  return label.length > 14 || label.split(" ").some((w) => w.length >= 11);
}

/** A skill card's shine runs this long after it popped in. */
const SHINE_AFTER = 200;

/** An effect's cell in the layer's grid: its row (between the rows of space), its column, its place. */
function cellStyle(c: FxCell): CSSProperties {
  return {
    gridRow: 2 * c.row + 2,
    gridColumn: c.col === "both" ? "1 / -1" : c.col + 1,
    justifySelf: c.x,
    alignSelf: c.y,
  };
}

/**
 * The week's effects shown, not told (owner 2026-11-13): all together, each in a random cell of
 * the screen's grid (a cell of its own: two never overlap), a stamp like a training's «¡ÉXITO!»
 * with chevrons, gold and rising for good news, blue and falling for bad. «Ritmo» shortens their
 * timeline (`fxTimeline`, the learned skills' pops too: M6). A tap ends them (H2: then the scrim and
 * the stamps fade out together, as an id-less copy that takes no tap and plays nothing, while the
 * menu under them is live).
 */
export function WeekFxOverlay({
  fx,
  pace,
  content,
  onDone,
}: {
  fx: readonly WeekFx[];
  /** The flow's «Ritmo»; read once, when the effects come. */
  pace: Pace;
  content: ContentIndex;
  /** Their time is up, or a tap; read when it happens, so a new arrow on each render is fine. */
  onDone: () => void;
}) {
  const lid = useLid();
  const playing = useLayerPhase() === "in";
  // reduced motion: every effect whole from the first frame (their CSS has no animation), so they
  // take no timeline of their own (rule 73: an inline length would bring their fade back)
  const reduced = useReducedMotion();
  // the instance is the beat's: its timeline and its cells are drawn once
  const [{ starts, skillAt, total }] = useState(() => fxTimeline(fx, paceScale(pace)));
  const [grid] = useState(() => fxGrid(fx));
  const layer = useRef<HTMLButtonElement>(null);
  useLayerFocus(layer);
  // each effect sounds as it pops in, then they end; once they leave, nothing more (the instance
  // is the beat's: its timers start once)
  useFlowTimers(
    playing ? starts : undefined,
    (i) => {
      const e = fx[i];
      if (e) playSound(e.kind === "skills" ? "boost" : e.good ? "success" : "fail");
    },
    "sounds",
  );
  useFlowTimer(playing ? total : undefined, onDone, "end");
  const label = (e: WeekFx) =>
    e.kind === "skills"
      ? ui(e.skills && e.skills.length > 1 ? "ui.m.fx.skills.many" : "ui.m.fx.skills", {
          n: e.skills?.length ?? 1,
        })
      : ui(`ui.m.fx.${e.kind}`);
  return (
    <button
      ref={layer}
      type="button"
      className={cx(f.layer, !playing && f.out)}
      style={{
        gridTemplateRows: grid.space.map((w) => `${w.toFixed(3)}fr`).join(" auto "),
      }}
      id={lid("m-efectos")}
      aria-label={fx.map(label).join(" · ")}
      onClick={(e) => {
        // the second click of a double tap lands on what follows the effects: ignore it
        if (!isRepeatTap(e)) onDone();
      }}
    >
      {fx.map((e, i) => {
        const at = starts[i] ?? 0;
        const cell = grid.cells[i];
        return (
          <span
            key={e.kind}
            className={cx(f.fx, e.good ? f.good : f.bad)}
            data-fx={e.kind}
            style={{
              ...(cell ? cellStyle(cell) : {}),
              ...(reduced
                ? {}
                : { animationDelay: `${at}ms`, animationDuration: `${total - at}ms` }),
            }}
          >
            {e.kind !== "skills" && <Badge e={e} at={at} content={content} />}
            <span
              className={cx(f.stamp, long(label(e)) && f.stampLong)}
              style={{ animationDelay: `${at + 120}ms` }}
            >
              {label(e)}
            </span>
            {e.kind === "skills" && <Skills e={e} pops={skillAt[i] ?? []} content={content} />}
          </span>
        );
      })}
    </button>
  );
}
