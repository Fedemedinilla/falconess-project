import { expect, type Page } from "@playwright/test";
import { t } from "./fixtures";
import {
  continueRun,
  pastTitle,
  seedRun,
  settle,
  test,
  toPosition,
  toResult,
  week,
} from "./mobile-helpers";

/**
 * A reload (or a closed tab, or a language switch) inside a week plays that week on (D5, F1, C5,
 * O1; plan-final 5.6). A decided race week comes back with the same action and position, its
 * action's part again only if the race mode had not begun, and no way back to the menu; the race
 * mode, once «Correr» ran, replays the race up to its result; a training's result replays while
 * its week is unread. The week's record lives in this browser (`falconess.juego.semana`); one that
 * belongs to no run in play is dropped, never on the select screen. An End an older build saved
 * (its last week never read, no record of its race) never replays its last race.
 */

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

const WEEK_KEY = "falconess.juego.semana";

type Seen = {
  /** The order in which each watched id first came into the page (1, 2…), since the page load. */
  readonly order: Readonly<Record<string, number>>;
  /** The emblem's opacity (up its ancestors) the moment it came into the page. */
  readonly emblem: number | undefined;
};

/**
 * From every page load on (an init script, so a reload is watched from its first frame): when each
 * of `ids` first came into the page, and how opaque the emblem was when it did.
 */
async function watch(page: Page, ids: readonly string[]): Promise<() => Promise<Seen>> {
  await page.addInitScript((list: readonly string[]) => {
    const order: Record<string, number> = {};
    let n = 0;
    let emblem: number | undefined;
    const look = () => {
      for (const id of list)
        if (order[id] === undefined && document.getElementById(id)) order[id] = ++n;
      const cover = document.getElementById("m-transicion");
      if (cover && emblem === undefined) {
        let opacity = 1;
        for (let e: Element | null = cover; e; e = e.parentElement)
          opacity *= Number(getComputedStyle(e).opacity);
        emblem = opacity;
      }
    };
    new MutationObserver(look).observe(document, { childList: true, subtree: true });
    Reflect.set(window, "__seen", () => ({ order, emblem }));
  }, ids);
  return () =>
    page.evaluate(() => {
      const seen: unknown = Reflect.get(window, "__seen");
      return typeof seen === "function" ? seen() : { order: {}, emblem: undefined };
    });
}

/** The week's record as this browser stores it (null: none). */
function storedWeek(page: Page): Promise<string | null> {
  return page.evaluate((key) => localStorage.getItem(key), WEEK_KEY);
}

/** The black boxes this browser kept (`falconess.juego.cajas`): how many. */
function boxes(page: Page): Promise<number> {
  return page.evaluate(() => {
    const raw = localStorage.getItem("falconess.juego.cajas");
    const list: unknown = raw === null ? [] : JSON.parse(raw);
    return Array.isArray(list) ? list.length : 0;
  });
}

/** A position on the card other than the one picked now: its id's suffix. */
async function otherPosition(page: Page): Promise<string> {
  const id = await page
    .locator('#m-posicion input[type="radio"]:not(:checked)')
    .first()
    .getAttribute("id");
  if (!id) throw new Error("no other position on the card");
  return id.slice("m-posicion-".length);
}

async function pick(page: Page, position: string): Promise<void> {
  await page.click(`label[for="m-posicion-${position}"]`);
  await expect(page.locator(`#m-posicion-${position}`)).toBeChecked();
}

test("1. a reload on the decided card: the same card, no way back, no emblem, no menu", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const seen = await watch(page, ["m-transicion", "m-entrenar", "m-precarrera"]);
  await seedRun(page, "peregrina-w10");
  await page.goto("./");
  await continueRun(page);
  await page.click("#m-entrenar");
  await page.dblclick("#m-entrenar-technique");
  await toPosition(page);
  await page.reload();
  await continueRun(page);
  await expect(page.locator("#m-precarrera-accion")).toHaveText(
    t("ui.m.race.action", { action: t("action.train:technique") }),
  );
  await expect(page.locator("#m-volver")).toHaveCount(0);
  // the race mode had begun: no emblem again, and the menu never shows on the way
  await page.waitForTimeout(3000);
  const { order } = await seen();
  expect(order["m-transicion"]).toBeUndefined();
  expect(order["m-entrenar"]).toBeUndefined();
  await expect(page.locator("#m-precarrera")).toBeVisible();
});

