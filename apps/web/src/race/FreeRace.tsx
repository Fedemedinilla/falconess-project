import { FIELD_LIMITS } from "@falconess/race-view";
import type { ContentIndex, RaceLog } from "@falconess/schema";
import { type FormEvent, useId, useMemo, useState } from "react";
import { simContext } from "../content/load";
import { randomSeed } from "../game/seed";
import { gameText, ui } from "../text/ui";
import { Button } from "../ui/Button";
import { cx } from "../ui/cx";
import { Livery } from "../ui/Livery";
import { Panel } from "../ui/Panel";
import s from "./FreeRace.module.css";
import {
  cliArgs,
  defaultForm,
  type FreeRaceForm,
  frameChoices,
  intField,
  MAX_PARTS,
  normalizeForm,
  partChoices,
  runFreeRace,
  skillChoices,
} from "./free-race";
import { Replay } from "./RaceReplay";
import { metres, uiPlural } from "./words";

type Outcome =
  | { readonly ok: true; readonly form: FreeRaceForm; readonly log: RaceLog }
  | { readonly ok: false; readonly form: FreeRaceForm; readonly detail: string };

function run(form: FreeRaceForm): Outcome {
  const ctx = simContext();
  const clean = normalizeForm(ctx, form);
  try {
    return { ok: true, form: clean, log: runFreeRace(ctx, clean) };
  } catch (e) {
    return { ok: false, form: clean, detail: e instanceof Error ? e.message : String(e) };
  }
}

/** The last free race of this page visit: coming back to the screen shows it again. */
let lastOutcome: Outcome | undefined;

/** The race in one line: course, field, rivals' week and seed. */
function summary(form: FreeRaceForm, content: ContentIndex): string {
  const course = content.courses.get(form.courseId);
  const courseName = course ? gameText(course.textKey) : form.courseId;
  if (form.field === "neutral")
    return ui("ui.freeRace.summary.neutral", {
      course: courseName,
      stats: form.neutralStats,
      seed: form.seed,
    });
  const falconess = content.falconess.get(form.falconessId);
  const frameId = form.frameId === "" ? frameChoices(content, form.falconessId)[0] : form.frameId;
  const frame = frameId === undefined ? undefined : content.frames.get(frameId);
  const extras = [
    ...(form.skills.length > 0 ? [uiPlural("ui.freeRace.summary.skills", form.skills.length)] : []),
    ...(form.parts.length > 0 ? [uiPlural("ui.freeRace.summary.parts", form.parts.length)] : []),
  ];
  const text = ui("ui.freeRace.summary.player", {
    course: courseName,
    name: falconess ? gameText(falconess.textKey) : form.falconessId,
    frame: frame ? gameText(frame.textKey) : form.frameId,
    stats:
      form.statsMode === "base"
        ? ui("ui.freeRace.summary.stats.base")
        : ui("ui.freeRace.summary.stats.uniform", { n: form.stats }),
    turn: form.turn,
    seed: form.seed,
  });
  return extras.length > 0 ? `${text} · ${extras.join(" · ")}` : text;
}

