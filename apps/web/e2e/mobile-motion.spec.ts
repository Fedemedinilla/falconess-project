import { expect, type Page } from "@playwright/test";
import { t } from "./fixtures";
import {
  continueRun,
  pastTitle,
  runRace,
  seedRun,
  startMobile,
  test,
  toPosition,
  toResult,
  watchCues,
  week,
} from "./mobile-helpers";
import {
  coverage,
  cssPlayStates,
  freezeAt,
  holdClock,
  opacityOf,
  setTabHidden,
  settleUpdates,
} from "./motion";

/**
 * How the phone game's layers come and go (plan-final §1.9, §2, phase 6). 6.1: a layer that the
 * flow moved on from leaves as an id-less, inert copy that takes no tap and plays nothing, removed
 * by its timer (the week's effects in 240 ms, H2; the inheritance card in 240 ms, L1), while what
 * is under it is live; one gesture is one decision (a double tap's second click never reaches what
 * the first one mounted, critic b); while a layer is in front the game behind it is out of reach
 * and the layer's own control has the focus, which comes back to the screen's control when the
 * last layer goes (L7). 6.2: a scene's 0.8 s exit fades onto the real next screen (D7, H1): the
 * race's result is there from the exit's first frame, takes taps at once, and comes in 400 ms into
 * the fade. Timing goes through the fake clock, held still where a moment matters, and CSS moments
 * through `freezeAt`. 6.3: a race that ends by itself holds its finish a moment with her place on a
 * banner (D7: 1.2 s × Ritmo), a race seen again too; «Saltar» skips the replay and the hold.
 * 6.4: the emblem fades in over 160 ms over the screen it rises from, and only once it is opaque
 * does the race mode take its place under it (M2, rule 11); after its 1.24 s it fades out over
 * 280 ms as an id-less copy onto the race mode (O6): the scene before the race, on its own black,
 * or the decided card, which takes «Correr» at once.
 * 6.10: while the week's effects play, the HUD reads the week just played (O3): its calendar, goal
 * and mood flip to the next week when the effects lift (the calendar turns its page), and the vigor
 * bar stays where the week's training already put it.
 * 6.5: a screen fades in as it mounts, by opacity only, and takes a tap from its first frame (D1;
 * the season's first menu and the End slower); the HUD comes back after the race mode with a fade
 * (L5); a tablet's frame widens and narrows for the race (L5, F26) and the flight view follows its
 * new width; on the wide screen the End's column glides to the middle with the game's layers inside
 * it (L8), and a resize keeps them inside; a tab opens at its top (L6).
 * 6.11: a hidden tab (another tab in front, a locked phone) holds the game where it was: every flow
 * timer pauses with the game's CSS and goes on with the time it had left once the tab shows again
 * (critic b: two clocks), so nothing ends, sounds or comes in out of sight.
 */

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

/** Whether `selector` is in the page right now, without waiting for it. */
function present(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((sel) => document.querySelector(sel) !== null, selector);
}

/** What `document.elementFromPoint` finds at the middle of the game's column, by its screen. */
function middleHit(page: Page): Promise<string> {
  return page.evaluate(() => {
    const app = document.querySelector("[data-app]")?.getBoundingClientRect();
    if (!app) return "no column";
    const el = document.elementFromPoint(app.left + app.width / 2, app.top + app.height / 2);
    const screen = el?.closest("[data-screen]")?.getAttribute("data-screen");
    return screen ? `screen ${screen}` : (el?.outerHTML.slice(0, 120) ?? "nothing");
  });
}

/** The cues of the week's effects' own stamps (a leaving copy plays none). */
const STAMP_CUES = new Set(["success", "fail", "boost"]);

test("the week's effects leave over 240 ms as an id-less, silent copy, and the menu under it takes a tap at once (H2)", async ({
  page,
}) => {
  await page.clock.install();
  await startMobile(page);
  // the skipped prologue's own exit (0.8 s, 6.2) is over: the only layer from here is the effects
  await expect(page.locator("[data-layer-phase]")).toHaveCount(0);
  const cues = await watchCues(page);
  await holdClock(page);
  await page.click("#m-descansar");
  await expect(page.locator("#m-efectos")).toBeVisible();
  await settleUpdates(page);
  const before = (await cues()).length;
  await page.click("#m-efectos");
  // at once: no id, the scrim and its stamps still there on their way out, nothing in front
  expect(await present(page, "#m-efectos")).toBe(false);
  expect(await page.locator('[data-layer-phase="out"] [data-fx]').count()).toBeGreaterThan(0);
  expect(await page.locator('[data-layer-phase="in"]').count()).toBe(0);
  // the copy takes no tap: the middle of the column is the menu's, live again
  expect(await middleHit(page)).toBe("screen menu");
  await expect(page.locator('[data-screen="menu"]')).not.toHaveAttribute("inert");
  // still on its way out (the clock stands still), «Entrenar» takes the tap
  await page.click("#m-entrenar");
  await expect(page.locator("#m-entrenar-agility")).toBeVisible();
  expect(await present(page, '[data-layer-phase="out"] [data-fx]')).toBe(true);
  await page.clock.runFor(200);
  await settleUpdates(page);
  expect(await present(page, '[data-layer-phase="out"]')).toBe(true);
  // gone by its timer within 600 ms, and nothing of it ever sounded once it left
  await page.clock.runFor(400);
  await settleUpdates(page);
  expect(await present(page, "[data-layer-phase]")).toBe(false);
  const after = (await cues()).slice(before);
  expect(after.filter((c) => STAMP_CUES.has(c))).toEqual([]);
});

test("a double tap on the week's effects ends them once: the second click does not reach the inheritance card under the finger (critic b)", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.clock.install();
  await seedRun(page, "peregrina-w39-insp");
  await page.goto("./");
  await continueRun(page);
  await page.click("#m-descansar");
  await expect(page.locator("#m-efectos")).toBeVisible();
  await holdClock(page);
  await page.dblclick("#m-efectos");
  const card = page.locator("#m-inspiracion");
  await expect(card).toBeVisible();
  await settleUpdates(page);
  // the second click landed on the card's intro, and did not hurry it
  expect(await card.getAttribute("data-revealed")).toBeNull();
  // its intro ends by itself, and «Continuar» takes the tap from then
  await page.clock.runFor(1700);
  await expect(card).toHaveAttribute("data-revealed", "time");
  await expect(page.locator("#m-inspiracion-seguir")).toBeFocused();
  await page.click("#m-inspiracion-seguir");
  await expect(page.locator("#m-capitulo")).toHaveAttribute("data-scene", "peregrina-first-vos");
});

test("the inheritance card: a tap shows it at once, «Continuar» takes taps only then, and the card fades out over the scene's black (L1)", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.clock.install();
  await seedRun(page, "peregrina-w39-insp");
  await page.goto("./");
  await continueRun(page);
  await page.click("#m-descansar");
  await page.click("#m-efectos");
  const card = page.locator("#m-inspiracion");
  await expect(card).toBeVisible();
  await holdClock(page);
  // its intro: the tap that shows the card has the focus, «Continuar» takes no tap yet
  expect(
    await page.evaluate(() => {
      const el = document.activeElement;
      return el?.closest("#m-inspiracion") !== null && el?.id !== "m-inspiracion-seguir";
    }),
  ).toBe(true);
  await expect(page.locator("#m-inspiracion-seguir")).toBeDisabled();
  // nor the keyboard: it cannot take the focus yet
  expect(
    await page.evaluate(() => {
      const go = document.getElementById("m-inspiracion-seguir");
      go?.focus();
      return go !== null && document.activeElement === go;
    }),
  ).toBe(false);
  // a tap anywhere on it shows the card at once
  await page.click("#m-inspiracion");
  await expect(card).toHaveAttribute("data-revealed", "tap");
  await expect(page.locator("#m-inspiracion-seguir")).toBeFocused();
  await page.click("#m-inspiracion-seguir");
  // at once: the card's ids gone, its copy fading in front, the week's scene on its black under it
  expect(await present(page, "#m-inspiracion")).toBe(false);
  expect(await present(page, '[data-layer="inspiration"][data-layer-phase="out"]')).toBe(true);
  await expect(page.locator("#m-capitulo")).toHaveAttribute("data-scene", "peregrina-first-vos");
  await expect(page.locator("#m-capitulo-seguir")).toBeFocused();
  await page.clock.runFor(300);
  await settleUpdates(page);
  expect(await present(page, '[data-layer-phase="out"]')).toBe(false);
  await expect(page.locator("#m-capitulo")).toHaveAttribute("data-scene", "peregrina-first-vos");
});

