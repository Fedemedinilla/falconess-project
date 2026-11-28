import { expect, type Page } from "@playwright/test";
import { t } from "./fixtures";
import { continueRun, seedRun, settle, startMobile, test, watchCues } from "./mobile-helpers";

/**
 * The «Menú» as the owner chose it (2026-11-18): the four reading panels on the week menu itself,
 * as a rail down the right edge; a short root sheet (Chat, Historia, «Ajustes ▸», «Partida ▸»,
 * «Cerrar») that fits on the smallest phone; and two second levels, «Ajustes» (every setting with
 * every value it can take) and «Partida». On a wide screen the panel's own rail holds the four and
 * its «Menú» tab shows the same settings inline.
 */

const PHONE = { width: 390, height: 844 };
const SMALL = { width: 360, height: 740 };

test.use({ viewport: PHONE, hasTouch: true });

/** How much a sheet would have to scroll to show all of it (0 when it fits). */
async function overflow(page: Page, id: string): Promise<number> {
  return page.locator(id).evaluate((d) => d.scrollHeight - d.clientHeight);
}

/** A sheet comes in rising 16 px over 220 ms: a box measured meanwhile is not where it lands. */
async function stillSheet(page: Page, id: string): Promise<void> {
  await expect
    .poll(async () => {
      const first = (await page.locator(id).boundingBox())?.y ?? -1;
      await page.waitForTimeout(80);
      return first === ((await page.locator(id).boundingBox())?.y ?? -2);
    })
    .toBe(true);
}

/** A sheet's height and the box it has, for the report. */
async function fit(page: Page, id: string): Promise<{ height: number; box: number }> {
  return page.locator(id).evaluate((d) => ({ height: d.scrollHeight, box: d.clientHeight }));
}

/** Peregrina's season started, without reading any Spanish: `startMobile` checks es.json texts. */
async function startAnyLanguage(page: Page): Promise<void> {
  await page.goto("./");
  await page.click("#m-titulo");
  await expect(page.locator("#m-titulo")).toHaveCount(0);
  await page.click("#m-elegir-peregrina");
  await page.click("#m-empezar");
  await expect(page.locator("#m-capitulo")).toBeVisible();
  await page.click("#m-capitulo-saltar");
  await expect(page.locator("#m-capitulo")).toHaveCount(0);
  await expect(page.locator("#m-entrenar")).toBeEnabled();
}

/** The painted background of an element, as the browser resolves it. */
async function background(page: Page, selector: string): Promise<string> {
  return page.locator(selector).evaluate((el) => getComputedStyle(el).backgroundColor);
}

/** A colour that is really painted: not `transparent`, not fully see-through. */
function expectPainted(colour: string, what: string) {
  expect(colour, what).toMatch(/^rgba?\(/);
  expect(colour, what).not.toBe("rgba(0, 0, 0, 0)");
  const alpha = Number(/rgba\([^)]*,\s*([\d.]+)\)/.exec(colour)?.[1] ?? "1");
  expect(alpha, `${what} alpha`).toBeGreaterThan(0.5);
}

test("the week menu's rail opens each panel in one tap, and the wide screen has none", async ({
  page,
}) => {
  await startMobile(page, "peregrina");
  // Guía keeps its dot until it has been opened
  await expect(page.locator("#m-leer-guide")).toHaveAttribute("data-new", "true");
  expectPainted(await background(page, "#m-leer-guide [data-dot]"), "the guide's dot");
  for (const tab of ["goals", "crews", "log"] as const) {
    // one tap from the week menu: no «Menú» in between
    await page.click(`#m-leer-${tab}`);
    await expect(page.locator("#m-panel-hoja[open]")).toBeVisible();
    await expect(page.locator("#m-panel-hoja-titulo")).toHaveText(t(`ui.m.panel.${tab}`));
    await page.click("#m-panel-hoja-cerrar");
    await expect(page.locator("#m-panel-hoja")).toHaveCount(0);
  }
  await page.click("#m-leer-guide");
  await expect(page.locator("#m-panel-hoja[open] #m-guia")).toBeVisible();
  await page.click("#m-guia-ok");
  await expect(page.locator("#m-panel-hoja")).toHaveCount(0);
  await expect(page.locator("#m-leer-guide")).toHaveAttribute("data-new", "false");
  await expect(page.locator("#m-leer-guide [data-dot]")).toHaveCount(0);
  // the rail never lands on a control: it is in the flow, above the stats strip
  const rail = await page.locator("#m-leer-log").boundingBox();
  const stats = await page.locator("#m-stats").boundingBox();
  expect(rail && stats && rail.y + rail.height).toBeLessThanOrEqual((stats?.y ?? 0) + 1);
  // the wide screen: the panel's own rail holds the four, so this one is gone
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator("#m-panel")).toBeVisible();
  for (const t of ["guide", "goals", "crews", "log"])
    await expect(page.locator(`#m-leer-${t}`)).toHaveCount(0);
});

