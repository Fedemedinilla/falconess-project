import type { ContentIndex, StatName } from "@falconess/schema";
import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { Letter } from "../screens/shared/Letter";
import { formatSigned } from "../text/format";
import { gameText, ui } from "../text/ui";
import { cx } from "../ui/cx";
import { Glyph, type GlyphName } from "./Glyph";
import s from "./Mobile.module.css";
import { type GoalCard, moodTone, type StatCell, type VigorView } from "./model";

/** The school's colors (her sponsor's livery) as the page's accent. */
export function accentStyle(content: ContentIndex, falconessId: string): CSSProperties {
  const f = content.falconess.get(falconessId);
  const palette = f ? content.getManufacturer(f.sponsor).palette : undefined;
  return {
    "--acc": palette?.primary ?? "#c0392b",
    "--sec": palette?.secondary ?? "#f1c40f",
  };
}

const MOOD_GLYPH: Readonly<Record<number, GlyphName>> = {
  [-2]: "ddown",
  [-1]: "down",
  0: "right",
  1: "up",
  2: "dup",
};

/**
 * «3.º o mejor», «Ganar» when only first place passes, or «Correr» when any place does (a full
 * field is 8: Peregrina's Larga, ADR-0014).
 */
export function placeText(minPlace: number): string {
  if (minPlace === 1) return ui("ui.m.goal.win");
  return minPlace >= 8 ? ui("ui.m.goal.run") : ui("ui.m.goal.place", { place: minPlace });
}

/** ADR-0014: the race's grade as a small chip («G3»), nothing when the goal has none. */
export function GradeChip({ grade }: { grade: GoalCard["grade"] }) {
  if (!grade) return null;
  return (
    <span className={s.raceGrade} data-grade={grade}>
      {ui(`ui.m.grade.${grade}`)}
    </span>
  );
}

function GoalPill({ goal, content }: { goal: GoalCard | undefined; content: ContentIndex }) {
  if (!goal)
    return (
      <div className={s.goal} id="m-meta">
        <span className={s.goalIc}>
          <Glyph name="trophy" size={20} color="#1d1704" weight={2.4} />
        </span>
        <div className={s.goalT}>
          <div className={s.goalN}>{ui("ui.m.goal.none")}</div>
        </div>
      </div>
    );
  const course = gameText(content.getCourse(goal.courseId).textKey);
  const when =
    goal.weeksLeft === 0 ? ui("ui.m.goal.today") : ui("ui.m.goal.in", { n: goal.weeksLeft });
  const d = goal.distance;
  return (
    <div
      className={cx(s.goal, goal.weeksLeft === 0 && s.goalNow)}
      id="m-meta"
      data-weeks={goal.weeksLeft}
    >
      <span className={s.goalIc}>
        <Glyph name="flag" size={20} color="#1d1704" weight={2.4} />
      </span>
      <div className={s.goalT}>
        <div className={s.goalN} data-cup={goal.cup}>
          <GradeChip grade={goal.grade} />
          {goal.cup
            ? ui("ui.m.cup.pill", { round: ui(`ui.m.cup.short.${goal.cup}`), course })
            : course}
        </div>
        <div className={s.goalS}>
          {when} · {placeText(goal.minPlace)}
        </div>
      </div>
      {d && (
        <span
          className={s.goalD}
          title={ui("ui.position.race", {
            distance: ui(`ui.flight.distance.${d.distance}`),
            m: Math.round(d.lengthMm / 1000),
          })}
          id="m-meta-distancia"
          data-distance={d.distance}
        >
          <span className={s.goalDk}>
            {ui(`ui.flight.distance.${d.distance}`)}
            <br />
            {ui("ui.m.meters", { m: Math.round(d.lengthMm / 1000) })}
          </span>
          <Letter letter={d.letter} />
        </span>
      )}
    </div>
  );
}

