/**
 * Text view of a RaceLog for `pnpm sim:race` (ROADMAP D14, docs/race-engine.md 20.6).
 *
 * Pure and deterministic: no IO, no clock, no randomness, integer arithmetic for every number it
 * prints. It reads the log only and never recomputes physics: the timeline, the events and the
 * "why" block are the shared view models of `@falconess/race-view` (the web reads the same ones),
 * worded here; margins are the log's `marginMm`.
 */
import {
  type AdviceItem,
  type Compressed,
  compressRuns,
  crossingMilliTicks,
  type EventItem,
  type Runner,
  raceAdvice,
  runnerEventLines,
  runnersInPlaceOrder,
  type SprintPlanEvent,
  secondsPerColumn,
  segmentTypesPresent,
  TICK_HZ,
  type TimelineCell,
  timelineCells,
  timelineColumns,
  type WhySink,
  type WhyTerm,
  whyModel,
} from "@falconess/race-view";
import type { SegmentType } from "@falconess/schema";
import { adviceEvidence, adviceHeadline } from "./advice-text.js";
import type { RaceLabels } from "./labels.js";
import type { RaceGeometry, RaceLog, RaceResult } from "./log-view.js";

export { crossingMilliTicks };

const PHASES = ["salida", "medio", "final"] as const;

export const SEGMENT_CHAR: Readonly<Record<SegmentType, string>> = {
  flat: "_",
  climb: "/",
  descent: "\\",
  jump: "^",
  water: "~",
  canyon: "|",
  curves: ")",
};

/** Bar characters, highest precedence first (one char per time slice and runner). */
export const BAR: Readonly<Record<TimelineCell, string>> = {
  finish: "|",
  dnf: "X",
  stalled: "x",
  broken: "#",
  airborne: "^",
  overheated: "!",
  exhausted: "_",
  pulse: "*",
  boost: ">",
  lightBoost: "+",
  drafting: "=",
  normal: "-",
  after: " ",
};

const STRIP_MAX_CHARS = 60;
const STRIP_UNITS_M = [25, 50, 100, 200, 250, 500, 1000] as const;
const BAR_MAX_COLS = 60;

// --- integer formatting ------------------------------------------------------------------------

/** `num / den` rounded half away from zero to `decimals` places, from integers only. */
export function fixed(num: number, den: number, decimals: number): string {
  const n = Math.abs(num);
  const d = Math.abs(den);
  let scale = 1;
  for (let i = 0; i < decimals; i++) scale *= 10;
  const q = Math.floor((2 * n * scale + d) / (2 * d));
  const negative = q !== 0 && num < 0 !== den < 0;
  const intPart = Math.floor(q / scale);
  const frac = decimals > 0 ? `.${String(q % scale).padStart(decimals, "0")}` : "";
  return `${negative ? "-" : ""}${intPart}${frac}`;
}

function signed(num: number, den: number, decimals: number): string {
  const s = fixed(num, den, decimals);
  return s.startsWith("-") ? s : `+${s}`;
}

/** Integer division rounded half up (both operands non-negative). */
function roundDiv(num: number, den: number): number {
  return Math.floor((2 * num + den) / (2 * den));
}

const seconds = (ticks: number, decimals: number) => fixed(ticks, TICK_HZ, decimals);
const secondsMilli = (milliTicks: number, decimals: number) =>
  fixed(milliTicks, 1000 * TICK_HZ, decimals);
const metres = (mm: number, decimals = 0) => fixed(mm, 1000, decimals);
const milliUnits = (milli: number) => fixed(milli, 1000, 1);
const mps = (mms: number, decimals = 2) => fixed(mms, 1000, decimals);
const pmSigned = (pm: number) => (pm > 0 ? `+${pm}` : String(pm));
const ticksText = (n: number) => `${n} ${n === 1 ? "tick" : "ticks"}`;
/** `sprintPlan.index` is 0 for the plan and k for the k-th replan (11.1). */
const planName = (index: number) => (index === 0 ? "plan de sprint" : `replan ${index}`);

function padTable(rows: readonly (readonly string[])[], rightAligned: readonly number[]): string[] {
  const widths: number[] = [];
  for (const row of rows)
    row.forEach((cell, i) => {
      widths[i] = Math.max(widths[i] ?? 0, cell.length);
    });
  return rows.map((row) =>
    row
      .map((cell, i) => {
        const w = widths[i] ?? 0;
        if (i === row.length - 1 && !rightAligned.includes(i)) return cell;
        return rightAligned.includes(i) ? cell.padStart(w) : cell.padEnd(w);
      })
      .join("  ")
      .trimEnd(),
  );
}

