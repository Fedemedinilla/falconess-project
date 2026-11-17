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
  watchCues,
  week,
} from "./mobile-helpers";
import { coverage, freezeAt, opacityOf } from "./motion";

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
 */

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

/** Whether `selector` is in the page right now, without waiting for it. */
function present(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((sel) => document.querySelector(sel) !== null, selector);
}

/** Lets the page's own updates land (React commits on a posted message, a timer's too). */
async function settleUpdates(page: Page): Promise<void> {
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
async function holdClock(page: Page): Promise<void> {
  for (let tries = 0; ; tries++)
    try {
      await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
      return;
    } catch (error) {
      if (tries >= 4 || !String(error).includes("past")) throw error;
    }
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
