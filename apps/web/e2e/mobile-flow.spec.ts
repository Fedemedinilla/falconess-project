import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, type Page } from "@playwright/test";
import { stubFonts, t, textPattern } from "./fixtures";
import {
  continueRun,
  pastTitle,
  seedRun,
  settle,
  skipScene,
  startMobile,
  test,
  toPosition,
  toResult,
  watchCues,
  week,
} from "./mobile-helpers";
import { coverage, freezeAt, holdClock, present, runClock, settleUpdates } from "./motion";

/**
 * The phone game's flow, now that the flow model drives it (plan-final 4.1): a sheet holds the
 * beat that comes while it is open and nothing else (a sheet in the page but closed holds nothing,
 * and a pick that closes its sheet does not hold what the pick starts), and a beat's timer keeps
 * its time whatever renders the game meanwhile (no identity churn). The inheritance card in D2's
 * order (5.3): after what the week did and before the next week's scenes, after the prologue at the
 * season's start, and once per card in this browser (a reload, a language switch or another tab of
 * the game keeps it shown, as it keeps a scene seen).
 * The notices (5.9): a scene's notice waits while anything plays in front, then shows its whole
 * time just over the screen's anchor (the track tab, a card's foot), fades out when the screen
 * changes, and is gone from the first frame of a scene; a run that no longer replays says so.
 * The sounds (5.10): only taps sound, and only a tap that goes to another screen whooshes.
 */

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test("a sheet in the page but closed holds nothing: the menu's and the race card's track sheets", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await seedRun(page, "peregrina-w10");
  await page.goto("./");
  await continueRun(page);
  // the menu's track sheet, opened and closed: its component stays in the page, closed
  await page.click("#m-pista-tab");
  await page.click("#m-pista");
  await expect(page.locator("#m-pista-dialogo[open]")).toBeVisible();
  await page.click("#m-pista-cerrar");
  await expect(page.locator("#m-pista-dialogo")).toHaveCount(0);
  // the race week's rest: what it did comes at once, then the emblem at a tap
  await page.click("#m-descansar");
  expect(await present(page, "#m-efectos")).toBe(true);
  await page.click("#m-efectos");
  expect(await present(page, "#m-transicion")).toBe(true);
  // her first race's scene plays over the decided card, whose own track sheet is in the page
  await expect(page.locator("#m-capitulo")).toHaveAttribute("data-scene", "peregrina-debut");
  await expect(page.locator("#m-precarrera")).toHaveCount(1);
  await skipScene(page);
  await page.click("#m-precarrera-pista");
  await expect(page.locator("#m-pista-dialogo[open]")).toBeVisible();
  await page.click("#m-pista-cerrar");
  await expect(page.locator("#m-pista-dialogo")).toHaveCount(0);
  await page.click("#m-correr");
  await page.click("#m-saltar");
  // and the scene after the race: nothing was left holding it
  await expect(page.locator("#m-capitulo")).toHaveAttribute("data-scene", "peregrina-debut-win");
});

test("a pick that closes its sheet does not hold what it starts: the outing's crew", async ({
  page,
}) => {
  await page.clock.install();
  await startMobile(page, "peregrina");
  await page.click("#m-salida");
  const sheet = page.locator("#m-salida-cuadrilla[open]");
  await expect(sheet).toBeVisible();
  const crew = (await sheet.locator("li[data-crew]").first().getAttribute("data-crew")) ?? "";
  await holdClock(page);
  await page.click(`#m-salida-con-${crew}`);
  // the sheet is released at its close request: the week's effects are there with the pick, under
  // the sheet on its way out (6.9), which then leaves
  expect(await present(page, "#m-salida-cuadrilla[data-closing]")).toBe(true);
  expect(await present(page, '#m-efectos [data-fx="bond"]')).toBe(true);
  await page.clock.runFor(200);
  await expect(page.locator("#m-salida-cuadrilla")).toHaveCount(0);
});

/**
 * When a training's result ends, from what it shows: `resultTimeline` (flow/trainResult.ts) at
 * «Ritmo» Normal. One «+N» slot for each stat, the points, the vigor and each crew's bond, from
 * `firstPop` every `popStep`; the crews' cards from `crewIn`, one every `crewStep`, read for 450 ms;
 * then `hold`.
 */
async function resultEnd(page: Page): Promise<number> {
  const RESULT = { firstPop: 520, popStep: 300, crewIn: 540, crewStep: 150, hold: 1100 };
  const bond = textPattern("ui.m.crew.bondUp").source;
  const { pops, crews, bonds } = await page.evaluate((bondUp) => {
    const re = new RegExp(bondUp);
    const cards = [...document.querySelectorAll("#m-resultado-cuadrillas [data-crew]")];
    return {
      pops:
        document.querySelectorAll("#m-resultado-pops [data-delta]").length +
        document.querySelectorAll("#m-vigor-cambio").length,
      crews: cards.length,
      bonds: cards.filter((c) =>
        [...c.querySelectorAll("span")].some((s) => re.test(s.textContent ?? "")),
      ).length,
    };
  }, bond);
  const slots = pops + bonds;
  const lastPop = RESULT.firstPop + RESULT.popStep * Math.max(0, slots - 1);
  const crewsIn = RESULT.crewIn + RESULT.crewStep * Math.max(0, crews - 1) + 450;
  return Math.max(lastPop, crewsIn) + RESULT.hold;
}

