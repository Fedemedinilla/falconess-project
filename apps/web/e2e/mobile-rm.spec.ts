import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, type Page } from "@playwright/test";
import { t } from "./fixtures";
import {
  continueRun,
  pastTitle,
  seedRun,
  skipScene,
  startMobile,
  test,
  toResult,
  week,
} from "./mobile-helpers";
import { freezeAt, holdClock, movingNow, opacityOf } from "./motion";

/**
 * The phone game under reduced motion (plan-final §2.4, one policy: M7, rules 71-73): what moves
 * stands still at its rest, and its rest is visible. Nothing comes in, leaves, loops or drifts
 * (`movingNow` finds no running animation, nor a transition of anything but an opacity); only the
 * reading holds keep their time (the week's effects, the chapter's card, a race's finish, a
 * notice). A refused act's notice (5.9, H5, C7): no way in, no fade, the whole of it shown for
 * its time. A scene that was skipped or already seen says nothing (owner 2026-11-18): «Historia»
 * plays it again. The emblem never plays (E41); the inheritance card shows whole at once and
 * «Continuar» takes the tap from its first frame (L1); the title leaves by fading only; the chat's
 * feed jumps to the newest bubble.
 */

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: "reduce" });

test("a refused act's notice shows whole and still on the selection", async ({ page }) => {
  const { save } = JSON.parse(
    readFileSync(fileURLToPath(new URL("./saves/peregrina-w10.json", import.meta.url)), "utf8"),
  );
  // it parses, but the season has no event to answer at its last input: «Continuar» is refused
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
  const notice = page.locator("#m-aviso-error");
  await expect(notice).toContainText(t("ui.error.load-replay"));
  expect(await opacityOf(page, "#m-aviso-error")).toBe(1);
  expect(await notice.evaluate((el) => getComputedStyle(el).transform)).toBe("none");
  // and it goes at once, with no copy fading where it stood
  await notice.getByRole("button", { name: t("ui.error.dismiss") }).click();
  await expect(notice).toHaveCount(0);
  await expect(page.locator("[data-notice-leaving]")).toHaveCount(0);
});

test("a skipped scene says nothing: «Historia» is where she watches it again", async ({ page }) => {
  await startMobile(page, "peregrina");
  await expect(page.locator("#m-entrenar")).toBeVisible();
  await expect(page.locator("#m-capitulo-aviso")).toHaveCount(0);
  await page.click("#m-menu");
  await page.click("#m-historia-abrir");
  await page.click('#m-historia [data-scene="peregrina-prologue"] button');
  await expect(page.locator("#m-capitulo")).toHaveAttribute("data-scene", "peregrina-prologue");
});

/** Every `[data-fx]` effect's opacity as the eye gets it (`opacityOf`, for each one). */
function effectsOpacity(page: Page): Promise<number[]> {
  return page.locator("[data-fx]").evaluateAll((els) =>
    els.map((el) => {
      let opacity = 1;
      for (let e: Element | null = el; e; e = e.parentElement)
        opacity *= Number(getComputedStyle(e).opacity);
      return opacity;
    }),
  );
}

test("a rest's effects stand whole and still from their first frame, their time ends them, and the HUD turns at once (rule 73, M7, O3)", async ({
  page,
}) => {
  await startMobile(page);
  await page.click("#m-descansar");
  await expect(page.locator("#m-efectos")).toBeVisible();
  // nothing of them comes in, pops, shines or glows: the scrim and every stamp whole at once
  expect(await movingNow(page)).toEqual([]);
  await freezeAt(page, 0);
  expect(await opacityOf(page, "#m-efectos")).toBeGreaterThanOrEqual(0.99);
  const effects = await effectsOpacity(page);
  expect(effects.length).toBeGreaterThan(0);
  for (const opacity of effects) expect(opacity).toBeGreaterThanOrEqual(0.99);
  for (const opacity of await page
    .locator('[data-fx] [class*="stamp"]')
    .evaluateAll((els) => els.map((el) => Number(getComputedStyle(el).opacity))))
    expect(opacity).toBeGreaterThanOrEqual(0.99);
  // a reading hold: they stay their time, then go at once (no copy) and the HUD turns at once
  await expect(page.locator("#m-efectos")).toHaveCount(0, { timeout: 5000 });
  expect(await page.locator("[data-layer-phase]").count()).toBe(0);
  expect(await week(page)).toBe(2);
  expect(await movingNow(page)).toEqual([]);
});

