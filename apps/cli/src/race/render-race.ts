/**
 * Text view of a RaceLog for `pnpm sim:race` (ROADMAP D14, docs/race-engine.md 20.6).
 *
 * Pure and deterministic: no IO, no clock, no randomness, integer arithmetic for every number it
 * prints. It reads the log only and never recomputes physics: crossing times interpolate the
 * sampled frames, margins are the log's `marginMm`, the "why" block subtracts ledger values.
 */
import type { SegmentType } from "@falconess/schema";
import type { RaceLabels } from "./labels.js";
import {
  FRAME_FLAG,
  type RaceEntry,
  type RaceEvent,
  type RaceGeometry,
  type RaceLog,
  type RaceResult,
  type RunnerDerived,
} from "./log-view.js";

const TICK_HZ = 15;
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
const SEGMENT_ORDER: readonly SegmentType[] = [
  "flat",
  "climb",
  "descent",
  "jump",
  "water",
  "canyon",
  "curves",
];

/** Bar characters, highest precedence first (one char per time slice and runner). */
export const BAR = {
  finish: "|",
  dnf: "X",
  stalled: "x",
  airborne: "^",
  overheated: "!",
  exhausted: "_",
  pulse: "*",
  boost: ">",
  lightBoost: "+",
  drafting: "=",
  normal: "-",
  after: " ",
} as const;

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

// --- lookups ------------------------------------------------------------------------------------

type Runner = { entry: RaceEntry; derived: RunnerDerived | undefined; result: RaceResult };

function runnersInPlaceOrder(log: RaceLog): Runner[] {
  const entryByLane = new Map(log.entries.map((e) => [e.laneIndex, e]));
  const derivedByLane = new Map(log.derived.map((d) => [d.lane, d]));
  return log.results.map((result) => {
    const entry = entryByLane.get(result.lane);
    if (!entry) throw new Error(`RaceLog has a result for lane ${result.lane} but no entry`);
    return { entry, derived: derivedByLane.get(result.lane), result };
  });
}

function phaseIndexAt(geometry: RaceGeometry, mm: number): 0 | 1 | 2 {
  if (mm < geometry.startEndMm) return 0;
  if (mm < geometry.finalStartMm) return 1;
  return 2;
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
  const present = SEGMENT_ORDER.filter((t) => g.segments.some((s) => s.type === t));
  const legend = present.map((t) => `${SEGMENT_CHAR[t]} ${labels.segmentName(t)}`).join("  ");
  return [
    `${labels.courseName(log.courseId)} · ${metres(g.lengthMm)} m · ${labels.biomeName(log.courseId)} · semilla ${log.seed} · ruleset ${log.rulesetVersion} · motor ${log.engine}`,
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
    `${labels.frameName(entry.frameId)} · ${labels.manufacturerName(entry.manufacturer)} · ${labels.styleName(entry.style)}`,
  ]);
  return [
    "CLASIFICACIÓN",
    ...padTable(
      [[" #", "corredora", "tiempo", "margen", "alas · fabricante · estilo"], ...rows],
      [0, 2, 3],
    ).map((l) => `  ${l}`),
  ];
}

// --- 3. timeline --------------------------------------------------------------------------------

/**
 * Milli-ticks at which the runner crossed 10 %, 20 % … 100 % of the course: linear interpolation
 * between the two sampled frame rows around each mark; the 100 % mark is the log's exact
 * `finishMilli`. `null` for a mark the runner never reached (DNF).
 */
export function crossingMilliTicks(log: RaceLog, lane: number): (number | null)[] {
  const frames = log.frames;
  const pos = frames?.runners[lane]?.posMm;
  if (!frames || !pos) return [];
  const result = log.results.find((r) => r.lane === lane);
  const out: (number | null)[] = [];
  for (let k = 1; k <= 10; k++) {
    if (k === 10 && result && result.finishMilli !== null) {
      out.push(result.finishMilli);
      continue;
    }
    const mark = Math.floor((k * log.geometry.lengthMm) / 10);
    const i = pos.findIndex((p) => p >= mark);
    const t1 = frames.tick[i];
    const p1 = pos[i];
    if (i < 0 || t1 === undefined || p1 === undefined) {
      out.push(null);
      continue;
    }
    const t0 = frames.tick[i - 1];
    const p0 = pos[i - 1];
    if (i === 0 || t0 === undefined || p0 === undefined || p1 === p0) {
      out.push(t1 * 1000);
      continue;
    }
    out.push(roundDiv(1000 * (t0 * (p1 - p0) + (mark - p0) * (t1 - t0)), p1 - p0));
  }
  return out;
}

