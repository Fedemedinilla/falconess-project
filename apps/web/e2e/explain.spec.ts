import { expect, t, test } from "./fixtures";

/**
 * "Breve | Completo": each card switches its own explanation; the top bar's "Explicaciones" sets
 * the default for every card (dropping the cards' own choices) and is remembered after a reload.
 */

const card = (page: import("@playwright/test").Page, frameId: string) =>
  page.locator("article", { has: page.locator(`#nueva-bastidor-${frameId}-nombre`) });

test("switch one card, then every card from the top bar; the default survives a reload", async ({
  page,
}) => {
  await page.goto("#inicio");
  await page.click("#inicio-nueva");
  const global = page.locator("#explicaciones-cambiar");
  await expect(global).toHaveAttribute("aria-checked", "false");

  // Shiden and Hayate are both Kōryū frames: the same rule, brief by default
  const shiden = card(page, "shiden");
  const hayate = card(page, "hayate");
  await expect(shiden.getByText(t("rule.pulse.brief"), { exact: true })).toBeVisible();
  await expect(shiden.getByText(t("rule.pulse"), { exact: true })).toHaveCount(0);
  await expect(page.locator("#nueva-bastidor-shiden-explicacion-breve")).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // one card in full: only that card changes, and the switch does not tick the card
  const ticked = await page.locator("#nueva-bastidor-shiden").isChecked();
  await page.click("#nueva-bastidor-shiden-explicacion-completo");
  await expect(page.locator("#nueva-bastidor-shiden-explicacion-completo")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(shiden.getByText(t("rule.pulse"), { exact: true })).toBeVisible();
  await expect(hayate.getByText(t("rule.pulse.brief"), { exact: true })).toBeVisible();
  expect(await page.locator("#nueva-bastidor-shiden").isChecked()).toBe(ticked);

  // the top bar: every card in full
  await global.click();
  await expect(global).toHaveAttribute("aria-checked", "true");
  await expect(hayate.getByText(t("rule.pulse"), { exact: true })).toBeVisible();
  await expect(page.getByText(t("rule.pulse.brief"), { exact: true })).toHaveCount(0);

  // a card back to brief overrides the default for that card only
  await page.click("#nueva-bastidor-shiden-explicacion-breve");
  await expect(shiden.getByText(t("rule.pulse.brief"), { exact: true })).toBeVisible();
  await expect(hayate.getByText(t("rule.pulse"), { exact: true })).toBeVisible();

  // a reload keeps the default ("completas") and forgets the card's own choice
  await page.reload();
  await page.goto("#inicio");
  await page.click("#inicio-nueva");
  await expect(global).toHaveAttribute("aria-checked", "true");
  await expect(shiden.getByText(t("rule.pulse"), { exact: true })).toBeVisible();
  await expect(page.locator("#nueva-bastidor-shiden-explicacion-completo")).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // and back to brief, remembered as well
  await global.click();
  await expect(global).toHaveAttribute("aria-checked", "false");
  await page.reload();
  await expect(global).toHaveAttribute("aria-checked", "false");
  await expect(shiden.getByText(t("rule.pulse.brief"), { exact: true })).toBeVisible();
});

test("on a phone the switches are a finger wide and tall, and work without storage", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get: () => {
        throw new DOMException("blocked", "SecurityError");
      },
    });
  });
  await page.setViewportSize({ width: 400, height: 860 });
  await page.goto("#inicio");
  await page.click("#inicio-nueva");
  for (const id of [
    "#nueva-bastidor-shiden-explicacion-breve",
    "#nueva-bastidor-shiden-explicacion-completo",
    "#explicaciones-cambiar",
  ]) {
    // 44 px: a finger's target
    const box = await page.locator(id).boundingBox();
    expect(box?.height ?? 0, id).toBeGreaterThanOrEqual(44);
    expect(box?.width ?? 0, id).toBeGreaterThanOrEqual(44);
  }

  const global = page.locator("#explicaciones-cambiar");
  await global.click();
  await expect(global).toHaveAttribute("aria-checked", "true");
  await page.click("#nueva-bastidor-shiden-detalle > summary");
  await expect(card(page, "shiden").getByText(t("rule.pulse"), { exact: true })).toBeVisible();
});