test("2. a reload over the action's effects: the effects again, then the emblem, then the card", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await seedRun(page, "peregrina-w10");
  await page.goto("./");
  await continueRun(page);
  await page.click("#m-descansar");
  await expect(page.locator("#m-efectos")).toBeVisible();
  await page.reload();
  await continueRun(page);
  // over the week's menu, as before the reload
  await expect(page.locator("#m-efectos")).toBeVisible();
  await page.click("#m-efectos");
  await expect(page.locator("#m-transicion")).toBeVisible();
  await toPosition(page);
  await expect(page.locator("#m-precarrera-accion")).toHaveText(
    t("ui.m.race.action", { action: t("action.rest") }),
  );
  await expect(page.locator("#m-volver")).toHaveCount(0);
});

test("3. a reload during the emblem of a week with nothing before it: it opens covered, the menu never shows", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const seen = await watch(page, ["m-transicion", "m-entrenar", "m-precarrera"]);
  await page.clock.install();
  await seedRun(page, "peregrina-w10");
  await page.goto("./");
  await continueRun(page);
  // the workshop swaps her wings: no result and no effects, the emblem comes at once
  await page.click("#m-taller");
  await page.click("#m-ala-mule");
  await page.click("#m-taller-confirmar");
  await expect(page.locator("#m-transicion")).toBeVisible();
  // the clock stands still: the reload lands while the emblem is up (the race mode not begun)
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 100));
  await page.reload();
  // and runs again for the new page (the title leaves on a timer)
  await page.clock.resume();
  await continueRun(page);
  await expect(page.locator("#m-transicion")).toHaveCount(1);
  const restored = await seen();
  expect(restored.emblem).toBeGreaterThanOrEqual(0.99);
  expect(restored.order["m-entrenar"]).toBeUndefined();
  await toPosition(page);
  const { order } = await seen();
  expect(order["m-precarrera"]).toBeDefined();
  expect(order["m-entrenar"]).toBeUndefined();
  await expect(page.locator("#m-volver")).toHaveCount(0);
});

test("4. a position picked on the decided card survives a reload", async ({ page }) => {
  test.setTimeout(90_000);
  await seedRun(page, "peregrina-w10");
  await page.goto("./");
  await continueRun(page);
  await page.click("#m-descansar");
  await toPosition(page);
  const position = await otherPosition(page);
  await pick(page, position);
  await page.reload();
  await continueRun(page);
  await expect(page.locator("#m-precarrera")).toBeVisible();
  await expect(page.locator(`#m-posicion-${position}`)).toBeChecked();
  await page.click("#m-correr");
  await expect(page.locator("#m-carrera-vuelo")).toBeVisible();
  await page.click("#m-saltar");
  await toResult(page);
  await expect(page.locator("#m-resultado-posicion")).toHaveAttribute("data-position", position);
});

test("5. a position planned on the menu's race card survives a reload and a new season's select screen", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await seedRun(page, "peregrina-w10");
  await page.goto("./");
  await continueRun(page);
  await page.click("#m-carrera");
  const position = await otherPosition(page);
  await pick(page, position);
  await page.click("#m-correr");
  await expect(page.locator("#m-entrenar")).toBeVisible();
  await page.reload();
  await continueRun(page);
  await page.click("#m-carrera");
  await expect(page.locator(`#m-posicion-${position}`)).toBeChecked();
  await page.click("#m-volver");
  // «Nueva temporada» goes to the select screen: the record waits there, «Continuar» finds it
  await page.click("#m-menu");
  await page.click("#m-nueva");
  await page.click("#m-nueva-si");
  await expect(page.locator("#m-continuar")).toBeVisible();
  const stored = await storedWeek(page);
  expect(stored).toContain('"planned"');
  await page.waitForTimeout(300);
  expect(await storedWeek(page)).toBe(stored);
  await page.click("#m-continuar");
  await page.click("#m-carrera");
  await expect(page.locator(`#m-posicion-${position}`)).toBeChecked();
  await page.click("#m-volver");
  // and the decided card takes it
  await page.click("#m-descansar");
  await toPosition(page);
  await expect(page.locator(`#m-posicion-${position}`)).toBeChecked();
});

