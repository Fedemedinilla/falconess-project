import { expect, t, test } from "./fixtures";
import { closeWeek, loadRun, RUN1, RUN1_WEEK19, readTurn, vigorOf } from "./play";

/**
 * New seasons play ruleset v3; a run keeps the ruleset it was played on. The owner's playtest 1
 * (seed 397553, ruleset v1) loads as v1, ends with the grade it had, and a copy of it cut before
 * week 19 plays on under v1: high fatigue (vigor 15) turns a training into a forced rest.
 */

test("the owner's playtest 1 loads as a v1 run and ends as it did", async ({ page }) => {
  expect(RUN1.rulesetVersion).toBe("v1");
  await loadRun(page, RUN1);
  await expect(page).toHaveURL(/#fin$/);
  // its last week first: the T48 training, over SeasonEnd
  await closeWeek(page);
  await expect(
    page.getByText(t("ui.end.eyebrow", { seed: "397553", ruleset: "v1" }), { exact: true }),
  ).toBeVisible();
  await expect(page.locator("#fin-nota")).toHaveText("B");
  await expect(page.getByText(t("ui.end.completed"))).toBeVisible();
  await page.click("#partida-abrir");
  await expect(page.locator("#partida-dialogo")).toContainText("reglas v1");
  const copied = JSON.parse(await page.inputValue("#partida-json"));
  expect(copied).toEqual(RUN1);
});

test("a v1 run plays on under v1 rules: a forced rest at vigor 20 or less; new seasons are v3", async ({
  page,
}) => {
  await loadRun(page, RUN1_WEEK19);
  await expect(page).toHaveURL(/#temporada$/);
  // this browser never saw the run's last week
  await closeWeek(page);
  await expect(
    page.getByText(t("ui.turn.seed", { seed: "397553", ruleset: "v1" }), { exact: true }),
  ).toBeVisible();

  // vigor 15: v1 has no risk bands, its forced rest instead, on the bar and on the cards
  expect(vigorOf(await readTurn(page))).toBe(15);
  const note = page.locator("#turno-vigor-nota");
  await expect(note).toContainText(t("ui.turn.vigor.forced", { at: 20 }));
  await expect(note).toContainText(t("ui.action.forcedRest"));
  await expect(page.locator("[data-band]")).toHaveCount(0);
  const agility = page.locator("li", { has: page.locator("#accion-train-agility") });
  await expect(agility).toContainText(t("ui.action.forcedRest"));
  await expect(page.locator("#turno-racha")).toHaveCount(0);

  // the training rests instead, as it did for the owner: +40 vigor
  await page.click("#accion-train-agility");
  const week = page.getByRole("dialog", { name: t("ui.week.title.forced-rest") });
  await expect(week).toBeVisible();
  const vigor = week.getByRole("listitem").filter({ hasText: t("ui.week.vigor") });
  await expect(vigor).toContainText("+40");
  await expect(vigor).toContainText("→ 55");
  await closeWeek(page);
  expect(vigorOf(await readTurn(page))).toBe(55);

  // after a reload "Continuar" keeps it on v1
  await page.reload();
  await page.goto("#inicio");
  await expect(page.locator("#inicio-continuar")).toContainText("reglas v1");
  await page.click("#inicio-continuar");
  await expect(
    page.getByText(t("ui.turn.seed", { seed: "397553", ruleset: "v1" }), { exact: true }),
  ).toBeVisible();

  // a new season starts on v3 (ADR-0011: v2's season with the flight race)
  await page.goto("#inicio");
  await expect(page.getByText(t("ui.home.eyebrow", { ruleset: "v3" }))).toBeVisible();
  await page.click("#inicio-nueva");
  await expect(page.getByText(t("ui.new.eyebrow", { ruleset: "v3" }))).toBeVisible();
  await page.fill("#nueva-semilla", "pt-e2e-v3");
  await page.click("#nueva-empezar");
  await expect(
    page.getByText(t("ui.turn.seed", { seed: "pt-e2e-v3", ruleset: "v3" }), { exact: true }),
  ).toBeVisible();
  await expect(page.locator('[data-band="safe"]')).toHaveCount(1);
});
