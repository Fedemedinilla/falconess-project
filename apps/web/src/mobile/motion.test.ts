import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FX } from "./flow/fxTimeline";
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
  // the parity check below compares what the scan reads: it must read both stamps' keyframes
  it("both stamps have their keyframes, and the scan reads them", () => {
    for (const file of ["Mobile.module.css", "WeekFx.module.css"]) {
      const body = keyframes(css(file), "stampIn");
      expect(body, file).toMatch(/^0% \{.*\}$/);
      expect(body, file).toContain("scale(");
    }
  });
  // L11: the training's stamp and the week's effects' stamp are two keyframes (CSS modules scope
  // them), with one body
  it("the stamp lands the same on the training screen and in the week's effects", () => {
    const training = keyframes(css("Mobile.module.css"), "stampIn");
    const effects = keyframes(css("WeekFx.module.css"), "stampIn");
    expect(training).toBeDefined();
    expect(training).toBe(effects);
  });
});

// --- one reduced-motion policy (plan §2.4, M7) --------------------------------------------------

/** One rule of a stylesheet: its selectors, its declarations, and the `@media` it sits in. */
type Rule = {
  readonly selectors: readonly string[];
  readonly decls: ReadonlyMap<string, string>;
  readonly media: string;
};

/** A selector list split at its top-level commas (`:not(a, b)` stays whole). */
function selectorsOf(prelude: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < prelude.length; i++) {
    const c = prelude[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === "," && depth === 0) {
      out.push(prelude.slice(from, i));
      from = i + 1;
    }
  }
  out.push(prelude.slice(from));
  return out.map((sel) => sel.replace(/\s+/g, " ").trim()).filter((sel) => sel !== "");
}

/** A block's declarations, by property, their values on one line. */
function declsOf(body: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const decl of body.split(";")) {
    const colon = decl.indexOf(":");
    if (colon < 0) continue;
    out.set(
      decl.slice(0, colon).trim(),
      decl
        .slice(colon + 1)
        .replace(/\s+/g, " ")
        .trim(),
    );
  }
  return out;
}

/** Every style rule of `text` (comments out, keyframes skipped, `@media` blocks entered). */
function rulesOf(text: string, media = ""): Rule[] {
  const src = text.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Rule[] = [];
  let at = 0;
  for (;;) {
    const open = src.indexOf("{", at);
    if (open < 0) return out;
    const prelude = src.slice(at, open).trim();
    const body = block(src, open) ?? "";
    at = open + body.length + 2;
    if (prelude.startsWith("@media")) out.push(...rulesOf(body, `${media} ${prelude}`.trim()));
    else if (!prelude.startsWith("@"))
      out.push({ selectors: selectorsOf(prelude), decls: declsOf(body), media });
  }
}

const MODULES = readdirSync(HERE).filter((f) => f.endsWith(".module.css"));
const REDUCED = "prefers-reduced-motion: reduce";

/** A transition kept under reduced motion: an opacity fade, or press feedback (≤ 120 ms). */
function gentle(transition: string): boolean {
  return selectorsOf(transition).every((one) => {
    const ms = [...one.matchAll(/(\d*\.?\d+)(ms|s)\b/g)].map((m) =>
      m[2] === "s" ? Number(m[1]) * 1000 : Number(m[1]),
    );
    return one.startsWith("opacity ") || (ms[0] ?? 0) <= MOTION.fast;
  });
}

/**
 * The animated rules that need no reduced-motion rule of their own, and why (file and selector).
 * Anything else that moves has one, at the same specificity (the same selector), turning it off.
 */
const NO_RULE: Readonly<Record<string, string>> = {
  // a leaving copy: under reduced motion a layer leaves at once (outMs 0), none is ever drawn
  "WeekFx.module.css .layer.out": "a leaving copy",
  "Inspiration.module.css .overlay.out": "a leaving copy",
  "Transition.module.css .cover.out": "a leaving copy",
  "Story.module.css .leaving": "a leaving copy",
  // drawn inside something reduced motion hides (display: none)
  "WeekFx.module.css .chev": "inside .arrows",
  "WeekFx.module.css .bad .chev": "inside .arrows",
  "Mobile.module.css .chev": "inside .popArrows",
  "Mobile.module.css .popDown .chev": "inside .popArrows",
  "Transition.module.css .line": "inside .cover (the emblem never plays: the enter beat)",
  "Transition.module.css .rise": "inside .cover",
  "Transition.module.css .coin": "inside .cover",
};