test("6. a reload mid-race after «Correr»: the race again, its scene, its result, then the next week", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await seedRun(page, "peregrina-w10");
  await page.goto("./");
  await continueRun(page);
  await page.click("#m-descansar");
  await toPosition(page);
  await page.click("#m-correr");
  await expect(page.locator("#m-carrera-vuelo")).toBeVisible();
  await page.reload();
  await continueRun(page);
  await expect(page.locator("#m-carrera-vuelo")).toBeVisible();
  await expect(page.locator("#m-entrenar")).toHaveCount(0);
  await page.click("#m-saltar");
  // her first race's after-scene had not played: it comes before the result
  await expect(page.locator("#m-capitulo")).toHaveAttribute("data-scene", "peregrina-debut-win");
  await toResult(page);
  await page.click("#m-carrera-seguir");
  await expect(page.locator("#m-efectos")).toBeVisible();
  await settle(page);
  expect(await week(page)).toBe(11);
});

test("7. Directo: a reload on the race's result opens on the result again", async ({ page }) => {
  test.setTimeout(90_000);
  const seen = await watch(page, ["m-carrera-vuelo", "m-resultado", "m-entrenar"]);
  await page.addInitScript(() => localStorage.setItem("falconess.juego.ritmo", "direct"));
  await seedRun(page, "peregrina-w10");
  await page.goto("./");
  await continueRun(page);
  await page.click("#m-descansar");
  await toPosition(page);
  await page.click("#m-correr");
  await toResult(page);
  await page.reload();
  await continueRun(page);
  await expect(page.locator("#m-resultado")).toBeVisible();
  const { order } = await seen();
  expect(order["m-carrera-vuelo"]).toBeUndefined();
  expect(order["m-entrenar"]).toBeUndefined();
  await page.click("#m-carrera-seguir");
  await settle(page);
  expect(await week(page)).toBe(11);
});

test("8. a normal week: a reload during the training's result plays it again, then what follows it", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await seedRun(page, "peregrina-w39-insp");
  await page.goto("./");
  await continueRun(page);
  await page.click("#m-entrenar");
  await page.dblclick("#m-entrenar-agility");
  const result = page.locator("#m-resultado");
  await expect(result).toBeVisible();
  const outcome = await result.getAttribute("data-outcome");
  await page.reload();
  await continueRun(page);
  await expect(result).toHaveAttribute("data-outcome", outcome ?? "");
  // the week's inheritance card and scene, in D2's order, once the result ends by itself
  await expect(page.locator("#m-inspiracion")).toBeVisible({ timeout: 15_000 });
  await settle(page);
  expect(await week(page)).toBe(40);
});

test("9. the season's last race cut by a reload: the race again before the End, its effects over it", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await seedRun(page, "peregrina-w48");
  await page.goto("./");
  await continueRun(page);
  await page.click("#m-descansar");
  await toPosition(page);
  await page.click("#m-correr");
  await expect(page.locator("#m-carrera-vuelo")).toBeVisible();
  expect(await boxes(page)).toBe(1);
  await page.reload();
  await continueRun(page);
  await expect(page.locator("#m-carrera-vuelo")).toBeVisible();
  await expect(page.locator("#m-fin")).toHaveCount(0);
  await page.click("#m-saltar");
  await toResult(page);
  await page.click("#m-carrera-seguir");
  await expect(page.locator("#m-efectos")).toBeVisible();
  await expect(page.locator("#m-fin")).toHaveCount(1);
  await page.click("#m-efectos");
  await expect(page.locator("#m-fin")).toBeVisible();
  expect(await boxes(page)).toBe(1);
});

