import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, type Page } from "@playwright/test";
import { t, test } from "./fixtures";

/** What each v3 track asks for, as the calendar stores it (`pnpm content:track-demands`). */
const DEMANDS: Readonly<Record<string, readonly { stat: string; letter: string }[]>> = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../packages/content/calendars/v3.json", import.meta.url)),
    "utf8",
  ),
).trackDemands;

/**
 * The phone game (#juego, the default view): the approved prototype wired to the real season.
 * Seasons start on a random seed, so the tests play until they reach the scene they check (a race
 * week, the end), like the v2 tests do.
 */

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

/** The risk color of a failure chance, as the owner set it (per-mille). */
function toneOf(failPm: number): string {
  if (failPm <= 0) return "zero";
  if (failPm < 200) return "low";
  if (failPm < 400) return "mid";
  return "high";
}

const TONE_BG: Readonly<Record<string, string>> = {
  zero: "rgb(191, 230, 255)",
  low: "rgb(30, 123, 70)",
  mid: "rgb(242, 194, 48)",
  high: "rgb(179, 38, 30)",
};

async function startMobile(page: Page, falconessId = "peregrina"): Promise<void> {
  await page.goto("./");
  await expect(page.getByRole("heading", { name: t("ui.m.pick.title") })).toBeVisible();
  await expect(page.locator("#m-empezar")).toBeDisabled();
  await page.click(`#m-elegir-${falconessId}`);
  await expect(page.locator(`#m-elegir-${falconessId}`)).toHaveAttribute("aria-pressed", "true");
  await page.click("#m-empezar");
  await expect(page.locator("#m-semana")).toHaveAttribute(
    "aria-label",
    t("ui.m.week.aria", { turn: 1, turns: 48, left: 47 }),
  );
}

async function week(page: Page): Promise<number> {
  const label = (await page.locator("#m-semana").getAttribute("aria-label")) ?? "";
  return Number(/\d+/.exec(label)?.[0] ?? "0");
}

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

/** The week's race, once its action ran: the flight view, «Saltar», the result, «Continuar». */
async function runRace(page: Page): Promise<void> {
  await expect(page.locator("#m-carrera-vuelo")).toBeVisible();
  await page.click("#m-saltar");
  await expect(page.locator("#m-resultado")).toBeVisible();
  await page.click("#m-carrera-seguir");
}

test("pick a Falconess, train with a double tap, the failure badge in its risk color", async ({
  page,
}) => {
  await startMobile(page);
  // the menu: her stats, points, mood and the vigor bar
  await expect(page.locator("#m-stats [data-stat]")).toHaveCount(5);
  await expect(page.locator("#m-vigor")).toHaveAttribute("data-vigor", "100");
  await page.click("#m-entrenar");

  // a tap chooses: the badge hangs on the chosen button, nothing else moves
  const risk = page.locator("#m-entrenar-risk-flight");
  const box = await risk.boundingBox();
  await risk.click();
  await expect(risk).toHaveAttribute("aria-pressed", "true");
  expect(await risk.boundingBox()).toEqual(box);
  const failPm = Number(await risk.getAttribute("data-fail"));
  const badge = page.locator("#m-fallo");
  await expect(badge).toHaveText(t("ui.m.fail", { n: Math.max(1, Math.round(failPm / 10)) }));
  await expect(badge).toHaveAttribute("data-risk", toneOf(failPm));
  await expect(badge).toHaveCSS("background-color", TONE_BG[toneOf(failPm)] ?? "");
  // the vigor bar previews the cost
  await expect(page.locator("#m-vigor-costo")).toBeVisible();

  // a fast double tap on another trains it
  await page.dblclick("#m-entrenar-agility");
  await expect(page.locator("#semana-dialogo[open]")).toBeVisible();
  await page.click("#semana-continuar");
  await settle(page);
  expect(await week(page)).toBe(2);
});