/** Overheat spans `[onTick, offTick)` of one runner, from the `overheat` events. */
function overheatSpans(
  events: readonly RaceEvent[],
  lane: number,
  endTick: number,
): [number, number][] {
  const spans: [number, number][] = [];
  let on: number | null = null;
  for (const e of events) {
    if (e.lane !== lane || e.kind !== "overheat") continue;
    if (e.on && on === null) on = e.tick;
    else if (!e.on && on !== null) {
      spans.push([on, e.tick]);
      on = null;
    }
  }
  if (on !== null) spans.push([on, endTick]);
  return spans;
}

/** Seconds per bar column: whole seconds, so columns align with the 15-tick sampling. */
export function barSecondsPerColumn(ticks: number): number {
  return Math.max(1, Math.ceil(Math.ceil(ticks / TICK_HZ) / BAR_MAX_COLS));
}

/**
 * One char per time slice of `secondsPerColumn` seconds, from the frame rows whose tick falls in
 * the slice (or, between sparse rows, the next row, whose `boost` count covers the slice): flags
 * OR-ed, `boost` on-ticks summed against the ticks those rows cover (`>` at least half of them,
 * `+` fewer, `*` any for a pulse frame). Overheat spans also come from the events, because a short
 * span can fall between two sampled rows.
 */
export function timelineBar(log: RaceLog, lane: number): string {
  const frames = log.frames;
  const col = frames?.runners[lane];
  if (!frames || !col) return "";
  const colTicks = barSecondsPerColumn(log.ticks) * TICK_HZ;
  const nCols = Math.max(1, Math.ceil(log.ticks / colTicks));
  const pulseFrame = (log.derived.find((d) => d.lane === lane)?.pulseMms ?? 0) > 0;
  const spans = overheatSpans(log.events ?? [], lane, log.ticks);
  const finishRow = col.flags.findIndex((f) => (f & FRAME_FLAG.finished) !== 0);
  const finishTick = finishRow >= 0 ? frames.tick[finishRow] : undefined;
  const finishCol =
    finishTick === undefined ? nCols : Math.max(0, Math.ceil(finishTick / colTicks) - 1);
  let bar = "";
  for (let c = 0; c < nCols; c++) {
    if (c > finishCol) {
      bar += BAR.after;
      continue;
    }
    if (c === finishCol) {
      bar += BAR.finish;
      continue;
    }
    const a = c * colTicks;
    const b = a + colTicks;
    let rows: number[] = [];
    frames.tick.forEach((t, i) => {
      if (t > a && t <= b) rows.push(i);
    });
    if (rows.length === 0) {
      const next = frames.tick.findIndex((t) => t > b);
      rows = [next >= 0 ? next : frames.tick.length - 1];
    }
    let flags = 0;
    let boost = 0;
    let covered = 0;
    for (const i of rows) {
      flags |= col.flags[i] ?? 0;
      boost += col.boost[i] ?? 0;
      covered += (frames.tick[i] ?? 0) - (frames.tick[i - 1] ?? 0);
    }
    // A runner overheated during ticks [on, off) shows it in rows on + 1 … off.
    const hot = spans.some(([on, off]) => on + 1 <= b && off > a);
    const boosted = boost > 0 || (flags & (FRAME_FLAG.boosting | FRAME_FLAG.pulseBurst)) !== 0;
    if (flags & FRAME_FLAG.dnf) bar += BAR.dnf;
    else if (flags & FRAME_FLAG.stalled) bar += BAR.stalled;
    else if (flags & FRAME_FLAG.airborne) bar += BAR.airborne;
    else if (hot || flags & FRAME_FLAG.overheated) bar += BAR.overheated;
    else if (flags & FRAME_FLAG.exhausted) bar += BAR.exhausted;
    else if (boosted && (pulseFrame || flags & FRAME_FLAG.pulseBurst)) bar += BAR.pulse;
    else if (boosted) bar += 2 * boost >= covered ? BAR.boost : BAR.lightBoost;
    else if (flags & FRAME_FLAG.drafting) bar += BAR.drafting;
    else bar += BAR.normal;
  }
  return bar;
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
  const nCols = Math.max(1, Math.ceil(log.ticks / (spc * TICK_HZ)));
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
    `  ${"".padEnd(nameWidth)}  ${ruler}`,
    ...runners.map(
      ({ entry }) =>
        `  ${labels.runnerName(entry).padEnd(nameWidth)}  ${timelineBar(log, entry.laneIndex)}`,
    ),
  ];
}

