import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, type Page } from "@playwright/test";
import { stubFonts, t, textPattern } from "./fixtures";
import {
  continueRun,
  pastTitle,
  runRace,
  seedRun,
  settle,
  skipScene,
  startMobile,
  test,
  toPosition,
  toResult,
  unseenScenes,
  watchCues,
  week,
} from "./mobile-helpers";
import { holdClock, present, runClock, settleUpdates } from "./motion";

/**
 * The phone game's flow, now that the flow model drives it (plan-final 4.1): a sheet holds the
 * beat that comes while it is open and nothing else (a sheet in the page but closed holds nothing,
 * and a pick that closes its sheet does not hold what the pick starts), and a beat's timer keeps
 * its time whatever renders the game meanwhile (no identity churn). The inheritance card in D2's
 * order (5.3): after what the week did and before the next week's scenes, after the prologue at the
 * season's start, and once per card in this browser (a reload, a language switch or another tab of
 * the game keeps it shown, as it keeps a scene seen).
 * The notice of a refused act (5.9; the scene's notice went, owner 2026-11-18): it waits while
 * anything plays in front, then shows its whole time just over the screen's anchor, and fades out
 * when the screen changes; a run that no longer replays says so on the selection. A scene that was
 * skipped, watched or passed by says nothing at all and is watched again from «Historia».
 * The sounds (5.10): only taps sound, and only a tap that goes to another screen whooshes.
 * The race week's menu (owner 2026-11-18): no bar of its own, the track drawer opening by itself
 * once that week (never under a layer), and its card as the planning card's door.
 */

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test("a sheet in the page but closed holds nothing: the goals' and the race card's track sheets", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await seedRun(page, "peregrina-w10");
  await page.goto("./");
  await continueRun(page);
  // a goal's track sheet over the menu, opened and closed: its component stays in the page, closed
  // (on a race week the menu's own card is the planning card's door, owner 2026-11-18)
  await page.click("#m-leer-goals");
  await page.locator("#m-metas button").first().click();
  await expect(page.locator("#m-pista-dialogo[open]")).toBeVisible();
  await page.click("#m-pista-cerrar");
  await expect(page.locator("#m-pista-dialogo")).toHaveCount(0);
  await page.click("#m-panel-hoja-cerrar");
  await expect(page.locator("#m-panel-hoja")).toHaveCount(0);
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

/** The week's action buttons: the drawer's card must stand over none of them. */
const ACTIONS = ["#m-entrenar", "#m-descansar", "#m-habilidades", "#m-salida", "#m-taller"];

test("a race week's menu has no bar: the track drawer opens by itself, over no action button (owner 2026-11-18)", async ({
  page,
}) => {
  await seedRun(page, "peregrina-w10");
  await page.goto("./");
  await continueRun(page);
  // the bar that said «Carrera esta semana» is gone
  await expect(page.locator("#m-carrera")).toHaveCount(0);
  // the tab holds the week's race, and it opened itself: the card with this week's track
  const tab = page.locator("#m-pista-tab");
  await expect(tab).toHaveAttribute("data-race", "");
  await expect(tab).toHaveAttribute("aria-expanded", "true");
  const card = page.locator("#m-pista");
  await expect(card).toBeVisible();
  await expect(card).toBeInViewport();
  await expect(card).toHaveAttribute("data-course", "sprint");
  // nothing of it stands over the week's buttons, which all take their tap
  const box = await card.boundingBox();
  if (!box) throw new Error("the drawer's card has no box");
  for (const id of ACTIONS) {
    const action = await page.locator(id).boundingBox();
    if (!action) throw new Error(`${id} has no box`);
    expect(box.y + box.height, id).toBeLessThanOrEqual(action.y);
    await expect(page.locator(id)).toBeEnabled();
  }
  // closed by the player, it stays closed for this week: the workshop and back opens nothing
  await tab.click();
  await expect(tab).toHaveAttribute("aria-expanded", "false");
  await expect(card).toBeHidden();
  await page.click("#m-taller");
  await expect(page.locator("#m-taller-confirmar")).toBeVisible();
  await page.click("#m-volver");
  await expect(page.locator("#m-entrenar")).toBeVisible();
  await page.waitForTimeout(400);
  await expect(page.locator("#m-pista-tab")).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#m-pista")).toBeHidden();
});

/** The reading rail's four buttons, under «Menú». */
const RAIL = ["#m-leer-guide", "#m-leer-goals", "#m-leer-crews", "#m-leer-log"];

for (const size of [
  { width: 360, height: 740 },
  { width: 390, height: 844 },
  { width: 1024, height: 768 },
]) {
  test(`the race week's drawer card sits over the stats strip, into no rail or action button at ${size.width}×${size.height} (owner 2026-11-28)`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await seedRun(page, "peregrina-w10");
    await page.goto("./");
    await continueRun(page);
    const card = page.locator("#m-pista");
    await expect(card).toBeVisible();
    // the card's fade-and-grow ends before its box is measured
    await page.waitForTimeout(400);
    const box = await card.boundingBox();
    if (!box) throw new Error("the drawer's card has no box");
    const hit = async (id: string) => {
      const other = page.locator(id);
      if ((await other.count()) === 0) return;
      const b = await other.boundingBox();
      if (!b) return;
      const apart =
        box.x + box.width <= b.x ||
        b.x + b.width <= box.x ||
        box.y + box.height <= b.y ||
        b.y + b.height <= box.y;
      expect(apart, `${id} under the card`).toBe(true);
    };
    for (const id of [...RAIL, ...ACTIONS]) await hit(id);
  });
}

