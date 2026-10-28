/**
 * A tester's hands: start a season and play it by clicking, with a simple policy (answer events
 * with the first option, rest when tired, else train the lowest stat). Everything is read from
 * the page (meters, the timing bar, the open dialog); the save in localStorage is only used to
 * know that a click went through.
 */
import { expect, type Page } from "@playwright/test";
import { t } from "./fixtures";

export const RUN_KEY = "falconess.pruebas.partida";

export const STATS = ["agility", "stamina", "technique", "courage", "intelligence"] as const;
export type Stat = (typeof STATS)[number];

/** The training whose main stat is each stat (ruleset v1 TRAINING_STAT), as action button ids. */
const TRAINING_BUTTON: Readonly<Record<Stat, string>> = {
  agility: "#accion-train-agility",
  stamina: "#accion-train-stamina",
  technique: "#accion-train-technique",
  courage: "#accion-train-risk-flight",
  intelligence: "#accion-train-simulator",
};

/** Fatigue from which the policy rests (the Turn screen turns the bar amber there). */
export const TIRED_AT = 60;

export type TurnView = {
  readonly hash: string;
  /** The week in the timing bar, if a season is in play and not ended. */
  readonly week: number | undefined;
  readonly eventOpen: boolean;
  /** Stats by their game name, and fatigue under "Fatiga" (the hidden meters of the Turn screen). */
  readonly meters: Readonly<Record<string, number>>;
  /** Inputs of the saved run (start included); -1 without a save. */
  readonly inputs: number;
};

/** One read of the page: what the policy needs to decide. */
export async function readTurn(page: Page): Promise<TurnView> {
  return page.evaluate((key) => {
    let week: number | undefined;
    for (const el of document.querySelectorAll("header [title]")) {
      const m = /^Semana (\d+) de \d+$/.exec(el.getAttribute("title") ?? "");
      if (m) week = Number(m[1]);
    }
    const meters: Record<string, number> = {};
    for (const m of document.querySelectorAll("meter"))
      meters[m.getAttribute("aria-label") ?? ""] = m.value;
    let inputs = -1;
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
      if (saved && typeof saved === "object" && "inputs" in saved && Array.isArray(saved.inputs))
        inputs = saved.inputs.length;
    } catch {
      inputs = -1;
    }
    return {
      hash: location.hash,
      week,
      eventOpen: document.querySelector("#evento-dialogo[open]") !== null,
      meters,
      inputs,
    };
  }, RUN_KEY);
}

export function statsOf(view: TurnView): Record<Stat, number> {
  const out = {} as Record<Stat, number>;
  for (const stat of STATS) {
    const value = view.meters[t(`stat.${stat}`)];
    if (value === undefined) throw new Error(`no meter for ${stat} on ${view.hash}`);
    out[stat] = value;
  }
  return out;
}

/** The button the policy clicks this week. */
export function policyChoice(view: TurnView): string {
  if (view.eventOpen) return "#evento-opcion-0";
  const fatigue = view.meters[t("ui.turn.fatigue")];
  if (fatigue === undefined) throw new Error("no fatigue meter");
  if (fatigue >= TIRED_AT) return "#accion-rest";
  const stats = statsOf(view);
  let lowest: Stat = STATS[0];
  for (const stat of STATS) if (stats[stat] < stats[lowest]) lowest = stat;
  return TRAINING_BUTTON[lowest];
}

/** Click `selector` and wait until the run has one more input (the click went through). */
export async function decide(page: Page, selector: string, inputsBefore: number): Promise<void> {
  await page.click(selector);
  await page.waitForFunction(
    ([key, n]) => {
      try {
        const saved = JSON.parse(localStorage.getItem(String(key)) ?? "null");
        return Array.isArray(saved?.inputs) && saved.inputs.length > Number(n);
      } catch {
        return false;
      }
    },
    [RUN_KEY, inputsBefore],
    { polling: "raf" },
  );
}

/** One decision of the policy. Returns false when the season has ended (#fin). */
export async function playStep(page: Page): Promise<boolean> {
  const view = await readTurn(page);
  if (view.hash === "#fin") return false;
  expect(view.hash).toBe("#temporada");
  await decide(page, policyChoice(view), view.inputs);
  return true;
}

/**
 * Play until `done(view)` holds or the season ends. Returns the number of decisions taken; the
 * milliseconds of each one (read, click, wait for the save) go to `times` when given.
 * The season has at most 48 weeks and a few events: 200 decisions is a runaway.
 */
export async function playUntil(
  page: Page,
  done: (view: TurnView) => boolean,
  times?: number[],
): Promise<number> {
  for (let steps = 0; steps < 200; steps++) {
    const start = Date.now();
    const view = await readTurn(page);
    if (view.hash === "#fin" || done(view)) return steps;
    await decide(page, policyChoice(view), view.inputs);
    times?.push(Date.now() - start);
  }
  throw new Error("the season did not end in 200 decisions");
}

/** Home → Nueva temporada → pick the Falconess, type the seed → Empezar. */
export async function startSeason(page: Page, falconessId: string, seed: string): Promise<void> {
  await page.goto("#inicio");
  await page.click("#inicio-nueva");
  await expect(page).toHaveURL(/#temporada$/);
  await page.click(`label[for="nueva-corredora-${falconessId}"]`);
  await expect(page.locator(`#nueva-corredora-${falconessId}`)).toBeChecked();
  await page.fill("#nueva-semilla", seed);
  await page.click("#nueva-empezar");
  await expect(page.getByTitle(t("ui.top.week.long", { turn: 1, turns: 48 }))).toBeAttached();
}

/** The place and field of a "3.º de 12" text. */
export function parsePlace(text: string): { place: number; field: number } {
  const m = /(\d+)\.º\s*de\s*(\d+)/.exec(text.replace(/\s+/g, " "));
  if (!m) throw new Error(`no place in "${text}"`);
  return { place: Number(m[1]), field: Number(m[2]) };
}

/**
 * On a race replay: play it at ×8 to the finish and return the player's place in the
 * classification that appears there.
 */
export async function playReplayToEnd(page: Page, prefix: string): Promise<number> {
  await page.click(`#${prefix}-velocidad-8`);
  await page.click(`#${prefix}-reproducir`);
  const table = page.getByRole("table", { name: t("ui.race.result.title") });
  await expect(table).toBeVisible({ timeout: 60_000 });
  return playerPlace(page);
}

/** The player's place in the classification table ("Vos" row). */
export async function playerPlace(page: Page): Promise<number> {
  const table = page.getByRole("table", { name: t("ui.race.result.title") });
  const row = table.getByRole("row").filter({ hasText: t("ui.race.you") });
  await expect(row).toHaveCount(1);
  const first = await row.getByRole("cell").first().textContent();
  const m = /(\d+)\.º/.exec(first ?? "");
  if (!m) throw new Error(`no place in the player's row: "${first}"`);
  return Number(m[1]);
}
