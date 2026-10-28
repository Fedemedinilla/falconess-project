import type { RunInput, SeasonState } from "@falconess/schema";
import { advanceSeason, RULESET_V1, STAT_ORDER, startSeason } from "@falconess/sim";
import { beforeAll, describe, expect, it } from "vitest";
import { getContent } from "../../content/load";
import { gameText, ui, uiCount } from "../../text/ui";
import { goalStatuses } from "./season";
import { loggedEvent, newNotes, type WeekOutcomeKind, type WeekStep, weekSummary } from "./week";

const content = getContent();
const ctx = { ruleset: RULESET_V1, content };
const HANGAR = ["shiden", "mule", "nimbus", "falke"];

/** A policy that tries every action: trainings, risk flights, rests, outings, the workshop. */
const CYCLE: readonly RunInput[] = [
  { kind: "train:agility" },
  { kind: "train:risk-flight" },
  { kind: "train:stamina" },
  { kind: "outing" },
  { kind: "train:simulator" },
  { kind: "train:technique" },
  { kind: "train:agility" },
  { kind: "workshop", ops: [{ op: "repair" }] },
  { kind: "rest" },
];

type Found = Partial<Record<WeekOutcomeKind | "race-met" | "race-failed" | "event-next", WeekStep>>;

/** Play seasons until a step of every kind the tests need has turned up. */
function collect(): Found {
  const found: Found = {};
  const want = (key: keyof Found, step: WeekStep) => {
    found[key] ??= step;
  };
  for (let seed = 0; seed < 60; seed++) {
    let state: SeasonState = startSeason(ctx, `week-${seed}`, {
      kind: "start",
      falconessId: ["peregrina", "caracara", "cernicala"][seed % 3] ?? "peregrina",
      hangar: HANGAR,
      parents: [],
    });
    for (let i = 0; state.status === "active" && i < 80; i++) {
      const input: RunInput = state.pendingEvent
        ? { kind: "event:choose", option: i % 2 }
        : (CYCLE[(i + seed) % CYCLE.length] ?? { kind: "rest" });
      const after = advanceSeason(ctx, state, input);
      const step = { before: state, input, after };
      const summary = weekSummary(ctx, step);
      // a plain week (no race), and a failure that can still lower the mood, to see its cause
      if (!summary.race && (summary.outcome !== "train-fail" || state.mood > -2))
        want(summary.outcome, step);
      if (summary.race) want(summary.race.met ? "race-met" : "race-failed", step);
      if (summary.eventNext && input.kind !== "event:choose") want("event-next", step);
      state = after;
    }
    if (Object.keys(found).length >= 12) break;
  }
  return found;
}

function need(found: Found, key: keyof Found): WeekStep {
  const step = found[key];
  if (!step) throw new Error(`no ${key} step in the seasons played`);
  return step;
}

/** A copy of a state (it is JSON by construction: the save format). */
function copy(state: SeasonState): SeasonState {
  return JSON.parse(JSON.stringify(state)) as SeasonState;
}

