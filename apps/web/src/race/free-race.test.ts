import { buildField, contentLabels } from "@falconess/race-view";
import {
  freezeEntry,
  generateField,
  neutralFixtureEntry,
  PLAYER_RUNNER_ID,
  simulateRace,
} from "@falconess/sim";
import { describe, expect, it } from "vitest";
import { simContext } from "../content/load";
import {
  cliArgs,
  defaultForm,
  fieldSpecOf,
  frameChoices,
  intField,
  normalizeForm,
  runFreeRace,
  skillChoices,
} from "./free-race";

const ctx = simContext();
const base = defaultForm(ctx.content);

describe("the free race form", () => {
  it("gives a full race at rest: the player against rivals, frames and events logged", () => {
    const log = runFreeRace(ctx, base);
    expect(log.detail).toBe("full");
    expect(log.frames).toBeDefined();
    expect(log.events).toBeDefined();
    expect(log.courseId).toBe(base.courseId);
    expect(log.entries.filter((e) => e.runnerId === PLAYER_RUNNER_ID)).toHaveLength(1);
    expect(log.entries).toHaveLength(ctx.content.getCourse(base.courseId).entries);
  });

  it("builds the field exactly like pnpm sim:race does", () => {
    const form = normalizeForm(ctx, {
      ...base,
      seed: "fr-7",
      skills: ["stoop-strike"],
      parts: ["koryu-firmware"],
      statsMode: "uniform",
      stats: 420,
      turn: 20,
    });
    const course = ctx.content.getCourse(form.courseId);
    const engine = { generateField, freezeEntry, neutralFixtureEntry };
    const entries = buildField(engine, ctx, course, form.seed, fieldSpecOf(form));
    const cli = simulateRace(ctx.ruleset, entries, course, form.seed, { detail: "full" });
    expect(runFreeRace(ctx, form)).toEqual(cli);
    expect(cliArgs(form)).toBe(
      "pnpm sim:race -- --seed fr-7 --course ridge --falconess peregrina --parts koryu-firmware --skills stoop-strike --stats 420 --turn 20",
    );
  });

  it("runs eight neutral fixtures, two per style", () => {
    const form = { ...base, field: "neutral" as const, neutralStats: 500 };
    const log = runFreeRace(ctx, form);
    expect(log.entries.map((e) => e.style)).toEqual([
      "dive",
      "hover",
      "glide",
      "ground",
      "dive",
      "hover",
      "glide",
      "ground",
    ]);
    expect(cliArgs(form)).toBe("pnpm sim:race -- --seed 1 --course ridge --neutral --stats 500");
  });

  it("drops choices that do not fit the Falconess and clamps the numbers", () => {
    const caracara = normalizeForm(ctx, {
      ...base,
      falconessId: "caracara",
      frameId: "peregrina-signature",
      skills: ["stoop-strike", "scavenger-stride", "scavenger-stride"],
      parts: ["nitro", "koryu-firmware"],
      stats: 99_999,
      turn: -4,
      seed: "  ",
    });
    expect(caracara.frameId).toBe("");
    expect(caracara.skills).toEqual(["scavenger-stride"]);
    expect(caracara.parts).toEqual(["koryu-firmware"]);
    expect(caracara.stats).toBe(1200);
    expect(caracara.turn).toBe(0);
    expect(caracara.seed).toBe("1");
  });

  it("offers her signature frame first and only the skills she can carry", () => {
    const frames = frameChoices(ctx.content, "peregrina");
    expect(frames[0]).toBe("peregrina-signature");
    expect(frames).not.toContain("caracara-signature");
    const skills = skillChoices(ctx.content, "peregrina");
    expect(skills).toContain("stoop-strike");
    expect(skills).not.toContain("scavenger-stride");
  });

  it("reads integers from the form fields", () => {
    expect(intField("42", 1, 100, 7)).toBe(42);
    expect(intField(" 400 ", 1, 100, 7)).toBe(100);
    expect(intField("", 1, 100, 7)).toBe(7);
    expect(intField("4.5", 1, 100, 7)).toBe(7);
    expect(intField("-3", 1, 100, 7)).toBe(7);
  });

  it("names every runner of a free race from content", () => {
    const labels = contentLabels(ctx.content);
    const log = runFreeRace(ctx, base);
    const player = log.entries.find((e) => e.runnerId === PLAYER_RUNNER_ID);
    if (!player) throw new Error("no player");
    expect(labels.runnerName(player)).toBe("Peregrina");
    expect(labels.livery(player.manufacturer)?.primary).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
