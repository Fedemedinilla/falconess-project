import { STAT_ORDER } from "@falconess/sim";
import { useMemo, useRef, useState } from "react";
import { copyOrSelect } from "../app/copy";
import { navigate } from "../app/useRoute";
import { useGame } from "../game/useGame";
import { formatInt, formatSeconds, formatSigned } from "../text/format";
import { gameText, ui } from "../text/ui";
import { Button } from "../ui/Button";
import { cx } from "../ui/cx";
import { Livery } from "../ui/Livery";
import { Panel } from "../ui/Panel";
import { Pill } from "../ui/Pill";
import { StatBar } from "../ui/StatBar";
import { Table } from "../ui/Table";
import { seasonSummary } from "./model/end";
import { goalStatuses } from "./model/season";
import s from "./SeasonEnd.module.css";
import { Letter } from "./shared/Letter";
import { useViewRace } from "./shared/useViewRace";

type CopyStatus = "idle" | "copied" | "selected";

const STARS = ["first", "second", "third"] as const;

/** A black box factor's stars, out of three. */
function Stars({ n }: { n: number }) {
  return (
    <span className={s.stars} role="img" aria-label={ui("ui.end.stars", { n, of: STARS.length })}>
      {STARS.map((star, i) => (
        <span key={star} className={i < n ? s.starOn : s.starOff} aria-hidden="true">
          ★
        </span>
      ))}
    </span>
  );
}

/**
 * The closed season: grade and why it ended, final stats, the goal races with their replays, the
 * black box it leaves, and the run to copy. Numbers from the sim (model/end.ts).
 */