test("a training's result ends on its timeline under the fake clock, a render meanwhile or not", async ({
  page,
}) => {
  await page.clock.install();
  await seedRun(page, "peregrina-w39-insp");
  await page.goto("./");
  await continueRun(page);
  await page.click("#m-entrenar");
  await page.click("#m-entrenar-agility");
  // the clock stands still from here: the result's timers run only as the test moves it on
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  await page.click("#m-entrenar-agility");
  await expect(page.locator("#m-resultado")).toBeVisible();
  const end = await resultEnd(page);
  await settleUpdates(page);
  await page.clock.runFor(600);
  // the game renders again in the middle of it: the wide screen and back (its tree stays)
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator("#m-panel")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("#m-panel")).toHaveCount(0);
  await settleUpdates(page);
  await page.clock.runFor(end - 50 - 600);
  await settleUpdates(page);
  expect(await present(page, "#m-resultado")).toBe(true);
  await page.clock.runFor(100);
  await settleUpdates(page);
  expect(await present(page, "#m-resultado")).toBe(false);
});

/** Starts watching for the inheritance card: whether `#m-inspiracion` was ever in the page from now on. */
async function watchCard(page: Page): Promise<() => Promise<boolean>> {
  await page.evaluate(() => {
    const seen = () => document.getElementById("m-inspiracion") !== null;
    Reflect.set(window, "__card", seen());
    new MutationObserver(() => {
      if (seen()) Reflect.set(window, "__card", true);
    }).observe(document.body, { childList: true, subtree: true });
  });
  return () => page.evaluate(() => Reflect.get(window, "__card") === true);
}

test("weeks 39 → 40 (rule 9): the effects, the inheritance card, first-vos, then the race week", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await seedRun(page, "peregrina-w39-insp");
  await page.goto("./");
  await continueRun(page);
  await page.click("#m-descansar");
  // what the week did comes first; the card waits for it
  await expect(page.locator("#m-efectos")).toBeVisible();
  await expect(page.locator("#m-inspiracion")).toHaveCount(0);
  await page.click("#m-efectos");
  const card = page.locator("#m-inspiracion");
  await expect(card).toHaveAttribute("data-kind", "inspiration");
  await expect(page.locator("#m-capitulo")).toHaveCount(0);
  await page.click("#m-inspiracion-seguir");
  // then the week's scene, over the menu of week 40
  await expect(page.locator("#m-capitulo")).toHaveAttribute("data-scene", "peregrina-first-vos");
  await expect(card).toHaveCount(0);
  await skipScene(page);
  expect(await week(page)).toBe(40);
  // the race week: its action's effects, the emblem, the goal's scene, the card, the race
  await page.click("#m-descansar");
  await page.click("#m-efectos");
  await expect(page.locator("#m-transicion")).toBeVisible();
  await expect(page.locator("#m-capitulo")).toHaveAttribute("data-scene", "peregrina-summit");
  await skipScene(page);
  await page.click("#m-correr");
  await expect(page.locator("#m-carrera-vuelo")).toBeVisible();
  await page.click("#m-saltar");
  // the scene after the race if she won it (the invitation), then the result
  const result = page.locator("#m-resultado");
  const scene = page.locator("#m-capitulo");
  const scenes: string[] = [];
  for (let i = 0; i < 80 && (await result.count()) === 0; i++) {
    if ((await scene.count()) === 0) await page.waitForTimeout(100);
    else {
      scenes.push((await scene.getAttribute("data-scene")) ?? "");
      await skipScene(page);
    }
  }
  await expect(result).toBeVisible();
  const won = (await result.getAttribute("data-place")) === "1";
  if (won) expect(scenes).toEqual(["peregrina-invitation"]);
  else expect(scenes).not.toContain("peregrina-invitation");
  await page.click("#m-carrera-seguir");
  await settle(page);
  expect(await week(page)).toBe(41);
});

test("two tabs on one run: the inheritance card and the scene one of them showed never show again in the other", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  // the other tab: the same run on week 39's menu, so it has read the cards and scenes shown
  const other = await context.newPage();
  await stubFonts(other);
  await seedRun(other, "peregrina-w39-insp");
  await other.goto("./");
  await continueRun(other);
  await expect(other.locator("#m-descansar")).toBeVisible();
  expect(await week(other)).toBe(39);
  const shownThere = await watchIds(other, ["m-inspiracion", "m-capitulo"]);
  // this tab plays week 39: what it did, the inheritance card, then week 40's first scene
  await seedRun(page, "peregrina-w39-insp");
  await page.goto("./");
  await continueRun(page);
  await page.click("#m-descansar");
  await page.click("#m-efectos");
  await expect(page.locator("#m-inspiracion")).toHaveAttribute("data-kind", "inspiration");
  await page.click("#m-inspiracion-seguir");
  await expect(page.locator("#m-capitulo")).toHaveAttribute("data-scene", "peregrina-first-vos");
  await skipScene(page);
  expect(await week(page)).toBe(40);
  // the other tab plays the same week: what it did, and then week 40's menu, with nothing of what
  // this tab already showed (each store reads the browser's storage again where it decides)
  await other.click("#m-descansar");
  await expect(other.locator("#m-efectos")).toBeVisible();
  await other.click("#m-efectos");
  await expect
    .poll(
      async () =>
        (await other.locator("#m-inspiracion, #m-capitulo").count()) > 0 ||
        (await other.locator("[data-layer-phase]").count()) === 0,
    )
    .toBe(true);
  expect(await shownThere()).toEqual([]);
  expect(await week(other)).toBe(40);
  await expect(other.locator("#m-entrenar")).toBeVisible();
});

