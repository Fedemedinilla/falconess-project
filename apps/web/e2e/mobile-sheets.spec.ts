import { expect } from "@playwright/test";
import { settle, startMobile, test, week } from "./mobile-helpers";

/**
 * The phone game's sheets (plan-final 2.5): each `<dialog>` is in the page only while it is open,
 * closes natively before it leaves (the focus goes back to what opened it), and a close request
 * (Escape) closes it as its own «Cerrar» does.
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
