import { expect, stubFonts, t, test, textPattern, watchErrors } from "./fixtures";
import { closeWeek, decide, playUntil, RUN_KEY, readTurn, startSeason, statsOf } from "./play";

/**
 * A run is seed + inputs: "Copiar partida" copies it, "Cargar partida" replays it elsewhere,
 * "Continuar" replays the stored one, and the page works when storage is blocked.
 */

test("copy a run and load it in a fresh browser: same week, stats and fatigue", async ({
  page,
  browser,
}) => {
  await startSeason(page, "peregrina", "pt-e2e-copia");
  await playUntil(page, (v) => (v.week ?? 0) >= 7 && !v.eventOpen);
  const before = await readTurn(page);

  await page.click("#partida-abrir");
  const dialog = page.locator("#partida-dialogo");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(t("ui.run.saved"));
  await page.click("#partida-copiar");
  await expect(dialog).toContainText(t("ui.run.copied"));
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe(await page.inputValue("#partida-json"));
  const save = JSON.parse(copied);
  expect(Object.keys(save)).toEqual(["schemaVersion", "rulesetVersion", "seed", "inputs"]);
  expect(save.schemaVersion).toBe(1);
  expect(save.seed).toBe("pt-e2e-copia");
  expect(save.inputs).toHaveLength(before.inputs);
  expect(save.inputs[0]).toMatchObject({ kind: "start", falconessId: "peregrina" });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // another browser, empty storage: Cargar partida
  const other = await browser.newContext();
  const fresh = await other.newPage();
  const errors = watchErrors(fresh);
  await stubFonts(fresh);
  await fresh.goto("#inicio");
  await expect(fresh.locator("#inicio-continuar")).toHaveCount(0);
  await fresh.click("#inicio-cargar");
  await expect(fresh.locator("#cargar-dialogo")).toBeVisible();
  await expect(fresh.locator("#cargar-enviar")).toBeDisabled();
  await fresh.fill("#cargar-json", "{ no es json");
  await fresh.click("#cargar-enviar");
  await expect(fresh.getByRole("alert")).toContainText(t("ui.error.load-json"));
  await expect(fresh).toHaveURL(/#inicio$/);
  await fresh.fill("#cargar-json", copied);
  await fresh.click("#cargar-enviar");
  await expect(fresh).toHaveURL(/#temporada$/);
  const loaded = await readTurn(fresh);
  expect(loaded.week).toBe(before.week);
  expect(statsOf(loaded)).toEqual(statsOf(before));
  expect(loaded.meters).toEqual(before.meters);
  expect(loaded.inputs).toBe(before.inputs);
  // this browser never saw the run's last week: «Lo que pasó» tells it before anything else
  expect(loaded.weekOpen).toBe(true);
  await closeWeek(fresh);
  expect((await readTurn(fresh)).eventOpen).toBe(before.eventOpen);
  // the loaded run plays on exactly like the original
  await decide(fresh, "#accion-rest", loaded.inputs);
  await decide(page, "#accion-rest", before.inputs);
  expect((await readTurn(fresh)).meters).toEqual((await readTurn(page)).meters);
  expect(errors).toEqual([]);
  await other.close();
});

test("Continuar replays the stored run after a reload, and undo takes one decision back", async ({
  page,
}) => {
  await startSeason(page, "cernicala", "pt-e2e-continuar");
  await playUntil(page, (v) => (v.week ?? 0) >= 4 && !v.eventOpen);
  const before = await readTurn(page);
  await page.reload();
  await page.goto("#inicio");
  await expect(page.locator("#inicio-continuar")).toBeVisible();
  await page.click("#inicio-continuar");
  await expect(page).toHaveURL(/#temporada$/);
  await expect(page.locator("#turno-acciones")).toBeVisible();
  const after = await readTurn(page);
  expect(after.week).toBe(before.week);
  expect(after.meters).toEqual(before.meters);
  // the last week was read before the reload: «Lo que pasó» does not open again
  expect(after.weekOpen).toBe(false);

  await page.click("#partida-abrir");
  await page.click("#partida-deshacer");
  await expect(page.locator("#partida-dialogo")).toContainText(t("ui.run.undone"));
  await page.keyboard.press("Escape");
  expect((await readTurn(page)).inputs).toBe(before.inputs - 1);
});

test("the page works with storage blocked, and copying falls back to selecting the text", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const deny = () => {
      throw new DOMException("blocked", "SecurityError");
    };
    Object.defineProperty(window, "localStorage", { configurable: true, get: deny });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      get: () => ({ writeText: () => Promise.reject(new Error("denied")) }),
    });
  });
  await page.goto("#inicio");
  await page.click("#inicio-nueva");
  await page.fill("#nueva-semilla", "pt-e2e-sin-guardar");
  await page.click("#nueva-empezar");
  const week = page.getByTitle(t("ui.top.week.long", { turn: 2, turns: 48 }));
  await page.click("#accion-rest");
  await expect(week).toBeAttached();
  // «Lo que pasó» works without storage too: it opens, and its button closes it
  await expect(page.locator("#semana-dialogo[open]")).toBeVisible();
  await page.click("#semana-continuar");
  await expect(page.locator("#semana-dialogo[open]")).toHaveCount(0);

  await page.click("#partida-abrir");
  const dialog = page.locator("#partida-dialogo");
  await expect(dialog).toContainText(t("ui.run.notSaved"));
  await page.click("#partida-copiar");
  await expect(dialog).toContainText(t("ui.run.selected"));
  const selection = await page.evaluate(() => {
    const area = document.querySelector<HTMLTextAreaElement>("#partida-json");
    return area && area === document.activeElement
      ? area.value.slice(area.selectionStart, area.selectionEnd)
      : "";
  });
  expect(JSON.parse(selection)).toMatchObject({ seed: "pt-e2e-sin-guardar" });
  expect(JSON.parse(selection).inputs).toHaveLength(2);
});

