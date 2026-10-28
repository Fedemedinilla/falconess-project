import type { RunInput } from "@falconess/schema";
import { useEffect, useRef, useState } from "react";
import { useGame } from "../game/useGame";
import { formatSeconds } from "../text/format";
import { gameText, ui } from "../text/ui";
import { Button } from "../ui/Button";
import { Livery } from "../ui/Livery";
import { Pill } from "../ui/Pill";
import { SeasonStrip } from "../ui/SeasonStrip";
import { type ActionKind, actionPreview } from "./model/actions";
import { freshRace, goalStatuses, nextGoal, recentWeeks } from "./model/season";
import { useViewRace } from "./shared/useViewRace";
import s from "./Turn.module.css";
import { TurnActions } from "./TurnActions";
import { GoalsPanel, HangarPanel, LogPanel } from "./TurnSide";
import { TurnProfile, TurnStatus } from "./TurnStatus";
import { Workshop } from "./Workshop";

const LOG_WEEKS = 6;

/**
 * The week in play: the season strip, the result of the goal race that just ran, the Falconess,
 * the eight actions (or the workshop), the goal races, the hangar and the recent log. Every number
 * is the sim's: the state of the run, previews from sim functions (model/actions.ts).
 */
export function Turn() {
  const { game, snap } = useGame();
  const [previewKind, setPreviewKind] = useState<ActionKind | undefined>();
  const [workshopOpen, setWorkshopOpen] = useState(false);
  const [undone, setUndone] = useState(false);
  const backToActions = useRef(false);

  // leaving the workshop puts the focus back on the button that opened it
  useEffect(() => {
    if (workshopOpen || !backToActions.current) return;
    backToActions.current = false;
    document.getElementById("accion-workshop")?.focus();
  }, [workshopOpen]);
  const closeWorkshop = () => {
    backToActions.current = true;
    setWorkshopOpen(false);
  };
  const viewRace = useViewRace();
  const run = snap.run;
  if (!run) return null;

  const ctx = game.context();
  const state = run.state;
  const turns = ctx.ruleset.season.turns;
  const falconess = ctx.content.getFalconess(state.falconessId);
  const sponsor = ctx.content.getManufacturer(falconess.sponsor);
  const goals = goalStatuses(ctx, state);
  const next = nextGoal(ctx, state);
  const fresh = freshRace(ctx, state);
  const preview = previewKind && actionPreview(ctx, state, previewKind);

  // the run this render shows: a click meant for it is ignored once the run has moved on
  const inputsShown = run.inputs.length;
  const act = (input: RunInput) => {
    setUndone(false);
    if (game.act(input, inputsShown)) setPreviewKind(undefined);
  };
  const undo = () => {
    setWorkshopOpen(false);
    setUndone(game.undoLast());
  };

  return (
    <div className={s.turn}>
      <header className={s.head}>
        <div className={s.week}>
          <span className={s.weekLabel}>{ui("ui.turn.week")}</span>
          <span className={s.weekNum}>{state.turn}</span>
          <span className={s.weekOf}>{ui("ui.turn.weekOf", { turns })}</span>
        </div>
        <div className={s.who}>
          <h1 className={s.name}>{gameText(falconess.textKey)}</h1>
          <p className={s.sub}>
            <Livery palette={sponsor.palette} size="sm" />
            <span>{gameText(sponsor.textKey)}</span>
            <span className={s.seed}>{ui("ui.turn.seed", { seed: run.seed })}</span>
            {state.injuryTurns > 0 && (
              <Pill tone="bad" solid>
                {ui("ui.action.injured")}
              </Pill>
            )}
            {state.fatigue >= ctx.ruleset.season.forcedRestAt && (
              <Pill tone="warn" solid>
                {ui("ui.action.forcedRest")}
              </Pill>
            )}
          </p>
        </div>
        <div className={s.tools}>
          <Button
            id="turno-deshacer"
            size="sm"
            onClick={undo}
            disabled={run.inputs.length <= 1}
            title={ui("ui.turn.undo.title")}
          >
            {ui("ui.turn.undo")}
          </Button>
          <p className={s.undone} aria-live="polite">
            {undone ? ui("ui.run.undone") : ""}
          </p>
        </div>
        <div className={s.strip}>
          <SeasonStrip
            turns={turns}
            current={state.turn}
            marks={goals.map((g) => ({
              turn: g.goal.turn,
              label: g.result
                ? ui("ui.turn.strip.place", { place: g.result.place })
                : ui("ui.goals.week", { turn: g.goal.turn }),
            }))}
            label={ui("ui.turn.strip.label", {
              turn: state.turn,
              turns,
              weeks: goals.map((g) => g.goal.turn).join(", "),
            })}
          />
        </div>
      </header>

      {fresh?.result && (
        <section className={s.result} aria-labelledby="turno-resultado">
          <div className={s.resultHead}>
            <p className={s.resultEyebrow}>{ui("ui.result.eyebrow", { turn: fresh.goal.turn })}</p>
            <h2 className={s.resultCourse} id="turno-resultado">
              {gameText(ctx.content.getCourse(fresh.goal.courseId).textKey)}
            </h2>
          </div>
          <dl className={s.resultNums}>
            <div>
              <dt>{ui("ui.result.place")}</dt>
              <dd>
                {ui("ui.result.placeValue", { place: fresh.result.place })}
                <span className={s.resultOf}>
                  {ui("ui.result.of", { field: fresh.result.fieldSize })}
                </span>
              </dd>
            </div>
            <div>
              <dt>{ui("ui.result.time")}</dt>
              <dd>
                {formatSeconds(fresh.result.timeTicks)}
                <span className={s.resultOf}>{ui("ui.result.seconds")}</span>
              </dd>
            </div>
            <div>
              <dt>{ui("ui.result.goal")}</dt>
              <dd className={s.resultGoal}>
                {ui("ui.goals.need", { place: fresh.goal.minPlace })}
                <Pill tone={fresh.met ? "good" : "bad"} solid>
                  {ui(fresh.met ? "ui.result.met" : "ui.result.failed")}
                </Pill>
              </dd>
            </div>
          </dl>
          <Button
            id="turno-ver-carrera"
            variant="primary"
            onClick={() => viewRace(fresh.goal.turn)}
          >
            {ui("ui.race.view")}
          </Button>
        </section>
      )}

      <div className={s.board}>
        <div className={s.left}>
          <TurnStatus ctx={ctx} state={state} preview={preview} className={s.status} />
          <TurnProfile ctx={ctx} state={state} className={s.profile} />
          <LogPanel ctx={ctx} weeks={recentWeeks(state, LOG_WEEKS)} className={s.log} />
        </div>
        <div className={s.right}>
          {workshopOpen ? (
            <Workshop className={s.actions} onClose={closeWorkshop} onDone={closeWorkshop} />
          ) : (
            <TurnActions
              ctx={ctx}
              state={state}
              next={next}
              onAct={act}
              onOpenWorkshop={() => {
                setPreviewKind(undefined);
                setWorkshopOpen(true);
              }}
              onPreview={setPreviewKind}
              className={s.actions}
            />
          )}
          <div className={s.pair}>
            <GoalsPanel
              ctx={ctx}
              state={state}
              next={next}
              goals={goals}
              onViewRace={viewRace}
              className={s.goals}
            />
            <HangarPanel ctx={ctx} state={state} className={s.hangar} />
          </div>
        </div>
      </div>
    </div>
  );
}
