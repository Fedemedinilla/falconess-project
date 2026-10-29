/**
 * «Lo que pasó»: what one input of the run did, for the popup that opens after it
 * (screens/WeekDialog.tsx). Everything is read from the two states around the input and from the
 * season log the sim wrote between them; nothing is recomputed:
 *
 * - the headline from the input and the log notes (`log.train.ok`, `log.train.fail`…), or the goal
 *   race when the week ran one (the action's own outcome then goes one line below);
 * - stats, vigor (`fatigueMax − fatigue`: a fatigue change is a vigor change of opposite sign),
 *   mood, skill points, scrap, feathers, bond, durability, injury and learned skills from the two
 *   states, each with the sources in the step that can change it as its cause;
 * - why mood moved, from the cause note the sim logs with every mood change (`log.mood.*`,
 *   ADR-0006): "Peregrina está harta de entrenar", "la carrera la dejó desanimada";
 * - the notes the headline and the causes do not already say, through the text lookup, so a note
 *   key added to the sim later shows without code here, toned good or bad when its key says so;
 * - a luck event the sim applied by itself (`event: { id, option, branch?, auto: true }` on a log
 *   entry, ADR-0006): its text, what happened and how it came out, good or bad by its effects.
 */
import type {
  EventEffects,
  LoggedEvent,
  RunInput,
  SeasonState,
  StatName,
  TurnLogEntry,
} from "@falconess/schema";
import { type SimContext, STAT_ORDER } from "@falconess/sim";
import { formatSeconds, formatSigned } from "../../text/format";
import { gameText, ui, uiCount } from "../../text/ui";
import { type IconName, placeIcon } from "../../ui/icons";
import { goalStatuses, logNoteText } from "./season";
import { durabilityOf } from "./workshop";

/** One input of the run and the states around it (the controller's `Step`). */
export type WeekStep = {
  readonly before: SeasonState;
  readonly input: RunInput;
  readonly after: SeasonState;
};

export type WeekTone = "good" | "bad" | "warn" | "neutral";

/** What the week's action (or the event's answer) came to. */
export type WeekOutcomeKind =
  | "train-ok"
  | "train-fail"
  | "injury"
  | "injured"
  | "forced-rest"
  | "rest"
  | "outing"
  | "workshop"
  | "event";

export type WeekLine = {
  readonly icon: IconName;
  readonly text: string;
  readonly tone: WeekTone;
};

export type WeekRace = {
  readonly turn: number;
  readonly courseId: string;
  readonly place: number;
  readonly field: number;
  readonly minPlace: number;
  readonly met: boolean;
  readonly timeTicks: number;
};

export type WeekStat = { readonly stat: StatName; readonly delta: number };

export type WeekRowId =
  | "vigor"
  | "mood"
  | "skillPoints"
  | "scrap"
  | "feathers"
  | "bond"
  | "durability"
  | "injury"
  | "skill";

/** One change besides the stats: «Vigor −20 → 60 · entrenamiento», after its emoji. */
export type WeekRow = {
  readonly id: WeekRowId;
  readonly icon: IconName;
  readonly label: string;
  /** The change, signed ("+5", "−20"), or a word for what has no number ("2 semanas"). */
  readonly value: string;
  readonly tone: WeekTone;
  /** Where it ended up: "60" for vigor, "Normal" for mood. */
  readonly to?: string | undefined;
  /** What changed it, in words: "entrenamiento fallido, racha de entrenamientos". */
  readonly cause?: string | undefined;
};

/** A log note the headline and the causes do not already say, in words. */
export type WeekNote = {
  readonly key: string;
  readonly icon: IconName | undefined;
  readonly text: string;
  /** Good news, bad news, or neither (from the note's key, or the event it belongs to). */
  readonly tone: WeekTone;
};

/** A luck event the sim applied by itself during the week (v2: `auto` on the log's `event`). */
export type WeekEvent = {
  readonly id: string;
  readonly branch: number | undefined;
  /** The event's text. */
  readonly text: string;
  /** What happened (the option's text), when it has its own. */
  readonly option: string | undefined;
  /** How it came out (the chance branch's text), when the branch has one. */
  readonly outcome: string | undefined;
  /** Good when all its effects help, bad when all hurt (`effectsTone`). */
  readonly tone: WeekTone;
};

