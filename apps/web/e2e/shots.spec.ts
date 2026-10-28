import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { stubFonts, t, watchErrors } from "./fixtures";
import { decide, policyChoice, RUN_KEY, readTurn, startSeason } from "./play";

/**
 * Screenshots for review (`pnpm --filter @falconess/web test:e2e:shots`), never committed:
 * .work/ui/shots/<nn>-<screen>-<width>x<height>-<scheme>.png, full page, real fonts. One season of
 * Peregrina is played once by the e2e policy to find the runs each screen needs (a week with a
 * crew at a training, an event waiting, the week after the T12 race, the ended season); each
 * shot loads its run from storage and opens it with "Continuar".
 */

const OUT = fileURLToPath(new URL("../../../.work/ui/shots/", import.meta.url));
const SEED = "pt-e2e-1";

const VIEWPORTS = [
  { width: 1280, height: 800, scale: 1 },
  { width: 400, height: 860, scale: 2 },
] as const;
const SCHEMES = ["light", "dark"] as const;

type Runs = { crew: string; event: string; afterT12: string; ended: string };

async function savedRun(page: Page): Promise<string> {
  const text = await page.evaluate((key) => localStorage.getItem(key), RUN_KEY);
  if (!text) throw new Error("no saved run");
  return text;
}

/** Play the season once and keep the run at each moment a screen needs. */
async function findRuns(browser: Browser): Promise<Runs> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await stubFonts(page);
  await startSeason(page, "peregrina", SEED);
  const found: Partial<Runs> = {};
  const noCrew = t("ui.action.noCrew");
  for (let i = 0; i < 200; i++) {
    const view = await readTurn(page);
    if (view.hash === "#fin") break;
    if (view.eventOpen) found.event ??= await savedRun(page);
    else {
      const bare = await page.locator("#turno-acciones").getByText(noCrew).count();
      if (bare < 5 && (view.week ?? 0) >= 3) found.crew ??= await savedRun(page);
      if ((view.week ?? 0) === 13) found.afterT12 ??= await savedRun(page);
    }
    await decide(page, policyChoice(view), view.inputs);
  }
  found.ended = await savedRun(page);
  await context.close();
  const { crew, event, afterT12, ended } = found;
  if (!crew || !event || !afterT12 || !ended) throw new Error("the season lacks a moment to shoot");
  return { crew, event, afterT12, ended };
}

let runs: Runs | undefined;
test.beforeAll(async ({ browser }) => {
  test.setTimeout(120_000);
  runs = await findRuns(browser);
  mkdirSync(OUT, { recursive: true });
});

for (const vp of VIEWPORTS)
  for (const scheme of SCHEMES)
    test(`screens at ${vp.width}x${vp.height}, ${scheme}`, async ({ browser }) => {
      test.setTimeout(180_000);
      if (!runs) throw new Error("no runs");
      const all = runs;
      const watched: string[][] = [];
      const phone = vp.width < 600;

      /** A fresh page; `run` goes to storage first and is opened with "Continuar". */
      const open = async (run?: string): Promise<Page> => {
        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          deviceScaleFactor: vp.scale,
          colorScheme: scheme,
          reducedMotion: "reduce",
        });
        if (run)
          await context.addInitScript(
            ([key, value]) => localStorage.setItem(String(key), String(value)),
            [RUN_KEY, run],
          );
        const page = await context.newPage();
        watched.push(watchErrors(page, { allowFontFailures: true }));
        await page.goto("#inicio");
        if (run) await page.click("#inicio-continuar");
        return page;
      };

      const shot = async (page: Page, n: number, name: string, fullPage = true) => {
        // a full-page capture draws the sticky timing bar where the page is scrolled to
        if (fullPage) await page.evaluate(() => window.scrollTo(0, 0));
        await page.evaluate(async () => {
          await document.fonts.ready;
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        });
        // every form control carries a stable id (not one of React's generated «r1» ids)
        const loose = await page.evaluate(() =>
          [...document.querySelectorAll("input, select, textarea, button")]
            .filter((el) => !el.id || /[:«»]/.test(el.id))
            .map((el) => el.outerHTML.slice(0, 120)),
        );
        expect(loose, `${name}: form controls without a stable id`).toEqual([]);
        if (phone) {
          const { scroll, client } = await page.evaluate(() => ({
            scroll: document.documentElement.scrollWidth,
            client: document.documentElement.clientWidth,
          }));
          expect(scroll, `${name}: horizontal page scroll`).toBeLessThanOrEqual(client);
        }
        const file = `${String(n).padStart(2, "0")}-${name}-${vp.width}x${vp.height}-${scheme}.png`;
        await page.screenshot({ path: `${OUT}${file}`, fullPage });
      };

      // 1, 2 · Home and NewSeason
      let page = await open();
      await shot(page, 1, "home");
      await page.click("#inicio-nueva");
      await expect(page.locator("#nueva-empezar")).toBeVisible();
      await shot(page, 2, "new-season");
      await page.context().close();

      // 3, 4 · Turn with a crew at a training, then the workshop
      page = await open(all.crew);
      await expect(page.locator("#turno-acciones")).toBeVisible();
      await shot(page, 3, "turn-crew");
      await page.click("#accion-workshop");
      await expect(page.locator("#taller")).toBeVisible();
      await shot(page, 4, "turn-workshop");
      await page.context().close();

      // 5 · an event waiting for its answer (the modal, as the viewport shows it)
      page = await open(all.event);
      await expect(page.locator("#evento-dialogo")).toBeVisible();
      await shot(page, 5, "event", false);
      await page.context().close();

      // 6, 7 · the T12 goal race: mid-race, then at the finish with the why panel
      page = await open(all.afterT12);
      await page.click("#turno-ver-carrera");
      const slider = page.locator("#carrera-tiempo");
      await expect(slider).toBeVisible();
      const max = Number(await slider.getAttribute("max"));
      await slider.fill(String(Math.round(max * 0.55)));
      await shot(page, 6, "race-mid");
      await page.click("#carrera-meta");
      await expect(page.getByRole("heading", { name: t("ui.race.why.title") })).toBeVisible();
      await shot(page, 7, "race-end");
      await page.context().close();

      // 8 · free race, form open and the race at its finish
      page = await open();
      await page.click("#inicio-libre");
      await page.click("#libre-meta");
      await page.click("#libre-cambiar");
      await expect(page.locator("#libre-form")).toBeVisible();
      await shot(page, 8, "free-race");
      await page.context().close();

      // 9 · the season's end
      page = await open(all.ended);
      await expect(page).toHaveURL(/#fin$/);
      await shot(page, 9, "season-end");
      await page.context().close();

      expect(watched.flat(), "console errors or uncaught exceptions").toEqual([]);
    });
