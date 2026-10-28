import type { RunInput } from "@falconess/schema";
import { describe, expect, it } from "vitest";
import { parseSavedRun, SAVE_SCHEMA_VERSION, type SavedRun, serializeRun } from "./run";

const START: RunInput = {
  kind: "start",
  falconessId: "peregrina",
  hangar: ["shiden", "mule", "nimbus", "falke"],
  parents: [],
};
const RUN: SavedRun = {
  schemaVersion: SAVE_SCHEMA_VERSION,
  rulesetVersion: "v1",
  seed: "42",
  inputs: [START, { kind: "train:agility" }, { kind: "workshop", ops: [{ op: "repair" }] }],
};

describe("saved run format", () => {
  it("round-trips through one line of JSON with a fixed field order", () => {
    const text = serializeRun(RUN);
    expect(text).not.toContain("\n");
    expect(text.startsWith('{"schemaVersion":1,"rulesetVersion":"v1","seed":"42","inputs":[')).toBe(
      true,
    );
    expect(parseSavedRun(text, "v1")).toEqual({ ok: true, run: RUN });
  });

  it("accepts the replay line of pnpm play, on the current ruleset", () => {
    const line = `replay: ${JSON.stringify({ seed: "42", inputs: RUN.inputs })}`;
    expect(parseSavedRun(line, "v1")).toEqual({ ok: true, run: RUN });
  });

  it("fills the schema defaults of the inputs (parents)", () => {
    const text = JSON.stringify({
      seed: "7",
      inputs: [{ kind: "start", falconessId: "caracara", hangar: ["mule"] }],
    });
    const parsed = parseSavedRun(text, "v1");
    expect(parsed.ok && parsed.run.inputs[0]).toEqual({
      kind: "start",
      falconessId: "caracara",
      hangar: ["mule"],
      parents: [],
    });
  });

  it("names what is wrong with a bad paste", () => {
    expect(parseSavedRun("{nope", "v1")).toMatchObject({ ok: false, error: "json" });
    expect(parseSavedRun('{"seed":"1","inputs":[]}', "v1")).toMatchObject({
      ok: false,
      error: "format",
    });
    expect(parseSavedRun('{"seed":"1","inputs":[{"kind":"rest"}]}', "v1")).toMatchObject({
      ok: false,
      error: "format",
    });
    expect(
      parseSavedRun(JSON.stringify({ ...RUN, inputs: [START, { kind: "fly" }] }), "v1"),
    ).toMatchObject({ ok: false, error: "format" });
    expect(parseSavedRun(JSON.stringify({ ...RUN, schemaVersion: 2 }), "v1")).toMatchObject({
      ok: false,
      error: "version",
    });
    expect(parseSavedRun(JSON.stringify({ ...RUN, extra: 1 }), "v1")).toMatchObject({
      ok: false,
      error: "format",
    });
  });
});
