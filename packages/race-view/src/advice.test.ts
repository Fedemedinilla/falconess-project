import { loadContent } from "@falconess/content";
import type { EntryInput, RaceEntry, RaceLog, RaceStats, Style } from "@falconess/schema";
import {
  freezeEntry,
  freezeSkill,
  generateField,
  neutralFixtureEntry,
  RULESET_V1,
  type SimContext,
  simulateRace,
} from "@falconess/sim";
import { describe, expect, it } from "vitest";
import {
  ADVICE_MAX,
  ADVICE_MIN_MILLI,
  type AdviceItem,
  type AdviceReason,
  adviceCauses,
  raceAdvice,
} from "./advice.js";
import { buildField, uniformStats } from "./field.js";
import { runnersInPlaceOrder } from "./log.js";

// Real engine logs: neutral fixtures (spec 3.4) that differ from a strong runner in one stat or
// one frame value, and a field of real frames. Every expectation reads its numbers from the log.

const ctx: SimContext = { ruleset: RULESET_V1, content: loadContent() };
const engine = { generateField, freezeEntry, neutralFixtureEntry };

type Spec = {
  id: string;
  style?: Style;
  stats?: Partial<RaceStats>;
  /** Frame values set on the frozen entry (energy, durability at the gun). */
  patch?: Partial<Pick<RaceEntry, "energy" | "durabilityStart">>;
  skills?: string[];
};

const STRONG = uniformStats(900);

function fixtureRace(
  courseId: string,
  seed: string,
  specs: Spec[],
  detail: "full" | "results" = "full",
): RaceLog {
  const entries = specs.map((s, laneIndex) => ({
    ...neutralFixtureEntry({
      runnerId: s.id,
      laneIndex,
      style: s.style ?? "hover",
      stats: { ...STRONG, ...s.stats },
      skills: (s.skills ?? []).map((id) => freezeSkill(ctx.content, id)),
    }),
    ...s.patch,
  }));
  return simulateRace(ctx.ruleset, entries, ctx.content.getCourse(courseId), seed, { detail });
}

/** One strong runner and seven who each fall short in one way. */
const MIX: Spec[] = [
  { id: "strong" },
  { id: "stamina", stats: { stamina: 100 } },
  { id: "agility", stats: { agility: 300 } },
  { id: "technique", stats: { technique: 1 } },
  {
    id: "intelligence",
    stats: { intelligence: 1 },
    skills: ["canyon-sense", "last-gasp", "water-skimmer"],
  },
  { id: "courage", stats: { courage: 1 } },
  { id: "broken", patch: { durabilityStart: 0 } },
  { id: "worn", patch: { durabilityStart: 45 } },
];
// seed "advice-4" since the canyon lost its wind (ADR-0007): "advice-1" let the worn runner win
const canyon = fixtureRace("canyon", "advice-4", MIX);
const canyonResults = fixtureRace("canyon", "advice-4", MIX, "results");
/** The sprint has curves. */
const sprint = fixtureRace("sprint", "advice-1", [
  { id: "strong" },
  { id: "agility", stats: { agility: 300 } },
]);
/** The ridge has two jumps: a small tank with no technique cannot lift for either. */
const ridge = fixtureRace("ridge", "advice-1", [
  { id: "strong", style: "dive" },
  { id: "tank", style: "dive", stats: { technique: 1 }, patch: { energy: 20 } },
  { id: "landing", style: "dive", stats: { technique: 300 } },
]);

function frameInput(
  runnerId: string,
  frameId: string,
  parts: string[],
  stats: RaceStats,
  learnedSkills: string[],
  durability: number | null,
): EntryInput {
  return {
    runnerId,
    kind: "rival",
    falconessId: null,
    baseStats: stats,
    mood: 0,
    positionAptitude: { lead: "B", pack: "A", stalk: "B", closer: "B" },
    frameId,
    parts,
    quirks: [],
    learnedSkills,
    durability,
  };
}
/**
 * Real frames: a Steinhaus frame that overheats under its licence, a worn Shiden that breaks. Seed
 * "pt8-canyon" since the canyon lost its wind (ADR-0007): on "pt1-canyon" the Steinhaus no longer
 * overheats.
 */
