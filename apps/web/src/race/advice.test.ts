import { type AdviceItem, adviceCauses, contentLabels, raceAdvice } from "@falconess/race-view";
import type { RaceLog, RaceStats } from "@falconess/schema";
import { neutralFixtureEntry, simulateRace } from "@falconess/sim";
import { describe, expect, it } from "vitest";
import { getContent, simContext } from "../content/load";
import {
  ADVICE_FROM_PLACE,
  adviceIcon,
  adviceSentence,
  adviceWhy,
  adviceWords,
  runnerAdvice,
} from "./advice";

const content = getContent();
const labels = contentLabels(content);
const ctx = simContext();

/** A strong neutral runner against one with little stamina and one with little agility. */
function canyon(): RaceLog {
  const strong: RaceStats = {
    agility: 900,
    stamina: 900,
    technique: 900,
    courage: 900,
    intelligence: 900,
  };
  const runners: [string, Partial<RaceStats>][] = [
    ["fuerte", {}],
    ["sin-fisico", { stamina: 100 }],
    ["lenta", { agility: 300 }],
  ];
  const entries = runners.map(([runnerId, stats], laneIndex) =>
    neutralFixtureEntry({ runnerId, laneIndex, style: "hover", stats: { ...strong, ...stats } }),
  );
  return simulateRace(ctx.ruleset, entries, ctx.content.getCourse("canyon"), "advice-1", {
    detail: "full",
  });
}

/** One tip of every cause, with numbers the engine can log. */
const EVERY: AdviceItem[] = [
  {
    reason: "hpEmpty",
    stat: "stamina",
    costMilli: 34_650,
    evidence: { atMm: 1_589_400, restMm: 410_600, winnerAtMm: 1_800_000, inFinal: true },
  },
  {
    reason: "hpEmpty",
    stat: "courage",
    costMilli: 34_650,
    evidence: { atMm: 1_589_400, restMm: 410_600, winnerAtMm: null, inFinal: true },
  },
  {
    reason: "cruise",
    stat: "agility",
    costMilli: 24_000,
    evidence: { agility: 531, winnerAgility: 722, middleMilli: 9000, curvesMilli: 15_000 },
  },
  {
    reason: "cruise",
    stat: "agility",
    costMilli: 9000,
    evidence: { agility: 531, winnerAgility: 722, middleMilli: 9000, curvesMilli: 0 },
  },
  {
    reason: "start",
    stat: "technique",
    costMilli: 31_000,
    evidence: { deltaTicks: 31, accelMms2: 200, winnerAccelMms2: 500 },
  },
  {
    reason: "stall",
    stat: "technique",
    costMilli: 40_000,
    evidence: { jumpsFailed: 2, ticks: 40 },
  },
  {
    reason: "landings",
    stat: "technique",
    costMilli: null,
    evidence: { count: 2, lossMms: 8490, landPm: 830, winnerLandPm: 890 },
  },
  { reason: "overheat", stat: "courage", costMilli: null, evidence: { ticks: 5, heatCap: 51_500 } },
  {
    reason: "heatCapped",
    stat: "courage",
    costMilli: null,
    evidence: { atMm: 1_450_000, energyLeft: 30_000, heatCap: 69_000 },
  },
  {
    reason: "pace",
    stat: "intelligence",
    costMilli: 5000,
    evidence: {
      pace: [9, -44, -24],
      winnerPace: [-43, 37, 0],
      centrePm: -21,
      winnerCentrePm: 11,
      phase: 1,
      position: "closer",
      letter: "A",
    },
  },
  {
    reason: "plan",
    stat: "intelligence",
    costMilli: null,
    evidence: { energyLeft: 30_000, unseen: 40_000, planErrPm: -120 },
  },
  {
    reason: "skills",
    stat: "intelligence",
    costMilli: null,
    evidence: { skillIds: ["last-gasp"], pAct: 857 },
  },
  {
    reason: "skills",
    stat: "intelligence",
    costMilli: 3000,
    evidence: { skillIds: ["last-gasp", "corner-carver"], pAct: 857 },
  },
  {
    reason: "broken",
    stat: "workshop",
    costMilli: 90_000,
    evidence: { atMm: 2_401_000, fromStart: false, speedPm: 750 },
  },
  {
    reason: "broken",
    stat: "workshop",
    costMilli: 90_000,
    evidence: { atMm: null, fromStart: true, speedPm: 750 },
  },
  {
    reason: "broken",
    stat: "workshop",
    costMilli: null,
    evidence: { atMm: null, fromStart: false, speedPm: 750 },
  },
  {
    reason: "worn",
    stat: "workshop",
    costMilli: null,
    evidence: { durabilityEnd: 35_000, durabilityMax: 100 },
  },
];