describe("one reduced-motion policy (plan §2.4, M7)", () => {
  const all = MODULES.map((file) => ({ file, rules: rulesOf(css(file)) }));
  it("reads every phone module", () => {
    expect(MODULES).toContain("Mobile.module.css");
    expect(MODULES.length).toBeGreaterThanOrEqual(7);
  });
  it("everything that moves stops under reduced motion, by a rule of the same specificity", () => {
    const missing: string[] = [];
    for (const { file, rules } of all) {
      const reduced = rules.filter((r) => r.media.includes(REDUCED));
      const stops = (sel: string, prop: "animation" | "transition") =>
        reduced.some(
          (r) =>
            r.selectors.includes(sel) &&
            (r.decls.get("display") === "none" ||
              (prop === "animation"
                ? r.decls.get("animation") === "none"
                : r.decls.get("transition") === "none" || gentle(r.decls.get("transition") ?? ""))),
        );
      for (const r of rules) {
        // what plays only when nothing is reduced needs nothing
        if (r.media.includes("prefers-reduced-motion")) continue;
        const animation = r.decls.get("animation") ?? r.decls.get("animation-name");
        const transition = r.decls.get("transition");
        for (const sel of r.selectors) {
          if (NO_RULE[`${file} ${sel}`]) continue;
          if (animation !== undefined && animation !== "none" && !stops(sel, "animation"))
            missing.push(`${file} ${sel} (animation: ${animation})`);
          if (transition !== undefined && !gentle(transition) && !stops(sel, "transition"))
            missing.push(`${file} ${sel} (transition: ${transition})`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
  it("loops and entrances are off, never shortened (no 0.01 ms), and nothing is !important", () => {
    for (const { file, rules } of all)
      for (const r of rules.filter((x) => x.media.includes(REDUCED)))
        for (const [prop, value] of r.decls) {
          expect(prop, `${file} ${r.selectors.join(", ")}`).not.toMatch(
            /^animation-(duration|delay)$/,
          );
          expect(value, `${file} ${r.selectors.join(", ")}`).not.toContain("!important");
        }
  });
  it("every exception names a rule that still exists", () => {
    for (const key of Object.keys(NO_RULE)) {
      const [file = "", ...rest] = key.split(" ");
      const sel = rest.join(" ");
      expect(
        all.find((m) => m.file === file)?.rules.some((r) => r.selectors.includes(sel)),
        key,
      ).toBe(true);
    }
  });
});

// --- a hidden tab (6.11, critic b: two clocks) ------------------------------------------------

/** A selector's specificity: [ids, classes, attributes and pseudo-classes, elements]. */
function specificity(selector: string): readonly [number, number, number] {
  const sel = selector
    .replace(/::[a-z-]+/g, "")
    .replace(/:where\([^)]*\)/g, "")
    .replace(/:(not|is)\(/g, " ")
    .replace(/\)/g, " ");
  const ids = sel.match(/#[\w-]+/g)?.length ?? 0;
  const classes =
    (sel.match(/\.[\w-]+/g)?.length ?? 0) +
    (sel.match(/\[[^\]]*\]/g)?.length ?? 0) +
    (sel.match(/:[\w-]+/g)?.length ?? 0);
  const elements = sel.replace(/\[[^\]]*\]/g, "").match(/(^|[\s>+~])[a-z][\w-]*/gi)?.length ?? 0;
  return [ids, classes, elements];
}

/** Whether specificity `a` is at least `b`'s. */
function atLeast(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  return true;
}

describe("a hidden tab (6.11, critic b: two clocks)", () => {
  /** The game's column while the tab is hidden: everything in it, and its ::before and ::after. */
  const PAUSE = ".app[data-app][data-hidden] *";
  const all = MODULES.map((file) => ({ file, rules: rulesOf(css(file)) }));
  it("reads selectors as the browser ranks them", () => {
    expect(specificity(PAUSE)).toEqual([0, 3, 0]);
    expect(specificity(".app .sel::before")).toEqual([0, 2, 0]);
    expect(specificity(".sheet[open]::backdrop")).toEqual([0, 2, 0]);
    expect(specificity(".dots i")).toEqual([0, 1, 1]);
    expect(specificity(".app:not(.appDesk)")).toEqual([0, 2, 0]);
    expect(specificity(":where(.app) button")).toEqual([0, 0, 1]);
  });
  it("the game's CSS stops with its timers: every animation in the column, and its ::before and ::after", () => {
    const mobile = all.find((m) => m.file === "Mobile.module.css")?.rules ?? [];
    for (const sel of [PAUSE, `${PAUSE}::before`, `${PAUSE}::after`])
      expect(
        mobile.some(
          (r) =>
            r.media === "" &&
            r.selectors.includes(sel) &&
            r.decls.get("animation-play-state") === "paused",
        ),
        sel,
      ).toBe(true);
  });
  it("and it outranks every rule that sets an animation (the shorthand would set it running again)", () => {
    const pause = specificity(PAUSE);
    const louder: string[] = [];
    for (const { file, rules } of all)
      for (const r of rules)
        if (r.decls.has("animation") || r.decls.has("animation-play-state"))
          for (const sel of r.selectors)
            if (!sel.includes("[data-hidden]") && atLeast(specificity(sel), pause))
              louder.push(`${file} ${sel}`);
    expect(louder).toEqual([]);
  });
});

// --- the week's effects: their timeline and their CSS (6.7, 7.3) ------------------------------

/** An animation's length in ms, from its shorthand (`skillIn 0.45s …`): its first time. */
function lengthOf(animation: string | undefined, name: string): number | undefined {
  const one = selectorsOf(animation ?? "").find((a) => a.startsWith(`${name} `));
  const m = one?.match(/(\d*\.?\d+)(ms|s)\b/);
  return m ? (m[2] === "s" ? Number(m[1]) * 1000 : Number(m[1])) : undefined;
}

/** A keyframes body's stops: each offset (0-1) with its declarations. */
function stopsOf(body: string | undefined): { at: number; decls: Map<string, string> }[] {
  const out: { at: number; decls: Map<string, string> }[] = [];
  for (const m of (body ?? "").matchAll(/([\d.%,\s]+|from|to)\{([^}]*)\}/g))
    for (const at of selectorsOf(m[1] ?? ""))
      out.push({
        at: at === "from" ? 0 : at === "to" ? 1 : Number(at.replace("%", "")) / 100,
        decls: declsOf(m[2] ?? ""),
      });
  return out.sort((a, b) => a.at - b.at);
}

describe("the week's effects: fxTimeline and WeekFx.module.css agree", () => {
  const weekFx = css("WeekFx.module.css");
  const rules = rulesOf(weekFx).filter((r) => r.media === "");
  const animationOf = (sel: string) =>
    rules.find((r) => r.selectors.includes(sel))?.decls.get("animation");
  it("the scrim fades in on the layers' tokens (plan §2.1: 240 ms, «fx scrim»)", () => {
    expect(animationOf(".layer")).toBe("layerIn var(--m-dur-layer-in) var(--m-ease-out) both");
  });
  it("a learned skill's card pops in FX.skillIn, as its keyframes play", () => {
    expect(lengthOf(animationOf(".skill"), "skillIn")).toBe(FX.skillIn);
  });
  it("an effect starts fading at FX.fadeAt of its time, as fxShow does", () => {
    const stops = stopsOf(keyframes(weekFx, "fxShow"));
    expect(stops.at(-1)).toMatchObject({ at: 1 });
    expect(stops.at(-1)?.decls.get("opacity")).toBe("0");
    // the last stop still whole: where the fade out begins
    const whole = stops.filter((s) => s.decls.get("opacity") === "1").at(-1);
    expect(whole?.at).toBe(FX.fadeAt);
  });
});

/** A CSS `cubic-bezier(x1, y1, x2, y2)`'s progress at time `t` (0-1). */
function bezierAt(x1: number, y1: number, x2: number, y2: number, t: number): number {
  const at = (a: number, b: number, s: number) =>
    3 * (1 - s) * (1 - s) * s * a + 3 * (1 - s) * s * s * b + s * s * s;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 60; i++) {
    const s = (lo + hi) / 2;
    if (at(x1, x2, s) < t) lo = s;
    else hi = s;
  }
  return at(y1, y2, (lo + hi) / 2);
}

describe("the exits' curve (final review P1)", () => {
  // a leaving copy and a closing sheet go when their fade's time is up: a curve that ends steep
  // (cubic-bezier(0.55, 0, 1, 0.45) ended vertical) leaves them at ≈ 0.4 in their last frame, and
  // they cut out instead of fading
  it("a fade out on --m-ease-in has at most 15 % left a frame before its end", () => {
    const decl = /--m-ease-in:\s*cubic-bezier\(([^)]*)\);/.exec(motion)?.[1];
    const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = (decl ?? "").split(",").map(Number);
    expect(decl).toBeDefined();
    for (const ms of [MOTION.layerOut, MOTION.sheetOut]) {
      const left = 1 - bezierAt(x1, y1, x2, y2, 1 - 16.7 / ms);
      expect(left, `${ms} ms`).toBeLessThanOrEqual(0.15);
    }
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
