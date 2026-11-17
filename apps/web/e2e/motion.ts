import { expect, type Page } from "@playwright/test";

/**
 * Motion helpers for the phone game's e2e (plan-final §2.8): what one frame of #juego holds, CSS
 * animations frozen at a moment, opacity as the eye sees it, and how much of the game a layer
 * covers. Playwright counts an element at opacity 0 as visible, so "seen" goes through
 * `opacityOf`; the fake clock drives timers but not CSS, so moments go through `freezeAt`.
 */

/** One rule broken by a frame of #juego: one element per id, one screen, one layer «in». */
export type FrameIssue =
  /** An id on more than one element; `where` names each one. */
  | { readonly kind: "id"; readonly id: string; readonly where: readonly string[] }
  /** More than one `[data-screen]` at once. */
  | { readonly kind: "screen"; readonly where: readonly string[] }
  /** More than one `[data-layer-phase="in"]` at once. */
  | { readonly kind: "layer"; readonly where: readonly string[] };

/**
 * The rules the document breaks right now, sorted (the same document gives the same list).
 *
 * It runs in the page, as the frame probe's scan (its init script is built from this function's
 * source) and through `page.evaluate`, so it is self-contained: no imports, no outer names.
 * Each element is named by itself and its nearest landmarks (an id, `data-app`, `data-screen`,
 * `data-layer`, a `<dialog>`), outermost first: `dialog#m-menu-dialogo[open] › button#m-sonido`.
 */