const frames = (() => {
  const course = ctx.content.getCourse("canyon");
  const entries = buildField(engine, ctx, course, "pt8-canyon", {
    kind: "entries",
    inputs: [
      frameInput("horizon", "horizon", ["altair-battery"], uniformStats(600), [], null),
      frameInput("shiden", "shiden", [], uniformStats(600), ["corner-carver", "pack-shadow"], 8),
      frameInput(
        "erzherzog",
        "erzherzog",
        ["steinhaus-stabilizer"],
        { agility: 600, stamina: 640, technique: 620, courage: 580, intelligence: 560 },
        ["water-skimmer", "clean-start"],
        null,
      ),
    ],
  });
  return simulateRace(ctx.ruleset, entries, course, "pt8-canyon", { detail: "full" });
})();

function laneOf(log: RaceLog, runnerId: string): number {
  const entry = log.entries.find((e) => e.runnerId === runnerId);
  if (!entry) throw new Error(`no runner ${runnerId}`);
  return entry.laneIndex;
}

function runner(log: RaceLog, runnerId: string) {
  const r = runnersInPlaceOrder(log).find((x) => x.entry.runnerId === runnerId);
  if (!r) throw new Error(`no runner ${runnerId}`);
  return r;
}

function winnerOf(log: RaceLog) {
  const w = runnersInPlaceOrder(log)[0];
  if (!w) throw new Error("no winner");
  return w;
}

function cause<R extends AdviceReason>(
  log: RaceLog,
  runnerId: string,
  reason: R,
): AdviceItem & { reason: R } {
  const found = adviceCauses(log, laneOf(log, runnerId)).find(
    (c): c is AdviceItem & { reason: R } => c.reason === reason,
  );
  if (!found) throw new Error(`${runnerId}: no ${reason} cause`);
  return found;
}

const reasons = (log: RaceLog, runnerId: string) =>
  adviceCauses(log, laneOf(log, runnerId)).map((c) => c.reason);

describe("the fields", () => {
  it("are won by the strong runner, and each short runner loses", () => {
    for (const log of [canyon, sprint, ridge]) expect(winnerOf(log).entry.runnerId).toBe("strong");
    expect(winnerOf(frames).entry.runnerId).toBe("horizon");
  });
});