// --- 1. header ----------------------------------------------------------------------------------

/** Segment strip, one char per segment type, scaled to length. */
export function segmentStrip(geometry: RaceGeometry): { strip: string; unitM: number } {
  const unitM = STRIP_UNITS_M.find((u) => geometry.lengthMm <= u * 1000 * STRIP_MAX_CHARS) ?? 1000;
  const unitMm = unitM * 1000;
  let strip = "";
  for (const seg of geometry.segments) {
    const endChar = roundDiv(seg.endMm, unitMm);
    strip += SEGMENT_CHAR[seg.type].repeat(Math.max(1, endChar - strip.length));
  }
  return { strip, unitM };
}

function header(log: RaceLog, labels: RaceLabels): string[] {
  const g = log.geometry;
  const { strip, unitM } = segmentStrip(g);
  const legend = segmentTypesPresent(g)
    .map((t) => `${SEGMENT_CHAR[t]} ${labels.segmentName(t)}`)
    .join("  ");
  return [
    `${labels.courseName(log.courseId)} · ${metres(g.lengthMm)} m · semilla ${log.seed} · ruleset ${log.rulesetVersion} · motor ${log.engine}`,
    `pista  [${strip}]  1 car = ${unitM} m`,
    `       ${legend}`,
    `       fases: salida hasta ${metres(g.startEndMm)} m · medio hasta ${metres(g.finalStartMm)} m · final hasta ${metres(g.lengthMm)} m`,
  ];
}

// --- 2. classification --------------------------------------------------------------------------

export function formatTime(result: RaceResult): string {
  return result.dnf || result.finishMilli === null
    ? "DNF"
    : `${secondsMilli(result.finishMilli, 2)} s`;
}

/** Distance behind the previous finisher when it crossed (spec 19), from the log's `marginMm`. */
export function formatMargin(result: RaceResult): string {
  if (result.dnf || result.marginMm === null) return "";
  if (result.deadHeat) return "empate";
  if (result.place === 1) return "—";
  return `+${metres(result.marginMm, 2)} m`;
}

function classification(runners: readonly Runner[], labels: RaceLabels): string[] {
  const rows = runners.map(({ entry, result }) => [
    `${entry.kind === "player" ? "»" : " "}${result.place}`,
    labels.runnerName(entry),
    formatTime(result),
    formatMargin(result),
    `${labels.positionName(entry.position)} ${entry.positionAptitude}`,
    `${labels.frameName(entry.frameId)} · ${labels.manufacturerName(entry.manufacturer)} · ${labels.styleName(entry.style)}`,
  ]);
  return [
    "CLASIFICACIÓN",
    ...padTable(
      [[" #", "corredora", "tiempo", "margen", "posición", "alas · fabricante · estilo"], ...rows],
      [0, 2, 3],
    ).map((l) => `  ${l}`),
  ];
}

// --- 3. timeline --------------------------------------------------------------------------------

/** Seconds per bar column: whole seconds, so columns align with the 15-tick sampling. */
export function barSecondsPerColumn(ticks: number): number {
  return secondsPerColumn(ticks, BAR_MAX_COLS);
}

/** One char per time slice of the runner (the shared `timelineCells`, see BAR). */
export function timelineBar(log: RaceLog, lane: number): string {
  return timelineCells(log, lane, barSecondsPerColumn(log.ticks))
    .map((cell) => BAR[cell])
    .join("");
}

