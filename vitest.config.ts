import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      { test: { name: "rng", root: "packages/rng" } },
      { test: { name: "schema", root: "packages/schema" } },
      { test: { name: "sim", root: "packages/sim" } },
      { test: { name: "content", root: "packages/content" } },
      { test: { name: "cli", root: "apps/cli" } },
      { test: { name: "repo", root: ".", include: ["tests/repo/**/*.test.ts"] } },
    ],
  },
});