describe("adviceCauses", () => {
  it("gives the winner nothing, and a lane the log does not have nothing", () => {
    for (const log of [canyon, sprint, ridge, frames]) {
      expect(adviceCauses(log, winnerOf(log).entry.laneIndex)).toEqual([]);
      expect(adviceCauses(log, 99)).toEqual([]);
    }
  });

  it("names Resistencia when her hp ran out before the winner's, timed at minimum speed", () => {
    const r = runner(canyon, "stamina");
    const w = winnerOf(canyon);
    const c = cause(canyon, "stamina", "hpEmpty");
    const at = r.result.ledger.hpEmptyMm;
    expect(c.stat).toBe("stamina");
    expect(c.evidence).toEqual({
      atMm: at,
      restMm: canyon.geometry.lengthMm - (at ?? 0),
      winnerAtMm: w.result.ledger.hpEmptyMm,
      inFinal: (at ?? 0) >= canyon.geometry.finalStartMm,
    });
    // what she lost at minimum speed is less than the time she ran there
    const empty = canyon.events?.find((e) => e.lane === r.entry.laneIndex && e.kind === "hpEmpty");
    expect(c.costMilli).toBeGreaterThan(ADVICE_MIN_MILLI);
    expect(c.costMilli).toBeLessThan((r.result.finishMilli ?? 0) - (empty?.tick ?? 0) * 1000);
    expect(raceAdvice(canyon, r.entry.laneIndex)[0]?.reason).toBe("hpEmpty");
  });

  it("names Coraje when she ran out in the final with the winner's reserve and more fatigue", () => {
    const r = runner(canyon, "courage");
    const w = winnerOf(canyon);
    const c = cause(canyon, "courage", "hpEmpty");
    expect(c.stat).toBe("courage");
    expect(c.evidence.inFinal).toBe(true);
    expect(r.derived?.stamDiv).toBe(w.derived?.stamDiv);
    expect(r.derived?.fatiguePm).toBeGreaterThan(w.derived?.fatiguePm ?? 0);
  });

  it("names Agilidad for the time lost at cruise in the middle phase and on curves", () => {
    const mid = cause(canyon, "agility", "cruise");
    expect(mid.stat).toBe("agility");
    expect(mid.evidence).toMatchObject({ agility: 300, winnerAgility: 900, curvesMilli: 0 });
    expect(mid.costMilli).toBe(mid.evidence.middleMilli);
    const curves = cause(sprint, "agility", "cruise");
    expect(curves.evidence.curvesMilli).toBeGreaterThan(0);
    expect(curves.evidence.middleMilli).toBeGreaterThan(0);
    expect(curves.costMilli).toBe(curves.evidence.middleMilli + curves.evidence.curvesMilli);
    // the same agility as the winner: no claim, whatever else differs
    for (const id of ["stamina", "technique", "intelligence", "courage", "broken", "worn"])
      expect(reasons(canyon, id)).not.toContain("cruise");
  });

  it("names Técnica for a slow start: the start phase's ticks against the winner", () => {
    const r = runner(canyon, "technique");
    const w = winnerOf(canyon);
    const c = cause(canyon, "technique", "start");
    const delta = (r.result.ledger.phaseTicks[0] ?? 0) - (w.result.ledger.phaseTicks[0] ?? 0);
    expect(c.stat).toBe("technique");
    expect(c.evidence).toEqual({
      deltaTicks: delta,
      accelMms2: r.derived?.segments[0]?.accelMms2,
      winnerAccelMms2: w.derived?.segments[0]?.accelMms2,
    });
    expect(c.costMilli).toBe(delta * 1000);
    expect(c.evidence.accelMms2).toBeLessThan(c.evidence.winnerAccelMms2);
  });

  it("names Técnica for failed jumps, by the ticks she stood still", () => {
    const L = runner(ridge, "tank").result.ledger;
    const c = cause(ridge, "tank", "stall");
    expect(L.jumpsFailed).toBeGreaterThan(0);
    expect(c).toMatchObject({
      stat: "technique",
      costMilli: L.stallTicks * 1000,
      evidence: { jumpsFailed: L.jumpsFailed, ticks: L.stallTicks },
    });
  });

  it("names Técnica for landings with a worse landing factor, without a time", () => {
    const r = runner(ridge, "landing");
    const c = cause(ridge, "landing", "landings");
    expect(c).toMatchObject({
      stat: "technique",
      costMilli: null,
      evidence: {
        count: r.result.ledger.jumpsOk,
        lossMms: r.result.ledger.landingLossMms,
        landPm: r.derived?.landPm,
        winnerLandPm: winnerOf(ridge).derived?.landPm,
      },
    });
    expect(c.evidence.count).toBe(2);
  });

  it("names Coraje for overheating under a cap courage raises", () => {
    const r = runner(frames, "erzherzog");
    const c = cause(frames, "erzherzog", "overheat");
    expect(r.result.ledger.overheatTicks).toBeGreaterThan(0);
    expect(c).toEqual({
      reason: "overheat",
      stat: "courage",
      costMilli: null,
      evidence: { ticks: r.result.ledger.overheatTicks, heatCap: r.derived?.heatCap },
    });
  });

  it("names Inteligencia for a slower pace from a lower centre, and for skills that missed", () => {
    const r = runner(canyon, "intelligence");
    const w = winnerOf(canyon);
    const pace = cause(canyon, "intelligence", "pace");
    expect(pace.stat).toBe("intelligence");
    expect(pace.evidence).toMatchObject({
      pace: r.derived?.pace,
      winnerPace: w.derived?.pace,
      centrePm: r.derived?.paceCentrePm,
      winnerCentrePm: w.derived?.paceCentrePm,
    });
    expect(pace.evidence.centrePm).toBeLessThan(pace.evidence.winnerCentrePm);
    expect(pace.costMilli).toBeGreaterThan(0);
    // the same intelligence as the winner: the draw alone is luck, not a tip
    for (const id of ["stamina", "agility", "technique", "courage", "broken", "worn"])
      expect(reasons(canyon, id)).not.toContain("pace");

    const skills = cause(canyon, "intelligence", "skills");
    expect(skills.stat).toBe("intelligence");
    expect(skills.evidence).toEqual({
      skillIds: r.result.ledger.skillsMissed,
      pAct: r.derived?.pAct,
    });
    expect(skills.evidence.skillIds.length).toBeGreaterThan(0);
    // speed skills: what each would have given at her cruise
    expect(skills.costMilli).toBeGreaterThan(0);
  });

  it("names the workshop for broken wings: from the gun, or from where they broke", () => {
    const r = runner(canyon, "broken");
    const c = cause(canyon, "broken", "broken");
    expect(c).toMatchObject({
      stat: "workshop",
      evidence: { atMm: null, fromStart: true, speedPm: 750 },
    });
    // every speed at 75 % from the gun: a quarter of her time
    expect(c.costMilli).toBe(Math.round(((r.result.finishMilli ?? 0) * 250) / 1000));

    const s = runner(frames, "shiden");
    const at = frames.events?.find(
      (e) => e.lane === s.entry.laneIndex && e.kind === "durabilityBroken",
    );
    const b = cause(frames, "shiden", "broken");
    expect(at).toBeDefined();
    expect(b.evidence).toEqual({ atMm: at?.posMm, fromStart: false, speedPm: 750 });
    expect(b.costMilli).toBe(
      Math.round((((s.result.finishMilli ?? 0) - (at?.tick ?? 0) * 1000) * 250) / 1000),
    );
  });

  it("names the workshop for wings worn below half, without a time", () => {
    const r = runner(canyon, "worn");
    expect(cause(canyon, "worn", "worn")).toEqual({
      reason: "worn",
      stat: "workshop",
      costMilli: null,
      evidence: { durabilityEnd: r.result.durabilityEnd, durabilityMax: 100 },
    });
    expect(reasons(canyon, "agility")).not.toContain("worn");
  });
});

