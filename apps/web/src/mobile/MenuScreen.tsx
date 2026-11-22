import type { SeasonState } from "@falconess/schema";
import type { SimContext } from "@falconess/sim";
import { type CSSProperties, type ReactNode, useEffect, useState } from "react";
import { learnableSkills } from "../screens/model/workshop";
import { ui } from "../text/ui";
import { cx } from "../ui/cx";
import { isRepeatTap } from "../ui/tap";
import { runnerArt } from "./art";
import { Glyph, type GlyphName } from "./Glyph";
import s from "./Mobile.module.css";
import type { WeekMenu } from "./model";
import { PANEL_GLYPH, type PanelTab, panelTitle } from "./Panels";
import { StatStrip } from "./Parts";
import { TrackCardButton, TrackSheet } from "./TrackCard";
import { TrainBar } from "./TrainBar";
import { trackCard } from "./track";

export type MenuAction = "train" | "rest" | "outing" | "workshop" | "skills" | "race" | "menu";

/** The reading panels, in the order the rail lists them. */
const PANELS: readonly PanelTab[] = ["guide", "goals", "crews", "log"];

/**
 * The reading rail (owner 2026-11-18): Guía, Metas, Cuadrillas and Registro as small icon buttons
 * down the right edge, right under «Menú», one tap each — they are reading, and «Menú» is doing.
 * Guía keeps its dot until it has been opened. In the flow, never over a control; only on a phone
 * (the wide screen's panel has its own rail with the four).
 */
function ReadingRail({
  onPanel,
  guideNew,
}: {
  onPanel: (tab: PanelTab) => void;
  guideNew: boolean;
}) {
  return (
    <nav className={s.rail} aria-label={ui("ui.m.reading")}>
      {PANELS.map((t) => (
        <button
          key={t}
          type="button"
          className={s.railBtn}
          id={`m-leer-${t}`}
          data-new={t === "guide" ? guideNew : undefined}
          onClick={() => onPanel(t)}
        >
          <Glyph name={PANEL_GLYPH[t]} size={19} weight={2.4} />
          <span className={s.railLb}>{panelTitle(t)}</span>
          {t === "guide" && guideNew && <span className={s.railDot} data-dot aria-hidden="true" />}
        </button>
      ))}
    </nav>
  );
}

