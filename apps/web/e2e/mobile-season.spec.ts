import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, type Page } from "@playwright/test";
import { t } from "./fixtures";
import {
  continueRun,
  raceWeekNow,
  settle,
  test,
  toPosition,
  toResult,
  week,
} from "./mobile-helpers";
import { type Coverage, coverageNow } from "./motion";

/**
 * A whole season on the phone, as a player plays it (closing step 1): 390 × 844 on Rápido, from
 * the title to the End, then «Nueva temporada» with the season's black box and the next season's
 * inheritance card. Every week is played by tapping, with the suite's hands (`settle`,
 * `toPosition`, `toResult`); the seeded save `peregrina-ended` gives only the start (its seed, cut
 * to its `start` input, no scene seen) and the actions it played, so the season is the same every
 * run: her five goal races come, and the season ends at week 48.
 *
 * At every beat (the menu free, the race card free, the race's result, the End, the next season's
 * card), with every layer and leaving copy gone: no console error, the focus on a control (never
 * the page's body), no control covered (by a notice or anything else), and the HUD on the week
 * expected. All the time, from a page-side watcher: rule 10 (each scene's first commit is its
 * opaque black, `coverageNow` under any leaving copy), rule 11 (the emblem covers the game when the
 * race mode takes the screen under it, and no race card shows between the emblem and the scene
 * before the race), rule 13 (never a scene and a result at once, and no race result before the
 * scene after the race), the HUD's week moving one at a time, and each goal race's replay mounting
 * once. The frame probe (an auto fixture) holds as everywhere.
 */

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

type SeededRun = {
  readonly save: {
    readonly schemaVersion: number;
    readonly rulesetVersion: string;
    readonly seed: string;
    readonly inputs: readonly { readonly kind: string }[];
  };
};

const SEEDED: SeededRun = JSON.parse(
  readFileSync(fileURLToPath(new URL("./saves/peregrina-ended.json", import.meta.url)), "utf8"),
);

/** Peregrina's goal weeks, as the v3 calendar sets them. */
const GOAL_WEEKS: readonly number[] =
  (
    JSON.parse(
      readFileSync(
        fileURLToPath(new URL("../../../packages/content/calendars/v3.json", import.meta.url)),
        "utf8",
      ),
    ) as { goals: Record<string, readonly { turn: number }[]> }
  ).goals.peregrina?.map((g) => g.turn) ?? [];

/** The 48 actions the seeded season played, week by week («rest», «train:<stat>»). */
const PLAN: readonly string[] = SEEDED.save.inputs.slice(1).map((input) => input.kind);

/** The training kinds this plan uses, as the training picker names its buttons. */
const TRAIN_BUTTON: Readonly<Record<string, string>> = {
  "train:agility": "#m-entrenar-agility",
  "train:stamina": "#m-entrenar-stamina",
  "train:technique": "#m-entrenar-technique",
};

/** What the page-side watcher keeps (`window.__season`). */
type Watched = {
  /** Each week the HUD showed, in order, a repeat dropped. */
  readonly weeks: readonly number[];
  /** What came, in order: `emblem`, `card`, `scene:<id>`, `result`, `replay`, `fx`, `fx-end`… */
  readonly events: readonly string[];
  /** The goal races' replays: the week the HUD last showed when each one mounted. */
  readonly replays: readonly number[];
  /** Each rule broken, in words, with the moment. */
  readonly problems: readonly string[];
};

/**
 * The page-side watcher, an init script: on every DOM change (before the frame that paints it)
 * and at every frame. `cover` is `coverageNow`.
 */
