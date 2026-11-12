import { type MouseEvent, useEffect, useMemo, useRef } from "react";
import type { GameSnapshot, Step } from "../game/controller";
import { useGame } from "../game/useGame";
import { PlayerAdviceNote } from "../race/AdviceNote";
import { ADVICE_FROM_PLACE } from "../race/advice";
import { pageLabels } from "../race/RaceReplay";
import { formatSigned } from "../text/format";
import { gameText, ui } from "../text/ui";
import { Button } from "../ui/Button";
import { cx } from "../ui/cx";
import { Icon } from "../ui/Icon";
import { statIcon } from "../ui/icons";
import { Pill } from "../ui/Pill";
import { PositionMark } from "../ui/PositionMark";
import { type WeekNote, weekSummary } from "./model/week";
import { useGoalRaceLog } from "./shared/useGoalRaceLog";
import { actionButtonId } from "./TurnActions";
import { describeInput } from "./TurnSide";
import s from "./WeekDialog.module.css";

/** Ids of the dialog and its controls (the e2e tests and the focus logic use them). */
export const WEEK_DIALOG_ID = "semana-dialogo";
const TITLE_ID = "semana-titulo";
const BODY_ID = "semana-cambios";
const CONTINUE_ID = "semana-continuar";

/**
 * Whether «Lo que pasó» waits for the player: the last step of the run in play, not read yet. The
 * event dialog stays closed meanwhile, so the week's result shows first and the event after it.
 * The step that ends the season counts too: its popup opens over SeasonEnd (#fin).
 */
export function weekDialogWaiting(snap: GameSnapshot): boolean {
  const step = snap.lastStep;
  return step !== undefined && !snap.lastStepSeen && snap.run?.state === step.after;
}

/** A step's notes can repeat a key (their order is the log's): `key#n` tells them apart. */
function keyedNotes(notes: readonly WeekNote[]): { id: string; note: WeekNote }[] {
  const seen = new Map<string, number>();
  return notes.map((note) => {
    const n = (seen.get(note.key) ?? 0) + 1;
    seen.set(note.key, n);
    return { id: `${note.key}#${n}`, note };
  });
}

/** The notes a goal race leaves (the race's part of a split race week). */
const RACE_NOTE = /^log\.(race|goal|mood\.race)/;

/** Controls inside the dialog that Enter activates on its own. */
const INTERACTIVE = "button, a, input, select, textarea, summary";

export type WeekDialogProps = {
  /** "Ver carrera": open the replay of that week's goal race (`#carrera`). */
  onViewRace: (turn: number) => void;
  /** Extra class of the dialog (the phone game rounds it). */
  className?: string | undefined;
  /** Show the race tip (the phone game already showed it under the race's result). */
  advice?: boolean | undefined;
  /**
   * The phone game splits a race week in two (testers 2026-11-11): "action" shows what the week's
   * action did, as on any week, before the race (open while `actionOpen`, closed with
   * `onActionDone`, the step stays unread); "race" then shows the race and what came after it.
   * "all" (default) is the whole step at once.
   */
  part?: "all" | "action" | "race";
  actionOpen?: boolean;
  onActionDone?: () => void;
  /**
   * A step not applied yet (the phone game's race week, owner 2026-11-12): its action's result
   * shows before the race position is chosen. Only with `part="action"`.
   */
  preview?: Step | undefined;
};

/**
 * «Lo que pasó»: after every input (an action, a race week, an event's answer) a modal over the
 * Turn screen (over SeasonEnd for the input that ends the season) says what happened in one
 * headline, then the changes with their causes, the notes of the log, and on a race week the
 * place, the goal and the tip after the race (on a short screen the tip's leads only). It closes
 * with «Continuar», Enter, Esc or a click outside, and only then does a waiting event open. Read
 * once, it does not open again for that week (`GameController.acknowledgeStep`); the recap line
 * above the actions brings it back.
 */
