import { useEffect, useRef, useState } from "react";
import { useGame } from "../game/useGame";
import { ui } from "../text/ui";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { copyOrSelect } from "./copy";
import s from "./RunDialog.module.css";
import { navigate } from "./useRoute";

type Status = "idle" | "copied" | "selected" | "undone";

const STATUS_KEY: Readonly<Record<Exclude<Status, "idle">, string>> = {
  copied: "ui.run.copied",
  selected: "ui.run.selected",
  undone: "ui.run.undone",
};

export type RunDialogProps = { open: boolean; onClose: () => void };

/** The run tools for testers: the run as JSON to copy, undo the last decision, go home. */
export function RunDialog({ open, onClose }: RunDialogProps) {
  const { game, snap } = useGame();
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const run = snap.run;

  useEffect(() => {
    if (open) setStatus("idle");
  }, [open]);

  if (!run) return null;
  const text = game.exportText() ?? "";

  const copy = () => {
    copyOrSelect(text, textRef.current).then(setStatus, () => setStatus("selected"));
  };
  const undo = () => {
    if (game.undoLast()) setStatus("undone");
  };
  const goHome = () => {
    onClose();
    navigate("inicio");
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={ui("ui.run.title")}
      id="partida-dialogo"
      footer={
        <>
          <Button id="partida-deshacer" onClick={undo} disabled={run.inputs.length <= 1}>
            {ui("ui.run.undo")}
          </Button>
          <Button id="partida-inicio" variant="ghost" onClick={goHome}>
            {ui("ui.run.home")}
          </Button>
          <Button id="partida-copiar" variant="primary" onClick={copy}>
            {ui("ui.run.copy")}
          </Button>
        </>
      }
    >
      <p className={s.facts}>
        {ui("ui.run.summary", {
          seed: run.seed,
          ruleset: run.rulesetVersion,
          decisions: run.inputs.length - 1,
        })}
      </p>
      <p className={snap.saved ? s.saved : s.unsaved}>
        {ui(snap.saved ? "ui.run.saved" : "ui.run.notSaved")}
      </p>
      <label className={s.label} htmlFor="partida-json">
        {ui("ui.run.json")}
      </label>
      <textarea
        ref={textRef}
        id="partida-json"
        className={s.json}
        readOnly
        rows={6}
        value={text}
        spellCheck={false}
      />
      <p className={s.status} aria-live="polite">
        {status === "idle" ? "" : ui(STATUS_KEY[status])}
      </p>
    </Dialog>
  );
}
