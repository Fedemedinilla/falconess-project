import { expect, type Page } from "@playwright/test";
import { continueRun, seedRun, startMobile, test, watchCues, week } from "./mobile-helpers";

/**
 * How the phone game's layers come and go (plan-final §1.9, §2, phase 6). 6.1: a layer that the
 * flow moved on from leaves as an id-less, inert copy that takes no tap and plays nothing, removed
 * by its timer (the week's effects in 240 ms, H2; the inheritance card in 240 ms, L1), while what
 * is under it is live; one gesture is one decision (a double tap's second click never reaches what
 * the first one mounted, critic b); while a layer is in front the game behind it is out of reach
 * and the layer's own control has the focus, which comes back to the screen's control when the
 * last layer goes (L7). Timing goes through the fake clock, held still where a moment matters.
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

/** Holds the fake clock still (a little ahead of now): timers run only as the test moves it on. */
async function holdClock(page: Page): Promise<void> {
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
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
  let early = true;
  try {
    await page.locator("#m-inspiracion-seguir").click({ trial: true, timeout: 600 });
  } catch {
    early = false;
  }
  expect(early).toBe(false);
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
