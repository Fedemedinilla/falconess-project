import type { ContentIndex, StatName } from "@falconess/schema";
import type { CSSProperties } from "react";
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

/** «3.º o mejor», or «Ganar» when only first place passes. */
export function placeText(minPlace: number): string {
  return minPlace === 1 ? ui("ui.m.goal.win") : ui("ui.m.goal.place", { place: minPlace });
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

function VigorBar({ vigor }: { vigor: VigorView }) {
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
    <div className={s.vbar} role="img" aria-label={label} id="m-vigor" data-vigor={vigor.value}>
      <div className={s.vfill} style={{ width: pct(vigor.value) }} />
      {cost && (
        <div
          className={cx(s.vcost, plus && s.vcostPlus)}
          style={cost}
          id="m-vigor-costo"
          data-after={after?.min}
        />
      )}
    </div>
  );
}

export type HudProps = {
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
export function Hud({ hard = false, turn, turns, goal, vigor, mood, content }: HudProps) {
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
          <span className={s.lbl} aria-hidden="true">
            {ui("ui.m.vigor")}
          </span>
          <VigorBar vigor={vigor} />
          <div
            className={cx(s.mood, s[`mood-${tone}`])}
            id="m-animo"
            data-mood={mood}
            aria-label={ui("ui.m.mood.aria", { mood: gameText(`mood.${mood}`) })}
            role="img"
          >
            <Glyph name={MOOD_GLYPH[mood] ?? "right"} size={18} weight={2.6} />
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
};

/** Her five stats as numbers with medal colors (no rank letters), and her skill points. */
export function StatStrip({ stats, skillPoints, gains, pointsGain, long = false }: StatStripProps) {
  const showGains = gains !== undefined;
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
      <div className={s.srow}>
        {stats.map((c) => (
          <div
            key={c.stat}
            className={cx(s.sc, gains?.[c.stat] !== undefined && s.scOn)}
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
              {c.value}
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
            {skillPoints}
          </span>
        </div>
      </div>
    </div>
  );
}