export type WeekSummary = {
  /** The week the input belongs to. */
  readonly turn: number;
  /** The input; the eyebrow describes it. */
  readonly input: RunInput;
  readonly outcome: WeekOutcomeKind;
  /** One line that says what happened: the race on a race week, else the outcome. */
  readonly headline: WeekLine;
  /** On a race week: what the action itself did (the headline is the race). */
  readonly actionLine: WeekLine | undefined;
  /** A short line of context under the headline: the race's course and goal, the event's text. */
  readonly context: string | undefined;
  readonly race: WeekRace | undefined;
  readonly stats: readonly WeekStat[];
  readonly rows: readonly WeekRow[];
  readonly event: WeekEvent | undefined;
  readonly notes: readonly WeekNote[];
  /** The step leaves an event waiting for its answer (its dialog opens after this one). */
  readonly eventNext: boolean;
  /** The week's action (an event's answer: the action taken earlier that week), if any. */
  readonly weekAction: Exclude<RunInput, { kind: "start" | "event:choose" }>["kind"] | undefined;
};

/** Notes the headline or a cause already says. */
const SAID: ReadonlySet<string> = new Set([
  "log.train.ok",
  "log.train.fail",
  "log.train.injury",
  "log.injured",
  "log.rest",
  "log.rest.forced",
  "log.outing",
  "log.workshop",
  "log.race",
  // every mood change has its cause note: the mood row says it
  "log.mood.failure",
  "log.mood.drift",
  "log.mood.race-loss",
  "log.mood.rest",
  "log.mood.outing",
  "log.mood.event.up",
  "log.mood.event.down",
  // an event's vigor: the vigor row names the event as a cause
  "log.vigor.event.up",
  "log.vigor.event.down",
]);

/** The words of each mood cause note (`{name}` is the Falconess). */
const MOOD_CAUSE: Readonly<Record<string, string>> = {
  "log.mood.failure": "ui.week.cause.fail",
  "log.mood.drift": "ui.week.cause.drift",
  "log.mood.race-loss": "ui.week.cause.raceLoss",
  "log.mood.rest": "ui.week.cause.rest",
  "log.mood.outing": "ui.week.cause.outing",
  "log.mood.event.up": "ui.week.cause.event",
  "log.mood.event.down": "ui.week.cause.event",
};

/** Where a change can come from in one step. */
type Source = "action" | "race" | "event";

/** The log notes added by the step: the log only grows (new entries, or notes on the last one). */
export function newNotes(before: SeasonState, after: SeasonState): string[] {
  const count = before.log.reduce((n, e) => n + e.notes.length, 0);
  return after.log.flatMap((e) => e.notes).slice(count);
}

/** The event a log entry says was resolved that week (chosen or applied by itself), if any. */
export function loggedEvent(entry: TurnLogEntry): LoggedEvent | undefined {
  return entry.event;
}

/** The event the step resolved: on a log entry the step added, or one it extended. */
function stepEvent(before: SeasonState, after: SeasonState): LoggedEvent | undefined {
  const from = Math.max(0, before.log.length - 1);
  for (let i = from; i < after.log.length; i++) {
    const entry = after.log[i];
    if (!entry) continue;
    const event = loggedEvent(entry);
    const old = before.log[i];
    if (event && !(old && loggedEvent(old))) return event;
  }
  return undefined;
}

/**
 * Whether an event's effects read as good news (all help), bad news (all hurt), or mixed. Fatigue
 * counts the other way round: positive fatigue is vigor lost.
 */
