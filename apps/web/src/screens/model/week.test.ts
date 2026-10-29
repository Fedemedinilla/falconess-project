import { loadRawContent } from "@falconess/content";
import { resolveLoggedEvent, stepLog } from "@falconess/race-view";
import { buildContentIndex, type RunInput, type SeasonState } from "@falconess/schema";
import { advanceSeason, RULESET_V1, RULESET_V2, STAT_ORDER, startSeason } from "@falconess/sim";
import { beforeAll, describe, expect, it } from "vitest";
import { getContent } from "../../content/load";
import { formatSigned } from "../../text/format";
import { gameText, ui, uiCount } from "../../text/ui";
import { goalStatuses } from "./season";
import {
  effectsTone,
  loggedEvent,
  newNotes,
  type WeekOutcomeKind,
  type WeekStep,
  weekSummary,
} from "./week";

const content = getContent();
const ctx = { ruleset: RULESET_V1, content };
const v2 = { ruleset: RULESET_V2, content };
const HANGAR = ["shiden", "mule", "nimbus", "falke"];
const PEREGRINA = gameText("falconess.peregrina");

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
    // v1 has no risk bands
    expect(vigor?.band).toBeUndefined();
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
    // the cause note itself is not said twice
    expect(w.notes.map((n) => n.key)).not.toContain("log.mood.failure");
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
    expect(w.headline).toMatchObject({
      icon: "event",
      text: ui("ui.week.title.event", { option: gameText(option?.textKey ?? "") }),
    });
    // an answer reads as good or bad news by what it did
    const branch = step.after.log.find((e) => e.event?.id === pending.eventId)?.event?.branch;
    const fx = option ? [option.effects] : [];
    const drawn = branch === undefined ? undefined : option?.chance?.[branch];
    expect(w.headline.tone).toBe(effectsTone(drawn ? [...fx, drawn.effects] : fx));
    expect(w.event).toBeUndefined();
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
    entry.notes.push("log.mood.drift", "log.season.start", "log.algo.nuevo", "log.algo.down");
    after.mood = step.before.mood - 1;
    const w = weekSummary(ctx, { ...step, after });
    expect(w.rows.find((r) => r.id === "mood")?.cause).toBe(
      ui("ui.week.cause.drift", { name: PEREGRINA }),
    );
    expect(w.notes).toEqual([
      {
        key: "log.season.start",
        icon: undefined,
        text: gameText("log.season.start"),
        tone: "neutral",
      },
      { key: "log.algo.nuevo", icon: undefined, text: "log.algo.nuevo", tone: "neutral" },
      { key: "log.algo.down", icon: undefined, text: "log.algo.down", tone: "bad" },
    ]);
  });

  it("reads the event a log entry records, chosen or applied by itself", () => {
    const step = need(found, "event");
    const entry = step.after.log.find((e) => e.turn === step.before.pendingEvent?.turn);
    if (!entry) throw new Error("no log");
    expect(loggedEvent(entry)).toMatchObject({ id: step.before.pendingEvent?.eventId });
    expect(loggedEvent(entry)?.auto).toBeUndefined();
    expect(loggedEvent(need(found, "train-ok").before.log[0] ?? entry)).toBeUndefined();
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

/** A v2-only luck event at week 2 (packages/sim events.test.ts' fixture): the page shows any. */
const TAILWIND = {
  id: "test-tailwind",
  version: 1,
  source: { kind: "random" },
  weight: null,
  fixedTurn: 2,
  auto: true,
  rulesets: ["v2"],
  textKey: "test.tailwind",
  options: [
    {
      textKey: "test.tailwind.opt",
      effects: { stats: { agility: 5 } },
      chance: [
        { p: 0.5, textKey: "test.tailwind.good", effects: { mood: 1, fatigue: -10 } },
        { p: 0.5, textKey: "test.tailwind.bad", effects: { mood: -1, fatigue: 15 } },
      ],
    },
  ],
};
const TAILWIND_TEXT = {
  "test.tailwind": "Viento de cola en la pista.",
  "test.tailwind.opt": "Sale a aprovecharlo.",
  "test.tailwind.good": "Vuela como nunca.",
  "test.tailwind.bad": "Una ráfaga la tumba.",
};

/** A luck event at week 4 that only gives a stat: it is no cause of the vigor a training cost. */
const GUST = {
  id: "test-gust",
  version: 1,
  source: { kind: "random" },
  weight: null,
  fixedTurn: 4,
  auto: true,
  rulesets: ["v2"],
  textKey: "test.gust",
  options: [{ textKey: "test.gust.opt", effects: { stats: { courage: 3 } } }],
};
const GUST_TEXT = { "test.gust": "Una racha limpia.", "test.gust.opt": "La aprovecha." };

/** An effect on a stat as the event dialog and «Lo que pasó» word it: "Agilidad +10". */
function fxStat(stat: string, delta: number): string {
  return ui("ui.fx.stat", { stat: gameText(`stat.${stat}`), delta: formatSigned(delta) });
}

function withTailwind() {
  const raw = loadRawContent();
  return buildContentIndex({
    ...raw,
    events: [...raw.events, TAILWIND, GUST],
    text: { ...raw.text, ...TAILWIND_TEXT, ...GUST_TEXT },
  });
}

type FoundV2 = Partial<
  Record<"drift" | "race-loss" | "race-loss-even" | "rest" | "rest-full" | "exhausted", WeekStep>
>;

/**
 * v2 seasons that spam one training (drift, exhaustion), only rest (a lost goal race, rests with
 * the bar full) or train twice and rest (rests that give vigor back).
 */
function collectV2(): FoundV2 {
  const found: FoundV2 = {};
  for (let seed = 0; seed < 60 && Object.keys(found).length < 6; seed++) {
    const policy = seed % 3;
    let state = startSeason(v2, `week2-${seed}`, {
      kind: "start",
      falconessId: "peregrina",
      hangar: HANGAR,
      parents: [],
    });
    for (let i = 0; state.status === "active" && i < 80; i++) {
      const input: RunInput = state.pendingEvent
        ? { kind: "event:choose", option: 0 }
        : policy === 0 || (policy === 2 && state.turn % 3 !== 0)
          ? { kind: "train:agility" }
          : { kind: "rest" };
      const after = advanceSeason(v2, state, input);
      const step = { before: state, input, after };
      const notes = newNotes(state, after);
      const moved = after.mood !== state.mood;
      // a luck event the same week (v2 content) moves mood and vigor too: keep those steps out
      const luck = after.log.some((e, i) => e.event?.auto === true && !state.log[i]?.event);
      if (luck) {
        state = after;
        continue;
      }
      if (notes.includes("log.mood.drift") && !notes.includes("log.mood.failure"))
        found.drift ??= step;
      if (notes.includes("log.mood.race-loss")) {
        if (moved) found["race-loss"] ??= step;
        else found["race-loss-even"] ??= step;
      }
      if (notes.some((n) => n.startsWith("log.vigor.rest."))) {
        if (after.fatigue !== state.fatigue) found.rest ??= step;
        else found["rest-full"] ??= step;
      }
      if (notes.includes("log.vigor.exhausted")) found.exhausted ??= step;
      state = after;
    }
  }
  return found;
}

describe("«Lo que pasó» on ruleset v2: mood with its causes, vigor, luck events", () => {
  let found: FoundV2 = {};
  beforeAll(() => {
    found = collectV2();
  });
  const needV2 = (key: keyof FoundV2): WeekStep => {
    const step = found[key];
    if (!step) throw new Error(`no ${key} step in the v2 seasons played`);
    return step;
  };

  it("says she is tired of training when a streak lowers her mood", () => {
    const w = weekSummary(v2, needV2("drift"));
    const mood = w.rows.find((r) => r.id === "mood");
    expect(mood).toMatchObject({ value: "−1", tone: "bad" });
    expect(mood?.cause).toBe(ui("ui.week.cause.drift", { name: PEREGRINA }));
    expect(mood?.cause).toContain(PEREGRINA);
    expect(w.notes.map((n) => n.key)).not.toContain("log.mood.drift");
  });

  it("says a goal race finished far back left her down", () => {
    const step = needV2("race-loss");
    const w = weekSummary(v2, step);
    expect(w.race?.place).toBeGreaterThanOrEqual(RULESET_V2.season.raceLossMoodAt);
    expect(w.rows.find((r) => r.id === "mood")?.cause).toContain(ui("ui.week.cause.raceLoss"));
  });

  it("still says what moved her mood when the changes cancel out (a rest's lift, a lost race)", () => {
    const step = needV2("race-loss-even");
    const w = weekSummary(v2, step);
    expect(w.rows.find((r) => r.id === "mood")).toBeUndefined();
    const notes = w.notes.filter((n) => n.key.startsWith("log.mood."));
    expect(notes.find((n) => n.key === "log.mood.race-loss")).toMatchObject({
      icon: "mood",
      tone: "bad",
    });
    for (const n of notes)
      if (n.key === "log.mood.rest" || n.key === "log.mood.outing") expect(n.tone).toBe("good");
  });

  it("tells how a drawn rest went, good or bad news", () => {
    const step = needV2("rest");
    const w = weekSummary(v2, step);
    const note = w.notes.find((n) => n.key.startsWith("log.vigor.rest."));
    expect(note?.icon).toBe("vigor");
    expect(note?.tone).toBe(
      note?.key === "log.vigor.rest.great"
        ? "good"
        : note?.key === "log.vigor.rest.poor"
          ? "bad"
          : "neutral",
    );
    expect(w.rows.find((r) => r.id === "vigor")?.tone).toBe("good");
    // with the bar already full, how she slept is not news
    const full = weekSummary(v2, needV2("rest-full"));
    expect(full.notes.map((n) => n.key).filter((k) => k.startsWith("log.vigor.rest."))).toEqual([]);
  });

  it("names an injury from exhaustion, in red", () => {
    const w = weekSummary(v2, needV2("exhausted"));
    expect(w.outcome).toBe("injury");
    expect(w.notes.find((n) => n.key === "log.vigor.exhausted")).toMatchObject({
      icon: "injury",
      tone: "bad",
    });
    // the vigor it ended at (when it moved: an empty bar stays empty), with the bar's band
    const vigor = w.rows.find((r) => r.id === "vigor");
    if (vigor) {
      expect(Number(vigor.to)).toBeLessThanOrEqual(20);
      expect(vigor.band).toEqual({ label: ui("ui.turn.vigor.band.injury"), tone: "bad" });
    } else expect(needV2("exhausted").after.fatigue).toBe(100);
  });

  it("shows a luck event applied by itself: its text, what happened, how it came out", () => {
    const tailCtx = { ruleset: RULESET_V2, content: withTailwind() };
    const tones = new Set<string>();
    for (let n = 0; n < 12; n++) {
      let s = startSeason(tailCtx, `tail-${n}`, {
        kind: "start",
        falconessId: "peregrina",
        hangar: HANGAR,
        parents: [],
      });
      s = advanceSeason(tailCtx, s, { kind: "rest" });
      while (s.pendingEvent) s = advanceSeason(tailCtx, s, { kind: "event:choose", option: 0 });
      const step = { before: s, input: { kind: "train:stamina" } as const, after: s };
      const after = advanceSeason(tailCtx, s, step.input);
      const w = weekSummary(tailCtx, { ...step, after });
      const branch = after.log.find((e) => e.turn === 2 && e.event)?.event?.branch;
      const good = branch === 0;
      expect(w.event).toEqual({
        id: "test-tailwind",
        branch,
        text: TAILWIND_TEXT["test.tailwind"],
        option: TAILWIND_TEXT["test.tailwind.opt"],
        outcome: TAILWIND_TEXT[good ? "test.tailwind.good" : "test.tailwind.bad"],
        // the option's effects, then the drawn branch's, as the event dialog words them
        effects: [
          { icon: "stat.agility", text: fxStat("agility", 5) },
          { icon: "mood", text: ui("ui.fx.mood", { delta: formatSigned(good ? 1 : -1) }) },
          { icon: "vigor", text: ui("ui.fx.vigor", { delta: formatSigned(good ? 10 : -15) }) },
        ],
        // agility +5 and mood +1, vigor +10: good news; with mood −1 and vigor −15: mixed
        tone: good ? "good" : "warn",
      });
      tones.add(w.event?.tone ?? "");
      // said once: in the event block, not again as notes
      const keys = w.notes.map((x) => x.key);
      for (const key of Object.keys(TAILWIND_TEXT)) expect(keys).not.toContain(key);
      // its effects are in the rows, with the event as a cause
      const mood = w.rows.find((r) => r.id === "mood");
      if (mood) expect(mood.cause).toContain(ui("ui.week.cause.event"));
      expect(w.rows.find((r) => r.id === "vigor")?.cause).toContain(ui("ui.week.cause.event"));
    }
    expect(tones).toEqual(new Set(["good", "warn"]));
  });

  it("names a luck event as a cause only of what it changed", () => {
    const gustCtx = { ruleset: RULESET_V2, content: withTailwind() };
    let s = startSeason(gustCtx, "gust", {
      kind: "start",
      falconessId: "peregrina",
      hangar: HANGAR,
      parents: [],
    });
    while (s.turn < 4 || s.pendingEvent)
      s = advanceSeason(
        gustCtx,
        s,
        s.pendingEvent ? { kind: "event:choose", option: 0 } : { kind: "rest" },
      );
    const input = { kind: "train:stamina" } as const;
    const w = weekSummary(gustCtx, { before: s, input, after: advanceSeason(gustCtx, s, input) });
    expect(w.event).toMatchObject({ id: "test-gust", tone: "good" });
    expect(w.stats.find((x) => x.stat === "courage")?.delta).toBeGreaterThan(0);
    expect(w.rows.find((r) => r.id === "vigor")?.cause).toBe(ui("ui.week.cause.training"));
  });

  it("weighs an event's effects: all help is good news, all hurt is bad, a mix is neither", () => {
    const fx = (over: object) => ({
      stats: {},
      mood: 0,
      fatigue: 0,
      bond: {},
      skillPoints: 0,
      scrap: 0,
      feathers: 0,
      durability: 0,
      injuryTurns: 0,
      ...over,
    });
    expect(effectsTone([fx({ stats: { agility: 4 } }), fx({ fatigue: -10 })])).toBe("good");
    expect(effectsTone([fx({ fatigue: 10 }), fx({ mood: -1 })])).toBe("bad");
    expect(effectsTone([fx({ injuryTurns: 1 })])).toBe("bad");
    expect(effectsTone([fx({ scrap: 20, mood: -1 })])).toBe("warn");
    expect(effectsTone([fx({})])).toBe("neutral");
  });
});

describe("«Lo que pasó» with the content's luck events (v2), read as the CLI reads them", () => {
  /** The first step of each luck event (and chance branch) a few v2 seasons bring. */
  function luckSteps(): Map<string, WeekStep> {
    const found = new Map<string, WeekStep>();
    for (let seed = 0; seed < 80 && found.size < 18; seed++) {
      let state = startSeason(v2, `luck-${seed}`, {
        kind: "start",
        falconessId: ["peregrina", "caracara", "cernicala"][seed % 3] ?? "peregrina",
        hangar: HANGAR,
        parents: [],
      });
      for (let i = 0; state.status === "active" && i < 80; i++) {
        const input: RunInput = state.pendingEvent
          ? { kind: "event:choose", option: 0 }
          : state.fatigue >= 60
            ? { kind: "rest" }
            : (CYCLE[(i + seed) % CYCLE.length] ?? { kind: "rest" });
        const after = advanceSeason(v2, state, input);
        const event = stepLog(state, after).event;
        if (event?.auto) {
          const key = event.branch === undefined ? event.id : `${event.id}#${event.branch}`;
          if (!found.has(key)) found.set(key, { before: state, input, after });
        }
        state = after;
      }
    }
    return found;
  }
  let luck = new Map<string, WeekStep>();
  beforeAll(() => {
    luck = luckSteps();
  });
  const step = (key: string): WeekStep => {
    const found = luck.get(key);
    if (!found) throw new Error(`no ${key} in the v2 seasons played`);
    return found;
  };

  it("finds luck events of every stretch of the season, on their own block", () => {
    const ids = new Set([...luck.keys()].map((k) => k.split("#")[0]));
    expect(ids.size).toBeGreaterThanOrEqual(12);
    for (const [key, s] of luck) {
      const w = weekSummary(v2, s);
      const logged = stepLog(s.before, s.after).event;
      const resolved = logged && resolveLoggedEvent(content, logged);
      if (!resolved) throw new Error(`content does not know ${key}`);
      expect(w.event?.id, key).toBe(resolved.event.id);
      expect(w.event?.text, key).toBe(gameText(resolved.event.textKey));
      expect(w.event?.option, key).toBe(gameText(resolved.option.textKey));
      expect(w.event?.outcome, key).toBe(
        resolved.branch?.textKey === undefined ? undefined : gameText(resolved.branch.textKey),
      );
      // its texts are said once (in the block), and the headline is still the week's action
      const noteKeys = w.notes.map((n) => n.key);
      for (const k of resolved.noteKeys) expect(noteKeys, key).not.toContain(k);
      expect(w.outcome, key).not.toBe("event");
      // the stats the CLI's 🎲 line prints are the block's stat effects
      const effects = w.event?.effects.map((e) => e.text);
      for (const { stat, delta } of resolved.stats)
        expect(effects, key).toContain(fxStat(stat, delta));
      // the chips under the headline are the action's own: the week's change minus the event's
      const eventDelta = new Map(resolved.stats.map(({ stat, delta }) => [stat, delta]));
      const own = STAT_ORDER.map((stat) => ({
        stat,
        delta: s.after.stats[stat] - s.before.stats[stat] - (eventDelta.get(stat) ?? 0),
      })).filter((x) => x.delta !== 0);
      expect(w.stats, key).toEqual(own);
      // the block lists the event's mood: no note says it again
      expect(noteKeys, key).not.toContain("log.mood.event.up");
      expect(noteKeys, key).not.toContain("log.mood.event.down");
    }
  });

  it("keeps a luck event's stats out of the week's chips: a rest week shows none", () => {
    // a rest gains no stats: whatever stat a luck event gave is in its block only
    let rest: WeekStep | undefined;
    for (let seed = 0; seed < 60 && !rest; seed++) {
      let state = startSeason(v2, `luck-rest-${seed}`, {
        kind: "start",
        falconessId: "peregrina",
        hangar: HANGAR,
        parents: [],
      });
      // rest every other week: the luck events of weeks 2–11 land on rests often
      for (let i = 0; state.status === "active" && i < 24 && !rest; i++) {
        const input: RunInput = state.pendingEvent
          ? { kind: "event:choose", option: 0 }
          : i % 2 === 0
            ? { kind: "rest" }
            : { kind: "train:agility" };
        const after = advanceSeason(v2, state, input);
        const moved = STAT_ORDER.some((stat) => after.stats[stat] !== state.stats[stat]);
        if (input.kind === "rest" && stepLog(state, after).event?.auto && moved)
          rest = { before: state, input, after };
        state = after;
      }
    }
    if (!rest) throw new Error("no luck event with stats on a rest week in 60 seasons");
    const w = weekSummary(v2, rest);
    expect(w.stats).toEqual([]);
    expect(w.event?.effects.some((e) => e.icon.startsWith("stat."))).toBe(true);
  });

  it("says what the tailwind gave, apart from the training's gains", () => {
    const w = weekSummary(v2, step("luck-tailwind"));
    expect(w.event).toMatchObject({
      text: gameText("ev.luck-tailwind"),
      option: gameText("ev.luck-tailwind.opt0"),
      outcome: undefined,
      tone: "good",
    });
    expect(w.event?.effects).toEqual([
      { icon: "stat.agility", text: fxStat("agility", 10) },
      { icon: "stat.technique", text: fxStat("technique", 6) },
    ]);
  });

  it("says which side of the rival's smile came up, good or bad news", () => {
    const good = weekSummary(v2, step("luck-rival-smile#0"));
    expect(good.event).toMatchObject({
      branch: 0,
      outcome: gameText("ev.luck-rival-smile.good"),
      tone: "good",
    });
    expect(good.event?.effects.map((e) => e.text)).toEqual([
      fxStat("stamina", 6),
      fxStat("courage", 10),
    ]);
    const bad = weekSummary(v2, step("luck-rival-smile#1"));
    expect(bad.event).toMatchObject({
      branch: 1,
      outcome: gameText("ev.luck-rival-smile.bad"),
      tone: "bad",
    });
    expect(bad.event?.effects).toEqual([
      { icon: "mood", text: ui("ui.fx.mood", { delta: formatSigned(-1) }) },
    ]);
    const mood = bad.rows.find((r) => r.id === "mood");
    if (mood) expect(mood.cause).toContain(ui("ui.week.cause.event"));
  });

  it("says the vigor a head cold took and a long sleep gave, even when the week evens it out", () => {
    const cold = weekSummary(v2, step("luck-head-cold"));
    expect(cold.event).toMatchObject({ tone: "bad" });
    expect(cold.event?.effects).toEqual([
      { icon: "vigor", text: ui("ui.fx.vigor", { delta: formatSigned(-15) }) },
    ]);
    const coldVigor = cold.rows.find((r) => r.id === "vigor");
    if (coldVigor) expect(coldVigor.cause).toContain(ui("ui.week.cause.event"));
    const sleep = weekSummary(v2, step("luck-long-sleep"));
    expect(sleep.event).toMatchObject({ tone: "good" });
    // a training's −20 and the sleep's +20 leave no vigor row: the block still says it
    expect(sleep.event?.effects).toEqual([
      { icon: "vigor", text: ui("ui.fx.vigor", { delta: formatSigned(20) }) },
    ]);
  });
});
