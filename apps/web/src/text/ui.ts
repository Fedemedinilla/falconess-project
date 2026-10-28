/**
 * Every visible text comes from packages/content/text/es.json (BRIEF section 2, rule 6): the
 * interface under `ui.*` keys, game names through their own `textKey`. The code holds keys only.
 */
import { getContent } from "../content/load";
import { interpolate, type TextVars } from "./interpolate";

export type { TextVars };

/** An interface text: `ui("ui.home.title")`, `ui("ui.top.week", { turn: 12, turns: 48 })`. */
export function ui(key: string, vars?: TextVars): string {
  return interpolate(getContent().t(key), vars);
}

/** A game text by its content key (`falconess.peregrina`, `course.desert-ridge`...). */
export function gameText(textKey: string): string {
  return getContent().t(textKey);
}