for (const who of ["peregrina", "cernicala", "caracara"])
  test(`the week menu's splash fades out from her hips and is gone at the stats strip: ${who} (owner 2026-11-28)`, async ({
    page,
  }) => {
    await startMobile(page, who);
    for (const size of [
      { width: 360, height: 640 },
      { width: 360, height: 740 },
      { width: 390, height: 844 },
      { width: 1024, height: 768 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(size);
      await expect(page.locator("#m-entrenar")).toBeVisible();
      const at = `${who} at ${size.width}×${size.height}`;
      const fade = await page.evaluate(() => {
        const img = document
          .querySelector<HTMLElement>("#m-entrenar")
          ?.closest("[data-screen]")
          ?.querySelector<HTMLElement>("[aria-hidden] > img");
        const hero = img?.parentElement;
        const strip = document.querySelector("#m-stats");
        if (!hero || !img || !strip) return undefined;
        const style = getComputedStyle(hero);
        return {
          mask: style.maskImage,
          gone:
            hero.getBoundingClientRect().bottom -
            Number.parseFloat(style.getPropertyValue("--foot")),
          strip: strip.getBoundingClientRect().top,
          height: img.getBoundingClientRect().height / hero.getBoundingClientRect().height,
        };
      });
      if (!fade) throw new Error(`${at}: no splash`);
      expect(fade.mask, at).toMatch(/^linear-gradient\(/);
      // fully see-through at the strip's top, never lower
      expect(Math.abs(fade.gone - fade.strip), at).toBeLessThanOrEqual(1);
      // and she keeps her size: 82 % of the screen
      expect(fade.height, at).toBeCloseTo(0.82, 2);
    }
  });

test("the drawer's card is the planning card's door on a race week (D3, owner 2026-11-18)", async ({
  page,
}) => {
  await seedRun(page, "peregrina-w10");
  await page.goto("./");
  await continueRun(page);
  // its name says where it leads: the race's plan, not the track's sheet (owner 2026-11-28)
  await expect(page.locator("#m-pista")).toHaveAttribute(
    "aria-label",
    t("ui.m.track.plan", { course: "Sprint" }),
  );
  await expect(page.locator("#m-pista")).not.toHaveAttribute("aria-haspopup", "dialog");
  await page.click("#m-pista");
  // the planning card, with everything the bar's card showed: the track, what it asks, the four
  // positions, «Volver» and «Elegir la acción»
  await expect(page.locator('[data-screen="plan"]')).toHaveCount(1);
  await expect(page.locator("#m-precarrera-pista-perfil")).toBeVisible();
  await expect(page.locator("#m-precarrera-pista-pide [data-letter]")).not.toHaveCount(0);
  await expect(page.locator("#m-posicion input")).toHaveCount(4);
  await expect(page.locator("#m-volver")).toBeVisible();
  const on = page.locator("#m-correr");
  await expect(on).toContainText(t("ui.m.race.ready"));
  // and it leads on to the week's action, as the bar's card did
  await on.click();
  await expect(page.locator("#m-entrenar")).toBeEnabled();
  // no track sheet of the menu's own on a race week: that card is the door
  await expect(page.locator("#m-pista-dialogo")).toHaveCount(0);
});

test("the track drawer waits for the layer in front, as everything else does (owner 2026-11-18)", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await seedRun(page, "peregrina-w48");
  // week 44's scene never seen: it plays as week 48 (a race week) opens, over its menu
  await unseenScenes(page, ["peregrina-tiresome"]);
  await page.goto("./");
  await continueRun(page);
  await expect(page.locator("#m-capitulo")).toHaveAttribute("data-scene", "peregrina-tiresome");
  // the menu is under it: nothing opens by itself while a layer is in front
  await expect(page.locator("#m-pista-tab")).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#m-pista")).toBeHidden();
  await skipScene(page);
  // once it has gone, the drawer opens
  await expect(page.locator("#m-pista-tab")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#m-pista")).toBeVisible();
});

test("the track drawer opens again on the next race week, and on no other week (owner 2026-11-18)", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await seedRun(page, "peregrina-w39-insp");
  await page.goto("./");
  await continueRun(page);
  await settle(page);
  expect(await week(page)).toBe(39);
  // week 39 has no race: the tab says so and nothing opens by itself
  await expect(page.locator("#m-pista-tab")).not.toHaveAttribute("data-race", "");
  await expect(page.locator("#m-pista")).toBeHidden();
  // its card opens the track's sheet there, and says so (owner 2026-11-28)
  await expect(page.locator("#m-pista")).toHaveAttribute(
    "aria-label",
    textPattern("ui.m.track.open"),
  );
  // week 40 has one (its inheritance card first: the drawer waits for it, then opens)
  await page.click("#m-descansar");
  await settle(page);
  expect(await week(page)).toBe(40);
  await expect(page.locator("#m-pista-tab")).toHaveAttribute("data-race", "");
  await expect(page.locator("#m-pista-tab")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#m-pista")).toHaveAttribute(
    "aria-label",
    textPattern("ui.m.track.plan"),
  );
  // closed, it stays closed for week 40 only
  await page.click("#m-pista-tab");
  await expect(page.locator("#m-pista")).toBeHidden();
  await page.click("#m-descansar");
  await toPosition(page);
  await page.click("#m-correr");
  await runRace(page);
  await settle(page);
  while ((await week(page)) < 48) {
    await expect(page.locator("#m-pista-tab")).not.toHaveAttribute("data-race", "");
    await page.click("#m-descansar");
    await settle(page);
  }
  // her last goal's week: it opens by itself again
  await expect(page.locator("#m-pista-tab")).toHaveAttribute("data-race", "");
  await expect(page.locator("#m-pista-tab")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#m-pista")).toBeVisible();
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
  await page.click("#m-grupo-ajustes");
  await page.click("#m-idioma-en");
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

/** A scene this browser saw in an earlier season: passed by, shown nowhere. After seedRun. */
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

const overlaps = (a: Box, b: Box): boolean =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

test("a saved run that no longer replays: «Continuar» says so on the selection, and its copy fades out", async ({
  page,
}) => {
  await page.clock.install();
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
  // «Cerrar»: the notice goes at once and an id-less, inert copy of it fades out over its 400 ms
  // (the clock held: its own timer removes it, not the test's patience, final review C7)
  await holdClock(page);
  await alert.getByRole("button", { name: t("ui.error.dismiss") }).click();
  await expect(alert).toHaveCount(0);
  expect(await present(page, "[data-notice-leaving][inert]:not([id])")).toBe(true);
  await runClock(page, 380);
  expect(await present(page, "[data-notice-leaving]")).toBe(true);
  await runClock(page, 40);
  expect(await present(page, "[data-notice-leaving]")).toBe(false);
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

// --- the scene notice is gone (owner 2026-11-18) -----------------------------------------------

/** What «Historia» lists, and plays whole on a tap: the sheet's scene ids. */
async function storyList(page: Page): Promise<string[]> {
  await page.click("#m-menu");
  await page.click("#m-historia-abrir");
  const ids = await page
    .locator("#m-historia [data-scene]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-scene") ?? ""));
  return ids;
}

test("a skipped scene leaves no notice: the prologue's exit lands on a clean menu, and «Historia» plays it (owner 2026-11-18)", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("./");
  await pastTitle(page);
  await page.click("#m-elegir-peregrina");
  await page.click("#m-empezar");
  await expect(page.locator("#m-capitulo")).toBeVisible();
  await holdClock(page);
  await page.click("#m-capitulo-saltar");
  // the scene's exit (0.8 s), and then longer than any notice ever lived (6 s)
  await runClock(page, 1200);
  expect(await present(page, "#m-capitulo-aviso")).toBe(false);
  expect(await present(page, "[data-notice-leaving]")).toBe(false);
  await runClock(page, 6500);
  expect(await present(page, "#m-capitulo-aviso")).toBe(false);
  expect(await present(page, "[data-notice-leaving]")).toBe(false);
  // the menu is the player's: nothing over the track tab, and the scene is hers in «Historia»
  await page.clock.resume();
  expect(await storyList(page)).toContain("peregrina-prologue");
  await page.click('#m-historia [data-scene="peregrina-prologue"] button');
  await expect(page.locator("#m-capitulo")).toHaveAttribute("data-scene", "peregrina-prologue");
  await page.click("#m-capitulo-saltar");
  await expect(page.locator("#m-capitulo")).toHaveCount(0);
  expect(await present(page, "#m-capitulo-aviso")).toBe(false);
});

test("a scene seen in an earlier season is passed by with nothing shown, and «Historia» is where she watches it (owner 2026-11-18)", async ({
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
  // no scene, and nothing in its place: the first week is hers at once
  await expect(page.locator("#m-entrenar")).toBeVisible();
  await expect(page.locator("#m-capitulo")).toHaveCount(0);
  await page.waitForTimeout(1200);
  expect(await present(page, "#m-capitulo-aviso")).toBe(false);
  expect(await present(page, "#m-escena-ver")).toBe(false);
  expect(await present(page, "[data-notice-leaving]")).toBe(false);
  // «Historia» plays it whole
  expect(await storyList(page)).toContain("peregrina-prologue");
  await page.click('#m-historia [data-scene="peregrina-prologue"] button');
  await expect(page.locator("#m-capitulo")).toHaveAttribute("data-scene", "peregrina-prologue");
});

test("a race week's scene passed by on the decided card: nothing shows, and the card is whole (open decision 8, owner 2026-11-18)", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 360, height: 740 });
  await seedRun(page, "peregrina-w10");
  await seenEver(page, "peregrina-debut");
  await page.goto("./");
  await continueRun(page);
  await page.click("#m-descansar");
  await expect(page.locator("#m-efectos")).toBeVisible();
  await page.click("#m-efectos");
  await expect(page.locator("#m-precarrera")).toBeVisible();
  await expect(page.locator("#m-transicion")).toHaveCount(0);
  await page.waitForTimeout(1200);
  expect(await present(page, "#m-capitulo-aviso")).toBe(false);
  // the card's name and objective, its positions and «Correr» with nothing over them
  await expect(page.locator("#m-precarrera h1")).toBeVisible();
  await expect(page.locator("#m-correr")).toBeVisible();
  expect(await page.locator("#m-posicion label").count()).toBe(4);
});

test("two scenes due at once (week 39): both play, both are marked seen with no notice, and neither comes back", async ({
  page,
}) => {
  test.setTimeout(60_000);
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
  // the unseen one plays; the one of an earlier season is passed by, shown nowhere
  await expect(page.locator("#m-capitulo")).toHaveAttribute("data-scene", "peregrina-tears");
  await skipScene(page);
  await settle(page);
  await expect(page.locator("#m-entrenar")).toBeVisible();
  expect(await present(page, "#m-capitulo-aviso")).toBe(false);
  expect(await present(page, "[data-notice-leaving]")).toBe(false);
  // both are seen, and «Historia» holds them
  const list = await storyList(page);
  expect(list).toContain("peregrina-tears");
  expect(list).toContain("peregrina-rookie");
  await page.click("#m-historia-cerrar");
  if (await present(page, "#m-menu-cerrar")) await page.click("#m-menu-cerrar");
  await expect(page.locator("#m-menu-dialogo")).toHaveCount(0);
  // and neither comes back by itself: another screen and back
  await page.click("#m-entrenar");
  await page.click("#m-volver");
  await expect(page.locator("#m-capitulo")).toHaveCount(0);
  expect(await present(page, "#m-capitulo-aviso")).toBe(false);
});

test("the last race's scene skipped: no notice over the result nor over the End's effects (owner 2026-11-18)", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await seedRun(page, "peregrina-w48");
  await page.goto("./");
  await continueRun(page);
  await page.click("#m-descansar");
  await toPosition(page);
  await page.click("#m-correr");
  await page.click("#m-saltar");
  // her scene after the race, skipped: the result comes with nothing over it
  await toResult(page);
  await expect(page.locator("#m-carrera-seguir")).toBeVisible();
  await page.waitForTimeout(1200);
  expect(await present(page, "#m-capitulo-aviso")).toBe(false);
  expect(await present(page, "[data-notice-leaving]")).toBe(false);
  await page.click("#m-carrera-seguir");
  await expect(page.locator("#m-efectos")).toBeVisible();
  expect(await present(page, "#m-capitulo-aviso")).toBe(false);
  await page.click("#m-efectos");
  await expect(page.locator("#m-fin")).toBeVisible();
  await page.waitForTimeout(600);
  expect(await present(page, "#m-capitulo-aviso")).toBe(false);
  expect(await present(page, "[data-notice-leaving]")).toBe(false);
});