function watchSeason(cover: (args: readonly [string, string]) => Coverage): void {
  if (window !== window.top) return;
  const raf = window.requestAnimationFrame.bind(window);
  const later = window.setTimeout.bind(window);
  const weeks: number[] = [];
  const events: string[] = [];
  const replays: number[] = [];
  const problems: string[] = [];
  Reflect.set(window, "__season", { weeks, events, replays, problems });
  const byId = (id: string) => document.getElementById(id);
  const seen = new WeakSet<Element>();
  /** The element's first appearance (a new instance under this id). */
  const fresh = (el: Element | null): el is Element => {
    if (!el || seen.has(el)) return false;
    seen.add(el);
    return true;
  };
  let scene = "";
  let sceneEl: Element | null = null;
  /** Since the emblem came: whether its race card or its scene showed first. */
  let afterEmblem: "" | "waiting" | "done" = "";
  let emblemChecked = false;
  /** Since «Correr»'s replay: a scene due after the race must come before its result. */
  let afterReplay = false;
  let sceneAfterReplay = false;
  /** The race's result is up: no scene may come over it (rule 13) until the race screen goes. */
  let resultUp = false;
  let rule13 = false;
  const lastWeek = () => weeks[weeks.length - 1] ?? 0;
  const misses = (c: Coverage) => `${c.covered}/${c.points}: ${c.misses.slice(0, 4).join("; ")}`;
  const check = () => {
    const hud = byId("m-semana");
    if (hud) {
      const n = Number(/\d+/.exec(hud.getAttribute("aria-label") ?? "")?.[0] ?? "0");
      if (n > 0 && n !== lastWeek()) weeks.push(n);
    }
    const emblem = byId("m-transicion");
    if (fresh(emblem)) {
      events.push("emblem");
      afterEmblem = "waiting";
      emblemChecked = false;
    }
    // rule 11: once the race mode takes the screen under the emblem, the emblem covers it all
    if (
      emblem &&
      !emblemChecked &&
      (document.querySelector("[data-black]") !== null || byId("m-precarrera") !== null)
    ) {
      emblemChecked = true;
      const at = lastWeek();
      later(() => {
        if (!byId("m-transicion")) return;
        const c = cover(["#m-transicion", ""]);
        if (c.covered < c.points)
          problems.push(
            `week ${at}: rule 11, the emblem leaves the race mode in sight (${misses(c)})`,
          );
      }, 100);
    }
    const chapter = byId("m-capitulo");
    const id = chapter?.getAttribute("data-scene") ?? "";
    if (chapter && (chapter !== sceneEl || id !== scene)) {
      sceneEl = chapter;
      scene = id;
      events.push(`scene:${id}`);
      // rule 10: its first commit is its opaque black, whatever leaves in front of it
      const c = cover(["#m-capitulo", '[data-layer-phase="out"]']);
      if (c.covered < c.points)
        problems.push(`week ${lastWeek()}: rule 10, scene ${id} starts off black (${misses(c)})`);
      if (afterEmblem === "waiting") afterEmblem = "done";
      if (afterReplay) sceneAfterReplay = true;
      if (resultUp)
        problems.push(`week ${lastWeek()}: rule 13, scene ${id} after the race's result`);
    }
    if (!chapter) sceneEl = null;
    // rule 11: no race card between the emblem and the scene before the race
    const card = byId("m-precarrera");
    if (card && !emblem && !chapter && afterEmblem === "waiting") {
      afterEmblem = "done";
      events.push("card");
    }
    // rule 13: never a scene and a result at once; the result after the scene after the race
    if (chapter && byId("m-resultado")) {
      if (!rule13) problems.push(`week ${lastWeek()}: rule 13, scene ${id} and a result at once`);
      rule13 = true;
    } else rule13 = false;
    const raceScreen = document.querySelector('[data-screen="race"]') !== null;
    if (!raceScreen) resultUp = false;
    const result = byId("m-resultado");
    if (fresh(result)) {
      const race = raceScreen;
      events.push(race ? "race-result" : "result");
      if (race) resultUp = true;
      if (race && afterReplay) {
        afterReplay = false;
        events.push(sceneAfterReplay ? "(after its scene)" : "(no scene)");
      }
    }
    if (fresh(byId("m-carrera-vuelo"))) {
      events.push("replay");
      replays.push(lastWeek());
      afterReplay = true;
      sceneAfterReplay = false;
    }
    if (fresh(byId("m-efectos"))) events.push(byId("m-fin") ? "fx-end" : "fx");
    if (fresh(byId("m-fin"))) events.push("end");
    if (fresh(byId("m-inspiracion"))) events.push("inheritance");
  };
  new MutationObserver(check).observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["id", "aria-label", "data-scene", "data-screen"],
  });
  const frame = () => {
    check();
    raf(frame);
  };
  raf(frame);
}

/** What the watcher kept so far. */
function watched(page: Page): Promise<Watched> {
  return page.evaluate(() => {
    const w: Watched | undefined = Reflect.get(window, "__season");
    if (!w) throw new Error("the season's watcher is not on the page");
    return {
      weeks: [...w.weeks],
      events: [...w.events],
      replays: [...w.replays],
      problems: [...w.problems],
    };
  });
}

