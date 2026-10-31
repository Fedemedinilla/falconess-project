import type { RunInput } from "@falconess/schema";
import { useEffect, useRef, useState } from "react";
import { ScreenExplainDefault } from "../app/ExplainDefault";
import { useGame } from "../game/useGame";
import { gameText, ui, uiCount } from "../text/ui";
import { Livery } from "../ui/Livery";
import { Pill } from "../ui/Pill";
import { SeasonStrip } from "../ui/SeasonStrip";
import { type ActionKind, actionBlock, actionPreview } from "./model/actions";
import { goalStatuses, nextGoal, recentWeeks } from "./model/season";
import { useViewRace } from "./shared/useViewRace";
import s from "./Turn.module.css";
import { TurnActions } from "./TurnActions";
import { GoalsPanel, HangarPanel, LogPanel } from "./TurnSide";
import { TurnProfile, TurnStatus } from "./TurnStatus";
import { WeekDialog } from "./WeekDialog";
import { Workshop } from "./Workshop";

const LOG_WEEKS = 6;

/**
 * The week in play: the season strip, the Falconess, the eight actions (or the workshop) under a
 * one-line recap of last week, the goal races, the hangar and the recent log. After every input
 * «Lo que pasó» (WeekDialog) opens over it with what happened, a goal race's result included.
 * Every number is the sim's: the state of the run, previews from sim functions (model/actions.ts).
 */
export function Turn() {
  const { game, snap } = useGame();
  const [previewKind, setPreviewKind] = useState<ActionKind | undefined>();
  const [workshopOpen, setWorkshopOpen] = useState(false);
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
  const ctx = game.context();
  if (!run) return null;

  const state = run.state;
  const turns = ctx.ruleset.season.turns;
  const falconess = ctx.content.getFalconess(state.falconessId);
  const sponsor = ctx.content.getManufacturer(falconess.sponsor);
  const goals = goalStatuses(ctx, state);
  const next = nextGoal(ctx, state);
  const preview = previewKind && actionPreview(ctx, state, previewKind);

  // the run this render shows: a click meant for it is ignored once the run has moved on
  const inputsShown = run.inputs.length;
  const act = (input: RunInput) => {
    if (!game.act(input, inputsShown)) return;
    setPreviewKind(undefined);
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
            <span className={s.seed}>
              {ui("ui.turn.seed", { seed: run.seed, ruleset: run.rulesetVersion })}
            </span>
            {state.injuryTurns > 0 && (
              <Pill tone="bad" solid icon="injury">
                {ui("ui.action.injured")}
              </Pill>
            )}
            {actionBlock(ctx, state, "train:agility") === "forced-rest" && (
              <Pill tone="warn" solid icon="action.rest">
                {ui("ui.action.forcedRest")}
              </Pill>
            )}
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
        {next && (
          <p className={s.next}>
            {ui("ui.turn.next", {
              course: gameText(ctx.content.getCourse(next.goal.courseId).textKey),
              turn: next.goal.turn,
              when:
                next.weeksLeft === 0
                  ? ui("ui.turn.next.thisWeek")
                  : ui("ui.turn.next.inWeeks", {
                      weeks: uiCount("ui.count.weeks", next.weeksLeft),
                    }),
              place: next.goal.minPlace,
            })}
          </p>
        )}
        <ScreenExplainDefault className={s.explain} />
      </header>

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
              lastWeek={recentWeeks(state, 1)[0]}
              onReopen={snap.lastStep ? () => game.showStepAgain() : undefined}
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
              next={next}
              goals={goals}
              onViewRace={viewRace}
              className={s.goals}
            />
            <HangarPanel ctx={ctx} state={state} className={s.hangar} />
          </div>
        </div>
      </div>
      <WeekDialog onViewRace={viewRace} />
    </div>
  );
}
