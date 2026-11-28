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

test("«Correr» paints the race screen first and mounts the replay a frame later (open decision 6)", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await seedRun(page, "peregrina-w10");
  await page.goto("./");
  await continueRun(page);
  await page.click("#m-descansar");
  await toPosition(page);
  // the tap and the screen change in one handler: right after it the race screen is in, with
  // «Saltar», and the replay is not; it mounts by the frame after the one that painted the screen
  const seen = await page.evaluate(async () => {
    const has = (id: string) => document.getElementById(id) !== null;
    const button = document.getElementById("m-correr");
    if (!button) throw new Error("no «Correr»");
    button.click();
    await Promise.resolve();
    const atTap = { skip: has("m-saltar"), replay: has("m-carrera-vuelo") };
    const frame = () => new Promise((done) => requestAnimationFrame(() => done(undefined)));
    await frame();
    await frame();
    await new Promise((done) => setTimeout(done, 0));
    return { atTap, later: has("m-carrera-vuelo") };
  });
  expect(seen).toEqual({ atTap: { skip: true, replay: false }, later: true });
});