export function effectsTone(blocks: readonly EventEffects[]): WeekTone {
  let good = 0;
  let bad = 0;
  const sign = (delta: number, better = delta > 0) => {
    if (delta === 0) return;
    if (better) good += 1;
    else bad += 1;
  };
  for (const fx of blocks) {
    for (const delta of Object.values(fx.stats)) sign(delta ?? 0);
    for (const delta of Object.values(fx.bond)) sign(delta);
    sign(fx.mood);
    sign(fx.fatigue, fx.fatigue < 0);
    sign(fx.skillPoints);
    sign(fx.scrap);
    sign(fx.feathers);
    sign(fx.durability);
    if (fx.injuryTurns > 0) bad += 1;
    if (fx.learnSkill !== undefined) good += 1;
  }
  if (good > 0 && bad === 0) return "good";
  if (bad > 0 && good === 0) return "bad";
  return good > 0 ? "warn" : "neutral";
}

/** The texts and the tone of a resolved event, from content (an unknown id keeps its key). */
function describeLogged(ctx: SimContext, logged: LoggedEvent) {
  const event = ctx.content.events.get(logged.id);
  const option = event?.options[logged.option];
  const branch = logged.branch === undefined ? undefined : option?.chance?.[logged.branch];
  const tone: WeekTone = option
    ? effectsTone(branch ? [option.effects, branch.effects] : [option.effects])
    : "neutral";
  return {
    textKey: event?.textKey ?? `ev.${logged.id}`,
    optionKey: option?.textKey,
    branchKey: branch?.textKey,
    tone,
  };
}

/** A note in words (model/season.ts `logNoteText`). */
const noteText = logNoteText;

/** Notes that are bad news, and good news (the rest is said as neutral, or by its key's end). */
const BAD_NOTES: ReadonlySet<string> = new Set([
  "log.vigor.exhausted",
  "log.vigor.rest.poor",
  "log.mood.failure",
  "log.mood.drift",
  "log.mood.race-loss",
]);
const GOOD_NOTES: ReadonlySet<string> = new Set([
  "log.vigor.rest.great",
  "log.mood.rest",
  "log.mood.outing",
]);

/** A note whose key says it is good or bad news (v2's rest quality, an exhausted injury…). */
function noteTone(key: string): WeekTone {
  if (BAD_NOTES.has(key) || key.endsWith(".down")) return "bad";
  if (GOOD_NOTES.has(key) || key.endsWith(".up")) return "good";
  return "neutral";
}

function noteIcon(key: string): IconName | undefined {
  if (key === "log.vigor.exhausted") return "injury";
  if (key.startsWith("ev.")) return "event";
  if (key.startsWith("log.mood.")) return "mood";
  if (key.startsWith("log.vigor.") || key.startsWith("log.fatigue.")) return "vigor";
  if (key.startsWith("log.injur") || key.startsWith("log.train.injury")) return "injury";
  return undefined;
}

function outcomeOf(input: RunInput, notes: readonly string[]): WeekOutcomeKind {
  if (input.kind === "event:choose") return "event";
  if (notes.includes("log.injured")) return "injured";
  switch (input.kind) {
    case "rest":
      return "rest";
    case "outing":
      return "outing";
    case "workshop":
      return "workshop";
    default:
      if (notes.includes("log.rest.forced")) return "forced-rest";
      if (notes.includes("log.train.injury")) return "injury";
      if (notes.includes("log.train.fail")) return "train-fail";
      return "train-ok";
  }
}

const OUTCOME_LINE: Readonly<Record<WeekOutcomeKind, { icon: IconName; tone: WeekTone }>> = {
  "train-ok": { icon: "outcome.ok", tone: "good" },
  "train-fail": { icon: "outcome.fail", tone: "bad" },
  injury: { icon: "injury", tone: "bad" },
  injured: { icon: "injury", tone: "warn" },
  "forced-rest": { icon: "action.rest", tone: "warn" },
  rest: { icon: "action.rest", tone: "neutral" },
  outing: { icon: "action.outing", tone: "neutral" },
  workshop: { icon: "action.workshop", tone: "neutral" },
  event: { icon: "event", tone: "neutral" },
};

