import { type FormEvent, useEffect, useState } from "react";
import type { GameError } from "../game/controller";
import { useGame } from "../game/useGame";
import { ui } from "../text/ui";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import s from "./LoadDialog.module.css";
import { navigate } from "./useRoute";

export type LoadDialogProps = { open: boolean; onClose: () => void };

/** "Cargar partida": paste a run (save JSON or the `replay:` line of `pnpm play`) and replay it. */
export function LoadDialog({ open, onClose }: LoadDialogProps) {
  const { game } = useGame();
  const [text, setText] = useState("");
  // what the last attempt could not load: shown here, not in the page's banner behind the modal
  const [error, setError] = useState<GameError | undefined>();

  useEffect(() => {
    if (open) {
      game.clearError();
      setError(undefined);
    }
  }, [open, game]);

  const close = () => {
    setError(undefined);
    onClose();
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!game.loadText(text)) {
      setError(game.getSnapshot().error);
      game.clearError();
      return;
    }
    setText("");
    setError(undefined);
    onClose();
    const ended = game.getSnapshot().run?.state.status === "ended";
    navigate(ended ? "fin" : "temporada");
  };

  return (
    <Dialog open={open} onClose={close} title={ui("ui.load.title")} id="cargar-dialogo">
      <form className={s.form} onSubmit={submit}>
        <label className={s.label} htmlFor="cargar-json">
          {ui("ui.load.label")}
        </label>
        <p className={s.hint} id="cargar-ayuda">
          {ui("ui.load.hint")}
        </p>
        <textarea
          id="cargar-json"
          className={s.json}
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-describedby="cargar-ayuda"
          aria-invalid={error ? true : undefined}
          spellCheck={false}
        />
        {error && (
          <p className={s.error} role="alert">
            {ui(`ui.error.${error.kind}`)}
            <code className={s.detail}>{error.detail}</code>
          </p>
        )}
        <div className={s.actions}>
          <Button id="cargar-cancelar" variant="ghost" onClick={close}>
            {ui("ui.load.cancel")}
          </Button>
          <Button id="cargar-enviar" variant="primary" submit disabled={text.trim() === ""}>
            {ui("ui.load.submit")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
