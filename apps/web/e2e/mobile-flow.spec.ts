import { expect, type Page } from "@playwright/test";
import { textPattern } from "./fixtures";
import { continueRun, seedRun, skipScene, startMobile, test } from "./mobile-helpers";

/**
 * The phone game's flow, now that the flow model drives it (plan-final 4.1): a sheet holds the
 * beat that comes while it is open and nothing else (a sheet in the page but closed holds nothing,
 * and a pick that closes its sheet does not hold what the pick starts), and a beat's timer keeps
 * its time whatever renders the game meanwhile (no identity churn).
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

test("a sheet in the page but closed holds nothing: the menu's and the race card's track sheets", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await seedRun(page, "peregrina-w10");
  await page.goto("./");
  await continueRun(page);
  // the menu's track sheet, opened and closed: its component stays in the page, closed
  await page.click("#m-pista-tab");
  await page.click("#m-pista");
  await expect(page.locator("#m-pista-dialogo[open]")).toBeVisible();
  await page.click("#m-pista-cerrar");
  await expect(page.locator("#m-pista-dialogo")).toHaveCount(0);
  // the race week's rest: what it did comes at once, then the emblem at a tap
  await page.click("#m-descansar");
  expect(await present(page, "#m-efectos")).toBe(true);
  await page.click("#m-efectos");
  expect(await present(page, "#m-transicion")).toBe(true);
  // her first race's scene plays over the decided card, whose own track sheet is in the page
  await expect(page.locator("#m-capitulo")).toHaveAttribute("data-scene", "peregrina-debut");
  await expect(page.locator("#m-precarrera")).toHaveCount(1);
  await skipScene(page);
  await page.click("#m-precarrera-pista");
  await expect(page.locator("#m-pista-dialogo[open]")).toBeVisible();
  await page.click("#m-pista-cerrar");
  await expect(page.locator("#m-pista-dialogo")).toHaveCount(0);
  await page.click("#m-correr");
  await page.click("#m-saltar");
  // and the scene after the race: nothing was left holding it
  await expect(page.locator("#m-capitulo")).toHaveAttribute("data-scene", "peregrina-debut-win");
});

test("a pick that closes its sheet does not hold what it starts: the outing's crew", async ({
  page,
}) => {
  await startMobile(page, "peregrina");
  await page.click("#m-salida");
  const sheet = page.locator("#m-salida-cuadrilla[open]");
  await expect(sheet).toBeVisible();
  const crew = (await sheet.locator("li[data-crew]").first().getAttribute("data-crew")) ?? "";
  await page.click(`#m-salida-con-${crew}`);
  // the sheet is released at its close request: the week's effects are there with the pick
  expect(await present(page, "#m-salida-cuadrilla")).toBe(false);
  expect(await present(page, '#m-efectos [data-fx="bond"]')).toBe(true);
});

/**
 * When a training's result ends, from what it shows: `resultTimeline` (flow/trainResult.ts) at
 * «Ritmo» Normal. One «+N» slot for each stat, the points, the vigor and each crew's bond, from
 * `firstPop` every `popStep`; the crews' cards from `crewIn`, one every `crewStep`, read for 450 ms;
 * then `hold`.
 */
async function resultEnd(page: Page): Promise<number> {
  const RESULT = { firstPop: 520, popStep: 300, crewIn: 540, crewStep: 150, hold: 1100 };
  const bond = textPattern("ui.m.crew.bondUp").source;
  const { pops, crews, bonds } = await page.evaluate((bondUp) => {
    const re = new RegExp(bondUp);
    const cards = [...document.querySelectorAll("#m-resultado-cuadrillas [data-crew]")];
    return {
      pops:
        document.querySelectorAll("#m-resultado-pops [data-delta]").length +
        document.querySelectorAll("#m-vigor-cambio").length,
      crews: cards.length,
      bonds: cards.filter((c) =>
        [...c.querySelectorAll("span")].some((s) => re.test(s.textContent ?? "")),
      ).length,
    };
  }, bond);
  const slots = pops + bonds;
  const lastPop = RESULT.firstPop + RESULT.popStep * Math.max(0, slots - 1);
  const crewsIn = RESULT.crewIn + RESULT.crewStep * Math.max(0, crews - 1) + 450;
  return Math.max(lastPop, crewsIn) + RESULT.hold;
}

test("a training's result ends on its timeline under the fake clock, a render meanwhile or not", async ({
  page,
}) => {
  await page.clock.install();
  await seedRun(page, "peregrina-w39-insp");
  await page.goto("./");
  await continueRun(page);
  await page.click("#m-entrenar");
  await page.click("#m-entrenar-agility");
  // the clock stands still from here: the result's timers run only as the test moves it on
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  await page.click("#m-entrenar-agility");
  await expect(page.locator("#m-resultado")).toBeVisible();
  const end = await resultEnd(page);
  await settleUpdates(page);
  await page.clock.runFor(600);
  // the game renders again in the middle of it: the wide screen and back (its tree stays)
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator("#m-panel")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#m-panel")).toHaveCount(0);
  await settleUpdates(page);
  await page.clock.runFor(end - 50 - 600);
  await settleUpdates(page);
  expect(await present(page, "#m-resultado")).toBe(true);
  await page.clock.runFor(100);
  await settleUpdates(page);
  expect(await present(page, "#m-resultado")).toBe(false);
});