export function frameIssues(): FrameIssue[] {
  const ATTRS = ["data-app", "data-screen", "data-layer", "data-layer-phase", "data-scene"];
  const label = (el: Element): string => {
    let text = el.tagName.toLowerCase();
    if (el.id) text += `#${el.id}`;
    for (const name of ATTRS) {
      const value = el.getAttribute(name);
      if (value !== null) text += value === "" ? `[${name}]` : `[${name}="${value}"]`;
    }
    if (el instanceof HTMLDialogElement && el.open) text += "[open]";
    return text;
  };
  const landmark = (el: Element): boolean =>
    el.id !== "" || el.tagName === "DIALOG" || ATTRS.some((name) => el.hasAttribute(name));
  const where = (el: Element): string => {
    const parts = [label(el)];
    for (let up = el.parentElement; up && parts.length < 4; up = up.parentElement)
      if (landmark(up)) parts.unshift(label(up));
    return parts.join(" › ");
  };
  const issues: FrameIssue[] = [];
  const byId = new Map<string, Element[]>();
  for (const el of document.querySelectorAll("[id]")) {
    if (el.id === "") continue;
    const list = byId.get(el.id);
    if (list) list.push(el);
    else byId.set(el.id, [el]);
  }
  for (const [id, els] of [...byId].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    if (els.length > 1) issues.push({ kind: "id", id, where: els.map(where) });
  const screens = [...document.querySelectorAll("[data-screen]")];
  if (screens.length > 1) issues.push({ kind: "screen", where: screens.map(where) });
  const layers = [...document.querySelectorAll('[data-layer-phase="in"]')];
  if (layers.length > 1) issues.push({ kind: "layer", where: layers.map(where) });
  return issues;
}

/** One issue in words, for a failure message. */
export function describeIssue(issue: FrameIssue): string {
  const list = issue.where.map((w) => `\n      ${w}`).join("");
  switch (issue.kind) {
    case "id":
      return `id "${issue.id}" on ${issue.where.length} elements:${list}`;
    case "screen":
      return `${issue.where.length} screens at once ([data-screen]):${list}`;
    case "layer":
      return `${issue.where.length} layers «in» at once ([data-layer-phase="in"]):${list}`;
  }
}

/** Fails at once, naming each id that is on more than one element right now. */
export async function expectUniqueIds(page: Page): Promise<void> {
  const dupes = (await page.evaluate(frameIssues)).filter((issue) => issue.kind === "id");
  if (dupes.length > 0)
    throw new Error(
      `duplicate ids on the page (${page.url()}):\n  ${dupes.map(describeIssue).join("\n  ")}`,
    );
}

/**
 * Every animation of the document paused at `ms` after its own start (CSS animations and
 * transitions, and Web Animations): the CSS side of a moment, which `page.clock` cannot drive.
 * Only right for the animations that started together (the ones the same commit mounted).
 */
export async function freezeAt(page: Page, ms: number): Promise<void> {
  await page.evaluate((at) => {
    for (const a of document.getAnimations()) {
      a.pause();
      a.currentTime = at;
    }
  }, ms);
}

/**
 * Holds every CSS animation where it starts, from now on (a style that pauses them all), so what a
 * tap mounts can be read with `freezeAt` however slow the page is: the fake clock drives the
 * timers, never the CSS, and a fade can end before a later `freezeAt` reaches it (final review C7).
 */
export async function holdAnimations(page: Page): Promise<void> {
  await page.evaluate(() => {
    const style = document.createElement("style");
    style.setAttribute("data-hold-animations", "");
    style.textContent = "*, *::before, *::after { animation-play-state: paused !important; }";
    document.head.append(style);
  });
}

/** The opacity an element shows: the product of the computed opacities up its ancestors. */
export async function opacityOf(page: Page, selector: string): Promise<number> {
  return page.locator(selector).evaluate((el) => {
    let opacity = 1;
    for (let e: Element | null = el; e; e = e.parentElement)
      opacity *= Number(getComputedStyle(e).opacity);
    return opacity;
  });
}

/** What a 5 × 9 grid of points over the game shows (`coverage`). */
export type Coverage = {
  /** Points where the first opaque paint is `selector`'s, with nothing else painted over it. */
  readonly covered: number;
  readonly points: number;
  /** Each other point: where it is, what shows there, and why it does not count. */
  readonly misses: readonly string[];
};

/**
 * Whether `selector` covers the game: at each point of a 5 × 9 grid over the game's column
 * (`[data-app]`, clipped to the viewport; the viewport without it), what the player sees must be
 * `selector`'s own opaque paint. The point's stack (`document.elementsFromPoint`, read with every
 * element taking pointers for the scan, so what paints but takes no tap counts: a scene's veil) is
 * read from the top down to its first opaque paint (a background colour at full alpha, every
 * ancestor at opacity 1): that paint must be inside `selector`, and nothing outside it may paint
 * over it. A transparent box (a full-screen button, a wrapper) shows nothing and is looked through,
 * so a scene's stage button does not stand for its black (final review C2); what paints only in
 * part (an image, a gradient, text, a fading box) inside `selector` is looked through too.
 * `under` names what to look under (a leaving copy in front: what it uncovers). Rule 10 (a scene
 * starts on opaque black) and rule 11 (nothing of the race card under the emblem) are checked with
 * it.
 */
export async function coverage(
  page: Page,
  selector: string,
  options: { readonly under?: string } = {},
): Promise<Coverage> {
  return page.evaluate(coverageNow, [selector, options.under ?? ""] as const);
}

/**
 * `coverage`'s page side: what the grid over the game shows right now, for `sel`, looking under
 * `under` (empty: nothing). Self-contained (no imports, no outer names), like `frameIssues`, so an
 * init script can carry it too (`e2e/mobile-season.spec.ts` reads it at a scene's first commit).
 */
export function coverageNow([sel, under]: readonly [string, string]): Coverage {
  const scan = document.createElement("style");
  scan.textContent = "*, *::before, *::after { pointer-events: auto !important; }";
  document.head.append(scan);
  const app = document.querySelector("[data-app]")?.getBoundingClientRect();
  const left = Math.max(0, app?.left ?? 0);
  const top = Math.max(0, app?.top ?? 0);
  const right = Math.min(window.innerWidth, app?.right ?? window.innerWidth);
  const bottom = Math.min(window.innerHeight, app?.bottom ?? window.innerHeight);
  const name = (el: Element): string => {
    const cls = el.getAttribute("class")?.split(/\s+/)[0];
    return el.tagName.toLowerCase() + (el.id ? `#${el.id}` : "") + (cls ? `.${cls}` : "");
  };
  /** The opacity it shows at, with the element that fades it most. */
  const seen = (el: Element): { opacity: number; by: Element } => {
    let opacity = 1;
    let by = el;
    let least = 1;
    for (let e: Element | null = el; e; e = e.parentElement) {
      const o = Number(getComputedStyle(e).opacity);
      opacity *= o;
      if (o < least) {
        least = o;
        by = e;
      }
    }
    return { opacity, by };
  };
  /** A computed colour's alpha (0-1). */
  const alpha = (color: string): number => {
    if (color === "transparent") return 0;
    const slash = /\/\s*([\d.]+)(%?)\s*\)$/.exec(color);
    if (slash) return Number(slash[1]) / (slash[2] ? 100 : 1);
    const rgba = /^rgba\((?:[^,]+,){3}\s*([\d.]+)\)$/.exec(color);
    return rgba ? Number(rgba[1]) : 1;
  };
  /** Whether it paints anything of its own: a background, an image, a canvas, or its text. */
  const paints = (el: Element): boolean => {
    const style = getComputedStyle(el);
    if (alpha(style.backgroundColor) > 0 || style.backgroundImage !== "none") return true;
    if (/^(img|canvas|video|svg)$/i.test(el.tagName)) return true;
    return [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? "").trim());
  };
  const misses: string[] = [];
  let covered = 0;
  for (let i = 0; i < 5; i++)
    for (let j = 0; j < 9; j++) {
      const x = Math.round(left + ((i + 0.5) * (right - left)) / 5);
      const y = Math.round(top + ((j + 0.5) * (bottom - top)) / 9);
      const at = `(${x}, ${y})`;
      let miss: string | undefined = `${at}: nothing`;
      let faded: string | undefined;
      for (const el of document.elementsFromPoint(x, y)) {
        if (under && el.closest(under)) continue;
        const { opacity, by } = seen(el);
        if (opacity === 0 || !paints(el)) continue;
        if (!el.closest(sel)) {
          miss = `${at}: ${name(el)}, outside ${sel}${faded ? `, under ${faded}` : ""}`;
          break;
        }
        if (opacity >= 0.999 && alpha(getComputedStyle(el).backgroundColor) >= 0.999) {
          miss = undefined;
          break;
        }
        // a part of it that shows only in part: what is under it shows through
        if (opacity < 0.999) faded ??= `${name(by)} at opacity ${Number(opacity.toFixed(3))}`;
      }
      if (miss === undefined) covered++;
      else misses.push(miss);
    }
  scan.remove();
  return { covered, points: 45, misses };
}

