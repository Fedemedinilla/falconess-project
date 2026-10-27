import type { ContentIndex, RunInput, SeasonState, TrainingKind } from "@falconess/schema";
import {
  facilityLevel,
  goalForTurn,
  resolveFrameBuild,
  type SimContext,
  STAT_ORDER,
  trainingGain,
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
  const goal = goalForTurn(ctx, s as Parameters<typeof goalForTurn>[1]);
  const goalTxt = goal
    ? `  CARRERA: ${c.t(c.getCourse(goal.courseId).textKey)} (min. ${goal.minPlace}º)`
    : "";
  return `T${String(s.turn).padStart(2, "0")}/48  ${c.t(f.textKey)}  ánimo ${c.t(`mood.${s.mood}`)}  fatiga ${s.fatigue}  SP ${s.skillPoints}  chatarra ${s.wallet.scrap}${goalTxt}`;
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

export function trainingMenu(ctx: SimContext, s: SeasonState): string[] {
  const c = ctx.content;
  return TRAININGS.map((k, i) => {
    const stat = ctx.ruleset.trainingStat[k];
    const gain = trainingGain(ctx, s as Parameters<typeof trainingGain>[1], k, stat);
    const crews = (s.crewPresence[k] ?? []).map((m) => c.t(c.getManufacturer(m).crew.textKey));
    const lvl = facilityLevel(ctx, s.facilityUses[k]);
    const S = ctx.ruleset.season;
    let shown = `+${gain} ${c.t(`stat.${stat}`)}`;
    if (k === "train:risk-flight") {
      const cou = Math.floor((gain * S.riskFlightCourage) / 1000);
      const agi = Math.floor((gain * S.riskFlightAgility) / 1000);
      shown = `+${cou} ${c.t("stat.courage")} +${agi} ${c.t("stat.agility")} (riesgo ${S.riskFlightFail / 10} %)`;
    } else {
      const sec = ctx.ruleset.trainingSecondary[k];
      if (sec)
        shown += ` +${Math.max(1, Math.floor((gain * S.secondaryGain) / 1000))} ${c.t(`stat.${sec}`)}`;
      if (k === "train:simulator") shown += ` +${S.simulatorSkillPoints} SP`;
    }
    const crewTxt = crews.length ? `  ← ${crews.join(", ")}` : "";
    return `${i + 1}. ${c.t(`action.${k}`)} nv${lvl}  ${shown}${crewTxt}`;
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
    lines.push(`  → ${[...notes, ...deltas].join(" · ")}`);
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