/** Starts watching `ids`: the ones that were ever in the page from now on, in the order they came. */
async function watchIds(page: Page, ids: readonly string[]): Promise<() => Promise<string[]>> {
  await page.evaluate((watched) => {
    const seen: string[] = [];
    Reflect.set(window, "__ids", seen);
    const look = () => {
      for (const id of watched)
        if (!seen.includes(id) && document.getElementById(id) !== null) seen.push(id);
    };
    look();
    new MutationObserver(look).observe(document.body, { childList: true, subtree: true });
  }, ids);
  return () =>
    page.evaluate(() => {
      const seen: unknown = Reflect.get(window, "__ids");
      return Array.isArray(seen) ? seen.map(String) : [];
    });
}

/** «Empezar» with one of this browser's black boxes as a parent: her start's card is due. */
async function startWithParent(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const box = {
      id: "b1",
      rulesetVersion: "v3",
      falconessId: "peregrina",
      grade: "B",
      factors: {
        stat: { stat: "agility", stars: 2 },
        aptitude: { kind: "position", key: "closer", letter: "A", stars: 2 },
        skills: [],
        frameAffinity: "koryu",
      },
      seed: "s",
      inputsHash: "h",
    };
    if (localStorage.getItem("falconess.juego.cajas") === null)
      localStorage.setItem("falconess.juego.cajas", JSON.stringify([box]));
  });
  await page.goto("./");
  await pastTitle(page);
  await page.click('[data-box="b1"]');
  await page.click("#m-elegir-peregrina");
  await page.click("#m-empezar");
}

test("the season's start with a parent: the prologue, then the inheritance card (D2)", async ({
  page,
}) => {
  await startWithParent(page);
  await expect(page.locator("#m-capitulo")).toHaveAttribute("data-scene", "peregrina-prologue");
  await expect(page.locator("#m-inspiracion")).toHaveCount(0);
  await skipScene(page);
  const card = page.locator("#m-inspiracion");
  await expect(card).toHaveAttribute("data-kind", "start");
  await page.click("#m-inspiracion-seguir");
  await expect(card).toHaveCount(0);
  await expect(page.locator("#m-entrenar")).toBeEnabled();
});

test("a card once shown stays shown: «Menú» → language, and the start's card does not come back (F19)", async ({
  page,
}) => {
  await startWithParent(page);
  // the prologue and the card, in whichever order they come
  for (let i = 0; i < 2; i++) {
    const card = page.locator("#m-inspiracion");
    await expect(page.locator("#m-capitulo, #m-inspiracion")).toHaveCount(1);
    if ((await card.count()) > 0) await page.click("#m-inspiracion-seguir");
    else await skipScene(page);
  }
  await expect(page.locator("#m-entrenar")).toBeEnabled();
  const card = await watchCard(page);
  await page.click("#m-menu");
  await page.click("#m-idioma");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("#m-entrenar")).toBeEnabled();
  await page.waitForTimeout(600);
  expect(await card()).toBe(false);
  expect(await week(page)).toBe(1);
});

test("a reload on the card brings it back; once «Continuar» on it, a reload does not (the browser's storage)", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await seedRun(page, "peregrina-w39-insp");
  await page.goto("./");
  await continueRun(page);
  await page.click("#m-descansar");
  await page.click("#m-efectos");
  const card = page.locator("#m-inspiracion");
  await expect(card).toHaveAttribute("data-kind", "inspiration");
  // the week's effects were read, the card not yet dismissed: a reload brings it back (§1.8)
  await page.reload();
  await continueRun(page);
  await expect(card).toHaveAttribute("data-kind", "inspiration");
  await page.click("#m-inspiracion-seguir");
  await expect(page.locator("#m-capitulo")).toHaveAttribute("data-scene", "peregrina-first-vos");
  await skipScene(page);
  expect(await week(page)).toBe(40);
  // dismissed: Boot's store kept it in the browser's storage, so the next load does not show it
  await page.reload();
  await pastTitle(page);
  const seen = await watchCard(page);
  await page.click("#m-continuar");
  await expect(page.locator("#m-descansar")).toBeEnabled();
  await page.waitForTimeout(600);
  expect(await seen()).toBe(false);
});

test("the cards an earlier build showed are not shown again: week 24, read, no card at «Continuar»", async ({
  page,
}) => {
  // a save from before the inheritance cards were kept: no `falconess.juego.herencia` yet
  await seedRun(page, "peregrina-w24-insp");
  await page.goto("./");
  await pastTitle(page);
  const card = await watchCard(page);
  await page.click("#m-continuar");
  await expect(page.locator("#m-entrenar")).toBeEnabled();
  expect(await week(page)).toBe(24);
  await page.waitForTimeout(600);
  expect(await card()).toBe(false);
});

test("reduced motion turned on during a race week's training result: the race mode opens with no emblem (5.5)", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await seedRun(page, "peregrina-w10");
  await page.goto("./");
  await continueRun(page);
  await page.click("#m-entrenar");
  await page.click("#m-entrenar-technique");
  await page.click("#m-entrenar-confirmar");
  await expect(page.locator("#m-resultado")).toBeVisible();
  // the phone's own setting changes while her result plays: the game reads it before the race mode
  await page.evaluate(() => {
    Reflect.set(window, "__emblem", false);
    new MutationObserver(() => {
      if (document.getElementById("m-transicion")) Reflect.set(window, "__emblem", true);
    }).observe(document.body, { childList: true, subtree: true });
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator('#m-capitulo[data-scene="peregrina-debut"]')).toBeVisible({
    timeout: 20_000,
  });
  expect(await page.evaluate(() => Reflect.get(window, "__emblem"))).toBe(false);
});

