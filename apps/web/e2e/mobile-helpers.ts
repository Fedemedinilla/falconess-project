import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test as base, expect, type Locator, type Page } from "@playwright/test";
import { test as appTest, t } from "./fixtures";
import { describeIssue, expectUniqueIds, type FrameIssue, frameIssues } from "./motion";

/**
 * The phone game's (#juego) shared e2e: the frame probe every phone test runs under, and the
 * hands that play a season (title, scenes, a week, the race mode). Every phone spec imports `test`
 * from here (`shotTest` for the screenshot specs, which load the real fonts).
 */

// ---- the frame probe ----

/** The frames a bad moment was on screen: how many, and the first and last one's time. */
type Shown = {
  readonly frames: number;
  /** The first and last frame's time, ms after the page load (none when `frames` is 0). */
  readonly first?: number;
  readonly last?: number;
};

/** What the probe's page side sends through the `__probe` binding. */
type ProbeMessage =
  | { readonly type: "hello"; readonly doc: string; readonly href: string }
  | {
      readonly type: "issue";
      readonly doc: string;
      readonly n: number;
      /** Found at the DOM change itself, or by the twice-a-second full check. */
      readonly by: "change" | "check";
      /** When, in ms after the page load (`performance.now()`). */
      readonly ms: number;
      readonly hash: string;
      readonly issues: readonly FrameIssue[];
    }
  | ({ readonly type: "end"; readonly doc: string; readonly n: number } & Shown);

/** The page side's answer at the test's end. */
type ProbeFinal = {
  readonly active: boolean;
  /** Checks a DOM change asked for while the game was on screen. */
  readonly changes: number;
  readonly unsent: readonly ProbeMessage[];
  /** The bad moment still on screen, if any. */
  readonly open?: { readonly n: number; readonly doc: string } & Shown;
};

/**
 * The probe's page side, an init script: it runs again on every page load, before the page's own
 * scripts and before a fake clock (so it keeps the real `requestAnimationFrame` and timers).
 *
 * While the game is on screen (`[data-app]`, which only #juego renders), every DOM change that
 * can break a rule (an element with an id, `data-app`, `data-screen` or `data-layer-phase` comes
 * or goes, or one of those attributes changes) is checked with `frameIssues` before anything else
 * runs: no frame, and no moment between two frames, goes unchecked. Twice a second the whole page
 * is checked as well. Text changes and other attributes (the race replay's, every frame) are not
 * checked, and nothing runs per frame while all is well: an idle page renders no extra frames.
 * A bad moment is sent at once; while it lasts, its frames are counted (from the next animation
 * frame on), and its end follows with them. Built from source: `issuesOf` is `frameIssues`.
 */
