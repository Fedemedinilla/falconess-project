import type { Detail } from "../text/brief";
import { ui } from "../text/ui";
import { cx } from "./cx";
import s from "./ExplainSwitch.module.css";

export type ExplainSwitchProps = {
  /** Stable id base: the buttons are `<id>-breve` and `<id>-completo`. */
  id: string;
  detail: Detail;
  onChange: (detail: Detail) => void;
  /** What the card explains, for assistive technology ("Explicación: Shiden"). */
  name?: string | undefined;
  className?: string | undefined;
};

const OPTIONS: readonly { detail: Detail; suffix: string; key: string }[] = [
  { detail: "brief", suffix: "breve", key: "ui.explain.short" },
  { detail: "full", suffix: "completo", key: "ui.explain.long" },
];

/**
 * "Breve | Completo" in a card's header: two pressed-state buttons. It sits above a selectable
 * card's stretched hit area, so switching never ticks the card.
 */
export function ExplainSwitch({ id, detail, onChange, name, className }: ExplainSwitchProps) {
  return (
    <fieldset className={cx(s.switch, className)}>
      <legend className="visually-hidden">
        {name ? ui("ui.explain.label.of", { name }) : ui("ui.explain.label")}
      </legend>
      {OPTIONS.map((o) => (
        <button
          key={o.detail}
          type="button"
          id={`${id}-${o.suffix}`}
          className={s.option}
          aria-pressed={detail === o.detail}
          onClick={() => onChange(o.detail)}
        >
          {ui(o.key)}
        </button>
      ))}
    </fieldset>
  );
}