for (const language of ["es", "en"] as const)
  test(`the root sheet and its two levels fit at 360×740 without scrolling, in ${language}`, async ({
    page,
  }) => {
    await page.addInitScript((l: string) => localStorage.setItem("falconess.lang", l), language);
    await page.setViewportSize(SMALL);
    await startAnyLanguage(page);
    await page.click("#m-menu");
    await expect(page.locator("#m-menu-dialogo[open]")).toBeVisible();
    const small = await fit(page, "#m-menu-dialogo");
    expect(
      small.height,
      `the root in ${language} at 360×740 (${small.height} px in a ${small.box} px box)`,
    ).toBeLessThanOrEqual(small.box);
    // «Cerrar» is above the fold, where a tap reaches it (it used to be below it: 947 px of sheet
    // in a 704 px box)
    const close = await page.locator("#m-menu-cerrar").boundingBox();
    expect(close && close.y + close.height).toBeLessThanOrEqual(SMALL.height);
    // and the two second levels, here and at 390×844
    for (const size of [SMALL, PHONE]) {
      await page.setViewportSize(size);
      expect(
        await overflow(page, "#m-menu-dialogo"),
        `the root at ${size.width}`,
      ).toBeLessThanOrEqual(0);
      await page.click("#m-grupo-ajustes");
      await expect(page.locator("#m-ajustes-hoja[open]")).toBeVisible();
      expect(
        await overflow(page, "#m-ajustes-hoja"),
        `«Ajustes» at ${size.width}`,
      ).toBeLessThanOrEqual(0);
      await page.click("#m-ajustes-hoja-volver");
      await expect(page.locator("#m-menu-dialogo[open]")).toBeVisible();
      await page.click("#m-grupo-partida");
      await expect(page.locator("#m-partida-hoja[open]")).toBeVisible();
      expect(
        await overflow(page, "#m-partida-hoja"),
        `«Partida» at ${size.width}`,
      ).toBeLessThanOrEqual(0);
      await page.click("#m-partida-hoja-volver");
      await expect(page.locator("#m-menu-dialogo[open]")).toBeVisible();
    }
    await page.click("#m-menu-cerrar");
    await expect(page.locator("dialog")).toHaveCount(0);
  });

