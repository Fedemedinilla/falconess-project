import { expect, type Locator, type Page } from "@playwright/test";
import { continueRun, seedRun, test, toResult } from "./mobile-helpers";

/**
 * The season's end on the phone (plan-final 5.1): a race seen again from the End plays with no
 * emblem (it only ever goes from the week into the race mode, owner 2026-11-13) and comes back to
 * the End where the player left it; on the wide screen the End's column stays put through it.
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
