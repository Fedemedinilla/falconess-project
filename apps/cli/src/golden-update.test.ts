import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadContent } from "@falconess/content";
import { canonicalJson, GOLDEN_SCENARIOS, runGoldenScenario } from "@falconess/sim";
import { afterEach, describe, expect, it } from "vitest";
import { ADR_REMINDER, GOLDEN_DIR, runGoldenUpdate } from "./golden-update.js";

const content = loadContent();
const NAME = "g10-sprint-edge";
const scenario = GOLDEN_SCENARIOS.find((s) => s.name === NAME);

let dirs: string[] = [];
function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), "golden-update-"));
  dirs.push(dir);
  return join(dir, "v1");
}
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

describe("pnpm golden:update", () => {
  it("targets tests/golden/v1 of the checkout", () => {
    expect(GOLDEN_DIR.replaceAll("\\", "/")).toMatch(/\/tests\/golden\/v1\/?$/);
  });

  it("writes nothing without --yes and prints the ADR reminder", () => {
    const dir = scratch();
    const r = runGoldenUpdate(["--dir", dir], content);
    expect(r.code).toBe(1);
    expect(r.lines.join("\n")).toContain(ADR_REMINDER);
    expect(existsSync(dir)).toBe(false);
  });

  it("rejects unknown options and scenarios, and accepts pnpm's bare --", () => {
    expect(runGoldenUpdate(["--yes", "--force"], content).code).toBe(64);
    expect(runGoldenUpdate(["--yes", "--only", "g13-nowhere"], content).code).toBe(64);
    expect(runGoldenUpdate(["--", "--help"], content).code).toBe(0);
  });

  it("writes canonical JSON, then reports unchanged, changed and stale files", () => {
    if (scenario === undefined) throw new Error(`${NAME} is not a golden scenario`);
    const dir = scratch();
    const file = join(dir, `${NAME}.json`);
    const args = ["--", "--yes", "--only", NAME, "--dir", dir];

    const first = runGoldenUpdate(args, content);
    expect(first.code).toBe(0);
    expect(first.lines[0]).toMatch(new RegExp(`^new +${NAME}\\.json`));
    expect(first.lines.join("\n")).toContain(ADR_REMINDER);
    const text = canonicalJson(runGoldenScenario(content, scenario));
    expect(readFileSync(file, "utf8")).toBe(text);
    expect(text.endsWith("}")).toBe(true);

    const again = runGoldenUpdate(args, content);
    expect(again.lines[0]).toMatch(new RegExp(`^unchanged +${NAME}\\.json`));
    expect(again.lines.join("\n")).not.toContain(ADR_REMINDER);

    writeFileSync(file, text.replace('"ticks":', '"ticks":1'));
    writeFileSync(join(dir, "g00-old.json"), "{}");
    const changed = runGoldenUpdate(args, content);
    expect(changed.lines[0]).toMatch(/^changed +g10-sprint-edge\.json .*\$\.ticks: 1\d+ → \d+/);
    expect(changed.lines).toContainEqual(expect.stringMatching(/^stale +g00-old\.json/));
    expect(readFileSync(file, "utf8")).toBe(text);
  });
});
