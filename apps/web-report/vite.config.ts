import { fileURLToPath, URL } from "node:url";
import preact from "@preact/preset-vite";
import { defineConfig } from "vite";

export default defineConfig({
  root: fileURLToPath(new URL("./workbench", import.meta.url)),
  base: "./",
  plugins: [preact()],
  build: {
    outDir: fileURLToPath(new URL("./dist/workbench", import.meta.url)),
    emptyOutDir: false,
    sourcemap: true,
    target: "es2022",
    cssCodeSplit: true
  }
});
