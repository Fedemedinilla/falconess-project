import type { Page } from "@playwright/test";
import { expect, t, test } from "./fixtures";

/**
 * "Breve | Completo": each card switches its own explanation; "Explicaciones [Breve | Completo]"
 * (the top bar, or a screen's head on a phone) sets the default for every card, dropping the
 * cards' own choices, and is remembered after a reload.
 */

const card = (page: Page, frameId: string) =>
  page.locator("article", { has: page.locator(`#nueva-bastidor-${frameId}-nombre`) });

const pressed = async (page: Page, id: string) =>
  expect(page.locator(id)).toHaveAttribute("aria-pressed", "true");

test("switch one card, then every card from the top bar; the default survives a reload", async ({
  page,
}) => {
  await page.goto("#inicio");
  await page.click("#inicio-nueva");
  await pressed(page, "#explicaciones-breve");

  // Shiden and Hayate are both Kōryū frames: the same rule, brief by default
  const shiden = card(page, "shiden");
  const hayate = card(page, "hayate");
  await expect(shiden.getByText(t("rule.pulse.brief"), { exact: true })).toBeVisible();
  await expect(shiden.getByText(t("rule.pulse"), { exact: true })).toHaveCount(0);
  await pressed(page, "#nueva-bastidor-shiden-explicacion-breve");

  // one card in full: only that card changes, and the switch does not tick the card
  const ticked = await page.locator("#nueva-bastidor-shiden").isChecked();
  await page.click("#nueva-bastidor-shiden-explicacion-completo");
  await pressed(page, "#nueva-bastidor-shiden-explicacion-completo");
  await expect(shiden.getByText(t("rule.pulse"), { exact: true })).toBeVisible();
  await expect(hayate.getByText(t("rule.pulse.brief"), { exact: true })).toBeVisible();
  expect(await page.locator("#nueva-bastidor-shiden").isChecked()).toBe(ticked);

  // a runner card's switch sits on the line it changes, her unique skill
  const caracara = await page.locator("#nueva-corredora-caracara").isChecked();
  await page.click("#nueva-corredora-caracara-explicacion-completo");
  await pressed(page, "#nueva-corredora-caracara-explicacion-completo");
  expect(await page.locator("#nueva-corredora-caracara").isChecked()).toBe(caracara);

  // the top bar: every card in full
  await page.click("#explicaciones-completo");
  await pressed(page, "#explicaciones-completo");
  await expect(hayate.getByText(t("rule.pulse"), { exact: true })).toBeVisible();
  await expect(page.getByText(t("rule.pulse.brief"), { exact: true })).toHaveCount(0);

  // a card back to brief overrides the default for that card only
  await page.click("#nueva-bastidor-shiden-explicacion-breve");
  await expect(shiden.getByText(t("rule.pulse.brief"), { exact: true })).toBeVisible();
  await expect(hayate.getByText(t("rule.pulse"), { exact: true })).toBeVisible();

  // a reload keeps the default ("Completo") and forgets the card's own choice
  await page.reload();
  await page.goto("#inicio");
  await page.click("#inicio-nueva");
  await pressed(page, "#explicaciones-completo");
  await expect(shiden.getByText(t("rule.pulse"), { exact: true })).toBeVisible();
  await pressed(page, "#nueva-bastidor-shiden-explicacion-completo");

  // and back to brief, remembered as well
  await page.click("#explicaciones-breve");
  await pressed(page, "#explicaciones-breve");
  await page.reload();
  await pressed(page, "#explicaciones-breve");
  await expect(shiden.getByText(t("rule.pulse.brief"), { exact: true })).toBeVisible();
});

test("changing the default keeps the card in view where it was", async ({ page }) => {
  await page.goto("#inicio");
  await page.click("#inicio-nueva");
  const sylphe = page.locator("#nueva-bastidor-sylphe-nombre");
  await sylphe.evaluate((el) => {
    window.scrollTo({
      top: window.scrollY + el.getBoundingClientRect().top - 400,
      behavior: "instant",
    });
  });
  const top = async () => (await sylphe.boundingBox())?.y ?? Number.NaN;
  const before = await top();
  for (const id of ["#explicaciones-completo", "#explicaciones-breve"]) {
    await page.click(id);
    await pressed(page, id);
    expect(Math.abs((await top()) - before), id).toBeLessThanOrEqual(2);
  }
});

test("on a phone the switches open with the detail, a finger wide, and work without storage", async ({
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

  // a folded card shows its switch only with the texts it changes
  for (const id of ["#nueva-bastidor-shiden", "#nueva-corredora-peregrina"]) {
    await expect(page.locator(`${id}-explicacion-breve`), id).toBeHidden();
    await page.click(`${id}-detalle > summary`);
    await expect(page.locator(`${id}-explicacion-breve`), id).toBeVisible();
  }

  // the default sits at the screen's head (the top bar's row scrolls away on a phone)
  await expect(page.locator("#explicaciones-completo")).toHaveCount(1);
  await expect(page.locator("form > header #explicaciones-completo")).toBeVisible();
  for (const id of [
    "#nueva-bastidor-shiden-explicacion-breve",
    "#nueva-bastidor-shiden-explicacion-completo",
    "#explicaciones-breve",
    "#explicaciones-completo",
  ]) {
    // 44 px: a finger's target
    const box = await page.locator(id).boundingBox();
    expect(box?.height ?? 0, id).toBeGreaterThanOrEqual(44);
    expect(box?.width ?? 0, id).toBeGreaterThanOrEqual(44);
  }

  await page.click("#explicaciones-completo");
  await pressed(page, "#explicaciones-completo");
  await expect(card(page, "shiden").getByText(t("rule.pulse"), { exact: true })).toBeVisible();
});
