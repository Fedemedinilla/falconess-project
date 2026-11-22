import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, type Page } from "@playwright/test";
import {
  continueRun,
  openPlan,
  pastTitle,
  seedRun,
  settle,
  skipScene,
  startMobile,
  shotTest as test,
  toPosition,
  toResult,
  week,
} from "./mobile-helpers";
import { coverage, opacityOf } from "./motion";

/**
 * Frame captures of the phone game's transitions for review (plan-final §2.8), never committed:
 * `MOTION_STEP=before E2E_SHOTS=1 playwright test --project shots motion-shots` writes
 * `.work/ui/motion/<step>/<flow>-<viewport>-<motion>-<ms>.png` (step "latest" without
 * MOTION_STEP), and beside them one `<flow>-<viewport>-<motion>.json` per test with what each
 * frame measured: the opacity the eye gets of each layer on the page (`opacityOf`) and how many
 * of the 45 coverage points it holds (`coverage`).
 *
 * How a moment is caught: the season is played on a seeded `Math.random` (the same run every
 * time) under a fake clock; at a transition the clock is held and every animation paused, the
 * tap goes in, and the game moves on 10 ms at a time: the clock runs the timers, and each
 * animation is set to the time since it began (the ones the tap mounted begin at 0, the ones a
 * timer mounted begin when it fired). `ms` is the time since the tap.
 */

const STEP = process.env.MOTION_STEP ?? "latest";
const OUT = fileURLToPath(new URL(`../../../.work/ui/motion/${STEP}/`, import.meta.url));

/**
 * The layers each frame measures, when on the page (one of each): a leaving copy has no id, so
 * it is measured by its phase, and the race result's foot (the notice's anchor) by its mark.
 */
const LAYERS = [
  "#m-transicion",
  "#m-capitulo",
  "#m-efectos",
  "#m-inspiracion",
  "#m-resultado",
  '[data-layer-phase="out"] > *',
  "[data-toast-anchor]",
  "#m-carrera-llegada",
] as const;

type Measure = { opacity: number; covered: number };

async function measure(page: Page): Promise<Record<string, Measure>> {
  const out: Record<string, Measure> = {};
  for (const sel of LAYERS) {
    if ((await page.locator(sel).count()) !== 1) continue;
    const opacity = Math.round((await opacityOf(page, sel)) * 1000) / 1000;
    out[sel] = { opacity, covered: (await coverage(page, sel)).covered };
  }
  return out;
}

/** A held game, moved on by hand: shots at chosen moments after a tap. */
class Moments {
  private vt = 0;
  private origin = 0;
  private readonly frames: { flow: string; ms: number; layers: Record<string, Measure> }[] = [];

  constructor(
    private readonly page: Page,
    private readonly tag: string,
  ) {}

  /** Holds the game: the clock paused, every animation paused where it is. */
  async hold(): Promise<void> {
    // the clock flows while the call travels: aim a little ahead, and again if it got there first
    for (let tries = 0; ; tries++)
      try {
        await this.page.clock.pauseAt((await this.page.evaluate(() => Date.now())) + 25);
        break;
      } catch (error) {
        if (tries >= 4 || !String(error).includes("past")) throw error;
      }
    this.vt = 0;
    this.origin = 0;
    await this.page.evaluate(() => {
      const starts = new Map<Animation, number>();
      for (const a of document.getAnimations()) {
        starts.set(a, -Number(a.currentTime ?? 0));
        a.pause();
      }
      Reflect.set(window, "__moments", starts);
    });
  }

  /** The next shots count from here (the tap that follows). */
  mark(): void {
    this.origin = this.vt;
  }

  /** Every animation at its time since it began, once the page's own updates landed. */
  private async sync(): Promise<void> {
    await this.page.evaluate(async (t) => {
      // React commits on a posted message: let the timers' updates land first
      for (let i = 0; i < 2; i++)
        await new Promise<void>((done) => {
          const channel = new MessageChannel();
          channel.port1.onmessage = () => done();
          channel.port2.postMessage(0);
        });
      const starts: Map<Animation, number> = Reflect.get(window, "__moments");
      for (const a of document.getAnimations()) {
        const start = starts.get(a) ?? t;
        starts.set(a, start);
        a.pause();
        a.currentTime = t - start;
      }
    }, this.vt);
  }