test("the goal card: the track's profile, its distance class and letters; tap for the sheet", async ({
  page,
}) => {
  await startMobile(page, "peregrina");
  // Peregrina's first goal is the Sprint: two Curvas, a home straight, Agility and Technique
  const card = page.locator("#m-pista");
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("data-course", "sprint");
  await expect(page.locator("#m-pista-perfil")).toHaveAttribute(
    "data-pieces",
    "flat curves flat curves flat",
  );
  await expect(page.locator("#m-pista-perfil svg polyline")).toHaveCount(2);
  await expect(card.locator("[data-distance]")).toHaveText(t("ui.flight.distance.sprint"));
  const asks = DEMANDS.sprint ?? [];
  const chips = page.locator("#m-pista-pide [data-stat]");
  await expect(chips).toHaveCount(asks.length);
  for (const [i, d] of asks.entries()) {
    await expect(chips.nth(i)).toHaveAttribute("data-stat", d.stat);
    await expect(chips.nth(i)).toHaveAttribute("data-letter", d.letter);
  }
  // letters only: none of her numbers, no check marks
  expect(await card.textContent()).not.toMatch(/[0-9✓✔]/);

  await card.click();
  const sheet = page.locator("#m-pista-dialogo[open]");
  await expect(sheet).toBeVisible();
  await expect(page.locator("#m-pista-titulo")).toHaveText(t("course.sprint"));
  await expect(page.locator("#m-pista-sabor")).toHaveText(t("course.sprint.flavor"));
  await expect(page.locator("#m-pista-rasgos li")).toHaveText([
    `${t("segment.curves")}×2`,
    t("ui.m.track.final"),
  ]);
  await expect(page.locator("#m-pista-distancia")).toHaveText(
    t("ui.m.track.distance", { distance: t("ui.flight.distance.sprint"), m: 1200 }),
  );
  await expect(page.locator("#m-pista-hoja-perfil svg polyline")).toHaveCount(2);
  await expect(page.locator("#m-pista-hoja-pide [data-stat]")).toHaveCount(asks.length);
  expect(await page.locator("#m-pista-hoja-pide").textContent()).not.toMatch(/[0-9✓✔]/);
  await page.click("#m-pista-cerrar");
  await expect(sheet).toHaveCount(0);
  await expect(page.locator("#m-entrenar")).toBeEnabled();
});

test("a race week: pre-race card, the flight view, Saltar and the result", async ({ page }) => {
  test.setTimeout(120_000);
  await startMobile(page, "peregrina");
  let k = 0;
  while ((await week(page)) < 12) {
    if (k++ % 2) await page.click("#m-descansar");
    else {
      await page.click("#m-entrenar");
      await page.dblclick("#m-entrenar-agility");
    }
    await settle(page);
  }
  // the race button opens the card: positions, her letters, distance and passive
  await page.click("#m-carrera");
  await expect(page.locator("#m-precarrera-distancia")).toBeVisible();
  await expect(page.locator("#m-precarrera-pasiva")).toBeVisible();
  // the track's profile and letters, as on the goal card
  await expect(page.locator("#m-precarrera-pista-perfil")).toBeVisible();
  await expect(page.locator("#m-precarrera-pista-pide [data-letter]")).toHaveCount(
    DEMANDS.sprint?.length ?? 0,
  );
  await page.click('label[for="m-posicion-lead"]');
  await page.click("#m-correr");
  // the week's action, then the card again with «Correr»
  await page.click("#m-entrenar");
  await page.dblclick("#m-entrenar-technique");
  await expect(page.locator("#m-precarrera-accion")).toBeVisible();
  await expect(page.locator("#m-posicion-lead")).toBeChecked();
  await page.click("#m-correr");
  await runRace(page);
  // «Lo que pasó» says the race and the position she ran in
  await expect(page.locator("#semana-dialogo[open]")).toBeVisible();
  await expect(page.locator("#semana-posicion")).toHaveAttribute("data-position", "lead");
  await page.click("#semana-continuar");
  await settle(page);
});

