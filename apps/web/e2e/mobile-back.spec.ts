import { expect, type Page } from "@playwright/test";
import { t } from "./fixtures";
import {
  continueRun,
  openPlan,
  pastTitle,
  seedRun,
  settle,
  skipScene,
  test,
  toPosition,
  toResult,
  week,
} from "./mobile-helpers";

/**
 * The back gesture inside #juego (owner O10, plan-final 5.6b): Android's back, iOS's edge swipe
 * and the browser's Back do what the screen's own «Volver» does (training, the workshop, the
 * planning card: back to the menu), close an open sheet as its own «Cerrar» does, and do nothing
 * while the week plays (its effects, a card, a scene, a training's result, the emblem, the decided
 * card, the race mode) or on the season's end. From the menu and the selection, as before, it
 * leaves #juego. `page.goBack()` is that gesture: a step back in the tab's history, as the
 * browser's Back and iOS's swipe are (Android Chrome's back closes a native sheet before it
 * reaches the history).
 */

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

/**
 * #juego entered from the test view's start, so the route before it is #inicio, on a seeded
 * save's week («Continuar»; a visit that starts in the test view has no title screen).
 */
async function enter(page: Page, save: string): Promise<void> {
  await seedRun(page, save);
  await page.goto("./#inicio");
  await page.click("#inicio-juego");
  await expect(page).toHaveURL(/#juego$/);
  await page.click("#m-continuar");
  await expect(page.locator("#m-continuar")).toHaveCount(0);
}

/** Still in the game: its address and its column. */
async function inGame(page: Page): Promise<void> {
  await expect(page).toHaveURL(/#juego$/);
  await expect(page.locator("[data-app]")).toHaveCount(1);
}

/** Out of the game, on the route before it. */
async function leftGame(page: Page): Promise<void> {
  await expect(page).toHaveURL(/#inicio$/);
  await expect(page.locator("#inicio-juego")).toBeVisible();
  await expect(page.locator("[data-app]")).toHaveCount(0);
}

/**
 * Back on #juego's own history entry (none of the game's left over): what a gesture from the menu
 * then leaves. A step back the game takes itself lands in its own task, a moment after the tap.
 */
async function noEntryLeft(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => history.state)).toBeNull();
}

/** The menu, free: its training button. */
async function onMenu(page: Page): Promise<void> {
  await expect(page.locator("#m-entrenar")).toBeVisible();
  await expect(page.locator("#m-entrenar")).toBeEnabled();
}

/**
 * The game's entry is in front again: where the gesture does nothing, the game steps forward onto
 * it, a moment after the gesture (a player's next gesture comes later than that).
 */
async function entryBack(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => history.state !== null)).toBe(true);
}

/** What `id` shows takes the gesture, twice, and stays, in #juego. */
async function stays(page: Page, id: string): Promise<void> {
  await expect(page.locator(id)).toBeVisible();
  for (let i = 0; i < 2; i++) {
    await page.goBack();
    await inGame(page);
    await expect(page.locator(id)).toBeVisible();
    await entryBack(page);
  }
}

test("1. Entrenar, then the gesture: the menu, the same week, still in #juego", async ({
  page,
}) => {
  await enter(page, "peregrina-w10");
  await onMenu(page);
  const turn = await week(page);
  await page.click("#m-entrenar");
  await expect(page.locator("#m-entrenar-technique")).toBeVisible();
  // the tests cannot hear: the page names its last cue on <html data-sfx="count:cue">
  const sfx = () => page.locator("html").getAttribute("data-sfx");
  const before = await sfx();
  await page.goBack();
  await onMenu(page);
  await expect(page.locator("#m-entrenar-technique")).toHaveCount(0);
  await inGame(page);
  expect(await week(page)).toBe(turn);
  // the whoosh «Volver» plays, once
  await expect.poll(sfx).not.toBe(before);
  const [count, cue] = (await sfx())?.split(":") ?? [];
  expect(cue).toBe("nav");
  expect(Number(count)).toBe(Number(before?.split(":")[0]) + 1);
  // from the menu the next one leaves #juego, as it always did
  await page.goBack();
  await leftGame(page);
});