/** Lets the page's own updates land (React commits on a posted message, a timer's too). */
export async function settleUpdates(page: Page): Promise<void> {
  await page.evaluate(async () => {
    for (let i = 0; i < 3; i++)
      await new Promise<void>((done) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = () => done();
        channel.port2.postMessage(0);
      });
  });
}

/**
 * Holds the fake clock still (a little ahead of now): timers run only as the test moves it on.
 * The clock flows while the call travels (a slow dev build can take longer than the lead): aim
 * again if it got there first.
 */
export async function holdClock(page: Page): Promise<void> {
  for (let tries = 0; ; tries++)
    try {
      await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
      return;
    } catch (error) {
      if (tries >= 4 || !String(error).includes("past")) throw error;
    }
}

/**
 * What moves inside `scope` right now (reduced motion's check, plan §2.4): every running CSS
 * animation and Web Animation, and every running CSS transition of anything but opacity, as
 * `element name`. Press feedback (a transition of `--m-dur-fast`'s length or less, the answer to
 * the finger's own touch) is not counted. Paused or finished animations do not move.
 */
export async function movingNow(page: Page, scope = "[data-app]"): Promise<string[]> {
  return page.evaluate((sel) => {
    const PRESS_MS = 120;
    const name = (el: Element): string => {
      const cls = el.getAttribute("class")?.split(/\s+/)[0];
      return el.tagName.toLowerCase() + (el.id ? `#${el.id}` : "") + (cls ? `.${cls}` : "");
    };
    const out: string[] = [];
    for (const a of document.getAnimations()) {
      if (a.playState !== "running") continue;
      const target = a.effect instanceof KeyframeEffect ? a.effect.target : null;
      if (!target?.closest(sel)) continue;
      if (a instanceof CSSAnimation) out.push(`${name(target)} ${a.animationName}`);
      else if (a instanceof CSSTransition) {
        const ms = Number(a.effect?.getTiming().duration ?? 0);
        if (a.transitionProperty !== "opacity" && ms > PRESS_MS)
          out.push(`${name(target)} ${a.transitionProperty}`);
      } else out.push(`${name(target)} animate()`);
    }
    return out.sort();
  }, scope);
}

