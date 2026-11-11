import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, type Page, test } from "@playwright/test";

/**
 * Screenshots of the first-person view turned by a drag (`E2E_SHOTS=1 playwright test --project
 * shots look-shots`), never committed: look-<row>-<where>.png in `E2E_SHOTS_DIR` (or
 * .work/look/shots/), 390 × 844, real fonts. The first race week of a phone season, paused at a
 * few rows; her head turned left, right and to her neck's reach on both sides.
 */

const OUT = process.env.E2E_SHOTS_DIR
  ? `${process.env.E2E_SHOTS_DIR.replace(/\/$/, "")}/`
  : fileURLToPath(new URL("../../../.work/look/shots/", import.meta.url));

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true });

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
});

/** Close «Lo que pasó» and answer any event, until the menu (or the season's end) is free. */
async function settle(page: Page): Promise<void> {
  const weekOpen = page.locator("#semana-dialogo[open]");
  const event = page.locator("#evento-dialogo[open]");
  for (let i = 0; i < 40; i++) {
    if ((await weekOpen.count()) > 0) {
      await page.click("#semana-continuar");
      await expect(weekOpen).toHaveCount(0);
      continue;
    }
    if ((await event.count()) > 0) {
      await page.click("#evento-opcion-0");
      continue;
    }
    if ((await page.locator("#m-fin").count()) > 0) return;
    const menu = page.locator("#m-entrenar");
    if ((await menu.count()) > 0 && (await menu.isEnabled())) {
      // the dialog opens right after the input: give it a moment before calling the menu free
      await page.waitForTimeout(100);
      if ((await weekOpen.count()) === 0 && (await event.count()) === 0) return;
      continue;
    }
    await page.waitForTimeout(100);
  }
  throw new Error("the week did not settle");
}

async function toRace(page: Page): Promise<void> {
  await page.goto("./");
  await page.click("#m-elegir-peregrina");
  await page.click("#m-empezar");
  while ((await page.locator("#m-carrera").count()) === 0) {
    await page.click("#m-descansar");
    await settle(page);
  }
  await page.click("#m-carrera");
  await page.click("#m-volver");
  await page.click("#m-descansar");
  await page.click("#m-correr");
  await page.click("#semana-continuar");
  await page.click("#m-carrera-vista-fpv");
  await page.click("#m-carrera-vuelo-salida");
  await page.click("#m-carrera-reproducir");
}

test("first person, looking around", async ({ page }) => {
  test.setTimeout(240_000);
  await toRace(page);
  const cv = page.locator("#m-carrera-vuelo-lienzo");
  await cv.scrollIntoViewIfNeeded();
  const box = await cv.boundingBox();
  if (!box) throw new Error("no canvas");
  const y = box.y + box.height * 0.5;
  const drag = async (dx: number) => {
    const x0 = box.x + box.width / 2 - dx / 2;
    await page.mouse.move(x0, y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(x0 + (dx * i) / 10, y);
    await page.waitForTimeout(120);
    await page.mouse.up();
  };
  /** Turn her head to `target` degrees (+ right) by drags of at most 250 px. */
  const lookTo = async (target: number) => {
    for (let k = 0; k < 6; k++) {
      const yaw = Number(await cv.getAttribute("data-yaw"));
      if (Math.abs(yaw - target) < 2) return;
      const dx = ((yaw - target) * box.width) / 180;
      await drag(Math.max(-250, Math.min(250, dx)));
    }
  };
  const rows = (process.env.LOOK_ROWS ?? "40,160,330").split(",").map(Number);
  for (const row of rows) {
    await lookTo(0);
    await page.locator("#m-carrera-tiempo").fill(String(row));
    await expect(page.locator("#m-carrera-vuelo")).toHaveAttribute("data-row", String(row));
    const shots: [string, number][] = [
      ["ahead", 0],
      ["left", -70],
      ["right", 70],
      ["back-right", 110],
      ["back-left", -110],
    ];
    for (const [name, target] of shots) {
      await lookTo(target);
      await page.waitForTimeout(250);
      const yaw = await cv.getAttribute("data-yaw");
      await page.screenshot({ path: `${OUT}look-${row}-${name}.png` });
      console.log(row, name, yaw, await page.locator("#m-carrera-visor").getAttribute("data-band"));
    }
  }
});
