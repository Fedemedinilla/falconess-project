import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

// `pnpm sim:batch` end to end with the fake engine (in process, one worker): what CI sees.
const SCRIPT = fileURLToPath(new URL("./sim-batch.ts", import.meta.url));
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "falconess-sim-batch-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const BASE = ["--engine", "fake", "--runs", "400", "--scenarios", "S1", "--workers", "1"];

function batch(...args: string[]): { status: number | null; stderr: string } {
  const r = spawnSync(process.execPath, ["--import", "tsx", SCRIPT, ...BASE, ...args], {
    cwd: ROOT,
    encoding: "utf8",
  });
  return { status: r.status, stderr: r.stderr };
}

describe("pnpm sim:batch (end to end, fake engine)", () => {
  const report = join(dir, "balance.json");

  it("writes its report and Markdown when the baseline has another report schema (finding T3)", () => {
    expect(batch("--report", report).status).toBe(0);
    const json = JSON.parse(readFileSync(report, "utf8"));
    const other = join(dir, "other.json");
    writeFileSync(other, JSON.stringify({ ...json, metadata: { ...json.metadata, gitSha: "x" } }));
    const md = join(dir, "x.md");
    const r = batch(
      "--report",
      join(dir, "current.json"),
      "--baseline",
      other,
      "--baseline-from",
      "run 7 (abc1234)",
      "--markdown",
      md,
    );
    expect(r.status, r.stderr).toBe(0);
    expect(r.stderr).toMatch(/warning: Baseline .*other\.json \(run 7 \(abc1234\)\) skipped/);
    const text = readFileSync(md, "utf8");
    expect(text).toMatch(/^> Baseline .* skipped, another report schema .*gitSha.*no diff/m);
    expect(text).not.toContain("### Diff against the baseline");
    // a readable baseline is diffed, and its source named in the diff header
    const diffMd = join(dir, "diff.md");
    const ok = batch(
      "--report",
      join(dir, "c2.json"),
      "--baseline",
      report,
      "--baseline-from",
      "run 8 (def5678)",
      "--markdown",
      diffMd,
    );
    expect(ok.status, ok.stderr).toBe(0);
    expect(readFileSync(diffMd, "utf8")).toMatch(/Baseline: .* · from run 8 \(def5678\)\./);
  }, 60_000);

  it("exits 1 when the wall time reaches --max-wall-ms (docs/race-engine.md 24.4)", () => {
    const r = batch("--report", join(dir, "slow.json"), "--max-wall-ms", "1");
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/over the 1 ms budget/);
    expect(batch("--report", join(dir, "fast.json"), "--max-wall-ms", "600000").status).toBe(0);
  }, 60_000);
});
