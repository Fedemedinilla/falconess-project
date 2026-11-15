import { configDefaults, defineConfig } from "vitest/config";

/** The web tests that run natively (`web-flow`): text-free, no `import.meta.glob`. */
const WEB_FLOW = ["src/mobile/flow/**/*.test.ts", "scripts/e2e-saves.test.ts"];

export default defineConfig({
  test: {
    projects: [
      { test: { name: "rng", root: "packages/rng" } },
      { test: { name: "schema", root: "packages/schema" } },
      {
        // native ES modules (tsx loader): the race loop reads many imported constants, and the
        // module runner's export getters make it about 15 times slower
        test: {
          name: "sim",
          root: "packages/sim",
          benchmark: { include: [] },
          experimental: { viteModuleRunner: false },
          execArgv: ["--import", "tsx"],
        },
      },
      { test: { name: "content", root: "packages/content" } },
      { test: { name: "race-view", root: "packages/race-view" } },
      { test: { name: "cli", root: "apps/cli" } },
      {
        // pure helpers of the web app, in node (no DOM): content loader, controller, formats,
        // routes and the artifact post-processing; Vite's module runner handles import.meta.glob
        test: {
          name: "web",
          root: "apps/web",
          include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
          exclude: [...configDefaults.exclude, ...WEB_FLOW],
          benchmark: { include: [] },
        },
      },
      {
        // the phone's flow model, text-free, in native ES modules (tsx loader) like `sim`: its
        // season walks play whole seasons, which the module runner makes about 15 times slower
        test: {
          name: "web-flow",
          root: "apps/web",
          include: WEB_FLOW,
          benchmark: { include: [] },
          experimental: { viteModuleRunner: false },
          execArgv: ["--import", "tsx"],
        },
      },
      {
        test: {
          name: "repo",
          root: ".",
          include: ["tests/repo/**/*.test.ts"],
          benchmark: { include: [] },
        },
      },
      {
        // `pnpm bench`: native ES modules (tsx loader) instead of Vite's module runner, whose
        // export getters would dominate the timing of the race loop
        test: {
          name: "sim-bench",
          root: "packages/sim",
          include: [],
          benchmark: { include: ["bench/**/*.bench.ts"], retainSamples: true },
          experimental: { viteModuleRunner: false },
          execArgv: ["--import", "tsx"],
        },
      },
    ],
  },
});
