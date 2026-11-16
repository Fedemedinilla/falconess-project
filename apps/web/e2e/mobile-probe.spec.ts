import { expect, type Page } from "@playwright/test";
import { continueRun, seedRun, startMobile, test } from "./mobile-helpers";
import { coverage, freezeAt, opacityOf } from "./motion";

/**
 * The test tools of the phone game (plan-final §2.8). The frame probe every phone test runs
 * under: it catches each of its rules, says which elements collided, when and for how many
 * frames, keeps watching after a reload and under a paused fake clock, and leaves the test view
 * alone. The motion helpers, on markup whose numbers are known. Then the two sheets the probe
 * caught twice on the page: the goals' track sheet over the menu's own, and the phone's «Menú»
 * beside the wide screen's panel (neither is mounted while it is not needed).
 */

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

/** Markup put into the game's column by hand, to break a rule on purpose. */
async function inject(page: Page, html: string): Promise<void> {
  await page.evaluate((markup) => {
    const box = document.createElement("div");
    box.setAttribute("data-probe-test", "");
    box.innerHTML = markup;
    (document.querySelector("[data-app]") ?? document.body).append(box);
  }, html);
}

/** Until the page has painted twice: what was injected was on screen for a frame at least. */
async function twoFrames(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))),
  );
}

async function removeInjected(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll("[data-probe-test]")) el.remove();
  });
}

test("the probe names a duplicate id, where each copy sits and the frame it showed in", async ({
  page,
  probe,
}) => {
  await startMobile(page, "cernicala");
  expect(probe.reports()).toEqual([]);
  await inject(page, '<i id="probe-twin"></i><b id="probe-twin"></b>');
  await expect.poll(() => probe.reports().length).toBe(1);
  // painted before it goes (else the report says "gone before the next frame", rightly)
  await twoFrames(page);
  await removeInjected(page);
  await expect.poll(() => probe.reports()[0] ?? "").not.toContain("frames not counted yet");
  const [report] = probe.take();
  expect(report).toMatch(/^page load 1, a DOM change \d+\.\d\d s after the load \(\d+\.\d s into/);
  expect(report).toMatch(/on screen for \d+ frames?, (the one|from the frame) at \d+\.\d\d s/);
  expect(report).toContain('id "probe-twin" on 2 elements:');
  expect(report).toContain('div[data-app="true"] › i#probe-twin');
  expect(report).toContain('div[data-app="true"] › b#probe-twin');
});

test("two screens, or two layers «in», in the same frame", async ({ page, probe }) => {
  await startMobile(page, "cernicala");
  await inject(
    page,
    '<div data-screen="menu"></div><div data-screen="train"></div>' +
      '<div data-layer="fx" data-layer-phase="out"></div>' +
      '<div data-layer="scene" data-layer-phase="in"></div>' +
      '<div data-layer="emblem" data-layer-phase="in"></div>',
  );
  await expect.poll(() => probe.reports().length).toBe(1);
  await removeInjected(page);
  const [report] = probe.take();
  expect(report).toContain("2 screens at once ([data-screen]):");
  expect(report).toContain('div[data-screen="menu"]');
  expect(report).toContain('div[data-screen="train"]');
  expect(report).toContain('2 layers «in» at once ([data-layer-phase="in"]):');
  expect(report).toContain('div[data-layer="scene"][data-layer-phase="in"]');
  expect(report).toContain('div[data-layer="emblem"][data-layer-phase="in"]');
  // a leaving layer does not count
  expect(report).not.toContain('data-layer="fx"');
});

test("the probe keeps watching after a reload, and counts the page loads", async ({
  page,
  probe,
}) => {
  await startMobile(page, "cernicala");
  await page.reload();
  await continueRun(page);
  await inject(page, '<i id="probe-twin"></i><i id="probe-twin"></i>');
  await expect.poll(() => probe.reports().length).toBe(1);
  await removeInjected(page);
  const [report] = probe.take();
  expect(report).toMatch(/^page load 2, /);
});

test("a paused fake clock does not blind the probe: it keeps the real frames", async ({
  page,
  probe,
}) => {
  await page.clock.install();
  await startMobile(page, "cernicala");
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 500));
  await inject(page, '<i id="probe-twin"></i><i id="probe-twin"></i>');
  await expect.poll(() => probe.reports().length).toBe(1);
  await page.waitForTimeout(200);
  await removeInjected(page);
  await expect.poll(() => probe.reports()[0] ?? "").toMatch(/on screen for \d+ frames, from/);
  probe.take();
});