function timeline(log: RaceLog, runners: readonly Runner[], labels: RaceLabels): string[] {
  if (!log.frames) return ["LÍNEA DE TIEMPO", '  (sin frames: detail "results")'];
  const head = ["", ...Array.from({ length: 10 }, (_, k) => `${(k + 1) * 10}%`)];
  const rows = runners.map(({ entry }) => [
    labels.runnerName(entry),
    ...crossingMilliTicks(log, entry.laneIndex).map((mt) =>
      mt === null ? "—" : secondsMilli(mt, 1),
    ),
  ]);
  const spc = barSecondsPerColumn(log.ticks);
  const nCols = timelineColumns(log, spc);
  const nameWidth = Math.max(...runners.map((r) => labels.runnerName(r.entry).length));
  let ruler = "";
  for (let c = 0; c < nCols; c += 10) ruler += `${c * spc}s`.padEnd(Math.min(10, nCols - c));
  const legend = [
    `${BAR.boost} boost ≥ 50 %`,
    `${BAR.lightBoost} boost < 50 %`,
    `${BAR.pulse} pulso`,
    `${BAR.drafting} rebufo`,
    `${BAR.airborne} en el aire`,
    `${BAR.exhausted} agotada`,
    `${BAR.overheated} sobrecalentada`,
    `${BAR.stalled} detenida`,
    `${BAR.broken} alas rotas`,
    `${BAR.normal} crucero`,
    `${BAR.finish} meta`,
    `${BAR.dnf} DNF`,
  ].join("  ");
  return [
    "LÍNEA DE TIEMPO · segundos al cruzar cada 10 % de la pista (100 % = meta)",
    ...padTable([head, ...rows], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).map((l) => `  ${l}`),
    "",
    `  1 columna = ${spc} s`,
    `  ${legend}`,
    `  ${"".padEnd(nameWidth)}  ${ruler}`.trimEnd(),
    ...runners.map(
      ({ entry }) =>
        `  ${labels.runnerName(entry).padEnd(nameWidth)}  ${timelineBar(log, entry.laneIndex)}`,
    ),
  ];
}

// --- 4. events ----------------------------------------------------------------------------------

/** `milli`: when it happened in milli-ticks (`tick × 1000`, the exact `finishMilli` for a finish). */
type EventLine = { tick: number; milli: number; posMm: number; text: string };

/** `velocidad ×0.75`: the broken-wing speed factor (8.4); empty when neutral. */
function brokenSpeedText(speedPm: number | null): string {
  return speedPm === null || speedPm === 1000 ? "" : `velocidad ×${fixed(speedPm, 1000, 2)}`;
}

function describeEvent(item: EventItem, tick: number, labels: RaceLabels, log: RaceLog): string {
  switch (item.kind) {
    case "pulses": {
      const until = item.count > 1 ? ` hasta ${seconds(item.lastTick, 1)} s` : "";
      return `pulso${item.count > 1 ? `s ×${item.count}` : ""}${until} · cadena máx ${item.chainMax}${item.free > 0 ? ` · ${item.free} gratis` : ""}`;
    }
    case "overheatSpan":
      return item.offTick !== null && item.offHeat !== null
        ? `sobrecalentada ${ticksText(item.offTick - tick)} (calor ${milliUnits(item.heat)} → ${milliUnits(item.offHeat)})`
        : `sobrecalentada hasta el final (calor ${milliUnits(item.heat)})`;
    case "skill":
      return `habilidad ${labels.skillName(item.skillId)} (p ${item.p} > u ${item.u})${item.activation > 1 ? ` #${item.activation}` : ""}`;
    case "skillMiss":
      return `falla ${labels.skillName(item.skillId)} (u ${item.u} ≥ p ${item.p})`;
    case "freeBoost":
      return `boost gratis en ${labels.segmentName(item.segment)}`;
    case "sprintPlan":
      return `${planName(item.index)} (${item.cause}): ${describePlan(item)}`;
    case "jumpOk":
      return `salto OK (lift ${milliUnits(item.lift)} ≥ ${milliUnits(item.required)})`;
    case "jumpFail":
      return `salto FALLIDO (lift ${milliUnits(item.lift)} < ${milliUnits(item.required)}) · -${milliUnits(item.damage)} durabilidad · ${ticksText(item.stallTicks)} detenida`;
    case "landing":
      return `aterrizaje -${mps(item.speedLossMms)} m/s`;
    case "detour":
      return `desvío por tierra (tramo ${item.segment + 1})`;
    case "waterHit":
      return item.damage === 0
        ? "terreno líquido sin daño"
        : `terreno líquido -${milliUnits(item.damage)} durabilidad`;
    case "hpEmpty":
      return "hp agotada: sin boost, a velocidad mínima";
    case "durabilityBroken": {
      const speed = brokenSpeedText(log.derived[item.lane]?.brokenSpeedPm ?? 1000);
      return `alas rotas (P/W ${fixed(item.powerToWeight, 1000, 2)}${speed ? `, ${speed}` : ""})`;
    }
    case "repair":
      return `reparación +${milliUnits(item.amount)} durabilidad`;
    case "heatToEnergy":
      return `calor a energía: ${milliUnits(item.heat)} calor → +${milliUnits(item.energy)} energía`;
    case "finish":
      return `meta ${item.place}º`;
    case "dnf":
      return "DNF";
    case "takeoff":
      return `despega a banda ${item.band} (−${milliUnits(item.cost)} energía)`;
    case "dive":
      return `PICADA desde banda ${item.fromBand}: +${mps(item.gainMms)} m/s`;
    case "touchdown":
      return `toca suelo desde banda ${item.fromBand}${item.cause === "energy" ? " (sin energía para sostener)" : ""}`;
    case "noLift":
      return `SIN ENERGÍA: no despega (${milliUnits(item.have)} < ${milliUnits(item.need)})`;
  }
}

