import { expect, t, test, textPattern } from "./fixtures";
import { playerPlace } from "./play";

/** #carrera-libre: the default race at once, then another course, seed and a neutral field. */

test("free race: run the default, change course and seed, run a neutral field", async ({
  page,
}) => {
  await page.goto("#inicio");
  await page.click("#inicio-libre");
  await expect(page).toHaveURL(/#carrera-libre$/);
  await expect(page.getByRole("heading", { name: t("ui.freeRace.title") })).toBeVisible();

  // the default form already ran: the replay is there, the form folded away
  await expect(page.locator("#libre-form")).toBeHidden();
  await expect(page.locator("#libre-reproducir")).toBeVisible();
  await page.click("#libre-meta");
  await expect(page.getByRole("table", { name: t("ui.race.result.title") })).toBeVisible();
  await expect(page.getByRole("heading", { name: t("ui.race.why.title") })).toBeVisible();
  const firstPlace = await playerPlace(page);
  expect(firstPlace).toBeGreaterThanOrEqual(1);

  // another course and seed, the player's field
  await page.click("#libre-cambiar");
  await expect(page.locator("#libre-form")).toBeVisible();
  await page.selectOption("#libre-pista", "desert-canyon");
  await page.fill("#libre-semilla", "pt-e2e-libre");
  await page.click("#libre-correr");
  await expect(page.locator("#libre-form")).toBeHidden();
  await expect(page.getByText(textPattern("ui.freeRace.summary.player"))).toContainText(
    "pt-e2e-libre",
  );
  // the result stays hidden until the replay reaches the finish
  await expect(page.getByRole("table", { name: t("ui.race.result.title") })).toHaveCount(0);
  await page.fill("#libre-tiempo", "40");
  await page.click("#libre-meta");
  await expect(page.getByRole("table", { name: t("ui.race.result.title") })).toBeVisible();

  // eight neutrals: no player row
  await page.click("#libre-cambiar");
  await page.click('label[for="libre-campo-neutral"]');
  await page.click("#libre-correr");
  await expect(page.getByText(textPattern("ui.freeRace.summary.neutral"))).toBeVisible();
  await page.click("#libre-meta");
  const table = page.getByRole("table", { name: t("ui.race.result.title") });
  await expect(table).toBeVisible();
  await expect(table.getByRole("row")).toHaveCount(9);
  await expect(table.getByRole("row").filter({ hasText: t("ui.race.you") })).toHaveCount(0);
});
