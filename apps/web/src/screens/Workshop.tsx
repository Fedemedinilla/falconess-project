import type { PartType } from "@falconess/schema";
import { useEffect, useRef, useState } from "react";
import { useDetail } from "../app/explain";
import { useGame } from "../game/useGame";
import { gameBrief, uiAt } from "../text/brief";
import { formatFixed, formatInt, formatSigned } from "../text/format";
import { gameText, ui } from "../text/ui";
import { Button } from "../ui/Button";
import { cx } from "../ui/cx";
import { ExplainSwitch } from "../ui/ExplainSwitch";
import { Icon } from "../ui/Icon";
import type { IconName } from "../ui/icons";
import { Livery } from "../ui/Livery";
import { Panel } from "../ui/Panel";
import { Pill } from "../ui/Pill";
import { scrollBehavior } from "../ui/useMedia";
import { workshopVigor } from "./model/actions";
import { describeActiveSkill, describeSource } from "./model/describe";
import {
  durabilityOf,
  emptyPlan,
  learnableSkills,
  MAX_WORKSHOP_OPS,
  nextRerollCost,
  PART_TYPE_ORDER,
  partOfType,
  planReport,
  rerollableFrames,
  type WorkshopPlan,
  withPart,
} from "./model/workshop";
import { describeOp } from "./TurnSide";
import s from "./Workshop.module.css";

export type WorkshopProps = {
  /** Back to the actions without spending the week. */
  onClose: () => void;
  /** The order went through (the week is spent). */
  onDone: () => void;
  className?: string | undefined;
};

/**
 * The workshop: everything chosen here goes as ONE workshop input when confirmed, and that input
 * is the week's action. Costs and limits are the sim's (model/workshop.ts); what the sim refuses
 * anyway comes back as a WorkshopError and is shown here.
 */
