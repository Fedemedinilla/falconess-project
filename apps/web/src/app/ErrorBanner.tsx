import { useGame } from "../game/useGame";
import { ui } from "../text/ui";
import { Button } from "../ui/Button";
import s from "./ErrorBanner.module.css";

/** What the last action could not do, under the timing bar until dismissed or the next action. */
export function ErrorBanner() {
  const { game, snap } = useGame();
  const error = snap.error;
  if (!error) return null;
  return (
    <div className={s.banner} role="alert">
      <div className={s.text}>
        <p className={s.message}>{ui(`ui.error.${error.kind}`)}</p>
        {error.detail !== "" && (
          <details className={s.details}>
            <summary>{ui("ui.error.detail")}</summary>
            <code className={s.code}>{error.detail}</code>
          </details>
        )}
      </div>
      <Button id="aviso-cerrar" size="sm" variant="ghost" onClick={() => game.clearError()}>
        {ui("ui.error.dismiss")}
      </Button>
    </div>
  );
}