export function SeasonEnd() {
  const { game, snap } = useGame();
  const viewRace = useViewRace();
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [copy, setCopy] = useState<CopyStatus>("idle");
  const [confirmNew, setConfirmNew] = useState(false);
  const run = snap.run;
  const summary = useMemo(
    () =>
      run && run.state.status === "ended"
        ? seasonSummary(game.context(), run.state, run.seed, run.inputs)
        : undefined,
    [game, run],
  );
  if (!run || !summary) return null;

  const ctx = game.context();
  const content = ctx.content;
  const state = run.state;
  const falconess = content.getFalconess(state.falconessId);
  const sponsor = content.getManufacturer(falconess.sponsor);
  const goals = goalStatuses(ctx, state);
  const text = game.exportText() ?? "";
  const box = summary.blackBox;
  const affinity = content.getManufacturer(box.factors.frameAffinity);

  const onCopy = () => {
    copyOrSelect(text, textRef.current).then(setCopy, () => setCopy("selected"));
  };
  const startNew = () => {
    setConfirmNew(false);
    game.newSeason();
    navigate("temporada");
  };
  const onNew = () => {
    if (!snap.saved && copy !== "copied") setConfirmNew(true);
    else startNew();
  };
  const undo = () => {
    if (game.undoLast()) navigate("temporada");
  };

  const aptitude = box.factors.aptitude;
  const aptitudeName =
    aptitude.kind === "biome"
      ? gameText(`biome.${aptitude.key}`)
      : gameText(`style.${aptitude.key}`);

  return (
    <div className={s.end}>
      <header className={s.head}>
        <div className={s.grade}>
          <span className={s.gradeLabel}>{ui("ui.end.grade")}</span>
          <span className={s.gradeValue}>{summary.grade}</span>
        </div>
        <div className={s.who}>
          <p className={s.eyebrow}>
            {ui("ui.end.eyebrow", { seed: run.seed, ruleset: run.rulesetVersion })}
          </p>
          <h1 className={s.title}>{ui("ui.screen.seasonEnd.title")}</h1>
          <p className={s.sub}>
            <Livery palette={sponsor.palette} size="sm" />
            <strong>{gameText(falconess.textKey)}</strong>
            {summary.endReason === "completed" ? (
              <Pill tone="good" solid>
                {ui("ui.end.completed")}
              </Pill>
            ) : (
              <Pill tone="bad" solid>
                {ui("ui.end.failed", { turn: summary.failedTurn ?? state.turn })}
              </Pill>
            )}
          </p>
          {summary.cap !== undefined && (
            <p className={s.capNote}>{ui("ui.end.cap", { cap: summary.cap })}</p>
          )}
        </div>
        <dl className={s.numbers}>
          <div>
            <dt>{ui("ui.end.score")}</dt>
            <dd>{formatInt(summary.score)}</dd>
          </div>
          <div>
            <dt>{ui("ui.end.feathers")}</dt>
            <dd>{formatSigned(summary.feathers)}</dd>
          </div>
          <div>
            <dt>{ui("ui.end.weeks")}</dt>
            <dd>
              {ui("ui.end.weeks.value", { turn: state.turn, turns: ctx.ruleset.season.turns })}
            </dd>
          </div>
        </dl>
        <ol className={s.ladder} aria-label={ui("ui.end.ladder")}>
          {summary.ladder.map((step) => (
            <li
              key={step.grade}
              className={cx(
                s.rung,
                step.grade === summary.grade && s.rungNow,
                summary.cap !== undefined &&
                  summary.ladder.findIndex((r) => r.grade === step.grade) >
                    summary.ladder.findIndex((r) => r.grade === summary.cap) &&
                  s.rungCapped,
              )}
            >
              <span className={s.rungGrade}>{step.grade}</span>
              <span className={s.rungMin}>{formatInt(step.min)}</span>
            </li>
          ))}
        </ol>
      </header>

      <div className={s.grid}>
        <Panel title={ui("ui.end.races")} flush className={s.races}>
          <Table
            caption={ui("ui.end.races")}
            dense
            columns={[
              { key: "turn", label: ui("ui.end.col.turn"), align: "end" },
              { key: "course", label: ui("ui.end.col.course") },
              { key: "place", label: ui("ui.end.col.place"), align: "end" },
              { key: "goal", label: ui("ui.end.col.goal"), align: "end" },
              { key: "time", label: ui("ui.end.col.time"), align: "end" },
              { key: "frame", label: ui("ui.end.col.frame") },
              { key: "view", label: ui("ui.end.col.view"), align: "end" },
            ]}
            rows={goals.map((g) => ({
              key: String(g.goal.turn),
              highlight: g.met === false,
              cells: [
                ui("ui.goals.week", { turn: g.goal.turn }),
                gameText(content.getCourse(g.goal.courseId).textKey),
                g.result ? (
                  <Pill key="place" tone={g.met ? "good" : "bad"}>
                    {ui("ui.goals.place", { place: g.result.place, field: g.result.fieldSize })}
                  </Pill>
                ) : (
                  <span key="place" className={s.muted}>
                    {ui("ui.end.notRun")}
                  </span>
                ),
                <span key="goal" className={s.nowrap}>
                  {ui("ui.goals.need", { place: g.goal.minPlace })}
                </span>,
                g.result ? (
                  <span key="time" className={s.nowrap}>
                    {ui("ui.end.time", { time: formatSeconds(g.result.timeTicks) })}
                  </span>
                ) : (
                  ""
                ),
                g.result ? gameText(content.getFrame(g.result.frameId).textKey) : "",
                g.result ? (
                  <Button
                    key="view"
                    id={`fin-ver-${g.goal.turn}`}
                    size="sm"
                    onClick={() => viewRace(g.goal.turn)}
                    aria-label={ui("ui.race.view.aria", {
                      course: gameText(content.getCourse(g.goal.courseId).textKey),
                      turn: g.goal.turn,
                    })}
                  >
                    {ui("ui.race.view")}
                  </Button>
                ) : (
                  ""
                ),
              ],
            }))}
          />
        </Panel>

        <Panel title={ui("ui.end.stats")} className={s.stats}>
          <div className={s.statList}>
            {STAT_ORDER.map((stat) => (
              <StatBar
                key={stat}
                label={gameText(`stat.${stat}`)}
                value={state.stats[stat]}
                max={ctx.ruleset.season.statMax}
                preview={state.stats[stat] - summary.startStats[stat]}
                size="sm"
              />
            ))}
          </div>
          <p className={s.note}>{ui("ui.end.stats.note")}</p>
          <p className={s.skillsLabel}>{ui("ui.end.skills", { n: state.learnedSkills.length })}</p>
          <ul className={s.skills}>
            {state.learnedSkills.map((id) => (
              <li key={id}>{gameText(content.getSkill(id).textKey)}</li>
            ))}
          </ul>
        </Panel>

        <Panel title={ui("ui.end.box")} className={s.box}>
          <p className={s.note}>{ui("ui.end.box.lead")}</p>
          <dl className={s.factors}>
            <div className={cx(s.factor, s.blue)}>
              <dt>{ui("ui.end.box.stat")}</dt>
              <dd>
                <span className={s.factorValue}>{gameText(`stat.${box.factors.stat.stat}`)}</span>
                <Stars n={box.factors.stat.stars} />
              </dd>
            </div>
            <div className={cx(s.factor, s.red)}>
              <dt>{ui("ui.end.box.aptitude")}</dt>
              <dd>
                <span className={s.factorValue}>
                  {aptitudeName} <Letter letter={aptitude.letter} />
                </span>
                <Stars n={aptitude.stars} />
              </dd>
            </div>
            <div className={cx(s.factor, s.green)}>
              <dt>{ui("ui.end.box.skills")}</dt>
              <dd>
                <span className={s.factorValue}>
                  {box.factors.skills.length === 0
                    ? ui("ui.end.box.noSkills")
                    : box.factors.skills
                        .map((k) => gameText(content.getSkill(k).textKey))
                        .join(", ")}
                </span>
              </dd>
            </div>
            <div className={s.factor}>
              <dt>{ui("ui.end.box.affinity")}</dt>
              <dd>
                <span className={s.factorValue}>
                  <Livery palette={affinity.palette} size="sm" />
                  {gameText(affinity.textKey)}
                </span>
              </dd>
            </div>
          </dl>
          <p className={s.boxId}>{ui("ui.end.box.id", { id: box.id })}</p>
        </Panel>

        <Panel title={ui("ui.end.run")} className={s.run}>
          <p className={s.note}>{ui("ui.end.run.lead")}</p>
          <label className={s.jsonLabel} htmlFor="fin-json">
            {ui("ui.run.json")}
          </label>
          <textarea
            ref={textRef}
            id="fin-json"
            className={s.json}
            readOnly
            rows={4}
            value={text}
            spellCheck={false}
          />
          <p className={s.status} aria-live="polite">
            {copy === "copied"
              ? ui("ui.run.copied")
              : copy === "selected"
                ? ui("ui.run.selected")
                : ""}
          </p>
          <div className={s.buttons}>
            <Button id="fin-copiar" variant="primary" onClick={onCopy}>
              {ui("ui.run.copy")}
            </Button>
            <Button id="fin-nueva" onClick={onNew}>
              {ui("ui.home.new")}
            </Button>
            <Button id="fin-deshacer" variant="ghost" onClick={undo}>
              {ui("ui.end.undo")}
            </Button>
          </div>
          {confirmNew && (
            <div className={s.confirm} role="alert">
              <p>{ui("ui.end.discard")}</p>
              <div className={s.buttons}>
                <Button id="fin-descartar" variant="danger" size="sm" onClick={startNew}>
                  {ui("ui.home.discard.confirm")}
                </Button>
                <Button
                  id="fin-descartar-cancelar"
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmNew(false)}
                >
                  {ui("ui.home.discard.cancel")}
                </Button>
              </div>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