test("10. an End an older build saved (its last week unread, no record of its race): the End, never the race again", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const seen = await watch(page, ["m-carrera-vuelo", "m-precarrera", "m-transicion", "m-fin"]);
  await seedRun(page, "peregrina-ended");
  // an older build never read the week that ended the season (F3) and kept no week's record
  await page.addInitScript(() => {
    if (sessionStorage.getItem("unread") !== null) return;
    sessionStorage.setItem("unread", "1");
    localStorage.removeItem("falconess.pruebas.vista");
  });
  await page.goto("./");
  await continueRun(page);
  // that week's effects, once, over the End
  await expect(page.locator("#m-efectos")).toBeVisible();
  await expect(page.locator("#m-fin")).toHaveCount(1);
  await page.click("#m-efectos");
  await expect(page.locator("#m-fin")).toBeVisible();
  await page.waitForTimeout(1500);
  const { order } = await seen();
  expect(order["m-carrera-vuelo"]).toBeUndefined();
  expect(order["m-precarrera"]).toBeUndefined();
  expect(order["m-transicion"]).toBeUndefined();
  await page.reload();
  await continueRun(page);
  await expect(page.locator("#m-fin")).toBeVisible();
  await expect(page.locator("#m-efectos")).toHaveCount(0);
});

test("11. a week's record of no run in play is dropped once the run shows, never on the select screen", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const stale = JSON.stringify({
    v: 1,
    phase: "decided",
    fp: "v3|another-run|10|00000000",
    turn: 10,
    inputs: 10,
    input: { kind: "rest" },
    stage: "race",
  });
  await seedRun(page, "peregrina-w10");
  await page.addInitScript(
    ([key, value]) => {
      if (sessionStorage.getItem("stale") !== null) return;
      sessionStorage.setItem("stale", "1");
      localStorage.setItem(key, value);
    },
    [WEEK_KEY, stale] as const,
  );
  await page.goto("./");
  await pastTitle(page);
  await expect(page.locator("#m-continuar")).toBeVisible();
  await page.waitForTimeout(300);
  expect(await storedWeek(page)).toBe(stale);
  await page.click("#m-continuar");
  // no dead end: the week's menu, and the record gone
  await expect(page.locator("#m-entrenar")).toBeVisible();
  expect(await week(page)).toBe(10);
  await expect(page.locator("#m-precarrera")).toHaveCount(0);
  await expect.poll(() => storedWeek(page)).toBeNull();
  await page.click("#m-descansar");
  await toPosition(page);
  await expect(page.locator("#m-precarrera-accion")).toHaveText(
    t("ui.m.race.action", { action: t("action.rest") }),
  );
});

test("12. two tabs: one left on the title continues the other's decided week, and keeps it stored", async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  // a record of another run, there when both tabs load (each tab reads the storage at its load)
  const stale = JSON.stringify({ v: 1, phase: "raceSeen", fp: "v3|another-run|4|00000000" });
  await context.addInitScript(
    ([key, value]) => {
      if (sessionStorage.getItem("stale") !== null) return;
      sessionStorage.setItem("stale", "1");
      if (localStorage.getItem(key) === null) localStorage.setItem(key, value);
    },
    [WEEK_KEY, stale] as const,
  );
  const waiting = await context.newPage();
  await seedRun(waiting, "peregrina-w10");
  await waiting.goto("./");
  await expect(waiting.locator("#m-titulo")).toBeVisible();
  // the other tab plays week 10 up to its decided card
  await seedRun(page, "peregrina-w10");
  await page.goto("./");
  await continueRun(page);
  await page.click("#m-descansar");
  await toPosition(page);
  // the waiting tab continues the run as it is stored now: the same decided card, no menu
  await continueRun(waiting);
  await expect(waiting.locator("#m-precarrera")).toBeVisible();
  await expect(waiting.locator("#m-precarrera-accion")).toHaveText(
    t("ui.m.race.action", { action: t("action.rest") }),
  );
  await expect(waiting.locator("#m-volver")).toHaveCount(0);
  await expect(waiting.locator("#m-entrenar")).toHaveCount(0);
  await waiting.waitForTimeout(500);
  expect(await storedWeek(waiting)).toContain('"decided"');
  // and the first tab finds it again after a reload
  await page.reload();
  await continueRun(page);
  await expect(page.locator("#m-precarrera")).toBeVisible();
  await expect(page.locator("#m-entrenar")).toHaveCount(0);
});
