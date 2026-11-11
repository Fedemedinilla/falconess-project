import type { SeasonState } from "@falconess/schema";
import type { SimContext } from "@falconess/sim";
import { type CSSProperties, type ReactNode, useState } from "react";
import { learnableSkills } from "../screens/model/workshop";
import { gameText, ui } from "../text/ui";
import { cx } from "../ui/cx";
import { runnerArt } from "./art";
import { DeltaButton } from "./DeltaButton";
import { Glyph, type GlyphName } from "./Glyph";
import s from "./Mobile.module.css";
import type { WeekMenu } from "./model";
import { placeText, StatStrip } from "./Parts";
import { TrackCardButton, TrackSheet } from "./TrackCard";
import { trackCard } from "./track";

export type MenuAction =
  | "train"
  | "rest"
  | "outing"
  | "workshop"
  | "skills"
  | "race"
  | "recap"
  | "menu";

function RoundButton({
  id,
  glyph,
  label,
  className,
  badge,
  disabled = false,
  onClick,
  size = 24,
}: {
  id: string;
  glyph: GlyphName;
  label: string;
  className: string | undefined;
  badge?: ReactNode;
  disabled?: boolean;
  onClick: () => void;
  size?: number;
}) {
  return (
    <button
      type="button"
      id={id}
      className={cx(s.rb, className)}
      disabled={disabled}
      onClick={(e) => {
        // the second click of a double click lands on the next week's button: ignore it
        if (e.detail > 1) return;
        onClick();
      }}
    >
      <Glyph name={glyph} size={size} />
      <span className={s.rbLb}>{label}</span>
      {badge}
    </button>
  );
}

/**
 * The week menu, layout D of the prototype: the runner large in the middle, her stats on a strip
 * over her legs and the actions floating around the raised delta «Entrenar» (3B).
 */
export function MenuScreen({
  ctx,
  state,
  menu,
  pendingEvent,
  canRecap,
  onAction,
}: {
  ctx: SimContext;
  state: SeasonState;
  menu: WeekMenu;
  pendingEvent: boolean;
  canRecap: boolean;
  onAction: (action: MenuAction) => void;
}) {
  const f = ctx.content.getFalconess(state.falconessId);
  const sponsor = ctx.content.getManufacturer(f.sponsor);
  const frame = ctx.content.getFrame(state.equippedFrame);
  const art = runnerArt(f.id);
  const name = gameText(f.textKey);
  const learnable = learnableSkills(ctx, state).filter((k) => k.cost <= state.skillPoints).length;
  const chips = menu.boosted.map((kind) => ({ key: kind, label: ui(`ui.m.train.abbr.${kind}`) }));
  const off = pendingEvent;
  const goal = menu.goal;
  const [trackOpen, setTrackOpen] = useState(false);
  const track = goal && trackCard(ctx, goal.courseId);

  return (
    <div className={cx(s.screen, s.menu)}>
      {art && (
        <div
          className={s.hero}
          style={{ "--ar": art.ar, "--fy": art.fy, "--cx": art.cx } as CSSProperties}
          aria-hidden="true"
        >
          <div className={s.glow2} />
          <div className={s.fl} />
          <img src={art.splash} alt="" draggable={false} />
        </div>
      )}
      <div className={s.lay}>
        <div className={s.topline}>
          <div className={s.who2}>
            <b>{name}</b>
            <span>
              {gameText(sponsor.textKey)} · {gameText(`style.${frame.style}`)}
            </span>
          </div>
          {menu.injured && (
            <span className={s.injured} id="m-lesion">
              <Glyph name="warn" size={18} />
              {ui("ui.m.injured", { n: menu.injuryTurns })}
            </span>
          )}
        </div>
        <div className={s.grow} />
        {menu.raceWeek && goal && (
          <button
            type="button"
            className={s.raceBar}
            id="m-carrera"
            onClick={() => onAction("race")}
            disabled={off}
          >
            <Glyph name="flag" size={22} weight={2.4} />
            <span className={s.raceBarT}>
              <b>{ui("ui.m.race.week")}</b>
              <span>
                {gameText(ctx.content.getCourse(goal.courseId).textKey)} ·{" "}
                {placeText(goal.minPlace)}
              </span>
            </span>
            <span className={s.raceBarGo}>{ui("ui.m.race.open")}</span>
          </button>
        )}
        {track && <TrackCardButton view={track} id="m-pista" onOpen={() => setTrackOpen(true)} />}
        <StatStrip stats={menu.stats} skillPoints={menu.skillPoints} />
        <div className={s.arc}>
          <DeltaButton
            id="m-entrenar"
            label={ui("ui.m.train")}
            ariaLabel={
              chips.length > 0
                ? ui("ui.m.train.boosted", {
                    list: menu.boosted.map((k) => ui(`ui.m.train.name.${k}`)).join(", "),
                  })
                : ui("ui.m.train")
            }
            school={sponsor.id}
            chips={chips}
            icon={<Glyph name="dumbbell" size={32} color="#ffffff" weight={2.6} />}
            disabled={off}
            onClick={() => onAction("train")}
          />
          <RoundButton
            id="m-descansar"
            glyph="bed"
            label={ui("ui.m.rest")}
            className={s.o1}
            disabled={off}
            onClick={() => onAction("rest")}
          />
          <RoundButton
            id="m-salida"
            glyph="map"
            label={ui("ui.m.outing")}
            className={s.o2}
            disabled={off}
            onClick={() => onAction("outing")}
          />
          <RoundButton
            id="m-habilidades"
            glyph="book"
            label={ui("ui.m.skills")}
            className={s.o3}
            disabled={off}
            onClick={() => onAction("skills")}
            badge={
              learnable > 0 ? (
                <span className={s.bdg} title={ui("ui.m.skills.badge", { n: learnable })}>
                  {learnable}
                </span>
              ) : undefined
            }
          />
          <RoundButton
            id="m-taller"
            glyph="wrench"
            label={ui("ui.m.workshop")}
            className={s.o4}
            disabled={off}
            onClick={() => onAction("workshop")}
          />
          <RoundButton
            id="m-resumen"
            glyph="check"
            label={ui("ui.m.recap")}
            className={cx(s.sm, s.e1)}
            size={20}
            disabled={!canRecap}
            onClick={() => onAction("recap")}
          />
          <RoundButton
            id="m-menu"
            glyph="menu"
            label={ui("ui.m.menu")}
            className={cx(s.sm, s.e2)}
            size={20}
            onClick={() => onAction("menu")}
          />
        </div>
      </div>
      {track && <TrackSheet view={track} open={trackOpen} onClose={() => setTrackOpen(false)} />}
    </div>
  );
}
