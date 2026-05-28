import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { FileFilter } from "electron";
import { EBOOK_CONVERT_DEFAULT_SUBDIR } from "@shared/ebookConvertPaths";
import { CHARACTER_PORTRAIT_DEFAULT_SUBDIR } from "@shared/characterPortraitPaths";
import {
  defaultAiDataCacheRoot,
  defaultBuiltinModelCacheRoot,
} from "@shared/aiDataPaths";
import { APP_DISPLAY_NAME } from "@shared/packageDerived";
import type {
  AIAgentRendererEvent,
  AIAgentStartPayload,
  AIChunkRecord,
  AIChatStreamPayload,
  AIConfig,
  AIIndexSearchHit,
  BookStyleInferResult,
  PortraitExtractResult,
} from "@shared/aiTypes";
import type { BuiltinEmbeddingIpcPayload } from "@shared/builtinEmbeddingIpc";
import type {
  ColorTxtShowMessageBoxOptions,
  ColorTxtShowMessageBoxResult,
} from "@shared/colorTxtShowMessageBox";
import type {
  ColorTxtOpenDialogOptions,
  ColorTxtOpenDialogResult,
  ColorTxtSaveDialogOptions,
  ColorTxtSaveDialogResult,
} from "@shared/colorTxtOpenSaveDialog";
import type {
  AiTxt2ImgInvokeDraft,
  AiTxt2ImgInvokeResult,
} from "@shared/aiTxt2ImgIpc";
import type { VoiceReadEdgeTtsRequest } from "@shared/voiceReadEdgeIpc";

/** sandbox 下 preload 不可 require('path')，与 renderer 的 joinFs 行为对齐 */
function joinUserDataSubdir(userData: string, segment: string): string {
  const base = userData.replace(/[/\\]+$/, "");
  const sep = base.includes("\\") ? "\\" : "/";
  return `${base}${sep}${segment.replace(/^[/\\]+|[/\\]+$/g, "")}`;
}

/** `app.getPath` 仅在主进程可用；preload 通过同步 IPC 向主进程取路径 */
function getPathFromMainSync(name: "userData"): string {
  try {
    const r = ipcRenderer.sendSync("app:getPathSync", name);
    return typeof r === "string" ? r.trim() : "";
  } catch {
    return "";
  }
}

/** 磁盘上被读取的文件路径（通常为 .txt） */
export type StreamStart = {
  requestId: number;
  filePath: string;
  /** 与阅读会话绑定的逻辑路径（如电子书原路径）；缺省则与 filePath 相同 */
  sessionFilePath?: string;
  encoding?: string;
  totalBytes: number;
};
export type StreamChunkPayload = {
  requestId: number;
  filePath: string;
  sessionFilePath?: string;
  text: string;
  readBytes: number;
  totalBytes: number;
};
export type StreamEnd = {
  requestId: number;
  filePath: string;
  sessionFilePath?: string;
};
export type StreamError = {
  requestId: number;
  filePath: string;
  sessionFilePath?: string;
  message: string;
};

export type DirListTxtScanPayload =
  | { phase: "start"; dirPath: string }
  | { phase: "progress"; name: string };

// Signal for quick runtime verification from renderer.
try {
  (globalThis as any).__COLORTXT_PRELOAD__ = true;
} catch {
  // ignore
}

const openTxtFromShellQueue: string[] = [];
const openTxtFromShellCbs = new Set<(filePath: string) => void>();

function flushOpenTxtFromShellQueue() {
  if (openTxtFromShellCbs.size === 0 || openTxtFromShellQueue.length === 0)
    return;
  const batch = openTxtFromShellQueue.splice(0, openTxtFromShellQueue.length);
  for (const filePath of batch) {
    for (const cb of openTxtFromShellCbs) cb(filePath);
  }
}

ipcRenderer.on("app:open-txt-path", (_e, filePath: string) => {
  openTxtFromShellQueue.push(filePath);
  flushOpenTxtFromShellQueue();
});

