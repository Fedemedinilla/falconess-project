import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getContent } from "../content/load";
import { ICONS, type IconName, moodIcon, placeIcon, SHARED_ICONS } from "./icons";

/** Emojis are presentation kept in ONE module: ui/icons.ts (concept → emoji). */
const SRC = fileURLToPath(new URL("..", import.meta.url));
const EMOJI = /\p{Emoji_Presentation}|️/u;

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sources(path, out);
    else if (/\.(tsx?|css)$/.test(name) && !name.endsWith(".test.ts")) out.push(path);
  }
  return out;
}

const graphemes = new Intl.Segmenter("es", { granularity: "grapheme" });

describe("icons", () => {
  it("keeps every emoji of the interface in ui/icons.ts", () => {
    const stray = sources(SRC)
      .filter((file) => !file.endsWith(join("ui", "icons.ts")))
      .filter((file) => EMOJI.test(readFileSync(file, "utf8")));
    expect(stray).toEqual([]);
  });

  it("keeps es.json free of emojis: texts are words, icons are presentation", () => {
    const withEmoji = [...getContent().text].filter(([, v]) => EMOJI.test(v)).map(([k]) => k);
    expect(withEmoji).toEqual([]);
  });

  it("maps each concept to one emoji", () => {
    for (const [name, glyph] of Object.entries(ICONS)) {
      expect(EMOJI.test(glyph), name).toBe(true);
      expect([...graphemes.segment(glyph)], name).toHaveLength(1);
    }
  });

  it("gives two concepts the same emoji only when they are meant to share it", () => {
    const byGlyph = new Map<string, IconName[]>();
    for (const [name, glyph] of Object.entries(ICONS) as [IconName, string][])
      byGlyph.set(glyph, [...(byGlyph.get(glyph) ?? []), name]);
    const allowed = SHARED_ICONS.map((group) => [...group].sort().join(" "));
    const shared = [...byGlyph.values()]
      .filter((names) => names.length > 1)
      .map((names) => [...names].sort().join(" "));
    expect(shared.sort()).toEqual([...allowed].sort());
  });

  it("follows the mood level and medals the podium", () => {
    expect(moodIcon(-2)).toBe("mood.-2");
    expect(moodIcon(2)).toBe("mood.2");
    expect(moodIcon(5)).toBe("mood.2");
    expect(placeIcon(1)).toBe("place.1");
    expect(placeIcon(3)).toBe("place.3");
    expect(placeIcon(4)).toBeUndefined();
  });
});