test("a race week's workshop swaps her wings: the card preselects the new wings' position, and the old one is a choice (F5)", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await seedRun(page, "peregrina-w10");
  await page.goto("./");
  await continueRun(page);
  // her dive wings race as a closer; Mule's (ground) as the pack
  await page.click("#m-taller");
  await page.click("#m-ala-mule");
  await page.click("#m-taller-confirmar");
  await toPosition(page);
  await expect(page.locator("#m-posicion-pack")).toBeChecked();
  // the old wings' position is no longer her default: picking it is a choice the race keeps
  await page.click('label[for="m-posicion-closer"]');
  await expect(page.locator("#m-posicion-closer")).toBeChecked();
  await page.click("#m-correr");
  await expect(page.locator("#m-carrera-vuelo")).toBeVisible();
  await page.click("#m-saltar");
  await toResult(page);
  await expect(page.locator("#m-resultado-posicion")).toHaveAttribute("data-position", "closer");
});

test("a normal week's training result shows the week she trained in: its HUD, its button, the vigor at its «±N» (critic b1, L3)", async ({
  page,
}) => {
  await page.clock.install();
  await seedRun(page, "peregrina-w39-insp");
  await page.goto("./");
  await continueRun(page);
  await page.click("#m-entrenar");
  await page.click("#m-entrenar-agility");
  const vigor = await page.locator("#m-vigor").getAttribute("data-vigor");
  // the clock stands still from here: the result's timers run only as the test moves it on
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  await page.click("#m-entrenar-agility");
  await expect(page.locator("#m-resultado")).toBeVisible();
  await settleUpdates(page);
  await page.clock.runFor(200);
  await settleUpdates(page);
  // the week she trained in, the button she trained on, the vigor not yet moved
  expect(await week(page)).toBe(39);
  await expect(page.locator("#m-entrenar-agility")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#m-vigor")).toHaveAttribute("data-vigor", vigor ?? "");
  // its «±N» lands before the result ends: the bar has moved, still on week 39
  const end = await resultEnd(page);
  await page.clock.runFor(end - 300);
  await settleUpdates(page);
  expect(await present(page, "#m-resultado")).toBe(true);
  expect(await week(page)).toBe(39);
  expect(await page.locator("#m-vigor").getAttribute("data-vigor")).not.toBe(vigor);
});

test("a race week's training result counts her stats up and keeps the week being decided (F6)", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await seedRun(page, "peregrina-w10");
  await page.goto("./");
  await continueRun(page);
  await page.click("#m-entrenar");
  await page.click("#m-entrenar-technique");
  const value = page.locator('#m-stats [data-stat="technique"] > span').nth(1);
  const before = Number(await value.textContent());
  await page.click("#m-entrenar-technique");
  await expect(page.locator("#m-resultado")).toBeVisible();
  expect(await week(page)).toBe(10);
  // the number counts up to what the training made of it, while the result is still there
  await expect
    .poll(async () => Number(await value.textContent()), { timeout: 2500 })
    .toBeGreaterThan(before);
  expect(await present(page, "#m-resultado")).toBe(true);
  expect(await week(page)).toBe(10);
});

// ---- the notices (5.9) ----

/** A scene this browser saw in an earlier season: passed by, its notice with «Ver». After seedRun. */
async function seenEver(page: Page, id: string): Promise<void> {
  await page.addInitScript((scene) => {
    const key = "falconess.juego.historia";
    const story: { runs: Record<string, string[]>; ever: string[] } = JSON.parse(
      localStorage.getItem(key) ?? '{"runs":{},"ever":[]}',
    );
    if (story.ever.includes(scene)) return;
    story.ever.push(scene);
    localStorage.setItem(key, JSON.stringify(story));
  }, id);
}

type Box = {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
};

/** The story notice where it rests (its way-in rise taken out). */
function noticeBox(page: Page): Promise<Box> {
  return page.locator("#m-capitulo-aviso").evaluate((el) => {
    const r = el.getBoundingClientRect();
    const shift = getComputedStyle(el).transform;
    const dy = shift === "none" ? 0 : new DOMMatrixReadOnly(shift).m42;
    return { left: r.left, right: r.right, top: r.top - dy, bottom: r.bottom - dy };
  });
}

async function boxOf(page: Page, selector: string): Promise<Box> {
  const b = await page.locator(selector).boundingBox();
  if (!b) throw new Error(`${selector} has no box`);
  return { left: b.x, right: b.x + b.width, top: b.y, bottom: b.y + b.height };
}

const overlaps = (a: Box, b: Box): boolean =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/** Starts watching whether the notice was ever in the page together with `selector`. */
async function watchNoticeWith(page: Page, selector: string): Promise<() => Promise<boolean>> {
  await page.evaluate((sel) => {
    const both = () =>
      document.querySelector(sel) !== null && document.getElementById("m-capitulo-aviso") !== null;
    Reflect.set(window, "__noticeWith", both());
    new MutationObserver(() => {
      if (both()) Reflect.set(window, "__noticeWith", true);
    }).observe(document.body, { childList: true, subtree: true });
  }, selector);
  return () => page.evaluate(() => Reflect.get(window, "__noticeWith") === true);
}