export function Workshop({ onClose, onDone, className }: WorkshopProps) {
  const { game, snap } = useGame();
  const run = snap.run;
  const state = run?.state;
  const [plan, setPlan] = useState<WorkshopPlan | undefined>(state && emptyPlan(state));
  const turn = state?.turn;
  const inputs = run?.inputs.length;
  const bodyRef = useRef<HTMLDivElement>(null);
  const [partsDetail, setPartsDetail] = useDetail("taller-piezas-explicacion");
  const [quirksDetail, setQuirksDetail] = useDetail("taller-peculiaridades-explicacion");
  const [skillsDetail, setSkillsDetail] = useDetail("taller-habilidades-explicacion");

  // the panel replaces the button that opened it: the page goes to its top and focus moves in
  useEffect(() => {
    const body = bodyRef.current;
    body?.closest("section")?.scrollIntoView({ block: "start", behavior: scrollBehavior() });
    body?.focus({ preventScroll: true });
  }, []);

  // a new week (or an undo) starts a new plan
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on the week, not on every state
  useEffect(() => {
    if (state) setPlan(emptyPlan(state));
  }, [turn, inputs]);

  if (!run || !state || !plan) return null;
  const ctx = game.context();
  const content = ctx.content;
  const report = planReport(ctx, state, plan);
  const error = snap.error?.kind === "workshop" ? snap.error : undefined;

  const update = (next: WorkshopPlan) => {
    if (snap.error) game.clearError();
    setPlan(next);
  };
  const confirm = () => {
    if (report.ops.length === 0 || report.blocked) return;
    if (game.act({ kind: "workshop", ops: [...report.ops] }, run.inputs.length)) onDone();
  };

  const full = report.ops.length >= MAX_WORKSHOP_OPS;
  const rerollable = rerollableFrames(ctx, state);
  const nextReroll = nextRerollCost(ctx, state, plan);
  const skills = learnableSkills(ctx, state);
  const builds: {
    key: string;
    icon: IconName;
    label: string;
    from: string;
    to: string;
    diff: number;
  }[] = [
    {
      key: "powerToWeight",
      icon: "framestat.powerToWeight",
      label: gameText("framestat.powerToWeight"),
      from: formatFixed(report.before.powerToWeight, 1000, 2),
      to: formatFixed(report.after.powerToWeight, 1000, 2),
      diff: report.after.powerToWeight - report.before.powerToWeight,
    },
    {
      key: "energy",
      icon: "framestat.energy",
      label: gameText("framestat.energy"),
      from: formatInt(report.before.energy),
      to: formatInt(report.after.energy),
      diff: report.after.energy - report.before.energy,
    },
    {
      key: "dissipation",
      icon: "framestat.dissipation",
      label: gameText("framestat.dissipation"),
      from: formatInt(report.before.dissipation),
      to: formatInt(report.after.dissipation),
      diff: report.after.dissipation - report.before.dissipation,
    },
    {
      key: "durability",
      icon: "framestat.durability",
      label: ui("ui.workshop.durabilityMax"),
      from: formatInt(report.before.durabilityMax),
      to: formatInt(report.after.durabilityMax),
      diff: report.after.durabilityMax - report.before.durabilityMax,
    },
    {
      key: "skills",
      icon: "skill",
      label: ui("ui.workshop.skillCap"),
      from: ui("ui.workshop.skillCap.value", {
        n: state.learnedSkills.length,
        cap: report.capNow,
      }),
      to: ui("ui.workshop.skillCap.value", { n: report.learnedAfter, cap: report.cap }),
      diff: report.cap - report.capNow,
    },
  ];

  return (
    <Panel
      title={ui("ui.screen.workshop.title")}
      icon="action.workshop"
      meta={ui("ui.workshop.meta", {
        n: report.ops.length,
        max: MAX_WORKSHOP_OPS,
        vigor: formatSigned(workshopVigor(ctx)),
      })}
      actions={
        <Button id="taller-volver" size="sm" variant="ghost" onClick={onClose}>
          {ui("ui.workshop.back")}
        </Button>
      }
      className={className}
      id="taller"
    >
      <div className={s.workshop} ref={bodyRef} tabIndex={-1}>
        <p className={s.lead}>{ui("ui.workshop.lead")}</p>

        {/* frame ------------------------------------------------------------------------------ */}
        <fieldset className={s.section}>
          <legend className={s.legend}>
            <Icon name="frame" />
            {ui("ui.workshop.frame")}
          </legend>
          <ul className={s.frames}>
            {state.hangar.map((id) => {
              const frame = content.getFrame(id);
              const maker = content.getManufacturer(frame.manufacturer);
              const d = durabilityOf(ctx, state, id);
              const checked = plan.frameId === id;
              return (
                <li key={id}>
                  <label
                    className={cx(s.frame, checked && s.checked)}
                    htmlFor={`taller-bastidor-${id}`}
                  >
                    <input
                      type="radio"
                      id={`taller-bastidor-${id}`}
                      name="taller-bastidor"
                      value={id}
                      checked={checked}
                      onChange={() => update({ ...plan, frameId: id })}
                      className={s.radio}
                    />
                    <Livery palette={maker.palette} size="sm" />
                    <span className={s.frameText}>
                      <span className={s.frameName}>{gameText(frame.textKey)}</span>
                      <span className={s.frameMeta}>
                        {gameText(`style.${frame.style}`)} ·{" "}
                        {ui("ui.frame.durability", { current: d.current, max: d.max })}
                      </span>
                    </span>
                    {id === state.equippedFrame && (
                      <Pill tone="accent">{ui("ui.hangar.equipped")}</Pill>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>

        {/* parts ------------------------------------------------------------------------------ */}
        <fieldset className={cx(s.section, s.switched)}>
          <legend className={s.legend}>
            <Icon name="part" />
            {ui("ui.workshop.parts")}
          </legend>
          <ExplainSwitch
            id="taller-piezas-explicacion"
            detail={partsDetail}
            onChange={setPartsDetail}
            name={ui("ui.workshop.parts")}
            className={s.sectionSwitch}
          />
          <p className={s.hint}>{uiAt(partsDetail, "ui.workshop.parts.hint")}</p>
          <div className={s.parts}>
            {PART_TYPE_ORDER.map((type: PartType) => {
              const chosen = partOfType(ctx, plan.parts, type);
              const options = [...content.parts.values()].filter((p) => p.type === type);
              const part = chosen === undefined ? undefined : content.getPart(chosen);
              const selectId = `taller-pieza-${type}`;
              return (
                <div key={type} className={s.part}>
                  <label htmlFor={selectId} className={s.partLabel}>
                    {ui(`ui.part.${type}`)}
                  </label>
                  <select
                    id={selectId}
                    className={s.select}
                    value={chosen ?? ""}
                    onChange={(e) =>
                      update(
                        withPart(
                          ctx,
                          plan,
                          type,
                          e.target.value === "" ? undefined : e.target.value,
                        ),
                      )
                    }
                  >
                    <option value="">{ui("ui.workshop.parts.none")}</option>
                    {options.map((p) => (
                      <option key={p.id} value={p.id}>
                        {gameText(p.textKey)}
                      </option>
                    ))}
                  </select>
                  <p className={s.partDesc}>
                    {part
                      ? (partsDetail === "brief" && gameBrief(part.textKey)) ||
                        describeSource(part).join(" · ")
                      : ui("ui.workshop.parts.empty")}
                  </p>
                </div>
              );
            })}
          </div>
        </fieldset>

        {/* build result ----------------------------------------------------------------------- */}
        <div className={s.section}>
          <p className={s.legend}>
            {ui("ui.workshop.build", { frame: gameText(content.getFrame(plan.frameId).textKey) })}
          </p>
          <table className={s.build}>
            <caption className="visually-hidden">{ui("ui.workshop.build.caption")}</caption>
            <thead>
              <tr>
                <th scope="col">{ui("ui.workshop.build.stat")}</th>
                <th scope="col">{ui("ui.workshop.build.now")}</th>
                <th scope="col">{ui("ui.workshop.build.after")}</th>
              </tr>
            </thead>
            <tbody>
              {builds.map((b) => (
                <tr key={b.key}>
                  <th scope="row">
                    <Icon name={b.icon} />
                    {b.label}
                  </th>
                  <td>{b.from}</td>
                  <td className={cx(b.diff > 0 && s.up, b.diff < 0 && s.down)}>{b.to}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {report.rerollsFrame && <p className={s.hint}>{ui("ui.workshop.build.reroll")}</p>}
        </div>

        {/* repair ----------------------------------------------------------------------------- */}
        <div className={s.section}>
          <label className={s.check} htmlFor="taller-reparar">
            <input
              type="checkbox"
              id="taller-reparar"
              checked={plan.repair}
              disabled={!plan.repair && report.durability.current >= report.durability.max}
              onChange={(e) => update({ ...plan, repair: e.target.checked })}
            />
            <Icon name="framestat.durability" />
            <span>
              {report.durability.current >= report.durability.max && !plan.repair
                ? ui("ui.workshop.repair.full", {
                    frame: gameText(content.getFrame(plan.frameId).textKey),
                  })
                : report.rerollsFrame
                  ? ui("ui.workshop.repair.reroll", {
                      frame: gameText(content.getFrame(plan.frameId).textKey),
                      from: report.durability.current,
                    })
                  : ui("ui.workshop.repair", {
                      frame: gameText(content.getFrame(plan.frameId).textKey),
                      from: report.durability.current,
                      to: report.durability.max,
                    })}
            </span>
          </label>
        </div>

        {/* quirks ----------------------------------------------------------------------------- */}
        {rerollable.length > 0 && (
          <div className={cx(s.section, s.switched)}>
            <p className={s.legend}>
              <Icon name="quirk" />
              {ui("ui.workshop.quirks")}
            </p>
            <ExplainSwitch
              id="taller-peculiaridades-explicacion"
              detail={quirksDetail}
              onChange={setQuirksDetail}
              name={ui("ui.workshop.quirks")}
              className={s.sectionSwitch}
            />
            <p className={s.hint}>
              {uiAt(quirksDetail, "ui.workshop.quirks.hint", {
                scrap: state.wallet.scrap,
                left: report.scrapLeft,
              })}
            </p>
            <ul className={s.rerolls}>
              {rerollable.map((id) => {
                const frame = content.getFrame(id);
                const planned = plan.rerolls.filter((f) => f === id).length;
                const quirks = state.frameQuirks[id] ?? [];
                const affordable = report.scrapLeft >= nextReroll;
                return (
                  <li key={id} className={s.reroll}>
                    <div className={s.rerollHead}>
                      <span className={s.frameName}>{gameText(frame.textKey)}</span>
                      {planned > 0 && (
                        <Pill tone="accent">
                          {ui("ui.workshop.quirks.planned", { n: planned })}
                        </Pill>
                      )}
                    </div>
                    <ul className={s.quirkList}>
                      {quirks.map((q) => {
                        const quirk = content.getQuirk(q);
                        return (
                          <li key={q}>
                            <strong>{gameText(quirk.textKey)}</strong>
                            <span>
                              {(quirksDetail === "brief" && gameBrief(quirk.textKey)) ||
                                describeSource(quirk).join(" · ")}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                    <div className={s.rerollActions}>
                      <Button
                        id={`taller-resortear-${id}`}
                        size="sm"
                        disabled={!affordable || full}
                        onClick={() => update({ ...plan, rerolls: [...plan.rerolls, id] })}
                      >
                        {ui("ui.workshop.quirks.reroll", { cost: nextReroll })}
                      </Button>
                      {planned > 0 && (
                        <Button
                          id={`taller-resortear-quitar-${id}`}
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            const at = plan.rerolls.lastIndexOf(id);
                            update({ ...plan, rerolls: plan.rerolls.filter((_, i) => i !== at) });
                          }}
                        >
                          {ui("ui.workshop.quirks.undo")}
                        </Button>
                      )}
                    </div>
                    {!affordable && (
                      <p className={s.hint}>
                        {ui("ui.workshop.quirks.noScrap", { cost: nextReroll })}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* skills ----------------------------------------------------------------------------- */}
        <fieldset className={cx(s.section, s.switched)}>
          <legend className={s.legend}>
            <Icon name="skill" />
            {ui("ui.workshop.skills")}
          </legend>
          <ExplainSwitch
            id="taller-habilidades-explicacion"
            detail={skillsDetail}
            onChange={setSkillsDetail}
            name={ui("ui.workshop.skills")}
            className={s.sectionSwitch}
          />
          <p className={s.hint}>
            {uiAt(skillsDetail, "ui.workshop.skills.hint", {
              points: state.skillPoints,
              left: report.skillPointsLeft,
              n: report.learnedAfter,
              cap: report.cap,
            })}
          </p>
          {report.overCap && (
            <p className={s.warn} role="alert">
              {ui("ui.workshop.skills.overCap", { n: report.learnedAfter, cap: report.cap })}
            </p>
          )}
          <ul className={s.skills}>
            {skills.map((skill) => {
              const checked = plan.learn.includes(skill.id);
              const affordable = report.skillPointsLeft >= skill.cost;
              const room = report.learnedAfter < report.cap;
              const disabled = !checked && (!affordable || !room || full);
              const id = `taller-habilidad-${skill.id}`;
              // why it cannot be added, said instead of graying the text out
              const reason = !disabled
                ? undefined
                : !affordable
                  ? ui("ui.workshop.skills.short", { n: skill.cost - report.skillPointsLeft })
                  : !room
                    ? ui("ui.workshop.skills.noRoom")
                    : ui("ui.workshop.skills.orderFull");
              return (
                <li key={skill.id}>
                  <label
                    className={cx(s.skill, checked && s.checked, disabled && s.off)}
                    htmlFor={id}
                  >
                    <input
                      type="checkbox"
                      id={id}
                      checked={checked}
                      disabled={disabled}
                      onChange={(e) =>
                        update({
                          ...plan,
                          learn: e.target.checked
                            ? [...plan.learn, skill.id]
                            : plan.learn.filter((k) => k !== skill.id),
                        })
                      }
                    />
                    <span className={s.skillName}>{gameText(skill.textKey)}</span>
                    <span className={s.skillCost}>
                      {ui("ui.workshop.skills.cost", { cost: skill.cost })}
                      {reason && <span className={s.skillReason}>{reason}</span>}
                    </span>
                    <span className={s.skillDesc}>
                      {(skillsDetail === "brief" && gameBrief(skill.textKey)) ||
                        describeActiveSkill(skill)}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>

        {/* order ------------------------------------------------------------------------------ */}
        <div className={s.order}>
          <p className={s.legend}>{ui("ui.workshop.order")}</p>
          {report.ops.length === 0 ? (
            <p className={s.hint}>{ui("ui.workshop.order.empty")}</p>
          ) : (
            <ol className={s.ops}>
              {report.ops.map((op, i) => (
                // ops repeat (two rerolls of one frame); their order is the input's
                // biome-ignore lint/suspicious/noArrayIndexKey: the order is the input
                <li key={i}>{describeOp(ctx, op)}</li>
              ))}
            </ol>
          )}
          {report.tooMany && (
            <p className={s.warn} role="alert">
              {ui("ui.workshop.order.tooMany", { max: MAX_WORKSHOP_OPS })}
            </p>
          )}
          {error && (
            <p className={s.error} role="alert">
              {ui("ui.error.workshop")}
              <code className={s.detail}>{error.detail}</code>
            </p>
          )}
          <div className={s.buttons}>
            <Button id="taller-descartar" variant="ghost" onClick={onClose}>
              {ui("ui.workshop.discard")}
            </Button>
            <Button
              id="taller-confirmar"
              variant="primary"
              disabled={report.ops.length === 0 || report.blocked}
              onClick={confirm}
            >
              {ui("ui.workshop.confirm", { n: report.ops.length })}
            </Button>
          </div>
        </div>
      </div>
    </Panel>
  );
}
