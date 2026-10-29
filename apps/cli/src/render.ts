import type {
  ContentIndex,
  Mood,
  RunInput,
  SeasonState,
  TrainingKind,
  TurnLogEntry,
} from "@falconess/schema";
import {
  facilityLevel,
  goalForTurn,
  nextTrainingDriftPm,
  resolveFrameBuild,
  type SimContext,
  STAT_ORDER,
  trainingGains,
  trainingMoodMultiplier,
  trainingRisk,
  vigor,
} from "@falconess/sim";

const TRAININGS: readonly TrainingKind[] = [
  "train:agility",
  "train:stamina",
  "train:technique",
  "train:risk-flight",
  "train:simulator",
];

/**
 * One input as the player would say it: the action's name, or for an event choice the option's
 * text when `prev` (the state it answered) is given.
 */
export function describeInput(content: ContentIndex, input: RunInput, prev?: SeasonState): string {
  switch (input.kind) {
    case "start":
      return `start ${input.falconessId} [${input.hangar.join(", ")}]`;
    case "event:choose": {
      const pending = prev?.pendingEvent;
      const opt = pending && content.getEvent(pending.eventId).options[input.option];
      return opt ? `elige: ${content.t(opt.textKey)}` : `event:choose ${input.option}`;
    }
    case "workshop":
      return `workshop ${input.ops.map((o) => o.op).join("+")}`;
    case "outing":
      return `${content.t("action.outing")}${input.manufacturer ? ` (${input.manufacturer})` : ""}`;
    default:
      return content.t(`action.${input.kind}`);
  }
}

export function statsLine(s: SeasonState): string {
  return STAT_ORDER.map(
    (k) => `${k.slice(0, 3).toUpperCase()} ${String(s.stats[k]).padStart(4)}`,
  ).join("  ");
}

/** Cells of the vigor bar: one per 10 points of `fatigueMax` 100. */
const VIGOR_CELLS = 10;

/**
 * Vigor as a bar that drains with training and fills with rest (ADR-0006 D2): `vigor` from the sim,
 * one cell per tenth of the maximum, rounded down, so the bar empties exactly at 0.
 * `██████░░░░ 60/100`.
 */
export function vigorBar(ctx: SimContext, fatigue: number): string {
  const max = ctx.ruleset.season.fatigueMax;
  const v = vigor(ctx.ruleset, fatigue);
  const full = Math.floor((v * VIGOR_CELLS) / max);
  return `${"█".repeat(full)}${"░".repeat(VIGOR_CELLS - full)} ${v}/${max}`;
}

/** A per-mille multiplier as "×1.10". */
export function pmTimes(pm: number): string {
  return `×${(pm / 1000).toFixed(2)}`;
}

/** Mood by name with what it does to training: "Bien (entrenar ×1.10)". */
export function moodLabel(ctx: SimContext, mood: Mood): string {
  return `${ctx.content.t(`mood.${mood}`)} (entrenar ${pmTimes(trainingMoodMultiplier(ctx.ruleset, mood))})`;
}

export function headerLine(ctx: SimContext, s: SeasonState): string {
  const c = ctx.content;
  const f = c.getFalconess(s.falconessId);
  const goal = goalForTurn(ctx, s);
  const goalTxt = goal
    ? `  CARRERA: ${c.t(c.getCourse(goal.courseId).textKey)} (min. ${goal.minPlace}º)`
    : "";
  return `T${String(s.turn).padStart(2, "0")}/48  ${c.t(f.textKey)}  ánimo ${moodLabel(ctx, s.mood)}  vigor ${vigorBar(ctx, s.fatigue)}  SP ${s.skillPoints}  chatarra ${s.wallet.scrap}${goalTxt}`;
}

