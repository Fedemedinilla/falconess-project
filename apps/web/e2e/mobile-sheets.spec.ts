import { expect, type Page } from "@playwright/test";
import { t } from "./fixtures";
import { continueRun, seedRun, settle, startMobile, test, week } from "./mobile-helpers";
import { freezeAt, holdClock, opacityOf, settleUpdates } from "./motion";

/**
 * The phone game's sheets (plan-final 2.5): each `<dialog>` is in the page only while it is open
 * or closing, closes natively before it leaves (the focus goes back to what opened it), and a close
 * request (Escape) closes it as its own «Cerrar» does. 6.9 (M8, M9): a sheet comes in over 220 ms
 * (opacity and a 16 px rise) with its scrim, and on its close request it fades out over 180 ms, still
 * modal (the page stays out of reach) but already released (what it started goes on at once, under
 * it), showing what it showed, then a timer closes it; the chat comes in over 240 ms and leaves over
 * 180 ms the same way.
 */

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test("no sheet is in the page until it opens, and each one leaves it when it closes", async ({
  page,
}) => {
  await startMobile(page, "peregrina");
  const dialogs = page.locator("dialog");
  await expect(dialogs).toHaveCount(0);
  await page.click("#m-menu");
  await expect(page.locator("#m-menu-dialogo[open]")).toBeVisible();
  await expect(dialogs).toHaveCount(1);
  // «Menú» → Metas: the menu's sheet gives its place to the panel's
  await page.click("#m-panel-abrir-goals");
  await expect(page.locator("#m-panel-hoja[open]")).toBeVisible();
  await expect(dialogs).toHaveCount(1);
  // a goal's track sheet over the panel's: two, then the panel's again
  await page.locator("#m-metas [data-turn]").first().click();
  await expect(page.locator("#m-pista-dialogo[open]")).toBeVisible();
  await expect(dialogs).toHaveCount(2);
  await page.click("#m-pista-cerrar");
  await expect(page.locator("#m-pista-dialogo")).toHaveCount(0);
  await expect(page.locator("#m-panel-hoja[open]")).toBeVisible();
  await page.click("#m-panel-hoja-cerrar");
  await expect(dialogs).toHaveCount(0);
  // the outing's sheet: a pick closes it and plays the week
  await page.click("#m-salida");
  await expect(page.locator("#m-salida-cuadrilla[open]")).toBeVisible();
  await page.locator("#m-salida-cuadrilla li[data-crew] button").first().click();
  await expect(page.locator("#m-salida-cuadrilla")).toHaveCount(0);
  await settle(page);
  expect(await week(page)).toBe(2);
  await expect(dialogs).toHaveCount(0);
});

test("Escape closes a sheet as «Cerrar» does, and the focus goes back to «Menú»", async ({
  page,
}) => {
  await startMobile(page, "peregrina");
  await page.focus("#m-menu");
  await page.keyboard.press("Enter");
  await expect(page.locator("#m-menu-dialogo[open]")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#m-menu-dialogo")).toHaveCount(0);
  await expect(page.locator("#m-menu")).toBeFocused();
  // and «Cerrar» by keyboard, the same way
  await page.keyboard.press("Enter");
  await expect(page.locator("#m-menu-dialogo[open]")).toBeVisible();
  await page.focus("#m-menu-cerrar");
  await page.keyboard.press("Enter");
  await expect(page.locator("#m-menu-dialogo")).toHaveCount(0);
  await expect(page.locator("#m-menu")).toBeFocused();
});

test("a sheet opened from «Menú» gives the focus back to «Menú» when it closes, though «Menú» was still on its way out when it opened (6.9, parity check of phase 6)", async ({
  page,
}) => {
  await startMobile(page, "peregrina");
  // a panel (Metas), «Temporadas anteriores», «Historia», «Exportar partida»: each opens as «Menú»
  // fades out, from a button inside it that leaves the page with it
  for (const [open, sheet, close] of [
    ["#m-panel-abrir-goals", "#m-panel-hoja", "#m-panel-hoja-cerrar"],
    ["#m-temporadas", "#m-historial", "#m-historial-cerrar"],
    ["#m-historia-abrir", "#m-historia", "#m-historia-cerrar"],
    ["#m-exportar-partida", "#m-exportar", "#m-exportar-cerrar"],
  ] as const) {
    await page.click("#m-menu");
    await expect(page.locator("#m-menu-dialogo[open]")).toBeVisible();
    await page.click(open);
    await expect(page.locator(`${sheet}[open]`)).toBeVisible();
    await expect(page.locator("#m-menu-dialogo")).toHaveCount(0);
    await page.click(close);
    await expect(page.locator(sheet)).toHaveCount(0);
    await expect(page.locator("#m-menu"), `after ${close}`).toBeFocused();
  }
});

test("the wide screen: its panel is the menu, and no sheet waits closed in the page", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await startMobile(page, "peregrina");
  await expect(page.locator("#m-panel")).toBeVisible();
  await expect(page.locator("dialog")).toHaveCount(0);
  await page.click("#m-historia-abrir");
  await expect(page.locator("#m-historia[open]")).toBeVisible();
  await page.click("#m-historia-cerrar");
  await expect(page.locator("#m-historia")).toHaveCount(0);
  await expect(page.locator("#m-historia-abrir")).toBeFocused();
});

