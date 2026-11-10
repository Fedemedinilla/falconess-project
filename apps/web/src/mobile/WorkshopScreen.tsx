import type { TakeoffStyle } from "@falconess/race-view";
import type { SeasonState, Style, WorkshopOp } from "@falconess/schema";
import { flightOf, type SimContext } from "@falconess/sim";
import { useState } from "react";
import { useGame } from "../game/useGame";
import { describeActiveSkill } from "../screens/model/describe";
import {
  emptyPlan,
  learnableSkills,
  MAX_WORKSHOP_OPS,
  planReport,
  type WorkshopPlan,
} from "../screens/model/workshop";
import { gameBrief } from "../text/brief";
import { gameText, ui } from "../text/ui";
import { cx } from "../ui/cx";
import { Glyph } from "./Glyph";
import s from "./Mobile.module.css";

/** The takeoff gesture of each wing style on v3 (the test view's workshop says the same). */
const GESTURE: Record<Style, TakeoffStyle> = {
  dive: "lance",
  hover: "column",
  glide: "ramp",
  ground: "turbine",
};

export type WorkshopTab = "skills" | "wings";

/**
 * The v3 workshop on the phone: learn skills with her points, and swap the wings (on v3 a look and
 * a takeoff gesture, and the default race position). Everything chosen goes as one workshop order,
 * the week's action; costs and limits are the sim's (screens/model/workshop.ts).
 */
export function WorkshopScreen({
  ctx,
  state,
  tab,
  onTab,
  onConfirm,
  onBack,
}: {
  ctx: SimContext;
  state: SeasonState;
  tab: WorkshopTab;
  onTab: (tab: WorkshopTab) => void;
  onConfirm: (ops: WorkshopOp[]) => void;
  onBack: () => void;
}) {
  const { game, snap } = useGame();
  const [plan, setPlan] = useState<WorkshopPlan>(() => emptyPlan(state));
  const content = ctx.content;
  const report = planReport(ctx, state, plan);
  const skills = learnableSkills(ctx, state);
  const neutral = flightOf(ctx.ruleset)?.neutralFrames === true;
  const full = report.ops.length >= MAX_WORKSHOP_OPS;
  const error = snap.error?.kind === "workshop" ? snap.error : undefined;
  const update = (next: WorkshopPlan) => {
    if (snap.error) game.clearError();
    setPlan(next);
  };

  return (
    <div className={s.screen}>
      <div className={s.body}>
        <h1 className={s.title}>{ui("ui.m.workshop")}</h1>
        <div className={s.tabs} role="tablist" aria-label={ui("ui.m.workshop")}>
          {(["skills", "wings"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              id={`m-taller-${t}`}
              aria-selected={tab === t}
              className={cx(s.tab, tab === t && s.tabOn)}
              onClick={() => onTab(t)}
            >
              {ui(`ui.m.workshop.tab.${t}`)}
            </button>
          ))}
        </div>
        <div className={s.chips}>
          <span className={s.tchip} id="m-taller-puntos">
            <span>{ui("ui.m.points.long")}</span>
            <b>
              {state.skillPoints}
              {report.skillPointsLeft !== state.skillPoints && ` → ${report.skillPointsLeft}`}
            </b>
          </span>
          <span className={s.tchip}>
            <span>{ui("ui.m.skills")}</span>
            <b>{ui("ui.workshop.skillCap.value", { n: report.learnedAfter, cap: report.cap })}</b>
          </span>
        </div>

        {tab === "skills" ? (
          <ul className={cx(s.panel, s.skills)} aria-label={ui("ui.m.skills")}>
            {skills.length === 0 && <li className={s.sk}>{ui("ui.m.skills.none")}</li>}
            {skills.map((skill) => {
              const on = plan.learn.includes(skill.id);
              const affordable = report.skillPointsLeft >= skill.cost;
              const room = report.learnedAfter < report.cap;
              const disabled = !on && (!affordable || !room || full);
              const reason = !disabled
                ? undefined
                : !affordable
                  ? ui("ui.workshop.skills.short", { n: skill.cost - report.skillPointsLeft })
                  : !room
                    ? ui("ui.workshop.skills.noRoom")
                    : ui("ui.workshop.skills.orderFull");
              return (
                <li key={skill.id} className={s.sk}>
                  <div className={s.snm}>
                    <span className={s.skn}>{gameText(skill.textKey)}</span>
                    <span className={s.skd}>
                      {gameBrief(skill.textKey) ?? describeActiveSkill(skill)}
                    </span>
                  </div>
                  <button
                    type="button"
                    id={`m-habilidad-${skill.id}`}
                    className={cx(s.learn, on && s.learnOn)}
                    aria-pressed={on}
                    disabled={disabled}
                    onClick={() =>
                      update({
                        ...plan,
                        learn: on
                          ? plan.learn.filter((k) => k !== skill.id)
                          : [...plan.learn, skill.id],
                      })
                    }
                  >
                    <b>{ui("ui.workshop.skills.cost", { cost: skill.cost })}</b>
                    <span>{reason ?? ui(on ? "ui.m.skills.planned" : "ui.m.skills.learn")}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <>
            {neutral && <p className={s.note}>{ui("ui.workshop.neutral")}</p>}
            <div className={s.hangar}>
              {state.hangar.map((id) => {
                const frame = content.getFrame(id);
                const maker = content.getManufacturer(frame.manufacturer);
                const on = plan.frameId === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={on}
                    id={`m-ala-${id}`}
                    className={cx(s.hcard, on && s.pickOn)}
                    style={{ "--c": maker.palette.primary, "--c2": maker.palette.secondary }}
                    onClick={() => update({ ...plan, frameId: id })}
                  >
                    <span className={s.livery} aria-hidden="true" />
                    <b>{gameText(frame.textKey)}</b>
                    <span>
                      {neutral
                        ? ui("ui.workshop.gesture", {
                            style: gameText(`style.${frame.style}`),
                            gesture: ui(`ui.flight.style.${GESTURE[frame.style]}`),
                          })
                        : gameText(`style.${frame.style}`)}
                    </span>
                    {id === state.equippedFrame && (
                      <span className={s.pill}>{ui("ui.hangar.equipped")}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
        {(error || report.blocked) && (
          <p className={s.warnbox} role="alert" id="m-taller-error">
            <Glyph name="warn" size={20} />
            {error
              ? ui(`ui.error.${error.kind}`)
              : report.tooMany
                ? ui("ui.workshop.order.tooMany", { max: MAX_WORKSHOP_OPS })
                : ui("ui.m.workshop.blocked")}
          </p>
        )}
      </div>
      <div className={s.foot}>
        <button type="button" className={cx(s.btn, s.back)} id="m-volver" onClick={onBack}>
          <Glyph name="back" size={20} weight={2.4} />
          <span>{ui("ui.m.back")}</span>
        </button>
        <button
          type="button"
          className={cx(s.btn, s.btnDark)}
          id="m-taller-confirmar"
          disabled={report.ops.length === 0 || report.blocked}
          onClick={(e) => {
            if (e.detail > 1) return;
            onConfirm([...report.ops]);
          }}
        >
          {report.ops.length === 0
            ? ui("ui.m.workshop.empty")
            : ui("ui.workshop.confirm", { n: report.ops.length })}
        </button>
      </div>
    </div>
  );
}