describe("«Lo que pasó»: one step of the run, read from the states and the log", () => {
  let found: Found = {};
  beforeAll(() => {
    found = collect();
  });

  it("says a training went well, with its gains and the vigor it cost", () => {
    const step = need(found, "train-ok");
    const w = weekSummary(ctx, step);
    expect(w.headline).toEqual({
      icon: "outcome.ok",
      text: ui("ui.week.title.train-ok"),
      tone: "good",
    });
    expect(w.turn).toBe(step.before.turn);
    expect(w.actionLine).toBeUndefined();
    for (const { stat, delta } of w.stats) {
      expect(delta).toBe(step.after.stats[stat] - step.before.stats[stat]);
      expect(delta).not.toBe(0);
    }
    expect(w.stats.map((s) => s.stat)).toEqual(
      STAT_ORDER.filter((s) => step.after.stats[s] !== step.before.stats[s]),
    );
    expect(w.stats.some((s) => s.delta > 0)).toBe(true);
    const vigor = w.rows.find((r) => r.id === "vigor");
    const cost = step.after.fatigue - step.before.fatigue;
    expect(cost).toBeGreaterThan(0);
    expect(vigor).toMatchObject({
      icon: "vigor",
      label: ui("ui.week.vigor"),
      value: `−${cost}`,
      tone: "bad",
      to: String(100 - step.after.fatigue),
      cause: ui("ui.week.cause.training"),
    });
    expect(w.notes).toEqual([]);
    expect(w.weekAction).toBe(step.input.kind);
  });

  it("says a training failed: half the gain lost and the mood it cost, with its cause", () => {
    const w = weekSummary(ctx, need(found, "train-fail"));
    expect(w.headline).toEqual({
      icon: "outcome.fail",
      text: ui("ui.week.title.train-fail"),
      tone: "bad",
    });
    expect(w.stats.every((s) => s.delta < 0)).toBe(true);
    expect(w.rows.find((r) => r.id === "mood")).toMatchObject({
      icon: "mood",
      value: "−1",
      tone: "bad",
      cause: ui("ui.week.cause.fail"),
    });
  });

  it("says an injury and how long it lasts, then the weeks spent injured", () => {
    const hurt = weekSummary(ctx, need(found, "injury"));
    expect(hurt.headline.text).toBe(ui("ui.week.title.injury"));
    expect(hurt.headline.icon).toBe("injury");
    expect(hurt.rows.find((r) => r.id === "injury")?.value).toBe(uiCount("ui.count.weeks", 2));
    const injured = weekSummary(ctx, need(found, "injured"));
    expect(injured.headline).toEqual({
      icon: "injury",
      text: ui("ui.week.title.injured"),
      tone: "warn",
    });
    expect(injured.rows.find((r) => r.id === "vigor")?.cause).toBe(ui("ui.week.cause.injured"));
  });

  it("names a rest, a forced rest, an outing with its crew, and the workshop", () => {
    const rest = weekSummary(ctx, need(found, "rest"));
    expect(rest.headline).toMatchObject({ icon: "action.rest", text: ui("ui.week.title.rest") });
    expect(rest.rows.find((r) => r.id === "vigor")?.tone).toBe("good");
    const moodUp = rest.rows.find((r) => r.id === "mood");
    if (moodUp) expect(moodUp.cause).toBe(ui("ui.week.cause.rest"));

    const forced = weekSummary(ctx, need(found, "forced-rest"));
    expect(forced.headline).toMatchObject({ tone: "warn", text: ui("ui.week.title.forced-rest") });

    const step = need(found, "outing");
    const outing = weekSummary(ctx, step);
    const crew = content.getManufacturer(content.getFrame(step.before.equippedFrame).manufacturer);
    expect(outing.headline).toEqual({
      icon: "action.outing",
      text: ui("ui.week.title.outing", { crew: gameText(crew.crew.textKey) }),
      tone: "neutral",
    });
    expect(outing.rows.find((r) => r.id === "bond")).toMatchObject({
      value: `+${ctx.ruleset.season.bondPerOuting}`,
      cause: gameText(crew.crew.textKey),
    });

    const workshop = weekSummary(ctx, need(found, "workshop"));
    expect(workshop.headline).toMatchObject({
      icon: "action.workshop",
      text: ui("ui.week.title.workshop"),
    });
    expect(workshop.rows.find((r) => r.id === "vigor")?.cause).toBe(ui("ui.week.cause.workshop"));
  });

  it("puts the goal race in the headline and the action one line below", () => {
    const step = need(found, "race-met");
    const w = weekSummary(ctx, step);
    const result = step.after.raceResults.at(-1);
    if (!w.race || !result) throw new Error("no race");
    const goal = goalStatuses(ctx, step.after).find((g) => g.goal.turn === result.turn);
    expect(w.race).toEqual({
      turn: result.turn,
      courseId: result.courseId,
      place: result.place,
      field: result.fieldSize,
      minPlace: goal?.goal.minPlace,
      met: true,
      timeTicks: result.timeTicks,
    });
    expect(w.headline.text).toBe(
      ui("ui.week.title.race.met", { place: result.place, field: result.fieldSize }),
    );
    expect(w.headline.tone).toBe("good");
    expect(w.actionLine).toBeDefined();
    expect(w.context).toContain(gameText(content.getCourse(result.courseId).textKey));
    expect(w.rows.find((r) => r.id === "scrap")?.cause).toContain(ui("ui.week.cause.race"));
    expect(w.notes.map((n) => n.key)).not.toContain("log.race");
  });

  it("says a goal race that fell short", () => {
    const w = weekSummary(ctx, need(found, "race-failed"));
    expect(w.race?.met).toBe(false);
    expect(w.headline.tone).toBe("bad");
    expect(w.headline.text).toBe(
      ui("ui.week.title.race.failed", { place: w.race?.place ?? 0, field: w.race?.field ?? 0 }),
    );
  });

  it("answers an event with the option chosen, its text as context and the week's action", () => {
    const step = need(found, "event");
    const w = weekSummary(ctx, step);
    const pending = step.before.pendingEvent;
    if (!pending || step.input.kind !== "event:choose") throw new Error("fixture");
    const event = content.getEvent(pending.eventId);
    const option = event.options[step.input.option];
    expect(w.headline).toEqual({
      icon: "event",
      text: ui("ui.week.title.event", { option: gameText(option?.textKey ?? "") }),
      tone: "neutral",
    });
    expect(w.context).toBe(gameText(event.textKey));
    expect(w.turn).toBe(pending.turn);
    expect(w.notes.map((n) => n.key)).not.toContain(event.textKey);
    expect(w.weekAction).toBeDefined();
    expect(w.weekAction).not.toBe("event:choose");
    for (const row of w.rows)
      if (row.id !== "bond") expect(row.cause).toBe(ui("ui.week.cause.event"));
  });

  it("warns that an event comes next when the step left one waiting", () => {
    const w = weekSummary(ctx, need(found, "event-next"));
    expect(w.eventNext).toBe(true);
    expect(weekSummary(ctx, need(found, "train-ok")).eventNext).toBe(
      need(found, "train-ok").after.pendingEvent !== undefined,
    );
  });

  it("reads the notes the step added, and says unknown ones through the text lookup", () => {
    const step = need(found, "train-ok");
    expect(newNotes(step.before, step.after)).toEqual(["log.train.ok"]);
    const after = copy(step.after);
    const entry = after.log.at(-1);
    if (!entry) throw new Error("no log");
    // ruleset v2 notes: a mood drift (said as the mood's cause) and keys this page does not know
    entry.notes.push("log.mood.drift", "log.season.start", "log.algo.nuevo");
    after.mood = step.before.mood - 1;
    const w = weekSummary(ctx, { ...step, after });
    expect(w.rows.find((r) => r.id === "mood")?.cause).toBe(ui("ui.week.cause.drift"));
    expect(w.notes).toEqual([
      { key: "log.season.start", icon: undefined, text: gameText("log.season.start") },
      { key: "log.algo.nuevo", icon: undefined, text: "log.algo.nuevo" },
    ]);
  });

  it("shows an event the sim applied by itself (v2 `event` on a log entry), once", () => {
    const step = need(found, "rest");
    const after = copy(step.after);
    const entry = after.log.at(-1);
    if (!entry) throw new Error("no log");
    const event = content.getEvent("sandstorm-week");
    Object.assign(entry, { event: { id: event.id, branch: 1 } });
    entry.notes.push(event.textKey);
    after.wallet.scrap += 15;
    expect(loggedEvent(entry)).toEqual({ id: event.id, branch: 1 });
    const w = weekSummary(ctx, { ...step, after });
    expect(w.event).toEqual({ id: event.id, branch: 1, text: gameText(event.textKey) });
    expect(w.notes.map((n) => n.key)).not.toContain(event.textKey);
    // its effects are in the states: each change names the sources that can make it
    expect(w.rows.find((r) => r.id === "scrap")?.cause).toBe(ui("ui.week.cause.event"));
    expect(w.rows.find((r) => r.id === "vigor")?.cause).toBe(
      [ui("ui.week.cause.rest"), ui("ui.week.cause.event")].join(", "),
    );
    // an entry without the field, or with a broken one, has no event
    expect(loggedEvent(step.after.log.at(-1) ?? entry)).toBeUndefined();
    expect(loggedEvent(Object.assign(copy(step.after).log.at(-1) ?? entry, { event: 3 }))).toBe(
      undefined,
    );
  });

  it("has a headline text for every outcome", () => {
    for (const kind of [
      "train-ok",
      "train-fail",
      "injury",
      "injured",
      "forced-rest",
      "rest",
      "workshop",
    ])
      expect(content.text.has(`ui.week.title.${kind}`), kind).toBe(true);
  });
});
