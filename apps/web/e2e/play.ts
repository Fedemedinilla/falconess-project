/**
 * A tester's hands: start a season and play it by clicking, with a simple policy (answer events
 * with the first option, rest when vigor runs low, else train the lowest stat). Everything is read
 * from the page (meters, the timing bar, the open dialog); the save in localStorage is only used
 * to know that a click went through.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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

/**
 * Vigor at or below which the policy rests: under it ruleset v2's failure curve climbs fast
 * ("riesgo alto"); in v1 the bar turns amber there.
 */
export const LOW_VIGOR = 40;

export type TurnView = {
  readonly hash: string;
  /** The week in the timing bar, if a season is in play and not ended. */
  readonly week: number | undefined;
  readonly eventOpen: boolean;
  /** «Lo que pasó» is open (after every input, until it is read; an event waits behind it). */
  readonly weekOpen: boolean;
  /** Stats by their game name, and vigor under "Vigor" (the hidden meters of the Turn screen). */
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
      weekOpen: document.querySelector("#semana-dialogo[open]") !== null,
      meters,
      inputs,
    };
  }, RUN_KEY);
}

/** The vigor meter of the Turn screen (`fatigueMax − fatigue`). */
export function vigorOf(view: TurnView): number {
  const vigor = view.meters[t("ui.turn.vigor")];
  if (vigor === undefined) throw new Error(`no vigor meter on ${view.hash}`);
  return vigor;
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
  if (vigorOf(view) <= LOW_VIGOR) return "#accion-rest";
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

/**
 * Read «Lo que pasó» and close it with Enter (the focus is on «Continuar» when it opens); the
 * event of the week, if any, opens after it.
 */
export async function closeWeek(page: Page): Promise<void> {
  const dialog = page.locator("#semana-dialogo[open]");
  await expect(dialog).toBeVisible();
  await expect(page.locator("#semana-continuar")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
}

/**
 * Take one week with `action` (a button id): read a «Lo que pasó» still open and answer a waiting
 * event first (its first option, and its own «Lo que pasó»), then click. The week's «Lo que pasó»
 * is left open for the caller. Returns false when the season has ended (#fin).
 */
export async function takeWeek(page: Page, action: string): Promise<boolean> {
  for (let i = 0; i < 4; i++) {
    const view = await readTurn(page);
    if (view.weekOpen) {
      await closeWeek(page);
      continue;
    }
    if (view.hash === "#fin") return false;
    if (view.eventOpen) {
      await decide(page, "#evento-opcion-0", view.inputs);
      continue;
    }
    await decide(page, action, view.inputs);
    return true;
  }
  throw new Error("the week did not open for an action");
}

/** One decision of the policy. Returns false when the season has ended (#fin). */
export async function playStep(page: Page): Promise<boolean> {
  let view = await readTurn(page);
  if (view.weekOpen) {
    await closeWeek(page);
    view = await readTurn(page);
  }
  if (view.hash === "#fin") return false;
  expect(view.hash).toBe("#temporada");
  await decide(page, policyChoice(view), view.inputs);
  return true;
}

/**
 * Play until `done(view)` holds or the season ends, reading «Lo que pasó» after every decision
 * (so `done` never sees it open). Returns the number of decisions taken; the milliseconds of each
 * one (read, click, wait for the save) go to `times` when given.
 * The season has at most 48 weeks and a few events: 200 decisions is a runaway.
 */
export async function playUntil(
  page: Page,
  done: (view: TurnView) => boolean,
  times?: number[],
): Promise<number> {
  for (let steps = 0; steps < 200; steps++) {
    const start = Date.now();
    let view = await readTurn(page);
    if (view.weekOpen) {
      await closeWeek(page);
      view = await readTurn(page);
    }
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

/** The owner's playtest 1 (ruleset v1, seed 397553), as packages/sim keeps it for its tests. */
export const RUN1: {
  schemaVersion: number;
  rulesetVersion: string;
  seed: string;
  inputs: { kind: string }[];
} = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL("../../../packages/sim/src/season/__fixtures__/playtest-run1.json", import.meta.url),
    ),
    "utf8",
  ),
);

/** The owner's run up to week 19, whose training v1 turned into a forced rest (fatigue 85). */
export const RUN1_WEEK19 = { ...RUN1, inputs: RUN1.inputs.slice(0, 29) };

/** Home → Cargar partida → paste `run` → Cargar y reproducir. */
export async function loadRun(page: Page, run: unknown): Promise<void> {
  await page.goto("#inicio");
  await page.click("#inicio-cargar");
  await page.fill("#cargar-json", JSON.stringify(run));
  await page.click("#cargar-enviar");
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
