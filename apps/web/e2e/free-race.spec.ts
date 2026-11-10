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
  await page.selectOption("#libre-pista", "canyon");
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

test("free race on a v3 catalogue track: the side view of the flight and its moments", async ({
  page,
}) => {
  await page.goto("#carrera-libre");
  await page.click("#libre-cambiar");
  // every catalogue track is offered (ADR-0011 §6)
  for (const id of ["breakaway", "circuit", "crossing", "open-sky", "overlook", "steps"])
    await expect(page.locator(`#libre-pista option[value="${id}"]`)).toHaveCount(1);
  await page.selectOption("#libre-pista", "breakaway");
  await page.fill("#libre-semilla", "pt-e2e-vuelo");
  await page.click("#libre-correr");
  const flight = page.locator("#libre-vuelo");
  await expect(flight).toBeVisible();
  await expect(page.locator("#libre-vuelo-previa")).toContainText(t("course.breakaway"));
  await expect(page.locator("#libre-vuelo-tarjeta")).toContainText(t("ui.flight.distance.medium"));
  const takeoff = page
    .locator("#libre-momentos")
    .locator('[data-moment="takeoff"], [data-moment="takeoffLow"]')
    .first();
  await expect(takeoff).toBeVisible();
  // a takeoff from the list: the banner names it, the HUD follows her
  await takeoff.getByRole("button").click();
  await expect(flight).toHaveAttribute("data-banner", /^takeoff(Low)?$/, { timeout: 15_000 });
  await page.click("#libre-reproducir");
  await page.click("#libre-meta");
  await expect(page.getByRole("table", { name: t("ui.race.result.title") })).toBeVisible();
});