test("while a layer is in front the game behind it is out of reach, and the focus comes back to the screen's own control (L7)", async ({
  page,
}) => {
  await page.clock.install();
  await startMobile(page);
  await holdClock(page);
  await page.click("#m-descansar");
  const fx = page.locator("#m-efectos");
  await expect(fx).toBeFocused();
  await expect(page.locator('[data-screen="menu"]')).toHaveAttribute("inert");
  await expect(page.locator("[data-app] header")).toHaveAttribute("inert");
  // the keyboard reaches nothing behind it («Menú» above all)
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(() => document.activeElement?.closest("[data-screen], header") ?? null),
  ).toBeNull();
  // Enter on it ends the effects like a tap: the focus lands on «Entrenar», never on the page
  await page.focus("#m-efectos");
  await page.keyboard.press("Enter");
  await expect(page.locator("#m-entrenar")).toBeFocused();
  await expect(page.locator('[data-screen="menu"]')).not.toHaveAttribute("inert");
  await expect(page.locator("[data-app] header")).not.toHaveAttribute("inert");
  expect(await week(page)).toBe(2);
});

test("a reload over the action's effects opens on them with the focus and the game behind out of reach (L7, D5)", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.clock.install();
  await seedRun(page, "peregrina-w10");
  await page.goto("./");
  await continueRun(page);
  await page.click("#m-descansar");
  await expect(page.locator("#m-efectos")).toBeVisible();
  await page.reload();
  await continueRun(page);
  await holdClock(page);
  await expect(page.locator("#m-efectos")).toBeFocused();
  await expect(page.locator('[data-screen="menu"]')).toHaveAttribute("inert");
  await expect(page.locator("[data-app] header")).toHaveAttribute("inert");
});

test("a triple tap on a training trains once, and its result plays on: the third click is no skip (critic b)", async ({
  page,
}) => {
  await page.clock.install();
  await startMobile(page);
  await page.click("#m-entrenar");
  await holdClock(page);
  await page.click("#m-entrenar-agility", { clickCount: 3 });
  await expect(page.locator("#m-resultado")).toBeVisible();
  await settleUpdates(page);
  await page.clock.runFor(300);
  await settleUpdates(page);
  expect(await present(page, "#m-resultado")).toBe(true);
  expect(await week(page)).toBe(1);
});

/**
 * From now on, whether a frame ever held the scene (`#m-capitulo`) and the race's result
 * (`#m-resultado`) at once (rule 13: the result never under or before a scene): checked after
 * every change of the page and at every frame. Returns the frames that broke it.
 */
async function watchRule13(page: Page): Promise<() => Promise<number>> {
  await page.evaluate(() => {
    let broken = 0;
    const check = () => {
      if (document.getElementById("m-capitulo") && document.getElementById("m-resultado")) broken++;
    };
    new MutationObserver(check).observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["id"],
    });
    const frame = () => {
      check();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    Reflect.set(window, "__rule13", () => broken);
  });
  return () =>
    page.evaluate(() => {
      const read: unknown = Reflect.get(window, "__rule13");
      return typeof read === "function" ? Number(read()) : -1;
    });
}

/** Week 10 of `peregrina-w10`: a rest, the race mode, «Correr» and «Saltar», to the scene after it. */
async function toSceneAfterRace(page: Page): Promise<void> {
  await seedRun(page, "peregrina-w10");
  await page.goto("./");
  await continueRun(page);
  await page.click("#m-descansar");
  await toPosition(page);
  await page.click("#m-correr");
  await expect(page.locator("#m-carrera-vuelo")).toBeVisible();
  await page.click("#m-saltar");
  await expect(page.locator("#m-capitulo")).toHaveAttribute("data-scene", "peregrina-debut-win");
  // the scene before the race has finished leaving: the only copy from here is this scene's
  await expect(page.locator("[data-layer-phase='out']")).toHaveCount(0);
}

test("a scene after the race leaves onto its result: the result is there from the exit's first frame, takes «Continuar» during the fade, and comes in 400 ms into it (D7, H1)", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.clock.install();
  await toSceneAfterRace(page);
  const rule13 = await watchRule13(page);
  await holdClock(page);
  // rule 10: the scene starts on its opaque black, over the race held
  await freezeAt(page, 0);
  const black = await coverage(page, "#m-capitulo");
  expect(black.misses).toEqual([]);
  await page.click("#m-capitulo-saltar");
  // at once: the scene's ids gone, its copy fading in front, the result under it
  expect(await present(page, "#m-capitulo")).toBe(false);
  expect(await present(page, '[data-layer-phase="out"] [data-scene="peregrina-debut-win"]')).toBe(
    true,
  );
  expect(await present(page, '[data-after="scene"] #m-resultado')).toBe(true);
  // 400 ms into the fade the scene's black is mostly gone and the result has not come in yet;
  // by 800 ms it is in
  await freezeAt(page, 400);
  expect(await opacityOf(page, "#m-resultado")).toBeLessThan(0.1);
  const veil = await opacityOf(page, '[data-layer-phase="out"] [data-scene]');
  expect(veil).toBeGreaterThan(0.05);
  expect(veil).toBeLessThan(0.4);
  await freezeAt(page, 800);
  expect(await opacityOf(page, "#m-resultado")).toBeGreaterThanOrEqual(0.95);
  // «Continuar» takes the tap while the scene's copy is still on its way out (the clock is held)
  await page.click("#m-carrera-seguir", { timeout: 2000 });
  await expect(page.locator("#m-efectos, #m-entrenar").first()).toBeVisible();
  expect(await present(page, '[data-layer-phase="out"] [data-scene]')).toBe(true);
  await page.clock.runFor(900);
  await settleUpdates(page);
  expect(await present(page, '[data-layer-phase="out"] [data-scene]')).toBe(false);
  expect(await rule13()).toBe(0);
});

test("the skipped scene's notice waits for the scene's exit, then sits just over the result's foot as it landed (rule 17, D7)", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.clock.install();
  await toSceneAfterRace(page);
  await holdClock(page);
  await page.click("#m-capitulo-saltar");
  await settleUpdates(page);
  // no notice while the scene's copy fades over the result
  await page.clock.runFor(700);
  await settleUpdates(page);
  expect(await present(page, "#m-capitulo-aviso")).toBe(false);
  await page.clock.runFor(200);
  await expect(page.locator("#m-capitulo-aviso")).toBeVisible();
  // every entrance landed: the notice NOTICE_GAP (10 px) over the foot, clear of its buttons
  await freezeAt(page, 10_000);
  const gap = await page.evaluate(() => {
    const notice = document.getElementById("m-capitulo-aviso")?.getBoundingClientRect();
    const foot = document.querySelector("[data-toast-anchor]")?.getBoundingClientRect();
    return notice && foot ? foot.top - notice.bottom : undefined;
  });
  expect(gap).toBeGreaterThanOrEqual(9);
  expect(gap).toBeLessThanOrEqual(11);
});

test("a scene's notice belongs to the screen it left onto: a tap away during its exit drops it, so it never shows over the next screen's controls (6.2, rule 17)", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("./");
  await pastTitle(page);
  await page.click("#m-elegir-peregrina");
  await page.click("#m-empezar");
  await expect(page.locator("#m-capitulo")).toBeVisible();
  await holdClock(page);
  await page.click("#m-capitulo-saltar");
  // the menu is live under the prologue's exit: «Taller» at once
  await page.click("#m-taller");
  await expect(page.locator("#m-taller-wings")).toBeVisible();
  await page.clock.runFor(1500);
  await settleUpdates(page);
  // the exit is over: no notice over the workshop's tabs, and none back on the menu
  expect(await present(page, "[data-layer-phase]")).toBe(false);
  expect(await present(page, "#m-capitulo-aviso")).toBe(false);
  await page.click("#m-volver");
  await expect(page.locator("#m-entrenar")).toBeVisible();
  await page.clock.runFor(500);
  await settleUpdates(page);
  expect(await present(page, "#m-capitulo-aviso")).toBe(false);
});

/** Week 10 of `peregrina-w10`: a rest, the race mode, «Correr», to the race in the flight view. */
async function toRace(page: Page): Promise<void> {
  await seedRun(page, "peregrina-w10");
  await page.goto("./");
  await continueRun(page);
  await page.click("#m-descansar");
  await toPosition(page);
  await page.click("#m-correr");
  await expect(page.locator("#m-carrera-vuelo")).toBeVisible();
}

