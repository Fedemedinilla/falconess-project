import type { Page } from "@playwright/test";
import { expect, t, test } from "./fixtures";
import { closeWeek, playUntil, RACE_WEEK, RUN_KEY, startSeason } from "./play";

/**
 * The pre-race position card (ADR-0008): on a goal race week and in the free race, her wings'
 * position is preselected and says so; a tap picks another, the week's action (or «Correr la
 * carrera») confirms it, and the result and the replay say which one she ran in.
 */

const POSITIONS = ["lead", "pack", "stalk", "closer"] as const;
type Position = (typeof POSITIONS)[number];

/** The option the card shows as chosen, and the one labelled as her wings'. */
async function card(page: Page, id: string): Promise<{ chosen: Position; wings: Position }> {
  const options = page.locator(`#${id} label[data-position]`);
  await expect(options).toHaveCount(4);
  let chosen: Position | undefined;
  let wings: Position | undefined;
  for (const p of POSITIONS) {
    const option = page.locator(`#${id} label[data-position="${p}"]`);
    await expect(option).toContainText(t(`position.${p}`));
    await expect(option).toContainText(t(`position.${p}.brief`));
    if (await page.locator(`#${id}-${p}`).isChecked()) chosen = p;
    if ((await option.getByText(t("ui.position.wings"), { exact: true }).count()) > 0) wings = p;
  }
  if (!chosen || !wings) throw new Error(`#${id}: no chosen or no wings' option`);
  return { chosen, wings };
}

async function lastInput(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate((key) => {
    const saved = JSON.parse(localStorage.getItem(key) ?? "null");
    return saved.inputs[saved.inputs.length - 1];
  }, RUN_KEY);
}