  /** Moves the held game on to `ms` after the hold, 10 ms at a time. */
  private async advance(ms: number): Promise<void> {
    await this.sync();
    while (this.vt < ms) {
      const step = Math.min(10, ms - this.vt);
      await this.page.clock.runFor(step);
      this.vt += step;
      await this.sync();
    }
  }

  /** Moves on until `ready()` holds (at most `maxMs`), and counts the next shots from there. */
  async until(ready: () => Promise<boolean>, maxMs: number): Promise<void> {
    const limit = this.vt + maxMs;
    while (!(await ready())) {
      if (this.vt >= limit) throw new Error(`not ready ${maxMs} ms after the hold`);
      await this.advance(this.vt + 10);
    }
    this.mark();
  }

  /** A shot (and the layers' measures) at each of `times`, ms after the mark. */
  async at(flow: string, times: readonly number[]): Promise<void> {
    mkdirSync(OUT, { recursive: true });
    for (const ms of times) {
      await this.advance(this.origin + ms);
      const name = `${flow}-${this.tag}-${String(ms).padStart(4, "0")}`;
      await this.page.screenshot({ path: `${OUT}${name}.png`, caret: "hide" });
      this.frames.push({ flow, ms, layers: await measure(this.page) });
    }
  }

  /** Lets the game go on: the paused animations play on (finished ones stay finished). */
  async release(): Promise<void> {
    await this.page.evaluate(() => {
      for (const a of document.getAnimations()) {
        const end = a.effect?.getComputedTiming().endTime;
        const at = Number(a.currentTime ?? 0);
        if (end === undefined || Number(end) === Number.POSITIVE_INFINITY || at < Number(end))
          a.play();
        else a.finish();
      }
      Reflect.deleteProperty(window, "__moments");
    });
    await this.page.clock.resume();
  }

