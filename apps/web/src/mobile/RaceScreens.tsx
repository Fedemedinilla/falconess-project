import type { CupRound, Position, SeasonState } from "@falconess/schema";
import type { SimContext } from "@falconess/sim";
import { type ReactNode, useState } from "react";
import { PlayerAdviceNote } from "../race/AdviceNote";
import { pageLabels, Replay } from "../race/RaceReplay";
import { describeInput } from "../screens/model/describe";
import { raceDistance, type WeekActionInput } from "../screens/model/position";
import { goalStatuses } from "../screens/model/season";
import { Letter } from "../screens/shared/Letter";
import { PositionPicker } from "../screens/shared/PositionPicker";
import { useGoalRaceLog } from "../screens/shared/useGoalRaceLog";
import { formatSeconds } from "../text/format";
import { gameText, ui } from "../text/ui";
import { cx } from "../ui/cx";
import { useFlowTimer } from "../ui/flowTimer";
import { isRepeatTap } from "../ui/tap";
import { Glyph } from "./Glyph";
import { useLeaving } from "./LayerHost";
import s from "./Mobile.module.css";
import { held, MOTION } from "./motion";
import { TrackCardButton, TrackSheet } from "./TrackCard";
import { trackCard } from "./track";
import { usePace } from "./usePace";

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
  /**
   * The position of the wings she races with, preselected: after the week's action on the decided
   * card (a workshop order may equip other wings, F5), the equipped ones on the planning card.
   */
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
      {/* a notice sits just over the card's foot */}
      <div className={s.foot} data-toast-anchor>
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
            if (isRepeatTap(e)) return;
            onRun();
          }}
        >
          {input ? ui("ui.m.race.run") : ui("ui.m.race.ready")}
        </button>
      </div>
      {/* its dialog is in the page only while open: the goals' sheet has its own (no id twice) */}
      <TrackSheet view={track} open={trackOpen} onClose={() => setTrackOpen(false)} />
    </div>
  );
}

/**
 * A goal race of the run: the v3 flight view (the replay component of the test view) with «Saltar»
 * to the result, then the result against the goal and the tip of the advice. `stage` is the flow's:
 * the replay; its finish, when it ended by itself (D7: the same replay at its last frame, her place
 * on a banner for `held(1.2 s)`, then it plays on by itself; a tap on it is «Saltar»); the race
 * held while a story scene plays over it (owner 2026-11-13: its result waits); or the result.
 * «Saltar», the banner and the replay's own end quote `play`, the key of what plays now, so a
 * stale one does nothing.
 */
