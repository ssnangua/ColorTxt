import { defineConfig } from "electron-vite";
import vue from "@vitejs/plugin-vue";
import monacoEditorPluginPkg from "vite-plugin-monaco-editor";
import { join, resolve } from "node:path";

const monacoEditorPlugin =
  // Some environments expose CJS-like namespace object: { default: fn }
  (monacoEditorPluginPkg as unknown as { default?: any }).default ??
  (monacoEditorPluginPkg as any);

/** 与 vite-plugin-monaco-editor 默认 publicPath 一致 */
const MONACO_EDITOR_WORKERS_PUBLIC_PATH = "monacoeditorwork";

export default defineConfig({
  main: {
    build: {
      outDir: "dist/main",
      lib: {
        entry: resolve(__dirname, "src/main/index.ts"),
      },
      rollupOptions: {
        // Keep `font-list` as a runtime dependency so its internal `./libs/core`
        // relative requires resolve from `node_modules/font-list/`.
        // `iconv-lite` + `jschardet` are runtime-only and can remain in node_modules.
        external: ["font-list", "iconv-lite", "jschardet", "electron-updater"],
      },
    },
  },
  preload: {
    build: {
      outDir: "dist/preload",
      lib: {
        entry: resolve(__dirname, "src/preload/index.ts"),
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
    root: resolve(__dirname, "src/renderer"),
    plugins: [
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
      outDir: resolve(__dirname, "dist/renderer"),
      rollupOptions: {
        input: resolve(__dirname, "src/renderer/index.html"),
      },
    },
  },
});
