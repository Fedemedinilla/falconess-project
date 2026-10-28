import { expect, t, test, textPattern } from "./fixtures";
import { closeWeek, decide, readTurn, startSeason } from "./play";

/**
 * «Lo que pasó»: after every input a modal says what happened (headline, changes with their
 * causes, notes), over an inert page, until the player reads it (Continuar, Enter, Esc, a click
 * outside). The seeds are Peregrina's with ruleset v1: in "pt-e2e-semana-0" the first agility
 * training goes well, in "pt-e2e-semana-11" it fails, in "pt-e2e-semana-1" the second one leaves
 * an event (boneyard-botch-1) waiting.
 */

const DIALOG = "#semana-dialogo";

test("a training on a phone: one headline, the changes, no scrolling; Enter closes it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await startSeason(page, "peregrina", "pt-e2e-semana-0");
  const before = await readTurn(page);
  const train = page.locator("#accion-train-agility");
  await decide(page, "#accion-train-agility", before.inputs);

  // a modal labelled by its headline, focus on «Continuar», the page behind inert
  const dialog = page.getByRole("dialog", { name: t("ui.week.title.train-ok") });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  expect(await dialog.evaluate((d) => d.matches(":modal"))).toBe(true);
  await expect(page.locator("#semana-continuar")).toBeFocused();
  await expect(dialog).toContainText(
    t("ui.week.eyebrow", { turn: 1, action: t("action.train:agility") }),
  );
  await expect(dialog.getByRole("list", { name: t("ui.turn.stats") })).toContainText(
    t("stat.agility"),
  );
  const changes = dialog.getByRole("list", { name: t("ui.week.changes") });
  await expect(changes).toContainText(t("ui.week.vigor"));
  await expect(changes).toContainText("−20");
  await expect(changes).toContainText(t("ui.week.cause.training"));
  // no motion when the viewer asks for none
  expect(await dialog.evaluate((d) => getComputedStyle(d).animationDuration)).toBe("0s");

  // a normal week fits a 390 × 700 screen: no scrolling inside, nothing outside the viewport
  const fit = await dialog.evaluate((d) => {
    const body = d.querySelector("#semana-cambios");
    const box = d.getBoundingClientRect();
    return {
      overflow: body ? body.scrollHeight - body.clientHeight : -1,
      top: box.top,
      bottom: box.bottom,
      height: window.innerHeight,
    };
  });
  expect(fit.overflow).toBe(0);
  expect(fit.top).toBeGreaterThanOrEqual(0);
  expect(fit.bottom).toBeLessThanOrEqual(fit.height);

  // nothing behind it can be used: the actions do not take clicks nor their keys 1–8
  await expect(page.locator("#accion-rest").click({ trial: true, timeout: 300 })).rejects.toThrow();
  await page.keyboard.press("8");
  expect((await readTurn(page)).inputs).toBe(before.inputs + 1);

  // Enter closes it and the focus goes back to the training
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(train).toBeFocused();

  // the recap line above the actions says it in one line, and opens it again
  const recap = page.locator("#turno-semana-pasada");
  await expect(recap).toContainText(t("ui.turn.feedback.ok"));
  await page.click("#turno-ver-semana");
  await expect(dialog).toBeVisible();
  // a click on its text keeps the focus inside: Enter still closes it
  await dialog.locator("h2").click();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(page.locator("#turno-ver-semana")).toBeFocused();
});

test("a failed training says so in red; the button closes it and the focus comes back", async ({
  page,
}) => {
  await startSeason(page, "peregrina", "pt-e2e-semana-11");
  await decide(page, "#accion-train-agility", (await readTurn(page)).inputs);
  const dialog = page.getByRole("dialog", { name: t("ui.week.title.train-fail") });
  await expect(dialog).toBeVisible();
  // half the gain is lost: the stats go down
  await expect(dialog.getByRole("list", { name: t("ui.turn.stats") })).toContainText("−");
  const mood = dialog
    .getByRole("list", { name: t("ui.week.changes") })
    .getByText(t("ui.week.cause.fail"));
  if ((await mood.count()) > 0) await expect(mood).toBeVisible();
  await page.click("#semana-continuar");
  await expect(dialog).toBeHidden();
  await expect(page.locator("#accion-train-agility")).toBeFocused();
  await expect(page.locator("#turno-semana-pasada")).toContainText(t("ui.turn.feedback.fail"));
});

test("the week's result first, then its event; Esc and a click outside close them", async ({
  page,
}) => {
  await startSeason(page, "peregrina", "pt-e2e-semana-1");
  await decide(page, "#accion-train-agility", (await readTurn(page)).inputs);
  await closeWeek(page);
  await decide(page, "#accion-train-agility", (await readTurn(page)).inputs);

  // the training's result, with word of the event that waits behind it
  const week = page.locator(`${DIALOG}[open]`);
  await expect(week).toBeVisible();
  await expect(week).toContainText(t("ui.week.eventNext"));
  await expect(page.locator("#evento-dialogo[open]")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(week).toHaveCount(0);

  // then the event; its answer gets its own «Lo que pasó»
  await expect(page.locator("#evento-dialogo[open]")).toBeVisible();
  await decide(page, "#evento-opcion-0", (await readTurn(page)).inputs);
  const answer = page.getByRole("dialog", { name: textPattern("ui.week.title.event") });
  await expect(answer).toBeVisible();
  await expect(answer).toContainText(t("ev.boneyard-botch-1"));
  await expect(page.locator("#semana-continuar")).toBeFocused();

  // a click on the dimmed page closes it; the focus goes to the week's action
  await page.mouse.click(4, 4);
  await expect(answer).toBeHidden();
  await expect(page.getByTitle(t("ui.top.week.long", { turn: 3, turns: 48 }))).toBeAttached();
  await expect(page.locator("#accion-train-agility")).toBeFocused();
});

test("an unread week opens again after a reload; once read, it does not", async ({ page }) => {
  await startSeason(page, "caracara", "pt-e2e-semana-0");
  await decide(page, "#accion-rest", (await readTurn(page)).inputs);
  await expect(page.locator(`${DIALOG}[open]`)).toBeVisible();

  const reopen = async () => {
    await page.reload();
    await page.goto("#inicio");
    await page.click("#inicio-continuar");
    await expect(page.locator("#turno-acciones")).toBeVisible();
  };
  await reopen();
  await expect(page.getByRole("dialog", { name: t("ui.week.title.rest") })).toBeVisible();
  await closeWeek(page);
  await reopen();
  await expect(page.locator(`${DIALOG}[open]`)).toHaveCount(0);
});
