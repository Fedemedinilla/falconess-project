import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { contentLabels, runnerEventLines, TIMELINE_CELLS, whyModel } from "@falconess/race-view";
import { BOOST_MODES, RaceLog, SprintPlanCause, SprintPlanReason } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { getContent, simContext } from "../content/load";
import { defaultForm, runFreeRace } from "./free-race";
import { RUNNER_FLAGS } from "./playback";
import { raceView } from "./view";
import {
  eventText,
  finishMargin,
  finishTime,
  metres,
  modesText,
  runnerName,
  secsMilli,
  sinkText,
  withSign,
} from "./words";

const content = getContent();
const labels = contentLabels(content);
const ctx = simContext();

/** The CLI's canyon fixture: hp empties, worn wings break, an overheat, heat to energy. */
const canyon = RaceLog.parse(
  JSON.parse(
    readFileSync(
      fileURLToPath(
        new URL("../../../cli/src/race/__fixtures__/logs/canyon.json", import.meta.url),
      ),
      "utf8",
    ),
  ),
);

describe("race words", () => {
  it("has a text for every key built at run time", () => {
    const keys = [
      ...BOOST_MODES.map((m) => `ui.race.mode.${m}`),
      ...SprintPlanCause.options.map((c) => `ui.race.plan.cause.${c}`),
      ...SprintPlanReason.options.map((r) => `ui.race.plan.reason.${r}`),
      ...RUNNER_FLAGS.map((f) => `ui.race.flag.${f}`),
      ...TIMELINE_CELLS.filter((c) => c !== "after").map((c) => `ui.race.timeline.cell.${c}`),
      ...["start", "middle", "final"].map((p) => `ui.race.phase.${p}`),
    ];
    expect(keys.filter((k) => !content.text.has(k))).toEqual([]);
  });

  it("writes numbers in Spanish style", () => {
    expect(metres(1_234_567)).toBe("1235");
    expect(metres(12_345_678)).toBe("12.346");
    expect(metres(1234, 2)).toBe("1,23");
    expect(secsMilli(1_644_830, 2)).toBe("109,66");
    expect(withSign("1,20")).toBe("+1,20");
    expect(withSign("−0,40")).toBe("−0,40");
    expect(withSign("0,00")).toBe("0,00");
  });

  it("names rivals and neutral fixtures instead of showing their ids", () => {
    const log = runFreeRace(ctx, defaultForm(content));
    const rival = log.entries.find((e) => e.runnerId === "rival-1");
    if (!rival) throw new Error("no rival-1");
    expect(runnerName(rival, labels)).toBe("Rival 1");
    const neutral = runFreeRace(ctx, { ...defaultForm(content), field: "neutral" });
    expect(neutral.entries.map((e) => runnerName(e, labels)).slice(0, 4)).toEqual([
      "Picada 1",
      "Suspensión 1",
      "Planeo 1",
      "Rasante 1",
    ]);
  });

  it("words times and margins from the log", () => {
    const [first, second] = canyon.results;
    if (!first || !second) throw new Error("no results");
    expect(finishTime(first)).toBe(`${secsMilli(first.finishMilli ?? 0, 2)} s`);
    expect(finishMargin(first)).toBe("—");
    expect(finishMargin(second)).toBe(`+${metres(second.marginMm ?? 0, 2)} m`);
  });

  it("tells every event of the canyon fixture without a missing placeholder", () => {
    for (const entry of canyon.entries)
      for (const line of runnerEventLines(canyon, entry.laneIndex)) {
        const text = eventText(line.item, line.tick, canyon, labels);
        expect(text, line.item.kind).not.toMatch(/\{[a-z]+\}|ui\.race|undefined|NaN/);
      }
  });

  it("words the why of every runner: the same sinks as the ledger", () => {
    const view = raceView(canyon, labels);
    const winner = view.byPlace[0];
    if (!winner) throw new Error("no winner");
    const texts = view.byPlace.flatMap((r) => whyModel(canyon, r, winner).sinks.map(sinkText));
    expect(texts.some((t) => t.startsWith("Sin hp en "))).toBe(true);
    expect(texts.some((t) => t.startsWith("Alas rotas"))).toBe(true);
    expect(texts.some((t) => t.startsWith("Sobrecalor"))).toBe(true);
    for (const t of texts) expect(t).not.toMatch(/\{[a-z]+\}|undefined|NaN/);
    for (const r of view.byPlace) {
      const modes = modesText(whyModel(canyon, r, winner).modes);
      expect(modes).not.toMatch(/\{|ui\.race/);
    }
  });

  it("gathers names, liveries, badges and lane pins once per log", () => {
    const view = raceView(canyon, labels);
    expect(view.runners.map((r) => r.lane)).toEqual(canyon.entries.map((_, i) => i));
    expect(view.byPlace.map((r) => r.lane)).toEqual(canyon.results.map((r) => r.lane));
    expect(view.player?.name).toBe("Peregrina");
    expect(view.player?.livery).toEqual(content.getManufacturer("koryu").palette);
    const pins = view.runners.flatMap((r) => r.pins);
    expect(pins.some((p) => p.kind === "trouble")).toBe(true);
    for (const r of view.runners) {
      const ticks = r.badges.map((b) => b.tick);
      expect(ticks).toEqual([...ticks].sort((a, b) => a - b));
    }
  });
});