export function frameLine(ctx: SimContext, s: SeasonState): string {
  const c = ctx.content;
  const b = resolveFrameBuild(
    c,
    s.equippedFrame,
    s.installedParts,
    s.frameQuirks[s.equippedFrame] ?? [],
  );
  const dur = s.frameDurability[s.equippedFrame] ?? 0;
  const quirks = (s.frameQuirks[s.equippedFrame] ?? [])
    .map((q) => c.t(c.getQuirk(q).textKey))
    .join(", ");
  const parts = s.installedParts.map((p) => c.t(c.getPart(p).textKey)).join(", ");
  return `alas: ${c.t(c.getFrame(s.equippedFrame).textKey)} [${c.t(c.getManufacturer(b.manufacturer).textKey)} · ${c.t(`style.${b.style}`)}]  P/W ${(b.powerToWeight / 1000).toFixed(2)}  E ${b.energy}  D ${b.dissipation}  dur ${dur}/${b.durabilityMax}${parts ? `  piezas: ${parts}` : ""}${quirks ? `  peculiaridades: ${quirks}` : ""}`;
}

/** A per-mille chance as a percent with at most one decimal ("1.6 %", "12 %"). */
export function pmPercent(pm: number): string {
  return `${(pm / 10).toFixed(1).replace(/\.0$/, "")} %`;
}

/**
 * The five trainings with what a success gives, the vigor it costs and its risk, all from the
 * sim's helpers (`trainingGains`, `trainingRisk`, `nextTrainingDriftPm`; ADR-0006 D9).
 */
export function trainingMenu(ctx: SimContext, s: SeasonState): string[] {
  const c = ctx.content;
  const S = ctx.ruleset.season;
  const drift = nextTrainingDriftPm(ctx.ruleset, s);
  return TRAININGS.map((k, i) => {
    const gains = trainingGains(ctx, s, k)
      .map(({ stat, gain }) => `+${gain} ${c.t(`stat.${stat}`)}`)
      .join(" ");
    const crews = (s.crewPresence[k] ?? []).map((m) => c.t(c.getManufacturer(m).crew.textKey));
    const lvl = facilityLevel(ctx, s.facilityUses[k]);
    const sp = k === "train:simulator" ? ` +${S.simulatorSkillPoints} SP` : "";
    const cost = -S.fatigueCost[k];
    const { failPm, injuryPm } = trainingRisk(ctx.ruleset, s.fatigue, k);
    const risk = [
      `vigor ${cost > 0 ? "+" : ""}${cost}`,
      `fallo ${pmPercent(failPm)}`,
      ...(injuryPm > 0 ? [`lesión ${pmPercent(injuryPm)}`] : []),
      ...(drift > 0 ? [`ánimo -1 ${pmPercent(drift)}`] : []),
    ].join(", ");
    const crewTxt = crews.length ? `  ← ${crews.join(", ")}` : "";
    return `${i + 1}. ${c.t(`action.${k}`)} nv${lvl}  ${gains}${sp}  (${risk})${crewTxt}`;
  });
}

/**
 * What one input added to the log: the new entries, and the notes and stat changes an event
 * choice added to the week's entry (it extends the entry of the week it answers).
 */
export function addedToLog(
  prev: SeasonState,
  s: SeasonState,
): { notes: string[]; deltas: Map<string, number>; event: TurnLogEntry["event"] } {
  const notes: string[] = [];
  const deltas = new Map<string, number>();
  let event: TurnLogEntry["event"];
  s.log.forEach((entry, i) => {
    const before = prev.log[i];
    notes.push(...entry.notes.slice(before?.notes.length ?? 0));
    for (const [k, v] of Object.entries(entry.deltas)) {
      const d = v - (before?.deltas[k as keyof typeof before.deltas] ?? 0);
      if (d !== 0) deltas.set(k, (deltas.get(k) ?? 0) + d);
    }
    if (entry.event && !before?.event) event = entry.event;
  });
  return { notes, deltas, event };
}

const signed = (n: number): string => `${n > 0 ? "+" : ""}${n}`;

/**
 * The texts and stat changes of the event resolved by this input, as the content defines them:
 * the event's text, for an auto event the option's (the player saw no dialog), the drawn branch's.
 */
