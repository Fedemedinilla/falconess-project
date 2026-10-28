/**
 * Numbers in Spanish style (decimal comma, thin grouping from five digits, "12,5 %"). The game
 * hands out integers in public units (×1000, per-mille, ticks); these helpers round them with
 * integer arithmetic first, like the CLI does, so the browser and the terminal show the same digits.
 */

const LOCALE = "es-ES";
const MINUS = "−";

const intFormat = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const fixedFormats = new Map<number, Intl.NumberFormat>();

function fixedFormat(decimals: number): Intl.NumberFormat {
  let f = fixedFormats.get(decimals);
  if (!f) {
    f = new Intl.NumberFormat(LOCALE, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    fixedFormats.set(decimals, f);
  }
  return f;
}

/** A typographic minus instead of the hyphen Intl writes. */
function withMinus(s: string): string {
  return s.replace("-", MINUS);
}

/** An integer: 7, 1200, 12.345, −3. */
export function formatInt(n: number): string {
  return withMinus(intFormat.format(n));
}

/**
 * `num / den` rounded half away from zero to `decimals` places, from integers only:
 * formatFixed(12345, 1000, 2) = "12,35".
 */
export function formatFixed(num: number, den: number, decimals: number): string {
  if (den === 0) throw new Error("formatFixed: zero denominator");
  let scale = 1;
  for (let i = 0; i < decimals; i++) scale *= 10;
  const n = Math.abs(num);
  const d = Math.abs(den);
  const q = Math.floor((2 * n * scale + d) / (2 * d));
  const negative = q !== 0 && num < 0 !== den < 0;
  return withMinus(fixedFormat(decimals).format((negative ? -q : q) / scale));
}

/** A change: "+12", "−3", "0". */
export function formatSigned(n: number): string {
  if (n === 0) return "0";
  return n > 0 ? `+${formatInt(n)}` : formatInt(n);
}

/** Per-mille as a percentage: formatPermille(125, 1) = "12,5 %". */
export function formatPermille(pm: number, decimals = 0): string {
  return `${formatFixed(pm, 10, decimals)} %`;
}

/** Ticks (15 per second) as seconds: formatSeconds(183, 1) = "12,2". */
export function formatSeconds(ticks: number, decimals = 1, tickHz = 15): string {
  return formatFixed(ticks, tickHz, decimals);
}
