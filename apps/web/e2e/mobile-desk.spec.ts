import { expect, type Page } from "@playwright/test";
import { t } from "./fixtures";
import {
  continueRun,
  seedRun,
  settle,
  skipScene,
  test,
  toPosition,
  toResult,
} from "./mobile-helpers";

/**
 * The wide screen's panel (D4, plan-final 5.5): it is locked (inert, dimmed) while anything of the
 * week plays in the column, so Idioma, Nueva temporada, Ritmo, Chat and Historia never cut into a
 * beat; it is live again on the menu. While her race plays it gives nothing away: Metas shows the
 * goal as this week's and Registro has no row for the week being raced, until its result.
 */

test.use({ viewport: { width: 1440, height: 900 } });

/** Whether `selector` is in the page right now, without waiting for it. */
function present(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((sel) => document.querySelector(sel) !== null, selector);
}

/** Whether the panel is locked right now (no waiting: the moment may be short). */
function locked(page: Page): Promise<boolean> {
  return page.evaluate(() => document.getElementById("m-panel")?.hasAttribute("inert") === true);
}

test("the panel is locked through a race week's beats and live on the menu (D4)", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await seedRun(page, "peregrina-w10");
  await page.goto("./");
  await continueRun(page);
  const panel = page.locator("#m-panel");
  await expect(panel).toBeVisible();
  await expect(panel).not.toHaveAttribute("inert");
  await expect(panel).toHaveCSS("opacity", "1");
  await page.click("#m-panel-goals");
  const goal = page.locator('#m-metas [data-turn="10"]');
  await expect(goal).toContainText(t("ui.m.goals.today"));
  // the week's effects
  await page.click("#m-descansar");
  await expect(page.locator("#m-efectos")).toBeVisible();
  expect(await locked(page)).toBe(true);
  await expect(panel).toHaveCSS("opacity", "0.45");
  // the emblem, from the frame it starts
  await page.click("#m-efectos");
  expect([await present(page, "#m-transicion"), await locked(page)]).toEqual([true, true]);
  // her first race's scene, then the decided card
  await expect(page.locator('#m-capitulo[data-scene="peregrina-debut"]')).toBeVisible();
  expect(await locked(page)).toBe(true);
  await skipScene(page);
  await expect(page.locator("#m-correr")).toBeVisible();
  expect(await locked(page)).toBe(true);
  // the race: Metas still has it as this week's, no place yet (no spoiler)
  await page.click("#m-correr");
  await expect(page.locator("#m-carrera-vuelo")).toBeVisible();
  expect(await locked(page)).toBe(true);
  await expect(goal).toContainText(t("ui.m.goals.today"));
  await expect(goal).not.toContainText(/[✓✗]/);
  await page.click("#m-saltar");
  await toResult(page);
  expect(await locked(page)).toBe(true);
  // its result is on screen: now Metas has the place
  const place = await page.locator("#m-resultado").getAttribute("data-place");
  await expect(goal).toContainText(t("ui.m.goals.done", { place: place ?? "?" }));
  // the race's effects, then the menu: live again
  await page.click("#m-carrera-seguir");
  await settle(page);
  await expect(page.locator("#m-entrenar")).toBeEnabled();
  await expect(panel).not.toHaveAttribute("inert");
  await expect(panel).toHaveCSS("opacity", "1");
});

test("Registro has no row for the week being raced until its result", async ({ page }) => {
  test.setTimeout(90_000);
  await seedRun(page, "peregrina-w10");
  await page.goto("./");
  await continueRun(page);
  await page.click("#m-panel-log");
  const row = (turn: number) => page.locator(`#m-registro [data-turn="${turn}"]`);
  await expect(row(9)).toBeVisible();
  await expect(row(10)).toHaveCount(0);
  await page.click("#m-descansar");
  // the action's part, the emblem, the scene: up to the decided card
  await toPosition(page);
  await page.click("#m-correr");
  await expect(page.locator("#m-carrera-vuelo")).toBeVisible();
  // the week was committed with «Correr», but its row would tell how the race went
  await expect(row(9)).toBeVisible();
  await expect(row(10)).toHaveCount(0);
  await page.click("#m-saltar");
  await toResult(page);
  await expect(row(10)).toHaveCount(1);
});

test("a training's result locks the panel: «Ritmo» cannot change under it", async ({ page }) => {
  test.setTimeout(90_000);
  await seedRun(page, "peregrina-w10");
  await page.goto("./");
  await continueRun(page);
  const pace = page.locator("#m-ritmo");
  await expect(pace).toHaveAttribute("data-pace", "normal");
  await page.click("#m-entrenar");
  await page.click("#m-entrenar-technique");
  await page.click("#m-entrenar-technique");
  await expect(page.locator("#m-resultado")).toBeVisible();
  expect(await locked(page)).toBe(true);
  // a real tap where «Ritmo» is: the locked panel takes no tap
  const box = await pace.boundingBox();
  if (!box) throw new Error("no «Ritmo» on the panel");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(pace).toHaveAttribute("data-pace", "normal");
});
