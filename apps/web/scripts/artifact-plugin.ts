import type { Plugin } from "vite";
import { ARTIFACT_FILE, artifactProblems, toArtifactPage } from "./artifact.ts";

/**
 * Runs after vite-plugin-singlefile has inlined the JS and CSS into index.html: replaces it with
 * the published fragment (dist-artifact/falconess-playtest.html) and fails the build when the
 * fragment breaks the page contract.
 */
export function artifactPage(): Plugin {
  return {
    name: "falconess:artifact-page",
    enforce: "post",
    generateBundle: {
      order: "post",
      handler(_options, bundle) {
        const html = bundle["index.html"];
        if (html?.type !== "asset") {
          this.error("artifact: the build produced no index.html");
          return;
        }
        const page = toArtifactPage(String(html.source));
        const problems = artifactProblems(page);
        if (problems.length > 0)
          this.error(`artifact page breaks the contract:\n  - ${problems.join("\n  - ")}`);
        const leftovers = Object.keys(bundle).filter((name) => name !== "index.html");
        if (leftovers.length > 0)
          this.error(`artifact: files left outside the page: ${leftovers.join(", ")}`);
        delete bundle["index.html"];
        this.emitFile({ type: "asset", fileName: ARTIFACT_FILE, source: page });
      },
    },
  };
}