/** The replay playing at ×4 from a moment before her finish (the clock moves it on). */
async function nearFinish(page: Page): Promise<void> {
  await page.click("#m-carrera-vuelo-salida");
  await page.click("#m-carrera-vuelo-x4");
  const slider = page.locator("#m-carrera-tiempo");
  const rows = Number(await slider.getAttribute("max"));
  await slider.fill(String(rows - 15));
}

/** Runs the held clock on `step` ms at a time until `selector` is in the page; the ms it took. */
async function runUntil(page: Page, selector: string, maxMs: number, step = 100): Promise<number> {
  for (let ms = 0; ms <= maxMs; ms += step) {
    await settleUpdates(page);
    if (await present(page, selector)) return ms;
    await page.clock.runFor(step);
  }
  throw new Error(`no ${selector} ${maxMs} ms on`);
}

test("a race that ends by itself holds her place on a banner for 1.2 s, with «Saltar» still there, then plays on (D7, H1)", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.clock.install();
  await toRace(page);
  const cues = await watchCues(page);
  await holdClock(page);
  await nearFinish(page);
  // found within 20 ms of its first frame: the hold is measured from there
  await runUntil(page, "#m-carrera-llegada", 4000, 20);
  const banner = page.locator("#m-carrera-llegada");
  await expect(banner).toHaveAttribute("aria-label", t("ui.m.result.next"));
  await expect(banner).toContainText(t("ui.m.race.place", { place: 1 }));
  await expect(page.locator("#m-saltar")).toBeVisible();
  expect(await present(page, "#m-carrera-vuelo")).toBe(true);
  // held ≥ 1100 ms: no scene and no result meanwhile
  for (let ms = 0; ms < 1100; ms += 100) {
    await page.clock.runFor(100);
    await settleUpdates(page);
    expect(await present(page, "#m-carrera-llegada")).toBe(true);
    expect(await present(page, "#m-resultado")).toBe(false);
    expect(await present(page, "#m-capitulo")).toBe(false);
  }
  // then the race plays on by itself, silently: the scene after it, then its result
  await runUntil(page, "#m-capitulo", 300);
  expect(await present(page, "#m-carrera-llegada")).toBe(false);
  expect(await cues()).not.toContain("nav");
  await page.click("#m-capitulo-saltar");
  await expect(page.locator("#m-resultado")).toBeVisible();
});

test("«Saltar» skips the race and its finish: no banner; a tap on the banner skips the rest of the hold, with no whoosh (D7)", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.clock.install();
  await toRace(page);
  await page.evaluate(() => {
    let seen = false;
    new MutationObserver(() => {
      if (document.getElementById("m-carrera-llegada")) seen = true;
    }).observe(document.body, { childList: true, subtree: true });
    Reflect.set(window, "__banner", () => seen);
  });
  await page.click("#m-saltar");
  await page.click("#m-capitulo-saltar");
  await expect(page.locator("#m-resultado")).toBeVisible();
  expect(
    await page.evaluate(() => {
      const seen: unknown = Reflect.get(window, "__banner");
      return typeof seen === "function" ? Boolean(seen()) : undefined;
    }),
  ).toBe(false);
  // seen again: its natural end holds the banner; a tap on it goes on at once, as «Saltar» does
  const cues = await watchCues(page);
  await page.click("#m-ver-otra-vez");
  await expect(page.locator("#m-carrera-vuelo")).toBeVisible();
  const before = (await cues()).length;
  await holdClock(page);
  await nearFinish(page);
  await runUntil(page, "#m-carrera-llegada", 4000);
  await page.click("#m-carrera-llegada");
  await expect(page.locator("#m-resultado")).toBeVisible();
  expect((await cues()).slice(before)).not.toContain("nav");
});

test("«Ver otra vez» → its natural end → the banner → its result → «Continuar»: the race's effects, then the menu takes «Descansar» (I21)", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.clock.install();
  await toRace(page);
  await page.click("#m-saltar");
  await page.click("#m-capitulo-saltar");
  await page.click("#m-ver-otra-vez");
  await expect(page.locator("#m-carrera-vuelo")).toBeVisible();
  await holdClock(page);
  await nearFinish(page);
  await runUntil(page, "#m-carrera-llegada", 4000, 20);
  expect(await present(page, "#m-resultado")).toBe(false);
  // the watch's hold, then its result (no scene: a watch plays none)
  const held = await runUntil(page, "#m-resultado", 2000);
  expect(held).toBeGreaterThanOrEqual(1100);
  expect(await present(page, "#m-carrera-llegada")).toBe(false);
  await page.clock.resume();
  await page.click("#m-carrera-seguir");
  await page.click("#m-efectos");
  await expect(page.locator("#m-descansar")).toBeEnabled();
  expect(await week(page)).toBe(11);
  await page.click("#m-descansar");
  await expect(page.locator("#m-efectos")).toBeVisible();
});

test("a reload mid-race replays the race, and its natural end still holds the banner (D7, D5)", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.clock.install();
  await toRace(page);
  await page.reload();
  await continueRun(page);
  await expect(page.locator("#m-carrera-vuelo")).toBeVisible();
  await holdClock(page);
  await nearFinish(page);
  await runUntil(page, "#m-carrera-llegada", 4000);
  expect(await present(page, "#m-resultado")).toBe(false);
  await runUntil(page, "#m-capitulo", 1500);
});

/**
 * A scene seen in another season (`falconess.juego.historia`'s `ever`): it is passed by with a
 * notice, so the race card comes right after the emblem.
 */
async function seenEver(page: Page, id: string): Promise<void> {
  await page.addInitScript((scene) => {
    const key = "falconess.juego.historia";
    const story: { runs: Record<string, string[]>; ever: string[] } = JSON.parse(
      localStorage.getItem(key) ?? '{"runs":{},"ever":[]}',
    );
    if (story.ever.includes(scene)) return;
    story.ever.push(scene);
    localStorage.setItem(key, JSON.stringify(story));
  }, id);
}

/**
 * Week 10 of `peregrina-w10`: a rest, its effects ended by a tap with the clock held: the emblem.
 * With `passed`, that scene was seen in another season.
 */
async function toEmblem(page: Page, passed?: string): Promise<void> {
  await seedRun(page, "peregrina-w10");
  if (passed) await seenEver(page, passed);
  await page.goto("./");
  await continueRun(page);
  await page.click("#m-descansar");
  await expect(page.locator("#m-efectos")).toBeVisible();
  await holdClock(page);
  await page.click("#m-efectos");
  await settleUpdates(page);
}

/** At its start: the emblem in front, still clear, over the screen it rises from (the week's menu). */
async function emblemStarts(page: Page): Promise<void> {
  expect(await present(page, "#m-transicion")).toBe(true);
  expect(await present(page, '[data-screen="menu"]')).toBe(true);
  expect(await present(page, "#m-precarrera")).toBe(false);
  expect(await present(page, "[data-black]")).toBe(false);
  // its fade in: clear at its first frame, about half at 20 ms (--m-ease-out), opaque at 160 ms
  await freezeAt(page, 0);
  expect(await opacityOf(page, "#m-transicion")).toBeLessThan(0.05);
  await freezeAt(page, 20);
  const half = await opacityOf(page, "#m-transicion");
  expect(half).toBeGreaterThan(0.3);
  expect(half).toBeLessThan(0.7);
  await freezeAt(page, 160);
  expect(await opacityOf(page, "#m-transicion")).toBeGreaterThanOrEqual(0.99);
}