test("«Ajustes»: every value is shown, the current one pressed, one tap sets another", async ({
  page,
}) => {
  await startMobile(page, "peregrina");
  const cues = await watchCues(page);
  await page.click("#m-menu");
  // the root says what the settings stand at, without opening them
  await expect(page.locator("#m-grupo-ajustes")).toContainText(t("ui.m.sound.propulsor"));
  await expect(page.locator("#m-grupo-ajustes")).toContainText(t("ui.m.pace.normal"));
  await page.click("#m-grupo-ajustes");
  await expect(page.locator("#m-ajustes-hoja[open]")).toBeVisible();
  // the title takes the focus, as every sheet does since 9b1c14c
  await expect(page.locator("#m-ajustes-hoja-titulo")).toBeFocused();

  // Sonido: the four styles, Propulsor pressed; a tap really changes the style and says itself
  for (const style of ["hangar", "propulsor", "visor", "off"])
    await expect(page.locator(`#m-sonido-${style}`)).toContainText(t(`ui.m.sound.${style}`));
  await expect(page.locator("#m-sonido")).toHaveAttribute("data-value", "propulsor");
  await expect(page.locator("#m-sonido-propulsor")).toHaveAttribute("aria-pressed", "true");
  await page.click("#m-sonido-visor");
  await expect(page.locator("#m-sonido")).toHaveAttribute("data-value", "visor");
  await expect(page.locator("#m-sonido-visor")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#m-sonido-propulsor")).toHaveAttribute("aria-pressed", "false");
  expect(await cues()).toContain("success");

  // Música, Ritmo: both stores really move
  await expect(page.locator("#m-musica")).toHaveAttribute("data-value", "on");
  await page.click("#m-musica-off");
  await expect(page.locator("#m-musica")).toHaveAttribute("data-value", "off");
  await expect(page.locator("#m-ritmo")).toHaveAttribute("data-value", "normal");
  await page.click("#m-ritmo-direct");
  await expect(page.locator("#m-ritmo")).toHaveAttribute("data-value", "direct");

  // kept in this browser
  await page.reload();
  await continueRun(page);
  await settle(page);
  await page.click("#m-menu");
  await page.click("#m-grupo-ajustes");
  await expect(page.locator("#m-sonido")).toHaveAttribute("data-value", "visor");
  await expect(page.locator("#m-musica")).toHaveAttribute("data-value", "off");
  await expect(page.locator("#m-ritmo")).toHaveAttribute("data-value", "direct");

  // Idioma: Español pressed, one tap to English and the page is in English
  await expect(page.locator("#m-idioma")).toHaveAttribute("data-value", "es");
  await expect(page.locator("#m-idioma-es")).toHaveAttribute("aria-pressed", "true");
  await page.click("#m-idioma-en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("a new language reopens «Menú» at «Ajustes», the new language pressed; a reload opens nothing (owner 2026-11-28)", async ({
  page,
}) => {
  await startMobile(page, "peregrina");
  await page.click("#m-menu");
  await page.click("#m-grupo-ajustes");
  await expect(page.locator("#m-ajustes-hoja-titulo")).toBeFocused();
  await page.click("#m-idioma-en");
  // the page is drawn again in English (every per-language cache starts over), and the sheet is
  // back where the switch was made, its title focused
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("#m-ajustes-hoja[open]")).toBeVisible();
  await expect(page.locator("#m-ajustes-hoja-titulo")).toHaveText("Settings");
  await expect(page.locator("#m-ajustes-hoja-titulo")).toBeFocused();
  await expect(page.locator("#m-idioma-en")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#m-idioma-es")).toHaveAttribute("aria-pressed", "false");
  // closed, the focus goes back to «Menú»
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).toHaveCount(0);
  await expect(page.locator("#m-menu")).toBeFocused();
  // a reload is no language switch: the menu stays closed
  await page.reload();
  await continueRun(page);
  await settle(page);
  await expect(page.locator("#m-entrenar")).toBeEnabled();
  await page.waitForTimeout(300);
  await expect(page.locator("dialog")).toHaveCount(0);
});

test("«Partida»: a new season still takes two taps, and nothing moves between them", async ({
  page,
}) => {
  await startMobile(page, "caracara");
  await page.click("#m-menu");
  await page.click("#m-grupo-partida");
  await expect(page.locator("#m-partida-hoja[open]")).toBeVisible();
  for (const id of ["#m-exportar-partida", "#m-temporadas", "#m-pruebas", "#m-nueva"])
    await expect(page.locator(id)).toBeVisible();
  // the confirm takes the first button's place: what is under it does not move (bug 2)
  await stillSheet(page, "#m-partida-hoja");
  const before = await page.locator("#m-partida-hoja-cerrar").boundingBox();
  const row = await page.locator("#m-nueva").boundingBox();
  await page.click("#m-nueva");
  await expect(page.locator("#m-nueva-si")).toBeVisible();
  const after = await page.locator("#m-partida-hoja-cerrar").boundingBox();
  const confirm = await page.locator("#m-nueva-si").boundingBox();
  expect(after?.y, "«Cerrar» after the first tap").toBeCloseTo(before?.y ?? -1, 0);
  expect(confirm?.height, "the confirm's height").toBeCloseTo(row?.height ?? -1, 0);
  // and the second tap starts the new season
  await page.click("#m-nueva-si");
  await expect(page.getByRole("heading", { name: t("ui.m.pick.title") })).toBeVisible();
});

