import { loadContent } from "@falconess/content";
import { type AdviceItem, raceAdvice, runnersInPlaceOrder } from "@falconess/race-view";
import { describe, expect, it } from "vitest";
import { loadRaceFixture } from "./__fixtures__/load.js";
import { adviceEvidence, adviceHeadline } from "./advice-text.js";
import { contentLabels } from "./labels.js";
import {
  ADVICE_FROM_PLACE,
  fixed,
  renderAdvice,
  renderRace,
  renderRaceSummary,
} from "./render-race.js";

const labels = contentLabels(loadContent());
const full = ["sprint", "ridge", "canyon"] as const;

const headline = (item: AdviceItem) => adviceHeadline(item, "Peregrina", labels, fixed);
const evidence = (item: AdviceItem) => adviceEvidence(item, labels, fixed);

describe("the tips in pnpm sim:race", () => {
  it("prints race-view's tips at the end of each runner's why block", () => {
    for (const name of full) {
      const log = loadRaceFixture(name);
      const lines = renderRace(log, labels);
      const start = lines.findIndex((l) => l.startsWith("POR QUÉ"));
      for (const r of runnersInPlaceOrder(log)) {
        const head = lines.findIndex((l, i) => i > start && l.startsWith(`  ${r.result.place}º `));
        const next = lines.findIndex((l, i) => i > head && /^ {2}\d+º /.test(l));
        const block = lines.slice(head, next < 0 ? undefined : next);
        const rows = block.filter((l) => l.startsWith("     consejo  "));
        const tips = raceAdvice(log, r.entry.laneIndex);
        expect(rows).toEqual(
          tips.map((t) => `     consejo      ${labels.adviceStatName(t.stat)} · ${evidence(t)}`),
        );
        if (r.result.place === 1) expect(rows).toEqual([]);
      }
      expect(lines.some((l) => l.startsWith("     consejo  "))).toBe(true);
    }
  });
});

describe("the tips in pnpm play", () => {
  it("tells the player what to train after a race she finished 3rd or worse", () => {
    const ridge = loadRaceFixture("ridge");
    const me = ridge.results.find((r) => r.runnerId === "player");
    expect(me?.place).toBeGreaterThanOrEqual(ADVICE_FROM_PLACE);
    const lane = me?.lane ?? -1;
    const advice = renderAdvice(ridge, lane, labels);
    expect(advice).toHaveLength(2 * raceAdvice(ridge, lane).length);
    expect(advice[0]).toMatch(/^¡Caracara .+! Quizás deberías (entrenar|pasar por el) /);
    expect(advice[1]).toMatch(/^ {2}\S/);
    expect(renderRaceSummary(ridge, labels).slice(-advice.length)).toEqual(advice);

    const sprint = loadRaceFixture("sprint");
    expect(sprint.results.find((r) => r.runnerId === "player")?.place).toBeLessThan(
      ADVICE_FROM_PLACE,
    );
    expect(renderRaceSummary(sprint, labels).join("\n")).not.toContain("Quizás deberías");
  });
});

