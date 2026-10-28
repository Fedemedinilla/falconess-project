import type { ContentIndex, RunInput, SeasonState, TrainingKind } from "@falconess/schema";
import {
  facilityLevel,
  goalForTurn,
  nextTrainingDriftPm,
  resolveFrameBuild,
  type SimContext,
  STAT_ORDER,
  trainingGains,
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

export function describeInput(content: ContentIndex, input: RunInput): string {
  switch (input.kind) {
    case "start":
      return `start ${input.falconessId} [${input.hangar.join(", ")}]`;
    case "event:choose":
      return `event:choose ${input.option}`;
    case "workshop":
      return `workshop ${input.ops.map((o) => o.op).join("+")}`;
    case "outing":
      return `outing${input.manufacturer ? ` ${input.manufacturer}` : ""}`;
    default:
      return content.t(`action.${input.kind}`);
  }
}

export function statsLine(s: SeasonState): string {
  return STAT_ORDER.map(
    (k) => `${k.slice(0, 3).toUpperCase()} ${String(s.stats[k]).padStart(4)}`,
  ).join("  ");
}

export function headerLine(ctx: SimContext, s: SeasonState): string {
  const c = ctx.content;
  const f = c.getFalconess(s.falconessId);
  const goal = goalForTurn(ctx, s);
  const goalTxt = goal
    ? `  CARRERA: ${c.t(c.getCourse(goal.courseId).textKey)} (min. ${goal.minPlace}º)`
    : "";
  return `T${String(s.turn).padStart(2, "0")}/48  ${c.t(f.textKey)}  ánimo ${c.t(`mood.${s.mood}`)}  vigor ${vigor(ctx.ruleset, s.fatigue)}  SP ${s.skillPoints}  chatarra ${s.wallet.scrap}${goalTxt}`;
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

export function turnSummary(ctx: SimContext, s: SeasonState, prev: SeasonState): string[] {
  const c = ctx.content;
  const lines: string[] = [];
  const last = s.log.at(-1);
  if (last) {
    const deltas = Object.entries(last.deltas)
      .filter(([, v]) => v !== 0)
      .map(([k, v]) => `${c.t(`stat.${k}`)} ${v > 0 ? "+" : ""}${v}`);
    const notes = last.notes.map((n) => (c.text.has(n) ? c.t(n) : n));
    const mood = last.moodDelta ? [`ánimo ${last.moodDelta > 0 ? "+" : ""}${last.moodDelta}`] : [];
    const vig = last.fatigueDelta ? -last.fatigueDelta : 0;
    const vigorTxt = vig ? [`vigor ${vig > 0 ? "+" : ""}${vig}`] : [];
    lines.push(`  → ${[...notes, ...deltas, ...mood, ...vigorTxt].join(" · ")}`);
  }
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
