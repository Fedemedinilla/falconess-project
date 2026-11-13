import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type BrowserContext, expect, type Frame, type Page, test } from "@playwright/test";
import { ARTIFACT_TITLE, artifactProblems, VIEWPORT_FIT_META } from "../scripts/artifact";
import { isFontUrl, t, watchErrors } from "./fixtures";

/**
 * The published page (`build:artifact`): one HTML fragment the host wraps in its own document.
 * It is loaded here the way the host does it, with every request blocked except Google Fonts, at
 * the top level and inside a sandboxed iframe (opaque origin: no storage, no clipboard).
 */

const FILE = fileURLToPath(new URL("../dist-artifact/falconess-playtest.html", import.meta.url));
const ORIGIN = "https://falconess-artifact.test/";
const HOST = "https://host.test/";

function fragment(): string {
  return readFileSync(FILE, "utf8");
}

/** The document the host puts around the fragment. */
function wrapped(page: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>${page}</body></html>`;
}

/** Serve the wrapped page (and a host page framing it); allow fonts; block and record the rest. */
async function serve(context: BrowserContext): Promise<string[]> {
  const blocked: string[] = [];
  const html = wrapped(fragment());
  await context.route("**/*", (route) => {
    const url = route.request().url();
    if (url.startsWith(ORIGIN))
      return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html });
    if (url.startsWith(HOST))
      return route.fulfill({
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%;display:block}</style></head><body><iframe title="Falconess" sandbox="allow-scripts allow-popups allow-forms" src="${ORIGIN}#inicio"></iframe></body></html>`,
      });
    if (isFontUrl(url)) return route.continue();
    blocked.push(url);
    return route.abort("blockedbyclient");
  });
  return blocked;
}

/** «Lo que pasó» opened after an input: read it and close it with its button. */
async function closeWeek(app: Page | Frame): Promise<void> {
  const dialog = app.locator("#semana-dialogo[open]");
  await expect(dialog).toBeVisible();
  await app.locator("#semana-continuar").click();
  await expect(dialog).toHaveCount(0);
}

/** Start a season, take two weeks, open the free race and see its result. */
async function smoke(app: Page | Frame): Promise<void> {
  await app.locator("#inicio-nueva").click();
  await app.locator("#nueva-semilla").fill("pt-e2e-artifact");
  await app.locator("#nueva-empezar").click();
  for (const week of [2, 3]) {
    await app.locator("#accion-train-agility").click();
    await closeWeek(app);
    // the week closes, or first asks for an event's answer
    const next = app.getByTitle(t("ui.top.week.long", { turn: week, turns: 48 }));
    const event = app.locator("#evento-dialogo[open]");
    await expect(next.or(event)).toBeAttached();
    if ((await event.count()) > 0) {
      await app.locator("#evento-opcion-0").click();
      await closeWeek(app);
    }
    await expect(next).toBeAttached();
  }
  await app.locator("#nav-carrera-libre").click();
  await expect(app.getByRole("heading", { name: t("ui.freeRace.title") })).toBeVisible();
  await app.locator("#libre-meta").click();
  await expect(app.getByRole("table", { name: t("ui.race.result.title") })).toBeVisible();
}

/** The page has no horizontal scroll at its width. */
async function noSideScroll(app: Page | Frame): Promise<void> {
  const { scroll, client } = await app.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(scroll, "horizontal page scroll").toBeLessThanOrEqual(client);
}

test("the built fragment keeps the page contract", () => {
  const page = fragment();
  expect(artifactProblems(page)).toEqual([]);
  const lines = page.split("\n");
  expect(lines[0]).toBe(ARTIFACT_TITLE);
  expect(lines[1]).toBe(VIEWPORT_FIT_META);
  expect(page).not.toMatch(/<!doctype|<html[\s>]|<head[\s>]|<body[\s>]/i);
  expect(statSync(FILE).size).toBeLessThan(16 * 1024 * 1024);
  console.log(`[artifact] ${statSync(FILE).size} bytes`);
});

test("wrapped like the host does, only fonts reach the network: a season, two weeks, a free race", async ({
  page,
  context,
}) => {
  const errors = watchErrors(page, { allowFontFailures: true });
  const blocked = await serve(context);
  await page.goto(`${ORIGIN}#inicio`);
  expect(await page.title()).toBe(ARTIFACT_TITLE.replace(/<\/?title>/g, ""));
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await smoke(page);
  await page.click("#partida-abrir");
  await expect(page.locator("#partida-dialogo")).toContainText(t("ui.run.saved"));
  expect(blocked, "requests outside Google Fonts").toEqual([]);
  expect(errors).toEqual([]);
});

test("in a sandboxed iframe at phone width: no storage, copy falls back, no side scroll", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 400, height: 860 });
  const errors = watchErrors(page, { allowFontFailures: true });
  const blocked = await serve(context);
  await page.goto(HOST);
  const frame = page.frame({ url: (url) => url.href.startsWith(ORIGIN) });
  if (!frame) throw new Error("no app frame");
  await expect(frame.getByRole("heading", { level: 1 })).toBeVisible();
  await noSideScroll(frame);
  await smoke(frame);
  await noSideScroll(frame);
  await frame.locator("#nav-temporada").click();
  await noSideScroll(frame);
  await frame.locator("#partida-abrir").click();
  const dialog = frame.locator("#partida-dialogo");
  await expect(dialog).toContainText(t("ui.run.notSaved"));
  await frame.locator("#partida-copiar").click();
  await expect(dialog).toContainText(t("ui.run.selected"));
  expect(blocked, "requests outside Google Fonts").toEqual([]);
  expect(errors).toEqual([]);
});

test("the phone game is the default view: art inlined, a week trained, only fonts reach the network", async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = watchErrors(page, { allowFontFailures: true });
  const blocked = await serve(context);
  await page.goto(ORIGIN);
  await page.click("#m-titulo");
  await expect(page.getByRole("heading", { name: t("ui.m.pick.title") })).toBeVisible();
  // the chibis are inlined: every image has loaded
  const images = page.locator("img");
  await expect(images).toHaveCount(3);
  expect(
    await images.evaluateAll((els) => els.every((el) => (el as HTMLImageElement).naturalWidth > 0)),
  ).toBe(true);
  await page.click("#m-elegir-peregrina");
  await page.click("#m-empezar");
  // her prologue first (owner 2026-11-12)
  await page.click("#m-capitulo-saltar");
  await page.click("#m-entrenar");
  await page.dblclick("#m-entrenar-agility");
  // the week's effects, then the menu of week 2 (no dialog since 2026-11-13)
  const fx = page.locator("#m-efectos");
  await expect(fx.or(page.locator("#m-semana[aria-label*='2']"))).toBeVisible({ timeout: 10_000 });
  if ((await fx.count()) > 0) await fx.click();
  await expect(page.locator("#m-entrenar")).toBeEnabled();
  await noSideScroll(page);
  expect(blocked, "requests outside Google Fonts").toEqual([]);
  expect(errors).toEqual([]);
});
