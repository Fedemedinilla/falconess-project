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

/** The title screen (owner 2026-11-12): a tap anywhere starts. */
async function pastTitle(page: Page): Promise<void> {
  await page.click("#m-titulo");
  await expect(page.locator("#m-titulo")).toHaveCount(0);
}

/** A story scene in the way (owner 2026-11-12): skip it and let its notice go. */
async function skipScene(page: Page): Promise<boolean> {
  if ((await page.locator("#m-capitulo").count()) === 0) return false;
  await page.click("#m-capitulo-saltar");
  await expect(page.locator("#m-capitulo")).toHaveCount(0);
  return true;
}

async function startMobile(page: Page, falconessId = "peregrina"): Promise<void> {
  await page.goto("./");
  await pastTitle(page);
  await expect(page.getByRole("heading", { name: t("ui.m.pick.title") })).toBeVisible();
  await expect(page.locator("#m-empezar")).toBeDisabled();
  await page.click(`#m-elegir-${falconessId}`);
  await expect(page.locator(`#m-elegir-${falconessId}`)).toHaveAttribute("aria-pressed", "true");
  await page.click("#m-empezar");
  await expect(page.locator("#m-semana")).toHaveAttribute(
    "aria-label",
    t("ui.m.week.aria", { turn: 1, turns: 48, left: 47 }),
  );
  // Peregrina's prologue opens her season
  if (falconessId === "peregrina") {
    await expect(page.locator("#m-capitulo")).toBeVisible();
    await skipScene(page);
  }
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
    if (await skipScene(page)) continue;
    if ((await page.locator("#m-fin").count()) > 0) return;
    const menu = page.locator("#m-entrenar");
    if ((await menu.count()) > 0 && (await menu.isEnabled())) {
      // the dialog opens right after the input: give it a moment before calling the menu free
      await page.waitForTimeout(100);
      if (
        (await weekOpen.count()) === 0 &&
        (await event.count()) === 0 &&
        (await page.locator("#m-capitulo").count()) === 0
      )
        return;
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
  // the training's result first (owner 2026-11-12): on the training screen, then in «Lo que
  // pasó» as on any week, without the race; then the position, then the race
  await expect(page.locator("#m-resultado")).toBeVisible();
  await expect(page.locator("#semana-dialogo[open]")).toBeVisible();
  await expect(page.locator("#semana-ver-carrera")).toHaveCount(0);
  await expect(page.locator("#semana-posicion")).toHaveCount(0);
  await page.click("#semana-continuar");
  await expect(page.locator("#m-precarrera-accion")).toBeVisible();
  await expect(page.locator("#m-posicion-lead")).toBeChecked();
  // the action is decided once its result was seen: no way back
  await expect(page.locator("#m-volver")).toHaveCount(0);
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
      await page.click("#semana-continuar");
      await page.click("#m-correr");
      await runRace(page);
    }
    await settle(page);
  }
  await expect(page.locator("#m-fin")).toBeVisible();
  await expect(page.locator("#m-fin-nota")).toContainText(/[A-Z]/);
  // ADR-0013: the season's black box is shown and kept for the next season
  await expect(page.locator("#m-fin-caja")).toContainText("★");
  await page.click("#m-fin-nueva");
  await expect(page.getByRole("heading", { name: t("ui.m.pick.title") })).toBeVisible();
  await expect(page.locator("#m-continuar")).toBeVisible();
  await expect(page.locator("#m-herencia button[data-box]")).toHaveCount(1);

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
  await page.click("#semana-continuar");
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
  await page.click("#semana-continuar");
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