test("a double click on an action spends one week, not two", async ({ page }) => {
  await startSeason(page, "peregrina", "pt-e2e-doble");
  const before = await readTurn(page);
  await page.dblclick("#accion-train-agility");
  await page.waitForFunction(
    ([key, n]) => {
      const saved = JSON.parse(localStorage.getItem(String(key)) ?? "null");
      return Array.isArray(saved?.inputs) && saved.inputs.length > Number(n);
    },
    [RUN_KEY, before.inputs],
  );
  // give a second input every chance to land before reading the run
  await page.waitForTimeout(300);
  const after = await readTurn(page);
  expect(after.inputs).toBe(before.inputs + 1);
  // the second click does not close «Lo que pasó», which the first one opened
  expect(after.weekOpen).toBe(true);
  await closeWeek(page);
  const read = await readTurn(page);
  expect(read.week === 2 || read.eventOpen).toBe(true);
});

test("starting another season says it replaces the saved one and offers to copy it first", async ({
  page,
}) => {
  await startSeason(page, "caracara", "pt-e2e-reemplazo");
  await decide(page, "#accion-rest", (await readTurn(page)).inputs);
  const saved = await page.evaluate((key) => localStorage.getItem(key), RUN_KEY);
  await page.goto("#inicio");
  await page.click("#inicio-nueva");
  const notice = page.getByText(textPattern("ui.saved.replace.start"));
  await expect(notice).toBeVisible();
  await page.click("#nueva-copiar-guardada");
  await expect(page.getByText(t("ui.saved.copied"))).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(JSON.parse(copied)).toEqual(JSON.parse(saved ?? "null"));
  // the load dialog no longer warns about a run this page already copied
  await page.goto("#inicio");
  await page.click("#inicio-cargar");
  await expect(page.locator("#cargar-dialogo")).toBeVisible();
  await expect(page.getByText(textPattern("ui.saved.replace.load"))).toHaveCount(0);
});
