import { expect, t, test, textPattern } from "./fixtures";
import { closeWeek, playerPlace } from "./play";

/**
 * Umamusume's tip after a goal race finished 3rd or worse. The run is the reference policy's
 * (rest when tired, else the lowest stat) for Caracara with seed "a", up to her T12 goal race on
 * the ridge: 7th of 8, goal met (7th or better), and the log shows a lower agility than the
 * winner's cost her time at cruise.
 */
const RUN = {
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
    { kind: "train:agility" },
    { kind: "train:simulator" },
    { kind: "event:choose", option: 0 },
    { kind: "train:risk-flight" },
    { kind: "event:choose", option: 0 },
    { kind: "rest" },
    { kind: "event:choose", option: 0 },
    { kind: "train:stamina" },
    { kind: "event:choose", option: 0 },
    { kind: "train:stamina" },
    { kind: "event:choose", option: 0 },
    { kind: "rest" },
    { kind: "event:choose", option: 0 },
    { kind: "train:stamina" },
    { kind: "event:choose", option: 0 },
    { kind: "train:technique" },
    { kind: "event:choose", option: 0 },
    { kind: "rest" },
    { kind: "train:simulator" },
    { kind: "event:choose", option: 0 },
    { kind: "train:agility" },
  ],
} as const;

const LEAD = t("ui.advice.lead.cruise", { name: "Caracara" });
const TRAIN = t("ui.advice.train").split("{stat}")[0]?.trim() ?? "";

test("a goal race finished 7th: «Lo que pasó» and the replay's «Por qué» say what to train", async ({
  page,
}) => {
  await page.goto("#inicio");
  await page.click("#inicio-cargar");
  await page.fill("#cargar-json", JSON.stringify(RUN));
  await page.click("#cargar-enviar");
  await expect(page).toHaveURL(/#temporada$/);

  // a loaded run whose last input ran the T12 race: «Lo que pasó» says 7th, goal met, and the tip
  const result = page.getByRole("dialog", {
    name: t("ui.week.title.race.met", { place: 7, field: 8 }),
  });
  await expect(result).toBeVisible();
  await expect(result.getByText(textPattern("ui.week.race.context"))).toBeVisible();
  const note = result.locator("#semana-consejo");
  await expect(note).toHaveAttribute("role", "note");
  await expect(note).toContainText(t("ui.advice.label"));
  const tip = note.locator("li").first();
  await expect(tip).toHaveAttribute("data-reason", "cruise");
  await expect(tip).toContainText(LEAD);
  // the stat comes after its emoji: "Quizás deberías entrenar ⚡Agilidad."
  await expect(tip.locator("p").first()).toContainText(TRAIN);
  await expect(tip.locator("p").first()).toContainText(`${t("stat.agility")}.`);
  // brief by default; the card's own switch adds what agility does
  const why = tip.locator("p").nth(1);
  await expect(why).toHaveText(/^Agilidad \d+ contra \d+: unos [\d,]+ s\.$/);
  await page.click("#semana-consejo-explicacion-completo");
  await expect(why).toContainText(t("ui.advice.how.cruise"));
  await page.click("#semana-consejo-explicacion-breve");
  await expect(why).not.toContainText(t("ui.advice.how.cruise"));
  // the switches are buttons inside the dialog: Enter on them switches, it does not close it
  await page.focus("#semana-consejo-explicacion-completo");
  await page.keyboard.press("Enter");
  await expect(why).toContainText(t("ui.advice.how.cruise"));
  await expect(result).toBeVisible();

  // "Ver carrera": the replay's «Por qué» opens with the same tip, once the race is over
  await page.click("#semana-ver-carrera");
  await expect(page).toHaveURL(/#carrera$/);
  await expect(page.locator("#carrera-consejo")).toHaveCount(0);
  await page.click("#carrera-meta");
  expect(await playerPlace(page)).toBe(7);
  const porque = page.locator("#carrera-consejo");
  await expect(porque).toContainText(LEAD);
  await expect(porque.locator("li").first()).toHaveAttribute("data-reason", "cruise");

  // any runner: the winner gets no tip, the last one gets hers (or is told there is none)
  await page.selectOption("#carrera-por-que", { index: 0 });
  await expect(page.locator("#carrera-consejo")).toHaveCount(0);
  await page.selectOption("#carrera-por-que", { index: 7 });
  await expect(page.locator("#carrera-consejo")).toBeVisible();
  await expect(
    page
      .locator("#carrera-consejo li")
      .first()
      .or(page.locator("#carrera-consejo").getByText(t("ui.advice.none"))),
  ).toBeVisible();

  // back on the season the week was read: «Lo que pasó» stays closed, also after a reload
  await page.click("#carrera-temporada");
  await expect(page).toHaveURL(/#temporada$/);
  await expect(page.locator("#turno-acciones")).toBeVisible();
  await expect(page.locator("#semana-dialogo[open]")).toHaveCount(0);
  await page.reload();
  await page.goto("#inicio");
  await page.click("#inicio-continuar");
  await expect(page.locator("#turno-acciones")).toBeVisible();
  await expect(page.locator("#semana-dialogo[open]")).toHaveCount(0);
});

/**
 * Peregrina rests every week (seed "fin2"): 7th in the T12 race, 8th in the T24 one, which needs
 * 6th or better and ends the season. SeasonEnd tells her what to train.
 */
const RESTING = {
  schemaVersion: 1,
  rulesetVersion: "v1",
  seed: "fin2",
  inputs: [
    {
      kind: "start",
      falconessId: "peregrina",
      hangar: ["shiden", "mule", "nimbus", "falke"],
      parents: [],
    },
    // r: rest, e: the first option of an event
    ...[..."rrererrrrererrerererrrrerrerrrrrr"].map((k) =>
      k === "r" ? { kind: "rest" } : { kind: "event:choose", option: 0 },
    ),
  ],
};

test("a goal race that ends the season: «Lo que pasó» over SeasonEnd, then what to train", async ({
  page,
}) => {
  await page.goto("#inicio");
  await page.click("#inicio-cargar");
  await page.fill("#cargar-json", JSON.stringify(RESTING));
  await page.click("#cargar-enviar");
  await expect(page).toHaveURL(/#fin$/);
  // the week that ended the season gets its «Lo que pasó» too, over SeasonEnd
  const week = page.getByRole("dialog", {
    name: t("ui.week.title.race.failed", { place: 8, field: 8 }),
  });
  await expect(week).toBeVisible();
  await expect(week.locator("#semana-consejo")).toBeVisible();
  await closeWeek(page);
  await expect(page.getByText(t("ui.end.failed", { turn: 24 }))).toBeVisible();
  const note = page.locator("#fin-consejo");
  await expect(note).toHaveAttribute("role", "note");
  await expect(note.locator("li")).toHaveCount(2);
  await expect(note.locator("li").first()).toHaveAttribute("data-reason", "cruise");
  await expect(note).toContainText(t("ui.advice.lead.cruise", { name: "Peregrina" }));
});
