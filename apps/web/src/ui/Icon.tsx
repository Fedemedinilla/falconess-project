import type { ReactNode } from "react";
import { cx } from "./cx";
import s from "./Icon.module.css";
import { ICONS, type IconName } from "./icons";

export type IconProps = {
  name: IconName;
  /** "lg" next to a card title; inline text size otherwise. */
  size?: "md" | "lg";
  className?: string | undefined;
};

/**
 * A concept's emoji, drawn next to the label that names it: hidden from assistive technology
 * (the label says it) and one fixed width, so labels in a list stay aligned.
 */
export function Icon({ name, size = "md", className }: IconProps) {
  return (
    <span className={cx(s.icon, size === "lg" && s.lg, className)} aria-hidden="true">
      {ICONS[name]}
    </span>
  );
}

/**
 * A label with its concept's emoji before it. The text keeps an element of its own, so finding
 * the label by its exact text (tests, assistive technology) is not disturbed by the emoji.
 */
export function WithIcon({
  icon,
  children,
  className,
}: {
  icon: IconName | undefined;
  children: ReactNode;
  className?: string | undefined;
}) {
  if (icon === undefined) return <span className={className}>{children}</span>;
  return (
    <span className={cx(s.with, className)}>
      <Icon name={icon} />
      <span>{children}</span>
    </span>
  );
}