test("the scene's notice sits just over the track tab, clear of the menu's buttons, and fades out as Entrenar opens (rule 17)", async ({
  page,
}) => {
  await page.clock.install();
  await startMobile(page, "peregrina");
  await expect(page.locator("#m-capitulo-aviso")).toContainText(t("ui.m.story.skipped"));
  const notice = await noticeBox(page);
  const tab = await boxOf(page, "#m-pista-tab");
  expect(tab.top - notice.bottom).toBeGreaterThanOrEqual(0);
  expect(tab.top - notice.bottom).toBeLessThan(40);
  for (const id of ["#m-entrenar", "#m-descansar", "#m-habilidades", "#m-salida", "#m-taller"])
    expect(overlaps(notice, await boxOf(page, id)), id).toBe(false);
  // another screen: the notice goes at once, an id-less copy of it fades out over its 400 ms
  // (the clock held: its timer, not the test's patience, final review C7)
  await holdClock(page);
  await page.click("#m-entrenar");
  expect(await present(page, "#m-capitulo-aviso")).toBe(false);
  expect(await present(page, "[data-notice-leaving]")).toBe(true);
  await runClock(page, 380);
  expect(await present(page, "[data-notice-leaving]")).toBe(true);
  await runClock(page, 40);
  expect(await present(page, "[data-notice-leaving]")).toBe(false);
});

test("a goal's scene passed by: its notice waits out the emblem, then sits just over the decided card's foot", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await seedRun(page, "peregrina-w10");
  await seenEver(page, "peregrina-debut");
  await page.goto("./");
  await continueRun(page);
  await page.click("#m-descansar");
  await expect(page.locator("#m-efectos")).toBeVisible();
  const together = await watchNoticeWith(page, "#m-transicion");
  await page.click("#m-efectos");
  expect(await present(page, "#m-transicion")).toBe(true);
  await expect(page.locator("#m-capitulo-aviso")).toContainText(t("ui.m.story.passed"));
  await expect(page.locator("#m-transicion")).toHaveCount(0);
  expect(await together()).toBe(false);
  // the card's foot is its anchor: just over it, clear of «Correr»
  const notice = await noticeBox(page);
  const run = await boxOf(page, "#m-correr");
  expect(run.top - notice.bottom).toBeGreaterThanOrEqual(0);
  expect(run.top - notice.bottom).toBeLessThan(40);
  await expect(page.locator("#m-escena-ver")).toBeVisible();
});

test("a goal's scene passed by on a small phone: its notice covers none of the card's positions (rule 17)", async ({
  page,
}) => {
  test.setTimeout(60_000);
  // the race card reaches down to its foot: over the foot the notice would hide Acecho and Remate
  await page.setViewportSize({ width: 360, height: 740 });
  await seedRun(page, "peregrina-w10");
  await seenEver(page, "peregrina-debut");
  await page.goto("./");
  await continueRun(page);
  await page.click("#m-descansar");
  await expect(page.locator("#m-efectos")).toBeVisible();
  await page.click("#m-efectos");
  await expect(page.locator("#m-capitulo-aviso")).toContainText(t("ui.m.story.passed"));
  await expect(page.locator("#m-transicion")).toHaveCount(0);
  const notice = await noticeBox(page);
  const options = page.locator("#m-posicion label");
  expect(await options.count()).toBe(4);
  for (let i = 0; i < 4; i++) {
    const option = options.nth(i);
    const box = await option.boundingBox();
    if (!box) throw new Error("a position with no box");
    const id = await option.getAttribute("for");
    expect(
      overlaps(notice, {
        left: box.x,
        right: box.x + box.width,
        top: box.y,
        bottom: box.y + box.height,
      }),
      `${id}`,
    ).toBe(false);
  }
  expect(overlaps(notice, await boxOf(page, "#m-correr"))).toBe(false);
  await expect(page.locator("#m-escena-ver")).toBeVisible();
});

/** The decided race card's controls and what a notice must not hide on it (its title, its objective). */
async function cardKeepOut(page: Page): Promise<{ controls: Box[]; text: Box[] }> {
  const visible = async (selector: string): Promise<Box[]> => {
    const out: Box[] = [];
    const all = page.locator(selector);
    for (let i = 0; i < (await all.count()); i++) {
      const b = await all.nth(i).boundingBox();
      if (b && b.height > 0)
        out.push({ left: b.x, right: b.x + b.width, top: b.y, bottom: b.y + b.height });
    }
    return out;
  };
  return {
    controls: await visible("#m-posicion label, #m-precarrera-pista, #m-correr"),
    text: await visible("#m-precarrera h1, #m-precarrera h1 + p"),
  };
}

/** Week `save` played to its decided card with the goal's scene `scene` passed by (seen before). */
async function toPassedCard(page: Page, save: string, scene: string): Promise<void> {
  await seedRun(page, save);
  await seenEver(page, scene);
  await page.goto("./");
  await continueRun(page);
  await page.click("#m-descansar");
  await expect(page.locator("#m-efectos")).toBeVisible();
  await page.click("#m-efectos");
  await expect(page.locator("#m-capitulo-aviso")).toContainText(t("ui.m.story.passed"));
  await expect(page.locator("#m-transicion")).toHaveCount(0);
  // its rise in is over
  await page.waitForTimeout(400);
}

test("a passed scene's notice keeps a real gap from the race card's positions over its foot (6.7, parity N6)", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await toPassedCard(page, "peregrina-w10", "peregrina-debut");
  const notice = await noticeBox(page);
  const { controls } = await cardKeepOut(page);
  for (const c of controls) {
    const gap = Math.max(c.top - notice.bottom, notice.top - c.bottom);
    // a real gap (NOTICE_CLEAR, 3 px): no longer resting on the positions' edge
    expect(gap, JSON.stringify(c)).toBeGreaterThanOrEqual(3);
  }
  // still just over the card's foot
  const run = await boxOf(page, "#m-correr");
  expect(run.top - notice.bottom).toBeGreaterThanOrEqual(0);
  expect(run.top - notice.bottom).toBeLessThan(40);
});

