import { describe, expect, it } from "vitest";
import { ARTIFACT_TITLE, artifactProblems, toArtifactPage, VIEWPORT_FIT_META } from "./artifact";

const FONTS = "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600&display=swap";

/** What vite-plugin-singlefile leaves in dist-artifact/index.html (shape, not content). */
const BUILT = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>Prueba jugable Falconess</title>
    <meta name="claude:viewport-fit-sides" content="cover" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link
      rel="stylesheet"
      href="${FONTS}"
    />
    <script type="module" crossorigin>const a = "<style>"; console.log(a < 2, "\\x3C/script>");</script>
    <style rel="stylesheet" crossorigin>:root{--bg:#fff}body{background:var(--bg)}</style>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`;

describe("artifact page", () => {
  const page = toArtifactPage(BUILT);

  it("starts with the title and the viewport-fit meta, then fonts, style, root and script", () => {
    expect(page.split("\n").slice(0, 5)).toEqual([
      ARTIFACT_TITLE,
      VIEWPORT_FIT_META,
      `<link rel="stylesheet" href="${FONTS}">`,
      "<style>:root{--bg:#fff}body{background:var(--bg)}</style>",
      '<div id="root"></div>',
    ]);
    expect(page).toMatch(/<script type="module">const a = "<style>";[\s\S]*<\/script>\n$/);
  });

  it("keeps no document tags, charset, viewport meta or preconnect hints", () => {
    expect(page).not.toMatch(/<!doctype|<html|<head|<body|charset|preconnect|name="viewport"/i);
    expect(artifactProblems(page)).toEqual([]);
  });

  it("lists every broken rule of the contract", () => {
    expect(artifactProblems(`<!doctype html>${page}`)).toContain(
      "page must start with its <title> and the viewport-fit meta",
    );
    expect(artifactProblems(page.replace('<div id="root"></div>', '<img src="logo.png">'))).toEqual(
      ["external or relative load: logo.png", "no root div"],
    );
    expect(artifactProblems(page.replace("console.log", "window.alert"))).toEqual([
      "page calls window.alert",
    ]);
    expect(artifactProblems(page.replace("console.log", "fetch"))).toEqual([
      "page can load with fetch(",
    ]);
    expect(artifactProblems(page.replace("const a", 'location.hash = "#/x"; const a'))).toEqual([
      "hash routes must be plain names, never #/path",
    ]);
    // JSON Schema references in a library are not routes
    expect(
      artifactProblems(page.replace("const a", 'const ref = "#/definitions"; const a')),
    ).toEqual([]);
    expect(artifactProblems(page.replace("<body", ""))).toEqual([]);
    expect(artifactProblems(`${page}<body>`)).toEqual([
      "page has a <body> tag",
      "page must end with the inlined module script",
    ]);
  });

  it("refuses a build without head or body", () => {
    expect(() => toArtifactPage("<p>nada</p>")).toThrow(/head/);
  });
});