// --- 4. events ----------------------------------------------------------------------------------

type EventLine = { tick: number; posMm: number; text: string };

function describeEvent(e: RaceEvent, labels: RaceLabels, all: readonly RaceEvent[]): string | null {
  switch (e.kind) {
    case "skill":
      return `habilidad ${labels.skillName(e.skillId)} (p ${e.p} > u ${e.u})${e.activation > 1 ? ` #${e.activation}` : ""}`;
    case "skillMiss":
      return `falla ${labels.skillName(e.skillId)} (u ${e.u} ≥ p ${e.p})`;
    case "freeBoost":
      return `boost gratis en ${labels.segmentName(e.segment)}`;
    case "sprintPlan":
      return `plan de sprint #${e.index} (${e.cause}): ${describePlan(e)}`;
    case "jumpOk":
      return `salto OK (lift ${milliUnits(e.lift)} ≥ ${milliUnits(e.required)})`;
    case "jumpFail":
      return `salto FALLIDO (lift ${milliUnits(e.lift)} < ${milliUnits(e.required)}) · -${milliUnits(e.damage)} durabilidad · ${e.stallTicks} ticks detenida`;
    case "landing":
      return `aterrizaje -${mps(e.speedLossMms)} m/s`;
    case "detour":
      return `desvío por tierra (tramo ${e.segment + 1})`;
    case "waterHit":
      return `agua -${milliUnits(e.damage)} durabilidad`;
    case "overheat": {
      if (!e.on) return null;
      const off = all.find(
        (o) => o.kind === "overheat" && o.lane === e.lane && !o.on && o.tick > e.tick,
      );
      return off && off.kind === "overheat"
        ? `sobrecalentada ${off.tick - e.tick} ticks (calor ${milliUnits(e.heat)} → ${milliUnits(off.heat)})`
        : `sobrecalentada hasta el final (calor ${milliUnits(e.heat)})`;
    }
    case "hpEmpty":
      return "hp agotada: sin boost, a velocidad mínima";
    case "durabilityBroken":
      return `alas rotas (P/W ${fixed(e.powerToWeight, 1000, 2)})`;
    case "repair":
      return `reparación +${milliUnits(e.amount)} durabilidad`;
    case "heatToEnergy":
      return `calor a energía: ${milliUnits(e.heat)} calor → +${milliUnits(e.energy)} energía`;
    case "finish":
      return `meta ${e.place}º`;
    case "dnf":
      return "DNF";
    case "boostMode":
    case "pulse":
      return null; // modes go to the "why" block; pulses are grouped by `runnerEvents`
  }
}

function describePlan(e: RaceEvent & { kind: "sprintPlan" }): string {
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
  const all = log.events ?? [];
  const lines: EventLine[] = [];
  let pulses: (RaceEvent & { kind: "pulse" })[] = [];
  const flush = () => {
    const first = pulses[0];
    const last = pulses[pulses.length - 1];
    if (first && last) {
      const chain = Math.max(...pulses.map((p) => p.chain));
      const free = pulses.filter((p) => p.free).length;
      const until = pulses.length > 1 ? ` hasta ${seconds(last.tick, 1)} s` : "";
      lines.push({
        tick: first.tick,
        posMm: first.posMm,
        text: `pulso${pulses.length > 1 ? `s ×${pulses.length}` : ""}${until} · cadena máx ${chain}${free > 0 ? ` · ${free} gratis` : ""}`,
      });
    }
    pulses = [];
  };
  for (const e of all) {
    if (e.lane !== lane) continue;
    if (e.kind === "pulse") {
      pulses.push(e);
      continue;
    }
    const text = describeEvent(e, labels, all);
    if (text === null) continue;
    flush();
    lines.push({ tick: e.tick, posMm: e.posMm, text });
  }
  flush();
  return lines;
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
        `    ${`${seconds(l.tick, 1)} s`.padStart(7)}  ${`${metres(l.posMm)} m`.padStart(6)}  ${l.text}`,
      );
  }
  return out;
}

