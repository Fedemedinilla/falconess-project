import { expect, type Locator, type Page } from "@playwright/test";
import {
  continueRun,
  seedRun,
  skipScene,
  test,
  toPosition,
  toResult,
  week,
} from "./mobile-helpers";

/**
 * The season's end on the phone. A race seen again from the End plays with no emblem (it only
 * ever goes from the week into the race mode, owner 2026-11-13) and comes back to the End where the
 * player left it; on the wide screen the End's column stays put through it (plan-final 5.1). The
 * week that ends the season plays whole before the End (5.4, F3): a training's result, or the race
 * with its scene and its result, then the week's effects over the End; the season's black box is
 * kept at the tap that ended it, before any of that.
 */

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

/** Starts watching for the emblem: whether `#m-transicion` was ever in the page from now on. */
async function watchEmblem(page: Page): Promise<() => Promise<boolean>> {
  await page.evaluate(() => {
    const seen = () => document.getElementById("m-transicion") !== null;
    Reflect.set(window, "__emblem", seen());
    new MutationObserver(() => {
      if (seen()) Reflect.set(window, "__emblem", true);
    }).observe(document.body, { childList: true, subtree: true });
  });
  return () => page.evaluate(() => Reflect.get(window, "__emblem") === true);
}

/** The End's scrolling column: the one that holds `#m-fin`. */
function endBody(page: Page): Locator {
  return page.locator("#m-fin").locator("xpath=..");
}

test("«Ver carrera» from the End: the race with no emblem, then the End at the same scroll", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await seedRun(page, "peregrina-ended");
  await page.goto("./");
  await continueRun(page);
  await expect(page.locator("#m-fin")).toBeVisible();
  // down the End, to its last race
  const body = endBody(page);
  await body.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  const link = page.locator("#m-fin-carrera-48");
  await link.scrollIntoViewIfNeeded();
  const before = await body.evaluate((el) => el.scrollTop);
  expect(before).toBeGreaterThan(0);
  const emblem = await watchEmblem(page);
  await link.click();
  await expect(page.locator("#m-carrera-vuelo")).toBeVisible();
  await page.waitForTimeout(1600);
  expect(await emblem()).toBe(false);
  await page.click("#m-saltar");
  await toResult(page);
  await page.click("#m-carrera-seguir");
  await expect(page.locator("#m-fin")).toBeVisible();
  expect(await endBody(page).evaluate((el) => el.scrollTop)).toBe(before);
  expect(await emblem()).toBe(false);
});

test("the wide screen: the End's column does not move while its race plays again", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedRun(page, "peregrina-ended");
  await page.goto("./");
  await continueRun(page);
  await expect(page.locator("#m-fin")).toBeVisible();
  const column = page.locator("[data-app]");
  const left = async () => (await column.boundingBox())?.x;
  const atEnd = await left();
  expect(atEnd).toBeDefined();
  await expect(page.locator("#m-panel")).toHaveCount(0);
  await page.click("#m-fin-carrera-10");
  await expect(page.locator("#m-carrera-vuelo")).toBeVisible();
  expect(await left()).toBe(atEnd);
  await expect(page.locator("#m-panel")).toHaveCount(0);
  await page.click("#m-saltar");
  await toResult(page);
  expect(await left()).toBe(atEnd);
  await expect(page.locator("#m-panel")).toHaveCount(0);
  await page.click("#m-carrera-seguir");
  await expect(page.locator("#m-fin")).toBeVisible();
  expect(await left()).toBe(atEnd);
});

/** The black boxes this browser kept (`falconess.juego.cajas`, ADR-0013): how many. */
function boxes(page: Page): Promise<number> {
  return page.evaluate(() => {
    const raw = localStorage.getItem("falconess.juego.cajas");
    const list: unknown = raw === null ? [] : JSON.parse(raw);
    return Array.isArray(list) ? list.length : 0;
  });
}

test("the non-race finale (Caracara, week 48): her training's result first, then the End", async ({
  page,
}) => {
  await seedRun(page, "caracara-w48");
  await page.goto("./");
  await continueRun(page);
  expect(await week(page)).toBe(48);
  await page.click("#m-entrenar");
  await page.dblclick("#m-entrenar-technique");
  // the season ended with this training: its result shows on the training screen, the End waits
  await expect(page.locator("#m-resultado")).toHaveAttribute("data-outcome", "success");
  await expect(page.locator("#m-fin")).toHaveCount(0);
  expect(await week(page)).toBe(48);
  await page.click("#m-resultado-seguir");
  // no effect of the week to show (it read at once): the End
  await expect(page.locator("#m-fin")).toBeVisible();
  await expect(page.locator("#m-efectos")).toHaveCount(0);
});