test("sounds: a tap, a change of screen, a training's result; the «Menú» switch cycles the styles", async ({
  page,
}) => {
  // the tests cannot hear: the page names its last cue on <html data-sfx="count:cue">
  const cue = async () =>
    ((await page.locator("html").getAttribute("data-sfx")) ?? "").split(":")[1];
  await startMobile(page);
  await page.click("#m-entrenar");
  await expect.poll(cue).toBe("nav");
  await page.click("#m-entrenar-risk-flight");
  await expect.poll(cue).toBe("tap");
  await page.dblclick("#m-entrenar-agility");
  await expect.poll(cue).toMatch(/^(success|boost|fail)$/);
  const result = await page.locator("html").getAttribute("data-sfx");
  // the result is not followed by the whoosh of going back to the menu
  await page.waitForTimeout(300);
  expect(await page.locator("html").getAttribute("data-sfx")).toBe(result);
  await settle(page);

  // the switch: Propulsor → Visor → apagado → Hangar → Propulsor, remembered on reload
  await page.click("#m-menu");
  const sw = page.locator("#m-sonido");
  await expect(sw).toHaveAttribute("data-style", "propulsor");
  for (const style of ["visor", "off", "hangar"]) {
    await sw.click();
    await expect(sw).toHaveAttribute("data-style", style);
    await expect(sw).toContainText(t(`ui.m.sound.${style}`));
  }
  await page.reload();
  await pastTitle(page);
  await page.click("#m-continuar");
  await settle(page);
  await page.click("#m-menu");
  await expect(page.locator("#m-sonido")).toHaveAttribute("data-style", "hangar");

  // apagado plays nothing
  await page.locator("#m-sonido").click();
  await page.locator("#m-sonido").click();
  await page.locator("#m-sonido").click();
  await expect(page.locator("#m-sonido")).toHaveAttribute("data-style", "off");
  const before = await page.locator("html").getAttribute("data-sfx");
  await page.click("#m-menu-cerrar");
  await page.click("#m-entrenar");
  await page.waitForTimeout(200);
  expect(await page.locator("html").getAttribute("data-sfx")).toBe(before);
});

test("difficulty: Normal by default, Exigente shows its chip and its harder ladder", async ({
  page,
}) => {
  await page.goto("./");
  await pastTitle(page);
  await expect(page.locator("#m-dificultad-normal")).toHaveAttribute("aria-pressed", "true");
  await page.click("#m-dificultad-exigente");
  await expect(page.locator("#m-dificultad-exigente")).toHaveAttribute("aria-pressed", "true");
  await page.click("#m-elegir-cernicala");
  await page.click("#m-empezar");
  await expect(page.locator("#m-exigente")).toHaveText(t("ui.m.difficulty.exigente"));
  // the first Exigente goal: Mirador, 5th or better (Normal asks 6th)
  await expect(page.locator("#m-meta")).toContainText(t("ui.m.goal.place", { place: 5 }));
  // the save carries the difficulty
  const save = await page.evaluate(() => localStorage.getItem("falconess.pruebas.partida") ?? "");
  expect(save).toContain('"difficulty":"exigente"');
});

test("Normal: no Exigente chip and no stat at the cap at the start", async ({ page }) => {
  await startMobile(page, "cernicala");
  await expect(page.locator("#m-exigente")).toHaveCount(0);
  await expect(page.locator("#m-stats [data-cap]")).toHaveCount(0);
});

