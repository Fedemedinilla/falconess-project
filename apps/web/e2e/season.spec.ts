import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, t, test, textPattern } from "./fixtures";
import {
  closeWeek,
  decide,
  parsePlace,
  playerPlace,
  playReplayToEnd,
  playStep,
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

/** A seed per Falconess whose first goal the e2e policy passes (Peregrina's T10 asks for a win). */
const SEEDS = { peregrina: "pt-e2e-4", caracara: "pt-e2e-1", cernicala: "pt-e2e-1" } as const;
const FALCONESS = ["peregrina", "caracara", "cernicala"] as const;
/** Each one's first goal race: Peregrina's is T10 (ADR-0014), the others' T12. */
const FIRST = { peregrina: 10, caracara: 12, cernicala: 12 } as const;
const TIMING_DIR = fileURLToPath(new URL("../../../.work/ui/timing/", import.meta.url));

for (const falconessId of FALCONESS) {
  test(`${falconessId}: a whole season by clicks, with the T12 goal race replayed`, async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await startSeason(page, falconessId, SEEDS[falconessId]);
    const first = FIRST[falconessId];

    // weeks 1–11, then week 12's action, which runs the T12 race
    const times: number[] = [];
    const t0 = Date.now();
    const toRace =
      (await playUntil(page, (v) => v.week === first && !v.eventOpen, times)) +
      (await playStep(page).then(() => 1));
    const toRaceMs = Date.now() - t0;
    const afterRace = await readTurn(page);
    expect(afterRace.hash, "the season must pass its first goal race").toBe("#temporada");

    // «Lo que pasó» opens over the page with the result the season recorded; an event waits
    const week = page.getByRole("dialog", { name: textPattern("ui.week.title.race.met") });
    await expect(week).toBeVisible();
    await expect(week).toContainText(t("ui.week.eyebrow", { turn: first, action: "" }).trim());
    const recorded = parsePlace((await week.locator("h2").textContent()) ?? "");
    expect(afterRace.weekOpen).toBe(true);
    expect(afterRace.eventOpen).toBe(false);

    // "Ver carrera" → the replay of that very race, rebuilt with detail "full"
    await page.click("#semana-ver-carrera");
    await expect(page).toHaveURL(/#carrera$/);
    await expect(page.getByText(t("ui.goalRace.eyebrow", { turn: first }))).toBeVisible();
    // the recorded place would give the race away: it waits for the finish
    const recordedText = t("ui.goalRace.recorded", { place: recorded.place, n: recorded.field })
      .replace(/[.*+?^$()|[\]\\]/g, "\\$&")
      .replace("{time}", "[0-9.,]+");
    const recordedPill = page.getByText(new RegExp(`^${recordedText}$`));
    await expect(recordedPill).toHaveCount(0);
    await expect(page.getByText(t("ui.goalRace.mismatch"))).toHaveCount(0);
    await expect(page.getByText(t("ui.race.pending"))).toBeVisible();
    // new seasons race on v3: the side view of the flight, its pre-race card and her moments
    const flight = page.locator("#carrera-vuelo");
    await expect(flight).toBeVisible();
    await expect(page.locator("#carrera-vuelo-tarjeta")).toContainText(t("ui.flight.pre.kicker"));
    await expect(page.locator("#carrera-vuelo-tarjeta")).toContainText(t("ui.flight.pre.distance"));
    const moments = page.locator("#carrera-momentos");
    const takeoff = moments.locator('[data-moment="takeoff"], [data-moment="takeoffLow"]').first();
    await expect(takeoff).toBeVisible();
    // a dive from the list (else a takeoff): the replay seeks to it, plays, and the banner names it
    const dives = moments.locator('[data-moment="dive"], [data-moment="grandDive"]');
    const dive = (await dives.count()) > 0;
    await (dive ? dives.first() : takeoff).getByRole("button").click();
    await expect(page.locator("#carrera-vuelo-tarjeta")).toHaveCount(0);
    await expect(flight).toHaveAttribute(
      "data-banner",
      dive ? /^(dive|grandDive|skillDive)$/ : /^takeoff(Low)?$/,
      { timeout: 15_000 },
    );
    await page.click("#carrera-reproducir");
    const r0 = Date.now();
    const replayPlace = await playReplayToEnd(page, "carrera");
    const replayMs = Date.now() - r0;
    expect(replayPlace, "the replay's classification matches the season's record").toBe(
      recorded.place,
    );
    await expect(recordedPill).toBeVisible();
    await expect(page.getByRole("heading", { name: t("ui.race.why.title") })).toBeVisible();

    // back to the season: «Lo que pasó» was read and stays closed (a waiting event opens now);
    // the goals panel opens the same race
    await page.click("#carrera-temporada");
    await expect(page).toHaveURL(/#temporada$/);
    const back = await readTurn(page);
    expect(back.weekOpen).toBe(false);
    let answered = 0;
    if (back.eventOpen) {
      await decide(page, "#evento-opcion-0", back.inputs);
      await closeWeek(page);
      answered = 1;
    }
    await page.click(`#metas-ver-${first}`);
    await expect(page.getByText(t("ui.goalRace.eyebrow", { turn: first }))).toBeVisible();
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
    await page.click(`#fin-ver-${first}`);
    await expect(page).toHaveURL(/#carrera$/);
    await expect(page.getByText(t("ui.goalRace.eyebrow", { turn: first }))).toBeVisible();
    await page.click("#carrera-meta");
    expect(await playerPlace(page)).toBe(recorded.place);
    await page.click("#carrera-temporada");
    await expect(page).toHaveURL(/#fin$/);

    const decisions = toRace + answered + toEnd;
    const seasonMs = toRaceMs + toEndMs;
    const timing = {
      falconessId,
      seed: SEEDS[falconessId],
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
