/**
 * Two lengths for the texts that explain a card: a brief one line for a casual look and the full
 * text for whoever min-maxes. Both live in es.json: the brief variant is the full key plus
 * `.brief` (`rule.pulse` → `rule.pulse.brief`, `ui.goals.consequence` →
 * `ui.goals.consequence.brief`). `brief.test.ts` checks every one exists and is shorter.
 */
import { getContent } from "../content/load";
import { type TextVars, ui } from "./ui";

/** How much a card explains. */
export type Detail = "brief" | "full";

/** The interface texts that have a `.brief` variant. */
export const BRIEF_UI_KEYS = [
  "ui.action.workshop.note",
  "ui.advice.why.cruise",
  "ui.advice.why.cruise.curves",
  "ui.advice.why.heatCapped",
  "ui.advice.why.hpEmpty",
  "ui.advice.why.hpEmpty.held",
  "ui.advice.why.landings",
  "ui.advice.why.pace",
  "ui.advice.why.plan",
  "ui.advice.why.stall",
  "ui.advice.why.start",
  "ui.advice.why.worn",
  "ui.frame.crew.text",
  "ui.frame.quirks.random",
  "ui.freeRace.neutral.note",
  "ui.freeRace.parts.note",
  "ui.freeRace.run.note",
  "ui.freeRace.skills.note",
  "ui.freeRace.turn.note",
  "ui.goals.consequence",
  "ui.hangar.crews.note",
  "ui.new.hangar.hint",
  "ui.new.runner.hint",
  "ui.race.gauge.legend.durability",
  "ui.race.gauge.legend.energy",
  "ui.race.gauge.legend.heat",
  "ui.race.gauge.legend.hp",
  "ui.race.guess.hint",
  "ui.race.legend.reserve",
  "ui.turn.actions.legend",
  "ui.turn.actions.legend.v2",
  "ui.workshop.parts.hint",
  "ui.workshop.quirks.hint",
  "ui.workshop.skills.hint",
] as const;

export type BriefUiKey = (typeof BRIEF_UI_KEYS)[number];

/** An interface text in the length asked: `<key>.brief` for "brief", `<key>` for "full". */
export function uiAt(detail: Detail, key: BriefUiKey, vars?: TextVars): string {
  return ui(detail === "brief" ? `${key}.brief` : key, vars);
}

/** The brief line of a game text (a skill, quirk, part or rule), when it has one. */
export function gameBrief(textKey: string): string | undefined {
  const content = getContent();
  const key = `${textKey}.brief`;
  return content.text.has(key) ? content.t(key) : undefined;
}