test("the emblem fades in over the week's menu, the scene's black takes the menu's place only once it is opaque, and it fades out onto the scene's black (M2, O6, rules 10-12)", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.clock.install();
  await toEmblem(page);
  await emblemStarts(page);
  // opaque (its timer counts from its first frame): the scene before the race comes next, so its
  // black is under the emblem now, never the race card (rule 11), and the emblem covers the game
  await page.clock.runFor(220);
  await settleUpdates(page);
  expect(await present(page, "[data-black]")).toBe(true);
  expect(await present(page, '[data-screen="menu"]')).toBe(false);
  expect(await present(page, "#m-precarrera")).toBe(false);
  await freezeAt(page, 220);
  expect((await coverage(page, "#m-transicion")).misses).toEqual([]);
  // the scene only after the emblem: none while its body plays (1.24 s from its first frame)
  await page.clock.runFor(1000);
  await settleUpdates(page);
  expect(await present(page, "#m-transicion")).toBe(true);
  expect(await present(page, "#m-capitulo")).toBe(false);
  // then it leaves: an id-less copy in front, and the scene in, on its own black under it (O6)
  await page.clock.runFor(60);
  await settleUpdates(page);
  expect(await present(page, "#m-transicion")).toBe(false);
  expect(await present(page, '[data-layer="emblem"][data-layer-phase="out"]')).toBe(true);
  await expect(page.locator("#m-capitulo")).toHaveAttribute("data-scene", "peregrina-debut");
  await freezeAt(page, 0);
  expect(await opacityOf(page, '[data-layer="emblem"] > *')).toBeGreaterThanOrEqual(0.99);
  // the copy takes no tap: every point of the game reaches the scene, black from its first frame
  expect((await coverage(page, "#m-capitulo")).misses).toEqual([]);
  // it fades out over 280 ms (--m-ease-out), and its timer removes it
  await freezeAt(page, 140);
  const mid = await opacityOf(page, '[data-layer="emblem"] > *');
  expect(mid).toBeGreaterThan(0.01);
  expect(mid).toBeLessThan(0.5);
  await freezeAt(page, 280);
  expect(await opacityOf(page, '[data-layer="emblem"] > *')).toBeLessThan(0.01);
  await page.clock.runFor(300);
  await settleUpdates(page);
  expect(await present(page, '[data-layer="emblem"]')).toBe(false);
  expect(await present(page, '[data-layer-phase="in"] #m-capitulo')).toBe(true);
});

test("the emblem with no scene after it: the race card takes the menu's place once it is opaque, and its fade-out uncovers the card, which takes «Correr» at once (M2, rule 11)", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.clock.install();
  await toEmblem(page, "peregrina-debut");
  await emblemStarts(page);
  await page.clock.runFor(220);
  await settleUpdates(page);
  expect(await present(page, "#m-precarrera")).toBe(true);
  expect(await present(page, "[data-black]")).toBe(false);
  expect(await present(page, '[data-screen="menu"]')).toBe(false);
  await freezeAt(page, 220);
  expect((await coverage(page, "#m-transicion")).misses).toEqual([]);
  await page.clock.runFor(1060);
  await settleUpdates(page);
  // its copy fades over the card, which is live from the copy's first frame
  expect(await present(page, "#m-transicion")).toBe(false);
  expect(await present(page, '[data-layer="emblem"][data-layer-phase="out"]')).toBe(true);
  await expect(page.locator("#m-correr")).toBeFocused();
  await page.click("#m-correr", { timeout: 2000 });
  await expect(page.locator("#m-carrera-vuelo")).toBeVisible();
});

/** The vigor bar's value (`data-vigor`). */
function vigorOf(page: Page): Promise<string | null> {
  return page.locator("#m-vigor").getAttribute("data-vigor");
}

/** Counts the calendar's page turns from now on (its number's flip starting), by the animation's name. */
async function watchFlips(page: Page): Promise<() => Promise<number>> {
  await page.evaluate(() => {
    let flips = 0;
    document.addEventListener("animationstart", (e) => {
      if (e.animationName.includes("calFlip")) flips++;
    });
    Reflect.set(window, "__flips", () => flips);
  });
  return () =>
    page.evaluate(() => {
      const read: unknown = Reflect.get(window, "__flips");
      return typeof read === "function" ? Number(read()) : -1;
    });
}

test("while the week's effects play, the HUD reads the week just played; it turns to the next one when they lift (O3)", async ({
  page,
}) => {
  await startMobile(page);
  const flips = await watchFlips(page);
  await page.click("#m-descansar");
  await expect(page.locator("#m-efectos")).toBeVisible();
  // week 1 under its own effects: the week she rested in, its page not turned
  expect(await week(page)).toBe(1);
  expect(await flips()).toBe(0);
  await page.click("#m-efectos");
  await expect.poll(() => week(page)).toBe(2);
  // the calendar turns its page once, as the effects leave
  await expect.poll(flips).toBe(1);
});

test("after a race week's training, the race's effects keep the vigor where the training put it, on the week raced (O3, L3)", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await seedRun(page, "peregrina-w10");
  await page.goto("./");
  await continueRun(page);
  const rested = await vigorOf(page);
  await page.click("#m-entrenar");
  await page.dblclick("#m-entrenar-technique");
  await expect(page.locator("#m-resultado")).toBeVisible();
  await toPosition(page);
  // the training's vigor landed during its result: the card's bar holds it
  const trained = await vigorOf(page);
  expect(trained).not.toBe(rested);
  await page.click("#m-correr");
  await runRace(page);
  await expect(page.locator("#m-efectos")).toBeVisible();
  // the race's effects: the week raced, and the bar where the week left it (never back to before)
  expect(await week(page)).toBe(10);
  const during = await vigorOf(page);
  expect(during).not.toBe(rested);
  await page.click("#m-efectos");
  await expect.poll(() => week(page)).toBe(11);
  // the effects lifted: the bar did not move
  expect(await vigorOf(page)).toBe(during);
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });
  test("the HUD turns to the next week at once when the effects lift, with no page turning (O3, §2.4)", async ({
    page,
  }) => {
    await startMobile(page);
    const flips = await watchFlips(page);
    await page.click("#m-descansar");
    await expect(page.locator("#m-efectos")).toBeVisible();
    expect(await week(page)).toBe(1);
    await page.click("#m-efectos");
    await expect.poll(() => week(page)).toBe(2);
    // a frame later still no page turning
    await page.evaluate(
      () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
    );
    expect(await flips()).toBe(0);
  });
});

// ---- 6.5: screens come in; the tablet's frame and the wide screen's column move; scrolls ----

/** The one screen's own box (the slot `[data-screen]` has none). */
const SCREEN = "[data-screen] > *";

/** A box on the page, rounded to the pixel. */
type Box = {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
};

/** What one frame held: the game's column and, while they are up, the week's effects and the notice. */
type Frame = {
  readonly app: Box & { readonly width: number };
  readonly fx: Box | null;
  readonly notice: Box | null;
  readonly end: boolean;
  readonly panel: boolean;
};

/**
 * Records every frame from now on for `ms` (the column's box, the effects' and the notice's, whether
 * the End and the wide screen's panel are on the page); the returned call waits for the end and
 * gives the frames.
 */
async function recordFrames(page: Page, ms: number): Promise<() => Promise<Frame[]>> {
  await page.evaluate((span) => {
    const box = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        left: Math.round(r.left),
        right: Math.round(r.right),
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
      };
    };
    const frames: unknown[] = [];
    const until = performance.now() + span;
    const frame = () => {
      const app = document.querySelector("[data-app]");
      const r = app?.getBoundingClientRect();
      frames.push({
        app: { ...box(app ?? null), width: Math.round(r?.width ?? 0) },
        fx: box(document.querySelector('[data-layer="fx"] > *')),
        notice: box(document.getElementById("m-capitulo-aviso")),
        end: document.getElementById("m-fin") !== null,
        panel: document.getElementById("m-panel") !== null,
      });
      if (performance.now() < until) requestAnimationFrame(frame);
      else Reflect.set(window, "__frames", frames);
    };
    Reflect.deleteProperty(window, "__frames");
    requestAnimationFrame(frame);
  }, ms);
  return async () => {
    await page.waitForFunction(() => Reflect.get(window, "__frames") !== undefined, null, {
      timeout: ms + 10_000,
    });
    return page.evaluate(() => Reflect.get(window, "__frames") as Frame[]);
  };
}

/** Whether `inner` lies inside `outer` (to the pixel). */
function inside(inner: Box, outer: Box): boolean {
  return (
    inner.left >= outer.left - 1 &&
    inner.right <= outer.right + 1 &&
    inner.top >= outer.top - 1 &&
    inner.bottom <= outer.bottom + 1
  );
}

