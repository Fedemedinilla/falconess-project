/**
 * The post-race tips of `@falconess/race-view` (advice.ts) in the CLI's words: the evidence row of
 * `pnpm sim:race`'s "why" block and the Umamusume-style message `pnpm play` prints after a goal
 * race finished 3rd or worse. Numbers from the tip only, integer formatting.
 */
import type { AdviceItem } from "@falconess/race-view";
import type { RaceLabels } from "./labels.js";

/** `num / den` rounded half away from zero to `decimals` places (render-race's `fixed`). */
type Fixed = (num: number, den: number, decimals: number) => string;

const PHASE_NAMES = ["la salida", "el medio", "el final"] as const;

const plural = (n: number, one: string, other: string) => (n === 1 ? one : other);

/** The skills of a tip, by name: "Último aliento y Garra". */
function skillList(ids: readonly string[], labels: RaceLabels): string {
  const names = ids.map((id) => labels.skillName(id));
  return names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

/** What the log shows, with its numbers (the sim:race row and the play message's second line). */
export function adviceEvidence(item: AdviceItem, labels: RaceLabels, fixed: Fixed): string {
  const m = (mm: number) => fixed(mm, 1000, 0);
  const s = (milli: number) => fixed(milli, 15_000, 2);
  const pm = (n: number) => (n > 0 ? `+${n}` : String(n));
  const cost = item.costMilli === null ? "" : ` · ≈${s(item.costMilli)} s`;
  switch (item.reason) {
    case "hpEmpty": {
      const ev = item.evidence;
      const winner =
        ev.winnerAtMm === null
          ? "la ganadora no se agotó"
          : `la ganadora aguantó hasta ${m(ev.winnerAtMm)} m`;
      return `sin físico a los ${m(ev.atMm)} m${ev.inFinal ? " (en el final)" : ""}, ${m(ev.restMm)} m a velocidad mínima; ${winner}${cost}`;
    }
    case "cruise": {
      const ev = item.evidence;
      const split =
        ev.curvesMilli > 0
          ? ` (${s(ev.middleMilli)} s en el medio, ${s(ev.curvesMilli)} s en curvas)`
          : "";
      return `crucero más lento: agilidad ${ev.agility} contra ${ev.winnerAgility}${split}${cost}`;
    }
    case "start": {
      const ev = item.evidence;
      return `salida lenta: aceleración ${fixed(ev.accelMms2, 1000, 2)} contra ${fixed(ev.winnerAccelMms2, 1000, 2)} m/s²${cost}`;
    }
    case "stall": {
      const ev = item.evidence;
      return `${ev.jumpsFailed} ${plural(ev.jumpsFailed, "salto fallido", "saltos fallidos")}, detenida ${fixed(ev.ticks, 15, 2)} s${cost}`;
    }
    case "landings": {
      const ev = item.evidence;
      return `${ev.count} ${plural(ev.count, "aterrizaje", "aterrizajes")} -${fixed(ev.lossMms, 1000, 2)} m/s; conserva ${ev.landPm} ‰ contra ${ev.winnerLandPm} ‰ de la ganadora`;
    }
    case "overheat": {
      const ev = item.evidence;
      return `sobrecalor ${ev.ticks} ${plural(ev.ticks, "tick", "ticks")} con tope de calor ${fixed(ev.heatCap, 1000, 1)}`;
    }
    case "heatCapped": {
      const ev = item.evidence;
      return `el calor frenó el boost desde los ${m(ev.atMm)} m (tope ${fixed(ev.heatCap, 1000, 1)}); energía sin usar ${fixed(ev.energyLeft, 1000, 1)}`;
    }
    case "pace": {
      const ev = item.evidence;
      return `ritmo ${ev.pace.map(pm).join("/")} ‰ contra ${ev.winnerPace.map(pm).join("/")} ‰, peor en ${PHASE_NAMES[ev.phase] ?? ""}; centro ${pm(ev.centrePm)} contra ${pm(ev.winnerCentrePm)} ‰${cost}`;
    }
    case "plan": {
      const ev = item.evidence;
      return `energía sin usar ${fixed(ev.energyLeft, 1000, 1)}: el plan no vio ${fixed(ev.unseen, 1000, 1)} (error ${pm(ev.planErrPm)} ‰)`;
    }
    case "skills": {
      const ev = item.evidence;
      const verb = ev.skillIds.length === 1 ? "no se activó" : "no se activaron";
      return `${verb} ${skillList(ev.skillIds, labels)} (p ${ev.pAct} ‰)${cost}`;
    }
    case "broken": {
      const ev = item.evidence;
      const where = ev.atMm !== null ? `en ${m(ev.atMm)} m` : ev.fromStart ? "desde la salida" : "";
      const speed = ev.speedPm === 1000 ? "" : `, velocidad ×${fixed(ev.speedPm, 1000, 2)}`;
      return `alas rotas${where ? ` ${where}` : ""}${speed}${cost}`;
    }
    case "worn": {
      const ev = item.evidence;
      return `alas gastadas: ${fixed(ev.durabilityEnd, 1000, 0)} de ${ev.durabilityMax} de durabilidad`;
    }
  }
}

/** The tip as Umamusume says it: "¡Peregrina se quedó sin físico a los 1589 m! Quizás…". */
export function adviceHeadline(
  item: AdviceItem,
  name: string,
  labels: RaceLabels,
  fixed: Fixed,
): string {
  const m = (mm: number) => fixed(mm, 1000, 0);
  const target = labels.adviceStatName(item.stat);
  const train =
    item.stat === "workshop"
      ? `Quizás deberías pasar por el ${target} a repararlas.`
      : `Quizás deberías entrenar ${target}.`;
  return `${adviceLead(item, name, labels, m, fixed)} ${train}`;
}

function adviceLead(
  item: AdviceItem,
  name: string,
  labels: RaceLabels,
  m: (mm: number) => string,
  fixed: Fixed,
): string {
  switch (item.reason) {
    case "hpEmpty":
      return item.evidence.inFinal && item.stat === "courage"
        ? `¡${name} se quedó sin físico en el final, a los ${m(item.evidence.atMm)} m!`
        : `¡${name} se quedó sin físico a los ${m(item.evidence.atMm)} m!`;
    case "cruise":
      return `¡${name} fue más lenta que la ganadora a velocidad de crucero!`;
    case "start":
      return `¡${name} salió lenta!`;
    case "stall":
      return `¡${name} falló ${plural(item.evidence.jumpsFailed, "un salto", `${item.evidence.jumpsFailed} saltos`)} y se quedó detenida ${fixed(item.evidence.ticks, 15, 1)} s!`;
    case "landings":
      return `¡${name} perdió velocidad en los aterrizajes!`;
    case "overheat":
      return `¡${name} se sobrecalentó!`;
    case "heatCapped":
      return `¡El calor frenó el boost de ${name} y le sobró energía!`;
    case "pace":
      return `¡${name} eligió un ritmo más lento que la ganadora!`;
    case "plan":
      return `¡${name} llegó con energía sin usar!`;
    case "skills":
      return item.evidence.skillIds.length === 1
        ? `¡No se activó ${skillList(item.evidence.skillIds, labels)}!`
        : `¡No se activaron ${skillList(item.evidence.skillIds, labels)}!`;
    case "broken":
      return item.evidence.atMm !== null
        ? `¡A ${name} se le rompieron las alas a los ${m(item.evidence.atMm)} m!`
        : `¡${name} corrió con las alas rotas!`;
    case "worn":
      return `¡Las alas de ${name} terminaron gastadas!`;
  }
}