test("the race finale (Peregrina, week 48): the box kept at «Correr», the race, then its effects over the End", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await seedRun(page, "peregrina-w48");
  await page.goto("./");
  await continueRun(page);
  await page.click("#m-descansar");
  await toPosition(page);
  expect(await boxes(page)).toBe(0);
  await page.click("#m-correr");
  // the season ended at «Correr»: its box is kept already, long before the End
  await expect(page.locator("#m-carrera-vuelo")).toBeVisible();
  expect(await boxes(page)).toBe(1);
  await expect(page.locator("#m-fin")).toHaveCount(0);
  await page.click("#m-saltar");
  await toResult(page);
  await expect(page.locator("#m-fin")).toHaveCount(0);
  await page.click("#m-carrera-seguir");
  // the race's effects (her mood, the points) play over the End, mounted under them and inert
  await expect(page.locator("#m-efectos")).toBeVisible();
  await expect(page.locator("#m-fin")).toHaveCount(1);
  await expect(page.locator('[data-screen="end"][inert] #m-fin')).toHaveCount(1);
  await page.click("#m-efectos");
  await expect(page.locator("#m-efectos")).toHaveCount(0);
  await expect(page.locator("#m-fin")).toBeVisible();
  await expect(page.locator("[data-screen][inert]")).toHaveCount(0);
  expect(await boxes(page)).toBe(1);
  // the week was read: a reload opens the End with nothing over it
  await page.reload();
  await continueRun(page);
  await expect(page.locator("#m-fin")).toBeVisible();
  await expect(page.locator("#m-efectos")).toHaveCount(0);
  expect(await boxes(page)).toBe(1);
});

test("the wide screen: the panel stays through the season's last race, the column with it, until the End", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedRun(page, "peregrina-w48");
  await page.goto("./");
  await continueRun(page);
  await page.click("#m-descansar");
  await toPosition(page);
  const column = page.locator("[data-app]");
  const left = async () => (await column.boundingBox())?.x;
  const atCard = await left();
  expect(atCard).toBeDefined();
  await expect(page.locator("#m-panel")).toHaveCount(1);
  await page.click("#m-correr");
  await expect(page.locator("#m-carrera-vuelo")).toBeVisible();
  // the season ended, but its End is not on screen yet: the panel and the column stay
  await expect(page.locator("#m-panel")).toHaveCount(1);
  expect(await left()).toBe(atCard);
  await page.click("#m-saltar");
  await toResult(page);
  await expect(page.locator("#m-panel")).toHaveCount(1);
  expect(await left()).toBe(atCard);
  await page.click("#m-carrera-seguir");
  // the End comes with the race's effects over it: its lone column, no panel
  await expect(page.locator("#m-efectos")).toBeVisible();
  await expect(page.locator("#m-fin")).toHaveCount(1);
  await expect(page.locator("#m-panel")).toHaveCount(0);
  await page.click("#m-efectos");
  await expect(page.locator("#m-fin")).toBeVisible();
});

test("a goal failed in a race (Peregrina, week 10): the ending scene before the result, then the race's effects over the End", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await seedRun(page, "peregrina-w10-lose");
  await page.goto("./");
  await continueRun(page);
  await page.click("#m-descansar");
  await toPosition(page);
  await page.click("#m-correr");
  await expect(page.locator("#m-carrera-vuelo")).toBeVisible();
  await page.click("#m-saltar");
  await expect(page.locator("#m-capitulo")).toHaveAttribute("data-scene", "peregrina-end-failed");
  await expect(page.locator("#m-resultado")).toHaveCount(0);
  await skipScene(page);
  await expect(page.locator("#m-resultado")).toBeVisible();
  await page.click("#m-carrera-seguir");
  await expect(page.locator("#m-efectos")).toBeVisible();
  await expect(page.locator("#m-fin")).toHaveCount(1);
  await page.click("#m-efectos");
  await expect(page.locator("#m-efectos")).toHaveCount(0);
  await expect(page.locator("#m-fin")).toBeVisible();
});
