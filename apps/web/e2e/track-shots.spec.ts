import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, type Page } from "@playwright/test";
import { settle, startMobile, shotTest as test } from "./mobile-helpers";

/**
 * Screenshots of the track card for review (`E2E_SHOTS=1 playwright test --project shots
 * track-shots`), never committed: the week menu with its goal card and the track sheet at
 * 390 × 844, one Falconess per first goal (three tracks), into `E2E_SHOTS_DIR` (or
 * .work/tracks/shots/).
 */
const OUT = process.env.E2E_SHOTS_DIR
  ? `${process.env.E2E_SHOTS_DIR.replace(/\/$/, "")}/`
  : fileURLToPath(new URL("../../../.work/tracks/shots/", import.meta.url));

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });

/** A new season of `falconessId` on its first week's menu, with no scene over it. */
async function start(page: Page, falconessId: string): Promise<void> {
  await startMobile(page, falconessId);
  await expect(page.locator("#m-entrenar")).toBeEnabled();
}

for (const f of ["peregrina", "cernicala", "caracara"]) {
  test(`track card of ${f}'s first goal`, async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await start(page, f);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}${f}-menu.png` });
    const card = page.locator("#m-pista");
    if ((await card.count()) > 0) {
      await page.locator("#m-pista-tab").click();
      await page.waitForTimeout(400);
      await card.click();
      await expect(page.locator("#m-pista-dialogo[open]")).toBeVisible();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT}${f}-sheet.png` });
    }
  });
}

test("the pre-race card of Peregrina's first goal", async ({ page }) => {
  test.setTimeout(120_000);
  mkdirSync(OUT, { recursive: true });
  await start(page, "peregrina");
  while ((await page.locator("#m-carrera").count()) === 0) {
    await page.click("#m-descansar");
    await settle(page);
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}peregrina-raceweek-menu.png` });
  await page.click("#m-carrera");
  await expect(page.locator("#m-precarrera-pista")).toBeVisible();
  await page.screenshot({ path: `${OUT}peregrina-prerace.png` });
});
