import { type ReactNode, useEffect, useRef, useState } from "react";
import { useGame } from "../game/useGame";
import { gameText, ui } from "../text/ui";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { Livery } from "../ui/Livery";
import s from "./EventDialog.module.css";
import { describeOption } from "./model/describe";
import { weekDialogWaiting } from "./WeekDialog";

/**
 * The event waiting for an answer, as a modal built into the page. Each option says what it does,
 * with its chance branches. The event must be answered before the next action: closing the dialog
 * only hides it behind a bar that brings it back. It waits for «Lo que pasó» (WeekDialog): the
 * week's result is read first, then the event opens.
 */
export function EventDialog() {
  const { game, snap } = useGame();
  const pending = snap.run?.state.pendingEvent;
  const key = pending ? `${pending.eventId}/${pending.turn}` : "";
  const [hiddenFor, setHiddenFor] = useState<string | undefined>();
  const options = pending ? game.context().content.getEvent(pending.eventId).options.length : 0;
  const after = weekDialogWaiting(snap);
  const open = pending !== undefined && hiddenFor !== key && !after;

  // keys 1–3 answer while the dialog is open; the answer is for the run this dialog showed
  const inputs = snap.run?.inputs.length;
  const chooseRef = useRef<(option: number) => void>(() => undefined);
  chooseRef.current = (option: number) => {
    game.act({ kind: "event:choose", option }, inputs);
  };
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
      const n = Number.parseInt(e.key, 10);
      if (String(n) !== e.key || n < 1 || n > options) return;
      e.preventDefault();
      chooseRef.current(n - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, options]);

  if (!pending) return null;

  const ctx = game.context();
  const content = ctx.content;
  const event = content.getEvent(pending.eventId);
  const crewName = (id: string) =>
    content.manufacturers.has(id) ? gameText(content.getManufacturer(id).crew.textKey) : id;
  const hidden = hiddenFor === key;

  let source: ReactNode;
  switch (event.source.kind) {
    case "crew": {
      const m = content.getManufacturer(event.source.manufacturer);
      source = (
        <>
          <Livery palette={m.palette} size="sm" />
          {gameText(m.crew.textKey)}
        </>
      );
      break;
    }
    case "falconess":
      source = gameText(content.getFalconess(event.source.falconess).textKey);
      break;
    case "race-result":
      source = ui("ui.event.source.race");
      break;
    case "random":
      source = ui("ui.event.source.random");
      break;
  }

  const choose = chooseRef.current;

  return (
    <>
      <Dialog
        open={open}
        onClose={() => setHiddenFor(key)}
        title={ui("ui.screen.event.title")}
        icon="event"
        id="evento-dialogo"
        size="lg"
      >
        <p className={s.meta}>
          <span className={s.source}>{source}</span>
          <span>{ui("ui.goals.week", { turn: pending.turn })}</span>
        </p>
        <p className={s.text}>{gameText(event.textKey)}</p>
        <ol className={s.options}>
          {event.options.map((option, i) => {
            const summary = describeOption(option, crewName);
            return (
              <li key={option.textKey}>
                <button
                  type="button"
                  id={`evento-opcion-${i}`}
                  className={s.option}
                  onClick={(e) => {
                    // a dialog that opened under a double click must not take its second click
                    if (e.detail > 1) return;
                    choose(i);
                  }}
                >
                  <span className={s.optionKey} aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className={s.optionText}>{gameText(option.textKey)}</span>
                  <span className={s.effects}>
                    {summary.sure.length === 0 && summary.branches.length === 0 ? (
                      <span className={s.none}>{ui("ui.fx.none")}</span>
                    ) : (
                      summary.sure.map((line) => (
                        <span key={line.text} className={s.effect}>
                          <Icon name={line.icon} />
                          {line.text}
                        </span>
                      ))
                    )}
                  </span>
                  {summary.branches.length > 0 && (
                    <span className={s.chance}>
                      <span className={s.chanceLabel}>
                        <Icon name="risk" />
                        {ui("ui.fx.chance")}
                      </span>
                      {summary.branches.map((b, j) => (
                        // branches have no id; their order is the content's
                        // biome-ignore lint/suspicious/noArrayIndexKey: fixed content order
                        <span key={j} className={s.branch}>
                          <span className={s.branchChance}>
                            {ui("ui.fx.branch.chance", { chance: b.chance })}
                          </span>
                          {b.effects.length === 0 ? (
                            <span className={s.none}>{ui("ui.fx.none")}</span>
                          ) : (
                            // each effect with its concept's emoji, as the sure ones show it
                            b.effects.map((e, k) => (
                              <span key={e.text} className={s.branchEffect}>
                                {k > 0 && <span className={s.dot}>·</span>}
                                <Icon name={e.icon} />
                                {e.text}
                              </span>
                            ))
                          )}
                        </span>
                      ))}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      </Dialog>
      {hidden && !after && (
        <div className={s.bar} role="status">
          <p>{ui("ui.event.waiting")}</p>
          <Button
            id="evento-reabrir"
            variant="primary"
            size="sm"
            onClick={() => setHiddenFor(undefined)}
          >
            {ui("ui.event.reopen")}
          </Button>
        </div>
      )}
    </>
  );
}