/**
 * v1 never leaves energy at the line with hp intact (the surplus mode and the kick spend it, 9.3,
 * 9.4), so the two causes that need it are shown on a real log edited where they read.
 */
describe("energy left at the line (edited logs)", () => {
  const lane = laneOf(canyon, "agility");
  const r = runner(canyon, "agility");
  const d = canyon.derived[lane];
  if (!d) throw new Error("no derived row");
  const left = 30_000;
  const withLeft = (log: RaceLog): RaceLog => ({
    ...log,
    results: log.results.map((x) =>
      x.lane === lane ? { ...x, energyEnd: left, ledger: { ...x.ledger, energyLeft: left } } : x,
    ),
  });

  it("names Coraje when the heat gate held her boost in the final and energy was left", () => {
    expect(reasons(canyon, "agility")).not.toContain("heatCapped");
    const f = canyon.frames;
    if (!f) throw new Error("no frames");
    const row = f.runners[lane];
    if (!row) throw new Error("no frame row");
    const hot: RaceLog = withLeft({
      ...canyon,
      frames: {
        ...f,
        runners: f.runners.map((x, i) =>
          i === lane
            ? {
                ...x,
                heat: x.heat.map((h, k) =>
                  (x.posMm[k] ?? 0) >= canyon.geometry.finalStartMm ? d.capLim : h,
                ),
                energy: x.energy.map((e) => Math.max(e, left)),
              }
            : x,
        ),
      },
    });
    const first = row.posMm.find((p) => p >= canyon.geometry.finalStartMm);
    expect(cause(hot, "agility", "heatCapped")).toEqual({
      reason: "heatCapped",
      stat: "courage",
      costMilli: null,
      evidence: { atMm: first, energyLeft: left, heatCap: d.heatCap },
    });
    // telemetry governs at raw dissipation: courage does not move its gate
    const telemetry: RaceLog = {
      ...hot,
      derived: hot.derived.map((x) => (x.lane === lane ? { ...x, capLim: x.heatCap - 1000 } : x)),
    };
    expect(reasons(telemetry, "agility")).not.toContain("heatCapped");
  });

  it("names Inteligencia when the sprint plan did not see the energy left", () => {
    expect(reasons(canyon, "agility")).not.toContain("plan");
    const plan = canyon.events?.find((e) => e.lane === lane && e.kind === "sprintPlan");
    if (plan?.kind !== "sprintPlan") throw new Error("no sprint plan");
    const unseen = 40_000;
    const blind: RaceLog = withLeft({
      ...canyon,
      events: canyon.events?.map((e) =>
        e === plan ? { ...plan, energyPerceived: plan.energy - unseen } : e,
      ),
    });
    expect(cause(blind, "agility", "plan")).toEqual({
      reason: "plan",
      stat: "intelligence",
      costMilli: null,
      evidence: { energyLeft: left, unseen, planErrPm: d.planErrPm },
    });
    // with hp gone, the energy is stamina's: no boost without hp
    const empty: RaceLog = {
      ...blind,
      results: blind.results.map((x) =>
        x.lane === lane ? { ...x, ledger: { ...x.ledger, hpEmptyMm: 2_900_000 } } : x,
      ),
    };
    expect(reasons(empty, "agility")).not.toContain("plan");
    expect(r.result.ledger.hpEmptyMm).toBeNull();
  });
});