describe("advice words", () => {
  it("words every cause in both lengths, with every value filled in", () => {
    for (const item of EVERY)
      for (const detail of ["brief", "full"] as const) {
        const w = adviceWords(item, "Peregrina", labels, detail);
        for (const text of [w.lead, w.before, w.after, w.target, w.why])
          expect(text, `${item.reason} ${detail}`).not.toMatch(/[{}]|ui\.advice/);
        expect(w.lead, item.reason).toMatch(/^¡.+!$/);
        expect(w.why.length).toBeGreaterThan(0);
      }
    // the full line adds what the stat does
    for (const item of EVERY)
      expect(adviceWhy(item, "full").length).toBeGreaterThan(adviceWhy(item, "brief").length);
  });

  it("says Umamusume's sentence: the cause, then the stat or the workshop", () => {
    const [hp, courage] = EVERY;
    if (!hp || !courage) throw new Error("no items");
    expect(adviceSentence(adviceWords(hp, "Peregrina", labels, "brief"))).toBe(
      "¡Peregrina se quedó sin físico a los 1589 m! Quizás deberías entrenar Resistencia.",
    );
    expect(adviceSentence(adviceWords(courage, "Peregrina", labels, "brief"))).toBe(
      "¡Peregrina se quedó sin físico en el final, a los 1589 m! Quizás deberías entrenar Coraje.",
    );
    const worn = EVERY.at(-1);
    if (!worn) throw new Error("no worn tip");
    const w = adviceWords(worn, "Peregrina", labels, "full");
    expect(adviceSentence(w)).toBe(
      "¡Las alas de Peregrina terminaron gastadas! Quizás deberías pasar por el Taller a repararlas.",
    );
    expect(w.targetIcon).toBe("action.workshop");
    expect(adviceWords(hp, "Peregrina", labels, "brief")).toMatchObject({
      icon: "flag.exhausted",
      targetIcon: "stat.stamina",
      why: "411 m a velocidad mínima: unos 2,31 s.",
    });
    expect(adviceWhy(hp, "full")).toBe(
      "Corrió 411 m a velocidad mínima y sin boost; la ganadora aguantó hasta los 1800 m. Le costó unos 2,31 s. La resistencia hace durar el físico.",
    );
    expect(new Set(EVERY.map(adviceIcon)).size).toBeGreaterThan(8);
  });

  it("tells a real race's losers what to train, and the winner nothing", () => {
    const log = canyon();
    const lane = (id: string) => log.entries.findIndex((e) => e.runnerId === id);
    expect(log.results[0]?.runnerId).toBe("fuerte");
    expect(runnerAdvice(log, lane("fuerte"))).toEqual({ items: [], none: false });
    const tired = runnerAdvice(log, lane("sin-fisico"));
    expect(tired.items).toEqual(raceAdvice(log, lane("sin-fisico")));
    const first = tired.items[0];
    if (!first) throw new Error("no tip");
    const at = log.results.find((r) => r.runnerId === "sin-fisico")?.ledger.hpEmptyMm ?? 0;
    expect(adviceSentence(adviceWords(first, "sin-fisico", labels, "brief"))).toBe(
      `¡sin-fisico se quedó sin físico a los ${Math.round(at / 1000)} m! Quizás deberías entrenar Resistencia.`,
    );
    const slow = runnerAdvice(log, lane("lenta")).items.map((i) => i.stat);
    expect(slow).toContain("agility");
  });

  it("says there is nothing to train only to a runner 3rd or worse without a tip", () => {
    const log = canyon();
    for (const r of log.results) {
      const { items, none } = runnerAdvice(log, r.lane);
      expect(none).toBe(items.length === 0 && r.place >= ADVICE_FROM_PLACE);
      expect(items.length).toBeLessThanOrEqual(adviceCauses(log, r.lane).length);
    }
  });
});