test("the workshop: wings and skills, as one order that takes the week", async ({ page }) => {
  await startMobile(page, "cernicala");
  await page.click("#m-taller");
  await expect(page.locator("#m-taller-wings")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#m-taller-confirmar")).toBeDisabled();
  const otherId = await page
    .locator('[id^="m-ala-"][aria-pressed="false"]')
    .first()
    .getAttribute("id");
  const other = page.locator(`#${otherId}`);
  await other.click();
  await expect(other).toHaveAttribute("aria-pressed", "true");
  await page.click("#m-taller-skills");
  await expect(page.locator('[id^="m-habilidad-"]').first()).toBeVisible();
  await page.click("#m-taller-confirmar");
  await expect(page.locator("#semana-dialogo[open]")).toBeVisible();
  await page.click("#semana-continuar");
  await settle(page);
  expect(await week(page)).toBe(2);
});

test("a short season to its end, then a new one; the test view is one tap away", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await startMobile(page, "caracara");
  // resting every week: the goal races come (and one ends the season, or all four run)
  for (let i = 0; i < 80 && (await page.locator("#m-fin").count()) === 0; i++) {
    const raceWeek = (await page.locator("#m-carrera").count()) > 0;
    await page.click("#m-descansar");
    if (raceWeek) {
      await page.click("#m-correr");
      await runRace(page);
    }
    await settle(page);
  }
  await expect(page.locator("#m-fin")).toBeVisible();
  await expect(page.locator("#m-fin-nota")).toContainText(/[A-Z]/);
  await page.click("#m-fin-nueva");
  await expect(page.getByRole("heading", { name: t("ui.m.pick.title") })).toBeVisible();
  await expect(page.locator("#m-continuar")).toBeVisible();

  await page.click("#m-pruebas-inicio");
  await expect(page).toHaveURL(/#inicio$/);
  await page.click("#inicio-juego");
  await expect(page).toHaveURL(/#juego$/);
});

test("at 360 px no horizontal scroll on the menu and the training screen", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await startMobile(page);
  const side = () =>
    page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
  expect(await side()).toBeLessThanOrEqual(0);
  await page.click("#m-entrenar");
  expect(await side()).toBeLessThanOrEqual(0);
  // 44 px targets
  for (const id of ["#m-entrenar-agility", "#m-volver", "#m-entrenar-confirmar"]) {
    const b = await page.locator(id).boundingBox();
    expect(b?.height ?? 0, id).toBeGreaterThanOrEqual(44);
  }
});

/**
 * A finger swipe on the page (CDP touch events, which Chromium turns into a touch scroll the way a
 * phone does): from (x, y), dy pixels up, in ten moves.
 */
async function swipeUp(page: Page, x: number, y: number, dy: number): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let i = 1; i <= 10; i++)
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: y - (dy * i) / 10 }],
    });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
  await page.waitForTimeout(150);
}

test("the workshop's skills list scrolls by touch to its last skill, which takes a tap", async ({
  page,
}) => {
  await startMobile(page, "peregrina");
  await page.click("#m-habilidades");
  await expect(page.locator("#m-taller-skills")).toHaveAttribute("aria-selected", "true");
  const skills = page.locator('[id^="m-habilidad-"]');
  expect(await skills.count()).toBeGreaterThan(4);
  const last = skills.last();
  const foot = (await page.locator("#m-taller-confirmar").boundingBox())?.y ?? 844;
  // the last skill starts below the fold: a finger swipes the list until it shows
  for (let i = 0; i < 12; i++) {
    const box = await last.boundingBox();
    if (box && box.y + box.height <= foot) break;
    await swipeUp(page, 195, 560, 300);
  }
  const box = await last.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  expect(box.y).toBeGreaterThan(0);
  expect(box.y + box.height).toBeLessThanOrEqual(foot);
  // nothing clips it: the point under its middle is the button itself
  const hit = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.closest("button")?.id ?? "",
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  );
  expect(hit).toBe(await last.getAttribute("id"));
  await page.tap(`#${await last.getAttribute("id")}`, { force: true });
  if (await last.isEnabled()) await expect(last).toHaveAttribute("aria-pressed", "true");
});