function outcomeText(ctx: SimContext, step: WeekStep, kind: WeekOutcomeKind): string {
  const { before, input } = step;
  switch (kind) {
    case "outing": {
      const crew =
        input.kind === "outing" && input.manufacturer !== undefined
          ? input.manufacturer
          : ctx.content.getFrame(before.equippedFrame).manufacturer;
      return ui("ui.week.title.outing", {
        crew: gameText(ctx.content.getManufacturer(crew).crew.textKey),
      });
    }
    case "event": {
      const pending = before.pendingEvent;
      const option =
        pending && input.kind === "event:choose"
          ? ctx.content.events.get(pending.eventId)?.options[input.option]
          : undefined;
      return option
        ? ui("ui.week.title.event", { option: gameText(option.textKey) })
        : ui("ui.log.event");
    }
    default:
      return ui(`ui.week.title.${kind}`);
  }
}

/** The cause words of a source in this step. */
function actionCause(kind: WeekOutcomeKind): string {
  switch (kind) {
    case "train-ok":
    case "train-fail":
    case "injury":
      return ui("ui.week.cause.training");
    case "rest":
    case "forced-rest":
      return ui("ui.week.cause.rest");
    case "injured":
      return ui("ui.week.cause.injured");
    case "outing":
      return ui("ui.week.cause.outing");
    case "workshop":
      return ui("ui.week.cause.workshop");
    case "event":
      return ui("ui.week.cause.event");
  }
}

/**
 * What can change a resource: "action" (any action), an outcome (only that action: the workshop
 * repairs, a simulator training gives skill points), "race", "event".
 */
type Can = readonly (Source | WeekOutcomeKind)[];

/** The sources of the step that can change a resource, in words: "taller, evento". */
function causeOf(
  sources: readonly Source[],
  outcome: WeekOutcomeKind,
  can: Can,
): string | undefined {
  const words: string[] = [];
  for (const source of sources) {
    const able =
      source === "action" ? can.includes("action") || can.includes(outcome) : can.includes(source);
    if (!able) continue;
    const word =
      source === "action"
        ? actionCause(outcome)
        : source === "race"
          ? ui("ui.week.cause.race")
          : ui("ui.week.cause.event");
    if (!words.includes(word)) words.push(word);
  }
  return words.length > 0 ? words.join(", ") : undefined;
}

/**
 * Why mood moved: the cause notes the sim logged with each change (ADR-0006), in their order; a
 * step without them (an older log) falls back to the sources that move mood that way.
 */
function moodCause(
  delta: number,
  outcome: WeekOutcomeKind,
  notes: readonly string[],
  hasEvent: boolean,
  name: string,
): string | undefined {
  const words: string[] = [];
  const add = (key: string) => {
    const word = ui(key, { name });
    if (!words.includes(word)) words.push(word);
  };
  for (const note of notes) {
    const key = MOOD_CAUSE[note];
    if (key) add(key);
  }
  if (words.length > 0) return words.join(", ");
  if (delta < 0) {
    if (outcome === "train-fail" || outcome === "injury") add("ui.week.cause.fail");
  } else {
    if (outcome === "rest" || outcome === "forced-rest") add("ui.week.cause.rest");
    if (outcome === "outing") add("ui.week.cause.outing");
  }
  if (hasEvent) add("ui.week.cause.event");
  return words.length > 0 ? words.join(", ") : undefined;
}

const tone = (delta: number): WeekTone => (delta > 0 ? "good" : delta < 0 ? "bad" : "neutral");

/** The action input of the week `turn` in a log, if one was taken. */
function actionOfWeek(state: SeasonState, turn: number): WeekSummary["weekAction"] {
  for (let i = state.log.length - 1; i >= 0; i--) {
    const entry = state.log[i];
    if (!entry || entry.turn !== turn) continue;
    const input = entry.input;
    if (input && input.kind !== "start" && input.kind !== "event:choose") return input.kind;
  }
  return undefined;
}

