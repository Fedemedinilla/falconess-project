import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { artifactPage } from "./scripts/artifact-plugin.ts";

/**
 * `vite` / `vite build`: the standard app (dist/). `vite build --mode artifact`: one HTML fragment
 * with everything inlined, for the claude.ai Artifact testers open (dist-artifact/).
 */
export default defineConfig(({ mode }) => {
  const artifact = mode === "artifact";
  return {
    base: "./",
    plugins: [react(), ...(artifact ? [viteSingleFile(), artifactPage()] : [])],
    build: {
      outDir: artifact ? "dist-artifact" : "dist",
      emptyOutDir: true,
      target: "es2022",
      // no modulepreload polyfill: the page has one script and must not fetch anything
      modulePreload: { polyfill: false },
    },
  };
});
