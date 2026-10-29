import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { stubFonts, t, watchErrors } from "./fixtures";
import {
  closeWeek,
  decide,
  playUntil,
  policyChoice,
  RUN_KEY,
  RUN1_WEEK19,
  readTurn,
  startSeason,
  takeWeek,
  vigorOf,
} from "./play";

/**
 * Screenshots of «Lo que pasó» for review (`E2E_SHOTS=1 playwright test --project shots
 * week-shots`), never committed: <nn>-week-<scene>-<width>x<height>-<scheme>.png in
 * `E2E_SHOTS_DIR` (or .work/ui/shots-week/), the viewport as the player sees it, real fonts.
 * Each scene is a run in storage opened with «Continuar» (a fresh browser has not read its last
 * week, so the dialog opens). New seasons play ruleset v2: the scenes that need a failure, a mood
 * drift or an event are found by playing on; the race with a tip and the forced rest are v1 runs.
 */

const OUT = process.env.E2E_SHOTS_DIR
  ? `${process.env.E2E_SHOTS_DIR.replace(/\/$/, "")}/`
  : fileURLToPath(new URL("../../../.work/ui/shots-week/", import.meta.url));

const VIEWPORTS = [
  { width: 1280, height: 800, scale: 1 },
  { width: 390, height: 844, scale: 2 },
] as const;
const SCHEMES = ["light", "dark"] as const;

/** Caracara, seed "a": her T12 race ends 7th of 8, goal met, with a tip (advice.spec.ts). */
const RACE_7TH = {
  schemaVersion: 1,
  rulesetVersion: "v1",
  seed: "a",
  inputs: [
    {
      kind: "start",
      falconessId: "caracara",
      hangar: ["shiden", "mule", "nimbus", "falke"],
      parents: [],
    },
    ...[
      "train:agility",
      "train:simulator",
      "e",
      "train:risk-flight",
      "e",
      "rest",
      "e",
      "train:stamina",
      "e",
      "train:stamina",
      "e",
      "rest",
      "e",
      "train:stamina",
      "e",
      "train:technique",
      "e",
      "rest",
      "train:simulator",
      "e",
      "train:agility",
    ].map((k) => (k === "e" ? { kind: "event:choose", option: 0 } : { kind: k })),
  ],
};

type Scenes = Record<string, string>;

async function saved(page: Page): Promise<string> {
  const text = await page.evaluate((key) => localStorage.getItem(key), RUN_KEY);
  if (!text) throw new Error("no saved run");
  return text;
}

/** The runs each scene opens: a few clicks from a new season, Peregrina's T12, two v1 runs. */
async function findScenes(browser: Browser): Promise<Scenes> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await stubFonts(page);
  const scenes: Scenes = { "race-advice": JSON.stringify(RACE_7TH) };
  const week = page.locator("#semana-dialogo[open]");
  /** Take `action` week after week until «Lo que pasó» shows `wanted` (at most `weeks`). */
  const until = async (action: string, wanted: string, weeks = 14) => {
    for (let i = 0; i < weeks; i++) {
      if (!(await takeWeek(page, action))) break;
      if ((await week.getByText(wanted).count()) > 0) return;
    }
    throw new Error(`no week with «${wanted}»`);
  };
  const one = async (name: string, seed: string, action: string) => {
    await startSeason(page, "peregrina", seed);
    await decide(page, action, (await readTurn(page)).inputs);
    scenes[name] = await saved(page);
  };
  await one("train-ok", "pt-e2e-semana-0", "#accion-train-agility");
  await one("outing", "pt-e2e-semana-0", "#accion-outing");
  // agility every week until it fails, then a rest that gives vigor back (a drawn 30, 50 or 70)
  await startSeason(page, "peregrina", "pt-e2e-fallo");
  await until("#accion-train-agility", t("ui.week.title.train-fail"));
  scenes["train-fail"] = await saved(page);
  await takeWeek(page, "#accion-rest");
  scenes.rest = await saved(page);
  // the simulator every week until the streak lowers her mood
  await startSeason(page, "peregrina", "pt-e2e-racha");
  await until(
    "#accion-train-simulator",
    t("ui.week.cause.drift", { name: t("falconess.peregrina") }),
  );
  scenes.drift = await saved(page);
  // train (rest with vigor 40 or less) until a week leaves an event waiting; then its answer
  await startSeason(page, "peregrina", "pt-e2e-semana-1");
  for (let i = 0; i < 12; i++) {
    const action = vigorOf(await readTurn(page)) <= 40 ? "#accion-rest" : "#accion-train-agility";
    await takeWeek(page, action);
    if ((await week.getByText(t("ui.week.eventNext")).count()) > 0) break;
  }
  scenes["event-next"] = await saved(page);
  await closeWeek(page);
  await decide(page, "#evento-opcion-0", (await readTurn(page)).inputs);
  scenes["event-answer"] = await saved(page);
  // the e2e policy until a week brings one of the content's luck events by itself
  await startSeason(page, "peregrina", "pt-e2e-suerte");
  const luck = page.locator("#semana-dialogo[open] #semana-evento");
  for (let i = 0; i < 30 && (await luck.count()) === 0; i++) {
    let view = await readTurn(page);
    if (view.weekOpen) {
      await closeWeek(page);
      view = await readTurn(page);
    }
    if (view.hash === "#fin") break;
    if (view.eventOpen) await decide(page, "#evento-opcion-0", view.inputs);
    else await takeWeek(page, policyChoice(view));
  }
  if ((await luck.count()) === 0) throw new Error("no luck event in 30 weeks");
  scenes.luck = await saved(page);
  // v1: the owner's run at week 19, whose training turns into a forced rest
  await page.goto("#inicio");
  await page.click("#inicio-cargar");
  await page.fill("#cargar-json", JSON.stringify(RUN1_WEEK19));
  await page.click("#cargar-enviar");
  await takeWeek(page, "#accion-train-agility");
  scenes["forced-rest-v1"] = await saved(page);
  // Peregrina's T12 race after the e2e policy's weeks (seed pt-e2e-1), resting that week
  await startSeason(page, "peregrina", "pt-e2e-1");
  await playUntil(page, (v) => v.week === 12 && !v.eventOpen);
  await decide(page, "#accion-rest", (await readTurn(page)).inputs);
  scenes["race-t12"] = await saved(page);
  await context.close();
  return scenes;
}