test("the «nuevo» tag is painted, in the sheet and in the wide screen's panel", async ({
  page,
}) => {
  await startMobile(page, "peregrina");
  await page.click("#m-menu");
  await expect(page.locator("#m-chat-abrir")).toHaveAttribute("data-new", "true");
  await expect(page.locator("#m-chat-nuevo")).toHaveText(t("ui.m.chat.new"));
  expectPainted(await background(page, "#m-chat-nuevo"), "the tag in the sheet");
  await page.click("#m-menu-cerrar");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.click("#m-panel-menu");
  await expect(page.locator("#m-panel #m-chat-nuevo")).toBeVisible();
  expectPainted(await background(page, "#m-panel #m-chat-nuevo"), "the tag in the panel");
});

test("Escape from a second level closes the whole menu, and the focus goes back to «Menú»", async ({
  page,
}) => {
  await startMobile(page, "peregrina");
  for (const [open, sheet] of [
    ["#m-grupo-ajustes", "#m-ajustes-hoja"],
    ["#m-grupo-partida", "#m-partida-hoja"],
  ] as const) {
    await page.focus("#m-menu");
    await page.keyboard.press("Enter");
    await expect(page.locator("#m-menu-dialogo[open]")).toBeVisible();
    await page.click(open);
    await expect(page.locator(`${sheet}[open]`)).toBeVisible();
    await expect(page.locator(`${sheet}-titulo`)).toBeFocused();
    await page.keyboard.press("Escape");
    // the whole menu, not just the level: no sheet of it is left
    await expect(page.locator("dialog")).toHaveCount(0);
    await expect(page.locator("#m-menu")).toBeFocused();
  }
  // «Volver» before the root has finished fading out (a tap inside its 180 ms, which an idle
  // browser never sends but a busy one does) still brings it back on its title, not under the
  // level that is still closing
  await page.click("#m-menu");
  await page.click("#m-grupo-partida");
  await expect(page.locator("#m-partida-hoja[open]")).toBeVisible();
  await page.locator("#m-partida-hoja-volver").dispatchEvent("click");
  await expect(page.locator("#m-menu-dialogo[open]")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.id ?? "none"), {
      message: "«Volver» inside the root's way out",
    })
    .toBe("m-menu-titulo");
  await page.click("#m-menu-cerrar");
  await expect(page.locator("dialog")).toHaveCount(0);

  // «Volver» brings the root back instead, and «Cerrar» there closes everything
  await page.click("#m-menu");
  await page.click("#m-grupo-ajustes");
  await expect(page.locator("#m-ajustes-hoja[open]")).toBeVisible();
  await page.click("#m-ajustes-hoja-volver");
  await expect(page.locator("#m-menu-dialogo[open]")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.id ?? "none"), {
      message: "«Volver» brings the root back with its title focused",
    })
    .toBe("m-menu-titulo");
  await page.click("#m-menu-cerrar");
  await expect(page.locator("dialog")).toHaveCount(0);
  await expect(page.locator("#m-menu")).toBeFocused();
});

test("the wide screen sets a setting the same way: the cards inline in its «Menú» tab", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedRun(page, "peregrina-w24-insp");
  await page.goto("./");
  await continueRun(page);
  await settle(page);
  await page.click("#m-panel-menu");
  // the same cards, no sub-sheet
  for (const id of ["#m-sonido", "#m-musica", "#m-ritmo", "#m-idioma"])
    await expect(page.locator(`#m-panel ${id}`)).toBeVisible();
  await expect(page.locator("#m-grupo-ajustes")).toHaveCount(0);
  await expect(page.locator("#m-ritmo")).toHaveAttribute("data-value", "normal");
  await page.click("#m-ritmo-fast");
  await expect(page.locator("#m-ritmo")).toHaveAttribute("data-value", "fast");
  // and its tabs keep the four panels and the menu's own actions
  for (const id of [
    "#m-chat-abrir",
    "#m-historia-abrir",
    "#m-exportar-partida",
    "#m-temporadas",
    "#m-pruebas",
    "#m-nueva",
  ])
    await expect(page.locator(`#m-panel ${id}`)).toBeVisible();
});
