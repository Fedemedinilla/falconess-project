import { type ReactNode, useId } from "react";
import { cx } from "./cx";
import { Icon } from "./Icon";
import type { IconName } from "./icons";
import s from "./Panel.module.css";

export type PanelProps = {
  title: string;
  /** The concept the panel is about, drawn before the title (ui/icons.ts). */
  icon?: IconName | undefined;
  /** Short facts on the right of the header: a count, a turn, a seed. */
  meta?: ReactNode;
  /** Controls on the right of the header. */
  actions?: ReactNode;
  /** Body without padding, for a table or a list that draws its own rules. */
  flush?: boolean;
  className?: string | undefined;
  id?: string | undefined;
  children: ReactNode;
};

/** A board panel: a labelled header strip over its content. */
export function Panel({
  title,
  icon,
  meta,
  actions,
  flush = false,
  className,
  id,
  children,
}: PanelProps) {
  const headingId = useId();
  return (
    <section className={cx(s.panel, className)} aria-labelledby={headingId} id={id}>
      <header className={s.head}>
        <h2 className={s.title} id={headingId}>
          {icon && <Icon name={icon} />}
          {title}
        </h2>
        {meta !== undefined && <div className={s.meta}>{meta}</div>}
        {actions !== undefined && <div className={s.actions}>{actions}</div>}
      </header>
      <div className={cx(s.body, flush && s.flush)}>{children}</div>
    </section>
  );
}