test("the test view is not the game: the probe leaves it alone", async ({ page, probe }) => {
  await page.goto("./#inicio");
  await expect(page.locator("#inicio-juego")).toBeVisible();
  await inject(page, '<i id="probe-twin"></i><i id="probe-twin"></i>');
  await page.waitForTimeout(300);
  expect(probe.reports()).toEqual([]);
  await removeInjected(page);
});

test("the motion helpers: an animation held at a moment, the opacity seen, what a veil covers", async ({
  page,
}) => {
  await startMobile(page, "cernicala");
  await page.evaluate(() => {
    const style = document.createElement("style");
    style.setAttribute("data-probe-test", "");
    style.textContent = "@keyframes probe-fade { from { opacity: 0 } to { opacity: 1 } }";
    document.head.append(style);
  });
  await inject(
    page,
    '<div id="probe-veil" style="position: fixed; inset: 0; z-index: 9999; background: #000; ' +
      'animation: probe-fade 1s linear both"><i id="probe-dot"></i></div>',
  );
  await freezeAt(page, 500);
  expect(await opacityOf(page, "#probe-dot")).toBeCloseTo(0.5, 2);
  const half = await coverage(page, "#probe-veil");
  expect(half.covered).toBe(0);
  expect(half.misses[0]).toContain("div#probe-veil at opacity 0.5");
  await freezeAt(page, 1000);
  expect(await opacityOf(page, "#probe-dot")).toBe(1);
  expect(await coverage(page, "#probe-veil")).toEqual({ covered: 45, points: 45, misses: [] });
  await removeInjected(page);
  expect((await coverage(page, "#probe-veil")).covered).toBe(0);
});

test("the goals' track sheet over the menu: one #m-pista-dialogo, on the phone", async ({
  page,
}) => {
  await startMobile(page, "cernicala");
  await page.click("#m-menu");
  await page.click("#m-panel-abrir-goals");
  await page.locator("#m-metas [data-turn]").first().click();
  await expect(page.locator("#m-pista-dialogo[open]")).toBeVisible();
  await expect(page.locator("#m-pista-dialogo")).toHaveCount(1);
  await page.click("#m-pista-cerrar");
  await expect(page.locator("#m-pista-dialogo")).toHaveCount(0);
});

test("the goals' track sheet over the menu: one #m-pista-dialogo, on a wide screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await startMobile(page, "cernicala");
  await page.click("#m-panel-goals");
  await page.locator("#m-metas [data-turn]").first().click();
  await expect(page.locator("#m-pista-dialogo[open]")).toBeVisible();
  await expect(page.locator("#m-pista-dialogo")).toHaveCount(1);
  await page.click("#m-pista-cerrar");
  await expect(page.locator("#m-pista-dialogo")).toHaveCount(0);
});

test("«Menú» open on the phone, then the window goes wide: it closes, and scenes still play", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await seedRun(page, "peregrina-w10");
  await page.goto("./");
  await continueRun(page);
  await page.click("#m-menu");
  await expect(page.locator("#m-menu-dialogo[open]")).toBeVisible();
  // a tablet turned to landscape: the panel beside the column is the menu now
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator("#m-panel")).toBeVisible();
  await expect(page.locator("#m-menu-dialogo")).toHaveCount(0);
  // nothing is left open behind the panel: her first race's scene comes before the position
  await page.click("#m-descansar");
  await expect(page.locator('#m-capitulo[data-scene="peregrina-debut"]')).toBeVisible({
    timeout: 20_000,
  });
});

test("the track sheet, mounted only while open, still gives the focus back on «Cerrar»", async ({
  page,
}) => {
  await startMobile(page, "cernicala");
  await page.focus("#m-pista-tab");
  await page.keyboard.press("Enter");
  await expect(page.locator("#m-pista-tab")).toHaveAttribute("aria-expanded", "true");
  await page.focus("#m-pista");
  await page.keyboard.press("Enter");
  await expect(page.locator("#m-pista-dialogo[open]")).toBeVisible();
  await page.focus("#m-pista-cerrar");
  await page.keyboard.press("Enter");
  await expect(page.locator("#m-pista-dialogo")).toHaveCount(0);
  await expect(page.locator("#m-pista")).toBeFocused();
});