test("a passed scene's notice rises into its place over the race card without ever touching its positions or «Correr» (6.7, rule 17)", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await seedRun(page, "peregrina-w10");
  await seenEver(page, "peregrina-debut");
  await page.goto("./");
  await continueRun(page);
  await page.click("#m-descansar");
  await expect(page.locator("#m-efectos")).toBeVisible();
  // every frame from the effects' tap until the notice has risen into its place
  await page.evaluate(() => {
    const touched: string[] = [];
    let since = -1;
    const frame = (t: number) => {
      const notice = document.getElementById("m-capitulo-aviso")?.getBoundingClientRect();
      if (notice) {
        if (since < 0) since = t;
        for (const c of document.querySelectorAll("#m-posicion label, #m-correr")) {
          const r = c.getBoundingClientRect();
          if (Math.min(r.bottom, notice.bottom) - Math.max(r.top, notice.top) > 0.5)
            touched.push(`${c.id || c.getAttribute("for")} at ${Math.round(t - since)} ms`);
        }
      }
      if (since < 0 || t - since < 1000) requestAnimationFrame(frame);
      else Reflect.set(window, "__touched", touched);
    };
    requestAnimationFrame(frame);
  });
  await page.click("#m-efectos");
  await expect(page.locator("#m-capitulo-aviso")).toContainText(t("ui.m.story.passed"));
  await page.waitForFunction(() => Reflect.get(window, "__touched") !== undefined, null, {
    timeout: 15_000,
  });
  expect(await page.evaluate(() => Reflect.get(window, "__touched"))).toEqual([]);
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 360, height: 740 },
])
  test(`${viewport.width}×${viewport.height}, week 48's long card: a passed scene's notice covers neither a control nor the race's name and objective, where the card leaves it room (6.7)`, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.setViewportSize(viewport);
    await toPassedCard(page, "peregrina-w48", "peregrina-long");
    const notice = await noticeBox(page);
    const { controls, text } = await cardKeepOut(page);
    expect(text).toHaveLength(2);
    for (const c of controls)
      expect(overlaps(notice, c), `control ${JSON.stringify(c)}`).toBe(false);
    for (const c of text) expect(overlaps(notice, c), `title ${JSON.stringify(c)}`).toBe(false);
    await expect(page.locator("#m-escena-ver")).toBeVisible();
  });

test("«Ver» on a passed scene's notice plays it, and the notice is gone from the scene's first frame", async ({
  page,
}) => {
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
  await page.click("#m-escena-ver");
  await expect(page.locator("#m-capitulo")).toHaveAttribute("data-scene", "peregrina-prologue");
  await freezeAt(page, 0);
  const cover = await coverage(page, "#m-capitulo");
  expect(cover.misses.filter((m) => /aviso|toast|notice/i.test(m))).toEqual([]);
  expect(await present(page, "#m-capitulo-aviso, [data-notice-leaving]")).toBe(false);
});

test("a passed scene's notice that waited behind another shows after it, with no «Ver» where no scene may play: the training picker (R1)", async ({
  page,
}) => {
  await seedRun(page, "peregrina-w39-insp");
  // week 16's scene unseen anywhere, week 28's seen only in an earlier season: both come at once
  await page.addInitScript((seed) => {
    const key = "falconess.juego.historia";
    const story: { runs: Record<string, string[]>; ever: string[] } = JSON.parse(
      localStorage.getItem(key) ?? '{"runs":{},"ever":[]}',
    );
    const run = story.runs[seed] ?? [];
    story.runs[seed] = run.filter((id) => id !== "peregrina-tears" && id !== "peregrina-rookie");
    story.ever = story.ever.filter((id) => id !== "peregrina-tears");
    localStorage.setItem(key, JSON.stringify(story));
  }, "1");
  await page.goto("./");
  await continueRun(page);
  await expect(page.locator("#m-capitulo")).toHaveAttribute("data-scene", "peregrina-tears");
  await skipScene(page);
  // the first notice first (first in, first out); the passed one waits for it
  const notice = page.locator("#m-capitulo-aviso");
  await expect(notice).toContainText(t("ui.m.story.skipped"));
  // the first one fades out as Entrenar opens; the next comes after it, never over it
  const together = await watchNoticeWith(page, "[data-notice-leaving]");
  await page.click("#m-entrenar");
  // the training picker: no scene may play here, so the passed one comes without «Ver»
  await expect(notice).toContainText(t("ui.m.story.passed"));
  expect(await present(page, "#m-escena-ver")).toBe(false);
  expect(await together()).toBe(false);
  // shown and left behind: gone for good (F23)
  await page.click("#m-volver");
  expect(await present(page, "#m-capitulo-aviso")).toBe(false);
  await page.waitForTimeout(600);
  expect(await present(page, "#m-capitulo-aviso")).toBe(false);
});

