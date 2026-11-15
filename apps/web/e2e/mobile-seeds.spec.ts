import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect } from "@playwright/test";
import {
  continueRun,
  seedRun,
  settle,
  skipScene,
  test,
  toPosition,
  toResult,
  week,
} from "./mobile-helpers";

/**
 * The phone game (#juego) from seeded saves (`e2e/saves`, written and checked by
 * `scripts/e2e-saves.test.ts`): each opens with «Continuar» where a random season gets only by
 * luck. Then today's behaviour on paths no other test reaches, pinned before the flow model
 * replaces the screen code (plan-final 1.2):
 *
 * - LEGACY pins: what the game does today and the plan changes, each flipped by its own step;
 * - watch flows: a race seen again, which must keep working through the rewiring (4.1).
 */

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

const SAVES = readdirSync(fileURLToPath(new URL("./saves/", import.meta.url)))
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.slice(0, -".json".length))
  .sort();

for (const name of SAVES)
  test(`seeded save ${name}: «Continuar» opens at its week, with nothing in the way`, async ({
    page,
  }) => {
    const { expect: want } = await seedRun(page, name);
    await page.goto("./");
    await continueRun(page);
    if (want.status === "ended") await expect(page.locator("#m-fin")).toBeVisible();
    else {
      await expect(page.locator("#m-entrenar")).toBeVisible();
      expect(await week(page)).toBe(want.turn);
    }
    // its last week was read (`vista`) and its scenes seen (`historia`): only a due scene plays
    const scene = page.locator("#m-capitulo");
    const due = want.due[0];
    if (due === undefined) await expect(scene).toHaveCount(0);
    else await expect(scene).toHaveAttribute("data-scene", due);
    await expect(page.locator("#m-efectos")).toHaveCount(0);
    await expect(page.locator("#m-inspiracion")).toHaveCount(0);
  });

test.describe("LEGACY pins", () => {
  test("F25 (flipped in 5.1): «Ver carrera» on the End opens the race with the emblem", async ({
    page,
  }) => {
    await seedRun(page, "peregrina-ended");
    await page.goto("./");
    await continueRun(page);
    await page.click("#m-fin-carrera-10");
    await expect(page.locator("#m-transicion")).toBeVisible();
  });

  test("F1 (flipped in 5.6): a reload on the decided race card goes back to the week's menu", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await seedRun(page, "peregrina-w10");
    await page.goto("./");
    await continueRun(page);
    await page.click("#m-entrenar");
    await page.dblclick("#m-entrenar-technique");
    await toPosition(page);
    // the action is decided: the card has no way back
    await expect(page.locator("#m-volver")).toHaveCount(0);
    await page.reload();
    await continueRun(page);
    await expect(page.locator("#m-entrenar")).toBeVisible();
    expect(await week(page)).toBe(10);
    await expect(page.locator("#m-precarrera")).toHaveCount(0);
  });

  test("F4 (flipped in 5.8): a training on an injured week shows a failed result", async ({
    page,
  }) => {
    await seedRun(page, "injured");
    await page.goto("./");
    await continueRun(page);
    await expect(page.locator("#m-lesion")).toBeVisible();
    await page.click("#m-entrenar");
    await expect(page.locator("#m-entrenar-lesion")).toBeVisible();
    await page.dblclick("#m-entrenar-agility");
    await expect(page.locator("#m-resultado")).toHaveAttribute("data-outcome", "fail");
  });

  test("a failed goal (5.4 adds the race's effects over the End): the ending scene, the result, the End", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await seedRun(page, "peregrina-w10-lose");
    await page.goto("./");
    await continueRun(page);
    await page.click("#m-descansar");
    await toPosition(page);
    await page.click("#m-correr");
    await expect(page.locator("#m-carrera-vuelo")).toBeVisible();
    await page.click("#m-saltar");
    // the season's ending scene plays over the finished race; its result waits for it
    await expect(page.locator("#m-capitulo")).toHaveAttribute("data-scene", "peregrina-end-failed");
    await expect(page.locator("#m-resultado")).toHaveCount(0);
    await skipScene(page);
    await expect(page.locator("#m-resultado")).toBeVisible();
    await page.click("#m-carrera-seguir");
    await expect(page.locator("#m-fin")).toBeVisible();
  });
});

test.describe("watch flows (green through 4.1)", () => {
  test("«Ver otra vez», «Saltar», «Continuar»: the menu takes the next week", async ({ page }) => {
    test.setTimeout(120_000);
    await seedRun(page, "peregrina-w10");
    await page.goto("./");
    await continueRun(page);
    await page.click("#m-descansar");
    await toPosition(page);
    await page.click("#m-correr");
    await expect(page.locator("#m-carrera-vuelo")).toBeVisible();
    await page.click("#m-saltar");
    await toResult(page);
    await page.click("#m-ver-otra-vez");
    await expect(page.locator("#m-carrera-vuelo")).toBeVisible();
    await page.click("#m-saltar");
    await toResult(page);
    await page.click("#m-carrera-seguir");
    await settle(page);
    expect(await week(page)).toBe(11);
    await page.click("#m-descansar");
    await settle(page);
    expect(await week(page)).toBe(12);
  });

  test("the End's «Ver carrera», «Saltar», «Continuar»: back to the End", async ({ page }) => {
    await seedRun(page, "peregrina-ended");
    await page.goto("./");
    await continueRun(page);
    await page.click("#m-fin-carrera-10");
    await expect(page.locator("#m-carrera-vuelo")).toBeVisible();
    await page.click("#m-saltar");
    await toResult(page);
    await page.click("#m-carrera-seguir");
    await expect(page.locator("#m-fin")).toBeVisible();
  });
});
