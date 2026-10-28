import type { ButtonHTMLAttributes } from "react";
import s from "./Button.module.css";
import { cx } from "./cx";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** A submit button inside a form; every other button is type="button". */
  submit?: boolean;
};

/** A command. The label says what happens ("Entrenar agilidad", "Copiar partida"). */
export function Button({
  variant = "secondary",
  size = "md",
  submit = false,
  className,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={submit ? "submit" : "button"}
      className={cx(s.button, s[variant], s[size], className)}
      {...rest}
    />
  );
}