function describePlan(e: SprintPlanEvent): string {
  if (e.levelMms === 0) return `ninguno (${e.reason})`;
  return [
    `${mps(e.levelMms)} m/s de ${metres(e.startMm)} m a ${metres(e.endMm)} m`,
    e.reason,
    e.clean ? "limpio" : "sucio",
    `E ${milliUnits(e.energy)} (percibe ${milliUnits(e.energyPerceived)})`,
    `hp ${fixed(e.hp, 1000, 0)} (percibe ${fixed(e.hpPerceived, 1000, 0)})`,
    `${e.candidates} cand.`,
  ].join(" · ");
}

/** Key events of one runner in emission (time) order; consecutive pulses become one line. */
export function runnerEvents(log: RaceLog, lane: number, labels: RaceLabels): EventLine[] {
  return runnerEventLines(log, lane).map((l) => ({
    tick: l.tick,
    milli: l.milli,
    posMm: l.posMm,
    text: describeEvent(l.item, l.tick, labels, log),
  }));
}

function eventsSection(log: RaceLog, runners: readonly Runner[], labels: RaceLabels): string[] {
  if (!log.events) return ["EVENTOS", '  (sin eventos: detail "results")'];
  const out = ["EVENTOS"];
  for (const { entry } of [...runners].sort((a, b) => a.entry.laneIndex - b.entry.laneIndex)) {
    out.push(`  ${labels.runnerName(entry)} (carril ${entry.laneIndex + 1})`);
    const lines = runnerEvents(log, entry.laneIndex, labels);
    if (lines.length === 0) out.push("    (sin eventos)");
    for (const l of lines)
      out.push(
        `    ${`${secondsMilli(l.milli, 1)} s`.padStart(7)}  ${`${metres(l.posMm)} m`.padStart(6)}  ${l.text}`,
      );
  }
  return out;
}

// --- 5. why -------------------------------------------------------------------------------------

function compressedText(part: Compressed<string>): string {
  if (part.kind === "more") return `… ${part.count} más`;
  const text = part.items.length === 1 ? (part.items[0] ?? "") : `(${part.items.join(" → ")})`;
  return part.reps > 1 ? `${text} ×${part.reps}` : text;
}

/**
 * Run-length of repeated blocks of up to 4 items, greedy from the left, keeping the block that
 * covers the most items (the shorter one on a tie): `a a a` → `a ×3`, `a b a b c` →
 * `(a → b) ×2`, `c`. More than 12 parts keep the first 7 and the last 4 around an ellipsis.
 */
export function compressSequence(items: readonly string[]): string[] {
  return compressRuns(items, (s) => s).map(compressedText);
}

/**
 * Broken wings as a time sink (20.4 flag 256, 8.4): where they broke and the PW before and after
 * (the PW only when it changed); from the start for a frame that starts at durability 0; without
 * events only the fact. Every case adds the speed factor when it is not neutral.
 */
function brokenText(sink: WhySink & { kind: "broken" }): string {
  const pw = (pm: number) => fixed(pm, 1000, 2);
  const costs: string[] = [];
  if (sink.pw) costs.push(`P/W ${pw(sink.pw.before)} → ${pw(sink.pw.after)}`);
  const speed = brokenSpeedText(sink.speedPm);
  if (speed) costs.push(speed);
  const cost = costs.length > 0 ? ` (${costs.join(", ")})` : "";
  if (sink.atMm !== null) return `alas rotas en ${metres(sink.atMm)} m${cost}`;
  return `${sink.fromStart ? "alas rotas desde la salida" : "alas rotas"}${cost}`;
}

function sinkText(sink: WhySink): string {
  switch (sink.kind) {
    case "stall":
      return `detenida ${seconds(sink.ticks, 2)} s${sink.jumpsFailed > 0 ? ` (${sink.jumpsFailed} salto(s) fallido(s))` : ""}`;
    case "hpEmpty":
      return `agotada en ${metres(sink.atMm)} m (${metres(sink.restMm)} m a velocidad mínima)`;
    case "landings":
      return `${sink.count} aterrizaje(s) -${mps(sink.lossMms)} m/s en total`;
    case "detours":
      return `${sink.count} desvío(s) por tierra`;
    case "overheat":
      return `sobrecalor ${ticksText(sink.ticks)}`;
    case "broken":
      return brokenText(sink);
    case "dnf":
      return "DNF";
    case "energyLeft":
      return `energía sin usar ${milliUnits(sink.energy)}`;
  }
}

