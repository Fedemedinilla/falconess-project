import { type ReactNode, useState } from "react";
import { useGame } from "../game/useGame";
import { gameText, ui } from "../text/ui";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Livery } from "../ui/Livery";
import s from "./EventDialog.module.css";
import { describeOption } from "./model/describe";

/**
 * The event waiting for an answer, as a modal built into the page. Each option says what it does,
 * with its chance branches. The event must be answered before the next action: closing the dialog
 * only hides it behind a bar that brings it back.
 */
export function EventDialog() {
  const { game, snap } = useGame();
  const pending = snap.run?.state.pendingEvent;
  const key = pending ? `${pending.eventId}/${pending.turn}` : "";
  const [hiddenFor, setHiddenFor] = useState<string | undefined>();
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

  const choose = (option: number) => {
    game.act({ kind: "event:choose", option });
  };

  return (
    <>
      <Dialog
        open={!hidden}
        onClose={() => setHiddenFor(key)}
        title={ui("ui.screen.event.title")}
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
                  onClick={() => choose(i)}
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
                        <span key={line} className={s.effect}>
                          {line}
                        </span>
                      ))
                    )}
                  </span>
                  {summary.branches.length > 0 && (
                    <span className={s.chance}>
                      <span className={s.chanceLabel}>{ui("ui.fx.chance")}</span>
                      {summary.branches.map((b, j) => (
                        // branches have no id; their order is the content's
                        // biome-ignore lint/suspicious/noArrayIndexKey: fixed content order
                        <span key={j} className={s.branch}>
                          {ui("ui.fx.branch", {
                            chance: b.chance,
                            effects:
                              b.effects.length === 0 ? ui("ui.fx.none") : b.effects.join(" · "),
                          })}
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
      {hidden && (
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