function eventPart(
  c: ContentIndex,
  event: TurnLogEntry["event"],
): { keys: string[]; stats: Map<string, number> } {
  if (!event) return { keys: [], stats: new Map() };
  const e = c.getEvent(event.id);
  const opt = e.options[event.option];
  const branch = event.branch === undefined ? undefined : opt?.chance?.[event.branch];
  const keys = [e.textKey, event.auto ? opt?.textKey : undefined, branch?.textKey].filter(
    (k) => k !== undefined,
  );
  const stats = new Map<string, number>();
  for (const fx of [opt?.effects, branch?.effects])
    for (const [k, v] of Object.entries(fx?.stats ?? {})) stats.set(k, (stats.get(k) ?? 0) + v);
  return { keys, stats };
}

/**
 * The week in a few lines (ADR-0006 D7): what the action did with its stat changes; a luck event
 * that happened on its own (🎲: its texts and stats); then mood and vigor, each with where it
 * ended and why it moved (the cause notes of the log); and the goal race, if any. After an event
 * choice, the option's outcome (its branch text and stats; the event's text was the question).
 */
export function turnSummary(ctx: SimContext, s: SeasonState, prev: SeasonState): string[] {
  const c = ctx.content;
  const lines: string[] = [];
  const text = (n: string) => (c.text.has(n) ? c.t(n) : n);
  const { notes, deltas, event } = addedToLog(prev, s);
  const isCause = (n: string) => n.startsWith("log.mood.") || n.startsWith("log.vigor.");
  const ev = eventPart(c, event);
  const statList = (m: Map<string, number>) =>
    [...m].filter(([, v]) => v !== 0).map(([k, v]) => `${c.t(`stat.${k}`)} ${signed(v)}`);
  const own = new Map(deltas);
  if (event?.auto) for (const [k, v] of ev.stats) own.set(k, (own.get(k) ?? 0) - v);
  const action = notes.filter((n) => !isCause(n) && !(event?.auto && ev.keys.includes(n)));
  const shown = event?.auto ? action : action.filter((n) => n !== ev.keys[0]);
  const main = [...shown.map(text), ...statList(own)];
  if (main.length > 0) lines.push(`  → ${main.join(" · ")}`);
  if (event?.auto)
    lines.push(
      `  🎲 ${[
        notes
          .filter((n) => ev.keys.includes(n))
          .map(text)
          .join(" "),
        ...statList(ev.stats),
      ].join(" · ")}`,
    );
  const why = (prefix: string) => {
    const causes = notes.filter((n) => n.startsWith(prefix)).map(text);
    return causes.length ? `: ${causes.join(" ")}` : "";
  };
  if (s.mood !== prev.mood)
    lines.push(
      `  ánimo ${signed(s.mood - prev.mood)} → ${moodLabel(ctx, s.mood)}${why("log.mood.")}`,
    );
  if (s.fatigue !== prev.fatigue)
    lines.push(
      `  vigor ${signed(prev.fatigue - s.fatigue)} → ${vigorBar(ctx, s.fatigue)}${why("log.vigor.")}`,
    );
  const race = s.raceResults.at(-1);
  if (race && race.turn === prev.turn && s.raceResults.length > prev.raceResults.length) {
    lines.push(
      `  🏁 ${c.t(c.getCourse(race.courseId).textKey)}: ${race.place}º de ${race.fieldSize}  (${(race.timeTicks / 15).toFixed(1)} s, motor ${race.engine})`,
    );
  }
  return lines;
}

export function finalSummary(ctx: SimContext, s: SeasonState): string[] {
  const c = ctx.content;
  return [
    "",
    `=== ${s.endReason === "completed" ? c.t("log.season.end") : c.t("log.goal.failed")}  grade ${s.grade}  plumas ${s.wallet.feathers} ===`,
    statsLine(s),
    `habilidades: ${s.learnedSkills.map((k) => c.t(c.getSkill(k).textKey)).join(", ")}`,
    `carreras: ${s.raceResults.map((r) => `T${r.turn} ${r.courseId} ${r.place}º`).join(" | ")}`,
    `vínculos: ${Object.entries(s.bond)
      .map(([m, b]) => `${m} ${b}`)
      .join(", ")}`,
  ];
}
