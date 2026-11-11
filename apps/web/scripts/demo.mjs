// The standalone demo for testers (2026-11-11): the artifact build is a page body the claude.ai
// host wraps in a document; opened on its own (a file on a phone, a static host) it needs the
// doctype, the charset and the viewport, or iOS draws it at desktop width. Writes
// dist-demo/index.html.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const body = readFileSync(
  new URL("../dist-artifact/falconess-playtest.html", import.meta.url),
  "utf8",
);
const head = [
  "<!doctype html>",
  '<html lang="es">',
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
  "",
].join("\n");
mkdirSync(new URL("../dist-demo/", import.meta.url), { recursive: true });
writeFileSync(new URL("../dist-demo/index.html", import.meta.url), head + body);
console.log("dist-demo/index.html");