/** Everything «Lo que pasó» shows for one step of the run. */
export function weekSummary(ctx: SimContext, step: WeekStep): WeekSummary {
  const { before, input, after } = step;
  const S = ctx.ruleset.season;
  const notes = newNotes(before, after);
  const outcome = outcomeOf(input, notes);
  const logged = stepEvent(before, after);
  const resolved = logged && describeLogged(ctx, logged);
  // a luck event applied by itself gets its own block; an answered one is the step itself
  const auto = logged?.auto === true ? logged : undefined;
  const name = gameText(ctx.content.getFalconess(after.falconessId).textKey);
  const turn =
    input.kind === "event:choose" ? (before.pendingEvent?.turn ?? before.turn) : before.turn;

  // the goal race the step ran, with the goal it had
  const ran =
    after.raceResults.length > before.raceResults.length ? after.raceResults.at(-1) : undefined;
  const status = ran && goalStatuses(ctx, after).find((g) => g.goal.turn === ran.turn);
  const race: WeekRace | undefined =
    ran && status
      ? {
          turn: ran.turn,
          courseId: ran.courseId,
          place: ran.place,
          field: ran.fieldSize,
          minPlace: status.goal.minPlace,
          met: status.met !== false,
          timeTicks: ran.timeTicks,
        }
      : undefined;

  const own: WeekLine = {
    ...OUTCOME_LINE[outcome],
    // an answer reads as good or bad news by what it did, the chance branch included
    ...(outcome === "event" && resolved ? { tone: resolved.tone } : {}),
    text: outcomeText(ctx, step, outcome),
  };
  let headline = own;
  let context: string | undefined;
  if (race) {
    headline = {
      icon: placeIcon(race.place) ?? (race.met ? "goalRace" : "outcome.fail"),
      text: ui(race.met ? "ui.week.title.race.met" : "ui.week.title.race.failed", {
        place: race.place,
        field: race.field,
      }),
      tone: race.met ? "good" : "bad",
    };
    context = ui("ui.week.race.context", {
      course: gameText(ctx.content.getCourse(race.courseId).textKey),
      need: ui("ui.goals.need", { place: race.minPlace }),
      time: formatSeconds(race.timeTicks),
    });
  } else if (outcome === "event" && before.pendingEvent) {
    const answered = ctx.content.events.get(before.pendingEvent.eventId);
    context = answered ? gameText(answered.textKey) : undefined;
  }

  const sources: Source[] = [];
  if (input.kind !== "event:choose") sources.push("action");
  if (race) sources.push("race");
  if (input.kind === "event:choose" || auto) sources.push("event");
  const hasEvent = sources.includes("event");

  const stats = STAT_ORDER.map((stat) => ({
    stat,
    delta: after.stats[stat] - before.stats[stat],
  })).filter((s) => s.delta !== 0);

  const rows: WeekRow[] = [];
  const fatigue = after.fatigue - before.fatigue;
  if (fatigue !== 0)
    rows.push({
      id: "vigor",
      icon: "vigor",
      label: ui("ui.week.vigor"),
      value: formatSigned(-fatigue),
      tone: tone(-fatigue),
      to: String(S.fatigueMax - after.fatigue),
      cause: causeOf(sources, outcome, ["action", "event"]),
    });
  const mood = after.mood - before.mood;
  if (mood !== 0)
    rows.push({
      id: "mood",
      icon: "mood",
      label: ui("ui.turn.mood"),
      value: formatSigned(mood),
      tone: tone(mood),
      to: gameText(`mood.${after.mood}`),
      cause: moodCause(mood, outcome, notes, hasEvent, name),
    });
  const counter = (
    id: "skillPoints" | "scrap" | "feathers",
    label: string,
    delta: number,
    can: Can,
  ) => {
    if (delta !== 0)
      rows.push({
        id,
        icon: id,
        label,
        value: formatSigned(delta),
        tone: tone(delta),
        cause: causeOf(sources, outcome, can),
      });
  };
  // skill points: a simulator training, the workshop, an event; scrap: the workshop, the race
  counter("skillPoints", ui("ui.turn.skillPoints"), after.skillPoints - before.skillPoints, [
    "train-ok",
    "workshop",
    "event",
  ]);
  counter("scrap", ui("ui.turn.scrap"), after.wallet.scrap - before.wallet.scrap, [
    "workshop",
    "race",
    "event",
  ]);
  counter("feathers", ui("ui.turn.feathers"), after.wallet.feathers - before.wallet.feathers, [
    "event",
  ]);

  // bond: one row per change, the crews that got it as its cause
  const crews = [...new Set([...Object.keys(before.bond), ...Object.keys(after.bond)])].sort();
  const byDelta = new Map<number, string[]>();
  for (const id of crews) {
    const delta = (after.bond[id] ?? 0) - (before.bond[id] ?? 0);
    if (delta === 0) continue;
    const name = ctx.content.manufacturers.has(id)
      ? gameText(ctx.content.getManufacturer(id).crew.textKey)
      : id;
    byDelta.set(delta, [...(byDelta.get(delta) ?? []), name]);
  }
  for (const [delta, names] of byDelta)
    rows.push({
      id: "bond",
      icon: "bond",
      label: ui("ui.action.bondShort"),
      value: formatSigned(delta),
      tone: tone(delta),
      cause: names.join(", "),
    });

  // the equipped frame's durability (a workshop that changes frames says so in its eyebrow)
  const frame = after.equippedFrame;
  const durability =
    durabilityOf(ctx, after, frame).current - durabilityOf(ctx, before, frame).current;
  if (durability !== 0 && before.equippedFrame === frame)
    rows.push({
      id: "durability",
      icon: "framestat.durability",
      label: ui("ui.action.durabilityShort"),
      value: formatSigned(durability),
      tone: tone(durability),
      to: String(durabilityOf(ctx, after, frame).current),
      cause: causeOf(sources, outcome, ["workshop", "race", "event"]),
    });
  if (after.injuryTurns > before.injuryTurns)
    rows.push({
      id: "injury",
      icon: "injury",
      label: ui("ui.week.injury"),
      value: uiCount("ui.count.weeks", after.injuryTurns),
      tone: "bad",
      cause: causeOf(sources, outcome, ["injury", "event"]),
    });
  for (const skill of after.learnedSkills)
    if (!before.learnedSkills.includes(skill))
      rows.push({
        id: "skill",
        icon: "skill",
        label: ui("ui.week.skill"),
        value: gameText(ctx.content.getSkill(skill).textKey),
        tone: "good",
        cause: causeOf(sources, outcome, ["workshop", "event"]),
      });

  // the notes not said yet: the answered event's text is the context, a luck event has its block
  const said = new Set(SAID);
  // mood that moved and came back (a rest's lift and a lost race) has no row: its notes say it
  if (mood === 0) for (const key of Object.keys(MOOD_CAUSE)) said.delete(key);
  // how she slept is news only when the rest gave vigor back
  if (fatigue === 0)
    for (const key of ["log.vigor.rest.poor", "log.vigor.rest.normal", "log.vigor.rest.great"])
      said.add(key);
  if (outcome === "event" && before.pendingEvent) {
    const answered = ctx.content.events.get(before.pendingEvent.eventId);
    if (answered) said.add(answered.textKey);
  }
  if (auto && resolved) {
    said.add(resolved.textKey);
    if (resolved.optionKey) said.add(resolved.optionKey);
    if (resolved.branchKey) said.add(resolved.branchKey);
  }
  const extra = notes
    .filter((key) => !said.has(key))
    .map((key) => ({
      key,
      icon: noteIcon(key),
      text: noteText(ctx, key),
      // an answered event's outcome is as good or bad as what it did
      tone: resolved && key === resolved.branchKey ? resolved.tone : noteTone(key),
    }));
  const event: WeekEvent | undefined =
    auto && resolved
      ? {
          id: auto.id,
          branch: auto.branch,
          text: noteText(ctx, resolved.textKey),
          option: resolved.optionKey && noteText(ctx, resolved.optionKey),
          outcome: resolved.branchKey && noteText(ctx, resolved.branchKey),
          tone: resolved.tone,
        }
      : undefined;

  return {
    turn,
    input,
    outcome,
    headline,
    actionLine: race ? own : undefined,
    context,
    race,
    stats,
    rows,
    event,
    notes: extra,
    eventNext: after.status === "active" && after.pendingEvent !== undefined,
    weekAction:
      input.kind === "start" || input.kind === "event:choose"
        ? actionOfWeek(before, turn)
        : input.kind,
  };
}