test("inheritance: up to two of this browser's black boxes go into the new season", async ({
  page,
}) => {
  const box = (id: string, stat: string, stars: number) => ({
    id,
    rulesetVersion: "v3",
    falconessId: "peregrina",
    grade: "B",
    factors: {
      stat: { stat, stars },
      aptitude: { kind: "position", key: "closer", letter: "A", stars: 2 },
      skills: [],
      frameAffinity: "koryu",
    },
    seed: "s",
    inputsHash: "h",
  });
  const boxes = [box("b1", "agility", 2), box("b2", "stamina", 1), box("b3", "technique", 1)];
  await page.addInitScript((list) => {
    localStorage.setItem("falconess.juego.cajas", JSON.stringify(list));
  }, boxes);
  await page.goto("./");
  await pastTitle(page);
  const list = page.locator("#m-herencia button[data-box]");
  await expect(list).toHaveCount(3);
  await page.click('[data-box="b1"]');
  await page.click('[data-box="b2"]');
  // two at most
  await expect(page.locator('[data-box="b3"]')).toBeDisabled();
  await page.click('[data-box="b2"]');
  await expect(page.locator('[data-box="b3"]')).toBeEnabled();
  await page.click('[data-box="b3"]');
  await page.click("#m-elegir-peregrina");
  await page.click("#m-empezar");
  // the inheritance card: what each box gave at the start
  const card = page.locator("#m-inspiracion");
  await expect(card).toHaveAttribute("data-kind", "start");
  await expect(card.locator("li[data-parent]")).toHaveCount(2);
  await expect(card.locator('li[data-parent="0"]')).toContainText(t("stat.agility"));
  await expect(card.locator('li[data-parent="0"]')).toContainText("+40");
  await page.click("#m-inspiracion-seguir");
  await expect(card).toHaveCount(0);
  await expect(page.locator("#m-semana")).toBeVisible();
  const save = await page.evaluate(() => localStorage.getItem("falconess.pruebas.partida") ?? "");
  expect(save).toContain('"id":"b1"');
  expect(save).toContain('"id":"b3"');
  expect(save).not.toContain('"id":"b2"');
});

test("export: the run in play, and every season this browser played", async ({ page }) => {
  await startMobile(page, "caracara");
  await page.click("#m-descansar");
  await settle(page);
  // «Menú» → «Exportar partida»: the save as a file or as text
  await page.click("#m-menu");
  await page.click("#m-exportar-partida");
  const sheet = page.locator("#m-exportar[open]");
  await expect(sheet).toBeVisible();
  const text = await page.locator("#m-exportar-texto").inputValue();
  const save = JSON.parse(text);
  expect(save.schemaVersion).toBe(1);
  expect(save.inputs[0].falconessId).toBe("caracara");
  expect(save.inputs.length).toBeGreaterThan(1);
  const download = page.waitForEvent("download");
  await page.click("#m-exportar-descargar");
  expect((await download).suggestedFilename()).toMatch(/^falconess-caracara-s\d+-.+\.json$/);
  await page.click("#m-exportar-cerrar");

  // a new season: the old one stays in «Temporadas anteriores»
  await page.click("#m-menu");
  await page.click("#m-nueva");
  await page.click("#m-nueva-si");
  await page.click("#m-elegir-peregrina");
  await page.click("#m-empezar");
  await expect(page.locator("#m-semana")).toBeVisible();
  await skipScene(page);
  await page.click("#m-menu");
  await page.click("#m-temporadas");
  const rows = page.locator("#m-historial li[data-seed]");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(1)).toContainText(t("falconess.caracara"));
  await rows.nth(1).getByRole("button").click();
  await expect(page.locator("#m-exportar[open]")).toBeVisible();
  expect(await page.locator("#m-exportar-texto").inputValue()).toBe(text);
});

test("training scenes: Peregrina's art for the chosen training, cross-fading on change", async ({
  page,
}) => {
  await startMobile(page, "peregrina");
  await page.click("#m-entrenar");
  const stage = page.locator("#m-escena");
  await expect(stage).toHaveAttribute("data-scene", "chibi");
  await page.click("#m-entrenar-stamina");
  await expect(stage).toHaveAttribute("data-scene", "train:stamina");
  await page.click("#m-entrenar-agility");
  await expect(stage).toHaveAttribute("data-scene", "train:agility");
  // the chosen scene ends fully shown, the one before fully hidden
  await expect(stage.locator('img[data-kind="train:agility"]')).toHaveCSS("opacity", "1");
  await expect(stage.locator('img[data-kind="train:stamina"]')).toHaveCSS("opacity", "0");
  await page.click("#m-entrenar-technique");
  await expect(stage).toHaveAttribute("data-scene", "train:technique");
  await page.click("#m-entrenar-simulator");
  await expect(stage).toHaveAttribute("data-scene", "train:simulator");
});

