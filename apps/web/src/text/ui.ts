/**
 * Every visible text comes from packages/content/text/<lang>.json (es.json is the source) (BRIEF section 2, rule 6): the
 * interface under `ui.*` keys, game names through their own `textKey`. The code holds keys only.
 */
import { getContent } from "../content/load";
import { interpolate, type TextVars } from "./interpolate";
import { locale, perLang } from "./lang";

export type { TextVars };

/** An interface text: `ui("ui.home.title")`, `ui("ui.top.week", { turn: 12, turns: 48 })`. */
export function ui(key: string, vars?: TextVars): string {
  return interpolate(getContent().t(key), vars);
}

const plural = perLang(() => new Intl.PluralRules(locale()));

/**
 * A count with its noun, from the keys `<key>.one` and `<key>.other`:
 * `uiCount("ui.count.decisions", 1)` = "1 decisión", with 2 "2 decisiones".
 */
export function uiCount(key: string, n: number): string {
  return ui(`${key}.${plural().select(n) === "one" ? "one" : "other"}`, { n });
}

/** A game text by its content key (`falconess.peregrina`, `course.ridge`...). */
export function gameText(textKey: string): string {
  return getContent().t(textKey);
}
