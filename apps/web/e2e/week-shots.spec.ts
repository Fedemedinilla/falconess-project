import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { stubFonts, watchErrors } from "./fixtures";
import { closeWeek, decide, playUntil, RUN_KEY, readTurn, startSeason } from "./play";

/**
 * Screenshots of «Lo que pasó» for review (`E2E_SHOTS=1 playwright test --project shots
 * week-shots`), never committed: <nn>-week-<scene>-<width>x<height>-<scheme>.png in
 * `E2E_SHOTS_DIR` (or .work/ui/shots-week/), the viewport as the player sees it, real fonts.
 * Each scene is a run in storage opened with «Continuar» (a fresh browser has not read its last
 * week, so the dialog opens), or one more click on it.
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

/** The runs each scene opens: one click (or a few) from a new season, and Peregrina's T12. */
async function findScenes(browser: Browser): Promise<Scenes> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await stubFonts(page);
  const scenes: Scenes = { "race-advice": JSON.stringify(RACE_7TH) };
  const one = async (name: string, seed: string, action: string) => {
    await startSeason(page, "peregrina", seed);
    await decide(page, action, (await readTurn(page)).inputs);
    scenes[name] = await saved(page);
  };
  await one("train-ok", "pt-e2e-semana-0", "#accion-train-agility");
  await one("train-fail", "pt-e2e-semana-11", "#accion-train-agility");
  await one("outing", "pt-e2e-semana-0", "#accion-outing");
  // the second training of "pt-e2e-semana-1" leaves an event waiting; then its answer
  await startSeason(page, "peregrina", "pt-e2e-semana-1");
  await decide(page, "#accion-train-agility", (await readTurn(page)).inputs);
  await closeWeek(page);
  await decide(page, "#accion-train-agility", (await readTurn(page)).inputs);
  scenes["event-next"] = await saved(page);
  await closeWeek(page);
  await decide(page, "#evento-opcion-0", (await readTurn(page)).inputs);
  scenes["event-answer"] = await saved(page);
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
  "outing",
  "event-next",
  "event-answer",
  "race-t12",
  "race-advice",
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