test("a saved run that no longer replays: «Continuar» says so on the selection", async ({
  page,
}) => {
  const { save } = JSON.parse(
    readFileSync(fileURLToPath(new URL("./saves/peregrina-w10.json", import.meta.url)), "utf8"),
  );
  // it parses, but the season has no event to answer at its last input
  const broken = JSON.stringify({
    ...save,
    inputs: [...save.inputs, { kind: "event:choose", option: 0 }],
  });
  await page.addInitScript((text) => {
    localStorage.setItem("falconess.pruebas.partida", text);
  }, broken);
  await page.goto("./");
  await pastTitle(page);
  await page.click("#m-continuar");
  const alert = page.locator("#m-aviso-error");
  await expect(alert).toHaveAttribute("role", "alert");
  await expect(alert).toContainText(t("ui.error.load-replay"));
  await expect(page.locator("#m-continuar")).toBeVisible();
  await alert.getByRole("button", { name: t("ui.error.dismiss") }).click();
  await expect(alert).toHaveCount(0);
});

test("the selection's notice covers none of its choices: it sits over the heading (rule 17)", async ({
  page,
}) => {
  const { save } = JSON.parse(
    readFileSync(fileURLToPath(new URL("./saves/peregrina-w10.json", import.meta.url)), "utf8"),
  );
  const broken = JSON.stringify({
    ...save,
    inputs: [...save.inputs, { kind: "event:choose", option: 0 }],
  });
  await page.addInitScript((text) => {
    localStorage.setItem("falconess.pruebas.partida", text);
  }, broken);
  await page.goto("./");
  await pastTitle(page);
  await page.click("#m-continuar");
  const alert = page.locator("#m-aviso-error");
  await expect(alert).toBeVisible();
  // where it stands, its entrance's rise aside
  const notice = await alert.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const shift = getComputedStyle(el).transform;
    const dy = shift === "none" ? 0 : new DOMMatrixReadOnly(shift).m42;
    return { left: r.left, right: r.right, top: r.top - dy, bottom: r.bottom - dy };
  });
  const choices = page.locator(
    "[id^='m-elegir-'], [id^='m-dificultad-'], #m-continuar, #m-empezar, #m-temporadas-inicio",
  );
  const n = await choices.count();
  expect(n).toBeGreaterThan(5);
  for (let i = 0; i < n; i++) {
    const choice = choices.nth(i);
    const box = await choice.boundingBox();
    if (!box) continue;
    expect(
      overlaps(notice, {
        left: box.x,
        right: box.x + box.width,
        top: box.y,
        bottom: box.y + box.height,
      }),
      `${await choice.getAttribute("id")}`,
    ).toBe(false);
  }
});

test("a scrolled selection: the error notice goes with the heading, never over a choice (6.7, rule 17)", async ({
  page,
}) => {
  const { save } = JSON.parse(
    readFileSync(fileURLToPath(new URL("./saves/peregrina-w10.json", import.meta.url)), "utf8"),
  );
  const broken = JSON.stringify({
    ...save,
    inputs: [...save.inputs, { kind: "event:choose", option: 0 }],
  });
  await page.addInitScript((text) => {
    localStorage.setItem("falconess.pruebas.partida", text);
  }, broken);
  await page.goto("./");
  await pastTitle(page);
  // «Continuar» tapped with the selection at its top: the notice over the heading
  await page.evaluate(() => document.getElementById("m-continuar")?.click());
  const alert = page.locator("#m-aviso-error");
  await expect(alert).toBeVisible();
  await page.waitForTimeout(400);
  const before = await alert.boundingBox();
  // the player scrolls the choices up under it
  const moved = await page.evaluate(() => {
    const list = document.querySelector("[data-toast-anchor]");
    let el = list?.parentElement ?? null;
    while (
      el &&
      !(el.scrollHeight > el.clientHeight + 2 && getComputedStyle(el).overflowY !== "visible")
    )
      el = el.parentElement;
    if (!el) return 0;
    el.scrollTop = 100;
    return el.scrollTop;
  });
  expect(moved).toBeGreaterThan(40);
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );
  const after = await alert.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const shift = getComputedStyle(el).transform;
    const dy = shift === "none" ? 0 : new DOMMatrixReadOnly(shift).m42;
    return { left: r.left, right: r.right, top: r.top - dy, bottom: r.bottom - dy };
  });
  // it went up with the heading
  expect(after.top).toBeLessThan((before?.y ?? 0) - 40);
  const choices = page.locator(
    "[id^='m-elegir-'], [id^='m-dificultad-'], #m-continuar, #m-empezar, #m-temporadas-inicio",
  );
  for (let i = 0; i < (await choices.count()); i++) {
    const box = await choices.nth(i).boundingBox();
    if (!box) continue;
    expect(
      overlaps(after, {
        left: box.x,
        right: box.x + box.width,
        top: box.y,
        bottom: box.y + box.height,
      }),
      `${await choices.nth(i).getAttribute("id")}`,
    ).toBe(false);
  }
});