/**
 * The tab hidden, or shown again (6.11): `document.hidden` and `document.visibilityState` read
 * as the browser sets them for a tab in the background, and `visibilitychange` fires, as when the
 * player switches tabs or locks the phone. Playwright cannot hide a page, so it goes on drawing
 * frames: only what reads these sees the hidden tab (the game's flow timers and its CSS do).
 */
export async function setTabHidden(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((h) => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => h });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => (h ? "hidden" : "visible"),
    });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
}

/**
 * The CSS animations inside `scope`, by the play state each element (and its `::before` and
 * `::after`) computes: what runs, as `element name`, and how many stand paused. A finished
 * animation still computes its play state, so this reads the rule, not the moment.
 */
export async function cssPlayStates(
  page: Page,
  scope = "[data-app]",
): Promise<{ readonly running: readonly string[]; readonly paused: number }> {
  return page.evaluate((sel) => {
    const name = (el: Element): string => {
      const cls = el.getAttribute("class")?.split(/\s+/)[0];
      return el.tagName.toLowerCase() + (el.id ? `#${el.id}` : "") + (cls ? `.${cls}` : "");
    };
    const running: string[] = [];
    let paused = 0;
    for (const el of document.querySelector(sel)?.querySelectorAll("*") ?? [])
      for (const pseudo of [null, "::before", "::after"]) {
        const style = getComputedStyle(el, pseudo);
        if (style.animationName === "none") continue;
        if (style.animationPlayState.split(",").some((state) => state.trim() === "running"))
          running.push(`${name(el)}${pseudo ?? ""} ${style.animationName}`);
        else paused++;
      }
    return { running: running.sort(), paused };
  }, scope);
}

/** Whether `selector` is in the page right now, without waiting for it. */
export function present(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((sel) => document.querySelector(sel) !== null, selector);
}

/** The held clock (`holdClock`) moved on by `ms`, and the page's updates in. */
export async function runClock(page: Page, ms: number): Promise<void> {
  await page.clock.runFor(ms);
  await settleUpdates(page);
}

/** Hides the tab, or shows it again (`setTabHidden`), and lets the page take it in. */
export async function hideTab(page: Page, hidden: boolean): Promise<void> {
  await setTabHidden(page, hidden);
  await settleUpdates(page);
}

/** The game's CSS while the tab is hidden: every animation in `scope` stands paused (6.11). */
export async function expectCssPaused(page: Page, scope = "[data-app]"): Promise<void> {
  const states = await cssPlayStates(page, scope);
  expect(states.running).toEqual([]);
  expect(states.paused).toBeGreaterThan(0);
}
