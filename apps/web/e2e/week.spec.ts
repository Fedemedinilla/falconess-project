import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, t, test, textPattern } from "./fixtures";
import { closeWeek, decide, policyChoice, readTurn, startSeason, takeWeek, vigorOf } from "./play";

/**
 * «Lo que pasó»: after every input a modal says what happened (headline, changes with their
 * causes, notes), over an inert page, until the player reads it (Continuar, Enter, Esc, a click
 * outside). New seasons play ruleset v2, where a training at full vigor never fails: the failure
 * and the event are found by playing on (spam one training, or train and rest), so the scenes do
 * not hang on one seed's draws.
 */

const DIALOG = "#semana-dialogo";

/** The texts of the content's luck events (`auto: true`), read from the event files. */
function luckTexts(): Set<string> {
  const dir = fileURLToPath(new URL("../../../packages/content/events/", import.meta.url));
  const texts = new Set<string>();
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const event: { auto?: boolean; textKey: string } = JSON.parse(
      readFileSync(`${dir}${file}`, "utf8"),
    );
    if (event.auto === true) texts.add(t(event.textKey));
  }
  return texts;
}

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
  // vigor drains: −20 to 80, still rested
  const changes = dialog.getByRole("list", { name: t("ui.week.changes") });
  const vigor = changes.getByRole("listitem").filter({ hasText: t("ui.week.vigor") });
  await expect(vigor).toContainText("−20");
  await expect(vigor).toContainText("→ 80");
  await expect(vigor).toContainText(t("ui.week.cause.training"));
  await expect(vigor).toContainText(t("ui.turn.vigor.band.safe"));
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

test("a failed training says so in red, with the mood it cost and why; the focus comes back", async ({
  page,
}) => {
  // agility every week: vigor runs out and the failure curve catches her
  await startSeason(page, "peregrina", "pt-e2e-fallo");
  const failed = page
    .getByRole("dialog", { name: t("ui.week.title.train-fail") })
    .or(page.getByRole("dialog", { name: t("ui.week.title.injury") }));
  let found = false;
  for (let week = 0; week < 12 && !found; week++) {
    if (!(await takeWeek(page, "#accion-train-agility"))) break;
    found = (await failed.count()) > 0;
  }
  expect(found, "agility every week never failed").toBe(true);
  await expect(failed).toBeVisible();
  await expect(page.locator(DIALOG)).toHaveAttribute("data-tone", "bad");
  // part of the gain is lost: the stats go down
  await expect(failed.getByRole("list", { name: t("ui.turn.stats") })).toContainText("−");
  // the mood it cost, unless it was already at the bottom, says why in red
  const mood = failed
    .getByRole("list", { name: t("ui.week.changes") })
    .getByText(t("ui.week.cause.fail"));
  if ((await mood.count()) > 0) await expect(mood).toBeVisible();
  // the focus goes back to the training, unless an event of that week opens next
  const eventNext = (await failed.getByText(t("ui.week.eventNext")).count()) > 0;
  await page.click("#semana-continuar");
  await expect(failed).toBeHidden();
  if (eventNext) await expect(page.locator("#evento-dialogo[open]")).toBeVisible();
  else await expect(page.locator("#accion-train-agility")).toBeFocused();
});

test("the week's result first, then its event; Esc and a click outside close them", async ({
  page,
}) => {
  await startSeason(page, "peregrina", "pt-e2e-semana-1");
  // train until a week leaves an event waiting (rest when vigor runs low)
  const week = page.locator(`${DIALOG}[open]`);
  let action = "";
  for (let i = 0; i < 12; i++) {
    const view = await readTurn(page);
    action = vigorOf(view) <= 40 ? "#accion-rest" : "#accion-train-agility";
    await takeWeek(page, action);
    if ((await week.getByText(t("ui.week.eventNext")).count()) > 0) break;
  }

  // the week's result, with word of the event that waits behind it, next to «Continuar»
  await expect(week).toBeVisible();
  await expect(week.locator("footer #semana-evento-espera")).toContainText(t("ui.week.eventNext"));
  await expect(page.locator("#evento-dialogo[open]")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(week).toHaveCount(0);

  // then the event, with the focus on its title: a second Enter does not hide it unread
  const event = page.locator("#evento-dialogo[open]");
  await expect(event).toBeVisible();
  await expect(event.locator("h2")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(event).toBeVisible();
  const text = (await page.locator("#evento-texto").textContent()) ?? "";
  expect(text.length).toBeGreaterThan(0);
  await decide(page, "#evento-opcion-0", (await readTurn(page)).inputs);
  const answer = page.getByRole("dialog", { name: textPattern("ui.week.title.event") });
  await expect(answer).toBeVisible();
  await expect(answer).toContainText(text);
  await expect(page.locator("#semana-continuar")).toBeFocused();

  // a click on the dimmed page closes it; the focus goes to the week's action
  await page.mouse.click(4, 4);
  await expect(answer).toBeHidden();
  await expect(page.locator(action)).toBeFocused();
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

test("a luck event the week brought by itself: its text, what it did, good or bad news", async ({
  page,
}) => {
  // owner 2026-11-13: every event is paused in v3 (new seasons) until they are reworked
  test.skip(true, "events paused in v3 (owner 2026-11-13)");
  // v2's luck events apply on their own (no dialog): «Lo que pasó» is where the player reads them
  await startSeason(page, "peregrina", "pt-e2e-suerte");
  const block = page.locator("#semana-dialogo[open] #semana-evento");
  let found = false;
  for (let i = 0; i < 30 && !found; i++) {
    let view = await readTurn(page);
    if (view.weekOpen) {
      await closeWeek(page);
      view = await readTurn(page);
    }
    if (view.hash === "#fin") break;
    if (view.eventOpen) {
      await decide(page, "#evento-opcion-0", view.inputs);
      found = (await block.count()) > 0;
      continue;
    }
    await takeWeek(page, policyChoice(view));
    found = (await block.count()) > 0;
  }
  expect(found, "a v2 season brings a luck event within 30 weeks").toBe(true);
  await expect(block).toBeVisible();
  const tone = await block.getAttribute("data-tone");
  expect(["good", "bad", "warn", "neutral"]).toContain(tone);
  // one of the content's luck events, with what it did (every luck event has an effect)
  const text = ((await block.locator("p").first().textContent()) ?? "").trim();
  const luck = [...luckTexts()].find((x) => text.endsWith(x));
  expect(luck, `«${text}» is a luck event's text`).toBeDefined();
  await expect(block.locator("#semana-evento-efectos li").first()).toBeVisible();
  // the headline is still the week's own (an answer would say «Elegiste»)
  const answer = t("ui.week.title.event", { option: "" }).trim();
  await expect(page.locator("#semana-titulo")).not.toContainText(answer);
});
