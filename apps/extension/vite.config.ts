import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        "service-worker": resolve(__dirname, "src/service-worker/index.ts"),
        content: resolve(__dirname, "src/content/index.ts"),
        injected: resolve(__dirname, "src/injected/fetch-xhr-hook.ts"),
        popup: resolve(__dirname, "src/popup/index.ts"),
        offscreen: resolve(__dirname, "src/offscreen/index.ts"),
        picker: resolve(__dirname, "src/picker/index.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name].js",
        format: "es",
      },
    },
  },
});
