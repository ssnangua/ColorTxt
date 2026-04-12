import { readFileSync } from "node:fs";
import { defineConfig } from "electron-vite";
import vue from "@vitejs/plugin-vue";
import monacoEditorPluginPkg from "vite-plugin-monaco-editor";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __electronViteConfigDir = dirname(fileURLToPath(import.meta.url));
const packageJsonPath = resolve(__electronViteConfigDir, "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as {
  name?: string;
  homepage?: string;
  build?: { productName?: string };
};

const DEFAULT_GITHUB_REPO_URL = "https://github.com/ssnangua/ColorTxt";

function readPackageGithubRepoUrl(): string {
  const hp =
    typeof packageJson.homepage === "string" ? packageJson.homepage.trim() : "";
  const base = hp || DEFAULT_GITHUB_REPO_URL;
  return base.replace(/\/+$/, "");
}

function readPackageDisplayName(): string {
  const fromBuild =
    typeof packageJson.build?.productName === "string"
      ? packageJson.build.productName.trim()
      : "";
  if (fromBuild) return fromBuild;
  const fromName =
    typeof packageJson.name === "string" ? packageJson.name.trim() : "";
  return fromName || "ColorTxt";
}

const APP_DISPLAY_NAME_LITERAL = readPackageDisplayName();
const APP_DISPLAY_NAME_JSON = JSON.stringify(APP_DISPLAY_NAME_LITERAL);

const GITHUB_REPO_URL_LITERAL = readPackageGithubRepoUrl();
const GITHUB_REPO_URL_JSON = JSON.stringify(GITHUB_REPO_URL_LITERAL);

const sharedResolveAlias = {
  "@shared": resolve(__electronViteConfigDir, "src/shared"),
};

const monacoEditorPlugin =
  // Some environments expose CJS-like namespace object: { default: fn }
  (monacoEditorPluginPkg as unknown as { default?: any }).default ??
  (monacoEditorPluginPkg as any);

/** 与 vite-plugin-monaco-editor 默认 publicPath 一致 */
const MONACO_EDITOR_WORKERS_PUBLIC_PATH = "monacoeditorwork";

export default defineConfig({
  main: {
    resolve: {
      alias: sharedResolveAlias,
    },
    define: {
      __APP_DISPLAY_NAME__: APP_DISPLAY_NAME_JSON,
      __GITHUB_REPO_URL__: GITHUB_REPO_URL_JSON,
    },
    build: {
      outDir: "dist/main",
      lib: {
        entry: resolve(__electronViteConfigDir, "src/main/index.ts"),
      },
      rollupOptions: {
        // Keep `font-list` as a runtime dependency so its internal `./libs/core`
        // relative requires resolve from `node_modules/font-list/`.
        // `iconv-lite` + `jschardet` are runtime-only and can remain in node_modules.
        external: [
          "font-list",
          "iconv-lite",
          "jschardet",
          "jszip",
          "pdfjs-dist",
          "electron-updater",
        ],
      },
    },
  },
  preload: {
    build: {
      outDir: "dist/preload",
      lib: {
        entry: resolve(__electronViteConfigDir, "src/preload/index.ts"),
      },
      rollupOptions: {
        output: {
          format: "cjs",
          entryFileNames: "index.js",
        },
      },
    },
  },
  renderer: {
    root: resolve(__electronViteConfigDir, "src/renderer"),
    resolve: {
      alias: sharedResolveAlias,
    },
    define: {
      __APP_DISPLAY_NAME__: APP_DISPLAY_NAME_JSON,
      __GITHUB_REPO_URL__: GITHUB_REPO_URL_JSON,
    },
    plugins: [
      {
        name: "inject-app-display-name-in-html",
        transformIndexHtml(html: string) {
          return html.replaceAll(
            "%APP_DISPLAY_NAME%",
            APP_DISPLAY_NAME_LITERAL,
          );
        },
      },
      vue(),
      monacoEditorPlugin({
        languageWorkers: ["editorWorkerService"],
        customWorkers: [],
        publicPath: MONACO_EDITOR_WORKERS_PUBLIC_PATH,
        // 插件默认 path.join(root, outDir, base, publicPath)；在 Windows 上 root 与 outDir 若均为绝对路径，
        // path.join 会拼成 `.../src/renderer/F:/.../dist/...` 非法路径。这里只基于已解析的 outDir 拼接。
        customDistPath(_root: string, outDir: string, base: string) {
          const normalizedBase =
            base === "/" || base === "" ? "" : String(base).replace(/^\//, "");
          return join(
            resolve(outDir),
            normalizedBase,
            MONACO_EDITOR_WORKERS_PUBLIC_PATH,
          );
        },
      }),
    ],
    build: {
      outDir: resolve(__electronViteConfigDir, "dist/renderer"),
      rollupOptions: {
        input: resolve(__electronViteConfigDir, "src/renderer/index.html"),
      },
    },
  },
});