// --- 5. why -------------------------------------------------------------------------------------

function modeSequence(log: RaceLog, lane: number): string {
  const parts: { label: string; n: number }[] = [];
  for (const e of log.events ?? []) {
    if (e.lane !== lane || e.kind !== "boostMode" || e.mode === "off") continue;
    const label = e.levelMms > 0 ? `${e.mode} ${mps(e.levelMms)}` : e.mode;
    const last = parts[parts.length - 1];
    if (last && last.label === label) last.n += 1;
    else parts.push({ label, n: 1 });
  }
  return parts.map((p) => (p.n > 1 ? `${p.label} ×${p.n}` : p.label)).join(" → ");
}

function skillsLine(log: RaceLog, r: Runner, labels: RaceLabels): string {
  if (log.events) {
    return log.events
      .filter((e) => e.lane === r.entry.laneIndex)
      .flatMap((e) => {
        if (e.kind === "skill") return [`✓ ${labels.skillName(e.skillId)} (p ${e.p} > u ${e.u})`];
        if (e.kind === "skillMiss")
          return [`✗ ${labels.skillName(e.skillId)} (u ${e.u} ≥ p ${e.p})`];
        return [];
      })
      .join(" · ");
  }
  const { skillsActivated, skillsMissed } = r.result.ledger;
  return [
    ...skillsActivated.map((id) => `✓ ${labels.skillName(id)}`),
    ...skillsMissed.map((id) => `✗ ${labels.skillName(id)}`),
  ].join(" · ");
}

