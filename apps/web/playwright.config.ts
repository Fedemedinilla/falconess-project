import { existsSync } from "node:fs";
import { chromium, defineConfig, devices } from "@playwright/test";

/**
 * Browser tests of the tester page (`pnpm --filter @falconess/web test:e2e`, which builds dist/
 * and dist-artifact/ first). Chromium only.
 *
 * - `app`: seasons played by clicking, goal-race replays, copy and load, free race; against
 *   `vite preview` of dist/ (the production bundle the Artifact inlines). `E2E_DEV=1` runs them
 *   against the dev server instead, where React's development warnings count as console errors.
 * - `artifact`: dist-artifact/falconess-playtest.html wrapped the way the host wraps it, with
 *   every request blocked except Google Fonts.
 * - `shots`: screenshots for review into .work/ui/shots/ (`test:e2e:shots`, never in CI).
 *
 * Google Fonts: the app tests answer them with an empty stylesheet (the fallback stacks show),
 * the artifact and the screenshots load them. Behind the agent proxy of a cloud container
 * (HTTPS_PROXY), the browser goes through it.
 */

const PORT = 4317;
const dev = process.env.E2E_DEV === "1";
const shots = process.env.E2E_SHOTS === "1";

/** The browser Playwright ships with, else the preinstalled one of the cloud container. */
function executablePath(): string | undefined {
  if (existsSync(chromium.executablePath())) return undefined;
  const preinstalled = "/opt/pw-browsers/chromium";
  return existsSync(preinstalled) ? preinstalled : undefined;
}

const proxyServer = process.env.HTTPS_PROXY ?? process.env.https_proxy;
const path = executablePath();

export default defineConfig({
  testDir: "e2e",
  outputDir: "../../.work/ui/e2e-results",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: process.env.CI ? 2 : 4,
  reporter: process.env.CI ? [["list"], ["github"]] : [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 800 },
    baseURL: `http://127.0.0.1:${PORT}/`,
    locale: "es-AR",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // the agent proxy re-signs TLS with its own CA, which Chromium does not trust
    ignoreHTTPSErrors: proxyServer !== undefined,
    launchOptions: {
      ...(path ? { executablePath: path } : {}),
      ...(proxyServer ? { proxy: { server: proxyServer, bypass: "127.0.0.1,localhost" } } : {}),
    },
  },
  projects: [
    { name: "app", testMatch: /(season|run|free-race|explain)\.spec\.ts$/ },
    { name: "artifact", testMatch: /artifact\.spec\.ts$/ },
    ...(shots ? [{ name: "shots", testMatch: /shots\.spec\.ts$/ }] : []),
  ],
  webServer: {
    command: dev
      ? `vite --port ${PORT} --strictPort --host 127.0.0.1`
      : `vite preview --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
