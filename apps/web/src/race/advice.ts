/**
 * The post-race tips of `@falconess/race-view` (advice.ts) in the page's words, Umamusume style:
 * "¡Peregrina se quedó sin físico a los 1589 m! Quizás deberías entrenar Resistencia.", from the
 * `ui.advice.*` keys of es.json. The concept emojis come from the icon map; `AdviceNote` draws
 * them next to the words. Numbers are the tip's own, in Spanish style.
 */
import { type AdviceItem, type RaceLabels, raceAdvice } from "@falconess/race-view";
import type { RaceLog } from "@falconess/schema";
import type { Detail } from "../text/brief";
import { formatPermille } from "../text/format";
import { ui } from "../text/ui";
import { type IconName, statIcon } from "../ui/icons";
import { factor, metres, mps, secs, secsMilli, uiPlural, units } from "./words";

/** From this place on, the player is told what to train after a goal race (Umamusume). */
export const ADVICE_FROM_PLACE = 3;

/** One tip, worded: the exclamation, the stat or the workshop, and the log's numbers. */
export type AdviceWords = {
  /** The cause's concept. */
  readonly icon: IconName;
  /** "¡Peregrina se quedó sin físico a los 1589 m!" */
  readonly lead: string;
  /** The text around the target: "Quizás deberías entrenar " … "." */
  readonly before: string;
  readonly after: string;
  /** "Resistencia", "Taller", and its concept. */
  readonly target: string;
  readonly targetIcon: IconName;
  /** What the log shows: a brief line, or the full one with what the stat does. */
  readonly why: string;
};

const SLOT = "{stat}";

/** A text with `{stat}` left open, cut around it (the target is drawn with its emoji). */
function around(key: string): [string, string] {
  const text = ui(key);
  const i = text.indexOf(SLOT);
  return i < 0 ? [text, ""] : [text.slice(0, i), text.slice(i + SLOT.length)];
}

const PHASE_KEYS = ["start", "middle", "final"] as const;

/** The skills of a tip by name: "Último suspiro y Garra". */
function skillList(ids: readonly string[], labels: RaceLabels): string {
  const names = ids.map((id) => labels.skillName(id));
  const last = names.pop();
  return names.length === 0 ? (last ?? "") : `${names.join(", ")} y ${last ?? ""}`;
}

/** A per-mille with its sign: "+12", "−44", "0". */
const pmSigned = (pm: number) => (pm > 0 ? `+${pm}` : pm < 0 ? `−${-pm}` : "0");

/** The cause's emoji. */
export function adviceIcon(item: AdviceItem): IconName {
  switch (item.reason) {
    case "hpEmpty":
      return "flag.exhausted";
    case "cruise":
    case "start":
      return "advice.slow";
    case "stall":
      return "flag.stalled";
    case "landings":
      return "landing";
    case "overheat":
      return "flag.overheated";
    case "heatCapped":
      return "race.heat";
    case "pace":
      return "advice.pace";
    case "plan":
      return "sprintPlan";
    case "skills":
      return "skillMiss";
    case "broken":
      return "flag.broken";
    case "worn":
      return "race.durability";
  }
}

/** "¡Peregrina se quedó sin físico a los 1589 m!" */
export function adviceLead(item: AdviceItem, name: string, labels: RaceLabels): string {
  switch (item.reason) {
    case "hpEmpty":
      return ui(
        item.stat === "courage" ? "ui.advice.lead.hpEmpty.final" : "ui.advice.lead.hpEmpty",
        { name, at: metres(item.evidence.atMm) },
      );
    case "cruise":
      return ui("ui.advice.lead.cruise", { name });
    case "start":
      return ui("ui.advice.lead.start", { name });
    case "stall":
      return uiPlural("ui.advice.lead.stall", item.evidence.jumpsFailed, {
        name,
        s: secs(item.evidence.ticks),
      });
    case "landings":
      return ui("ui.advice.lead.landings", { name });
    case "overheat":
      return ui("ui.advice.lead.overheat", { name });
    case "heatCapped":
      return ui("ui.advice.lead.heatCapped", { name });
    case "pace":
      return ui("ui.advice.lead.pace", { name });
    case "plan":
      return ui("ui.advice.lead.plan", { name });
    case "skills":
      return uiPlural("ui.advice.lead.skills", item.evidence.skillIds.length, {
        skills: skillList(item.evidence.skillIds, labels),
      });
    case "broken":
      return item.evidence.atMm !== null
        ? ui("ui.advice.lead.broken.at", { name, at: metres(item.evidence.atMm) })
        : ui("ui.advice.lead.broken", { name });
    case "worn":
      return ui("ui.advice.lead.worn", { name });
  }
}

/** The tip's seconds (it has a time when the log gives one). */
const cost = (item: AdviceItem) => secsMilli(item.costMilli ?? 0, 2);