/**
 * A beat's end, as the player is left with it: what has the focus, and each control a tap at its
 * middle does not reach, or that a notice covers. Self-contained: it runs in the page.
 */
function beatNow(): { focus: string; blocked: string[] } {
  const name = (el: Element): string => {
    const cls = el.getAttribute("class")?.split(/\s+/)[0];
    return el.tagName.toLowerCase() + (el.id ? `#${el.id}` : "") + (cls ? `.${cls}` : "");
  };
  const active = document.activeElement;
  const focus =
    !active || active === document.body
      ? "BODY"
      : `${name(active)}${active.closest("[inert]") ? " (inert)" : ""}`;
  const app = document.querySelector("[data-app]");
  const blocked: string[] = [];
  if (!app) return { focus, blocked };
  /** The part of the box that shows: clipped by the viewport and by every scroller around it. */
  const clipped = (el: Element) => {
    const r = el.getBoundingClientRect();
    let left = Math.max(r.left, 0);
    let top = Math.max(r.top, 0);
    let right = Math.min(r.right, window.innerWidth);
    let bottom = Math.min(r.bottom, window.innerHeight);
    for (let up = el.parentElement; up; up = up.parentElement) {
      const style = getComputedStyle(up);
      if (style.overflowX === "visible" && style.overflowY === "visible") continue;
      const u = up.getBoundingClientRect();
      left = Math.max(left, u.left);
      top = Math.max(top, u.top);
      right = Math.min(right, u.right);
      bottom = Math.min(bottom, u.bottom);
    }
    return { left, top, right, bottom };
  };
  const shown = (el: Element) => {
    for (let e: Element | null = el; e; e = e.parentElement) {
      const style = getComputedStyle(e);
      if (Number(style.opacity) === 0 || style.visibility === "hidden") return false;
    }
    return true;
  };
  const controls = [...app.querySelectorAll("button, a[href], [role='button'], label")].filter(
    (c) =>
      !c.closest("[inert]") &&
      !(c instanceof HTMLButtonElement && c.disabled) &&
      !c.closest("[data-notice]") &&
      shown(c),
  );
  const notices = [...document.querySelectorAll("[data-notice]")].map((n) => ({
    n,
    box: n.getBoundingClientRect(),
  }));
  for (const c of controls) {
    const b = clipped(c);
    if (b.right - b.left < 2 || b.bottom - b.top < 2) continue;
    const x = (b.left + b.right) / 2;
    const y = (b.top + b.bottom) / 2;
    const top = document.elementFromPoint(x, y);
    if (!top || !(top === c || c.contains(top)))
      blocked.push(
        `${name(c)} at (${Math.round(x)}, ${Math.round(y)}) under ${top ? name(top) : "nothing"}`,
      );
    for (const { n, box } of notices)
      if (box.left < b.right && b.left < box.right && box.top < b.bottom && b.top < box.bottom)
        blocked.push(`${name(c)} overlapped by the notice ${name(n)}`);
  }
  return { focus, blocked };
}