function VigorBar({ vigor, pop }: { vigor: VigorView; pop?: VigorPop | undefined }) {
  const pct = (v: number) => `${(100 * v) / vigor.max}%`;
  const after = vigor.after;
  let cost: CSSProperties | undefined;
  let plus = false;
  if (after) {
    if (after.min < vigor.value) {
      cost = { left: pct(after.min), width: pct(vigor.value - after.min) };
    } else if (after.max > vigor.value) {
      plus = true;
      cost = { left: pct(vigor.value), width: pct(after.max - vigor.value) };
    }
  }
  const label =
    after === undefined
      ? ui("ui.m.vigor.aria", { value: vigor.value, max: vigor.max })
      : ui("ui.m.vigor.aria.after", {
          value: vigor.value,
          max: vigor.max,
          after: after.min === after.max ? after.min : `${after.min}–${after.max}`,
        });
  return (
    <div className={s.vwrap}>
      <div className={s.vbar} role="img" aria-label={label} id="m-vigor" data-vigor={vigor.value}>
        <div className={s.vfill} style={{ width: pct(vigor.value) }} />
        {/* owner 2026-11-14: the word inside the bar, no label beside it */}
        <span className={s.vword} aria-hidden="true">
          {ui("ui.m.vigor")}
        </span>
        {cost && (
          <div
            className={cx(s.vcost, plus && s.vcostPlus)}
            style={cost}
            id="m-vigor-costo"
            data-after={after?.min}
          />
        )}
      </div>
      {pop && (
        <span className={s.vpop} id="m-vigor-cambio" data-delta={pop.delta}>
          <Pop delta={pop.delta} delay={pop.delay} small />
        </span>
      )}
    </div>
  );
}

/** owner 2026-11-13: a training's vigor change, on the bar itself, in the result's timeline. */
export type VigorPop = { readonly delta: number; readonly delay: number };

export type HudProps = {
  /** A training's result is playing: its vigor change on the bar. */
  vigorPop?: VigorPop | undefined;
  /** ADR-0012: Exigente shows a chip under the calendar. */
  hard?: boolean;
  turn: number;
  turns: number;
  goal: GoalCard | undefined;
  vigor: VigorView;
  mood: number;
  content: ContentIndex;
};

/** The top of every week screen: the calendar, the next goal, vigor (with the preview) and mood. */
export function Hud({ hard = false, turn, turns, goal, vigor, vigorPop, mood, content }: HudProps) {
  const tone = moodTone(mood);
  return (
    <header className={s.hud}>
      <div
        className={s.cal}
        id="m-semana"
        aria-label={ui("ui.m.week.aria", { turn, turns, left: turns - turn })}
        role="img"
      >
        {/* ADR-0012: on Exigente the calendar's header says so */}
        <div
          className={cx(s.calH, hard && s.calHard)}
          id={hard ? "m-exigente" : undefined}
          aria-hidden="true"
        >
          {hard ? ui("ui.m.difficulty.exigente") : ui("ui.m.week")}
        </div>
        <div className={s.calN} aria-hidden="true">
          {turn}
        </div>
        <div className={s.calS} aria-hidden="true">
          {ui("ui.m.weekOf", { turns })}
        </div>
      </div>
      <div className={s.hudR}>
        <GoalPill goal={goal} content={content} />
        <div className={s.vrow}>
          <VigorBar vigor={vigor} pop={vigorPop} />
          <div
            className={cx(s.mood, s[`mood-${tone}`])}
            id="m-animo"
            data-mood={mood}
            aria-label={ui("ui.m.mood.aria", { mood: gameText(`mood.${mood}`) })}
            role="img"
          >
            <Glyph name={MOOD_GLYPH[mood] ?? "right"} size={15} weight={2.6} />
            <span aria-hidden="true">{gameText(`mood.${mood}`)}</span>
          </div>
        </div>
      </div>
    </header>
  );
}

export type StatStripProps = {
  stats: readonly StatCell[];
  skillPoints: number;
  /** The stats the selected training raises, highlighted, with their gain above. */
  gains?: Partial<Record<StatName, number>> | undefined;
  pointsGain?: number | undefined;
  /** Long labels (the training screen) or short ones (the menu). */
  long?: boolean;
  /**
   * A training's result (owner 2026-11-11, like Umamusume's): each stat that moved shows a big
   * «+N» with rising chevrons over its cell, one after the other (`delay`, ms), and its number
   * counts from `from` up to its new value. Replaces `gains`.
   */
  pops?: {
    readonly stats: Partial<Record<StatName, { readonly delta: number; readonly delay: number }>>;
    readonly points?: { readonly delta: number; readonly delay: number } | undefined;
    readonly from: Readonly<Record<StatName, number>>;
    readonly fromPoints: number;
  };
};

