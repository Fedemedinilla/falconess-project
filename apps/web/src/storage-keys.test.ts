import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SEEN_KEY } from "./game/storage";

/**
 * The browser keys the web app stores under (rules item 80): a renamed key loses what players
 * kept (their run, the scenes they saw, their settings), so every key string is pinned here. A
 * new key goes in on purpose, with the snapshot.
 */
const SRC = dirname(fileURLToPath(import.meta.url));
const KEY = /"falconess\.(juego|pruebas)\.[a-z-]+"|"falconess\.lang"/g;
/**
 * A key built at run time, which the snapshot cannot see: a template literal, or a quoted prefix
 * ending at its dot that something is added to (`"falconess.juego." + name`).
 */
const BUILT = /`falconess\.(juego|pruebas|lang)|["']falconess\.((juego|pruebas)\.)?["']/;

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sources(p);
    return /\.tsx?$/.test(e.name) && !e.name.endsWith(".test.ts") ? [p] : [];
  });
}

const files = sources(SRC).map((p) => ({ path: relative(SRC, p), text: readFileSync(p, "utf8") }));

describe("the browser's storage keys", () => {
  it("are these strings, each written once", () => {
    const keys = files.flatMap((f) => [...f.text.matchAll(KEY)].map((m) => m[0].slice(1, -1)));
    keys.sort();
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toMatchInlineSnapshot(`
      [
        "falconess.juego.cajas",
        "falconess.juego.chat",
        "falconess.juego.guia",
        "falconess.juego.herencia",
        "falconess.juego.historia",
        "falconess.juego.musica",
        "falconess.juego.ritmo",
        "falconess.juego.semana",
        "falconess.juego.sonido",
        "falconess.juego.temporadas",
        "falconess.juego.velocidad",
        "falconess.lang",
        "falconess.pruebas.explicaciones",
        "falconess.pruebas.partida",
        "falconess.pruebas.sonda",
        "falconess.pruebas.tema",
        "falconess.pruebas.vista",
      ]
    `);
  });
  it("are never built at run time", () => {
    const built = files.filter((f) => BUILT.test(f.text));
    expect(built.map((f) => f.path)).toEqual([]);
  });
  it("the scan catches each way of building one, and not a text key", () => {
    // a template's `${` written apart, so the samples stay plain strings
    const $ = "$";
    for (const line of [
      `const k = \`falconess.juego.${$}{name}\`;`,
      'const k = "falconess.juego." + name;',
      "const k = 'falconess.pruebas.' + name;",
      'const k = "falconess." + area + "." + name;',
    ])
      expect(BUILT.test(line), line).toBe(true);
    for (const line of [
      'const k = "falconess.juego.ritmo";',
      `gameText(\`falconess.${$}{state.falconessId}\`);`,
      'ui("falconess.peregrina");',
    ])
      expect(BUILT.test(line), line).toBe(false);
  });
  it("keep the scenes seen apart from the controller's read step (two SEEN_KEYs today)", () => {
    const story = files.find((f) => f.path === join("mobile", "storyModel.ts"));
    const scenes = story?.text.match(/const (?:SEEN_KEY|STORY_KEY) = "([^"]+)"/)?.[1];
    expect(scenes).toBe("falconess.juego.historia");
    expect(scenes).not.toBe(SEEN_KEY);
  });
});