function probePage(issuesOf: () => FrameIssue[]): void {
  if (window !== window.top) return;
  const raf = window.requestAnimationFrame.bind(window);
  const every = window.setInterval.bind(window);
  const now = performance.now.bind(performance);
  const doc = `${performance.timeOrigin}/${crypto.randomUUID()}`;
  const outbox: unknown[] = [{ type: "hello", doc, href: location.href }];
  const flush = () => {
    const send: unknown = Reflect.get(window, "__probe");
    if (typeof send !== "function") return;
    for (const message of outbox.splice(0)) Promise.resolve(send(message)).catch(() => undefined);
  };
  const WATCHED = "[id], [data-app], [data-screen], [data-layer-phase]";
  let changes = 0;
  let n = 0;
  type Open = { n: number; sig: string; frames: number; first?: number; last?: number };
  let open: Open | undefined;
  const shown = (o: Open) => ({ frames: o.frames, first: o.first, last: o.last });
  const count = (episode: Open) => (t: number) => {
    if (open !== episode) return;
    episode.frames++;
    episode.first ??= Math.round(t);
    episode.last = Math.round(t);
    raf(count(episode));
  };
  const active = () => document.querySelector("[data-app]") !== null;
  const check = (by: "change" | "check") => {
    const on = active();
    if (on && by === "change") changes++;
    const issues = on ? issuesOf() : [];
    const sig = issues.length > 0 ? JSON.stringify(issues) : "";
    if (sig === (open?.sig ?? "")) return;
    if (open) outbox.push({ type: "end", doc, n: open.n, ...shown(open) });
    open = undefined;
    if (sig) {
      n++;
      const episode: Open = { n, sig, frames: 0 };
      open = episode;
      raf(count(episode));
      const ms = Math.round(now());
      outbox.push({ type: "issue", doc, n, by, ms, hash: location.hash, issues });
    }
    flush();
  };
  const watched = (node: Node) =>
    node instanceof Element && (node.matches(WATCHED) || node.querySelector(WATCHED) !== null);
  new MutationObserver((records) => {
    const relevant = records.some(
      (r) =>
        r.type === "attributes" ||
        [...r.addedNodes].some(watched) ||
        [...r.removedNodes].some(watched),
    );
    if (relevant) check("change");
  }).observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["id", "data-app", "data-screen", "data-layer-phase"],
  });
  every(() => {
    check("check");
    flush();
  }, 500);
  Reflect.set(window, "__falconessProbe", {
    final: () => {
      check("check");
      flush();
      return {
        active: active(),
        changes,
        unsent: outbox.splice(0),
        open: open && { n: open.n, doc, ...shown(open) },
      };
    },
  });
}

/** The probe as a test sees it. */
export type Probe = {
  /** The bad moments seen so far, in words (none while every frame keeps the rules). */
  readonly reports: () => readonly string[];
  /** Takes the reports seen so far out of the end-of-test check: for the probe's own tests. */
  readonly take: () => readonly string[];
};

type Episode = {
  readonly load: number;
  readonly by: "change" | "check";
  readonly ms: number;
  readonly hash: string;
  /** Seconds into the test when the page sent it. */
  readonly at: number;
  readonly issues: readonly FrameIssue[];
  /** Its frames once it ended (or once the test ended with it on screen: `lasting`). */
  shown?: Shown;
  lasting?: boolean;
};

const seconds = (ms: number) => `${(ms / 1000).toFixed(2)} s`;

/**
 * When, where and what: "page load 1, a DOM change 13.52 s after the load (13.6 s into the test,
 * #juego (no hash)), on screen for 14 frames, from the frame at 13.53 s to the one at 13.76 s:
 * id "m-sonido" on 2 elements: …".
 */
function describeEpisode(e: Episode): string {
  const what = e.by === "change" ? "a DOM change" : "the twice-a-second check";
  const frames = !e.shown
    ? "frames not counted yet"
    : e.shown.frames === 0
      ? "gone before the next frame (never painted, still seen by the test)"
      : e.shown.frames === 1
        ? `on screen for 1 frame, the one at ${seconds(e.shown.first ?? 0)}`
        : `on screen for ${e.shown.frames} frames, from the frame at ` +
          `${seconds(e.shown.first ?? 0)} to the one at ${seconds(e.shown.last ?? 0)}`;
  const where = e.hash === "" ? "#juego (no hash)" : e.hash;
  return (
    `page load ${e.load}, ${what} ${seconds(e.ms)} after the load (${e.at.toFixed(1)} s into ` +
    `the test, ${where}), ${e.lasting ? "still there at the test's end, " : ""}${frames}:\n    ` +
    e.issues.map(describeIssue).join("\n    ")
  );
}

/**
 * The frame probe (plan-final §2.8), an auto fixture of every phone test: no id on two elements,
 * at most one `[data-screen]` and at most one `[data-layer-phase="in"]`, in any frame or between
 * two frames, across reloads. It fails the test at its end, naming each id or element that
 * collided, when, and the frames it stayed on screen; and it fails when the game is on screen at
 * the end but the probe never checked it.
 */