test("a training's result stands whole at once: its stamp and its «+N» with no way in, nothing moving (M7)", async ({
  page,
}) => {
  await startMobile(page);
  await page.click("#m-entrenar");
  await page.dblclick("#m-entrenar-agility");
  await expect(page.locator("#m-resultado")).toBeVisible();
  expect(await movingNow(page)).toEqual([]);
  expect(await opacityOf(page, "#m-resultado")).toBeGreaterThanOrEqual(0.99);
  const pops = await page
    .locator("#m-stats [data-delta]")
    .evaluateAll((els) => els.map((el) => Number(getComputedStyle(el).opacity)));
  expect(pops.length).toBeGreaterThan(0);
  for (const opacity of pops) expect(opacity).toBeGreaterThanOrEqual(0.99);
});

/**
 * From now on, whether the emblem (`#m-transicion`) ever shows: checked after every change of the
 * page. Returns whether it did.
 */
async function watchEmblem(page: Page): Promise<() => Promise<boolean>> {
  await page.evaluate(() => {
    Reflect.set(window, "__emblem", document.getElementById("m-transicion") !== null);
    new MutationObserver(() => {
      if (document.getElementById("m-transicion")) Reflect.set(window, "__emblem", true);
    }).observe(document.body, { childList: true, subtree: true });
  });
  return () => page.evaluate(() => Reflect.get(window, "__emblem") === true);
}

test("a race week: no emblem, the scene before the race whole and still from its first frame and through its lines, the race's result at once (E41, rule 71, M7)", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await seedRun(page, "peregrina-w10");
  await page.goto("./");
  await continueRun(page);
  const emblem = await watchEmblem(page);
  await page.click("#m-descansar");
  await page.click("#m-efectos");
  // straight into the race mode, on the scene before the race (a box scene over the track)
  const scene = page.locator("#m-capitulo");
  await expect(scene).toHaveAttribute("data-scene", "peregrina-debut");
  expect(await movingNow(page)).toEqual([]);
  expect(await opacityOf(page, "#m-capitulo [data-card]")).toBeGreaterThanOrEqual(0.99);
  const backdrop = page.locator("#m-capitulo img");
  expect(await opacityOf(page, "#m-capitulo img")).toBeGreaterThanOrEqual(0.99);
  expect(await backdrop.evaluate((el) => getComputedStyle(el).transform)).toBe("none");
  expect(await backdrop.evaluate((el) => getComputedStyle(el).filter)).not.toContain("blur(1");
  // its first line, whole: the box and its «more» mark stand still
  await expect(scene).toHaveAttribute("data-beat", "line");
  expect(await movingNow(page)).toEqual([]);
  await skipScene(page);
  await expect(page.locator("#m-precarrera")).toBeVisible();
  expect(await movingNow(page)).toEqual([]);
  await page.click("#m-correr");
  await page.click("#m-saltar");
  await toResult(page);
  expect(await movingNow(page)).toEqual([]);
  expect(await opacityOf(page, "#m-resultado")).toBeGreaterThanOrEqual(0.99);
  expect(await emblem()).toBe(false);
});

test("the inheritance card shows whole at once and «Continuar» takes the tap from its first frame; the week's scene after it stands still (L1, rule 71)", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await seedRun(page, "peregrina-w39-insp");
  await page.goto("./");
  await continueRun(page);
  await page.click("#m-descansar");
  await page.click("#m-efectos");
  const card = page.locator("#m-inspiracion");
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("data-revealed", "time");
  // long before its intro would have ended (1.6 s)
  await expect(page.locator("#m-inspiracion-seguir")).toBeEnabled({ timeout: 300 });
  expect(await movingNow(page)).toEqual([]);
  expect(await opacityOf(page, "#m-inspiracion-seguir")).toBeGreaterThanOrEqual(0.99);
  await page.click("#m-inspiracion-seguir");
  const scene = page.locator("#m-capitulo");
  await expect(scene).toHaveAttribute("data-scene", "peregrina-first-vos");
  expect(await movingNow(page)).toEqual([]);
  await expect(scene).toHaveAttribute("data-beat", "line");
  expect(await movingNow(page)).toEqual([]);
});