/** What the log shows, as a key with a brief variant or one short line, and its values. */
function whyKey(item: AdviceItem): { key: string; brief: boolean; vars: Record<string, string> } {
  const s = cost(item);
  switch (item.reason) {
    case "hpEmpty": {
      const e = item.evidence;
      return e.winnerAtMm === null
        ? { key: "ui.advice.why.hpEmpty.held", brief: true, vars: { rest: metres(e.restMm), s } }
        : {
            key: "ui.advice.why.hpEmpty",
            brief: true,
            vars: { rest: metres(e.restMm), winnerAt: metres(e.winnerAtMm), s },
          };
    }
    case "cruise": {
      const e = item.evidence;
      const vars = { agility: String(e.agility), winnerAgility: String(e.winnerAgility), s };
      return e.curvesMilli > 0
        ? {
            key: "ui.advice.why.cruise.curves",
            brief: true,
            vars: { ...vars, curves: secsMilli(e.curvesMilli, 2) },
          }
        : { key: "ui.advice.why.cruise", brief: true, vars };
    }
    case "start": {
      const e = item.evidence;
      return {
        key: "ui.advice.why.start",
        brief: true,
        vars: { s, accel: mps(e.accelMms2, 2), winnerAccel: mps(e.winnerAccelMms2, 2) },
      };
    }
    case "stall":
      return { key: "ui.advice.why.stall", brief: true, vars: {} };
    case "landings": {
      const e = item.evidence;
      return {
        key: "ui.advice.why.landings",
        brief: true,
        vars: {
          loss: mps(e.lossMms, 2),
          land: String(e.landPm),
          winnerLand: String(e.winnerLandPm),
        },
      };
    }
    case "overheat": {
      const e = item.evidence;
      return {
        key: "ui.advice.why.overheat",
        brief: false,
        vars: { s: secs(e.ticks), cap: units(e.heatCap) },
      };
    }
    case "heatCapped": {
      const e = item.evidence;
      return {
        key: "ui.advice.why.heatCapped",
        brief: true,
        vars: { at: metres(e.atMm), energy: units(e.energyLeft) },
      };
    }
    case "pace": {
      const e = item.evidence;
      return {
        key: "ui.advice.why.pace",
        brief: true,
        vars: {
          phase: ui(`ui.race.why.summary.phase.${PHASE_KEYS[e.phase] ?? "middle"}`),
          pace: pmSigned(e.pace[e.phase] ?? 0),
          winnerPace: pmSigned(e.winnerPace[e.phase] ?? 0),
          centre: pmSigned(e.centrePm),
          winnerCentre: pmSigned(e.winnerCentrePm),
          s,
        },
      };
    }
    case "plan": {
      const e = item.evidence;
      return {
        key: "ui.advice.why.plan",
        brief: true,
        vars: { energy: units(e.energyLeft), unseen: units(e.unseen) },
      };
    }
    case "skills": {
      const p = formatPermille(item.evidence.pAct);
      return item.costMilli === null
        ? { key: "ui.advice.why.skills", brief: false, vars: { p } }
        : { key: "ui.advice.why.skills.timed", brief: false, vars: { p, s } };
    }
    case "broken": {
      const e = item.evidence;
      const speed = factor(e.speedPm);
      if (item.costMilli === null)
        return { key: "ui.advice.why.broken", brief: false, vars: { speed } };
      return {
        key: e.atMm !== null ? "ui.advice.why.broken.at" : "ui.advice.why.broken.start",
        brief: false,
        vars: { speed, s },
      };
    }
    case "worn": {
      const e = item.evidence;
      return {
        key: "ui.advice.why.worn",
        brief: true,
        vars: { end: units(e.durabilityEnd), max: String(e.durabilityMax) },
      };
    }
  }
}

/** What the tip's stat does, said once after the full line. */
function howKey(item: AdviceItem): string {
  switch (item.reason) {
    case "hpEmpty":
      return item.stat === "courage" ? "ui.advice.how.hpEmpty.courage" : "ui.advice.how.hpEmpty";
    case "overheat":
    case "heatCapped":
      return "ui.advice.how.heat";
    case "broken":
    case "worn":
      return "ui.advice.how.workshop";
    default:
      return `ui.advice.how.${item.reason}`;
  }
}

/** The line under the tip: brief, or the full numbers and what the stat does. */
export function adviceWhy(item: AdviceItem, detail: Detail): string {
  const { key, brief, vars } = whyKey(item);
  if (detail === "brief") return ui(brief ? `${key}.brief` : key, vars);
  return `${ui(key, vars)} ${ui(howKey(item))}`;
}

/** A tip in words for runner `name`. */
export function adviceWords(
  item: AdviceItem,
  name: string,
  labels: RaceLabels,
  detail: Detail,
): AdviceWords {
  const [before, after] = around(
    item.stat === "workshop" ? "ui.advice.workshop" : "ui.advice.train",
  );
  return {
    icon: adviceIcon(item),
    lead: adviceLead(item, name, labels),
    before,
    after,
    target: labels.adviceStatName(item.stat),
    targetIcon: item.stat === "workshop" ? "action.workshop" : statIcon(item.stat),
    why: adviceWhy(item, detail),
  };
}

/** The tip as one line of text (no emojis): what a screen reader and the tests read. */
export function adviceSentence(w: AdviceWords): string {
  return `${w.lead} ${w.before}${w.target}${w.after}`;
}

/**
 * The tips the page shows for the runner in `lane`: race-view's `raceAdvice`, none for the
 * winner. `none` tells a runner who finished 3rd or worse that the log shows nothing to train.
 */
export function runnerAdvice(
  log: RaceLog,
  lane: number,
): { readonly items: readonly AdviceItem[]; readonly none: boolean } {
  const items = raceAdvice(log, lane);
  const place = log.results.find((r) => r.lane === lane)?.place ?? 1;
  return { items, none: items.length === 0 && place >= ADVICE_FROM_PLACE };
}