describe("the tips in words", () => {
  const base = { costMilli: 34_650 } as const;

  it("names the stat, or the workshop, after Umamusume's exclamation", () => {
    const hp: AdviceItem = {
      ...base,
      reason: "hpEmpty",
      stat: "stamina",
      evidence: { atMm: 1_589_400, restMm: 410_600, winnerAtMm: null, inFinal: true },
    };
    expect(headline(hp)).toBe(
      "¡Peregrina se quedó sin físico a los 1589 m! Quizás deberías entrenar Resistencia.",
    );
    expect(evidence(hp)).toBe(
      "sin físico a los 1589 m (en el final), 411 m a velocidad mínima; la ganadora no se agotó · ≈2.31 s",
    );
    expect(headline({ ...hp, stat: "courage" })).toBe(
      "¡Peregrina se quedó sin físico en el final, a los 1589 m! Quizás deberías entrenar Coraje.",
    );
    const broken: AdviceItem = {
      reason: "broken",
      stat: "workshop",
      costMilli: null,
      evidence: { atMm: 2_401_000, fromStart: false, speedPm: 750 },
    };
    expect(headline(broken)).toBe(
      "¡A Peregrina se le rompieron las alas a los 2401 m! Quizás deberías pasar por el Taller a repararlas.",
    );
    expect(evidence(broken)).toBe("alas rotas en 2401 m, velocidad ×0.75");
  });

  it("words every cause with its numbers", () => {
    const items: AdviceItem[] = [
      {
        ...base,
        reason: "cruise",
        stat: "agility",
        evidence: { agility: 531, winnerAgility: 722, middleMilli: 9000, curvesMilli: 15_000 },
      },
      {
        ...base,
        reason: "start",
        stat: "technique",
        evidence: { deltaTicks: 31, accelMms2: 200, winnerAccelMms2: 500 },
      },
      { ...base, reason: "stall", stat: "technique", evidence: { jumpsFailed: 2, ticks: 40 } },
      {
        reason: "landings",
        stat: "technique",
        costMilli: null,
        evidence: { count: 2, lossMms: 8490, landPm: 830, winnerLandPm: 890 },
      },
      {
        reason: "overheat",
        stat: "courage",
        costMilli: null,
        evidence: { ticks: 5, heatCap: 51_500 },
      },
      {
        reason: "heatCapped",
        stat: "courage",
        costMilli: null,
        evidence: { atMm: 1_450_000, energyLeft: 30_000, heatCap: 69_000 },
      },
      {
        ...base,
        reason: "pace",
        stat: "intelligence",
        evidence: {
          pace: [9, -44, -24],
          winnerPace: [-43, 37, 0],
          centrePm: -2,
          winnerCentrePm: 0,
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
        evidence: { skillIds: ["last-gasp", "corner-carver"], pAct: 857 },
      },
      {
        reason: "worn",
        stat: "workshop",
        costMilli: null,
        evidence: { durabilityEnd: 35_000, durabilityMax: 100 },
      },
    ];
    expect(items.map(evidence)).toEqual([
      "crucero más lento: agilidad 531 contra 722 (0.60 s en el medio, 1.00 s en curvas) · ≈2.31 s",
      "salida lenta: aceleración 0.20 contra 0.50 m/s² · ≈2.31 s",
      "2 saltos fallidos, detenida 2.67 s · ≈2.31 s",
      "2 aterrizajes -8.49 m/s; conserva 830 ‰ contra 890 ‰ de la ganadora",
      "sobrecalor 5 ticks con tope de calor 51.5",
      "el calor frenó el boost desde los 1450 m (tope 69.0); energía sin usar 30.0",
      "ritmo +9/-44/-24 ‰ contra -43/+37/0 ‰, peor en el medio; centro -2 contra 0 ‰ (letra A en Remate) · ≈2.31 s",
      "energía sin usar 30.0: el plan no vio 40.0 (error -120 ‰)",
      `no se activaron ${labels.skillName("last-gasp")} y ${labels.skillName("corner-carver")} (p 857 ‰)`,
      "alas gastadas: 35 de 100 de durabilidad",
    ]);
    expect(items.map((i) => headline(i).split("! ")[1])).toEqual([
      "Quizás deberías entrenar Agilidad.",
      "Quizás deberías entrenar Técnica.",
      "Quizás deberías entrenar Técnica.",
      "Quizás deberías entrenar Técnica.",
      "Quizás deberías entrenar Coraje.",
      "Quizás deberías entrenar Coraje.",
      "Quizás deberías entrenar Inteligencia.",
      "Quizás deberías entrenar Inteligencia.",
      "Quizás deberías entrenar Inteligencia.",
      "Quizás deberías pasar por el Taller a repararlas.",
    ]);
  });
});
