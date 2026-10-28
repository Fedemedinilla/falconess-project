import { PLAYER_RUNNER_ID } from "@falconess/sim";
import { useMemo, useState } from "react";
import { navigate } from "../app/useRoute";
import { goalRaceLog } from "../game/goal-race";
import { useGame } from "../game/useGame";
import { gameText, ui } from "../text/ui";
import { Button } from "../ui/Button";
import { Pill } from "../ui/Pill";
import { type GoalRaceStep, goalRaceSteps } from "./goal-races";
import { Replay } from "./RaceReplay";
import s from "./RaceViewer.module.css";

function Empty({ hasRun }: { hasRun: boolean }) {
  return (
    <section className={s.screen} aria-labelledby="carrera-titulo">
      <header className={s.screenHead}>
        <h1 className={s.screenTitle} id="carrera-titulo">
          {ui("ui.goalRace.title")}
        </h1>
        <p className={s.screenLead}>{ui(hasRun ? "ui.goalRace.none.run" : "ui.goalRace.none")}</p>
      </header>
      <div className={s.screenActions}>
        <Button id="carrera-temporada" variant="primary" onClick={() => navigate("temporada")}>
          {ui(hasRun ? "ui.goalRace.back" : "ui.goalRace.season")}
        </Button>
        <Button id="carrera-libre-ir" onClick={() => navigate("carrera-libre")}>
          {ui("ui.goalRace.free")}
        </Button>
      </div>
    </section>
  );
}

/**
 * #carrera: a goal race of the run in play, replayed. The run is replayed once by the sim to find
 * its goal races; the one shown is rebuilt with detail "full" on the same state, field and seed
 * (P7: the same places and times the season recorded). It opens on the race of the last step, or
 * on the latest one.
 */
export function GoalRaceScreen() {
  const { game, snap } = useGame();
  const run = snap.run;
  const ctx = game.context();
  // the run changes identity with every input, and with it the context (its ruleset)
  const steps = useMemo(
    () => (run ? goalRaceSteps(game.context(), run.seed, run.inputs) : []),
    [game, run],
  );
  const lastIndex = snap.lastStep && run ? run.inputs.length - 1 : -1;
  const initial = steps.find((st) => st.index === lastIndex) ?? steps[steps.length - 1];
  const [chosen, setChosen] = useState<number | undefined>(undefined);
  const step: GoalRaceStep | undefined = steps.find((st) => st.turn === chosen) ?? initial;
  const log = useMemo(
    () => (step ? goalRaceLog(game.context(), step.before, step.input) : undefined),
    [game, step],
  );

  if (!run || !step || !log) return <Empty hasRun={run !== undefined} />;

  const recorded = run.state.raceResults.find((r) => r.turn === step.turn);
  const mine = log.results.find((r) => r.runnerId === PLAYER_RUNNER_ID);
  const replayPlace = mine ? (mine.dnf ? log.results.length : mine.place) : undefined;
  const matches = recorded === undefined || replayPlace === recorded.place;
  const course = ctx.content.courses.get(step.courseId);
  const courseName = course ? gameText(course.textKey) : step.courseId;
  const ended = run.state.status === "ended";

  return (
    <section className={s.screen} aria-labelledby="carrera-titulo">
      <header className={s.screenHead}>
        <p className={s.eyebrow}>{ui("ui.goalRace.eyebrow", { turn: step.turn })}</p>
        <h1 className={s.screenTitle} id="carrera-titulo">
          {courseName}
        </h1>
        <p className={s.screenLead}>
          <Pill tone="accent">{ui("ui.goalRace.goal", { place: step.minPlace })}</Pill>
          {recorded && (
            <Pill tone={recorded.place <= step.minPlace ? "good" : "bad"} solid>
              {ui("ui.goalRace.recorded", { place: recorded.place, n: recorded.fieldSize })}
            </Pill>
          )}
        </p>
      </header>
      <div className={s.screenActions}>
        {steps.length > 1 && (
          <span className={s.select}>
            <label htmlFor="carrera-elegir">{ui("ui.goalRace.pick")}</label>
            <select
              id="carrera-elegir"
              value={step.turn}
              onChange={(e) => setChosen(Number(e.currentTarget.value))}
            >
              {steps.map((st) => {
                const c = ctx.content.courses.get(st.courseId);
                return (
                  <option key={st.turn} value={st.turn}>
                    {ui("ui.goalRace.option", {
                      turn: st.turn,
                      course: c ? gameText(c.textKey) : st.courseId,
                    })}
                  </option>
                );
              })}
            </select>
          </span>
        )}
        <Button
          id="carrera-temporada"
          variant="primary"
          onClick={() => navigate(ended ? "fin" : "temporada")}
        >
          {ui(ended ? "ui.goalRace.back.end" : "ui.goalRace.back")}
        </Button>
      </div>
      {!matches && <p className={s.notice}>{ui("ui.goalRace.mismatch")}</p>}
      <Replay log={log} idPrefix="carrera" />
    </section>
  );
}