function termText(term: WhyTerm): string {
  switch (term.kind) {
    case "stoop":
      return `picada ${term.pm} ‰`;
    case "landing":
      return `aterrizaje ${term.pm} ‰`;
    case "detour":
      return `desvío ${term.pm} ‰`;
    case "air":
      return `aire ${term.segments.map((s) => `${SEGMENT_CHAR[s.type]}${s.pm}`).join(" ")}`;
  }
}

/** A tip's row: what it points to and what the log shows. */
function adviceRow(item: AdviceItem, labels: RaceLabels): string {
  return `${labels.adviceStatName(item.stat)} · ${adviceEvidence(item, labels, fixed)}`;
}

/** One label column for every block: the longest label, "habilidades". */
const WHY_LABEL_WIDTH = 11;

/** The rows of a "why" block, by label. */
type WhyRow =
  | "fases"
  | "ganancias"
  | "pérdidas"
  | "juicio"
  | "plan"
  | "modos"
  | "términos"
  | "tramos"
  | "energía"
  | "cuerpo"
  | "habilidades"
  | "consejo";

/** The rows of the compact summary: phases against the winner, gains and time sinks. */
const SUMMARY_ROWS: ReadonlySet<WhyRow> = new Set(["fases", "ganancias", "pérdidas"]);

function whyBlock(
  log: RaceLog,
  r: Runner,
  winner: Runner,
  labels: RaceLabels,
  only?: ReadonlySet<WhyRow>,
): string[] {
  const m = whyModel(log, r, winner);
  const { entry, result } = r;
  const lines: [WhyRow, string][] = [];

  const gap = m.gapMilli === null ? "" : `  (${signed(m.gapMilli, 1000 * TICK_HZ, 2)} s)`;
  lines.push([
    "fases",
    m.phases
      .map((p, i) => {
        const delta = p.deltaTicks === null ? "" : ` (${signed(p.deltaTicks, TICK_HZ, 2)})`;
        return `${PHASES[i] ?? ""} ${seconds(p.ticks, 2)} s${delta}`;
      })
      .join(" · "),
  ]);

  const G = m.gains;
  const gains = [`boost ${G.boostTicks.join("/")} ticks`];
  if (G.pulses > 0) gains.push(`${G.pulses} pulsos`);
  if (G.draftTicks > 0) gains.push(`rebufo ${seconds(G.draftTicks, 1)} s`);
  if (G.skillsActivated > 0) gains.push(`${G.skillsActivated} habilidad(es)`);
  lines.push(["ganancias", gains.join(" · ")]);

  lines.push(["pérdidas", m.sinks.length > 0 ? m.sinks.map(sinkText).join(" · ") : "—"]);

  if (m.judgement) {
    const j = m.judgement;
    lines.push([
      "juicio",
      `ritmo ${j.pace.map(pmSigned).join("/")} ‰ · error de plan ${pmSigned(j.planErrPm)} ‰ (±${j.planErrWindowPm})`,
    ]);
  }

  if (m.plan) {
    const { first, last, count } = m.plan;
    const lastText =
      last.levelMms === 0
        ? `ninguno (${last.reason})`
        : `${mps(last.levelMms)} m/s de ${metres(last.startMm)} m`;
    lines.push([
      "plan",
      `${describePlan(first)}${count > 1 ? ` · ${count - 1} replan, el último (${last.cause}): ${lastText}` : ""}`,
    ]);
  }

  const modes = compressSequence(
    m.modes.map((s) => (s.levelMms > 0 ? `${s.mode} ${mps(s.levelMms)}` : s.mode)),
  ).join(" → ");
  if (modes) lines.push(["modos", modes]);

  if (m.terms && m.terms.length > 0) lines.push(["términos", m.terms.map(termText).join(" · ")]);

  if (m.segments) {
    lines.push([
      "tramos",
      `${m.segments
        .map((s) =>
          s.fPm === null
            ? SEGMENT_CHAR[s.type]
            : `${SEGMENT_CHAR[s.type]} ${fixed(s.fPm, 1000, 2)}/${mps(s.cruiseMms ?? 0, 1)}`,
        )
        .join(" · ")}  (f / crucero m/s)`,
    ]);
  }

  const E = m.energy;
  lines.push([
    "energía",
    [
      `gastada ${milliUnits(E.spent)}`,
      `lift ${milliUnits(E.lift)}`,
      `regen +${milliUnits(E.regen)}`,
      `reembolso +${milliUnits(E.refunded)}`,
      `calor +${milliUnits(E.fromHeat)}`,
      `queda ${milliUnits(E.left)}`,
    ].join(" · "),
  ]);
  const B = m.body;
  lines.push([
    "cuerpo",
    `hp final ${fixed(B.hpEnd, 1000, 0)} · durabilidad -${milliUnits(B.durabilityLost)} +${milliUnits(B.durabilityRepaired)} → ${milliUnits(B.durabilityEnd)}`,
  ]);
  const skills = m.skills
    .map((s) => {
      const name = labels.skillName(s.skillId);
      if (s.p === null || s.u === null) return `${s.fired ? "✓" : "✗"} ${name}`;
      return s.fired ? `✓ ${name} (p ${s.p} > u ${s.u})` : `✗ ${name} (u ${s.u} ≥ p ${s.p})`;
    })
    .join(" · ");
  if (skills) lines.push(["habilidades", skills]);
  for (const item of raceAdvice(log, entry.laneIndex))
    lines.push(["consejo", adviceRow(item, labels)]);

  return [
    `  ${result.place}º ${labels.runnerName(entry)}  ${formatTime(result)}${gap}`,
    ...lines
      .filter(([k]) => only === undefined || only.has(k))
      .map(([k, v]) => `     ${k.padEnd(WHY_LABEL_WIDTH)}  ${v}`),
  ];
}

