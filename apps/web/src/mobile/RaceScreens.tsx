import type { CupRound, Position, SeasonState } from "@falconess/schema";
import type { SimContext } from "@falconess/sim";
import { type ReactNode, useState } from "react";
import { PlayerAdviceNote } from "../race/AdviceNote";
import { pageLabels, Replay } from "../race/RaceReplay";
import { raceDistance, type WeekActionInput } from "../screens/model/position";
import { goalStatuses } from "../screens/model/season";
import { Letter } from "../screens/shared/Letter";
import { PositionPicker } from "../screens/shared/PositionPicker";
import { useGoalRaceLog } from "../screens/shared/useGoalRaceLog";
import { describeInput } from "../screens/TurnSide";
import { formatSeconds } from "../text/format";
import { gameText, ui } from "../text/ui";
import { cx } from "../ui/cx";
import { Glyph } from "./Glyph";
import s from "./Mobile.module.css";
import { TrackCardButton, TrackSheet } from "./TrackCard";
import { trackCard } from "./track";

/**
 * The pre-race card of a goal race week: her four positions with her letter in each (her wings'
 * one preselected), the race's distance with her letter there, and her passive. Opened from the
 * race button (to choose ahead) or after the week's action (then «Correr» runs the week: the action
 * and, after it, the race).
 */
export function PreRaceScreen({
  ctx,
  state,
  courseId,
  minPlace,
  cup,
  mirror = false,
  named,
  wings,
  position,
  input,
  onPosition,
  onRun,
  onBack,
}: {
  ctx: SimContext;
  state: SeasonState;
  courseId: string;
  minPlace: number;
  /** ADR-0012: a round of the Copa, and whether Gerifalte runs in it. */
  cup?: CupRound | undefined;
  mirror?: boolean;
  /** ADR-0015: the id of a named rival who runs in it (Milana). */
  named?: string | undefined;
  wings: Position;
  position: Position | undefined;
  /** The week's action waiting for the race, if one was chosen. */
  input: WeekActionInput | undefined;
  onPosition: (position: Position) => void;
  onRun: () => void;
  /** Absent once the week's action already showed its result: the action is decided. */
  onBack?: (() => void) | undefined;
}) {
  const d = raceDistance(ctx, state, courseId);
  const course = gameText(ctx.content.getCourse(courseId).textKey);
  const track = trackCard(ctx, courseId);
  const [trackOpen, setTrackOpen] = useState(false);
  return (
    <div className={s.screen}>
      <div className={s.body}>
        <div className={cx(s.panel, s.raceCard)} id="m-precarrera">
          <p className={s.cap}>
            <Glyph name="flag" size={16} />
            {ui("ui.m.race.eyebrow", { turn: state.turn })}
          </p>
          {cup && (
            <p className={s.cupTag} id="m-copa" data-cup={cup}>
              {ui(`ui.m.cup.${cup}`)}
            </p>
          )}
          <h1 className={s.title}>{course}</h1>
          <p className={s.sub}>
            {minPlace === 1
              ? ui("ui.m.race.goal.win")
              : minPlace >= 8
                ? ui("ui.m.race.goal.run")
                : ui("ui.m.race.goal", { place: minPlace })}
          </p>
          {mirror && (
            <p className={s.mirrorNote} id="m-gerifalte">
              <Glyph name="eye" size={16} />
              {ui("ui.m.race.mirror")}
            </p>
          )}
          {named && (
            <p className={s.mirrorNote} id="m-rival-nombrada" data-rival={named}>
              <Glyph name="eye" size={16} />
              {ui(`ui.m.race.named.${named}`)}
            </p>
          )}
          {d && (
            <p className={s.raceFacts} id="m-precarrera-distancia" data-distance={d.distance}>
              <span>
                {ui("ui.position.race", {
                  distance: ui(`ui.flight.distance.${d.distance}`),
                  m: Math.round(d.lengthMm / 1000),
                })}
              </span>
              <Letter letter={d.letter} />
              {d.bornAs && <span>{ui("ui.position.race.born", { born: d.bornAs })}</span>}
            </p>
          )}
          {d?.passive && (
            <p className={s.raceFacts} id="m-precarrera-pasiva">
              {ui("ui.position.passive", { passive: gameText(`skill.${d.passive}`) })}
            </p>
          )}
          <TrackCardButton view={track} id="m-precarrera-pista" onOpen={() => setTrackOpen(true)} />
        </div>
        <PositionPicker
          id="m-posicion"
          className={s.picker}
          letters={state.positionAptitude}
          wings={wings}
          value={position ?? wings}
          onChange={onPosition}
          hint={ui(input ? "ui.m.race.hint.run" : "ui.m.race.hint.pick")}
        />
        {input && (
          <p className={s.note} id="m-precarrera-accion">
            {ui("ui.m.race.action", { action: describeInput(ctx, input) })}
          </p>
        )}
      </div>
      <div className={s.foot}>
        {onBack && (
          <button type="button" className={cx(s.btn, s.back)} id="m-volver" onClick={onBack}>
            <Glyph name="back" size={20} weight={2.4} />
            <span>{ui("ui.m.back")}</span>
          </button>
        )}
        <button
          type="button"
          className={cx(s.btn, s.btnMain)}
          id="m-correr"
          onClick={(e) => {
            if (e.detail > 1) return;
            onRun();
          }}
        >
          {input ? ui("ui.m.race.run") : ui("ui.m.race.ready")}
        </button>
      </div>
      <TrackSheet view={track} open={trackOpen} onClose={() => setTrackOpen(false)} />
    </div>
  );
}