test("the season's start with a parent: the passed prologue's notice waits for the card, then shows its whole time (A.5.4)", async ({
  page,
}) => {
  await page.clock.install();
  await page.addInitScript(() => {
    if (!localStorage.getItem("falconess.juego.historia"))
      localStorage.setItem(
        "falconess.juego.historia",
        JSON.stringify({ runs: {}, ever: ["peregrina-prologue"] }),
      );
  });
  await startWithParent(page);
  await expect(page.locator("#m-inspiracion")).toHaveAttribute("data-kind", "start");
  // the clock stands still from here: the card is read for longer than a notice lives
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  expect(await present(page, "#m-capitulo-aviso")).toBe(false);
  await page.clock.runFor(7000);
  await settleUpdates(page);
  expect(await present(page, "#m-capitulo-aviso")).toBe(false);
  await page.click("#m-inspiracion-seguir");
  // the card fades out first (L1, 6.1): the notice waits for it to be gone (its 240 ms count from
  // the frame its fade starts on, final review P1: two frames' leeway)
  await settleUpdates(page);
  expect(await present(page, "#m-capitulo-aviso")).toBe(false);
  await page.clock.runFor(200);
  await settleUpdates(page);
  expect(await present(page, "#m-capitulo-aviso")).toBe(false);
  await page.clock.runFor(80);
  await settleUpdates(page);
  await expect(page.locator("#m-capitulo-aviso")).toContainText(t("ui.m.story.passed"));
  await expect(page.locator("#m-escena-ver")).toBeVisible();
  // its six seconds count from here
  await settleUpdates(page);
  await page.clock.runFor(5900);
  await settleUpdates(page);
  expect(await present(page, "#m-capitulo-aviso")).toBe(true);
  await page.clock.runFor(200);
  await settleUpdates(page);
  expect(await present(page, "#m-capitulo-aviso")).toBe(false);
});

test("the season's start with a parent: the skipped prologue's notice waits for the card, then shows", async ({
  page,
}) => {
  await startWithParent(page);
  await skipScene(page);
  await expect(page.locator("#m-inspiracion")).toHaveAttribute("data-kind", "start");
  expect(await present(page, "#m-capitulo-aviso")).toBe(false);
  await page.click("#m-inspiracion-seguir");
  await expect(page.locator("#m-capitulo-aviso")).toContainText(t("ui.m.story.skipped"));
});

test("the last race's scene: its notice shows over the result's foot, and not over the End's effects", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.clock.install();
  await seedRun(page, "peregrina-w48");
  await page.goto("./");
  await continueRun(page);
  await page.click("#m-descansar");
  await toPosition(page);
  await page.click("#m-correr");
  await page.click("#m-saltar");
  // her scene after the race, skipped: its notice on the result
  await toResult(page);
  await expect(page.locator("#m-capitulo-aviso")).toContainText(t("ui.m.story.skipped"));
  const notice = await noticeBox(page);
  const go = await boxOf(page, "#m-carrera-seguir");
  expect(go.top - notice.bottom).toBeGreaterThanOrEqual(0);
  expect(go.top - notice.bottom).toBeLessThan(40);
  // the clock stands still from here: the notice's fading copy goes on its own timer's time, not
  // on how fast the page or the test happen to run
  await holdClock(page);
  await page.click("#m-carrera-seguir");
  await expect(page.locator("#m-efectos")).toBeVisible();
  await settleUpdates(page);
  // the End's effects come with the notice gone at once: only its id-less, inert copy fades out
  expect(await present(page, "#m-capitulo-aviso")).toBe(false);
  expect(await present(page, "[data-notice-leaving][inert]:not([id])")).toBe(true);
  // a notice's copy fades out in 400 ms (MOTION.toastOut), then its timer removes it
  await page.clock.runFor(380);
  await settleUpdates(page);
  expect(await present(page, "[data-notice-leaving]")).toBe(true);
  await page.clock.runFor(40);
  await settleUpdates(page);
  expect(await present(page, "[data-notice-leaving]")).toBe(false);
  expect(await present(page, "#m-capitulo-aviso")).toBe(false);
  await page.clock.resume();
  await page.click("#m-efectos");
  await expect(page.locator("#m-fin")).toBeVisible();
  await page.waitForTimeout(300);
  expect(await present(page, "#m-capitulo-aviso")).toBe(false);
});

test("a race week's sounds come from its taps: none as the action's effects end by themselves, a whoosh at «Ver otra vez» and «Continuar» (critic b)", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await seedRun(page, "peregrina-w10");
  await page.goto("./");
  await continueRun(page);
  const cues = await watchCues(page);
  /** The cues played since `n` had played. */
  const since = async (n: number) => (await cues()).slice(n);
  await page.click("#m-descansar");
  await expect.poll(async () => (await since(0))[0]).toBe("confirm");
  // the action's effects, untouched: their own time brings the emblem, with no whoosh under it
  await expect(page.locator("#m-efectos")).toBeVisible();
  await expect(page.locator("#m-transicion")).toBeVisible({ timeout: 10_000 });
  await toPosition(page);
  expect(await cues()).not.toContain("nav");
  // each count is read once the taps of the clicks before it played (they wait a task: `tapsIn`)
  await tapsIn(page);
  // «Correr» plays its tap: the race is no change of screen of the menu's (plan §1.7 rule 2)
  let n = (await cues()).length;
  await page.click("#m-correr");
  await expect.poll(() => since(n)).toEqual(["tap"]);
  await page.click("#m-saltar");
  await toResult(page);
  await tapsIn(page);
  // «Ver otra vez» and «Continuar» go to another screen: the whoosh, instead of their tap
  n = (await cues()).length;
  await page.click("#m-ver-otra-vez");
  await expect(page.locator("#m-carrera-vuelo")).toBeVisible();
  await expect.poll(() => since(n)).toEqual(["nav"]);
  await page.click("#m-saltar");
  await toResult(page);
  await tapsIn(page);
  n = (await cues()).length;
  await page.click("#m-carrera-seguir");
  await expect.poll(async () => (await since(n))[0]).toBe("nav");
  await expect(page.locator("#m-carrera-seguir")).toHaveCount(0);
});

/**
 * Lets the taps of the clicks made so far play: a button's tap waits a task after its click
 * (`queueTap`, so that click's own cue can replace it), and a task queued now runs after it.
 */
async function tapsIn(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((done) => setTimeout(done, 0)));
}