function NumberField({
  id,
  label,
  hint,
  value,
  min,
  max,
  onChange,
  disabled = false,
}: {
  id: string;
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState(String(value));
  const hintId = `${id}-ayuda`;
  return (
    <div className={s.field}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={text}
        disabled={disabled}
        aria-describedby={hint ? hintId : undefined}
        onChange={(e) => {
          setText(e.currentTarget.value);
          onChange(intField(e.currentTarget.value, min, max, value));
        }}
        onBlur={() => setText(String(intField(text, min, max, value)))}
      />
      {hint && (
        <p className={s.hint} id={hintId}>
          {hint}
        </p>
      )}
    </div>
  );
}

function CheckList({
  name,
  legend,
  note,
  options,
  chosen,
  max,
  onChange,
}: {
  name: string;
  legend: string;
  note: string;
  options: readonly { id: string; label: string }[];
  chosen: readonly string[];
  max: number;
  onChange: (ids: string[]) => void;
}) {
  const full = chosen.length >= max;
  return (
    <fieldset className={s.checks}>
      <legend>
        {legend}{" "}
        <span className={s.count}>{ui("ui.freeRace.chosen", { n: chosen.length, max })}</span>
      </legend>
      <p className={s.hint}>{note}</p>
      <div className={s.checkGrid}>
        {options.map((o) => {
          const on = chosen.includes(o.id);
          return (
            <label key={o.id} className={cx(s.check, on && s.checkOn)} htmlFor={`${name}-${o.id}`}>
              <input
                id={`${name}-${o.id}`}
                type="checkbox"
                checked={on}
                disabled={!on && full}
                onChange={() => onChange(on ? chosen.filter((x) => x !== o.id) : [...chosen, o.id])}
              />
              <span>{o.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * #carrera-libre: one race without a season. The tester sets course, field and seed; the field is
 * built like `pnpm sim:race` builds it and the race runs with detail "full", then replays below.
 * The default form gives a race at once.
 */
export function FreeRace() {
  const ctx = useMemo(() => simContext(), []);
  const { content } = ctx;
  const [outcome, setOutcome] = useState<Outcome>(() => {
    lastOutcome ??= run(defaultForm(content));
    return lastOutcome;
  });
  const [form, setForm] = useState<FreeRaceForm>(outcome.form);
  const [editing, setEditing] = useState(!outcome.ok);
  const formKey = useId();

  const set = (patch: Partial<FreeRaceForm>) => setForm((f) => ({ ...f, ...patch }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next = run(form);
    lastOutcome = next;
    setOutcome(next);
    setForm(next.form);
    // a race that ran folds the form away so the replay is right under the summary
    setEditing(!next.ok);
  };

  const falconess = content.falconess.get(form.falconessId);
  const frames = frameChoices(content, form.falconessId);
  const skills = skillChoices(content, form.falconessId);
  const parts = partChoices(content);
  const player = form.field === "player";
  const L = FIELD_LIMITS;

  return (
    <section className={s.screen} aria-labelledby="libre-titulo">
      <header className={s.head}>
        <p className={s.eyebrow}>{ui("ui.freeRace.eyebrow")}</p>
        <h1 className={s.title} id="libre-titulo">
          {ui("ui.freeRace.title")}
        </h1>
        <p className={s.lead}>{ui("ui.freeRace.lead")}</p>
      </header>

      <Panel
        title={ui("ui.freeRace.form.title")}
        actions={
          <Button
            id="libre-cambiar"
            size="sm"
            variant={editing ? "ghost" : "secondary"}
            aria-expanded={editing}
            aria-controls="libre-form"
            onClick={() => setEditing((v) => !v)}
          >
            {ui(editing ? "ui.freeRace.edit.close" : "ui.freeRace.edit")}
          </Button>
        }
      >
        <p className={s.summary}>{summary(outcome.form, content)}</p>
        <p className={s.cli}>
          <span>{ui("ui.freeRace.cli")}</span>
          <code>{cliArgs(outcome.form)}</code>
        </p>
        <form
          id="libre-form"
          className={s.form}
          onSubmit={submit}
          aria-describedby={`${formKey}-nota`}
          hidden={!editing}
        >
          <div className={s.row}>
            <div className={s.field}>
              <label htmlFor="libre-pista">{ui("ui.freeRace.course")}</label>
              <select
                id="libre-pista"
                value={form.courseId}
                onChange={(e) => set({ courseId: e.currentTarget.value })}
              >
                {[...content.courses.values()].map((c) => (
                  <option key={c.id} value={c.id}>
                    {ui("ui.freeRace.course.option", {
                      name: gameText(c.textKey),
                      m: metres(c.segments.reduce((sum, seg) => sum + seg.length * 1000, 0)),
                    })}
                  </option>
                ))}
              </select>
            </div>
            <div className={s.field}>
              <label htmlFor="libre-semilla">{ui("ui.freeRace.seed")}</label>
              <span className={s.inline}>
                <input
                  id="libre-semilla"
                  type="text"
                  spellCheck={false}
                  autoComplete="off"
                  value={form.seed}
                  onChange={(e) => set({ seed: e.currentTarget.value })}
                />
                <Button
                  id="libre-semilla-otra"
                  size="sm"
                  onClick={() => set({ seed: randomSeed() })}
                >
                  {ui("ui.freeRace.seed.other")}
                </Button>
              </span>
            </div>
            <fieldset className={s.field}>
              <legend>{ui("ui.freeRace.field")}</legend>
              <span className={s.segmented}>
                <label htmlFor="libre-campo-jugadora" className={cx(s.seg, player && s.segOn)}>
                  <input
                    id="libre-campo-jugadora"
                    type="radio"
                    name="libre-campo"
                    checked={player}
                    onChange={() => set({ field: "player" })}
                  />
                  {ui("ui.freeRace.field.player")}
                </label>
                <label htmlFor="libre-campo-neutral" className={cx(s.seg, !player && s.segOn)}>
                  <input
                    id="libre-campo-neutral"
                    type="radio"
                    name="libre-campo"
                    checked={!player}
                    onChange={() => set({ field: "neutral" })}
                  />
                  {ui("ui.freeRace.field.neutral")}
                </label>
              </span>
            </fieldset>
          </div>

          {player ? (
            <>
              <div className={s.row}>
                <div className={s.field}>
                  <label htmlFor="libre-corredora">{ui("ui.freeRace.falconess")}</label>
                  <select
                    id="libre-corredora"
                    value={form.falconessId}
                    onChange={(e) =>
                      set({ falconessId: e.currentTarget.value, frameId: "", skills: [] })
                    }
                  >
                    {[...content.falconess.values()].map((f) => (
                      <option key={f.id} value={f.id}>
                        {gameText(f.textKey)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={s.field}>
                  <label htmlFor="libre-bastidor">{ui("ui.freeRace.frame")}</label>
                  <select
                    id="libre-bastidor"
                    value={form.frameId === "" ? (frames[0] ?? "") : form.frameId}
                    onChange={(e) =>
                      set({
                        frameId: e.currentTarget.value === frames[0] ? "" : e.currentTarget.value,
                      })
                    }
                  >
                    {frames.map((id) => {
                      const fr = content.frames.get(id);
                      if (!fr) return null;
                      return (
                        <option key={id} value={id}>
                          {ui("ui.freeRace.frame.option", {
                            name: gameText(fr.textKey),
                            mfr: gameText(content.getManufacturer(fr.manufacturer).textKey),
                            style: gameText(`style.${fr.style}`),
                          })}
                        </option>
                      );
                    })}
                  </select>
                  {(() => {
                    const fr = content.frames.get(
                      form.frameId === "" ? (frames[0] ?? "") : form.frameId,
                    );
                    const mfr = fr && content.manufacturers.get(fr.manufacturer);
                    return mfr ? (
                      <p className={s.hint}>
                        <Livery palette={mfr.palette} size="sm" /> {gameText(`rule.${mfr.rule}`)}
                      </p>
                    ) : null;
                  })()}
                </div>
                <fieldset className={s.field}>
                  <legend>{ui("ui.freeRace.stats")}</legend>
                  <span className={s.segmented}>
                    <label
                      htmlFor="libre-stats-base"
                      className={cx(s.seg, form.statsMode === "base" && s.segOn)}
                    >
                      <input
                        id="libre-stats-base"
                        type="radio"
                        name="libre-stats-modo"
                        checked={form.statsMode === "base"}
                        onChange={() => set({ statsMode: "base" })}
                      />
                      {ui("ui.freeRace.stats.base")}
                    </label>
                    <label
                      htmlFor="libre-stats-iguales"
                      className={cx(s.seg, form.statsMode === "uniform" && s.segOn)}
                    >
                      <input
                        id="libre-stats-iguales"
                        type="radio"
                        name="libre-stats-modo"
                        checked={form.statsMode === "uniform"}
                        onChange={() => set({ statsMode: "uniform" })}
                      />
                      {ui("ui.freeRace.stats.uniform")}
                    </label>
                  </span>
                  {form.statsMode === "base" && falconess ? (
                    <p className={s.hint}>
                      {ui("ui.freeRace.stats.baseNote", {
                        list: Object.entries(falconess.baseStats)
                          .map(([k, v]) => `${ui(`ui.stat.abbr.${k}`)} ${v}`)
                          .join(" · "),
                      })}
                    </p>
                  ) : null}
                </fieldset>
                {form.statsMode === "uniform" && (
                  <NumberField
                    id="libre-stats"
                    label={ui("ui.freeRace.stats.value")}
                    hint={ui("ui.freeRace.range", { min: L.minStat, max: L.maxStat })}
                    value={form.stats}
                    min={L.minStat}
                    max={L.maxStat}
                    onChange={(n) => set({ stats: n })}
                  />
                )}
                <NumberField
                  id="libre-semana"
                  label={ui("ui.freeRace.turn")}
                  hint={ui("ui.freeRace.turn.note")}
                  value={form.turn}
                  min={L.minTurn}
                  max={L.maxTurn}
                  onChange={(n) => set({ turn: n })}
                />
              </div>
              <div className={s.lists}>
                <CheckList
                  name="libre-habilidad"
                  legend={ui("ui.freeRace.skills")}
                  note={ui("ui.freeRace.skills.note")}
                  options={skills.map((id) => ({
                    id,
                    label: gameText(content.getSkill(id).textKey),
                  }))}
                  chosen={form.skills}
                  max={ctx.ruleset.race.maxSkills}
                  onChange={(ids) => set({ skills: ids })}
                />
                <CheckList
                  name="libre-pieza"
                  legend={ui("ui.freeRace.parts")}
                  note={ui("ui.freeRace.parts.note")}
                  options={parts.map((id) => ({
                    id,
                    label: gameText(content.getPart(id).textKey),
                  }))}
                  chosen={form.parts}
                  max={MAX_PARTS}
                  onChange={(ids) => set({ parts: ids })}
                />
              </div>
            </>
          ) : (
            <div className={s.row}>
              <NumberField
                id="libre-neutral-stats"
                label={ui("ui.freeRace.neutral.stats")}
                hint={ui("ui.freeRace.neutral.note")}
                value={form.neutralStats}
                min={L.minStat}
                max={L.maxStat}
                onChange={(n) => set({ neutralStats: n })}
              />
            </div>
          )}

          <div className={s.submit}>
            <Button id="libre-correr" submit variant="primary" size="lg">
              {ui("ui.freeRace.run")}
            </Button>
            <p className={s.hint} id={`${formKey}-nota`}>
              {ui("ui.freeRace.run.note")}
            </p>
          </div>
        </form>
      </Panel>

      {outcome.ok ? (
        <Replay log={outcome.log} idPrefix="libre" />
      ) : (
        <div className={s.error} role="alert">
          <p>{ui("ui.freeRace.error")}</p>
          <code>{outcome.detail}</code>
        </div>
      )}
    </section>
  );
}
