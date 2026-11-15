import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Timers are the game's clock, never an animation's end (plan §2.3, critic (c)2): under reduced
 * motion an animation may not run at all, Playwright's fake clock does not drive CSS, and a
 * background tab throttles them, so a flow step that waits for `animationend`, `transitionend`
 * or a WAAPI `finished` can stall. This scans the phone game, the shared UI and the flight replay.
 */
const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIRS = ["mobile", "ui", "race/flight"];

const RULES: readonly { readonly name: string; readonly re: RegExp }[] = [
  // onAnimationEnd, onTransitionEnd, "animationend", "transitioncancel", el.onanimationend…
  {
    name: "an animation or transition end event",
    re: /\b(on)?(animation|transition)(end|cancel)\b/i,
  },
  // anim.finished.then(…), await anim.finished, anim.onfinish = …
  { name: "a WAAPI finish", re: /\.(finished|onfinish)\b/ },
  { name: "a WAAPI finish event", re: /addEventListener\(\s*["']finish["']/ },
];

/** Each line of `text` that waits for an animation, with the rule it breaks. */
function waits(text: string): string[] {
  return text
    .split("\n")
    .flatMap((line, i) =>
      RULES.filter((r) => r.re.test(line)).map((r) => `${i + 1}: ${r.name}: ${line.trim()}`),
    );
}

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sources(p);
    return /\.tsx?$/.test(e.name) && !e.name.endsWith(".test.ts") ? [p] : [];
  });
}

describe("no flow step waits for an animation's end", () => {
  it("the phone game, the shared UI and the flight replay use timers only", () => {
    const files = DIRS.flatMap((d) => sources(join(SRC, d)));
    expect(files.length).toBeGreaterThan(20);
    const found = files.flatMap((p) =>
      waits(readFileSync(p, "utf8")).map((w) => `${relative(SRC, p)}:${w}`),
    );
    expect(found).toEqual([]);
  });
  it("the scan catches each way of waiting, and not the word «finished» in prose", () => {
    const bad = [
      "<div onAnimationEnd={done} />",
      "el.addEventListener('transitionend', done);",
      'el.addEventListener("animationcancel", done);',
      "void anim.finished.then(done);",
      "anim.onfinish = done;",
      'anim.addEventListener("finish", done);',
    ];
    for (const line of bad) expect(waits(line), line).toHaveLength(1);
    expect(waits("/** A story scene plays over the finished race. */")).toEqual([]);
    expect(waits("const finishHold = 1200;")).toEqual([]);
  });
});
