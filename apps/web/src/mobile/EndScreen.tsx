import { useMemo } from "react";
import type { ActiveRun } from "../game/controller";
import { useGame } from "../game/useGame";
import { seasonSummary } from "../screens/model/end";
import { goalStatuses } from "../screens/model/season";
import { formatSeconds } from "../text/format";
import { gameText, ui } from "../text/ui";
import { cx } from "../ui/cx";
import { runnerArt } from "./art";
import { Glyph } from "./Glyph";
import s from "./Mobile.module.css";
import { statCells } from "./model";
import { StatStrip } from "./Parts";

/**
 * The end of the season on the phone: the grade and score of the sim, each goal race with its
 * place, and her final stats. The test view's #fin keeps the black box and the copy of the run.
 */
export function EndScreen({
  run,
  onRace,
  onNew,
  onTests,
}: {
  run: ActiveRun;
  onRace: (turn: number) => void;
  onNew: () => void;
  onTests: () => void;
}) {
  const { game } = useGame();
  const ctx = game.context();
  const state = run.state;
  const summary = useMemo(
    () => seasonSummary(ctx, state, run.seed, run.inputs),
    [ctx, state, run.seed, run.inputs],
  );
  const art = runnerArt(state.falconessId);
  const name = gameText(ctx.content.getFalconess(state.falconessId).textKey);
  const goals = goalStatuses(ctx, state);
  return (
    <div className={s.screen}>
      <div className={s.body}>
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
                  onClick={() => onRace(g.goal.turn)}
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
        <StatStrip stats={statCells(state)} skillPoints={state.skillPoints} long />
        <button type="button" className={s.linkBtn} id="m-fin-pruebas" onClick={onTests}>
          {ui("ui.m.end.detail")}
        </button>
      </div>
      <div className={s.foot}>
        <button
          type="button"
          className={cx(s.btn, s.btnMain)}
          id="m-fin-nueva"
          onClick={(e) => {
            if (e.detail > 1) return;
            onNew();
          }}
        >
          {ui("ui.m.end.new")}
        </button>
      </div>
    </div>
  );
}