/**
 * A goal race of the run: the v3 flight view (the replay component of the test view) with «Saltar»
 * to the result, then the result against the goal and the tip of the advice.
 */
export function RaceScreen({
  ctx,
  state,
  turn,
  showResult,
  onSkip,
  onReplay,
  onDone,
}: {
  ctx: SimContext;
  state: SeasonState;
  turn: number;
  showResult: boolean;
  onSkip: () => void;
  onReplay: () => void;
  onDone: () => void;
}) {
  const log = useGoalRaceLog(turn);
  const result = state.raceResults.find((r) => r.turn === turn);
  const ctxCourse = log ? pageLabels().courseName(log.courseId) : "";
  return (
    <div className={cx(s.screen, s.raceScreen)}>
      <div className={s.raceHead}>
        <div className={s.raceHeadT}>
          <small>{ui("ui.m.race.eyebrow", { turn })}</small>
          <b>{ctxCourse}</b>
        </div>
        {!showResult && (
          <button type="button" className={s.skip} id="m-saltar" onClick={onSkip}>
            <Glyph name="skip" size={18} weight={2.4} />
            {ui("ui.m.race.skip")}
          </button>
        )}
      </div>
      <div className={s.body}>
        {showResult ? (
          result && log ? (
            <ResultCard
              met={goalStatuses(ctx, state).find((g) => g.goal.turn === turn)?.met !== false}
              place={result.place}
              field={result.fieldSize}
              time={result.timeTicks}
              advice={<PlayerAdviceNote log={log} labels={pageLabels()} id="m-consejo" />}
            />
          ) : null
        ) : log ? (
          <div className={s.flightWrap}>
            <Replay log={log} labels={pageLabels()} idPrefix="m-carrera" onReveal={onSkip} />
          </div>
        ) : null}
      </div>
      {showResult && (
        <div className={s.foot}>
          <button
            type="button"
            className={cx(s.btn, s.back)}
            id="m-ver-otra-vez"
            onClick={onReplay}
          >
            <Glyph name="play" size={18} weight={2.4} />
            <span>{ui("ui.m.race.again")}</span>
          </button>
          <button
            type="button"
            className={cx(s.btn, s.btnMain)}
            id="m-carrera-seguir"
            onClick={(e) => {
              if (e.detail > 1) return;
              onDone();
            }}
          >
            {ui("ui.m.continue")}
          </button>
        </div>
      )}
    </div>
  );
}

function ResultCard({
  met,
  place,
  field,
  time,
  advice,
}: {
  met: boolean;
  place: number;
  field: number;
  time: number;
  advice: ReactNode;
}) {
  const failed = !met;
  return (
    <>
      <div
        className={cx(s.panel, s.result, failed ? s.resultBad : s.resultGood)}
        id="m-resultado"
        data-place={place}
        data-met={!failed}
      >
        <div className={s.resultPlace}>{ui("ui.m.race.place", { place })}</div>
        <div className={s.resultT}>
          <b>{ui(failed ? "ui.m.race.failed" : "ui.m.race.met")}</b>
          <span>{ui("ui.m.race.of", { n: field, time: formatSeconds(time) })}</span>
        </div>
      </div>
      {advice}
    </>
  );
}
