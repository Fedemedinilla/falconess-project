import type { Position, PositionAptitudes } from "@falconess/schema";
import type { ReactNode } from "react";
import { gameBrief } from "../../text/brief";
import { gameText, ui } from "../../text/ui";
import { cx } from "../../ui/cx";
import { Pill } from "../../ui/Pill";
import { PositionMark } from "../../ui/PositionMark";
import { positionOptions } from "../model/position";
import { Letter } from "./Letter";
import s from "./PositionPicker.module.css";

export type PositionPickerProps = {
  /** Id of the fieldset; each option's input is `<id>-<position>` (`turno-posicion-closer`). */
  id: string;
  /** Her aptitude letter in each position. */
  letters: PositionAptitudes;
  /** The position of the wings she races with: preselected and labelled. */
  wings: Position;
  /** The position shown as chosen (the wings' one until the player taps another). */
  value: Position;
  onChange: (position: Position) => void;
  /** How the choice is confirmed: the week's action, or «Correr la carrera». */
  hint: ReactNode;
  disabled?: boolean | undefined;
  className?: string | undefined;
  /** v3: the race's distance, her letter in it and her passive, over the options. */
  race?: ReactNode;
};

/**
 * The pre-race card (ADR-0008): four big options, front to back, each with its shape, its name,
 * her letter in it and how she spends energy there. Her wings' position is preselected and says
 * so; a tap chooses another, and the screen's own race button confirms it. Native radios: arrows
 * move between them, and the digit keys of the Turn screen are left alone inside them.
 */
export function PositionPicker({
  id,
  letters,
  wings,
  value,
  onChange,
  hint,
  disabled = false,
  className,
  race,
}: PositionPickerProps) {
  const hintId = `${id}-ayuda`;
  return (
    <fieldset
      className={cx(s.picker, className)}
      id={id}
      aria-describedby={hintId}
      disabled={disabled}
    >
      <legend className={s.legend}>{ui("ui.position.title")}</legend>
      {race && <div className={s.race}>{race}</div>}
      <div className={s.room}>
        <div className={s.options}>
          {positionOptions(letters, wings).map((o) => {
            const inputId = `${id}-${o.position}`;
            const on = o.position === value;
            return (
              <label
                key={o.position}
                htmlFor={inputId}
                className={cx(s.option, on && s.on)}
                data-position={o.position}
              >
                <input
                  type="radio"
                  id={inputId}
                  name={id}
                  value={o.position}
                  checked={on}
                  onChange={() => onChange(o.position)}
                  className={s.input}
                />
                <span className={s.head}>
                  <PositionMark position={o.position} size="lg" className={s.mark} />
                  <span className={s.name}>{gameText(`position.${o.position}`)}</span>
                  <span className="visually-hidden">{ui("ui.position.letter")}</span>
                  <Letter letter={o.letter} />
                </span>
                <span className={s.brief}>
                  {gameBrief(`position.${o.position}`) ?? gameText(`position.${o.position}`)}
                </span>
                {(o.wings || on) && (
                  <span className={s.tags}>
                    {on && (
                      <Pill tone="accent" solid>
                        {ui("ui.position.chosen")}
                      </Pill>
                    )}
                    {o.wings && <Pill>{ui("ui.position.wings")}</Pill>}
                  </span>
                )}
              </label>
            );
          })}
        </div>
      </div>
      <p className={s.hint} id={hintId}>
        {hint}
      </p>
    </fieldset>
  );
}
