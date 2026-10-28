import { useMemo, useRef, useState } from "react";
import { serializeRun } from "../game/run";
import { useGame } from "../game/useGame";
import { gameText, ui, uiCount } from "../text/ui";
import { Button } from "../ui/Button";
import { copyOrSelect, markCopied, wasCopied } from "./copy";
import s from "./SavedRunNotice.module.css";

export type SavedRunNoticeProps = {
  /** Prefix of the controls' ids ("nueva", "cargar"). */
  idPrefix: string;
  /** What replaces the saved season: starting a new one, or loading a pasted one. */
  action: "start" | "load";
};

/**
 * The page keeps one season in this browser. Before something replaces it, this says so and offers
 * to copy it, unless the page already copied that very run. Built into the page: no confirm().
 */
export function SavedRunNotice({ idPrefix, action }: SavedRunNoticeProps) {
  const { game, snap } = useGame();
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [status, setStatus] = useState<"idle" | "copied" | "selected">("idle");
  // storage is read again whenever the run in play changes (a save, a load, a new season)
  const saved = useMemo(() => (snap.run ? undefined : game.savedRun()), [game, snap.run]);
  if (!saved) return null;
  const text = serializeRun(saved);
  if (status === "idle" && wasCopied(text)) return null;

  const content = game.context().content;
  const start = saved.inputs[0];
  const name =
    start?.kind === "start" && content.falconess.has(start.falconessId)
      ? gameText(content.getFalconess(start.falconessId).textKey)
      : saved.seed;
  const copy = () => {
    copyOrSelect(text, textRef.current).then(
      (result) => {
        if (result === "copied") markCopied(text);
        setStatus(result);
      },
      () => setStatus("selected"),
    );
  };

  return (
    <div className={s.notice} role="status">
      <p>
        {ui(action === "start" ? "ui.saved.replace.start" : "ui.saved.replace.load", {
          name,
          decisions: uiCount("ui.count.decisions", saved.inputs.length - 1),
        })}
      </p>
      <div className={s.actions}>
        <Button id={`${idPrefix}-copiar-guardada`} size="sm" onClick={copy}>
          {ui("ui.saved.copy")}
        </Button>
        <span className={s.status} aria-live="polite">
          {status === "copied"
            ? ui("ui.saved.copied")
            : status === "selected"
              ? ui("ui.run.selected")
              : ""}
        </span>
      </div>
      <label className="visually-hidden" htmlFor={`${idPrefix}-guardada-json`}>
        {ui("ui.saved.json")}
      </label>
      <textarea
        ref={textRef}
        id={`${idPrefix}-guardada-json`}
        className={status === "selected" ? s.json : s.jsonHidden}
        readOnly
        rows={3}
        value={text}
        spellCheck={false}
        tabIndex={status === "selected" ? 0 : -1}
      />
    </div>
  );
}