/** Lines of the page that read as Spanish (common Spanish-only words or punctuation). */
async function spanishLines(page: Page): Promise<string[]> {
  const text = await page.evaluate(() => document.body.innerText);
  return text
    .split("\n")
    .filter((l) =>
      /[¿¡ñ]|\b(de|del|la|los|las|que|para|con|una|semana|carrera|meta|entrenar|descansar|seguir)\b/i.test(
        l,
      ),
    );
}

test("language: the menu switches to English and a whole short season reads in English", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.goto("./");
  await pastTitle(page);
  await page.click("#m-idioma-inicio");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("#m-idioma-inicio")).toHaveAttribute("data-lang", "en");
  expect(await spanishLines(page)).toEqual([]);
  await page.click("#m-elegir-caracara");
  await page.click("#m-empezar");
  const seen = new Set<string>();
  const look = async () => {
    for (const l of await spanishLines(page)) seen.add(l);
  };
  for (let i = 0; i < 80 && (await page.locator("#m-fin").count()) === 0; i++) {
    await look();
    const raceWeek = (await page.locator("#m-carrera").count()) > 0;
    await page.click("#m-descansar");
    await look();
    if (raceWeek) {
      await look();
      await page.click("#semana-continuar");
      await look();
      await page.click("#m-correr");
      await expect(page.locator("#m-carrera-vuelo")).toBeVisible();
      await look();
      await page.click("#m-saltar");
      await expect(page.locator("#m-resultado")).toBeVisible();
      await look();
      await page.click("#m-carrera-seguir");
    }
    await look();
    await settle(page);
  }
  await expect(page.locator("#m-fin")).toBeVisible();
  await look();
  expect([...seen]).toEqual([]);
  // the menu's switch, and back to Spanish: the season's end in Spanish again
  await page.click("#m-fin-nueva");
  await page.click("#m-idioma-inicio");
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.getByRole("heading", { name: t("ui.m.pick.title") })).toBeVisible();
});