test("a race week: her wings' position comes chosen; another one goes with the week's action", async ({
  page,
}) => {
  await page.goto("#inicio");
  await page.click("#inicio-cargar");
  await page.fill("#cargar-json", JSON.stringify(RACE_WEEK));
  await page.click("#cargar-enviar");
  await expect(page).toHaveURL(/#temporada$/);
  const week = page.locator("#semana-dialogo[open]");
  if ((await week.count()) > 0) await closeWeek(page);

  // the card sits under the race week's notice: four options, her wings' one chosen and labelled
  await expect(page.locator("#turno-posicion")).toBeVisible();
  const before = await card(page, "turno-posicion");
  expect(before.chosen).toBe(before.wings);
  const other: Position = before.wings === "lead" ? "closer" : "lead";

  // one tap chooses; the wings' label stays where it was
  await page.click(`label[for="turno-posicion-${other}"]`);
  await expect(page.locator(`#turno-posicion-${other}`)).toBeChecked();
  const after = await card(page, "turno-posicion");
  expect(after).toEqual({ chosen: other, wings: before.wings });
  // the digit keys of the actions are left alone while a radio has the focus
  await page.focus(`#turno-posicion-${other}`);
  await page.keyboard.press("1");
  await expect(page.locator("#semana-dialogo[open]")).toHaveCount(0);

  // the week's action confirms it: the input carries the position, the result names it
  await page.click("#accion-train-agility");
  await expect(week).toBeVisible();
  expect(await lastInput(page)).toEqual({ kind: "train:agility", position: other });
  const ran = week.locator("#semana-posicion");
  await expect(ran).toHaveAttribute("data-position", other);
  await expect(ran).toHaveText(t(`position.${other}`));

  // the replay of that race says it too, and matches what the season recorded
  await page.click("#semana-ver-carrera");
  await expect(page).toHaveURL(/#carrera$/);
  await expect(page.getByText(t("ui.goalRace.mismatch"))).toHaveCount(0);
  const status = page.locator("#carrera-corre-en");
  await expect(status).toHaveAttribute("data-position", other);
  await expect(status).toContainText(
    t("ui.race.position.chosen", {
      name: "Caracara",
      position: t(`position.${other}`),
      wings: t(`position.${before.wings}`),
    }),
  );

  // the next week has no race: no card
  await page.click("#carrera-temporada");
  await expect(page).toHaveURL(/#temporada$/);
  await expect(page.locator("#turno-acciones")).toBeVisible();
  await expect(page.locator("#turno-posicion")).toHaveCount(0);
});

test("a race week: tapping her wings' position again is no choice, and the input stays bare", async ({
  page,
}) => {
  await page.goto("#inicio");
  await page.click("#inicio-cargar");
  await page.fill("#cargar-json", JSON.stringify(RACE_WEEK));
  await page.click("#cargar-enviar");
  const week = page.locator("#semana-dialogo[open]");
  if ((await week.count()) > 0) await closeWeek(page);
  const { wings } = await card(page, "turno-posicion");
  const other: Position = wings === "pack" ? "stalk" : "pack";
  await page.click(`label[for="turno-posicion-${other}"]`);
  await page.click(`label[for="turno-posicion-${wings}"]`);
  await expect(page.locator(`#turno-posicion-${wings}`)).toBeChecked();
  await page.click("#accion-rest");
  await expect(week).toBeVisible();
  expect(await lastInput(page)).toEqual({ kind: "rest" });
  await expect(week.locator("#semana-posicion")).toHaveAttribute("data-position", wings);
});

test("free race: pick a position on the folded card, run, see it in the summary and the replay", async ({
  page,
}) => {
  await page.goto("#carrera-libre");
  await expect(page.locator("#libre-form")).toBeHidden();
  // folded after the default race: the card and «Correr la carrera» stay in reach
  await expect(page.locator("#libre-posicion")).toBeVisible();
  await expect(page.locator("#libre-correr")).toBeVisible();
  const { chosen, wings } = await card(page, "libre-posicion");
  expect(chosen).toBe(wings);
  await expect(page.locator("#libre-corre-en")).toHaveAttribute("data-position", wings);
  await expect(page.locator("#libre-corre-en")).toContainText(
    t("ui.race.position.wings", { name: "Peregrina", position: t(`position.${wings}`) }),
  );

  const other: Position = wings === "lead" ? "pack" : "lead";
  await page.click(`label[for="libre-posicion-${other}"]`);
  await page.click("#libre-correr");
  const summary = t("ui.freeRace.summary.position", { position: t(`position.${other}`) });
  await expect(page.getByText(summary, { exact: false })).toBeVisible();
  await expect(page.locator("#libre-corre-en")).toHaveAttribute("data-position", other);
  await page.click("#libre-desarrollo summary");
  await expect(page.locator("#libre-desarrollo code")).toContainText(`--position ${other}`);
  await page.click("#libre-meta");
  await expect(page.getByRole("table", { name: t("ui.race.result.title") })).toBeVisible();

  // her wings' one again: no position in the race's arguments
  await page.click(`label[for="libre-posicion-${wings}"]`);
  await page.click("#libre-correr");
  await expect(page.locator("#libre-corre-en")).toHaveAttribute("data-position", wings);
  await expect(page.locator("#libre-desarrollo code")).not.toContainText("--position");
});

for (const width of [360, 430]) {
  test(`on a ${width} px phone the race week's card fits: four 44 px targets, no sideways scroll`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("#inicio");
    await page.click("#inicio-cargar");
    await page.fill("#cargar-json", JSON.stringify(RACE_WEEK));
    await page.click("#cargar-enviar");
    const week = page.locator("#semana-dialogo[open]");
    if ((await week.count()) > 0) await closeWeek(page);
    await expect(page.locator("#turno-posicion")).toBeVisible();
    for (const p of POSITIONS) {
      const box = await page.locator(`label[for="turno-posicion-${p}"]`).boundingBox();
      if (!box) throw new Error(`no box for ${p}`);
      expect(box.height, p).toBeGreaterThanOrEqual(44);
      expect(box.width, p).toBeGreaterThanOrEqual(44);
      expect(box.x, p).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, p).toBeLessThanOrEqual(width);
    }
    const scroll = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scroll).toBeLessThanOrEqual(width);
  });
}

test("a v3 race week: the card names the distance, her letter and her passive; the workshop has no repair", async ({
  page,
}) => {
  await startSeason(page, "peregrina", "pt-e2e-v3-taller");
  await playUntil(page, (v) => v.week !== undefined && v.week >= 12 && !v.eventOpen);
  await expect(page.locator("#turno-posicion")).toBeVisible();
  const distance = page.locator("#turno-distancia");
  await expect(distance).toHaveAttribute("data-distance", /^(sprint|mile|medium|long)$/);
  await expect(page.locator("#turno-pasiva")).toContainText(t("skill.talon-lock"));

  // the workshop on v3: skills and the wings' look, no repair, no parts
  await page.click("#accion-workshop");
  await expect(page.locator("#taller")).toBeVisible();
  await expect(page.locator("#taller-alas-neutras")).toBeVisible();
  await expect(page.locator("#taller-reparar")).toHaveCount(0);
  await expect(page.locator("#taller-piezas-explicacion")).toHaveCount(0);
  await expect(
    page.locator("#taller legend", { hasText: t("ui.workshop.skills") }).first(),
  ).toBeVisible();
  await expect(page.locator('[id^="taller-bastidor-"]').first()).toBeAttached();
  await page.click("#taller-volver");
});
