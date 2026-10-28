/**
 * The tester page is published as a claude.ai Artifact: one HTML fragment the host wraps in its
 * own document. This turns Vite's single-file build into that fragment and lists every way the
 * result breaks the page contract (apps/web/README.md), so the build fails instead of the page.
 *
 * Pure string work: the Vite plugin in artifact-plugin.ts feeds it the built index.html.
 */

export const ARTIFACT_FILE = "falconess-playtest.html";
export const ARTIFACT_TITLE = "<title>Falconess · Pruebas</title>";
export const VIEWPORT_FIT_META = '<meta name="claude:viewport-fit-sides" content="cover">';
export const MAX_ARTIFACT_BYTES = 16 * 1024 * 1024;
const FONT_HOST = "https://fonts.googleapis.com/";

function between(html: string, open: RegExp, close: RegExp): string {
  const start = open.exec(html);
  if (!start) throw new Error(`artifact: ${open} not found in the built page`);
  const from = start.index + start[0].length;
  const end = close.exec(html.slice(from));
  if (!end) throw new Error(`artifact: ${close} not found in the built page`);
  return html.slice(from, from + end.index);
}

/** Every `<tag ...>...</tag>` block of `html`, in order, and `html` without them. */
function takeBlocks(html: string, tag: "script" | "style"): { blocks: string[]; rest: string } {
  const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, "gi");
  const blocks = html.match(re) ?? [];
  return { blocks, rest: html.replace(re, "") };
}

/**
 * Vite's single-file index.html → the published fragment: title, viewport-fit meta, the Google
 * Fonts stylesheet, the inlined styles, the body (the root div) and the inlined module script.
 * Doctype, html, head, body, charset and viewport metas and preconnect hints are dropped: the host
 * supplies the document.
 */
export function toArtifactPage(html: string): string {
  const head = between(html, /<head\b[^>]*>/i, /<\/head>/i);
  const body = between(html, /<body\b[^>]*>/i, /<\/body>/i);

  const headScripts = takeBlocks(head, "script");
  const headStyles = takeBlocks(headScripts.rest, "style");
  const bodyScripts = takeBlocks(body, "script");

  const fontLinks = (headStyles.rest.match(/<link\b[^>]*>/gi) ?? []).filter(
    (link) => /\brel="stylesheet"/i.test(link) && link.includes(`href="${FONT_HOST}`),
  );
  const scripts = [...headScripts.blocks, ...bodyScripts.blocks].map((s) =>
    s.replace(/^<script\b[^>]*>/i, '<script type="module">'),
  );

  return `${[
    ARTIFACT_TITLE,
    VIEWPORT_FIT_META,
    ...fontLinks.map((l) => l.replace(/\s+/g, " ").replace(/\s*\/?>$/, ">")),
    ...headStyles.blocks.map((s) => s.replace(/^<style\b[^>]*>/i, "<style>")),
    bodyScripts.rest.trim(),
    ...scripts,
  ].join("\n")}\n`;
}

/** The markup of the page outside its scripts (a script may name tags in its strings). */
function markupOnly(page: string): string {
  return page.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "<script></script>");
}

/** Every way `page` breaks the published page contract; empty when it holds. */
export function artifactProblems(page: string): string[] {
  const problems: string[] = [];
  const bytes = new TextEncoder().encode(page).length;
  if (bytes > MAX_ARTIFACT_BYTES) problems.push(`page is ${bytes} bytes, over 16 MB`);
  if (!page.startsWith(`${ARTIFACT_TITLE}\n${VIEWPORT_FIT_META}\n`))
    problems.push("page must start with its <title> and the viewport-fit meta");

  const markup = markupOnly(page);
  for (const tag of ["!doctype", "html", "head", "body"])
    if (new RegExp(`<\\/?${tag}\\b`, "i").test(page)) problems.push(`page has a <${tag}> tag`);
  for (const m of markup.matchAll(/\b(?:src|href)="([^"]*)"/gi)) {
    const url = m[1] ?? "";
    if (!url.startsWith(FONT_HOST)) problems.push(`external or relative load: ${url}`);
  }
  if (!/<style>[\s\S]+?<\/style>/.test(markup)) problems.push("no inlined <style>");
  if (!/<div id="root"><\/div>/.test(markup)) problems.push("no root div");
  if (!/<script type="module">[\s\S]+?<\/script>\s*$/.test(page))
    problems.push("page must end with the inlined module script");
  for (const call of ["window.alert", "window.confirm", "window.prompt", "window.print"])
    if (page.includes(call)) problems.push(`page calls ${call}`);
  // a route written as #/path (JSON Schema refs such as "#/definitions" in zod are not routes)
  if (
    /href="#\//.test(markup) ||
    /location\.(?:hash|href)\s*=\s*["'`]#\/|location\.replace\(\s*["'`]#\//.test(page)
  )
    problems.push("hash routes must be plain names, never #/path");
  return problems;
}