test("language: the switch in «Menú» keeps the run in play", async ({ page }) => {
  await startMobile(page, "peregrina");
  await page.click("#m-entrenar");
  await page.dblclick("#m-entrenar-agility");
  await settle(page);
  await page.click("#m-menu");
  await page.click("#m-idioma");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  expect(await week(page)).toBe(2);
  expect(await spanishLines(page)).toEqual([]);
  // kept for the next visit
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("screen transition: the sponsor's emblem covers the way into a race, and only that", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await startMobile(page, "peregrina");
  // other screens change without it (owner 2026-11-12)
  await page.click("#m-entrenar");
  await expect(page.locator("#m-entrenar-agility")).toBeVisible();
  await expect(page.locator("#m-transicion")).toHaveCount(0);
  await page.click("#m-volver");
  while ((await page.locator("#m-carrera").count()) === 0) {
    await page.click("#m-descansar");
    await settle(page);
  }
  await page.click("#m-carrera");
  await page.click("#m-correr");
  await page.click("#m-descansar");
  await page.click("#semana-continuar");
  await page.click("#m-correr");
  const cover = page.locator("#m-transicion");
  await expect(cover).toBeVisible();
  // Kōryū's red first, its yellow line opening in the middle
  await expect(cover).toHaveCSS("background-color", "rgb(192, 57, 43)");
  await expect(cover).toHaveCount(0, { timeout: 3000 });
  await expect(page.locator("#m-carrera-vuelo")).toBeVisible();
  // and the race's own music
  expect(await page.evaluate(() => document.documentElement.dataset.music)).toBe("race");
});

test("the title screen: the name, «Tocá para empezar», and a tap anywhere starts", async ({
  page,
}) => {
  await page.goto("./");
  const title = page.locator("#m-titulo");
  await expect(title).toBeVisible();
  await expect(title).toContainText("FALCONESS");
  await expect(title).toContainText(t("ui.m.title.tap"));
  await title.click({ position: { x: 40, y: 40 } });
  await expect(title).toHaveCount(0);
  await expect(page.getByRole("heading", { name: t("ui.m.pick.title") })).toBeVisible();
  // once per visit: the test view and back, no title again
  await page.click("#m-pruebas-inicio");
  await page.click("#inicio-juego");
  await expect(page.getByRole("heading", { name: t("ui.m.pick.title") })).toBeVisible();
  await expect(title).toHaveCount(0);
});

test("music: the title theme from the title's tap, the menu theme in the season, off in «Menú»", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const plays: string[] = [];
    Reflect.set(window, "__plays", plays);
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      plays.push(this.currentSrc || this.src);
      return play.call(this);
    };
  });
  const music = () => page.evaluate(() => document.documentElement.dataset.music);
  const plays = () => page.evaluate(() => (Reflect.get(window, "__plays") as string[]).length);
  await page.goto("./");
  await expect.poll(music).toBe("title");
  await pastTitle(page);
  expect(await plays()).toBeGreaterThan(0);
  await page.click("#m-elegir-peregrina");
  await page.click("#m-empezar");
  await expect.poll(music).toBe("menu");
  await skipScene(page);
  // the switch, kept on reload
  await page.click("#m-menu");
  await expect(page.locator("#m-musica")).toHaveAttribute("data-on", "true");
  await page.click("#m-musica");
  await expect(page.locator("#m-musica")).toHaveAttribute("data-on", "false");
  await expect(page.locator("#m-musica")).toContainText(t("ui.m.music.off"));
  await page.reload();
  await pastTitle(page);
  await page.click("#m-continuar");
  await page.click("#m-menu");
  await expect(page.locator("#m-musica")).toHaveAttribute("data-on", "false");
});

test("story: Peregrina's prologue in the cinematic, skipped; «Historia» plays it again; the chat answers", async ({
  page,
}) => {
  await page.goto("./");
  await pastTitle(page);
  await page.click("#m-elegir-peregrina");
  await page.click("#m-empezar");
  const scene = page.locator("#m-capitulo");
  await expect(scene).toHaveAttribute("data-scene", "peregrina-prologue");
  await expect(scene).toHaveAttribute("data-style", "cine");
  await expect(scene).toContainText(t("story.peregrina-prologue.title"));
  // a tap completes the line, the next one moves on
  await page.waitForTimeout(1700);
  await page.click("#m-capitulo-seguir");
  await expect(scene).toContainText(t("story.peregrina-prologue.1"));
  await page.click("#m-capitulo-saltar");
  await expect(scene).toHaveCount(0);
  await expect(page.locator("#m-capitulo-aviso")).toContainText(t("ui.m.story.skipped"));
  // «Historia» lists it and plays it again
  await page.click("#m-menu");
  await page.click("#m-historia-abrir");
  await page.click('#m-historia [data-scene="peregrina-prologue"] button');
  await expect(scene).toHaveAttribute("data-scene", "peregrina-prologue");
  await page.click("#m-capitulo-saltar");
  await expect(scene).toHaveCount(0);
  // the chat: a new topic, her answer bubble by bubble
  await page.click("#m-menu");
  await expect(page.locator("#m-chat-abrir")).toHaveAttribute("data-new", "true");
  await page.click("#m-chat-abrir");
  await page.click('[data-topic="peregrina-why-race"]');
  await expect(page.locator("#m-chat")).toContainText(t("chat.peregrina-why-race.3"), {
    timeout: 8000,
  });
  await expect(page.locator('[data-topic="peregrina-why-race"]')).toHaveAttribute(
    "data-read",
    "true",
  );
  await page.click("#m-chat-cerrar");
  await expect(page.locator("#m-chat")).toHaveCount(0);
});