describe("raceAdvice", () => {
  const all = [canyon, canyonResults, sprint, ridge, frames];

  it("ranks the timed causes by their time, then the untimed ones", () => {
    for (const log of all)
      for (const e of log.entries) {
        const causes = adviceCauses(log, e.laneIndex);
        const timed = causes.filter((c) => c.costMilli !== null);
        const firstUntimed = causes.findIndex((c) => c.costMilli === null);
        if (firstUntimed >= 0) expect(firstUntimed).toBe(timed.length);
        const times = timed.map((c) => c.costMilli ?? 0);
        expect(times).toEqual([...times].sort((a, b) => b - a));
      }
    expect(reasons(canyon, "intelligence")).toEqual(["pace", "skills"]);
    expect(reasons(ridge, "landing").at(-1)).toBe("landings");
  });

  it("keeps at most two tips, each a timed cause of 0.1 s or more or an untimed one", () => {
    for (const log of all)
      for (const e of log.entries) {
        const tips = raceAdvice(log, e.laneIndex);
        const worth = adviceCauses(log, e.laneIndex).filter(
          (c) => c.costMilli === null || c.costMilli >= ADVICE_MIN_MILLI,
        );
        expect(tips).toEqual(worth.slice(0, ADVICE_MAX));
      }
    expect(raceAdvice(ridge, laneOf(ridge, "landing")).map((c) => c.reason)).toEqual([
      "start",
      "landings",
    ]);
  });

  it("leaves out a timed cause under 0.1 s", () => {
    const lane = laneOf(canyon, "technique");
    const w = winnerOf(canyon);
    const close: RaceLog = {
      ...canyon,
      results: canyon.results.map((x) =>
        x.lane === lane
          ? {
              ...x,
              ledger: {
                ...x.ledger,
                phaseTicks: [
                  (w.result.ledger.phaseTicks[0] ?? 0) + 1,
                  x.ledger.phaseTicks[1],
                  x.ledger.phaseTicks[2],
                ],
              },
            }
          : x,
      ),
    };
    expect(cause(close, "technique", "start").costMilli).toBe(1000);
    expect(raceAdvice(close, lane).map((c) => c.reason)).not.toContain("start");
  });

  it("reads a log without events: skills untimed, the plan never, the rest the same", () => {
    for (const id of ["stamina", "agility", "technique", "courage", "broken", "worn"])
      expect(adviceCauses(canyonResults, laneOf(canyonResults, id))).toEqual(
        adviceCauses(canyon, laneOf(canyon, id)),
      );
    const skills = cause(canyonResults, "intelligence", "skills");
    expect(skills.costMilli).toBeNull();
    expect(skills.evidence).toEqual(cause(canyon, "intelligence", "skills").evidence);
    expect(cause(canyonResults, "intelligence", "pace")).toEqual(
      cause(canyon, "intelligence", "pace"),
    );
  });
});