/** A number that counts from `from` to `to` once its `delay` has passed (ms). */
function CountUp({ from, to, delay }: { from: number; to: number; delay: number }) {
  const [v, setV] = useState(from);
  useEffect(() => {
    if (from === to) return;
    let raf = 0;
    const start = performance.now() + delay;
    const dur = 520;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / dur));
      // ease-out: fast at first, settling on the value
      const e = 1 - (1 - t) * (1 - t) * (1 - t);
      setV(Math.round(from + (to - from) * e));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [from, to, delay]);
  return <>{v}</>;
}

/** The «+N» of a result: gold chevrons rising behind it; a drop is blue, its chevrons falling. */
export function Pop({
  delta,
  delay,
  small = false,
}: {
  delta: number;
  delay: number;
  small?: boolean;
}) {
  const up = delta >= 0;
  return (
    <span
      className={cx(s.pop, !up && s.popDown, small && s.popSmall)}
      style={{ animationDelay: `${delay}ms` }}
      data-delta={delta}
    >
      <span className={s.popArrows} aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <svg
            key={i}
            className={s.chev}
            viewBox="0 0 24 12"
            aria-hidden="true"
            style={{ animationDelay: `${delay + i * 140}ms` }}
          >
            <polyline className={s.chevEdge} points="3,10 12,3 21,10" />
            <polyline points="3,10 12,3 21,10" />
          </svg>
        ))}
      </span>
      <span className={s.popN}>{formatSigned(delta)}</span>
    </span>
  );
}

/** Her five stats as numbers with medal colors (no rank letters), and her skill points. */
export function StatStrip({
  stats,
  skillPoints,
  gains,
  pointsGain,
  long = false,
  pops,
}: StatStripProps) {
  const showGains = gains !== undefined && pops === undefined;
  return (
    <div className={cx(s.strip, long && s.stripLong)} id="m-stats">
      {showGains && (
        <div className={s.gains} aria-hidden="true">
          {stats.map((c) => (
            <div key={c.stat}>
              {gains[c.stat] !== undefined && (
                <span className={s.gn} key={`${c.stat}-${gains[c.stat]}`}>
                  {formatSigned(gains[c.stat] ?? 0)}
                </span>
              )}
            </div>
          ))}
          <div>
            {pointsGain !== undefined && pointsGain > 0 && (
              <span className={cx(s.gn, s.gnSmall)}>{formatSigned(pointsGain)}</span>
            )}
          </div>
        </div>
      )}
      {pops && (
        <div className={s.gains} aria-hidden="true" id="m-resultado-pops">
          {stats.map((c) => {
            const p = pops.stats[c.stat];
            return <div key={c.stat}>{p && <Pop delta={p.delta} delay={p.delay} />}</div>;
          })}
          <div>
            {pops.points && <Pop delta={pops.points.delta} delay={pops.points.delay} small />}
          </div>
        </div>
      )}
      <div className={s.srow}>
        {stats.map((c) => (
          <div
            key={c.stat}
            className={cx(
              s.sc,
              (gains?.[c.stat] !== undefined || pops?.stats[c.stat] !== undefined) && s.scOn,
            )}
            data-stat={c.stat}
            data-tier={c.tier}
            data-cap={c.capped || undefined}
            aria-label={
              c.capped
                ? ui("ui.m.stat.capped.aria", { stat: gameText(`stat.${c.stat}`), n: c.value })
                : `${gameText(`stat.${c.stat}`)} ${c.value}`
            }
            role="img"
          >
            <span className={s.sh} aria-hidden="true">
              {long ? ui(`ui.m.stat.${c.stat}`) : ui(`ui.stat.abbr.${c.stat}`)}
            </span>
            <span className={cx(s.sv, s.sn, s[`t${c.tier}`])} aria-hidden="true">
              {pops?.stats[c.stat] ? (
                <CountUp
                  from={pops.from[c.stat]}
                  to={c.value}
                  delay={pops.stats[c.stat]?.delay ?? 0}
                />
              ) : (
                c.value
              )}
            </span>
            {c.capped && (
              <span className={s.cap0} aria-hidden="true">
                {ui("ui.m.stat.capped")}
              </span>
            )}
          </div>
        ))}
        <div
          className={cx(s.sc, s.pt)}
          aria-label={ui("ui.m.points.aria", { n: skillPoints })}
          role="img"
          id="m-puntos"
        >
          <span className={s.sh} aria-hidden="true">
            {ui("ui.m.points")}
          </span>
          <span className={s.sv} aria-hidden="true">
            {pops?.points ? (
              <CountUp from={pops.fromPoints} to={skillPoints} delay={pops.points.delay} />
            ) : (
              skillPoints
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