function why(log: RaceLog, runners: readonly Runner[], labels: RaceLabels): string[] {
  const winner = runners[0];
  if (!winner) return [];
  return [
    "POR QUÉ · fases con la diferencia contra la ganadora, ganancias y pérdidas del ledger, y qué entrenar",
    ...runners.flatMap((r) => whyBlock(log, r, winner, labels)),
  ];
}

// --- entry points -------------------------------------------------------------------------------

/** From this place on, `pnpm play` tells the player what to train after a goal race. */
export const ADVICE_FROM_PLACE = 3;

/** What `pnpm play` says when the log shows no cause a stat or the workshop would fix. */
export const NO_ADVICE = "La carrera no muestra una causa que se corrija entrenando.";

/**
 * Umamusume's post-race tip for the runner in `lane`, one per cause the log shows (race-view's
 * `raceAdvice`): "¡Peregrina se quedó sin físico a los 1589 m! Quizás deberías entrenar
 * Resistencia.", then its evidence indented below.
 */
export function renderAdvice(log: RaceLog, lane: number, labels: RaceLabels): string[] {
  const entry = log.entries[lane];
  if (!entry) return [];
  const name = labels.runnerName(entry);
  return raceAdvice(log, lane).flatMap((item) => [
    adviceHeadline(item, name, labels, fixed),
    `  ${adviceEvidence(item, labels, fixed)}`,
  ]);
}

/**
 * The compact view of a race (`pnpm play` after a goal race): the classification, then the
 * player's phases against the winner, her gains and her time sinks ("pérdidas"), and when she
 * finished 3rd or worse what to train (`renderAdvice`), or that the log shows nothing to train. Works on either detail; without the
 * player (a field of rivals or fixtures) only the classification.
 */
export function renderRaceSummary(log: RaceLog, labels: RaceLabels): string[] {
  const runners = runnersInPlaceOrder(log);
  const winner = runners[0];
  const player = runners.find((r) => r.entry.kind === "player");
  const lines = classification(runners, labels);
  if (winner && player) lines.push(...whyBlock(log, player, winner, labels, SUMMARY_ROWS));
  if (player && player.result.place >= ADVICE_FROM_PLACE) {
    const advice = renderAdvice(log, player.entry.laneIndex, labels);
    lines.push(...(advice.length > 0 ? advice : [NO_ADVICE]));
  }
  return lines;
}

/** The whole text view, one string per line. */
export function renderRace(log: RaceLog, labels: RaceLabels): string[] {
  const runners = runnersInPlaceOrder(log);
  return [
    ...header(log, labels),
    "",
    ...classification(runners, labels),
    "",
    ...timeline(log, runners, labels),
    "",
    ...eventsSection(log, runners, labels),
    "",
    ...why(log, runners, labels),
  ];
}
