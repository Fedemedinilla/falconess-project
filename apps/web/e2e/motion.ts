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

/** The opacity an element shows: the product of the computed opacities up its ancestors. */
export async function opacityOf(page: Page, selector: string): Promise<number> {
  return page.locator(selector).evaluate((el) => {
    let opacity = 1;
    for (let e: Element | null = el; e; e = e.parentElement)
      opacity *= Number(getComputedStyle(e).opacity);
    return opacity;
  });
}

/** What a 5 × 9 grid of points over the game hits (`coverage`). */
export type Coverage = {
  /** Points that hit `selector` with every ancestor at opacity 1. */
  readonly covered: number;
  readonly points: number;
  /** Each other point: where it is, what it hit, and why it does not count. */
  readonly misses: readonly string[];
};

/**
 * Whether `selector` covers the game: a 5 × 9 grid of `elementFromPoint` calls over the game's
 * column (`[data-app]`, clipped to the viewport; the viewport without it) must each land inside
 * `selector`, on an element whose every ancestor computes opacity 1. Rule 10 (a scene starts on
 * opaque black) and rule 11 (nothing of the race card under the emblem) are checked with it.
 */
export async function coverage(page: Page, selector: string): Promise<Coverage> {
  return page.evaluate((sel) => {
    const app = document.querySelector("[data-app]")?.getBoundingClientRect();
    const left = Math.max(0, app?.left ?? 0);
    const top = Math.max(0, app?.top ?? 0);
    const right = Math.min(window.innerWidth, app?.right ?? window.innerWidth);
    const bottom = Math.min(window.innerHeight, app?.bottom ?? window.innerHeight);
    const name = (el: Element): string => {
      const cls = el.getAttribute("class")?.split(/\s+/)[0];
      return el.tagName.toLowerCase() + (el.id ? `#${el.id}` : "") + (cls ? `.${cls}` : "");
    };
    const misses: string[] = [];
    let covered = 0;
    for (let i = 0; i < 5; i++)
      for (let j = 0; j < 9; j++) {
        const x = Math.round(left + ((i + 0.5) * (right - left)) / 5);
        const y = Math.round(top + ((j + 0.5) * (bottom - top)) / 9);
        const hit = document.elementFromPoint(x, y);
        if (!hit) {
          misses.push(`(${x}, ${y}): nothing`);
          continue;
        }
        if (!hit.closest(sel)) {
          misses.push(`(${x}, ${y}): ${name(hit)}, outside ${sel}`);
          continue;
        }
        let faded: string | undefined;
        for (let e: Element | null = hit; e && !faded; e = e.parentElement) {
          const opacity = Number(getComputedStyle(e).opacity);
          if (opacity < 1) faded = `${name(e)} at opacity ${opacity}`;
        }
        if (faded) misses.push(`(${x}, ${y}): ${name(hit)}, under ${faded}`);
        else covered++;
      }
    return { covered, points: 45, misses };
  }, selector);
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