let scenes: Scenes | undefined;
test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000);
  scenes = await findScenes(browser);
  mkdirSync(OUT, { recursive: true });
});

const ORDER = [
  "train-ok",
  "train-fail",
  "rest",
  "drift",
  "outing",
  "event-next",
  "event-answer",
  "luck",
  "race-t12",
  "race-advice",
  "forced-rest-v1",
] as const;

for (const vp of VIEWPORTS)
  for (const scheme of SCHEMES)
    test(`«Lo que pasó» at ${vp.width}x${vp.height}, ${scheme}`, async ({ browser }) => {
      test.setTimeout(180_000);
      const all = scenes;
      if (!all) throw new Error("no scenes");
      const watched: string[][] = [];
      const name = (n: number, scene: string) =>
        `${OUT}${String(n).padStart(2, "0")}-week-${scene}-${vp.width}x${vp.height}-${scheme}.png`;

      const open = async (run: string): Promise<Page> => {
        const context = await browser.newContext({
          viewport: { width: vp.width, height: vp.height },
          deviceScaleFactor: vp.scale,
          colorScheme: scheme,
          reducedMotion: "reduce",
        });
        await context.addInitScript(
          ([key, value]) => localStorage.setItem(String(key), String(value)),
          [RUN_KEY, run],
        );
        const page = await context.newPage();
        watched.push(watchErrors(page, { allowFontFailures: true }));
        await page.goto("#inicio");
        await page.click("#inicio-continuar");
        await expect(page.locator("#semana-dialogo[open]")).toBeVisible();
        await page.evaluate(async () => {
          await document.fonts.ready;
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        });
        return page;
      };

      let n = 1;
      for (const scene of ORDER) {
        const run = all[scene];
        if (!run) throw new Error(`no run for ${scene}`);
        const page = await open(run);
        if (vp.width < 600) {
          const { scroll, client } = await page.evaluate(() => ({
            scroll: document.documentElement.scrollWidth,
            client: document.documentElement.clientWidth,
          }));
          expect(scroll, `${scene}: horizontal page scroll`).toBeLessThanOrEqual(client);
        }
        await page.screenshot({ path: name(n, scene) });
        // the race with a tip: also with the complete explanation
        if (scene === "race-advice") {
          await page.click("#semana-consejo-explicacion-completo");
          await page.screenshot({ path: name(n, `${scene}-full`) });
        }
        // after the training: the Turn screen with the one-line recap above the actions
        if (scene === "train-ok") {
          await closeWeek(page);
          await page.locator("#turno-semana-pasada").scrollIntoViewIfNeeded();
          await page.screenshot({ path: name(n, `${scene}-closed`) });
        }
        await page.context().close();
        n += 1;
      }
      expect(watched.flat(), "console errors or uncaught exceptions").toEqual([]);
    });