test("2. the same for the workshop, its skills and the planning card", async ({ page }) => {
  await enter(page, "peregrina-w10");
  await onMenu(page);
  const turn = await week(page);
  // the planning card's door is the track drawer's card now (owner 2026-11-18, where the bar was)
  for (const [open, shown] of [
    ["#m-taller", "#m-taller-confirmar"],
    ["#m-habilidades", "#m-taller-puntos"],
    ["#m-pista", "#m-precarrera"],
  ] as const) {
    if (open === "#m-pista") await openPlan(page);
    else await page.click(open);
    await expect(page.locator(shown)).toBeVisible();
    await expect(page.locator("#m-volver")).toBeVisible();
    await page.goBack();
    await onMenu(page);
    await expect(page.locator(shown)).toHaveCount(0);
    await inGame(page);
    expect(await week(page)).toBe(turn);
  }
  await page.goBack();
  await leftGame(page);
});

test("3. on the menu the gesture leaves #juego for the route before it, as it always did", async ({
  page,
}) => {
  await enter(page, "peregrina-w10");
  await onMenu(page);
  await page.goBack();
  await leftGame(page);
});

test("4. Entrenar, «Volver», then the gesture: it leaves #juego (no entry left behind)", async ({
  page,
}) => {
  await enter(page, "peregrina-w10");
  await onMenu(page);
  await page.click("#m-entrenar");
  await expect(page.locator("#m-entrenar-technique")).toBeVisible();
  await page.click("#m-volver");
  await onMenu(page);
  await noEntryLeft(page);
  await page.goBack();
  await leftGame(page);
});

test("5. the decided card: the gesture stays on it, and the race still runs", async ({ page }) => {
  test.setTimeout(90_000);
  await enter(page, "peregrina-w10");
  await onMenu(page);
  await page.click("#m-descansar");
  await toPosition(page);
  for (let i = 0; i < 2; i++) {
    await page.goBack();
    await inGame(page);
    await expect(page.locator("#m-precarrera")).toBeVisible();
    await expect(page.locator("#m-precarrera-accion")).toHaveText(
      t("ui.m.race.action", { action: t("action.rest") }),
    );
    // no way back to the menu here (owner rule): the gesture does not open it either
    await expect(page.locator("#m-volver")).toHaveCount(0);
    await expect(page.locator("#m-entrenar")).toHaveCount(0);
    await entryBack(page);
  }
  await page.click("#m-correr");
  await expect(page.locator("#m-carrera-vuelo")).toBeVisible();
});

test("6. during the race the gesture does not leave it: the replay, then its result", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await enter(page, "peregrina-w10");
  await onMenu(page);
  await page.click("#m-descansar");
  await toPosition(page);
  await page.click("#m-correr");
  await expect(page.locator("#m-carrera-vuelo")).toBeVisible();
  await page.goBack();
  await inGame(page);
  await expect(page.locator("#m-carrera-vuelo")).toBeVisible();
  await expect(page.locator("[data-app]")).toHaveAttribute("data-mode", "race");
  await page.click("#m-saltar");
  await toResult(page);
  await page.goBack();
  await inGame(page);
  await expect(page.locator("#m-carrera-seguir")).toBeVisible();
  await page.click("#m-carrera-seguir");
  await settle(page);
  expect(await week(page)).toBe(11);
  // the race mode is over: from the menu the gesture leaves #juego again
  await noEntryLeft(page);
  await page.goBack();
  await leftGame(page);
});

test("7. with «Menú» open the gesture closes it and stays on the menu", async ({ page }) => {
  await enter(page, "peregrina-w10");
  await onMenu(page);
  await page.click("#m-menu");
  await expect(page.locator("#m-menu-dialogo")).toBeVisible();
  await page.goBack();
  await expect(page.locator("#m-menu-dialogo")).toHaveCount(0);
  await onMenu(page);
  await inGame(page);
  // as its own «Cerrar»: the focus back on «Menú»
  await expect(page.locator("#m-menu")).toBeFocused();
  await page.goBack();
  await leftGame(page);
});

