import { expect, type Page } from "@playwright/test";
import { t } from "./fixtures";
import { continueRun, pastTitle, seedRun, settle, startMobile, test, week } from "./mobile-helpers";

/**
 * The phone game's seams (plan-final 2.6): each run gets its own view, so nothing of one season
 * leaks into the next (F2: the week's effects); the game's tree is the same on a phone and on a
 * wide screen, so crossing the wide-screen size never restarts what is playing (F12); a scene
 * keeps the digest it started with (2.1); a mark in the story store reaches the game at once
 * (2.4); and the season's end shares the run's one «Exportar» sheet.
 */

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

/** «Menú» → «Nueva temporada» → confirm, then a new season with her. */
async function newSeason(page: Page, falconessId: string): Promise<void> {
  await page.click("#m-menu");
  await page.click("#m-nueva");
  await page.click("#m-nueva-si");
  await page.click(`#m-elegir-${falconessId}`);
  await page.click("#m-empezar");
  await expect(page.locator("#m-semana")).toHaveAttribute(
    "aria-label",
    t("ui.m.week.aria", { turn: 1, turns: 48, left: 47 }),
  );
}

test("F2: a second season's first rest plays its effects, as the first season's did", async ({
  page,
}) => {
  await startMobile(page, "caracara");
  await page.click("#m-descansar");
  await expect(page.locator('#m-efectos [data-fx^="sleep-"]')).toBeVisible();
  await settle(page);
  expect(await week(page)).toBe(2);

  // the same week of the next season (its run's length is the same: 2 inputs)
  await newSeason(page, "caracara");
  await page.click("#m-descansar");
  await expect(page.locator('#m-efectos [data-fx^="sleep-"]')).toBeVisible();
  await settle(page);
  expect(await week(page)).toBe(2);
  // the week was read: a reload does not play its effects again
  await page.reload();
  await continueRun(page);
  await expect(page.locator("#m-entrenar")).toBeEnabled();
  await expect(page.locator("#m-efectos")).toHaveCount(0);
});

test("F12: crossing the wide-screen size keeps the scene that is playing (no remount)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./");
  await pastTitle(page);
  await page.click("#m-elegir-peregrina");
  await page.click("#m-empezar");
  const scene = page.locator("#m-capitulo");
  await expect(scene).toBeVisible();
  await expect(page.locator("#m-panel")).toBeVisible();
  // a mark on the scene's element: a remount would build a new one, without it
  await scene.evaluate((el) => el.setAttribute("data-probe", "kept"));
  // narrower than the wide screen: the phone's layout, the panel gone
  await page.setViewportSize({ width: 1000, height: 800 });
  await expect(page.locator("#m-panel")).toHaveCount(0);
  await expect(scene).toHaveAttribute("data-probe", "kept");
  // and wide again
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator("#m-panel")).toBeVisible();
  await expect(scene).toHaveAttribute("data-probe", "kept");
});

test("F12: the story notice is placed again over the track tab when the window crosses the wide-screen size", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("./");
  await pastTitle(page);
  await page.click("#m-elegir-peregrina");
  await page.click("#m-empezar");
  await page.click("#m-capitulo-saltar");
  const notice = page.locator("#m-capitulo-aviso");
  await expect(notice).toBeVisible();
  /**
   * From where the notice rests (its way-in slide taken out) to the tab's top, on the screen
   * (owner 2026-11-14: just over the tab).
   */
  const gap = () =>
    page.evaluate(() => {
      const el = document.getElementById("m-capitulo-aviso");
      const tab = document.getElementById("m-pista-tab")?.getBoundingClientRect();
      if (!el || !tab) return Number.NaN;
      const shift = getComputedStyle(el).transform;
      const slide = shift === "none" ? 0 : new DOMMatrixReadOnly(shift).m42;
      return tab.top - (el.getBoundingClientRect().bottom - slide);
    });
  expect(await gap()).toBeGreaterThanOrEqual(0);
  // the phone's layout: the column and its tab move, the notice follows them
  await page.setViewportSize({ width: 1000, height: 800 });
  await expect(page.locator("#m-panel")).toHaveCount(0);
  await expect(notice).toBeVisible();
  expect(await gap()).toBeGreaterThanOrEqual(0);
  expect(await gap()).toBeLessThan(40);
});

test("a scene keeps the «Ritmo» it started with: Normal chosen mid-digest, then a re-render", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => localStorage.setItem("falconess.juego.ritmo", "fast"));
  await page.goto("./");
  await pastTitle(page);
  await page.click("#m-elegir-peregrina");
  await page.click("#m-empezar");
  const scene = page.locator("#m-capitulo");
  await expect(scene).toHaveAttribute("data-digest", "true");
  await scene.evaluate((el) => el.setAttribute("data-probe", "kept"));
  // the wide screen's panel is locked under the scene (D4, 5.5): a tap on «Ritmo» changes nothing
  const pace = page.locator("#m-ritmo");
  await expect(page.locator("#m-panel")).toHaveAttribute("inert", "");
  const box = await pace.boundingBox();
  if (!box) throw new Error("no «Ritmo» on the panel");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(pace).toHaveAttribute("data-pace", "fast");
  // «Ritmo» changed all the same (its button's own handler, which no tap reaches now): Rápido →
  // Directo → Normal
  await pace.dispatchEvent("click");
  await pace.dispatchEvent("click");
  await expect(pace).toHaveAttribute("data-pace", "normal");
  // the game renders again (the panel goes): the same scene, still its digest (2.1, F11)
  await page.setViewportSize({ width: 1000, height: 800 });
  await expect(page.locator("#m-panel")).toHaveCount(0);
  await expect(scene).toHaveAttribute("data-probe", "kept");
  await expect(scene).toHaveAttribute("data-digest", "true");
  await expect(page.locator("#m-capitulo-resumen")).toBeVisible();
});

test("a chat topic shows as read at once: the story store tells the game (2.4)", async ({
  page,
}) => {
  // a week with no scene due and no notice waiting: nothing else renders the game meanwhile
  await seedRun(page, "peregrina-w10");
  await page.goto("./");
  await continueRun(page);
  await expect(page.locator("#m-capitulo-aviso")).toHaveCount(0);
  await page.click("#m-menu");
  await page.click("#m-chat-abrir");
  const topic = page.locator('[data-topic="peregrina-why-race"]');
  await expect(topic).toHaveAttribute("data-read", "false");
  await topic.click();
  await expect(topic).toHaveAttribute("data-read", "true");
});

test("the season's end opens the run's one «Exportar» sheet, and closing it gives the focus back", async ({
  page,
}) => {
  await seedRun(page, "peregrina-ended");
  await page.goto("./");
  await continueRun(page);
  await expect(page.locator("#m-fin")).toBeVisible();
  await expect(page.locator("#m-exportar")).toHaveCount(0);
  await page.click("#m-fin-exportar");
  await expect(page.locator("#m-exportar[open]")).toBeVisible();
  await expect(page.locator("#m-exportar")).toHaveCount(1);
  const save = JSON.parse(await page.locator("#m-exportar-texto").inputValue());
  expect(save.inputs[0].falconessId).toBe("peregrina");
  await page.click("#m-exportar-cerrar");
  await expect(page.locator("#m-exportar")).toHaveCount(0);
  await expect(page.locator("#m-fin-exportar")).toBeFocused();
});
