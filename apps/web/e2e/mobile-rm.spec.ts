import { expect } from "@playwright/test";
import { t } from "./fixtures";
import { pastTitle, startMobile, test } from "./mobile-helpers";
import { opacityOf } from "./motion";

/**
 * The phone game under reduced motion (plan-final §2.4): what moves stands still at its rest, and
 * its rest is visible. The scene's notice (5.9, H5, C7): no way in, no fade, the whole of it shown
 * for its time, «Ver» with it.
 */

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: "reduce" });

test("the skipped prologue's notice shows whole and still", async ({ page }) => {
  await startMobile(page, "peregrina");
  const notice = page.locator("#m-capitulo-aviso");
  await expect(notice).toContainText(t("ui.m.story.skipped"));
  expect(await opacityOf(page, "#m-capitulo-aviso")).toBe(1);
  expect(await notice.evaluate((el) => getComputedStyle(el).transform)).toBe("none");
});

test("a passed scene's notice shows whole, with «Ver»", async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("falconess.juego.historia"))
      localStorage.setItem(
        "falconess.juego.historia",
        JSON.stringify({ runs: {}, ever: ["peregrina-prologue"] }),
      );
  });
  await page.goto("./");
  await pastTitle(page);
  await page.click("#m-elegir-peregrina");
  await page.click("#m-empezar");
  await expect(page.locator("#m-capitulo-aviso")).toContainText(t("ui.m.story.passed"));
  expect(await opacityOf(page, "#m-capitulo-aviso")).toBe(1);
  expect(await opacityOf(page, "#m-escena-ver")).toBe(1);
  await page.click("#m-escena-ver");
  await expect(page.locator("#m-capitulo")).toHaveAttribute("data-scene", "peregrina-prologue");
});
