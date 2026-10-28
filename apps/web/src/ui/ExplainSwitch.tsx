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
  /** The whole legend instead (the page's default: "Explicaciones de todas las tarjetas"). */
  legend?: string | undefined;
  className?: string | undefined;
};

const OPTIONS: readonly { detail: Detail; suffix: string; key: string }[] = [
  { detail: "brief", suffix: "breve", key: "ui.explain.short" },
  { detail: "full", suffix: "completo", key: "ui.explain.long" },
];

/**
 * "Breve | Completo" on a card, right above the text it shortens: two pressed-state buttons. It
 * sits above a selectable card's stretched hit area, so switching never ticks the card. The page's
 * default uses the same control (app/ExplainDefault.tsx).
 */
export function ExplainSwitch({
  id,
  detail,
  onChange,
  name,
  legend,
  className,
}: ExplainSwitchProps) {
  return (
    <fieldset className={cx(s.switch, className)}>
      <legend className="visually-hidden">
        {legend ?? (name ? ui("ui.explain.label.of", { name }) : ui("ui.explain.label"))}
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