test("a new screen fades in by opacity only and takes a tap from its first frame: «Entrenar», then a training (D1, M1)", async ({
  page,
}) => {
  await startMobile(page);
  await page.click("#m-entrenar");
  // its first frame: clear over the sky, in its place (no transform on a screen, ever)
  await freezeAt(page, 0);
  expect(await opacityOf(page, SCREEN)).toBeLessThan(0.05);
  expect(await page.locator(SCREEN).evaluate((el) => getComputedStyle(el).transform)).toBe("none");
  // the HUD stays: the anchor
  expect(await opacityOf(page, "[data-app] header")).toBe(1);
  // a training takes the tap at once, while the screen is still clear
  await page.click("#m-entrenar-agility", { timeout: 1000 });
  await expect(page.locator("#m-entrenar-agility")).toHaveAttribute("aria-pressed", "true");
  expect(await opacityOf(page, SCREEN)).toBeLessThan(0.05);
  // 200 ms, --m-ease-out: most of the way at 100, whole at 200
  await freezeAt(page, 100);
  const mid = await opacityOf(page, SCREEN);
  expect(mid).toBeGreaterThan(0.5);
  expect(mid).toBeLessThan(1);
  await freezeAt(page, 200);
  expect(await opacityOf(page, SCREEN)).toBe(1);
});

test("the season's first menu and the End come in over 320 ms, a later menu over 200 (D1)", async ({
  page,
}) => {
  const duration = () =>
    page.locator(SCREEN).evaluate((el) => getComputedStyle(el).animationDuration);
  await startMobile(page);
  expect(await duration()).toBe("0.32s");
  await page.click("#m-entrenar");
  expect(await duration()).toBe("0.2s");
  await page.click("#m-volver");
  await expect(page.locator("#m-entrenar")).toBeVisible();
  expect(await duration()).toBe("0.2s");
  // an ended season, opened at its End
  await page.evaluate(() => localStorage.clear());
  await seedRun(page, "peregrina-ended");
  await page.goto("./");
  await continueRun(page);
  await expect(page.locator("#m-fin")).toBeVisible();
  expect(await duration()).toBe("0.32s");
});

test("after the race mode the HUD comes back with a fade, with the menu; the HUD a run opens with does not fade (L5)", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await seedRun(page, "peregrina-w10");
  await page.goto("./");
  await continueRun(page);
  const hud = page.locator("[data-app] header");
  expect(await hud.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  await page.click("#m-descansar");
  await toPosition(page);
  await page.click("#m-correr");
  await expect(page.locator("#m-carrera-vuelo")).toBeVisible();
  await expect(hud).toHaveCount(0);
  await page.click("#m-saltar");
  await toResult(page);
  // the race's own notice, if any, has gone with its time
  await page.click("#m-carrera-seguir");
  await expect(page.locator("#m-efectos")).toBeVisible();
  await freezeAt(page, 0);
  expect(await opacityOf(page, "[data-app] header")).toBeLessThan(0.05);
  expect(await opacityOf(page, SCREEN)).toBeLessThan(0.05);
  await freezeAt(page, 200);
  expect(await opacityOf(page, "[data-app] header")).toBe(1);
  expect(await opacityOf(page, SCREEN)).toBe(1);
  // the calendar did not turn: it came back on the week raced (6.10)
  expect(await page.locator('[data-app] header [class*="calFlip"]').count()).toBe(0);
});

test("a tablet's frame widens for the race over 280 ms, and the flight view draws at its new width (L5, F26)", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1024, height: 768 });
  await seedRun(page, "peregrina-w10");
  await page.goto("./");
  await continueRun(page);
  await page.click("#m-descansar");
  await toPosition(page);
  expect((await page.locator("[data-app]").boundingBox())?.width).toBe(390);
  const frames = await recordFrames(page, 1500);
  await page.click("#m-correr");
  await expect(page.locator("#m-carrera-vuelo")).toBeVisible();
  const widths = (await frames()).map((f) => f.app.width);
  // from the card's 390 to the race's 720 through the frames between (never a jump)
  expect(widths.some((w) => w > 400 && w < 710)).toBe(true);
  expect(widths.at(-1)).toBe(720);
  for (let i = 1; i < widths.length; i++)
    expect(widths[i] ?? 0).toBeGreaterThanOrEqual(widths[i - 1] ?? 0);
  // the canvas' own pixels follow its wrapper as it widened (it was laid out at the frame's first
  // width): no stretched drawing
  const canvas = page.locator("#m-carrera-vuelo-lienzo");
  const wrapper = () =>
    canvas.evaluate((el) => Math.round(el.parentElement?.getBoundingClientRect().width ?? 0));
  expect(await wrapper()).toBeGreaterThan(400);
  await expect
    .poll(
      async () =>
        (await canvas.evaluate((el) => (el as HTMLCanvasElement).width)) - (await wrapper()),
    )
    .toBe(0);
});

test("under reduced motion a screen comes at once: no animation on it (§2.4)", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await startMobile(page);
  await page.click("#m-entrenar");
  await expect(page.locator("#m-entrenar-agility")).toBeVisible();
  expect(await page.locator(SCREEN).evaluate((el) => getComputedStyle(el).animationName)).toBe(
    "none",
  );
  expect(
    await page.evaluate(
      () =>
        document
          .getAnimations()
          .filter(
            (a) =>
              a.effect instanceof KeyframeEffect &&
              a.effect.target instanceof Element &&
              a.effect.target.matches("[data-screen] > *, [data-app] header"),
          ).length,
    ),
  ).toBe(0);
});

test("the wide screen: the End glides to the center as it comes, the panel gone, and the week's effects ride inside the column (L8, A.6)", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedRun(page, "peregrina-w48");
  await page.goto("./");
  await continueRun(page);
  await page.click("#m-descansar");
  await toPosition(page);
  await page.click("#m-correr");
  await page.click("#m-saltar");
  await toResult(page);
  const before = (await page.locator("[data-app]").boundingBox())?.x ?? 0;
  const frames = await recordFrames(page, 1500);
  await page.click("#m-carrera-seguir");
  const list = await frames();
  const atEnd = list.filter((f) => f.end);
  expect(atEnd.length).toBeGreaterThan(0);
  // the panel goes with the End's first frame; the column glides from beside it to the middle
  for (const f of atEnd) expect(f.panel).toBe(false);
  const lefts = atEnd.map((f) => f.app.left);
  const center = Math.round(1440 / 2 - (list[0]?.app.width ?? 0) / 2);
  expect(Math.abs((lefts.at(-1) ?? 0) - center)).toBeLessThanOrEqual(1);
  expect(lefts.some((x) => x > before + 4 && x < center - 4)).toBe(true);
  for (let i = 1; i < lefts.length; i++)
    expect(lefts[i] ?? 0).toBeGreaterThanOrEqual(lefts[i - 1] ?? 0);
  // the race's effects over the End move with the column (its transform holds them), never out
  const withFx = atEnd.filter((f) => f.fx !== null);
  expect(withFx.length).toBeGreaterThan(0);
  for (const f of withFx) expect(f.fx && inside(f.fx, f.app)).toBe(true);
  // the End's column keeps its width as it glides
  for (const f of atEnd) expect(f.app.width).toBe(list[0]?.app.width);
});

test("the wide screen resized: the notice and the week's effects stay inside the column, frame by frame (rule 18)", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  // a scene seen in another season: its notice on the menu
  await page.goto("./");
  await pastTitle(page);
  await page.click("#m-elegir-peregrina");
  await page.click("#m-empezar");
  await page.click("#m-capitulo-saltar");
  await expect(page.locator("#m-capitulo-aviso")).toBeVisible();
  let frames = await recordFrames(page, 700);
  await page.setViewportSize({ width: 1180, height: 760 });
  await page.waitForTimeout(150);
  await page.setViewportSize({ width: 1400, height: 880 });
  let list = (await frames()).filter((f) => f.notice !== null);
  expect(list.length).toBeGreaterThan(0);
  for (const f of list) expect(f.notice && inside(f.notice, f.app)).toBe(true);
  // the effects of a rest, resized under them
  await page.click("#m-descansar");
  await expect(page.locator("#m-efectos")).toBeVisible();
  frames = await recordFrames(page, 700);
  await page.setViewportSize({ width: 1180, height: 760 });
  await page.waitForTimeout(150);
  await page.setViewportSize({ width: 1440, height: 900 });
  list = (await frames()).filter((f) => f.fx !== null);
  expect(list.length).toBeGreaterThan(0);
  for (const f of list) expect(f.fx && inside(f.fx, f.app)).toBe(true);
});

test("a workshop tab opens at its top, whatever the last one was scrolled to (L6)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await startMobile(page);
  await page.click("#m-taller");
  // the wings' tab, down to its end
  const body = page.locator('[data-screen="workshop"] [class*="body"]');
  await page.locator("#m-taller-wings").evaluate((el) => (el as HTMLElement).click());
  const down = await body.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    return el.scrollTop;
  });
  expect(down).toBeGreaterThan(0);
  // the skills' tab (a tap where it is, the page not scrolled to it first)
  await page.locator("#m-taller-skills").evaluate((el) => (el as HTMLElement).click());
  await expect(page.locator("#m-taller-skills")).toHaveAttribute("aria-selected", "true");
  expect(await body.evaluate((el) => el.scrollTop)).toBe(0);
});