function RoundButton({
  id,
  glyph,
  label,
  base,
  className,
  badge,
  disabled = false,
  onClick,
  size = 24,
}: {
  id: string;
  glyph: GlyphName;
  label: string;
  /** The button's shape: the round «Menú» or a pill (the week's actions). */
  base: string | undefined;
  className?: string | undefined;
  badge?: ReactNode;
  disabled?: boolean;
  onClick: () => void;
  size?: number;
}) {
  return (
    <button
      type="button"
      id={id}
      className={cx(base, className)}
      disabled={disabled}
      onClick={(e) => {
        // the second click of a double click lands on the next week's button: ignore it
        if (isRepeatTap(e)) return;
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
 * The week menu: the runner large in the middle, «Menú» at the top right, the goal's track in a tab
 * at the left edge, her stats on a strip over her legs, «Entrenar» as a wide bar and the other four
 * actions as pills under it (owner 2026-11-14). On a race week there is no bar of its own (owner
 * 2026-11-18): the track drawer opens by itself and its card opens the planning card.
 */
export function MenuScreen({
  ctx,
  state,
  menu,
  pendingEvent,
  major = false,
  onAction,
  onPanel,
  guideNew = false,
  autoTrack = false,
  onTrackShown,
}: {
  ctx: SimContext;
  state: SeasonState;
  menu: WeekMenu;
  pendingEvent: boolean;
  /** The menu a run opens on comes in slower (D1). Read when it mounts. */
  major?: boolean;
  onAction: (action: MenuAction) => void;
  /** The four reading panels live on this screen now; the wide screen passes none (its own rail). */
  onPanel?: ((tab: PanelTab) => void) | undefined;
  guideNew?: boolean;
  /** The track drawer opens by itself now (`flow.openTrack`): a race week, nothing in front. */
  autoTrack?: boolean;
  /** Said once the drawer opened by itself: this week does not open it again. */
  onTrackShown?: (() => void) | undefined;
}) {
  const [slow] = useState(major);
  const f = ctx.content.getFalconess(state.falconessId);
  const sponsor = ctx.content.getManufacturer(f.sponsor);
  const art = runnerArt(f.id);
  const learnable = learnableSkills(ctx, state).filter((k) => k.cost <= state.skillPoints).length;
  // ADR-0016: the trainings with a crew in sintonía first, in gold
  const chips = [...menu.boosted]
    .sort((a, b) => Number(menu.synced.includes(b)) - Number(menu.synced.includes(a)))
    .map((kind) => ({
      key: kind,
      label: ui(`ui.m.train.abbr.${kind}`),
      sync: menu.synced.includes(kind),
    }));
  const off = pendingEvent;
  const goal = menu.goal;
  const [trackOpen, setTrackOpen] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const track = goal && trackCard(ctx, goal.courseId);
  const raceWeek = menu.raceWeek && goal !== undefined;
  // owner 2026-11-18: where the race bar was, the drawer opens by itself on a race week (the same
  // information, and it shows the player that the tab is where the race is). The flow decides when
  // (once a week, never under a layer or a sheet); here it just opens, and a close stays closed.
  useEffect(() => {
    if (!autoTrack) return;
    setDrawer(true);
    onTrackShown?.();
  }, [autoTrack, onTrackShown]);

  return (
    <div className={cx(s.screen, slow && s.screenMajor)}>
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
        {/* owner 2026-11-14: the menu at the top right, where the name card was */}
        <div className={s.topline}>
          {menu.injured && (
            <span className={s.injured} id="m-lesion">
              <Glyph name="warn" size={18} />
              {ui("ui.m.injured", { n: menu.injuryTurns })}
            </span>
          )}
          <RoundButton
            id="m-menu"
            glyph="menu"
            label={ui("ui.m.menu")}
            base={s.menuBtn}
            size={20}
            onClick={() => onAction("menu")}
          />
        </div>
        {onPanel && <ReadingRail onPanel={onPanel} guideNew={guideNew} />}
        <div className={s.grow} />
        {/* owner 2026-11-14: the track hides in a tab at the screen's edge; a tap slides it out */}
        {track && (
          <div className={s.drawer}>
            <button
              type="button"
              className={cx(s.drawerTab, drawer && s.drawerTabOn)}
              id="m-pista-tab"
              // the scene's notice sits just over the tab, never over the menu's buttons (rule 17)
              data-toast-anchor
              // the week's race lives behind this tab now (owner 2026-11-18): what the bar said
              data-race={raceWeek ? "" : undefined}
              aria-expanded={drawer}
              aria-controls="m-pista"
              aria-label={ui(drawer ? "ui.m.track.tab.close" : "ui.m.track.tab.open")}
              onClick={() => setDrawer((d) => !d)}
            >
              <Glyph name="flag" size={18} weight={2.6} />
              <span>{ui("ui.m.track.tab")}</span>
            </button>
            <div
              className={cx(s.drawerCard, drawer && s.drawerCardOn)}
              inert={drawer ? undefined : true}
            >
              <TrackCardButton
                view={track}
                id="m-pista"
                // owner 2026-11-18: on a race week the card is the door to the planning card (D3),
                // which shows this same profile and what it asks plus the four positions; on any
                // other week it opens the plain track sheet, as before
                onOpen={
                  raceWeek
                    ? (e) => {
                        // a menu action (plan §1.7 rule 3): the second click of a double tap (one
                        // that ended the week's scene over the menu) opens nothing
                        if (!isRepeatTap(e)) onAction("race");
                      }
                    : () => setTrackOpen(true)
                }
                sheet={!raceWeek}
                disabled={raceWeek && off}
              />
            </div>
          </div>
        )}
        <StatStrip stats={menu.stats} skillPoints={menu.skillPoints} />
        {/* owner 2026-11-14: «Entrenar» as a wide bar, the four actions as pills under it */}
        <div className={s.acts}>
          <TrainBar
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
            disabled={off}
            onClick={() => onAction("train")}
          />
          <div className={s.pills}>
            <RoundButton
              id="m-descansar"
              glyph="bed"
              label={ui("ui.m.rest")}
              base={s.pill}
              className={s.pRest}
              disabled={off}
              onClick={() => onAction("rest")}
            />
            <RoundButton
              id="m-habilidades"
              glyph="book"
              label={ui("ui.m.skills")}
              base={s.pill}
              className={s.pSkills}
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
              id="m-salida"
              glyph="map"
              label={ui("ui.m.outing")}
              base={s.pill}
              className={s.pOuting}
              disabled={off}
              onClick={() => onAction("outing")}
            />
            <RoundButton
              id="m-taller"
              glyph="wrench"
              label={ui("ui.m.workshop")}
              base={s.pill}
              className={s.pWorkshop}
              disabled={off}
              onClick={() => onAction("workshop")}
            />
          </div>
        </div>
      </div>
      {/* its dialog is in the page only while open: the goals' sheet has its own (no id twice) */}
      {track && <TrackSheet view={track} open={trackOpen} onClose={() => setTrackOpen(false)} />}
    </div>
  );
}