async function runProbe({ page }: { page: Page }, use: (probe: Probe) => Promise<void>) {
  const started = Date.now();
  const loads = new Map<string, number>();
  const episodes = new Map<string, Episode>();
  const loadOf = (doc: string) => {
    const known = loads.get(doc);
    if (known !== undefined) return known;
    loads.set(doc, loads.size + 1);
    return loads.size;
  };
  const receive = (message: ProbeMessage) => {
    const load = loadOf(message.doc);
    if (message.type === "issue")
      episodes.set(`${message.doc}/${message.n}`, {
        load,
        by: message.by,
        ms: message.ms,
        hash: message.hash,
        at: (Date.now() - started) / 1000,
        issues: message.issues,
      });
    else if (message.type === "end") {
      const episode = episodes.get(`${message.doc}/${message.n}`);
      if (episode) episode.shown = message;
    }
  };
  // context-wide, so they come before a fake clock a test installs (its script would replace
  // requestAnimationFrame and the timers first)
  await page
    .context()
    .exposeBinding("__probe", (_source, message: ProbeMessage) => receive(message));
  await page
    .context()
    .addInitScript({ content: `(${probePage.toString()})(${frameIssues.toString()});` });
  const reports = () => [...episodes.values()].map(describeEpisode);
  await use({
    reports,
    take: () => {
      const taken = reports();
      episodes.clear();
      return taken;
    },
  });
  let final: ProbeFinal | { readonly missing: true; readonly active: boolean } | undefined;
  if (!page.isClosed())
    try {
      final = await page.evaluate(() => {
        const probe: { final(): ProbeFinal } | undefined = Reflect.get(window, "__falconessProbe");
        return probe
          ? probe.final()
          : { missing: true as const, active: document.querySelector("[data-app]") !== null };
      });
    } catch {
      // the page went away with the test: what it sent is all there is
    }
  if (final && "unsent" in final) {
    for (const message of final.unsent) receive(message);
    const open = final.open;
    const episode = open && episodes.get(`${open.doc}/${open.n}`);
    if (open && episode) {
      episode.shown = open;
      episode.lasting = true;
    }
  }
  const left = reports();
  if (left.length > 0)
    throw new Error(
      `the frame probe saw ${left.length} bad moment${left.length > 1 ? "s" : ""} on #juego:\n` +
        left.map((r, i) => `  ${i + 1}. ${r}`).join("\n"),
    );
  if (final?.active && ("missing" in final || final.changes === 0))
    throw new Error("the frame probe never ran: the game is on screen and no change was checked");
}

type ProbeFixtures = { probe: Probe };

/** The phone tests: the app fixtures (fonts stubbed, failing on console errors) and the probe. */
export const test = appTest.extend<ProbeFixtures>({ probe: [runProbe, { auto: true }] });

/** The phone screenshot specs: the real fonts, no console check, and the probe. */
export const shotTest = base.extend<ProbeFixtures>({ probe: [runProbe, { auto: true }] });

// ---- the hands ----

/** The title screen (owner 2026-11-12): a tap anywhere starts. */
export async function pastTitle(page: Page): Promise<void> {
  await page.click("#m-titulo");
  await expect(page.locator("#m-titulo")).toHaveCount(0);
}

/** Peregrina's prologue: once it shows, skipped. */
export async function skipPrologue(page: Page): Promise<void> {
  await expect(page.locator("#m-capitulo")).toBeVisible();
  await skipScene(page);
}

/** A story scene in the way (owner 2026-11-12): skip it and let its notice go. */
export async function skipScene(page: Page): Promise<boolean> {
  if ((await page.locator("#m-capitulo").count()) === 0) return false;
  await page.click("#m-capitulo-saltar");
  await expect(page.locator("#m-capitulo")).toHaveCount(0);
  return true;
}