test("the race in first person: the camera toggle, a race played from her eyes, back to the side", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await startMobile(page, "peregrina");
  while ((await page.locator("#m-carrera").count()) === 0) {
    await page.click("#m-descansar");
    await settle(page);
  }
  await page.click("#m-carrera");
  await page.click("#m-volver");
  await page.click("#m-descansar");
  await page.click("#m-correr");
  await expect(page.locator("#m-carrera-vuelo")).toBeVisible();
  // the side view is the default
  await expect(page.locator("#m-carrera-vista-side")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#m-carrera-vista-fpv")).toHaveText(t("ui.flight.cam.fpv"));
  await page.click("#m-carrera-vista-fpv");
  await expect(page.locator("#m-carrera-vista-fpv")).toHaveAttribute("aria-pressed", "true");
  await page.click("#m-carrera-vuelo-salida");
  await page.click("#m-carrera-vuelo-x4");
  // her visor: speed, band, body and kick, moving with the race
  const visor = page.locator("#m-carrera-visor");
  await expect(visor).toBeVisible();
  await expect(visor).toContainText(t("ui.flight.hud.kmh"));
  const flight = page.locator("#m-carrera-vuelo");
  await expect
    .poll(async () => Number(await flight.getAttribute("data-row")), { timeout: 20_000 })
    .toBeGreaterThan(150);
  // the canvas draws her view: sky at the top, track below, not one flat color
  const colors = await page.locator("#m-carrera-vuelo-lienzo").evaluate((cv) => {
    const c = (cv as HTMLCanvasElement).getContext("2d");
    if (!c) return [];
    const w = (cv as HTMLCanvasElement).width;
    const h = (cv as HTMLCanvasElement).height;
    return [0.2, 0.5, 0.7, 0.9].map((y) => [...c.getImageData(w / 2, h * y, 1, 1).data].join());
  });
  expect(new Set(colors).size).toBeGreaterThan(2);
  // a dive at any moment: the slider seeks while the visor follows
  await page.locator("#m-carrera-tiempo").fill("400");
  await expect(flight).toHaveAttribute("data-row", "400");
  await expect(visor).toHaveAttribute("data-band", /[0-3]/);
  // back to the side view: the visor goes, the race goes on
  await page.click("#m-carrera-vista-side");
  await expect(visor).toHaveCount(0);
  await page.click("#m-saltar");
  await expect(page.locator("#m-resultado")).toBeVisible();
});

/** A finger drag across the page (CDP touch events): from (x, y) by (dx, dy), in twelve moves. */
async function fingerDrag(page: Page, x: number, y: number, dx: number, dy: number): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let i = 1; i <= 12; i++)
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x + (dx * i) / 12, y: y + (dy * i) / 12 }],
    });
  // the finger rests before it lifts: no flick
  await page.waitForTimeout(150);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

test("first person: a finger turns her head sideways, up to her neck's reach, and it comes back alone", async ({
  page,
}) => {
  test.setTimeout(180_000);
  // a fake clock (flowing in real time) lets the test skip the idle seconds
  await page.clock.install();
  await startMobile(page, "peregrina");
  while ((await page.locator("#m-carrera").count()) === 0) {
    await page.click("#m-descansar");
    await settle(page);
  }
  await page.click("#m-carrera");
  await page.click("#m-volver");
  await page.click("#m-descansar");
  await page.click("#m-correr");
  await page.click("#m-carrera-vista-fpv");
  await page.click("#m-carrera-vuelo-salida");
  const cv = page.locator("#m-carrera-vuelo-lienzo");
  await expect(cv).toHaveAttribute("data-yaw", "0");
  await cv.scrollIntoViewIfNeeded();
  const box = await cv.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  const yaw = async () => Number(await cv.getAttribute("data-yaw"));
  const cy = box.y + box.height * 0.5;
  // a drag to the left turns her head to the right; the page does not scroll sideways
  const scrollY = await page.evaluate(() => window.scrollY);
  await fingerDrag(page, box.x + box.width * 0.7, cy, -120, 4);
  await expect.poll(yaw).toBeGreaterThan(35);
  const right = await yaw();
  expect(right).toBeLessThan(80);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
  // a long drag the other way stops at her neck's reach, a little behind her shoulder
  await fingerDrag(page, box.x + box.width * 0.1, cy, box.width * 0.85, 0);
  await fingerDrag(page, box.x + box.width * 0.1, cy, box.width * 0.85, 0);
  await expect.poll(yaw).toBe(-110);
  // a few seconds untouched: still turned; past the idle time, her eyes ease back to the track
  await page.clock.fastForward(3000);
  await page.waitForTimeout(300);
  expect(await yaw()).toBe(-110);
  await page.clock.fastForward(2500);
  await expect.poll(yaw, { timeout: 5000 }).toBeGreaterThan(-110);
  await expect.poll(yaw, { timeout: 5000 }).toBe(0);
  // the visor stays put over the view
  await expect(page.locator("#m-carrera-visor")).toBeVisible();
});
