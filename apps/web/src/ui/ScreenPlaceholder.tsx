import { useId } from "react";
import { navigate } from "../app/useRoute";
import { ui } from "../text/ui";
import { Button } from "./Button";
import s from "./ScreenPlaceholder.module.css";

export type ScreenPlaceholderProps = {
  title: string;
  note: string;
  /** Mark the screen as still being built (true for the placeholders of the screen files). */
  badge?: boolean;
};

/** A screen that has only its heading and a note yet. */
export function ScreenPlaceholder({ title, note, badge = true }: ScreenPlaceholderProps) {
  const headingId = useId();
  return (
    <section className={s.screen} aria-labelledby={headingId}>
      {badge && <p className={s.badge}>{ui("ui.placeholder.badge")}</p>}
      <h1 className={s.title} id={headingId}>
        {title}
      </h1>
      <p className={s.note}>{note}</p>
      <div>
        <Button id="pantalla-inicio" onClick={() => navigate("inicio")}>
          {ui("ui.placeholder.back")}
        </Button>
      </div>
    </section>
  );
}
