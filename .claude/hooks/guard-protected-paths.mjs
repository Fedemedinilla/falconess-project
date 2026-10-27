// PreToolUse hook: block edits to protected paths unless .claude/allow-protected exists.
// Reads the tool input JSON from stdin; exit code 2 blocks the tool call.
import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const input = JSON.parse(readFileSync(0, "utf8") || "{}");
const filePath = input?.tool_input?.file_path ?? input?.tool_input?.path;
if (!filePath) process.exit(0);

const root = process.cwd();
const rel = relative(root, resolve(root, filePath)).replaceAll("\\", "/");
if (existsSync(resolve(root, ".claude/allow-protected"))) process.exit(0);

const PROTECTED = [/^tests\/golden\//, /^docs\/characters\//, /^packages\/sim\/src\/rulesets\//];
let blocked = PROTECTED.some((re) => re.test(rel));

if (!blocked && rel.endsWith(".json") && existsSync(resolve(root, rel))) {
  try {
    const json = JSON.parse(readFileSync(resolve(root, rel), "utf8"));
    if (json && json.handwritten === true) blocked = true;
  } catch {
    // not JSON we can parse: not our concern
  }
}

if (blocked) {
  console.error(
    `Blocked: ${rel} is protected (tests/golden, docs/characters, rulesets, or handwritten content). ` +
      "Ask for approval, then `touch .claude/allow-protected` for this session.",
  );
  process.exit(2);
}
process.exit(0);
