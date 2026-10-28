import { formatInt } from "./format";

export type TextVars = Readonly<Record<string, string | number>>;

/**
 * Fill `{name}` placeholders of an es.json text. Numbers are formatted in Spanish style; a
 * placeholder without a value stays as written, so a missing variable shows on screen.
 */
export function interpolate(template: string, vars?: TextVars): string {
  if (!vars) return template;
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (whole, name: string) => {
    const value = vars[name];
    if (value === undefined) return whole;
    return typeof value === "number" ? formatInt(value) : value;
  });
}
