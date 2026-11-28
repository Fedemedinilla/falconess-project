import { expect, type Page } from "@playwright/test";
import { t } from "./fixtures";
import { continueRun, seedRun, settle, startMobile, test, week } from "./mobile-helpers";
import { freezeAt, holdClock, opacityOf, settleUpdates } from "./motion";

/**
 * The phone game's sheets (plan-final 2.5): each `<dialog>` is in the page only while it is open
 * or closing, closes natively before it leaves (the focus goes back to what opened it), and a close
 * request (Escape) closes it as its own «Cerrar» does. 6.9 (M8, M9): a sheet comes in over 220 ms
 * (opacity and a 16 px rise) with its scrim. On its close request it closes natively at once (open
 * decision 2, 2026-11-28: the page is in reach from that tap, the focus back where it was) and an
 * id-less, inert copy of what it showed fades out over 180 ms with its scrim, until a timer removes
 * it; the chat comes in over 240 ms and leaves over 180 ms.
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
  await page.click("#m-menu-cerrar");
  await expect(dialogs).toHaveCount(0);
  // the rail's Metas: its panel's sheet, and nothing else in the page
  await page.click("#m-leer-goals");
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
  // Metas opens from the week menu's rail (owner 2026-11-18): the focus goes back to its button
  await page.click("#m-leer-goals");
  await expect(page.locator("#m-panel-hoja[open]")).toBeVisible();
  await page.click("#m-panel-hoja-cerrar");
  await expect(page.locator("#m-panel-hoja")).toHaveCount(0);
  await expect(page.locator("#m-leer-goals")).toBeFocused();
  // «Historia» from the root, «Temporadas anteriores» and «Exportar partida» from «Partida»: each
  // opens as the sheet it was asked from fades out, from a button that leaves the page with it,
  // and the focus goes back through those sheets to «Menú»
  for (const [via, open, sheet, close] of [
    [undefined, "#m-historia-abrir", "#m-historia", "#m-historia-cerrar"],
    ["#m-grupo-partida", "#m-temporadas", "#m-historial", "#m-historial-cerrar"],
    ["#m-grupo-partida", "#m-exportar-partida", "#m-exportar", "#m-exportar-cerrar"],
  ] as const) {
    await page.click("#m-menu");
    await expect(page.locator("#m-menu-dialogo[open]")).toBeVisible();
    if (via) {
      await page.click(via);
      await expect(page.locator("#m-partida-hoja[open]")).toBeVisible();
    }
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

test("«Menú» comes in over 220 ms with its scrim; «Cerrar» closes it at once and its copy fades out over 180 ms, the page in reach (M9, open decision 2)", async ({
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
  // its close request: the sheet is closed at once, the focus back on «Menú», the page in reach;
  // a copy of it fades out where it stood, with its scrim, id-less and out of reach
  await expect(sheet).not.toHaveAttribute("open");
  await expect(page.locator("#m-menu")).toBeFocused();
  expect(await reachable(page, "#m-entrenar")).toBe(true);
  const copy = page.locator("[data-sheet-copy]");
  await expect(copy).toHaveCount(1);
  await expect(copy).toHaveAttribute("data-closing");
  await expect(copy).toHaveAttribute("aria-hidden", "true");
  expect(await copy.evaluate((el) => (el as HTMLElement).inert)).toBe(true);
  await expect(copy.locator("[id]")).toHaveCount(0);
  await expect(copy.locator("h2")).toHaveText(t("ui.m.menu"));
  await freezeAt(page, 90);
  const fading = await opacityOf(page, "[data-sheet-copy]");
  expect(fading).toBeGreaterThan(0.05);
  expect(fading).toBeLessThan(0.95);
  const scrim = await scrimOf(page, "[data-sheet-copy]");
  expect(scrim).toBeGreaterThan(0.05);
  expect(scrim).toBeLessThan(0.95);
  await freezeAt(page, 180);
  expect(await opacityOf(page, "[data-sheet-copy]")).toBeLessThan(0.05);
  // its timer removes the copy and the sheet leaves the page
  await page.clock.runFor(200);
  await settleUpdates(page);
  await expect(copy).toHaveCount(0);
  await expect(sheet).toHaveCount(0);
  await expect(page.locator("#m-menu")).toBeFocused();
  expect(await reachable(page, "#m-entrenar")).toBe(true);
});

test("a tap on the game while a sheet fades out reaches it: «Entrenar» inside «Menú»'s 180 ms (open decision 2, 2026-11-28)", async ({
  page,
}) => {
  await page.clock.install();
  await startMobile(page, "peregrina");
  await page.click("#m-menu");
  await expect(page.locator("#m-menu-dialogo[open]")).toBeVisible();
  // the clock held: the sheet's 180 ms never end while the tap comes
  await holdClock(page);
  await page.click("#m-menu-cerrar");
  await page.click("#m-entrenar", { timeout: 3000 });
  await expect(page.locator("#m-entrenar-agility")).toBeVisible();
});

test("a sheet asked open again while it fades out opens on its title (open decision 2, 2026-11-28)", async ({
  page,
}) => {
  await page.clock.install();
  await startMobile(page, "peregrina");
  await page.click("#m-menu");
  await expect(page.locator("#m-menu-dialogo[open]")).toBeVisible();
  await holdClock(page);
  await page.click("#m-menu-cerrar");
  await page.click("#m-menu", { timeout: 3000 });
  await expect(page.locator("#m-menu-dialogo[open]")).toBeVisible();
  await expect(page.locator("#m-menu-titulo")).toBeFocused();
  // one «Menú» on screen: the copy that was fading went with the open
  await expect(page.locator("[data-sheet-copy]")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.clock.runFor(200);
  await settleUpdates(page);
  await expect(page.locator("dialog")).toHaveCount(0);
  await expect(page.locator("#m-menu")).toBeFocused();
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
  // the sheet's copy fades out with the bond it showed (the week has moved on under it)
  const copy = page.locator("[data-sheet-copy]");
  await expect(copy).toHaveAttribute("data-closing");
  expect(
    await copy.locator(`li[data-crew="${crew}"] [role="img"]`).getAttribute("aria-label"),
  ).toBe(before);
  await page.clock.runFor(200);
  await settleUpdates(page);
  await expect(copy).toHaveCount(0);
  await expect(sheet).toHaveCount(0);
  await expect(page.locator("#m-efectos")).toHaveCount(1);
});

test("a panel's sheet keeps its title and its panel while it fades out (6.9)", async ({ page }) => {
  await page.clock.install();
  await startMobile(page, "peregrina");
  await page.click("#m-leer-goals");
  const sheet = page.locator("#m-panel-hoja");
  await expect(sheet.locator("#m-metas")).toBeVisible();
  await holdClock(page);
  await page.click("#m-panel-hoja-cerrar");
  const copy = page.locator("[data-sheet-copy]");
  await expect(copy).toHaveAttribute("data-closing");
  await expect(copy.locator("h2")).toHaveText(t("ui.m.panel.goals"));
  await expect(copy.locator("[data-turn]").first()).toBeAttached();
  await page.clock.runFor(200);
  await settleUpdates(page);
  await expect(copy).toHaveCount(0);
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

/** Whether the focus is inside `#m-chat` (or out of the page, past its last control). */
function focusInChat(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const a = document.activeElement;
    return a === null || a === document.body || a.closest("#m-chat") !== null;
  });
}

