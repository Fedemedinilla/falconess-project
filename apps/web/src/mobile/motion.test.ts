import { readdirSync, readFileSync } from "node:fs";
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