export async function startMobile(page: Page, falconessId = "peregrina"): Promise<void> {
  await page.goto("./");
  await pastTitle(page);
  await expect(page.getByRole("heading", { name: t("ui.m.pick.title") })).toBeVisible();
  await expect(page.locator("#m-empezar")).toBeDisabled();
  await page.click(`#m-elegir-${falconessId}`);
  await expect(page.locator(`#m-elegir-${falconessId}`)).toHaveAttribute("aria-pressed", "true");
  await page.click("#m-empezar");
  await expect(page.locator("#m-semana")).toHaveAttribute(
    "aria-label",
    t("ui.m.week.aria", { turn: 1, turns: 48, left: 47 }),
  );
  // Peregrina's prologue opens her season
  if (falconessId === "peregrina") {
    await expect(page.locator("#m-capitulo")).toBeVisible();
    await skipScene(page);
  }
}

/**
 * A seeded save (`e2e/saves/<name>.json`): the run, its fingerprint and the scenes its player has
 * seen, as `scripts/e2e-saves.test.ts` writes and checks them, and the facts it checked.
 */
export type SeededSave = {
  readonly save: { readonly seed: string };
  readonly vista: string;
  readonly historia: readonly string[];
  readonly expect: {
    /** The week «Continuar» opens on (the last one, once the season ended). */
    readonly turn: number;
    readonly status: "active" | "ended";
    /** The scenes due at load: the menu (or the End) plays them at once. */
    readonly due: readonly string[];
  };
};

/**
 * Put a seeded save in this browser before the page loads: the run (`falconess.pruebas.partida`),
 * its last week as read (`falconess.pruebas.vista`) and the scenes already seen in it and ever
 * (`falconess.juego.historia`). Only when no run is stored yet, so a reload keeps the progress a
 * test made. Then «Continuar» (`continueRun`) opens it.
 */
export async function seedRun(page: Page, name: string): Promise<SeededSave> {
  const seeded: SeededSave = JSON.parse(
    readFileSync(fileURLToPath(new URL(`./saves/${name}.json`, import.meta.url)), "utf8"),
  );
  await page.addInitScript((fixture: SeededSave) => {
    if (localStorage.getItem("falconess.pruebas.partida") !== null) return;
    localStorage.setItem("falconess.pruebas.partida", JSON.stringify(fixture.save));
    localStorage.setItem("falconess.pruebas.vista", fixture.vista);
    localStorage.setItem(
      "falconess.juego.historia",
      JSON.stringify({ runs: { [fixture.save.seed]: fixture.historia }, ever: fixture.historia }),
    );
  }, seeded);
  return seeded;
}

/** After a load or a reload: the title, then «Continuar» with the run in play. */
export async function continueRun(page: Page): Promise<void> {
  await pastTitle(page);
  await page.click("#m-continuar");
  await expect(page.locator("#m-continuar")).toHaveCount(0);
}

/** The week in play, from the HUD; throws (instead of waiting) when no HUD is on screen. */
export async function week(page: Page): Promise<number> {
  const hud = page.locator("#m-semana");
  if ((await hud.count()) === 0) throw new Error("no #m-semana on screen (End or race?)");
  const label = (await hud.getAttribute("aria-label")) ?? "";
  return Number(/\d+/.exec(label)?.[0] ?? "0");
}

/**
 * A tap on a layer that also leaves by itself (the week's effects, the finish banner): true when
 * it was up. Gone before the tap landed is fine; still there after 2 s is not.
 */
async function tapIfUp(layer: Locator): Promise<boolean> {
  if ((await layer.count()) === 0) return false;
  try {
    await layer.click({ timeout: 2000 });
  } catch (error) {
    if ((await layer.count()) > 0) throw error;
  }
  return true;
}

/** The inheritance or inspiration card (ADR-0013), which waits for its «Continuar». */
async function passInspiration(page: Page): Promise<boolean> {
  if ((await page.locator("#m-inspiracion").count()) === 0) return false;
  await page.click("#m-inspiracion-seguir");
  return true;
}

