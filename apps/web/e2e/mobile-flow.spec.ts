import { expect, type Page } from "@playwright/test";
import { textPattern } from "./fixtures";
import {
  continueRun,
  pastTitle,
  seedRun,
  settle,
  skipScene,
  startMobile,
  test,
  week,
} from "./mobile-helpers";

/**
 * The phone game's flow, now that the flow model drives it (plan-final 4.1): a sheet holds the
 * beat that comes while it is open and nothing else (a sheet in the page but closed holds nothing,
 * and a pick that closes its sheet does not hold what the pick starts), and a beat's timer keeps
 * its time whatever renders the game meanwhile (no identity churn). The inheritance card in D2's
 * order (5.3): after what the week did and before the next week's scenes, after the prologue at the
 * season's start, and once per card in this browser (a reload or a language switch keeps it shown).
 */

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

/** Whether `selector` is in the page right now, without waiting for it. */
function present(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((sel) => document.querySelector(sel) !== null, selector);
}

/** Lets the page's own updates land (React commits on a posted message, a timer's too). */
async function settleUpdates(page: Page): Promise<void> {
  await page.evaluate(async () => {
    for (let i = 0; i < 3; i++)
      await new Promise<void>((done) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = () => done();
        channel.port2.postMessage(0);
      });
  });
}

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
  await startMobile(page, "peregrina");
  await page.click("#m-salida");
  const sheet = page.locator("#m-salida-cuadrilla[open]");
  await expect(sheet).toBeVisible();
  const crew = (await sheet.locator("li[data-crew]").first().getAttribute("data-crew")) ?? "";
  await page.click(`#m-salida-con-${crew}`);
  // the sheet is released at its close request: the week's effects are there with the pick
  expect(await present(page, "#m-salida-cuadrilla")).toBe(false);
  expect(await present(page, '#m-efectos [data-fx="bond"]')).toBe(true);
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
