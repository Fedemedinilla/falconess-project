import type { GeneratedName } from "./generate.js";

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** CSV with an empty `favorite` column to mark by hand (or in a spreadsheet). */
export function toCsv(names: readonly GeneratedName[]): string {
  const header = ["favorite", "name", "house", "first", "second", "first_world", "second_world"];
  const rows = names.map((n) =>
    ["", n.name, n.house ?? "", n.first, n.second, n.firstWorld, n.secondWorld].map(csvCell),
  );
  return `${[header, ...rows].map((r) => r.join(",")).join("\n")}\n`;
}

/** Markdown checklist: tick `[x]` next to the favourites. */
export function toMarkdown(names: readonly GeneratedName[], title: string): string {
  const lines = names.map((n) => `- [ ] ${n.name} _(${n.firstWorld} + ${n.secondWorld})_`);
  return `# ${title}\n\n${lines.join("\n")}\n`;
}