/** Whether the page under the sheets takes a tap at the middle of `selector` (a modal blocks it). */
function reachable(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return hit !== null && el.contains(hit);
  }, selector);
}

/** A dialog's scrim as the eye gets it: its `::backdrop`'s opacity. */
function scrimOf(page: Page, selector: string): Promise<number> {
  return page
    .locator(selector)
    .evaluate((el) => Number(getComputedStyle(el, "::backdrop").opacity));
}

test("«Menú» comes in over 220 ms with its scrim; «Cerrar» fades it out over 180 ms, the page out of reach until it leaves (M9)", async ({
  page,
}) => {
  await page.clock.install();
  await startMobile(page, "peregrina");
  await holdClock(page);
  await page.click("#m-menu");
  const sheet = page.locator("#m-menu-dialogo");
  await expect(sheet).toHaveAttribute("open");
  await freezeAt(page, 0);
  expect(await opacityOf(page, "#m-menu-dialogo")).toBeLessThan(0.05);
  expect(await scrimOf(page, "#m-menu-dialogo")).toBeLessThan(0.05);
  await freezeAt(page, 110);
  const rising = await sheet.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).f);
  expect(rising).toBeGreaterThan(0);
  expect(rising).toBeLessThan(16);
  await freezeAt(page, 220);
  expect(await opacityOf(page, "#m-menu-dialogo")).toBeGreaterThanOrEqual(0.99);
  expect(await scrimOf(page, "#m-menu-dialogo")).toBeGreaterThanOrEqual(0.99);
  await page.click("#m-menu-cerrar");
  // its close request: it fades out where it stood, its buttons out of reach, the page too
  await expect(sheet).toHaveAttribute("data-closing");
  expect(await sheet.evaluate((el) => (el as HTMLElement).inert)).toBe(true);
  expect(await reachable(page, "#m-entrenar")).toBe(false);
  await freezeAt(page, 90);
  const fading = await opacityOf(page, "#m-menu-dialogo");
  expect(fading).toBeGreaterThan(0.05);
  expect(fading).toBeLessThan(0.95);
  await freezeAt(page, 180);
  expect(await opacityOf(page, "#m-menu-dialogo")).toBeLessThan(0.05);
  // its timer closes it: out of the page, the focus back on «Menú», the page in reach
  await page.clock.runFor(200);
  await settleUpdates(page);
  await expect(sheet).toHaveCount(0);
  await expect(page.locator("#m-menu")).toBeFocused();
  expect(await reachable(page, "#m-entrenar")).toBe(true);
});

