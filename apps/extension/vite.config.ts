import { defineConfig } from "vite";
import { resolve, join } from "path";
import { existsSync, readFileSync, writeFileSync } from "fs";
import type { Plugin } from "vite";

declare const process: { env: Record<string, string | undefined> };

const buildVersion = (process.env.TESTERBUDDY_BUILD_VERSION || new Date().toISOString())
  .replace(/[^a-zA-Z0-9]/g, "")
  .slice(0, 14);

const entryNames = ["service-worker", "content", "injected", "popup", "offscreen", "picker"] as const;

function versionedFile(name: string) {
  return `${name}-v${buildVersion}.js`;
}

const renames = new Map(entryNames.map((name) => [`${name}.js`, versionedFile(name)]));

function rewriteReferences(value: string) {
  let next = value;
  for (const [from, to] of renames) {
    next = next.replaceAll(from, to);
  }
  return next;
}

function wrapInIife(value: string) {
  return `(() => {\n${value}\n})();\n`;
}

function versionExtensionAssets(): Plugin {
  return {
    name: "testerbuddy-version-extension-assets",
    generateBundle(_options, bundle) {
      for (const [original, versioned] of renames) {
        const chunk = bundle[original];
        if (!chunk) continue;
        delete bundle[original];
        chunk.fileName = versioned;
        bundle[versioned] = chunk;
      }
    },
    closeBundle() {
      const distDir = resolve(__dirname, "dist");
      const manifestPath = join(distDir, "manifest.json");
      if (existsSync(manifestPath)) {
        const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
        manifest.version_name = `${manifest.version}+${buildVersion}`;
        manifest.background.service_worker = renames.get(manifest.background.service_worker) ?? manifest.background.service_worker;
        if (manifest.content_scripts) {
          manifest.content_scripts = manifest.content_scripts.map((script: { js?: string[] }) => ({
            ...script,
            js: script.js?.map((file) => renames.get(file) ?? file),
          }));
        }
        manifest.web_accessible_resources = manifest.web_accessible_resources?.map((item: { resources?: string[] }) => ({
          ...item,
          resources: item.resources?.map((file) => renames.get(file) ?? file),
        }));
        writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      }

      for (const scriptName of ["content", "injected"] as const) {
        const scriptPath = join(distDir, versionedFile(scriptName));
        if (!existsSync(scriptPath)) continue;
        const raw = readFileSync(scriptPath, "utf8");
        writeFileSync(scriptPath, wrapInIife(raw));
      }

      for (const htmlFile of ["popup.html", "offscreen.html", "picker.html"]) {
        const htmlPath = join(distDir, htmlFile);
        if (!existsSync(htmlPath)) continue;
        writeFileSync(htmlPath, rewriteReferences(readFileSync(htmlPath, "utf8")));
      }
    },
  };
}

export default defineConfig({
  define: {
    __TESTERBUDDY_BUILD_VERSION__: JSON.stringify(buildVersion),
    __TESTERBUDDY_CONTENT_FILE__: JSON.stringify(versionedFile("content")),
    __TESTERBUDDY_INJECTED_FILE__: JSON.stringify(versionedFile("injected")),
  },
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
        chunkFileNames: `chunks/[name]-v${buildVersion}.js`,
        format: "es",
      },
    },
  },
  plugins: [versionExtensionAssets()],
});
