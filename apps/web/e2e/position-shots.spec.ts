import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { t, watchErrors } from "./fixtures";
import { closeWeek, RACE_WEEK } from "./play";

/**
 * Screenshots of the pre-race position card (ADR-0008) for review (`E2E_SHOTS=1 playwright test
 * --project shots position-shots`), never committed: <nn>-position-<scene>-<width>x<height>-
 * <scheme>.png in `E2E_SHOTS_DIR` (or .work/ui/shots-position/), real fonts. The race week is
 * Caracara's T12 (seed "a", v1); she picks a position other than her wings', takes the week, reads
 * the result and opens the replay; then the workshop of that week and the free race.
 */

const OUT = process.env.E2E_SHOTS_DIR
  ? `${process.env.E2E_SHOTS_DIR.replace(/\/$/, "")}/`
  : fileURLToPath(new URL("../../../.work/ui/shots-position/", import.meta.url));

const VIEWPORTS = [
  { width: 360, height: 740, scale: 2 },
  { width: 390, height: 844, scale: 2 },
  { width: 1280, height: 800, scale: 1 },
] as const;
const SCHEMES = ["light", "dark"] as const;

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
});

async function open(
  browser: Browser,
  vp: (typeof VIEWPORTS)[number],
  scheme: (typeof SCHEMES)[number],
): Promise<{ page: Page; errors: string[]; close: () => Promise<void> }> {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.scale,
    colorScheme: scheme,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const errors = watchErrors(page, { allowFontFailures: true });
  return { page, errors, close: () => context.close() };
}

/** The race week loaded and its last «Lo que pasó» read: the card waits under the notice. */
async function raceWeek(page: Page): Promise<void> {
  await page.goto("#inicio");
  await page.click("#inicio-cargar");
  await page.fill("#cargar-json", JSON.stringify(RACE_WEEK));
  await page.click("#cargar-enviar");
  await expect(page).toHaveURL(/#temporada$/);
  if ((await page.locator("#semana-dialogo[open]").count()) > 0) await closeWeek(page);
  await expect(page.locator("#turno-posicion")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

for (const vp of VIEWPORTS)
  for (const scheme of SCHEMES)
    test(`position card at ${vp.width}x${vp.height}, ${scheme}`, async ({ browser }) => {
      test.setTimeout(120_000);
      const name = (n: number, scene: string) =>
        `${OUT}${String(n).padStart(2, "0")}-position-${scene}-${vp.width}x${vp.height}-${scheme}.png`;
      const { page, errors, close } = await open(browser, vp, scheme);

      // 1–2 the race week: her wings' position chosen, then another one tapped
      await raceWeek(page);
      const card = page.locator("#turno-posicion");
      await card.scrollIntoViewIfNeeded();
      await page.locator("#turno-acciones").screenshot({ path: name(1, "race-week") });
      await page.click('label[for="turno-posicion-lead"]');
      await expect(page.locator("#turno-posicion-lead")).toBeChecked();
      await page.evaluate(() => {
        const el = document.getElementById("turno-acciones");
        if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 8);
      });
      await page.screenshot({ path: name(2, "race-week-chosen") });

      // 3 the workshop of that week says which race runs after it, in which position
      await page.click("#accion-workshop");
      await expect(page.locator("#taller-carrera")).toBeVisible();
      await page.locator("#taller-carrera").scrollIntoViewIfNeeded();
      await page.screenshot({ path: name(3, "workshop") });
      await page.click("#taller-volver");

      // 4 the week's result: the position she ran in, first on the context line
      await expect(page.locator("#turno-posicion-lead")).toBeChecked();
      await page.click("#accion-train-agility");
      const week = page.locator("#semana-dialogo[open]");
      await expect(week).toBeVisible();
      await expect(week.locator("#semana-posicion")).toHaveAttribute("data-position", "lead");
      await page.screenshot({ path: name(4, "week-result") });

      // 5 the replay: her position over the lanes
      await page.click("#semana-ver-carrera");
      await expect(page.locator("#carrera-corre-en")).toBeVisible();
      await page.locator("#carrera-corre-en").scrollIntoViewIfNeeded();
      await page.evaluate(() => {
        const el = document.getElementById("carrera-corre-en")?.closest("section");
        if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 8);
      });
      await page.screenshot({ path: name(5, "replay") });

      // 6 the free race, folded after its default race: the card and «Correr la carrera»
      await page.goto("#carrera-libre");
      await expect(page.locator("#libre-posicion")).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: name(6, "free-race"), fullPage: vp.width < 1000 });
      await page.click('label[for="libre-posicion-stalk"]');
      await page.click("#libre-correr");
      await expect(page.locator("#libre-corre-en")).toHaveAttribute("data-position", "stalk");
      await page.screenshot({ path: name(7, "free-race-stalk") });

      // 8 the season's profile: letters by position, with their shapes
      await page.goto("#temporada");
      await page.locator("#turno-acciones").waitFor();
      const profile = page
        .getByRole("heading", { name: t("ui.turn.profile") })
        .locator("xpath=ancestor::section[1]");
      await profile.screenshot({ path: name(8, "profile") });

      expect(errors, "console errors or uncaught exceptions").toEqual([]);
      await close();
    });