test("an outing pick: the race week's effects come at once under the closing sheet, which shows what it showed until it leaves (6.9, F10)", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.clock.install();
  await seedRun(page, "peregrina-w10");
  await page.goto("./");
  await continueRun(page);
  await page.click("#m-salida");
  const sheet = page.locator("#m-salida-cuadrilla");
  await expect(sheet.locator("li[data-crew]").first()).toBeVisible();
  const crew = (await sheet.locator("li[data-crew]").first().getAttribute("data-crew")) ?? "";
  const bond = sheet.locator(`li[data-crew="${crew}"] [role="img"]`);
  const before = await bond.getAttribute("aria-label");
  await holdClock(page);
  await page.click(`#m-salida-con-${crew}`);
  // at once (the clock held): released at its close request, so the effects of the outing are up
  await expect(page.locator("#m-efectos")).toHaveCount(1);
  await expect(sheet).toHaveAttribute("data-closing");
  // the sheet fades out with the bond it showed (the week has moved on under it)
  expect(await bond.getAttribute("aria-label")).toBe(before);
  await page.clock.runFor(200);
  await settleUpdates(page);
  await expect(sheet).toHaveCount(0);
  await expect(page.locator("#m-efectos")).toHaveCount(1);
});

test("a panel's sheet keeps its title and its panel while it fades out (6.9)", async ({ page }) => {
  await page.clock.install();
  await startMobile(page, "peregrina");
  await page.click("#m-menu");
  await page.click("#m-panel-abrir-goals");
  const sheet = page.locator("#m-panel-hoja");
  await expect(sheet.locator("#m-metas")).toBeVisible();
  await holdClock(page);
  await page.click("#m-panel-hoja-cerrar");
  await expect(sheet).toHaveAttribute("data-closing");
  await expect(page.locator("#m-panel-hoja-titulo")).toHaveText(t("ui.m.panel.goals"));
  await expect(sheet.locator("#m-metas [data-turn]").first()).toBeAttached();
  await page.clock.runFor(200);
  await settleUpdates(page);
  await expect(sheet).toHaveCount(0);
});

test("the chat comes in over 240 ms, rising, and leaves over 180 ms when closed (M8)", async ({
  page,
}) => {
  await page.clock.install();
  await startMobile(page, "peregrina");
  await page.click("#m-menu");
  await expect(page.locator("#m-menu-dialogo")).toHaveAttribute("open");
  await holdClock(page);
  await page.click("#m-chat-abrir");
  const chat = page.locator("#m-chat");
  await expect(chat).toBeAttached();
  await freezeAt(page, 0);
  expect(await opacityOf(page, "#m-chat")).toBeLessThan(0.05);
  expect(await chat.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).f)).toBe(24);
  await freezeAt(page, 240);
  expect(await opacityOf(page, "#m-chat")).toBeGreaterThanOrEqual(0.99);
  expect(await chat.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).f)).toBe(0);
  // the Menú sheet under it has left by its timer
  await page.clock.runFor(200);
  await settleUpdates(page);
  await expect(page.locator("#m-menu-dialogo")).toHaveCount(0);
  await page.click("#m-chat-cerrar");
  await expect(chat).toHaveAttribute("data-closing");
  expect(await chat.evaluate((el) => (el as HTMLElement).inert)).toBe(true);
  await freezeAt(page, 90);
  const fading = await opacityOf(page, "#m-chat");
  expect(fading).toBeGreaterThan(0.05);
  expect(fading).toBeLessThan(0.95);
  await page.clock.runFor(200);
  await settleUpdates(page);
  await expect(chat).toHaveCount(0);
});

test("an outing's effects, which come in under the closing sheet, take the focus once it has gone (6.9, L7)", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.clock.install();
  await seedRun(page, "peregrina-w10");
  await page.goto("./");
  await continueRun(page);
  await page.click("#m-salida");
  const outing = page.locator("#m-salida-cuadrilla");
  await expect(outing.locator("li[data-crew]").first()).toBeVisible();
  await holdClock(page);
  await outing.locator("li[data-crew] button").first().click();
  await page.clock.runFor(200);
  await settleUpdates(page);
  await expect(outing).toHaveCount(0);
  await expect(page.locator("#m-efectos")).toBeFocused();
});

test("a scene asked for from «Historia» takes the focus once the sheet has gone (6.9, L7)", async ({
  page,
}) => {
  await startMobile(page, "peregrina");
  await page.click("#m-menu");
  await page.click("#m-historia-abrir");
  await page.click('#m-historia [data-scene="peregrina-prologue"] button');
  await expect(page.locator("#m-historia")).toHaveCount(0);
  await expect(page.locator("#m-capitulo")).toHaveAttribute("data-scene", "peregrina-prologue");
  await expect(page.locator("#m-capitulo-seguir")).toBeFocused();
});
