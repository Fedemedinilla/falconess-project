import type { Page } from "@playwright/test";
import { expect, t, test } from "./fixtures";
import { closeWeek, decide, readTurn, startSeason, takeWeek, vigorOf } from "./play";

/**
 * Ruleset v2 on the Turn screen (ADR-0006): vigor is a bar that drains, colored and named by its
 * risk band; every training says its failure chance (and its injury chance) before the click; a
 * training streak is said above the cards and, when it costs mood, in «Lo que pasó».
 *
 * The chances are checked against v2's failure curve written out here as an independent oracle
 * (0 with vigor 60 or more, then 60 % × ((60 − vigor) / 60)², one floor; the risk flight adds
 * 12 %, the simulator takes half; with vigor 20 or less, or on a risk flight, a quarter of the
 * failures are injuries), and the bands against their edges: ≥ 60, 40–59, 21–39, ≤ 20.
 */

type Band = "safe" | "low" | "high" | "injury";

function bandOf(vigor: number): Band {
  if (vigor >= 60) return "safe";
  if (vigor <= 20) return "injury";
  return vigor >= 40 ? "low" : "high";
}

type Kind = "agility" | "risk-flight" | "simulator";

function risk(vigor: number, kind: Kind): { fail: number; injury: number } {
  const x = Math.max(0, 60 - vigor);
  const curve = Math.floor((600 * x * x) / 3600);
  const fail =
    kind === "simulator"
      ? Math.floor((600 * 500 * x * x) / (3600 * 1000))
      : kind === "risk-flight"
        ? 120 + curve
        : curve;
  const injury = kind === "risk-flight" || vigor <= 20 ? Math.floor((fail * 250) / 1000) : 0;
  return { fail, injury };
}

/** "6,6" for 66 ‰, "15" for 150 ‰ (the page writes chances that way). */
const percent = (pm: number) =>
  pm % 10 === 0 ? String(pm / 10) : `${Math.floor(pm / 10)},${pm % 10}`;

const card = (page: Page, kind: string) =>
  page.locator("li", { has: page.locator(`#accion-${kind}`) });

/** The bar's band and each training's chance agree with the vigor the meter reads. */
async function checkVigor(page: Page): Promise<{ vigor: number; band: Band }> {
  const vigor = vigorOf(await readTurn(page));
  const band = bandOf(vigor);
  const note = page.locator("#turno-vigor-nota");
  await expect(note).toContainText(t(`ui.turn.vigor.band.${band}`));
  await expect(page.locator(`[data-band="${band}"]`)).toHaveCount(1);
  for (const kind of ["agility", "risk-flight", "simulator"] as const) {
    const { fail, injury } = risk(vigor, kind);
    const footer = card(page, `train-${kind}`);
    if (fail === 0)
      await expect(footer, `${kind} at ${vigor}`).toContainText(t("ui.action.noFail"));
    else
      await expect(footer, `${kind} at ${vigor}`).toContainText(
        new RegExp(`Fallo ${percent(fail)}\\s%`),
      );
    if (injury > 0)
      await expect(footer, `${kind} at ${vigor}`).toContainText(
        new RegExp(`Lesión ${percent(injury)}\\s%`),
      );
    const level =
      fail === 0
        ? "none"
        : fail >= 250 || (kind !== "risk-flight" && injury > 0)
          ? "danger"
          : fail >= 100
            ? "high"
            : "low";
    await expect(footer).toHaveAttribute("data-risk", level);
  }
  return { vigor, band };
}

test("vigor drains with training: its band, its color and every training's chance", async ({
  page,
}) => {
  await startSeason(page, "peregrina", "pt-e2e-vigor-2");
  const view = await readTurn(page);
  expect(vigorOf(view)).toBe(100);
  await expect(page.locator("#turno-vigor-nota")).toContainText(
    t("ui.turn.vigor.note.safe", { safe: 60 }),
  );
  // rest gives back a drawn 30, 50 or 70; an outing 20 and a point of mood; no forced rest
  await expect(card(page, "rest")).toContainText("+30 a +70");
  await expect(card(page, "outing")).toContainText("+20");
  await expect(page.getByText(t("ui.action.forcedRest"))).toHaveCount(0);
  // the mood's weight on training and on races
  await expect(page.locator("#turno-animo-nota")).toHaveText(
    t("ui.turn.mood.mult", { train: "1,00", race: "1,00" }),
  );

  const seen = new Set<Band>([(await checkVigor(page)).band]);
  // agility −20, a risk flight −30, then agility until the bar is nearly empty
  for (const kind of ["agility", "risk-flight", "agility", "agility"]) {
    await takeWeek(page, `#accion-train-${kind}`);
    await closeWeek(page);
    const view = await readTurn(page);
    if (view.eventOpen) {
      await decide(page, "#evento-opcion-0", view.inputs);
      await closeWeek(page);
    }
    const { vigor, band } = await checkVigor(page);
    seen.add(band);
    // a week with the bar in the red: the trainings' cards turn red too
    if (vigor <= 20) {
      await expect(card(page, "train-stamina")).toHaveAttribute("data-risk", "danger");
      await expect(page.locator("#turno-vigor-nota")).toContainText(t("ui.turn.vigor.note.injury"));
    }
  }
  expect([...seen].sort()).toEqual(["high", "injury", "low", "safe"]);
});

test("a training streak: said above the cards, then «Lo que pasó» says she is tired of it", async ({
  page,
}) => {
  await startSeason(page, "peregrina", "pt-e2e-racha");
  const name = t("falconess.peregrina");
  const tired = t("ui.week.cause.drift", { name });
  const notice = page.locator("#turno-racha");
  let noticed = false;
  let drifted = false;
  for (let week = 0; week < 11 && !drifted; week++) {
    // the notice shows once two trainings in a row make the next drift likelier
    const view = await readTurn(page);
    if (!view.weekOpen && !view.eventOpen && (await notice.count()) > 0) {
      await expect(notice).toContainText(name);
      await expect(notice).toContainText(/lleva \d+ semanas seguidas entrenando/);
      noticed = true;
    }
    if (!(await takeWeek(page, "#accion-train-simulator"))) break;
    const mood = page
      .locator("#semana-dialogo[open]")
      .getByRole("list", { name: t("ui.week.changes") })
      .getByRole("listitem")
      .filter({ hasText: t("ui.turn.mood") });
    if ((await mood.getByText(tired).count()) > 0) {
      drifted = true;
      await expect(mood).toContainText("−1");
      await expect(mood.getByText(tired)).toBeVisible();
      break;
    }
    // read the week, answer its event: the Turn screen is in view again
    await closeWeek(page);
    const next = await readTurn(page);
    if (next.eventOpen) {
      await decide(page, "#evento-opcion-0", next.inputs);
      await closeWeek(page);
    }
  }
  expect(noticed, "the streak notice never showed").toBe(true);
  expect(drifted, "eleven simulator weeks in a row never lowered her mood").toBe(true);
  // the log says it too, in the game's words
  await closeWeek(page);
  await expect(page.locator("#turno-acciones")).toBeVisible();
  await expect(page.getByText(t("log.mood.drift")).first()).toBeVisible();
});
