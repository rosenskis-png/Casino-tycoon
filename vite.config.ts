import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// One self-contained dist/index.html per build (North Star: "a single self-contained playable file").
// base "./" so the same build works at the GitHub Pages subpath, in an Artifact, or opened as a file.
export default defineConfig({
  base: "./",
  plugins: [react(), viteSingleFile()],
  build: { target: "es2022", assetsInlineLimit: 100_000_000 },
});