test("the wide screen's panel: a tab opens at its top, whatever the last one was scrolled to (L6)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedRun(page, "peregrina-w39-insp");
  await page.goto("./");
  await continueRun(page);
  await page.click("#m-panel-log");
  const body = page.locator('#m-panel [class*="deskBody"]');
  const down = await body.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    return el.scrollTop;
  });
  expect(down).toBeGreaterThan(0);
  await page.click("#m-panel-guide");
  await expect(page.locator("#m-panel-guide")).toHaveAttribute("aria-pressed", "true");
  expect(await body.evaluate((el) => el.scrollTop)).toBe(0);
});

test("a training's result across a resize into the wide screen: her stats still land on the foot (5.8, L5)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.clock.install();
  await startMobile(page);
  await page.click("#m-entrenar");
  await page.dblclick("#m-entrenar-agility");
  await expect(page.locator("#m-resultado")).toBeVisible();
  // the result holds (its timers wait on the clock) while the tablet's window grows into the wide
  // screen under it: the column changes its size and place, the result plays on in it
  await holdClock(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator("#m-panel")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        // the boxes' bottoms without the moves they carry (the stats' drop, the foot's fade)
        const bottom = (el: Element | null | undefined) => {
          if (!el) return Number.NaN;
          const t = getComputedStyle(el).transform;
          return el.getBoundingClientRect().bottom - (t === "none" ? 0 : new DOMMatrix(t).m42);
        };
        const strip = document.querySelector('[data-screen="train"] [class*="stripDown"]');
        const foot = document.getElementById("m-volver")?.closest('[class*="foot"]');
        // where the stats landed against where the foot stands now
        return Math.round((strip?.getBoundingClientRect().bottom ?? Number.NaN) - bottom(foot));
      }),
    )
    .toBe(0);
});

// ---- 6.6: a scene's way in (H4, M5, M10, O7) ----

/**
 * The selection with Peregrina picked under a held clock, then «Empezar»: her prologue (the
 * cinematic, with its painted hangar) starts, and its way in moves only as the test runs the clock.
 */
async function toPrologue(page: Page): Promise<void> {
  await page.clock.install();
  await page.goto("./");
  await pastTitle(page);
  await page.click("#m-elegir-peregrina");
  await holdClock(page);
  await page.click("#m-empezar");
  await expect(page.locator("#m-capitulo")).toHaveAttribute("data-scene", "peregrina-prologue");
}

/** Where the scene's way in is: «intro», «card» (the chapter's card whole) or «line». */
function beatOf(page: Page): Promise<string | null> {
  return page.locator("#m-capitulo").getAttribute("data-beat");
}

/** The scene's beat at every `step` ms of the held clock, `ms` on from now. */
async function beatsFor(page: Page, ms: number, step = 50): Promise<(string | null)[]> {
  const out: (string | null)[] = [];
  for (let t = 0; t < ms; t += step) {
    await page.clock.runFor(step);
    await settleUpdates(page);
    out.push(await beatOf(page));
  }
  return out;
}

/** How long, in ms, `beat` lasted in a run of samples `step` ms apart. */
function lasted(samples: readonly (string | null)[], beat: string, step = 50): number {
  return samples.filter((b) => b === beat).length * step;
}

const CARD = "#m-capitulo [data-card]";
const BACKDROP = "#m-capitulo img";

test("a scene comes in on its black, «Saltar» is there from 0.3 s, and a tap during its way in shows the chapter's card at once, the first line 0.5 s later (M10, O7)", async ({
  page,
}) => {
  await toPrologue(page);
  // rule 10 (owner): its first frame is opaque black
  await freezeAt(page, 0);
  expect((await coverage(page, "#m-capitulo")).misses).toEqual([]);
  expect(await beatOf(page)).toBe("intro");
  // the chrome fades in from 0.3 s, over 120 ms
  await freezeAt(page, 250);
  expect(await opacityOf(page, "#m-capitulo-saltar")).toBeLessThan(0.05);
  await freezeAt(page, 450);
  expect(await opacityOf(page, "#m-capitulo-saltar")).toBeGreaterThanOrEqual(0.95);
  await page.clock.runFor(600);
  await settleUpdates(page);
  expect(await beatOf(page)).toBe("intro");
  await freezeAt(page, 600);
  const backdrop = await opacityOf(page, BACKDROP);
  expect(backdrop).toBeGreaterThan(0.01);
  expect(backdrop).toBeLessThan(0.5);
  expect(await opacityOf(page, CARD)).toBeLessThan(0.01);
  // a tap at 600 ms: the card's beat at once, and nothing jumps at the tap…
  await page.click("#m-capitulo-seguir");
  expect(await beatOf(page)).toBe("card");
  await expect(page.locator("#m-capitulo")).toHaveAttribute("data-hurry", "");
  await freezeAt(page, 600);
  expect(Math.abs((await opacityOf(page, BACKDROP)) - backdrop)).toBeLessThan(0.02);
  expect(await opacityOf(page, CARD)).toBeLessThan(0.01);
  // …the way in catches up within 120 ms: the backdrop and the card whole
  await freezeAt(page, 720);
  expect(await opacityOf(page, BACKDROP)).toBeGreaterThanOrEqual(0.99);
  expect(await opacityOf(page, CARD)).toBeGreaterThanOrEqual(0.99);
  // the first line 500 ms after the tap (it came at 2.8 s untouched)
  await page.clock.runFor(450);
  await settleUpdates(page);
  expect(await beatOf(page)).toBe("card");
  await page.clock.runFor(60);
  await settleUpdates(page);
  expect(await beatOf(page)).toBe("line");
  await expect(page.locator("#m-capitulo")).toContainText(t("story.peregrina-prologue.1"));
});

test("a double tap during a scene's way in is one tap: the card, then a second tap shows the first line at once (F50, M10)", async ({
  page,
}) => {
  await toPrologue(page);
  await page.clock.runFor(600);
  await settleUpdates(page);
  await page.dblclick("#m-capitulo-seguir");
  await settleUpdates(page);
  expect(await beatOf(page)).toBe("card");
  await page.click("#m-capitulo-seguir");
  await settleUpdates(page);
  expect(await beatOf(page)).toBe("line");
  await expect(page.locator("#m-capitulo")).toContainText(t("story.peregrina-prologue.1"));
});

test("Rápido: the chapter's card shows whole for 0.7 s before it fades into the first line at 1.75 s (H4)", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("falconess.juego.ritmo", "fast"));
  await toPrologue(page);
  await expect(page.locator("#m-capitulo")).toHaveAttribute("data-digest", "true");
  const early = await beatsFor(page, 1000);
  // whole from 0.8 s to 1.5 s, then its 250 ms fade
  await freezeAt(page, 800);
  expect(await opacityOf(page, CARD)).toBeGreaterThanOrEqual(0.99);
  await freezeAt(page, 1490);
  expect(await opacityOf(page, CARD)).toBeGreaterThanOrEqual(0.99);
  await freezeAt(page, 1625);
  const fading = await opacityOf(page, CARD);
  expect(fading).toBeGreaterThan(0.1);
  expect(fading).toBeLessThan(0.9);
  const late = await beatsFor(page, 1000);
  const samples = [...early, ...late];
  expect(lasted(samples, "card")).toBeGreaterThanOrEqual(600);
  // the first line at 1.75 s
  expect(samples[33]).toBe("card");
  expect(samples[34]).toBe("line");
});

test.describe("reduced motion: a scene's way in", () => {
  test.use({ reducedMotion: "reduce" });
  test("the chapter's card stands whole from the scene's first frame for 0.9 s, then the first line (H4, §2.4)", async ({
    page,
  }) => {
    await toPrologue(page);
    expect(await beatOf(page)).toBe("card");
    await freezeAt(page, 0);
    expect(await opacityOf(page, CARD)).toBeGreaterThanOrEqual(0.99);
    await freezeAt(page, 890);
    expect(await opacityOf(page, CARD)).toBeGreaterThanOrEqual(0.99);
    const samples = await beatsFor(page, 1200);
    expect(lasted(samples, "card")).toBeGreaterThanOrEqual(850);
    expect(samples.at(-1)).toBe("line");
  });
});

