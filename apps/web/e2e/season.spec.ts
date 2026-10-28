import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, t, test, textPattern } from "./fixtures";
import {
  decide,
  parsePlace,
  playerPlace,
  playReplayToEnd,
  playUntil,
  readTurn,
  startSeason,
} from "./play";

/**
 * A whole season of each Falconess with a fixed seed, played by clicking: the T12 goal race is
 * run, passed and replayed (its classification must match the place the season recorded), then
 * the season is played to its end and SeasonEnd opens that race again. Each test writes how long
 * the clicks took to .work/ui/timing/.
 */

const SEED = "pt-e2e-1";
const FALCONESS = ["peregrina", "caracara", "cernicala"] as const;
const TIMING_DIR = fileURLToPath(new URL("../../../.work/ui/timing/", import.meta.url));

for (const falconessId of FALCONESS) {
  test(`${falconessId}: a whole season by clicks, with the T12 goal race replayed`, async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await startSeason(page, falconessId, SEED);

    // weeks 1–12 and the T12 race: until the week after it (or its event, still in week 12)
    const times: number[] = [];
    const t0 = Date.now();
    const toRace = await playUntil(
      page,
      (v) => (v.week ?? 0) > 12 || (v.week === 12 && v.eventOpen),
      times,
    );
    const toRaceMs = Date.now() - t0;
    const afterRace = await readTurn(page);
    expect(afterRace.hash, "the season must pass the T12 goal race").toBe("#temporada");

    // the result the season recorded, on the Turn screen
    const result = page.locator('section[aria-labelledby="turno-resultado"]');
    await expect(result).toBeVisible();
    await expect(result).toContainText(t("ui.result.eyebrow", { turn: 12 }));
    await expect(result).toContainText(t("ui.result.met"));
    const recorded = parsePlace((await result.locator("dd").first().textContent()) ?? "");
    // the week of a race takes the page to its result, which sits above the actions
    if (!afterRace.eventOpen) await expect(result).toBeInViewport();
    if (afterRace.eventOpen) await page.keyboard.press("Escape"); // hide the event, answer later

    // "Ver carrera" → the replay of that very race, rebuilt with detail "full"
    await page.click("#turno-ver-carrera");
    await expect(page).toHaveURL(/#carrera$/);
    await expect(page.getByText(t("ui.goalRace.eyebrow", { turn: 12 }))).toBeVisible();
    // the recorded place would give the race away: it waits for the finish
    const recordedText = t("ui.goalRace.recorded", { place: recorded.place, n: recorded.field })
      .replace(/[.*+?^$()|[\]\\]/g, "\\$&")
      .replace("{time}", "[0-9.,]+");
    const recordedPill = page.getByText(new RegExp(`^${recordedText}$`));
    await expect(recordedPill).toHaveCount(0);
    await expect(page.getByText(t("ui.goalRace.mismatch"))).toHaveCount(0);
    await expect(page.getByText(t("ui.race.pending"))).toBeVisible();
    await page.selectOption("#carrera-pronostico", { index: 1 });
    const r0 = Date.now();
    const replayPlace = await playReplayToEnd(page, "carrera");
    const replayMs = Date.now() - r0;
    expect(replayPlace, "the replay's classification matches the season's record").toBe(
      recorded.place,
    );
    await expect(recordedPill).toBeVisible();
    await expect(
      page
        .getByText(textPattern("ui.race.guess.right"))
        .or(page.getByText(textPattern("ui.race.guess.wrong"))),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: t("ui.race.why.title") })).toBeVisible();

    // back to the season; the goals panel opens the same race
    await page.click("#carrera-temporada");
    await expect(page).toHaveURL(/#temporada$/);
    const back = await readTurn(page);
    let answered = 0;
    if (back.eventOpen) {
      await decide(page, "#evento-opcion-0", back.inputs);
      answered = 1;
    }
    await page.click("#metas-ver-12");
    await expect(page.getByText(t("ui.goalRace.eyebrow", { turn: 12 }))).toBeVisible();
    await page.click("#carrera-meta");
    expect(await playerPlace(page)).toBe(recorded.place);
    await page.click("#carrera-temporada");
    await expect(page).toHaveURL(/#temporada$/);

    // on to the season's end
    const t1 = Date.now();
    const toEnd = await playUntil(page, () => false, times);
    const toEndMs = Date.now() - t1;
    await expect(page).toHaveURL(/#fin$/);
    await expect(page.getByRole("heading", { name: t("ui.screen.seasonEnd.title") })).toBeVisible();
    const end = await readTurn(page);
    const completed = await page.getByText(t("ui.end.completed")).count();
    if (completed === 0) await expect(page.getByText(textPattern("ui.end.failed"))).toBeVisible();

    // SeasonEnd opens the T12 race again: same place
    await page.click("#fin-ver-12");
    await expect(page).toHaveURL(/#carrera$/);
    await expect(page.getByText(t("ui.goalRace.eyebrow", { turn: 12 }))).toBeVisible();
    await page.click("#carrera-meta");
    expect(await playerPlace(page)).toBe(recorded.place);
    await page.click("#carrera-temporada");
    await expect(page).toHaveURL(/#fin$/);

    const decisions = toRace + answered + toEnd;
    const seasonMs = toRaceMs + toEndMs;
    const timing = {
      falconessId,
      seed: SEED,
      ended: completed > 0 ? "completed" : "goal-failed",
      inputs: end.inputs,
      decisions,
      seasonMs,
      msPerDecision: Math.round(seasonMs / decisions),
      slowestDecisionMs: Math.max(...times),
      t12: { place: recorded.place, field: recorded.field, replayAtX8Ms: replayMs },
    };
    test.info().annotations.push({ type: "timing", description: JSON.stringify(timing) });
    mkdirSync(TIMING_DIR, { recursive: true });
    writeFileSync(`${TIMING_DIR}${falconessId}.json`, `${JSON.stringify(timing, null, 2)}\n`);
    console.log(`[timing] ${JSON.stringify(timing)}`);
  });
}