export function WeekDialog({
  onViewRace,
  className,
  advice = true,
  part: wanted = "all",
  actionOpen = false,
  onActionDone,
  preview,
}: WeekDialogProps) {
  const { game, snap } = useGame();
  const step = preview ?? snap.lastStep;
  const summary = useMemo(
    () => (step ? weekSummary(game.context(), step) : undefined),
    [game, step],
  );
  // a week without a race has nothing to split
  const part = summary?.race ? wanted : "all";
  const open =
    part === "action"
      ? actionOpen && (preview !== undefined || weekDialogWaiting(snap))
      : weekDialogWaiting(snap);
  const race = part === "action" ? undefined : summary?.race;
  // a goal race finished 3rd or worse: the tip says what to train (Umamusume)
  const adviceLog = useGoalRaceLog(
    advice && open && race && race.place >= ADVICE_FROM_PLACE ? race.turn : undefined,
  );

  const ref = useRef<HTMLDialogElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  const pressedOutside = useRef(false);
  const fallbackId = summary?.weekAction ? actionButtonId(summary.weekAction) : undefined;

  // open as a modal (the page behind goes inert), focus «Continuar», and on close put the focus
  // back where it was (or on the week's action when that element is gone)
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !wasOpen.current) {
      wasOpen.current = true;
      const active = document.activeElement;
      returnTo.current = active instanceof HTMLElement && active !== document.body ? active : null;
      if (!dialog.open) {
        if (typeof dialog.showModal === "function") dialog.showModal();
        else dialog.setAttribute("open", "");
      }
      dialog.querySelector<HTMLElement>(`#${CONTINUE_ID}`)?.focus();
    } else if (!open && wasOpen.current) {
      wasOpen.current = false;
      if (dialog.open) dialog.close();
      const back = returnTo.current;
      returnTo.current = null;
      // on SeasonEnd the week's action is gone: the focus goes to the page's main region
      const target =
        back?.isConnected && !back.closest("[inert]")
          ? back
          : ((fallbackId ? document.getElementById(fallbackId) : null) ??
            document.querySelector<HTMLElement>("main"));
      target?.focus();
    }
  }, [open, fallbackId]);

  if (!step || !summary) return null;

  const close = () => (part === "action" ? onActionDone?.() : game.acknowledgeStep());
  const ctx = game.context();
  // the action's part leads with the action's own line; the race's with the race
  const headline = part === "action" ? (summary.actionLine ?? summary.headline) : summary.headline;
  const showAction = part !== "race";
  const notes =
    part === "action"
      ? summary.notes.filter((n) => !RACE_NOTE.test(n.key))
      : part === "race"
        ? summary.notes.filter((n) => RACE_NOTE.test(n.key))
        : summary.notes;

  const onBackdrop = (e: MouseEvent<HTMLDialogElement>) => {
    // the dialog box fills the element: a click on the element itself is on the backdrop; the
    // second click of the double click that took the action must not close what it opened
    if (e.target !== e.currentTarget || !pressedOutside.current || e.detail > 1) return;
    close();
  };

  return (
    <dialog
      ref={ref}
      id={WEEK_DIALOG_ID}
      className={cx(s.dialog, s[headline.tone], className)}
      data-tone={headline.tone}
      aria-labelledby={TITLE_ID}
      aria-describedby={BODY_ID}
      aria-modal="true"
      // a click on its text keeps the focus inside (on the dialog), so Enter still closes it
      tabIndex={-1}
      onClose={close}
      onPointerDown={(e) => {
        pressedOutside.current = e.target === e.currentTarget;
      }}
      onMouseDown={(e) => {
        // the second press of the double click that took the action leaves the focus on «Continuar»
        if (e.detail > 1) e.preventDefault();
      }}
      onClick={onBackdrop}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        // a held key must not close it the instant it opens
        if (e.repeat) {
          e.preventDefault();
          return;
        }
        if (e.target instanceof Element && e.target.closest(INTERACTIVE)) return;
        e.preventDefault();
        close();
      }}
    >
      {open && (
        <div className={s.box}>
          <header className={s.head}>
            <p className={s.eyebrow}>
              <span className={s.label}>{ui("ui.week.label")}</span>
              <span>
                {ui("ui.week.eyebrow", {
                  turn: summary.turn,
                  action: describeInput(ctx, summary.input),
                })}
              </span>
            </p>
            <h2 className={s.title} id={TITLE_ID}>
              <Icon name={headline.icon} size="lg" className={s.titleIcon} />
              <span>{headline.text}</span>
            </h2>
            {part !== "action" && summary.context !== undefined && (
              <p className={s.context}>
                {race && (
                  // the race position she ran in (ADR-0008), first: what the player chose
                  <>
                    <span
                      className={cx(s.position, !race.fromWings && s.positionChosen)}
                      id="semana-posicion"
                      data-position={race.position}
                    >
                      <PositionMark position={race.position} />
                      {gameText(`position.${race.position}`)}
                    </span>
                    {" · "}
                  </>
                )}
                {summary.context}
              </p>
            )}
          </header>

          <div className={s.body} id={BODY_ID}>
            {part === "all" && summary.actionLine && (
              <p className={cx(s.line, s[`line-${summary.actionLine.tone}`])}>
                <Icon name={summary.actionLine.icon} />
                {summary.actionLine.text}
              </p>
            )}
            {part !== "action" && summary.event && (
              <div
                className={cx(s.event, s[`event-${summary.event.tone}`])}
                id="semana-evento"
                data-tone={summary.event.tone}
              >
                <p className={s.line}>
                  <Icon name="event" />
                  {summary.event.text}
                </p>
                {summary.event.option !== undefined && (
                  <p className={s.eventOption}>{summary.event.option}</p>
                )}
                {summary.event.outcome !== undefined && (
                  <p className={cx(s.eventOutcome, s[`line-${summary.event.tone}`])}>
                    {summary.event.outcome}
                  </p>
                )}
                {summary.event.effects.length > 0 && (
                  <ul
                    className={s.eventEffects}
                    id="semana-evento-efectos"
                    aria-label={ui("ui.week.event.effects")}
                  >
                    {summary.event.effects.map((line) => (
                      <li key={line.text}>
                        <Icon name={line.icon} />
                        {line.text}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {showAction && summary.stats.length > 0 && (
              <ul className={s.stats} aria-label={ui("ui.turn.stats")}>
                {summary.stats.map(({ stat, delta }) => (
                  <li key={stat} className={delta < 0 ? s.down : s.up}>
                    <Icon name={statIcon(stat)} />
                    <span className={s.statName}>{gameText(`stat.${stat}`)}</span>
                    <strong className={s.statValue}>{formatSigned(delta)}</strong>
                  </li>
                ))}
              </ul>
            )}
            {showAction && summary.rows.length > 0 && (
              <ul className={s.rows} aria-label={ui("ui.week.changes")}>
                {summary.rows.map((row) => (
                  <li key={`${row.id}-${row.value}-${row.cause ?? ""}`} className={s.row}>
                    <span className={s.rowLabel}>
                      <Icon name={row.icon} />
                      {row.label}
                    </span>
                    <strong className={cx(s.rowValue, s[`value-${row.tone}`])}>{row.value}</strong>
                    {row.to !== undefined && <span className={s.rowTo}>→ {row.to}</span>}
                    {row.band && (
                      <Pill tone={row.band.tone === "neutral" ? "neutral" : row.band.tone}>
                        {row.band.label}
                      </Pill>
                    )}
                    {row.cause !== undefined && (
                      // a drop in mood says why in its own color: it is the news of the week
                      <span
                        className={cx(
                          s.rowCause,
                          row.id === "mood" && row.tone === "bad" && s.causeBad,
                        )}
                      >
                        {row.cause}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {showAction && summary.stats.length === 0 && summary.rows.length === 0 && (
              <p className={s.none}>{ui("ui.week.none")}</p>
            )}
            {keyedNotes(notes).map(({ id, note }) => (
              <p
                key={id}
                className={cx(s.line, s.note, note.tone !== "neutral" && s[`note-${note.tone}`])}
                data-note={note.key}
              >
                {note.icon && <Icon name={note.icon} />}
                {note.text}
              </p>
            ))}
            {adviceLog && (
              <PlayerAdviceNote
                log={adviceLog}
                labels={pageLabels()}
                id="semana-consejo"
                className={s.advice}
              />
            )}
          </div>

          <footer className={s.foot}>
            {part !== "action" && summary.eventNext && (
              // in the footer, next to «Continuar»: it never scrolls out of sight
              <p className={cx(s.line, s.next)} id="semana-evento-espera">
                <Icon name="event" />
                {ui("ui.week.eventNext")}
              </p>
            )}
            {race && (
              <Button
                id="semana-ver-carrera"
                onClick={(e) => {
                  if (e.detail > 1) return;
                  close();
                  onViewRace(race.turn);
                }}
              >
                {ui("ui.race.view")}
              </Button>
            )}
            <Button
              id={CONTINUE_ID}
              variant="primary"
              className={s.continue}
              onClick={(e) => {
                if (e.detail > 1) return;
                close();
              }}
            >
              {ui("ui.week.continue")}
            </Button>
          </footer>
        </div>
      )}
    </dialog>
  );
}