test("8. the week's effects, the inheritance card and a scene ignore it", async ({ page }) => {
  test.setTimeout(90_000);
  await enter(page, "peregrina-w39-insp");
  await onMenu(page);
  await page.click("#m-descansar");
  await stays(page, "#m-efectos");
  await page.click("#m-efectos");
  await stays(page, "#m-inspiracion");
  await page.click("#m-inspiracion-seguir");
  await stays(page, "#m-capitulo");
  expect(await skipScene(page)).toBe(true);
  await onMenu(page);
  expect(await week(page)).toBe(40);
  await noEntryLeft(page);
  await page.goBack();
  await leftGame(page);
});

test("9. a training's result ignores it, then the menu leaves #juego", async ({ page }) => {
  test.setTimeout(90_000);
  await enter(page, "peregrina-w24-insp");
  await onMenu(page);
  await page.click("#m-entrenar");
  await page.dblclick("#m-entrenar-technique");
  await stays(page, "#m-resultado");
  await settle(page);
  expect(await week(page)).toBe(25);
  await noEntryLeft(page);
  await page.goBack();
  await leftGame(page);
});

test("10. the End and a race seen again from it ignore it; from the selection after it it leaves", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await enter(page, "peregrina-ended");
  // the season's end ignores the gesture, as the race mode does (O10)
  await stays(page, "#m-fin");
  await page.click("#m-fin-carrera-48");
  await expect(page.locator("#m-carrera-vuelo")).toBeVisible();
  await page.goBack();
  await inGame(page);
  await expect(page.locator("#m-carrera-vuelo")).toBeVisible();
  await page.click("#m-saltar");
  await expect(page.locator("#m-carrera-seguir")).toBeVisible();
  await page.click("#m-carrera-seguir");
  await stays(page, "#m-fin");
  // a new season's selection takes the game's entry back: the gesture leaves #juego there
  await page.click("#m-fin-nueva");
  await expect(page.locator("#m-continuar")).toBeVisible();
  await noEntryLeft(page);
  await page.goBack();
  await leftGame(page);
});

test("11. a reload takes the game's entry back: from the selection after it the gesture leaves", async ({
  page,
}) => {
  await enter(page, "peregrina-w10");
  await onMenu(page);
  await page.click("#m-entrenar");
  await expect(page.locator("#m-entrenar-technique")).toBeVisible();
  await page.reload();
  await pastTitle(page);
  await expect(page.locator("#m-continuar")).toBeVisible();
  await noEntryLeft(page);
  await page.goBack();
  await leftGame(page);
});

test("12. a reload on the decided card: the card comes back, and the gesture still stays on it", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await enter(page, "peregrina-w10");
  await onMenu(page);
  await page.click("#m-descansar");
  await toPosition(page);
  await page.reload();
  await continueRun(page);
  await expect(page.locator("#m-precarrera")).toBeVisible();
  await page.goBack();
  await inGame(page);
  await expect(page.locator("#m-precarrera")).toBeVisible();
  await page.click("#m-correr");
  await expect(page.locator("#m-carrera-vuelo")).toBeVisible();
});

test("13. a sheet over a sheet: each gesture closes the one on top, then it leaves", async ({
  page,
}) => {
  await enter(page, "peregrina-w10");
  await onMenu(page);
  // the panels open from the week menu's rail now (owner 2026-11-18), not from «Menú»
  await page.click("#m-leer-goals");
  await expect(page.locator("#m-panel-hoja")).toBeVisible();
  // a goal's track over the goals
  await page.locator("#m-metas button").first().click();
  await expect(page.locator("#m-pista-dialogo")).toBeVisible();
  await page.goBack();
  await expect(page.locator("#m-pista-dialogo")).toHaveCount(0);
  await expect(page.locator("#m-panel-hoja")).toBeVisible();
  await page.goBack();
  await expect(page.locator("#m-panel-hoja")).toHaveCount(0);
  await onMenu(page);
  await inGame(page);
  await noEntryLeft(page);
  await page.goBack();
  await leftGame(page);
});
