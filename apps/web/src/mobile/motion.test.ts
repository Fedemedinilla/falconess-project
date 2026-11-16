import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EMBLEM_MS, held, MOTION, outMs } from "./motion";

const HERE = dirname(fileURLToPath(import.meta.url));
const css = (file: string) => readFileSync(join(HERE, file), "utf8");

/** The body of the first `{…}` block after `at` (braces balanced), or undefined. */
function block(text: string, at: number): string | undefined {
  const open = text.indexOf("{", at);
  if (at < 0 || open < 0) return undefined;
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return text.slice(open + 1, i);
  }
  return undefined;
}

/** `--m-dur-*` declarations of a block, in ms by name. */
function durations(body: string | undefined): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of (body ?? "").matchAll(/(--m-dur-[a-z-]+):\s*(\d+)ms;/g))
    out.set(m[1] ?? "", Number(m[2]));
  return out;
}

/** `--m-dur-screen-major` → `screenMajor`. */
const twin = (name: string) =>
  name.slice("--m-dur-".length).replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

/** A keyframes body with its whitespace and comments squeezed out. */
function keyframes(text: string, name: string): string | undefined {
  const body = block(text, text.indexOf(`@keyframes ${name} `));
  return body
    ?.replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const motion = css("motion.css");
const root = durations(block(motion, motion.search(/^:root\s*\{/m)));
const reduce = durations(
  block(motion, motion.indexOf(":root", motion.indexOf("@media (prefers-reduced-motion: reduce)"))),
);

describe("motion tokens: motion.css and motion.ts agree", () => {
  it("every --m-dur-* of motion.css equals its MOTION twin", () => {
    expect(root.size).toBe(18);
    const values: Readonly<Record<string, number>> = MOTION;
    for (const [name, ms] of root) expect(values[twin(name)], name).toBe(ms);
  });
  it("reduced motion zeroes every duration but the press feedback", () => {
    expect([...reduce.keys()]).toEqual([...root.keys()].filter((k) => k !== "--m-dur-fast"));
    for (const [name, ms] of reduce) expect(ms, name).toBe(0);
  });
  // the parity check below is expected to fail; this keeps it failing for the right reason (two
  // bodies that differ), not because a stamp's keyframes went missing or the scan lost them
  it("both stamps have their keyframes, and the scan reads them", () => {
    for (const file of ["Mobile.module.css", "WeekFx.module.css"]) {
      const body = keyframes(css(file), "stampIn");
      expect(body, file).toMatch(/^0% \{.*\}$/);
      expect(body, file).toContain("scale(");
    }
  });
  // L11: the training's stamp and the week's effects' stamp are two keyframes today (CSS modules
  // scope them); 6.8 makes them one body, and this flips to `it`
  it.fails("the stamp lands the same on the training screen and in the week's effects", () => {
    const training = keyframes(css("Mobile.module.css"), "stampIn");
    const effects = keyframes(css("WeekFx.module.css"), "stampIn");
    expect(training).toBeDefined();
    expect(training).toBe(effects);
  });
});

describe("timer helpers", () => {
  it("the emblem's beat is its fade in and its full cover", () => {
    expect(EMBLEM_MS).toBe(1240);
  });
  it("a layer leaves in its own time, at once under reduced motion", () => {
    expect(outMs("fx", false)).toBe(MOTION.layerOut);
    expect(outMs("scene", false)).toBe(MOTION.sceneOut);
    expect(outMs("emblem", false)).toBe(MOTION.emblemOut);
    expect(outMs("event", false)).toBe(0);
    for (const kind of ["fx", "inspiration", "scene", "emblem", "event"] as const)
      expect(outMs(kind, true)).toBe(0);
  });
  it("Ritmo shortens a hold, never below its floor", () => {
    expect(held(MOTION.finishHold, "normal", MOTION.finishHoldMin)).toBe(1200);
    expect(held(MOTION.finishHold, "fast", MOTION.finishHoldMin)).toBe(720);
    expect(held(MOTION.finishHold, "direct", MOTION.finishHoldMin)).toBe(420);
    expect(held(1000, "direct", 400)).toBe(400);
    expect(held(1000, "direct")).toBe(350);
  });
});