/**
 * Play the week's inspiration, effects, any scene and any event, until the menu (or the season's
 * end) is free.
 */
export async function settle(page: Page): Promise<void> {
  const event = page.locator("#evento-dialogo[open]");
  const busy = async () =>
    (await event.count()) > 0 ||
    (await page.locator("#m-capitulo").count()) > 0 ||
    (await page.locator("#m-inspiracion").count()) > 0 ||
    (await page.locator("#m-efectos").count()) > 0 ||
    (await page.locator("#m-transicion").count()) > 0;
  for (let i = 0; i < 80; i++) {
    await expectUniqueIds(page);
    if (await passInspiration(page)) continue;
    // the week's effects (owner 2026-11-13) play first; a tap ends them
    if (await tapIfUp(page.locator("#m-efectos"))) continue;
    if ((await event.count()) > 0) {
      await page.click("#evento-opcion-0");
      continue;
    }
    if (await skipScene(page)) continue;
    if ((await page.locator("#m-fin").count()) > 0) return;
    const menu = page.locator("#m-entrenar");
    if ((await menu.count()) > 0 && (await menu.isEnabled())) {
      // a scene comes right after the effects: give it a moment
      await page.waitForTimeout(150);
      if (!(await busy())) return;
      continue;
    }
    await page.waitForTimeout(100);
  }
  throw new Error("the week did not settle");
}

/**
 * The race mode of a race week, once its action ran (owner 2026-11-13): the emblem transition,
 * the scene before the race (skipped), until the position card is free.
 */
export async function toPosition(page: Page): Promise<void> {
  for (let i = 0; i < 80; i++) {
    await expectUniqueIds(page);
    if (await skipScene(page)) continue;
    if (await passInspiration(page)) continue;
    // the action's effects play before the race mode
    if (await tapIfUp(page.locator("#m-efectos"))) continue;
    const free =
      (await page.locator("#m-precarrera-accion").count()) > 0 &&
      (await page.locator("#m-transicion").count()) === 0;
    if (free) {
      await page.waitForTimeout(150);
      if ((await page.locator("#m-capitulo").count()) === 0) return;
      continue;
    }
    await page.waitForTimeout(100);
  }
  throw new Error("the position card did not come");
}

/** After «Saltar»: the finish, the scene after the race (skipped), until its result shows. */
export async function toResult(page: Page): Promise<void> {
  for (let i = 0; i < 80; i++) {
    await expectUniqueIds(page);
    if (await skipScene(page)) continue;
    if ((await page.locator("#m-resultado").count()) > 0) return;
    // the finish banner (step 6.3) goes on to the result at a tap
    if (await tapIfUp(page.locator("#m-carrera-llegada"))) continue;
    await page.waitForTimeout(100);
  }
  throw new Error("the race's result did not come");
}

/** The week's race, once its action ran: the flight view, «Saltar», the result, «Continuar». */
export async function runRace(page: Page): Promise<void> {
  await expect(page.locator("#m-carrera-vuelo")).toBeVisible();
  await page.click("#m-saltar");
  await toResult(page);
  await page.click("#m-carrera-seguir");
}

/**
 * A finger swipe on the page (CDP touch events, which Chromium turns into a touch scroll the way a
 * phone does): from (x, y), dy pixels up, in ten moves.
 */
export async function swipeUp(page: Page, x: number, y: number, dy: number): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let i = 1; i <= 10; i++)
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: y - (dy * i) / 10 }],
    });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(150);
}

/** A finger drag across the page (CDP touch events): from (x, y) by (dx, dy), in twelve moves. */
export async function fingerDrag(
  page: Page,
  x: number,
  y: number,
  dx: number,
  dy: number,
): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let i = 1; i <= 12; i++)
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x + (dx * i) / 12, y: y + (dy * i) / 12 }],
    });
  // the finger rests before it lifts: no flick
  await page.waitForTimeout(150);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}