  /** The measures of every shot, beside them. */
  write(flow: string): void {
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}${flow}-${this.tag}.json`, `${JSON.stringify(this.frames, null, 2)}\n`);
  }
}

/** The same season every run: `Math.random` and `crypto.getRandomValues` seeded. */
async function seeded(page: Page): Promise<void> {
  await page.addInitScript(() => {
    let s = 20261115;
    const next = () => {
      s = (Math.imul(s, 1103515245) + 12345) >>> 0;
      return s / 4294967296;
    };
    Math.random = next;
    crypto.getRandomValues = <T extends ArrayBufferView | null>(array: T): T => {
      if (array instanceof Uint8Array || array instanceof Uint32Array)
        for (let i = 0; i < array.length; i++)
          array[i] = Math.floor(next() * (array instanceof Uint8Array ? 256 : 4294967296));
      return array;
    };
  });
}

/**
 * Peregrina's first week, the prologue skipped and its exit over (0.8 s, 6.2): the menu alone,
 * with nothing left of the scene.
 */
async function startPeregrina(page: Page): Promise<void> {
  await startMobile(page, "peregrina");
  await expect(page.locator("[data-layer-phase]")).toHaveCount(0, { timeout: 15_000 });
  await page.waitForTimeout(500);
}

/** Weeks 1-9 (agility and rest in turns, as e2e #3), to the week-10 race's menu. */
async function toRaceWeek(page: Page): Promise<void> {
  await startPeregrina(page);
  let k = 0;
  while ((await week(page)) < 10) {
    if (k++ % 2) await page.click("#m-descansar");
    else {
      await page.click("#m-entrenar");
      await page.dblclick("#m-entrenar-agility");
    }
    await settle(page);
  }
}

type Flow = (page: Page, m: Moments) => Promise<string>;

/** Menu → training screen. */
const menuTrain: Flow = async (page, m) => {
  await startPeregrina(page);
  await m.hold();
  await page.click("#m-entrenar");
  await m.at("menu-train", [0, 100, 200]);
  await m.release();
  return "menu-train";
};

/** The title's leave after its tap (under reduced motion: a fade only, 6.8). */
const titleLeave: Flow = async (page, m) => {
  await page.goto("./");
  await expect(page.locator("#m-titulo")).toBeVisible();
  await m.hold();
  await page.click("#m-titulo");
  await m.at("title-leave", [0, 150, 300, 440]);
  await m.release();
  return "title-leave";
};

/** Menu → training screen → a training: its result (the stamp, the «+N», the stats' drop). */
const trainResult: Flow = async (page, m) => {
  await startPeregrina(page);
  await page.click("#m-entrenar");
  await expect(page.locator("#m-entrenar-agility")).toBeVisible();
  await page.waitForTimeout(400);
  await m.hold();
  await page.dblclick("#m-entrenar-agility");
  await m.at("train-result", [0, 120, 300, 600, 1200]);
  await m.release();
  return "train-result";
};

/** Whether the page is on the wide screen (the panel is its menu: no «Menú» sheet). */
function wide(page: Page): boolean {
  return (page.viewportSize()?.width ?? 0) >= 1100;
}

/**
 * A sheet in, then «Cerrar»: its way out (6.9): «Menú» on a phone, «Historia» from the wide
 * screen's panel.
 */
const sheet: Flow = async (page, m) => {
  await startPeregrina(page);
  const [open, close] = wide(page)
    ? ["#m-historia-abrir", "#m-historia-cerrar"]
    : ["#m-menu", "#m-menu-cerrar"];
  await m.hold();
  await page.click(open);
  await m.at("sheet-in", [0, 60, 120, 220]);
  m.mark();
  await page.click(close);
  await m.at("sheet-out", [0, 60, 120, 180, 200]);
  await m.release();
  return "sheet";
};

/** The chat (from «Menú» on a phone, from the panel on the wide screen): in, then out (6.9). */
const chat: Flow = async (page, m) => {
  await startPeregrina(page);
  if (!wide(page)) {
    await page.click("#m-menu");
    await page.waitForTimeout(400);
  }
  await m.hold();
  await page.click("#m-chat-abrir");
  await m.at("chat-in", [0, 60, 120, 240]);
  await m.until(async () => (await page.locator("dialog").count()) === 0, 400);
  await page.click("#m-chat-cerrar");
  await m.at("chat-out", [0, 90, 180, 200]);
  await m.release();
  return "chat";
};

/** The outing on the race week: the pick, the sheet's way out over the action's effects (6.9). */
const outingPick: Flow = async (page, m) => {
  await seedRun(page, "peregrina-w10");
  await page.goto("./");
  await continueRun(page);
  await page.click("#m-salida");
  await expect(page.locator("#m-salida-cuadrilla li[data-crew]").first()).toBeVisible();
  await page.waitForTimeout(400);
  await m.hold();
  await page.locator("#m-salida-cuadrilla li[data-crew] button").first().click();
  await m.at("outing-pick", [0, 60, 120, 180, 200, 300]);
  await m.release();
  return "outing-pick";
};

/** A rest's effects over the menu, then a tap on them (on a wide screen: the panel beside them). */
const effects: Flow = async (page, m) => {
  await startPeregrina(page);
  await m.hold();
  await page.click("#m-descansar");
  await m.at("fx-in", [0, 300, 700]);
  m.mark();
  await page.click("#m-efectos");
  await m.at("fx-out", [0, 60, 120, 180, 240, 300]);
  await m.release();
  return "fx";
};

/**
 * The week-10 race week: the rest's effects, the emblem into the race mode and the scene before
 * the race; «Saltar» on the race; the scene after it skipped onto the result; «Continuar».
 */
const raceWeek: Flow = async (page, m) => {
  await toRaceWeek(page);
  await openPlan(page);
  await page.click("#m-correr");
  await page.click("#m-descansar");
  await expect(page.locator("#m-efectos")).toBeVisible();
  await m.hold();
  await page.click("#m-efectos");
  await m.at("emblem", [0, 20, 80, 160, 700, 1240, 1380, 1520]);
  await m.release();
  await skipScene(page);
  await toPosition(page);
  await page.click("#m-correr");
  await expect(page.locator("#m-carrera-vuelo")).toBeVisible();
  await m.hold();
  await page.click("#m-saltar");
  await m.at("race-skip", [0, 420, 1200]);
  if ((await page.locator("#m-capitulo").count()) > 0) {
    m.mark();
    await page.click("#m-capitulo-saltar");
    await m.at("scene-exit", [0, 400, 560, 720, 800, 960]);
  }
  await m.release();
  await toResult(page);
  await m.hold();
  await page.click("#m-carrera-seguir");
  await m.at("after-race", [0, 200, 400]);
  await m.release();
  return "race";
};

/**
 * The race played to its natural end (from a second before it): the finish banner held (D7), then
 * what follows (the scene after the race, on its black). Shots named `name`.
 */
async function naturalEnd(page: Page, m: Moments, name: string): Promise<string> {
  await toRaceWeek(page);
  await page.click("#m-descansar");
  await toPosition(page);
  await page.click("#m-correr");
  await page.click("#m-carrera-vuelo-salida");
  const slider = page.locator("#m-carrera-tiempo");
  const rows = Number(await slider.getAttribute("max"));
  await slider.fill(String(rows - 15));
  await m.hold();
  await m.until(async () => (await page.locator("#m-carrera-llegada").count()) === 1, 5000);
  await m.at(name, [0, 120, 420, 800, 1100, 1300]);
  await m.release();
  return name;
}

const raceEnd: Flow = (page, m) => naturalEnd(page, m, "race-end");

/** The same on Rápido: the banner holds 720 ms. */
const raceEndFast: Flow = async (page, m) => {
  await page.addInitScript(() => localStorage.setItem("falconess.juego.ritmo", "fast"));
  return naturalEnd(page, m, "race-end-fast");
};

/** Two black boxes in this browser: the next season's start has her inheritance card. */
async function withBoxes(page: Page): Promise<void> {
  const box = (id: string, stat: string) => ({
    id,
    rulesetVersion: "v3",
    falconessId: "peregrina",
    grade: "B",
    factors: {
      stat: { stat, stars: 2 },
      aptitude: { kind: "position", key: "closer", letter: "A", stars: 2 },
      skills: [],
      frameAffinity: "koryu",
    },
    seed: "s",
    inputsHash: "h",
  });
  await page.addInitScript(
    (list) => {
      localStorage.setItem("falconess.juego.cajas", JSON.stringify(list));
    },
    [box("b1", "agility"), box("b2", "stamina")],
  );
}

/** Two black boxes into a new season: the prologue skipped, the card in, «Continuar» on it. */
const inheritance: Flow = async (page, m) => {
  await withBoxes(page);
  await page.goto("./");
  await pastTitle(page);
  await page.click('[data-box="b1"]');
  await page.click('[data-box="b2"]');
  await page.click("#m-elegir-peregrina");
  await page.click("#m-empezar");
  // the season's start: her prologue first (D2), skipped onto the card
  await expect(page.locator("#m-capitulo")).toBeVisible();
  await m.hold();
  await page.click("#m-capitulo-saltar");
  await m.until(async () => (await page.locator("#m-inspiracion").count()) === 1, 3000);
  await m.at("inheritance-in", [0, 120, 240, 800, 1600, 1800, 2100]);
  m.mark();
  await page.click("#m-inspiracion-seguir");
  await m.at("inheritance-out", [0, 80, 160, 240, 300]);
  await m.release();
  return "inheritance";
};

/** The inheritance card hurried: a tap during its intro shows it at once. */
const inheritanceTap: Flow = async (page, m) => {
  await withBoxes(page);
  await page.goto("./");
  await pastTitle(page);
  await page.click('[data-box="b1"]');
  await page.click('[data-box="b2"]');
  await page.click("#m-elegir-peregrina");
  await page.click("#m-empezar");
  await skipScene(page);
  await expect(page.locator("#m-inspiracion")).toBeVisible();
  await m.hold();
  m.mark();
  await page.click("#m-inspiracion");
  await m.at("inheritance-tap", [0, 60, 120, 240]);
  await m.release();
  return "inheritance-tap";
};

/** The prologue skipped: the scene's 0.8 s exit over the live menu, which is left clean (6.2). */
const sceneLeave: Flow = async (page, m) => {
  await page.goto("./");
  await pastTitle(page);
  await page.click("#m-elegir-peregrina");
  await page.click("#m-empezar");
  await expect(page.locator("#m-capitulo")).toBeVisible();
  await m.hold();
  await page.click("#m-capitulo-saltar");
  await m.at("scene-leave", [0, 400, 800, 1200]);
  await m.release();
  return "scene-leave";
};

/** Rápido: Peregrina's prologue as a digest, from «Empezar» (6.6: the card whole 0.8-1.5 s). */
const digest: Flow = async (page, m) => {
  await page.addInitScript(() => localStorage.setItem("falconess.juego.ritmo", "fast"));
  await page.goto("./");
  await pastTitle(page);
  await page.click("#m-elegir-peregrina");
  await m.hold();
  await page.click("#m-empezar");
  // 0.8 s: the card whole and the chrome coming in after it (owner 2026-11-18)
  await m.at("digest", [0, 300, 420, 800, 860, 920, 1500, 1625, 1750, 2100, 2800]);
  await m.release();
  return "digest";
};

/** Peregrina's prologue (the cinematic) from «Empezar», untouched: its whole way in (6.6). */
const sceneIntro: Flow = async (page, m) => {
  await page.goto("./");
  await pastTitle(page);
  await page.click("#m-elegir-peregrina");
  await m.hold();
  await page.click("#m-empezar");
  // 1.8 s: the card whole, and only then the chrome, in over 120 ms (owner 2026-11-18)
  await m.at("scene-intro", [0, 300, 420, 900, 1500, 1800, 1860, 1920, 2400, 2680, 2800, 3200]);
  await m.release();
  return "scene-intro";
};

/** The prologue hurried: a tap at 600 ms (6.6, M10): the way in in 120 ms, the line 500 ms later. */
const sceneHurry: Flow = async (page, m) => {
  await page.goto("./");
  await pastTitle(page);
  await page.click("#m-elegir-peregrina");
  await m.hold();
  await page.click("#m-empezar");
  await m.at("scene-hurry", [0, 600]);
  m.mark();
  await page.click("#m-capitulo-seguir");
  // the tap brings the chrome in too, within 120 ms: the only way to «Saltar» early now
  await m.at("scene-hurry-tap", [0, 60, 120, 250, 375, 500, 700]);
  await m.release();
  return "scene-hurry";
};

/**
 * A box scene's way in (the scene before the week-10 race, after the emblem): the card out and
 * the dialogue box in with the first line (6.6, M5).
 */
const sceneBox: Flow = async (page, m) => {
  await seedRun(page, "peregrina-w10");
  await page.goto("./");
  await continueRun(page);
  await page.click("#m-descansar");
  await expect(page.locator("#m-efectos")).toBeVisible();
  await m.hold();
  await page.click("#m-efectos");
  await m.until(async () => (await page.locator("#m-capitulo").count()) === 1, 3000);
  await m.at("scene-box", [0, 300, 1200, 1800, 2550, 2680, 2800, 2900, 3020]);
  await m.release();
  return "scene-box";
};

/** A skipped scene has left: its exit (0.8 s) has had its time. */
async function sceneGone(page: Page): Promise<void> {
  await expect(page.locator("[data-layer-phase]")).toHaveCount(0, { timeout: 15_000 });
  await page.waitForTimeout(500);
}

/**
 * Week 10 of `peregrina-w10` into the race and back (6.5): «Correr» (the race screen comes in; on
 * a tablet the frame widens), then «Continuar» after the race (the menu and the HUD come back; on
 * a tablet the frame narrows).
 */
const raceInOut: Flow = async (page, m) => {
  await seedRun(page, "peregrina-w10");
  await page.goto("./");
  await continueRun(page);
  await page.click("#m-descansar");
  await toPosition(page);
  await sceneGone(page);
  await m.hold();
  await page.click("#m-correr");
  await m.at("race-in", [0, 70, 140, 210, 280, 400]);
  await m.release();
  await page.click("#m-saltar");
  await toResult(page);
  await sceneGone(page);
  await m.hold();
  await page.click("#m-carrera-seguir");
  await m.at("race-out", [0, 100, 200, 280, 400]);
  await m.release();
  return "race-in-out";
};

/** The season's last race, «Continuar» on its result: the End comes (on desk the column glides). */
const endGlide: Flow = async (page, m) => {
  await seedRun(page, "peregrina-w48");
  await page.goto("./");
  await continueRun(page);
  await page.click("#m-descansar");
  await toPosition(page);
  await page.click("#m-correr");
  await page.click("#m-saltar");
  await toResult(page);
  await sceneGone(page);
  await m.hold();
  await page.click("#m-carrera-seguir");
  await m.at("end-glide", [0, 70, 140, 210, 280, 320, 400]);
  await m.release();
  return "end-glide";
};

const PHONE = { name: "390x844", width: 390, height: 844 };
const SMALL = { name: "360x640", width: 360, height: 640 };
const PHONE_S = { name: "360x740", width: 360, height: 740 };
const TABLET = { name: "1024x768", width: 1024, height: 768 };
const DESK = { name: "1440x900", width: 1440, height: 900 };

/** What each viewport and motion setting captures. */
const PLAN: readonly {
  viewport: typeof PHONE;
  motion: "normal" | "reduce";
  flows: Readonly<Record<string, Flow>>;
}[] = [
  {
    viewport: PHONE,
    motion: "normal",
    flows: {
      menuTrain,
      effects,
      raceWeek,
      raceEnd,
      raceEndFast,
      inheritance,
      inheritanceTap,
      sceneLeave,
      digest,
      raceInOut,
      endGlide,
      sceneIntro,
      sceneHurry,
      sceneBox,
      titleLeave,
      trainResult,
      sheet,
      chat,
      outingPick,
    },
  },
  {
    viewport: PHONE,
    motion: "reduce",
    flows: {
      menuTrain,
      effects,
      raceWeek,
      raceEnd,
      inheritance,
      raceInOut,
      sceneIntro,
      sceneBox,
      titleLeave,
      trainResult,
      sheet,
      chat,
    },
  },
  {
    viewport: PHONE_S,
    motion: "normal",
    flows: {
      menuTrain,
      effects,
      raceWeek,
      raceEnd,
      inheritance,
      raceInOut,
      sceneIntro,
      sceneBox,
      sheet,
      chat,
      outingPick,
    },
  },
  {
    viewport: PHONE_S,
    motion: "reduce",
    flows: { effects, raceWeek, inheritance, sceneIntro, trainResult },
  },
  { viewport: SMALL, motion: "normal", flows: { menuTrain, effects, raceWeek, sceneLeave } },
  { viewport: SMALL, motion: "reduce", flows: { menuTrain } },
  {
    viewport: TABLET,
    motion: "normal",
    flows: { menuTrain, effects, raceWeek, raceInOut, sceneIntro },
  },
  { viewport: TABLET, motion: "reduce", flows: { menuTrain, raceInOut } },
  {
    viewport: DESK,
    motion: "normal",
    flows: {
      menuTrain,
      effects,
      raceWeek,
      raceEnd,
      inheritance,
      sceneLeave,
      raceInOut,
      endGlide,
      sceneIntro,
      sceneHurry,
      sceneBox,
      sheet,
      chat,
    },
  },
  {
    viewport: DESK,
    motion: "reduce",
    flows: { menuTrain, endGlide, effects, raceWeek, inheritance, sceneIntro, trainResult },
  },
];

for (const { viewport, motion, flows } of PLAN)
  test.describe(`${viewport.name} ${motion}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: viewport.width < 1100,
      reducedMotion: motion === "reduce" ? "reduce" : "no-preference",
    });
    for (const [name, flow] of Object.entries(flows))
      test(name, async ({ page }) => {
        test.setTimeout(180_000);
        await seeded(page);
        await page.clock.install();
        const m = new Moments(page, `${viewport.name}-${motion}`);
        m.write(await flow(page, m));
      });
  });
