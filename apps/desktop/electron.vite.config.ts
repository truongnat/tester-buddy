import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  main: {
    build: {
      outDir: "dist/main",
      lib: { entry: resolve(__dirname, "src/main/app.ts") },
      rollupOptions: {
        external: ["bufferutil", "utf-8-validate", "sql.js"],
      },
    },
  },
  preload: {
    build: {
      outDir: "dist/preload",
      lib: { entry: resolve(__dirname, "src/preload/index.ts") },
    },
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    resolve: {
      alias: { "@": resolve(__dirname, "src/renderer") },
    },
    plugins: [react()],
    build: { outDir: "dist/renderer" },
  },
});