export function RaceScreen({
  ctx,
  state,
  turn,
  stage,
  play,
  onSkip,
  onNext,
  onAgain,
  onContinue,
}: {
  ctx: SimContext;
  state: SeasonState;
  turn: number;
  stage: "replay" | "finish" | "held" | "result";
  play: string;
  /** «Saltar», or a tap on the finish's banner: the race to its result. */
  onSkip: (play: string) => void;
  /** The replay ended by itself (or its own «Final»). */
  onNext: (play: string) => void;
  /** «Ver otra vez». */
  onAgain: () => void;
  /** «Continuar». */
  onContinue: () => void;
}) {
  const log = useGoalRaceLog(turn);
  // «Ritmo» Rápido (owner 2026-11-14) starts the race at ×2 at least
  const pace = usePace();
  const result = state.raceResults.find((r) => r.turn === turn);
  const ctxCourse = log ? pageLabels().courseName(log.courseId) : "";
  const racing = stage === "replay" || stage === "finish";
  // the finish holds a moment, shorter on Rápido and Directo, then goes on by itself (silent)
  useFlowTimer(
    stage === "finish" ? held(MOTION.finishHold, pace, MOTION.finishHoldMin) : undefined,
    () => onNext(play),
    play,
  );
  return (
    <div className={cx(s.screen, s.raceScreen)}>
      <div className={s.raceHead}>
        <div className={s.raceHeadT}>
          <small>{ui("ui.m.race.eyebrow", { turn })}</small>
          <b>{ctxCourse}</b>
        </div>
        {racing && (
          <button type="button" className={s.skip} id="m-saltar" onClick={() => onSkip(play)}>
            <Glyph name="skip" size={18} weight={2.4} />
            {ui("ui.m.race.skip")}
          </button>
        )}
      </div>
      {stage === "result" ? (
        <RaceResult
          card={
            result && log ? (
              <ResultCard
                met={goalStatuses(ctx, state).find((g) => g.goal.turn === turn)?.met !== false}
                place={result.place}
                field={result.fieldSize}
                time={result.timeTicks}
                position={result.position}
                advice={
                  <PlayerAdviceNote
                    log={log}
                    labels={pageLabels()}
                    id="m-consejo"
                    className={s.resultAdvice}
                  />
                }
              />
            ) : null
          }
          onAgain={onAgain}
          onContinue={onContinue}
        />
      ) : (
        <div className={s.raceBody}>
          <div className={s.body}>
            {racing && log ? (
              <div className={s.flightWrap}>
                <Replay
                  log={log}
                  labels={pageLabels()}
                  idPrefix="m-carrera"
                  onReveal={() => onNext(play)}
                  minSpeed={pace === "fast" ? 2 : undefined}
                />
              </div>
            ) : null}
          </div>
          {stage === "finish" && result ? (
            <button
              type="button"
              className={s.finish}
              id="m-carrera-llegada"
              aria-label={ui("ui.m.result.next")}
              onClick={(e) => {
                if (isRepeatTap(e)) return;
                onSkip(play);
              }}
            >
              <span className={s.finishPlace}>
                {ui("ui.m.race.place", { place: result.place })}
              </span>
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}

/**
 * The race's result coming in (H1): the panel rises and fades in, its place stamps, the advice and
 * the foot (the notices' anchor) fade in after it, by opacity only, so «Continuar» takes a tap
 * from the first frame and the foot stands where it lands. When a scene's exit is what it mounted
 * under (the same commit as the exit's start, D7), all of it waits until the scene's black has
 * mostly cleared (`data-after`): read once, at its mount.
 */
function RaceResult({
  card,
  onAgain,
  onContinue,
}: {
  card: ReactNode;
  onAgain: () => void;
  onContinue: () => void;
}) {
  const leaving = useLeaving();
  const [afterScene] = useState(leaving === "scene");
  return (
    <div className={s.resultIn} data-after={afterScene ? "scene" : undefined}>
      <div className={s.body}>{card}</div>
      {/* a notice (the scene after the race) sits just over the result's foot */}
      <div className={s.foot} data-toast-anchor>
        <button
          type="button"
          className={cx(s.btn, s.back)}
          id="m-ver-otra-vez"
          onClick={(e) => {
            if (isRepeatTap(e)) return;
            onAgain();
          }}
        >
          <Glyph name="play" size={18} weight={2.4} />
          <span>{ui("ui.m.race.again")}</span>
        </button>
        <button
          type="button"
          className={cx(s.btn, s.btnMain)}
          id="m-carrera-seguir"
          onClick={(e) => {
            if (isRepeatTap(e)) return;
            onContinue();
          }}
        >
          {ui("ui.m.continue")}
        </button>
      </div>
    </div>
  );
}

function ResultCard({
  met,
  place,
  field,
  time,
  position,
  advice,
}: {
  met: boolean;
  place: number;
  field: number;
  time: number;
  /** owner 2026-11-13: the position she ran, here instead of a dialog back on the menu */
  position: Position | undefined;
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
          {position && (
            <span className={s.resultPos} id="m-resultado-posicion" data-position={position}>
              {ui("ui.m.race.ranAs", { position: gameText(`position.${position}`) })}
            </span>
          )}
        </div>
      </div>
      {advice}
    </>
  );
}
