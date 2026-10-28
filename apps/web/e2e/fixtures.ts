import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test as base, expect, type Page } from "@playwright/test";

/** The interface and game texts, read from the same es.json the page shows. */
const ES: Readonly<Record<string, string>> = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../packages/content/text/es.json", import.meta.url)),
    "utf8",
  ),
);

/** An es.json text with its `{name}` placeholders filled (small integers only). */
export function t(key: string, vars: Readonly<Record<string, string | number>> = {}): string {
  const template = ES[key];
  if (template === undefined) throw new Error(`es.json has no key ${key}`);
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (whole, name: string) =>
    vars[name] === undefined ? whole : String(vars[name]),
  );
}

/** A regular expression for an es.json text whose placeholders can be anything. */
export function textPattern(key: string): RegExp {
  const escaped = t(key).replace(/[.*+?^$()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replace(/\{[A-Za-z0-9_]+\}/g, ".+?")}$`);
}

export const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"] as const;

export function isFontUrl(url: string): boolean {
  try {
    return (FONT_HOSTS as readonly string[]).includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * Everything the page says is wrong: console errors and uncaught exceptions. Each test that uses
 * the `page` fixture fails on any of them.
 */
export function watchErrors(page: Page, options: { allowFontFailures?: boolean } = {}): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    if (options.allowFontFailures && isFontUrl(message.location().url)) return;
    errors.push(`console: ${message.text()} (${message.location().url})`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  return errors;
}

/** Answer Google Fonts with an empty stylesheet: the tests do not need the network. */
export async function stubFonts(page: Page): Promise<void> {
  await page.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) =>
    route.fulfill({ status: 200, contentType: "text/css", body: "" }),
  );
}

type Fixtures = {
  /** Console errors and page errors seen so far (the fixture fails the test on any). */
  errors: string[];
};

/** The app tests: fonts stubbed, clipboard allowed, failing on any console error. */
export const test = base.extend<Fixtures>({
  errors: [
    async ({ page }, use) => {
      const errors = watchErrors(page);
      await use(errors);
      expect(errors, "console errors or uncaught exceptions").toEqual([]);
    },
    { auto: true },
  ],
  page: async ({ page, context }, use) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await stubFonts(page);
    await use(page);
  },
});

export { expect };