test("the chat is a modal sheet: the focus goes into it, no key reaches the game under it, Escape closes it, and the focus goes back to «Menú» (final review C4, P4)", async ({
  page,
}) => {
  await startMobile(page, "peregrina");
  await page.focus("#m-menu");
  await page.keyboard.press("Enter");
  await expect(page.locator("#m-menu-dialogo[open]")).toBeVisible();
  await page.focus("#m-chat-abrir");
  await page.keyboard.press("Enter");
  await expect(page.locator("#m-chat")).toBeVisible();
  await expect(page.locator("#m-menu-dialogo")).toHaveCount(0);
  // the focus is in the chat once «Menú» has gone, and the game under it is inert
  await expect(page.locator("#m-chat-cerrar")).toBeFocused();
  for (const id of ["#m-menu", "#m-descansar", "#m-entrenar", "#m-pista-tab"])
    expect(await page.locator(id).evaluate((el) => el.closest("[inert]") !== null), id).toBe(true);
  // Tab walks the chat only
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press("Tab");
    expect(await focusInChat(page), `tab ${i}`).toBe(true);
  }
  // Enter cannot commit a week under it: «Descansar» takes no focus
  await page.focus("#m-descansar");
  await page.keyboard.press("Enter");
  await expect(page.locator("#m-efectos")).toHaveCount(0);
  expect(await week(page)).toBe(1);
  // Escape closes it as its «Cerrar» does, and the focus goes back to «Menú»
  await page.focus("#m-chat-cerrar");
  await page.keyboard.press("Escape");
  await expect(page.locator("#m-chat")).toHaveCount(0);
  await expect(page.locator("#m-menu")).toBeFocused();
  // its «Cerrar» by keyboard, the same way
  await page.keyboard.press("Enter");
  await page.focus("#m-chat-abrir");
  await page.keyboard.press("Enter");
  await expect(page.locator("#m-chat-cerrar")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#m-chat")).toHaveCount(0);
  await expect(page.locator("#m-menu")).toBeFocused();
  await expect(page.locator('[data-screen="menu"]')).not.toHaveAttribute("inert");
});

test("the wide screen: the chat over the column puts the panel out of reach, and gives the focus back to the panel's «Chat» (final review C4)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await startMobile(page, "peregrina");
  await page.focus("#m-panel #m-chat-abrir");
  await page.keyboard.press("Enter");
  await expect(page.locator("#m-chat-cerrar")).toBeFocused();
  await expect(page.locator("#m-panel")).toHaveAttribute("inert");
  await expect(page.locator('[data-screen="menu"]')).toHaveAttribute("inert");
  await page.keyboard.press("Escape");
  await expect(page.locator("#m-chat")).toHaveCount(0);
  await expect(page.locator("#m-panel")).not.toHaveAttribute("inert");
  await expect(page.locator("#m-panel #m-chat-abrir")).toBeFocused();
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

test("a sheet opens at its top, with its title in view and focused: the guide no longer opens at its end", async ({
  page,
}) => {
  await startMobile(page, "peregrina");
  await page.click("#m-leer-guide");
  const sheet = page.locator("#m-panel-hoja[open]");
  await expect(sheet).toBeVisible();
  // the guide is longer than the sheet, so it scrolls: it still starts at its first step
  expect(await sheet.evaluate((d) => d.scrollHeight > d.clientHeight + 8)).toBe(true);
  expect(await sheet.evaluate((d) => d.scrollTop)).toBe(0);
  await expect(page.locator("#m-panel-hoja-titulo")).toBeInViewport();
  await expect(page.locator("#m-panel-hoja-titulo")).toBeFocused();
  // the same for a short sheet, which never scrolled
  await page.click("#m-panel-hoja-cerrar");
  await page.click("#m-menu");
  await expect(page.locator("#m-menu-titulo")).toBeFocused();
});
