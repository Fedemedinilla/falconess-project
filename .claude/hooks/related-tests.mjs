// PostToolUse hook: run the tests related to the edited file when it lives under packages/.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const input = JSON.parse(readFileSync(0, "utf8") || "{}");
const filePath = input?.tool_input?.file_path ?? input?.tool_input?.path;
if (!filePath) process.exit(0);
const rel = relative(process.cwd(), resolve(process.cwd(), filePath)).replaceAll("\\", "/");
if (!rel.startsWith("packages/") || !/\.(ts|json)$/.test(rel)) process.exit(0);

const res = spawnSync("pnpm", ["-s", "vitest", "related", rel, "--run", "--reporter=dot"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});
process.exit(res.status === 0 ? 0 : 0); // informative only; never block on PostToolUse