test("the prologue, a cinematic, stands still: its bars, glow and backdrop at rest from its first frame, its words whole and still (rule 71, M7)", async ({
  page,
}) => {
  await page.goto("./");
  await pastTitle(page);
  await page.click("#m-elegir-peregrina");
  await page.click("#m-empezar");
  const scene = page.locator("#m-capitulo");
  await expect(scene).toHaveAttribute("data-style", "cine");
  expect(await movingNow(page)).toEqual([]);
  await expect(scene).toHaveAttribute("data-beat", "line");
  await expect(scene).toContainText(t("story.peregrina-prologue.1"));
  expect(await movingNow(page)).toEqual([]);
});

test("the title leaves by fading only, with no zoom (§2.4)", async ({ page }) => {
  await page.clock.install();
  await page.goto("./");
  await holdClock(page);
  const title = page.locator("#m-titulo");
  await title.click();
  await expect(title).toHaveAttribute("data-leaving");
  expect(await title.evaluate((el) => getComputedStyle(el).transform)).toBe("none");
  expect(await movingNow(page)).toEqual([]);
});

test("the chat comes and answers without moving: no way in, its bubbles whole, its feed jumps to the newest (M7)", async ({
  page,
}) => {
  // how the feed scrolls: each scrollTo's behavior, in order
  await page.addInitScript(() => {
    const scrolls: string[] = [];
    Reflect.set(window, "__scrolls", scrolls);
    const scrollTo = Element.prototype.scrollTo;
    Element.prototype.scrollTo = function (this: Element, ...args: unknown[]) {
      const options = args[0];
      if (this.closest("#m-chat") && typeof options === "object" && options !== null)
        scrolls.push(String(Reflect.get(options, "behavior") ?? "auto"));
      Reflect.apply(scrollTo, this, args);
    };
  });
  await startMobile(page);
  await page.click("#m-menu");
  await page.click("#m-chat-abrir");
  const chat = page.locator("#m-chat");
  await expect(chat).toBeVisible();
  expect(await movingNow(page)).toEqual([]);
  await page.click('[data-topic="peregrina-why-race"]');
  await expect(chat).toContainText(t("chat.peregrina-why-race.3"));
  expect(await movingNow(page)).toEqual([]);
  const scrolls: unknown = await page.evaluate(() => Reflect.get(window, "__scrolls"));
  expect(Array.isArray(scrolls) && scrolls.length > 0).toBe(true);
  expect(new Set(Array.isArray(scrolls) ? scrolls : [])).toEqual(new Set(["auto"]));
});

test.describe("the wide screen", () => {
  test.use({ viewport: { width: 1440, height: 900 }, hasTouch: false });
  test("the panel and the column stand still: no fade, no dim easing in, nothing moving beside the effects (D4, L8)", async ({
    page,
  }) => {
    await startMobile(page);
    await expect(page.locator("#m-panel")).toBeVisible();
    expect(await movingNow(page, "[data-app], #m-panel")).toEqual([]);
    await page.click("#m-descansar");
    await expect(page.locator("#m-efectos")).toBeVisible();
    expect(await movingNow(page, "[data-app], #m-panel")).toEqual([]);
    expect(await opacityOf(page, "#m-panel")).toBeLessThan(0.5);
  });
});

test("a sheet and the chat come and go at once, with nothing moving (M8, M9, §2.4)", async ({
  page,
}) => {
  await page.clock.install();
  await startMobile(page);
  await holdClock(page);
  await page.click("#m-menu");
  const sheet = page.locator("#m-menu-dialogo");
  await expect(sheet).toHaveAttribute("open");
  expect(await movingNow(page, "dialog")).toEqual([]);
  expect(await opacityOf(page, "#m-menu-dialogo")).toBeGreaterThanOrEqual(0.99);
  // closed by «Cerrar» with the clock held: no closing time to wait for
  await page.click("#m-menu-cerrar");
  await expect(sheet).toHaveCount(0);
  await page.click("#m-menu");
  await page.click("#m-chat-abrir");
  await expect(sheet).toHaveCount(0);
  expect(await movingNow(page)).toEqual([]);
  expect(await opacityOf(page, "#m-chat")).toBeGreaterThanOrEqual(0.99);
  await page.click("#m-chat-cerrar");
  await expect(page.locator("#m-chat")).toHaveCount(0);
});
