import type { RaceLabels } from "@falconess/race-view";
import type { RaceLog } from "@falconess/schema";
import { PLAYER_RUNNER_ID } from "@falconess/sim";
import { useMemo } from "react";
import { useDetail } from "../app/explain";
import type { Detail } from "../text/brief";
import { ui } from "../text/ui";
import { cx } from "../ui/cx";
import { ExplainSwitch } from "../ui/ExplainSwitch";
import { Icon } from "../ui/Icon";
import s from "./Advice.module.css";
import { adviceWords, runnerAdvice } from "./advice";
import { runnerName } from "./words";

export type AdviceNoteProps = {
  log: RaceLog;
  lane: number;
  labels: RaceLabels;
  /** Stable id: the note is `<id>`, its own switch (when it has one) `<id>-explicacion`. */
  id: string;
  /** The length its panel asks for; without it the note has its own «Breve | Completo». */
  detail?: Detail | undefined;
  className?: string | undefined;
};

/**
 * Umamusume's tip after a race, for the runner in `lane`: "¡Peregrina se quedó sin físico a los
 * 1589 m! Quizás deberías entrenar Resistencia.", each tip with the cause's and the stat's emoji
 * and, below, the log's numbers (brief, or full with what the stat does). For a runner who
 * finished 3rd or worse with nothing to train, it says so; otherwise, with no tip, nothing.
 */
export function AdviceNote({ log, lane, labels, id, detail, className }: AdviceNoteProps) {
  const [own, setOwn] = useDetail(`${id}-explicacion`);
  const shown = detail ?? own;
  const { items, none } = useMemo(() => runnerAdvice(log, lane), [log, lane]);
  const entry = log.entries[lane];
  if (!entry || (items.length === 0 && !none)) return null;
  const name = runnerName(entry, labels);
  return (
    <div className={cx(s.advice, className)} id={id} role="note" aria-label={ui("ui.advice.label")}>
      <div className={s.head}>
        <p className={s.label}>
          <Icon name="advice" />
          {ui("ui.advice.label")}
        </p>
        {detail === undefined && items.length > 0 && (
          <ExplainSwitch
            id={`${id}-explicacion`}
            detail={own}
            onChange={setOwn}
            name={ui("ui.advice.label")}
          />
        )}
      </div>
      {none ? (
        <p className={s.none}>{ui("ui.advice.none")}</p>
      ) : (
        <ul className={s.list}>
          {items.map((item) => {
            const w = adviceWords(item, name, labels, shown);
            return (
              <li key={item.reason} className={s.item} data-reason={item.reason}>
                <p className={s.line}>
                  <Icon name={w.icon} />
                  <strong className={s.lead}>{w.lead}</strong> {w.before}
                  <span className={s.target}>
                    <Icon name={w.targetIcon} />
                    {w.target}
                  </span>
                  {w.after}
                </p>
                <p className={s.why}>{w.why}</p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** The player's tip in a goal race's log, when she is in it. */
export function PlayerAdviceNote(props: Omit<AdviceNoteProps, "lane">) {
  const lane = props.log.results.find((r) => r.runnerId === PLAYER_RUNNER_ID)?.lane;
  return lane === undefined ? null : <AdviceNote {...props} lane={lane} />;
}