test("a whole season on Rápido at 390 × 844: the title, every week tapped to the End and its effects, then the next season's inheritance card; every beat ends clean", async ({
  page,
  errors,
}) => {
  test.setTimeout(240_000);
  expect(PLAN).toHaveLength(48);
  expect(GOAL_WEEKS).toHaveLength(5);
  const start = { ...SEEDED.save, inputs: SEEDED.save.inputs.slice(0, 1) };
  await page.addInitScript((run) => {
    if (localStorage.getItem("falconess.pruebas.partida") !== null) return;
    localStorage.setItem("falconess.pruebas.partida", JSON.stringify(run));
    localStorage.setItem("falconess.juego.ritmo", "fast");
  }, start);
  await page.addInitScript({ content: `(${watchSeason.toString()})(${coverageNow.toString()});` });

  /** A beat's end: every layer and leaving copy gone, then what the player is left with. */
  const beat = async (where: string) => {
    await expect(page.locator("[data-layer-phase]"), where).toHaveCount(0);
    await expect(page.locator("[data-notice-leaving]"), where).toHaveCount(0);
    expect((await watched(page)).problems, `${where}: rules 10, 11, 13`).toEqual([]);
    expect(errors, `${where}: console errors`).toEqual([]);
    const now = await page.evaluate(beatNow);
    expect(now.focus, `${where}: the focus`).not.toMatch(/^BODY$|\(inert\)$/);
    expect(now.blocked, `${where}: controls covered`).toEqual([]);
  };

  await page.goto("./");
  await expect(page.locator("#m-titulo")).toBeVisible();
  await continueRun(page);
  // her prologue opens the season (no scene seen yet); then the menu of week 1
  await expect(page.locator("#m-capitulo")).toHaveAttribute("data-scene", "peregrina-prologue");
  await settle(page);

  const raceWeeks: number[] = [];
  for (let w = 1; w <= 48; w++) {
    await beat(`week ${w}: the menu`);
    expect(await week(page), "the HUD's week").toBe(w);
    const raceWeek = await raceWeekNow(page);
    if (raceWeek) raceWeeks.push(w);
    const action = PLAN[w - 1] ?? "";
    if (action === "rest") await page.click("#m-descansar");
    else {
      const pick = TRAIN_BUTTON[action];
      if (!pick) throw new Error(`week ${w}: no button for ${action}`);
      await page.click("#m-entrenar");
      await page.click(pick);
      await page.click("#m-entrenar-confirmar");
      // the training's result (the preview's on a race week): a tap goes on sooner
      await expect(page.locator("#m-resultado")).toBeVisible();
      await page.click("#m-resultado-seguir");
    }
    if (raceWeek) {
      await toPosition(page);
      await beat(`week ${w}: the race card`);
      await page.click("#m-correr");
      await expect(page.locator("#m-carrera-vuelo")).toBeVisible();
      await page.click("#m-saltar");
      await toResult(page);
      await beat(`week ${w}: the race's result`);
      // each of her goal races has a scene after it this season: it came before the result
      const marks = (await watched(page)).events.filter((e) => e.startsWith("("));
      expect(marks.at(-1), `week ${w}: the scene after the race`).toBe("(after its scene)");
      await page.click("#m-carrera-seguir");
    }
    if (w === 48) {
      // the season's last effects play over the End (O5)
      await expect(page.locator("#m-fin")).toBeAttached();
      await expect.poll(async () => (await watched(page)).events).toContain("fx-end");
    }
    await settle(page);
  }

  // the End, its effects ended
  await expect(page.locator("#m-fin")).toBeVisible();
  await beat("the End");
  const seen = await watched(page);
  expect(seen.weeks, "the HUD's weeks, one at a time").toEqual(
    Array.from({ length: 48 }, (_, i) => i + 1),
  );
  expect(raceWeeks, "the race weeks").toEqual(GOAL_WEEKS);
  expect(seen.replays, "each goal race run once").toEqual(GOAL_WEEKS);
  expect(seen.events.filter((e) => e.startsWith("("))).toHaveLength(GOAL_WEEKS.length);
  for (const turn of GOAL_WEEKS) await expect(page.locator(`#m-fin-carrera-${turn}`)).toBeVisible();
  const saved: { inputs: { kind: string }[] } = JSON.parse(
    await page.evaluate(() => localStorage.getItem("falconess.pruebas.partida") ?? "{}"),
  );
  expect(
    saved.inputs.slice(1).map((i) => i.kind),
    "one input per week, as tapped",
  ).toEqual(PLAN);
  await expect(page.locator("#m-fin-caja")).toContainText("★");

  // the next season: the season's box, then her (passed) prologue and the inheritance card
  await page.click("#m-fin-nueva");
  await expect(page.getByRole("heading", { name: t("ui.m.pick.title") })).toBeVisible();
  const boxes = page.locator("#m-herencia button[data-box]");
  await expect(boxes).toHaveCount(1);
  await boxes.first().click();
  await page.click("#m-elegir-peregrina");
  await page.click("#m-empezar");
  const card = page.locator("#m-inspiracion");
  await expect(card).toHaveAttribute("data-kind", "start");
  await expect(card.locator("li[data-parent]")).toHaveCount(1);
  expect(await week(page)).toBe(1);
  await page.click("#m-inspiracion-seguir");
  await settle(page);
  await beat("the next season's week 1");
  expect(await week(page)).toBe(1);
  expect((await watched(page)).events.slice(-2)).toEqual(["end", "inheritance"]);
});
