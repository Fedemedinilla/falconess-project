import { expect } from "@playwright/test";
import { continueRun, seedRun, test, toPosition } from "./mobile-helpers";

/**
 * The race replay's starting speed (plan-final 2.3, O8): the speed chosen last time, kept between
 * races in both views; at least ×2 on the phone with «Rápido»; the phone's «Ritmo» never reaches
 * the test view's replays.
 */

test("on «Rápido» the phone's race replay starts at ×2", async ({ page }) => {
  test.setTimeout(90_000);
  await seedRun(page, "peregrina-w10");
  await page.addInitScript(() => localStorage.setItem("falconess.juego.ritmo", "fast"));
  await page.goto("./");
  await continueRun(page);
  await page.click("#m-descansar");
  await toPosition(page);
  await page.click("#m-correr");
  await expect(page.locator("#m-carrera-vuelo")).toBeVisible();
  await expect(page.locator("#m-carrera-vuelo-x2")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#m-carrera-vuelo-x1")).toHaveAttribute("aria-pressed", "false");
});

test("O8: a phone on «Rápido» leaves the test view's replay at the speed chosen last", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("falconess.juego.ritmo", "fast"));
  await page.goto("#carrera-libre");
  await page.click("#libre-cambiar");
  await page.selectOption("#libre-pista", "breakaway");
  await page.click("#libre-correr");
  await expect(page.locator("#libre-vuelo-x1")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#libre-vuelo-x2")).toHaveAttribute("aria-pressed", "false");
  // a speed chosen there is kept for the next replay
  await page.click("#libre-vuelo-x4");
  await page.click("#libre-cambiar");
  await page.fill("#libre-semilla", "pt-e2e-velocidad");
  await page.click("#libre-correr");
  await expect(page.locator("#libre-vuelo-x4")).toHaveAttribute("aria-pressed", "true");
});
