import type { BlackBox } from "@falconess/schema";
import { type RefObject, useLayoutEffect, useMemo, useRef } from "react";
import type { ActiveRun } from "../game/controller";
import { useGame } from "../game/useGame";
import { seasonSummary } from "../screens/model/end";
import { goalStatuses } from "../screens/model/season";
import { formatSeconds } from "../text/format";
import { gameText, ui } from "../text/ui";
import { cx } from "../ui/cx";
import { isRepeatTap } from "../ui/tap";
import { runnerArt } from "./art";
import { Glyph } from "./Glyph";
import s from "./Mobile.module.css";
import { statCells } from "./model";
import { StatStrip } from "./Parts";

/**
 * The end of the season on the phone: the grade and score of the sim, each goal race with its
 * place, the black box she leaves (kept already, at the tap that ended the season: RunView's
 * `useSeasonBox`) and her final stats. The test view's #fin shows the box and the copy of the run.
 * «Exportar» opens the run's own sheet (RunView's: one on the page). A race seen again from here
 * comes back to the End where the player left it (`scroll`, kept by RunView across the race).
 */
export function EndScreen({
  run,
  scroll,
  onRace,
  onNew,
  onTests,
  onExport,
}: {
  run: ActiveRun;
  /** How far down the End was when «Ver carrera» left it: where it opens (L6, M3). */
  scroll: RefObject<number>;
  onRace: (turn: number) => void;
  onNew: () => void;
  onTests: () => void;
  onExport: () => void;
}) {
  const { game } = useGame();
  const ctx = game.context();
  const state = run.state;
  const summary = useMemo(
    () => seasonSummary(ctx, state, run.seed, run.inputs),
    [ctx, state, run.seed, run.inputs],
  );
  // ADR-0013: the season's black box, kept by RunView at the tap that ended the season
  const box = summary.blackBox;
  const art = runnerArt(state.falconessId);
  const name = gameText(ctx.content.getFalconess(state.falconessId).textKey);
  const goals = goalStatuses(ctx, state);
  const body = useRef<HTMLDivElement>(null);
  // before paint: back from a race seen again, the End is where the player left it
  useLayoutEffect(() => {
    if (body.current) body.current.scrollTop = scroll.current;
  }, [scroll]);
  return (
    // the season's end comes in slower than a week's screens (D1)
    <div className={cx(s.screen, s.screenMajor)}>
      <div className={s.body} ref={body}>
        <div className={cx(s.panel, s.endc)} id="m-fin">
          {art && <img className={s.endPic} src={art.chibi} alt="" draggable={false} />}
          <p className={s.cap}>
            {summary.endReason === "completed"
              ? ui("ui.end.completed")
              : ui("ui.end.failed", { turn: summary.failedTurn ?? state.turn })}
          </p>
          <h1 className={s.title}>{name}</h1>
          <p className={s.grade} id="m-fin-nota">
            <span className="visually-hidden">{ui("ui.end.grade")} </span>
            {summary.grade}
          </p>
          <p className={s.sub}>
            {ui("ui.m.end.score", { score: summary.score })}
            {summary.cap && ` · ${ui("ui.end.cap", { cap: summary.cap })}`}
          </p>
        </div>
        <ul className={cx(s.panel, s.glist)} aria-label={ui("ui.end.races")}>
          {goals.map((g) => (
            <li key={g.goal.turn}>
              <Glyph name={g.met === false ? "x" : g.met ? "trophy" : "flag"} size={20} />
              <span className={s.gl}>
                {ui("ui.m.end.race", {
                  turn: g.goal.turn,
                  course: gameText(ctx.content.getCourse(g.goal.courseId).textKey),
                  place: g.goal.minPlace,
                })}
              </span>
              {g.result ? (
                <button
                  type="button"
                  className={s.linkBtn}
                  id={`m-fin-carrera-${g.goal.turn}`}
                  onClick={() => {
                    scroll.current = body.current?.scrollTop ?? 0;
                    onRace(g.goal.turn);
                  }}
                >
                  <b>{ui("ui.m.race.place", { place: g.result.place })}</b>{" "}
                  {formatSeconds(g.result.timeTicks)} s
                </button>
              ) : (
                <span>{ui("ui.end.notRun")}</span>
              )}
            </li>
          ))}
        </ul>
        <p className={cx(s.panel, s.boxLine)} id="m-fin-caja">
          <Glyph name="book" size={18} />
          {boxText(box)}
        </p>
        <StatStrip stats={statCells(state)} skillPoints={state.skillPoints} long />
        <button
          type="button"
          className={cx(s.btn, s.btnWide)}
          id="m-fin-exportar"
          onClick={onExport}
        >
          <Glyph name="down" size={20} />
          {ui("ui.m.export.season")}
        </button>
        <button type="button" className={s.linkBtn} id="m-fin-pruebas" onClick={onTests}>
          {ui("ui.m.end.detail")}
        </button>
      </div>
      {/* a notice (a scene at the season's end) sits just over the foot */}
      <div className={s.foot} data-toast-anchor>
        <button
          type="button"
          className={cx(s.btn, s.btnMain)}
          id="m-fin-nueva"
          onClick={(e) => {
            if (isRepeatTap(e)) return;
            onNew();
          }}
        >
          {ui("ui.m.end.new")}
        </button>
      </div>
    </div>
  );
}

/** «Caja negra: Agilidad ★★ · Remate A». */
export function boxText(box: BlackBox): string {
  return ui("ui.m.box.line", {
    stat: gameText(`stat.${box.factors.stat.stat}`),
    stars: "★".repeat(box.factors.stat.stars),
    position: gameText(`position.${box.factors.aptitude.key}`),
    letter: box.factors.aptitude.letter,
  });
}
