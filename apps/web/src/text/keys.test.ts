import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { STAT_ORDER } from "@falconess/sim";
import { describe, expect, it } from "vitest";
import { getContent } from "../content/load";
import { GAME_ERROR_KINDS } from "../game/controller";
import { uiCount } from "./ui";

/**
 * Every text the interface shows is an es.json key (BRIEF section 2, rule 6). This finds the
 * static `ui.*` keys in the sources and checks they exist; keys built at run time are checked by
 * family below.
 */
const SRC = fileURLToPath(new URL("..", import.meta.url));

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sources(path, out);
    else if (/\.tsx?$/.test(name) && !name.endsWith(".test.ts")) out.push(path);
  }
  return out;
}

const content = getContent();

describe("ui text keys", () => {
  it("every static ui.* key in the sources exists in es.json", () => {
    const missing: string[] = [];
    for (const file of sources(SRC)) {
      for (const m of readFileSync(file, "utf8").matchAll(/["'`](ui\.[A-Za-z0-9_.:-]+)["'`]/g)) {
        const key = m[1] ?? "";
        const counted = content.text.has(`${key}.one`) && content.text.has(`${key}.other`);
        if (!content.text.has(key) && !counted) missing.push(`${file}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("has a message for every game error and a short name for every stat", () => {
    for (const kind of GAME_ERROR_KINDS)
      expect(content.text.has(`ui.error.${kind}`), kind).toBe(true);
    for (const stat of STAT_ORDER)
      expect(content.text.has(`ui.stat.abbr.${stat}`), stat).toBe(true);
    for (const code of ["pt0", "pt1", "pt2"]) {
      expect(content.text.has(`ui.home.tests.${code}`)).toBe(true);
      expect(content.text.has(`ui.home.tests.${code}.code`)).toBe(true);
    }
  });

  it("writes counts in the singular or the plural", () => {
    expect(uiCount("ui.count.decisions", 1)).toBe("1 decisión");
    expect(uiCount("ui.count.decisions", 0)).toBe("0 decisiones");
    expect(uiCount("ui.count.decisions", 47)).toBe("47 decisiones");
  });
});