// ---- 6.7: the week's effects in their cells, inside the tablet's frame (M6, H6, rule 18) ----

/** One frame of the effects and the notices: every box, against the game's column. */
type Boxes = {
  readonly app: Box;
  readonly fx: readonly Box[];
  readonly notices: readonly Box[];
};

/** The column, every `[data-fx]` box and every notice (a leaving copy too) on the page now. */
function boxesNow(page: Page): Promise<Boxes> {
  return page.evaluate(() => {
    const box = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    };
    const app = document.querySelector("[data-app]");
    return {
      app: app ? box(app) : { left: 0, right: 0, top: 0, bottom: 0 },
      fx: [...document.querySelectorAll("[data-fx]")].map(box),
      notices: [...document.querySelectorAll("#m-capitulo-aviso, [data-notice-leaving] > *")].map(
        box,
      ),
    };
  });
}

/** Every frame for `ms` from now: what `boxesNow` reads; the call waits for the end. */
async function recordBoxes(page: Page, ms: number): Promise<() => Promise<Boxes[]>> {
  await page.evaluate((span) => {
    const box = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    };
    const frames: unknown[] = [];
    const until = performance.now() + span;
    const frame = () => {
      const app = document.querySelector("[data-app]");
      frames.push({
        app: app ? box(app) : { left: 0, right: 0, top: 0, bottom: 0 },
        fx: [...document.querySelectorAll("[data-fx]")].map(box),
        notices: [...document.querySelectorAll("#m-capitulo-aviso, [data-notice-leaving] > *")].map(
          box,
        ),
      });
      if (performance.now() < until) requestAnimationFrame(frame);
      else Reflect.set(window, "__boxes", frames);
    };
    Reflect.deleteProperty(window, "__boxes");
    requestAnimationFrame(frame);
  }, ms);
  return async () => {
    await page.waitForFunction(() => Reflect.get(window, "__boxes") !== undefined, null, {
      timeout: ms + 10_000,
    });
    return page.evaluate(() => Reflect.get(window, "__boxes") as Boxes[]);
  };
}

/** Whether two boxes share any area. */
function overlap(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/** Every effect and notice inside the column, and no two effects over each other. */
function expectContained(f: Boxes, where: string): void {
  for (const [i, b] of f.fx.entries()) {
    expect(
      inside(b, f.app),
      `${where}: effect ${i} ${JSON.stringify(b)} in ${JSON.stringify(f.app)}`,
    ).toBe(true);
    for (const c of f.fx.slice(i + 1))
      expect(overlap(b, c), `${where}: effects over each other`).toBe(false);
  }
  for (const n of f.notices)
    expect(
      inside(n, f.app),
      `${where}: a notice ${JSON.stringify(n)} in ${JSON.stringify(f.app)}`,
    ).toBe(true);
}

for (const viewport of [
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
])
  test(`${viewport.width}×${viewport.height}: the notice and the week's effects (an outing's two) sit inside the game's column, none over another (H6, rule 18)`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await startMobile(page);
    // the skipped prologue's notice over the track tab
    await expect(page.locator("#m-capitulo-aviso")).toBeVisible();
    expectContained(await boxesNow(page), "the notice");
    // an outing: its bond and the mood it lifted, two effects at once
    await page.click("#m-salida");
    const sheet = page.locator("#m-salida-cuadrilla[open]");
    await expect(sheet).toBeVisible();
    const crew = (await sheet.locator("li[data-crew]").first().getAttribute("data-crew")) ?? "";
    await page.click(`#m-salida-con-${crew}`);
    const fx = page.locator("#m-efectos");
    await expect(fx).toBeVisible();
    await page.waitForTimeout(700);
    const now = await boxesNow(page);
    expect(now.fx.length).toBeGreaterThanOrEqual(2);
    expectContained(now, "the effects");
  });

test("a tablet's frame narrows after the race with its effects and its notice inside it, frame by frame (H6, L5)", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1024, height: 768 });
  await seedRun(page, "peregrina-w10");
  await page.goto("./");
  await continueRun(page);
  await page.click("#m-descansar");
  await toPosition(page);
  await page.click("#m-correr");
  await page.click("#m-saltar");
  await toResult(page);
  const frames = await recordBoxes(page, 1500);
  await page.click("#m-carrera-seguir");
  const list = await frames();
  // the race's effects come up while the frame narrows from the race's width to the menu's
  const widths = list.map((f) => Math.round(f.app.right - f.app.left));
  expect(widths.some((w) => w > 400 && w < 710)).toBe(true);
  const withFx = list.filter((f) => f.fx.length > 0);
  expect(withFx.length).toBeGreaterThan(0);
  for (const [i, f] of list.entries()) expectContained(f, `frame ${i}`);
});

test("1024×768: inside the tablet's frame the title's name and a scene's chapter card have a 390 px phone's sizes (H6, O14)", async ({
  page,
}) => {
  test.setTimeout(60_000);
  /** The sizes the title, the prologue's chapter card and the emblem's art take at this window. */
  const sizes = async () => {
    await page.goto("./");
    const name = await page
      .locator("#m-titulo [class*='word']")
      .evaluate((el) => getComputedStyle(el).fontSize);
    await pastTitle(page);
    await page.click("#m-elegir-peregrina");
    await page.click("#m-empezar");
    const card = page.locator("#m-capitulo [data-card] strong");
    await expect(card).toBeVisible();
    const chapter = await card.evaluate((el) => ({
      font: getComputedStyle(el).fontSize,
      lines: Math.round(
        el.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(el).lineHeight),
      ),
    }));
    return { name, chapter };
  };
  await page.setViewportSize({ width: 390, height: 844 });
  const phone = await sizes();
  await page.setViewportSize({ width: 1024, height: 768 });
  const tablet = await sizes();
  expect(tablet).toEqual(phone);
  expect(tablet.chapter.lines).toBe(1);
});

// ---- 6.11: a hidden tab (critic b: two clocks) ----

/** Hides the tab, or shows it again, and lets the page take it in. */
async function hideTab(page: Page, hidden: boolean): Promise<void> {
  await setTabHidden(page, hidden);
  await settleUpdates(page);
}

/** The held clock on by `ms`, and the page's updates in. */
async function run(page: Page, ms: number): Promise<void> {
  await page.clock.runFor(ms);
  await settleUpdates(page);
}

/** The game's CSS while the tab is hidden: every animation in the column stands paused. */
async function expectCssPaused(page: Page, scope = "[data-app]"): Promise<void> {
  const states = await cssPlayStates(page, scope);
  expect(states.running).toEqual([]);
  expect(states.paused).toBeGreaterThan(0);
}

test("a hidden tab holds the week's effects where they are, their sounds and their CSS too, and they end after the time they had left (critic b)", async ({
  page,
}) => {
  await page.clock.install();
  await startMobile(page);
  await expect(page.locator("[data-layer-phase]")).toHaveCount(0);
  const cues = await watchCues(page);
  await holdClock(page);
  await page.click("#m-descansar");
  await expect(page.locator("#m-efectos")).toBeVisible();
  await settleUpdates(page);
  // their time on Normal (fxTimeline): each 1.8 s, 160 ms after the one before, and a 0.5 s tail
  // (a rest's sleep, and its mood when it moved); 1 s of it seen
  expect(await page.locator('#m-efectos [data-fx="skills"]').count()).toBe(0);
  const total = 160 * ((await page.locator("#m-efectos [data-fx]").count()) - 1) + 1800 + 500;
  await run(page, 1000);
  expect(await present(page, "#m-efectos")).toBe(true);
  const heard = (await cues()).length;
  await hideTab(page, true);
  await expect(page.locator("[data-app]")).toHaveAttribute("data-hidden", "");
  await expectCssPaused(page);
  // three seconds in another tab: they are still up, on the week just played, and nothing sounded
  await run(page, 3000);
  expect(await present(page, "#m-efectos")).toBe(true);
  expect(await week(page)).toBe(1);
  expect((await cues()).slice(heard)).toEqual([]);
  await hideTab(page, false);
  await expect(page.locator("[data-app]")).not.toHaveAttribute("data-hidden");
  expect((await cssPlayStates(page)).paused).toBe(0);
  // back: they end when the time they had left is up
  await run(page, total - 1000 - 100);
  expect(await present(page, "#m-efectos")).toBe(true);
  await run(page, 200);
  expect(await present(page, "#m-efectos")).toBe(false);
  await expect.poll(() => week(page)).toBe(2);
});