function whyBlock(log: RaceLog, r: Runner, winner: Runner, labels: RaceLabels): string[] {
  const { entry, derived, result } = r;
  const L = result.ledger;
  const W = winner.result.ledger;
  const g = log.geometry;
  const isWinner = r === winner;
  const lines: [string, string][] = [];

  const gap =
    !isWinner && result.finishMilli !== null && winner.result.finishMilli !== null
      ? `  (${signed(result.finishMilli - winner.result.finishMilli, 1000 * TICK_HZ, 2)} s)`
      : "";
  lines.push([
    "fases",
    PHASES.map((name, i) => {
      const t = L.phaseTicks[i] ?? 0;
      const delta =
        isWinner || result.dnf ? "" : ` (${signed(t - (W.phaseTicks[i] ?? 0), TICK_HZ, 2)})`;
      return `${name} ${seconds(t, 2)} s${delta}`;
    }).join(" · "),
  ]);

  const gains = [`boost ${L.boostTicks.join("/")} ticks`];
  if (L.pulses > 0) gains.push(`${L.pulses} pulsos`);
  if (L.draftTicks > 0) gains.push(`rebufo ${seconds(L.draftTicks, 1)} s`);
  if (L.skillsActivated.length > 0) gains.push(`${L.skillsActivated.length} habilidad(es)`);
  lines.push(["ganancias", gains.join(" · ")]);

  const sinks: string[] = [];
  if (L.stallTicks > 0)
    sinks.push(
      `detenida ${seconds(L.stallTicks, 2)} s${L.jumpsFailed > 0 ? ` (${L.jumpsFailed} salto(s) fallido(s))` : ""}`,
    );
  if (L.hpEmptyMm !== null)
    sinks.push(
      `agotada en ${metres(L.hpEmptyMm)} m (${metres(g.lengthMm - L.hpEmptyMm)} m a velocidad mínima)`,
    );
  if (L.jumpsOk > 0)
    sinks.push(`${L.jumpsOk} aterrizaje(s) -${mps(L.landingLossMms)} m/s en total`);
  if (L.detours > 0) sinks.push(`${L.detours} desvío(s) por tierra`);
  if (L.overheatTicks > 0) sinks.push(`sobrecalor ${L.overheatTicks} ticks`);
  if (result.dnf) sinks.push("DNF");
  if (L.energyLeft > 0) sinks.push(`energía sin usar ${milliUnits(L.energyLeft)}`);
  lines.push(["pérdidas", sinks.length > 0 ? sinks.join(" · ") : "—"]);

  if (derived) {
    lines.push([
      "juicio",
      `ritmo ${derived.pace.map(pmSigned).join("/")} ‰ · error de plan ${pmSigned(derived.planErrPm)} ‰ (±${derived.planErrWindowPm})`,
    ]);
  }

  const plans = (log.events ?? []).filter(
    (e): e is RaceEvent & { kind: "sprintPlan" } =>
      e.lane === entry.laneIndex && e.kind === "sprintPlan",
  );
  const firstPlan = plans[0];
  const lastPlan = plans[plans.length - 1];
  if (firstPlan && lastPlan) {
    const last =
      lastPlan.levelMms === 0
        ? `ninguno (${lastPlan.reason})`
        : `${mps(lastPlan.levelMms)} m/s de ${metres(lastPlan.startMm)} m`;
    lines.push([
      "plan",
      `${describePlan(firstPlan)}${plans.length > 1 ? ` · ${plans.length - 1} replan, el último (${lastPlan.cause}): ${last}` : ""}`,
    ]);
  }

  const modes = modeSequence(log, entry.laneIndex);
  if (modes) lines.push(["modos", modes]);

  if (derived) {
    const terms: string[] = [];
    if (derived.stoopPm !== 1000) terms.push(`picada ${derived.stoopPm} ‰`);
    const jumps = g.segments.some((s) => s.type === "jump");
    if (jumps && derived.detourPm === 0) terms.push(`aterrizaje ${derived.landPm} ‰`);
    if (jumps && derived.detourPm > 0) terms.push(`desvío ${derived.detourPm} ‰`);
    if (derived.pulseMms > 0)
      terms.push(
        `aire ${g.segments.map((s, i) => `${SEGMENT_CHAR[s.type]}${derived.airPm[i] ?? 1000}`).join(" ")}`,
      );
    if (terms.length > 0) lines.push(["términos", terms.join(" · ")]);

    lines.push([
      "tramos",
      `${g.segments
        .map((s, i) => {
          const row = derived.segments[i];
          if (!row) return SEGMENT_CHAR[s.type];
          const cruise = row.cruiseMms[phaseIndexAt(g, Math.floor((s.startMm + s.endMm) / 2))];
          return `${SEGMENT_CHAR[s.type]} ${fixed(row.fPm, 1000, 2)}/${mps(cruise ?? 0, 1)}`;
        })
        .join(" · ")}  (f / crucero m/s)`,
    ]);
  }

  lines.push([
    "energía",
    [
      `gastada ${milliUnits(L.energySpent)}`,
      `lift ${milliUnits(L.energyLift)}`,
      `regen +${milliUnits(L.energyRegen)}`,
      `reembolso +${milliUnits(L.energyRefunded)}`,
      `calor +${milliUnits(L.energyFromHeat)}`,
      `queda ${milliUnits(L.energyLeft)}`,
    ].join(" · "),
  ]);
  lines.push([
    "cuerpo",
    `hp final ${fixed(result.hpEnd, 1000, 0)} · durabilidad -${milliUnits(L.durabilityLost)} +${milliUnits(L.durabilityRepaired)} → ${milliUnits(result.durabilityEnd)}`,
  ]);
  const skills = skillsLine(log, r, labels);
  if (skills) lines.push(["habilidades", skills]);

  const labelWidth = Math.max(...lines.map(([k]) => k.length));
  return [
    `  ${result.place}º ${labels.runnerName(entry)}  ${formatTime(result)}${gap}`,
    ...lines.map(([k, v]) => `     ${k.padEnd(labelWidth)}  ${v}`),
  ];
}

function why(log: RaceLog, runners: readonly Runner[], labels: RaceLabels): string[] {
  const winner = runners[0];
  if (!winner) return [];
  return [
    "POR QUÉ · fases con la diferencia contra la ganadora, ganancias y pérdidas del ledger",
    ...runners.flatMap((r) => whyBlock(log, r, winner, labels)),
  ];
}

// --- entry point --------------------------------------------------------------------------------

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