const api = {
  showOpenDialog: (options: ColorTxtOpenDialogOptions) =>
    ipcRenderer.invoke(
      "dialog:showOpenDialog",
      options,
    ) as Promise<ColorTxtOpenDialogResult>,
  showSaveDialog: (options: ColorTxtSaveDialogOptions) =>
    ipcRenderer.invoke(
      "dialog:showSaveDialog",
      options,
    ) as Promise<ColorTxtSaveDialogResult>,
  showMessageBox: (options: ColorTxtShowMessageBoxOptions) =>
    ipcRenderer.invoke(
      "dialog:showMessageBox",
      options,
    ) as Promise<ColorTxtShowMessageBoxResult>,
  /** 原生消息框，单钮「确定」，语义类似 `window.alert` */
  alert: (message: string) =>
    ipcRenderer
      .invoke("dialog:showMessageBox", {
        type: "info",
        title: APP_DISPLAY_NAME,
        message,
        buttons: ["确定"],
        defaultId: 0,
        noLink: true,
      } satisfies ColorTxtShowMessageBoxOptions)
      .then(() => {}),
  /** 原生消息框「取消 / 确定」，语义类似 `window.confirm`（确定为 `true`） */
  confirm: (message: string) =>
    ipcRenderer
      .invoke("dialog:showMessageBox", {
        type: "question",
        title: APP_DISPLAY_NAME,
        message,
        buttons: ["取消", "确定"],
        defaultId: 1,
        cancelId: 0,
        noLink: true,
      } satisfies ColorTxtShowMessageBoxOptions)
      .then((r) => (r as ColorTxtShowMessageBoxResult).response === 1),
  voiceReadEdgeTts: (payload: VoiceReadEdgeTtsRequest) =>
    ipcRenderer.invoke("voiceRead:edgeTts", payload) as Promise<
      { ok: true; mp3: ArrayBuffer } | { ok: false; error: string }
    >,
  listTxtFilesInDirectory: (dirPath: string) =>
    ipcRenderer.invoke("dir:listTxtFiles", dirPath) as Promise<{
      dirPath: string;
      files: Array<{ name: string; path: string; size: number }>;
    }>,
  onDirListTxtScan: (cb: (payload: DirListTxtScanPayload) => void) => {
    const fn = (_: unknown, payload: DirListTxtScanPayload) => cb(payload);
    ipcRenderer.on("dir:listTxtFiles:scan", fn);
    return () => ipcRenderer.off("dir:listTxtFiles:scan", fn);
  },
  stat: (filePath: string) =>
    ipcRenderer.invoke("file:stat", filePath) as Promise<{
      size: number;
      mtimeMs: number;
      isFile: boolean;
      isDirectory: boolean;
    }>,
  getPath: (name: string) =>
    ipcRenderer.invoke("app:getPath", name) as Promise<string | null>,
  getUserDataPath: () => getPathFromMainSync("userData"),
  /** 默认电子书转 txt 输出目录：`userData/ConvertedTxt` */
  getDefaultEbookConvertOutputDir: () => {
    const ud = getPathFromMainSync("userData");
    if (!ud) return "";
    return joinUserDataSubdir(ud, EBOOK_CONVERT_DEFAULT_SUBDIR);
  },
  /** 默认角色立绘缓存根：`userData/CharacterPortrait` */
  getDefaultCharacterPortraitCacheDir: () => {
    const ud = getPathFromMainSync("userData");
    if (!ud) return "";
    return joinUserDataSubdir(ud, CHARACTER_PORTRAIT_DEFAULT_SUBDIR);
  },
  getDefaultAiDataCacheDir: () => {
    const ud = getPathFromMainSync("userData");
    if (!ud) return "";
    return defaultAiDataCacheRoot(ud);
  },
  getDefaultBuiltinModelCacheDir: () => {
    const ud = getPathFromMainSync("userData");
    if (!ud) return "";
    return defaultBuiltinModelCacheRoot(ud);
  },

  secrets: {
    isEncryptionAvailable: () =>
      ipcRenderer.invoke("secrets:isEncryptionAvailable") as Promise<{
        ok: true;
        available: boolean;
        backend: "safeStorage" | "appBound" | "unavailable";
      }>,
    getVoiceReadDashScopeApiKey: () =>
      ipcRenderer.invoke("secrets:getVoiceReadDashScopeApiKey") as Promise<{
        ok: true;
        apiKey: string;
      }>,
    setVoiceReadDashScopeApiKey: (apiKey: string) =>
      ipcRenderer.invoke(
        "secrets:setVoiceReadDashScopeApiKey",
        apiKey,
      ) as Promise<{ ok: true }>,
  },
  pathToFileUrl: (filePath: string) =>
    ipcRenderer.invoke("path:toFileUrl", filePath) as Promise<string | null>,
  /**
   * 用于 `<img src>` / 灯箱：短 URL `colortxt-local://resource/{uuid}`，避免整段路径过长导致不发起请求。
   */
  pathToReadableLocalUrl: (filePath: string) =>
    ipcRenderer.invoke("colortxtLocal:registerPath", filePath) as Promise<
      string | null
    >,
  readFileAsArrayBuffer: async (filePath: string) => {
    const data = (await ipcRenderer.invoke(
      "file:readFileAsBuffer",
      filePath,
    )) as ArrayBuffer | Uint8Array;
    if (data instanceof ArrayBuffer) return data;
    return data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength,
    ) as ArrayBuffer;
  },
  writeUtf8File: (filePath: string, utf8: string) =>
    ipcRenderer.invoke("file:writeUtf8File", filePath, utf8) as Promise<{
      ok: true;
    }>,
  readWholeTextFile: (filePath: string) =>
    ipcRenderer.invoke("file:readWholeTextFile", filePath) as Promise<
      | { ok: true; text: string; encoding: string }
      | { ok: false; message: string }
    >,
  writeTextFile: (filePath: string, content: string, encoding: string) =>
    ipcRenderer.invoke(
      "file:writeTextFile",
      filePath,
      content,
      encoding,
    ) as Promise<{ ok: true } | { ok: false; message: string }>,
  writeBinaryFile: (filePath: string, base64: string) =>
    ipcRenderer.invoke("file:writeBinaryFile", filePath, base64) as Promise<{
      ok: true;
    }>,
  emptyDir: (dirPath: string) =>
    ipcRenderer.invoke("fs:emptyDir", dirPath) as Promise<{ ok: true }>,
  removePath: (targetPath: string) =>
    ipcRenderer.invoke("fs:removePath", targetPath) as Promise<{ ok: true }>,
  mkdir: (dirPath: string) =>
    ipcRenderer.invoke("fs:mkdir", dirPath) as Promise<{ ok: true }>,
  renamePath: (fromPath: string, toPath: string) =>
    ipcRenderer.invoke("fs:renamePath", fromPath, toPath) as Promise<
      | { ok: true; path: string; size: number }
      | { ok: false; message: string; code?: string }
    >,
  characterPortrait: {
    migrateCacheRoot: (payload: { from: string; to: string }) =>
      ipcRenderer.invoke(
        "characterPortrait:migrateCacheRoot",
        payload,
      ) as Promise<{ ok: true } | { ok: false; error: string }>,
    copyFileTo: (payload: { from: string; to: string }) =>
      ipcRenderer.invoke("characterPortrait:copyFileTo", payload) as Promise<
        { ok: true } | { ok: false; error: string }
      >,
  },
  streamFile: (filePath: string, options?: { sessionFilePath?: string }) =>
    ipcRenderer.send("file:stream", {
      physicalPath: filePath,
      sessionFilePath: options?.sessionFilePath,
    }),
  /** 由主进程 `fs.watch` 监控磁盘文件；传 `null` 停止 */
  watchCurrentFile: (filePath: string | null) =>
    ipcRenderer.invoke("file:watchCurrent", filePath) as Promise<void>,
  onCurrentFileDiskChanged: (
    cb: (payload: { path: string; mtimeMs: number }) => void,
  ) => {
    const fn = (_: unknown, payload: { path: string; mtimeMs: number }) =>
      cb(payload);
    ipcRenderer.on("file:disk-changed", fn);
    return () => ipcRenderer.off("file:disk-changed", fn);
  },
  setWindowTitle: (title: string) => ipcRenderer.send("window:setTitle", title),
  setFullscreen: (value: boolean) =>
    ipcRenderer.invoke("window:setFullscreen", value) as Promise<boolean>,
  shouldRestoreSession: () =>
    ipcRenderer.invoke("window:shouldRestoreSession") as Promise<boolean>,
  /** 首屏用：本窗口是否会加载文件（新窗口为 false；首启恢复 / 打开方式为 true） */
  getInitialWindowLoadIntent: () =>
    ipcRenderer.sendSync("window:getInitialLoadIntent") as {
      shouldRestoreSession: boolean;
      hasPendingOpenTxt: boolean;
    },
  /** 安装包关联 / 命令行启动时由主进程写入，仅可取一次 */
  consumePendingOpenTxtPath: () =>
    ipcRenderer.invoke("window:consumePendingOpenTxtPath") as Promise<
      string | null
    >,
  onOpenTxtFromShell: (cb: (filePath: string) => void) => {
    openTxtFromShellCbs.add(cb);
    flushOpenTxtFromShellQueue();
    return () => {
      openTxtFromShellCbs.delete(cb);
    };
  },
  setNativeTheme: (theme: string) => ipcRenderer.send("theme:set", theme),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  listSystemFonts: () =>
    ipcRenderer.invoke("fonts:listSystemFonts") as Promise<string[]>,
  openExternal: (url: string) =>
    ipcRenderer.invoke("shell:openExternal", url) as Promise<void>,
  showItemInFolder: (filePath: string) =>
    ipcRenderer.invoke("shell:showItemInFolder", filePath) as Promise<void>,
  openPath: (dirPath: string) =>
    ipcRenderer.invoke("shell:openPath", dirPath) as Promise<
      { ok: true } | { ok: false; error: string }
    >,
  openNewWindow: () => {
    ipcRenderer.send("window:new");
  },
  openFileInNewWindow: (filePath: string) => {
    ipcRenderer.send("window:new", filePath);
  },
  toggleDevTools: () =>
    ipcRenderer.invoke("window:toggleDevTools") as Promise<void>,
  getGlobalShortcut: () =>
    ipcRenderer.invoke("shortcut:getGlobalToggle") as Promise<string>,
  validateGlobalShortcut: (accelerator: string) =>
    ipcRenderer.invoke(
      "shortcut:validateGlobalToggle",
      accelerator,
    ) as Promise<{
      ok: boolean;
      message?: string;
    }>,
  setGlobalShortcut: (accelerator: string) =>
    ipcRenderer.invoke("shortcut:setGlobalToggle", accelerator) as Promise<{
      ok: boolean;
      message?: string;
    }>,
  suspendGlobalShortcutsForRecording: () =>
    ipcRenderer.invoke("shortcut:suspendForRecording") as Promise<void>,
  resumeGlobalShortcutsAfterRecording: () =>
    ipcRenderer.invoke("shortcut:resumeAfterRecording") as Promise<void>,
  quitApp: () => {
    ipcRenderer.send("app:quit");
  },
  onWindowRequestClose: (cb: () => void) => {
    const fn = () => cb();
    ipcRenderer.on("window:requestClose", fn);
    return () => ipcRenderer.off("window:requestClose", fn);
  },
  proceedCloseWindow: () => {
    ipcRenderer.send("window:proceedClose");
  },
  onStreamStart: (cb: (payload: StreamStart) => void) => {
    const fn = (_: unknown, payload: StreamStart) => cb(payload);
    ipcRenderer.on("file:stream-start", fn);
    return () => ipcRenderer.off("file:stream-start", fn);
  },
  onStreamChunk: (cb: (payload: StreamChunkPayload) => void) => {
    const fn = (_: unknown, payload: StreamChunkPayload) => cb(payload);
    ipcRenderer.on("file:stream-chunk", fn);
    return () => ipcRenderer.off("file:stream-chunk", fn);
  },
  onStreamEnd: (cb: (payload: StreamEnd) => void) => {
    const fn = (_: unknown, payload: StreamEnd) => cb(payload);
    ipcRenderer.on("file:stream-end", fn);
    return () => ipcRenderer.off("file:stream-end", fn);
  },
  onStreamError: (cb: (payload: StreamError) => void) => {
    const fn = (_: unknown, payload: StreamError) => cb(payload);
    ipcRenderer.on("file:stream-error", fn);
    return () => ipcRenderer.off("file:stream-error", fn);
  },
  onFullscreenChanged: (cb: (payload: { isFullscreen: boolean }) => void) => {
    const fn = (_: unknown, payload: { isFullscreen: boolean }) => cb(payload);
    ipcRenderer.on("window:fullscreen-changed", fn);
    return () => ipcRenderer.off("window:fullscreen-changed", fn);
  },
  onThemeSync: (cb: (theme: string) => void) => {
    const fn = (_: unknown, theme: string) => cb(theme);
    ipcRenderer.on("theme:sync", fn);
    return () => ipcRenderer.off("theme:sync", fn);
  },
  isPackaged: () => ipcRenderer.invoke("app:isPackaged") as Promise<boolean>,
  isWindowsPortable: () =>
    ipcRenderer.invoke("app:isWindowsPortable") as Promise<boolean>,
  checkForUpdates: () =>
    ipcRenderer.invoke("updater:check") as Promise<
      { skipped: true } | { ok: true } | { ok: false; message: string }
    >,
  downloadUpdate: () =>
    ipcRenderer.invoke("updater:download") as Promise<
      { skipped: true } | { ok: true } | { ok: false; message: string }
    >,
  quitAndInstall: () =>
    ipcRenderer.invoke("updater:quitAndInstall") as Promise<boolean>,
  onUpdaterUpdateAvailable: (cb: (payload: { version: string }) => void) => {
    const fn = (_: unknown, payload: { version: string }) => cb(payload);
    ipcRenderer.on("updater:update-available", fn);
    return () => ipcRenderer.off("updater:update-available", fn);
  },
  onUpdaterUpdateNotAvailable: (cb: () => void) => {
    const fn = () => cb();
    ipcRenderer.on("updater:update-not-available", fn);
    return () => ipcRenderer.off("updater:update-not-available", fn);
  },
  onUpdaterError: (cb: (payload: { message: string }) => void) => {
    const fn = (_: unknown, payload: { message: string }) => cb(payload);
    ipcRenderer.on("updater:error", fn);
    return () => ipcRenderer.off("updater:error", fn);
  },
  onUpdaterDownloadProgress: (
    cb: (payload: {
      percent: number;
      transferred: number;
      total: number;
    }) => void,
  ) => {
    const fn = (
      _: unknown,
      payload: { percent: number; transferred: number; total: number },
    ) => cb(payload);
    ipcRenderer.on("updater:download-progress", fn);
    return () => ipcRenderer.off("updater:download-progress", fn);
  },
  onUpdaterUpdateDownloaded: (cb: (payload: { version: string }) => void) => {
    const fn = (_: unknown, payload: { version: string }) => cb(payload);
    ipcRenderer.on("updater:update-downloaded", fn);
    return () => ipcRenderer.off("updater:update-downloaded", fn);
  },

  ai: {
    configGet: () => ipcRenderer.invoke("ai:config:get") as Promise<AIConfig>,
    configSet: (cfg: AIConfig) =>
      ipcRenderer.invoke(
        "ai:config:set",
        JSON.parse(JSON.stringify(cfg)) as AIConfig,
      ) as Promise<{ ok: true } | { ok: false; error: string }>,
    embed: (texts: string[], requestId?: number) =>
      ipcRenderer.invoke(
        "ai:embedding:embed",
        texts,
        requestId ?? null,
      ) as Promise<number[][]>,
    embedAbort: (requestId: number) =>
      ipcRenderer.invoke("ai:embedding:abort", requestId) as Promise<{
        ok: true;
      }>,
    indexHasBook: (bookHash: string) =>
      ipcRenderer.invoke("ai:index:hasBook", bookHash) as Promise<boolean>,
    indexDeleteBook: (bookHash: string) =>
      ipcRenderer.invoke("ai:index:deleteBook", bookHash) as Promise<{
        ok: boolean;
      }>,
    indexReplaceChunks: (bookHash: string, chunks: AIChunkRecord[]) =>
      ipcRenderer.invoke(
        "ai:index:replaceChunks",
        bookHash,
        chunks,
      ) as Promise<{ ok: boolean; error?: string }>,
    indexSearch: (args: {
      bookHash: string;
      queryEmbedding: number[];
      topK?: number;
    }) =>
      ipcRenderer.invoke("ai:index:search", args) as Promise<
        AIIndexSearchHit[] | { error: string }
      >,
    chatStart: (payload: AIChatStreamPayload) =>
      ipcRenderer.invoke(
        "ai:chat:start",
        JSON.parse(JSON.stringify(payload)) as AIChatStreamPayload,
      ) as Promise<{ ok: true } | { ok: false; error?: string }>,
    agentStart: (payload: AIAgentStartPayload) =>
      ipcRenderer.invoke(
        "ai:agent:start",
        JSON.parse(JSON.stringify(payload)) as AIAgentStartPayload,
      ) as Promise<{ ok: true } | { ok: false; error?: string }>,
    chatAbort: (requestId: number) =>
      ipcRenderer.invoke("ai:chat:abort", requestId) as Promise<{ ok: true }>,
    modelsList: (draft: {
      baseUrl?: string;
      apiKey?: string;
      provider?: "remote" | "builtin";
    }) =>
      ipcRenderer.invoke("ai:models:list", draft) as Promise<
        { ok: true; models: string[] } | { ok: false; error: string }
      >,
    txt2imgInvoke: (draft: AiTxt2ImgInvokeDraft) =>
      ipcRenderer.invoke("ai:txt2img", draft) as Promise<AiTxt2ImgInvokeResult>,
    testChat: (draft: Record<string, unknown>) =>
      ipcRenderer.invoke("ai:test:chat", draft) as Promise<
        { ok: true } | { ok: false; error: string }
      >,
    testEmbedding: (draft: Record<string, unknown>) =>
      ipcRenderer.invoke("ai:test:embedding", draft) as Promise<
        { ok: true } | { ok: false; error: string }
      >,
    embeddingProbeDimension: (draft: {
      baseUrl?: string;
      apiKey?: string;
      remoteModel?: string;
      builtinModel?: string;
      /** @deprecated 旧版单一 model 字段 */
      model?: string;
      provider?: "remote" | "builtin";
    }) =>
      ipcRenderer.invoke("ai:embedding:probeDimension", draft) as Promise<
        { ok: true; dimension: number } | { ok: false; error: string }
      >,
    migrateDataCacheRoot: (payload: { from: string; to: string }) =>
      ipcRenderer.invoke("ai:migrateDataCacheRoot", payload) as Promise<
        { ok: true } | { ok: false; error: string }
      >,
    migrateBuiltinModelCacheRoot: (payload: { from: string; to: string }) =>
      ipcRenderer.invoke("ai:migrateBuiltinModelCacheRoot", payload) as Promise<
        { ok: true } | { ok: false; error: string }
      >,
    openAiDataCacheDir: (dir?: string) =>
      ipcRenderer.invoke("ai:paths:openDataCacheDir", dir ?? "") as Promise<void>,
    openBuiltinModelCacheDir: (dir: string, config: AIConfig) =>
      ipcRenderer.invoke(
        "ai:paths:openModelCacheDir",
        dir,
        JSON.parse(JSON.stringify(config)) as AIConfig,
      ) as Promise<void>,
    embeddingBuiltinList: () =>
      ipcRenderer.invoke("ai:embedding:builtin:list") as Promise<{
        ok: true;
        models: import("@shared/builtinEmbeddingModels").BuiltinEmbeddingModel[];
      }>,
    embeddingBuiltinStatus: () =>
      ipcRenderer.invoke("ai:embedding:builtin:status") as Promise<{
        ok: true;
        loadedModelId: string | null;
        loaded: boolean;
      }>,
    embeddingBuiltinIsCached: (payload: BuiltinEmbeddingIpcPayload) =>
      ipcRenderer.invoke(
        "ai:embedding:builtin:isCached",
        JSON.parse(JSON.stringify(payload)) as BuiltinEmbeddingIpcPayload,
      ) as Promise<
        { ok: true; cached: boolean } | { ok: false; error: string }
      >,
    embeddingBuiltinLoad: (payload: BuiltinEmbeddingIpcPayload) =>
      ipcRenderer.invoke(
        "ai:embedding:builtin:load",
        JSON.parse(JSON.stringify(payload)) as BuiltinEmbeddingIpcPayload,
      ) as Promise<
        { ok: true } | { ok: false; error: string; code?: string }
      >,
    embeddingBuiltinClearCache: (payload: BuiltinEmbeddingIpcPayload) =>
      ipcRenderer.invoke(
        "ai:embedding:builtin:clearCache",
        JSON.parse(JSON.stringify(payload)) as BuiltinEmbeddingIpcPayload,
      ) as Promise<{ ok: true } | { ok: false; error: string }>,
    onEmbeddingLoadProgress: (
      cb: (payload: { modelId: string; progress: number }) => void,
    ) => {
      const fn = (
        _: unknown,
        payload: { modelId: string; progress: number },
      ) => cb(payload);
      ipcRenderer.on("ai:embedding:loadProgress", fn);
      return () => ipcRenderer.off("ai:embedding:loadProgress", fn);
    },
    threadList: (bookHash: string) =>
      ipcRenderer.invoke("ai:thread:list", bookHash) as Promise<
        Array<{
          id: string;
          bookHash: string;
          title: string;
          createdAt: number;
          updatedAt: number;
          titleLocked: number;
        }>
      >,
    threadCreate: (bookHash: string, title?: string) =>
      ipcRenderer.invoke(
        "ai:thread:create",
        bookHash,
        title,
      ) as Promise<string>,
    threadRename: (threadId: string, title: string, userChosen?: boolean) =>
      ipcRenderer.invoke(
        "ai:thread:rename",
        threadId,
        title,
        userChosen === true,
      ) as Promise<void>,
    threadDelete: (threadId: string) =>
      ipcRenderer.invoke("ai:thread:delete", threadId) as Promise<void>,
    threadDeleteEmptyForBook: (
      bookHash: string,
      exceptThreadId?: string | null,
    ) =>
      ipcRenderer.invoke(
        "ai:thread:deleteEmptyForBook",
        bookHash,
        exceptThreadId ?? undefined,
      ) as Promise<void>,
    messageList: (threadId: string) =>
      ipcRenderer.invoke("ai:message:list", threadId) as Promise<
        Array<{
          id: string;
          threadId: string;
          role: string;
          content: string;
          createdAt: number;
          aborted: boolean;
          toolCallId?: string | null;
          toolName?: string | null;
          toolCallsJson?: string | null;
          payload?: string | null;
        }>
      >,
    messageAppend: (
      threadId: string,
      role: "user" | "assistant" | "system",
      content: string,
      aborted?: boolean,
    ) =>
      ipcRenderer.invoke(
        "ai:message:append",
        threadId,
        role,
        content,
        aborted,
      ) as Promise<string>,
    exportSave: (payload: {
      defaultName: string;
      data: string;
      filters?: FileFilter[];
      /** 完整默认路径（目录+文件名），绝对路径时用作对话框初始位置 */
      defaultPath?: string;
    }) =>
      ipcRenderer.invoke("ai:export:save", payload) as Promise<
        | { ok: true; path: string }
        | { ok: false; cancelled: true }
        | { ok: false; error: string }
      >,
    portraitExtract: (payload: {
      bookHash: string;
      characterName: string;
      spoilerSafe?: boolean;
      activeChapterIdx?: number;
      /** 与 portraitInferBookStyle、portraitRetrieveAbort 对齐，用于中止本轮检索 */
      retrieveSessionId?: number;
    }) =>
      ipcRenderer.invoke("ai:portrait:extract", payload) as Promise<
        PortraitExtractResult | { error: string }
      >,
    portraitTranslateSdPrompt: (payload: {
      styleZh?: string;
      promptZh: string;
      negativeZh: string;
    }) =>
      ipcRenderer.invoke("ai:portrait:translateSdPrompt", payload) as Promise<
        | { style_en: string; prompt_en: string; negative_en: string }
        | { error: string }
      >,
    portraitInferBookStyle: (payload: {
      bookHash: string;
      fileTitle?: string;
      spoilerSafe?: boolean;
      activeChapterIdx?: number;
      retrieveSessionId?: number;
    }) =>
      ipcRenderer.invoke("ai:portrait:inferStyle", payload) as Promise<
        BookStyleInferResult | { error: string }
      >,
    portraitRetrieveAbort: (retrieveSessionId: number) =>
      ipcRenderer.invoke(
        "ai:portrait:retrieve:abort",
        retrieveSessionId,
      ) as Promise<{ ok: true } | { ok: false }>,
    portraitRetrieveSessionDispose: (retrieveSessionId: number) =>
      ipcRenderer.invoke(
        "ai:portrait:retrieve:session:dispose",
        retrieveSessionId,
      ) as Promise<{ ok: true } | { ok: false }>,
    portraitTxt2ImgToPath: (payload: {
      outputPath: string;
      styleZh?: string;
      /** 角色形象（自然语言） */
      appearanceZh?: string;
      /** @deprecated 使用 appearanceZh */
      promptZh?: string;
      negativeZh?: string;
    }) =>
      ipcRenderer.invoke("ai:portrait:txt2imgToPath", payload) as Promise<
        { ok: true } | { ok: false; error: string }
      >,
    portraitTxt2ImgToPathAbort: () =>
      ipcRenderer.invoke("ai:portrait:txt2imgToPath:abort") as Promise<{
        ok: true;
      }>,
    onChatChunk: (
      cb: (payload: { requestId: number; delta: string }) => void,
    ) => {
      const fn = (_: unknown, payload: { requestId: number; delta: string }) =>
        cb(payload);
      ipcRenderer.on("ai:chat:chunk", fn);
      return () => ipcRenderer.off("ai:chat:chunk", fn);
    },
    onChatDone: (cb: (payload: { requestId: number }) => void) => {
      const fn = (_: unknown, payload: { requestId: number }) => cb(payload);
      ipcRenderer.on("ai:chat:done", fn);
      return () => ipcRenderer.off("ai:chat:done", fn);
    },
    onChatError: (
      cb: (payload: { requestId: number; message: string }) => void,
    ) => {
      const fn = (
        _: unknown,
        payload: { requestId: number; message: string },
      ) => cb(payload);
      ipcRenderer.on("ai:chat:error", fn);
      return () => ipcRenderer.off("ai:chat:error", fn);
    },
    onAgentEvent: (cb: (payload: AIAgentRendererEvent) => void) => {
      const fn = (_: unknown, payload: AIAgentRendererEvent) => cb(payload);
      ipcRenderer.on("ai:agent:event", fn);
      return () => ipcRenderer.off("ai:agent:event", fn);
    },
  },
  /** 主进程 ragContext 向阅读器索取章节原文 */
  onChapterPlainRequest: (
    cb: (payload: {
      replyChannel: string;
      chapterIndex: number;
      maxChars: number;
    }) => void,
  ) => {
    const fn = (
      _: unknown,
      payload: {
        replyChannel: string;
        chapterIndex: number;
        maxChars: number;
      },
    ) => cb(payload);
    ipcRenderer.on("ai:chapter-plain-request", fn);
    return () => ipcRenderer.off("ai:chapter-plain-request", fn);
  },
  replyChapterPlainText: (replyChannel: string, text: string) => {
    ipcRenderer.send(replyChannel, text);
  },
};

contextBridge.exposeInMainWorld("colorTxt", api);

export type ColorTxtApi = typeof api;