test("a hidden tab: the week's effects never end out of sight, so the inheritance card after them, and its sound, wait for the tab (critic b)", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.clock.install();
  await seedRun(page, "peregrina-w39-insp");
  await page.goto("./");
  await continueRun(page);
  const cues = await watchCues(page);
  await holdClock(page);
  await page.click("#m-descansar");
  await expect(page.locator("#m-efectos")).toBeVisible();
  await settleUpdates(page);
  const heard = (await cues()).length;
  await hideTab(page, true);
  await run(page, 8000);
  // nothing of the week went on: no stamp sounded, no card came, nor its sound
  expect(await present(page, "#m-efectos")).toBe(true);
  expect(await present(page, "#m-inspiracion")).toBe(false);
  expect((await cues()).slice(heard)).toEqual([]);
  await hideTab(page, false);
  await runUntil(page, "#m-inspiracion", 6000);
  const after = (await cues()).slice(heard);
  expect(after.filter((c) => STAMP_CUES.has(c)).length).toBeGreaterThan(0);
  expect(after.at(-1)).toBe("boost");
});

test("a hidden tab holds a training's result: her stats counting up, the vigor bar's «±N» and its end wait, and go on with the time they had left (critic b, L3)", async ({
  page,
}) => {
  await page.clock.install();
  await startMobile(page);
  await expect(page.locator("[data-layer-phase]")).toHaveCount(0);
  await page.click("#m-entrenar");
  await expect(page.locator("#m-entrenar-agility")).toBeVisible();
  await holdClock(page);
  const vigor = await vigorOf(page);
  await page.dblclick("#m-entrenar-agility");
  await expect(page.locator("#m-resultado")).toBeVisible();
  await settleUpdates(page);
  // when the result's «±N» lands on the vigor bar: its pop's delay, ms from the result's start
  const at = await page
    .locator("#m-vigor-cambio > span")
    .evaluate((el) => (el instanceof HTMLElement ? Number.parseFloat(el.style.animationDelay) : 0));
  expect(at).toBeGreaterThan(500);
  const agility = page.locator('#m-stats [data-stat="agility"] > span:nth-child(2)');
  await run(page, 300);
  const from = await agility.textContent();
  expect(await vigorOf(page)).toBe(vigor);
  await hideTab(page, true);
  await expectCssPaused(page);
  await run(page, 5000);
  // out of sight nothing of it went on: the result, her stats where they were, the bar too
  expect(await present(page, "#m-resultado")).toBe(true);
  expect(await agility.textContent()).toBe(from);
  expect(await vigorOf(page)).toBe(vigor);
  expect(await week(page)).toBe(1);
  await hideTab(page, false);
  // the «±N» lands when it had left to: `at` from the result's start, 300 ms of it seen
  await run(page, at - 300 - 40);
  expect(await vigorOf(page)).toBe(vigor);
  expect(await agility.textContent()).not.toBe(from);
  await run(page, 80);
  expect(await vigorOf(page)).not.toBe(vigor);
  // and the result stays its hold after it (1.1 s), then the week goes on
  await run(page, 1000);
  expect(await present(page, "#m-resultado")).toBe(true);
  await runUntil(page, "#m-entrenar", 6000);
  await expect.poll(() => week(page)).toBe(2);
});

test("a hidden tab holds the emblem where it was, and its fading copy too: each goes on with the time it had left (M2, O6)", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.clock.install();
  await toEmblem(page);
  await run(page, 220);
  expect(await present(page, "[data-black]")).toBe(true);
  await run(page, 500);
  await hideTab(page, true);
  await expectCssPaused(page);
  await run(page, 3000);
  // still the emblem, and no scene behind it yet
  expect(await present(page, "#m-transicion")).toBe(true);
  expect(await present(page, "#m-capitulo")).toBe(false);
  await hideTab(page, false);
  // its 1.24 s: 720 ms of it seen, 520 left
  await run(page, 440);
  expect(await present(page, "#m-transicion")).toBe(true);
  await run(page, 120);
  const copy = '[data-layer="emblem"][data-layer-phase="out"]';
  expect(await present(page, "#m-transicion")).toBe(false);
  expect(await present(page, copy)).toBe(true);
  await expect(page.locator("#m-capitulo")).toHaveAttribute("data-scene", "peregrina-debut");
  // its copy fades over 280 ms: hidden 100 ms into it, it waits there
  await run(page, 100);
  await hideTab(page, true);
  await expectCssPaused(page, copy);
  await run(page, 2000);
  expect(await present(page, copy)).toBe(true);
  await hideTab(page, false);
  await run(page, 100);
  expect(await present(page, copy)).toBe(true);
  await run(page, 100);
  expect(await present(page, copy)).toBe(false);
});

test("a hidden tab holds a notice's time on screen, and its fading copy: each goes on with the time it had left (5.9)", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("./");
  await pastTitle(page);
  await page.click("#m-elegir-peregrina");
  await page.click("#m-empezar");
  await expect(page.locator("#m-capitulo")).toBeVisible();
  await holdClock(page);
  await page.click("#m-capitulo-saltar");
  // the prologue's exit (0.8 s), then its notice: found within 20 ms of its first frame
  await runUntil(page, "#m-capitulo-aviso", 2000, 20);
  await run(page, 1000);
  await hideTab(page, true);
  await expectCssPaused(page);
  await run(page, 6000);
  expect(await present(page, "#m-capitulo-aviso")).toBe(true);
  await hideTab(page, false);
  // its 4 s: 1 s of it seen, 3 s left
  await run(page, 2800);
  expect(await present(page, "#m-capitulo-aviso")).toBe(true);
  let left = 0;
  while (await present(page, "#m-capitulo-aviso")) {
    expect(left).toBeLessThan(400);
    await run(page, 20);
    left += 20;
  }
  // gone at its time: a copy fades out where it stood (400 ms); hidden 100 ms into it, it waits
  const copy = "[data-notice-leaving]";
  expect(await present(page, copy)).toBe(true);
  await run(page, 100);
  await hideTab(page, true);
  await expectCssPaused(page, copy);
  await run(page, 2000);
  expect(await present(page, copy)).toBe(true);
  await hideTab(page, false);
  await run(page, 200);
  expect(await present(page, copy)).toBe(true);
  await run(page, 150);
  expect(await present(page, copy)).toBe(false);
});

test("a hidden tab holds the race's finish banner: the race goes on with the hold it had left (D7)", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.clock.install();
  await toRace(page);
  await holdClock(page);
  await nearFinish(page);
  await runUntil(page, "#m-carrera-llegada", 4000, 20);
  await run(page, 400);
  await hideTab(page, true);
  await expectCssPaused(page);
  await run(page, 3000);
  expect(await present(page, "#m-carrera-llegada")).toBe(true);
  expect(await present(page, "#m-capitulo")).toBe(false);
  expect(await present(page, "#m-resultado")).toBe(false);
  await hideTab(page, false);
  // its 1.2 s: 400 ms of it seen
  await run(page, 700);
  expect(await present(page, "#m-carrera-llegada")).toBe(true);
  await runUntil(page, "#m-capitulo", 300, 20);
});

test("a hidden tab during a scene's way in: it waits where it was, and the first tap after it still shows the chapter's card, the first line 0.5 s later (M10)", async ({
  page,
}) => {
  await toPrologue(page);
  await run(page, 600);
  expect(await beatOf(page)).toBe("intro");
  await hideTab(page, true);
  await expectCssPaused(page);
  await run(page, 4000);
  // out of sight its way in went no further: no card, no line
  expect(await beatOf(page)).toBe("intro");
  await hideTab(page, false);
  await run(page, 100);
  expect(await beatOf(page)).toBe("intro");
  // a tap 700 ms into what she saw of it: the card at once, the line 0.5 s later
  await page.click("#m-capitulo-seguir");
  expect(await beatOf(page)).toBe("card");
  await run(page, 450);
  expect(await beatOf(page)).toBe("card");
  await run(page, 60);
  expect(await beatOf(page)).toBe("line");
  // its words come one by one as she watches, and stand where they were while the tab is hidden
  const words = () => page.locator('#m-capitulo [class*="wordOn"]').count();
  await run(page, 250);
  const typed = await words();
  expect(typed).toBeGreaterThan(0);
  await hideTab(page, true);
  await run(page, 3000);
  expect(await words()).toBe(typed);
  await hideTab(page, false);
  await run(page, 300);
  expect(await words()).toBeGreaterThan(typed);
});
