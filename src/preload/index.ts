import { contextBridge, ipcRenderer, webUtils } from "electron";

export type StreamStart = {
  requestId: number;
  filePath: string;
  encoding?: string;
  totalBytes: number;
};
export type StreamChunkPayload = {
  requestId: number;
  filePath: string;
  text: string;
  readBytes: number;
  totalBytes: number;
};
export type StreamEnd = { requestId: number; filePath: string };
export type StreamError = { requestId: number; filePath: string; message: string };

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
  if (openTxtFromShellCbs.size === 0 || openTxtFromShellQueue.length === 0) return;
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
  openTxtDialog: () =>
    ipcRenderer.invoke("dialog:openTxt") as Promise<string | null>,
  openTxtDirectoryDialog: () =>
    ipcRenderer.invoke("dialog:openTxtDirectory") as Promise<{
      dirPath: string;
      files: Array<{ name: string; path: string; size: number }>;
    } | null>,
  confirmClearRecentFiles: () =>
    ipcRenderer.invoke("dialog:confirmClearRecentFiles") as Promise<boolean>,
  confirmClearFileList: () =>
    ipcRenderer.invoke("dialog:confirmClearFileList") as Promise<boolean>,
  confirmClearBookmarks: () =>
    ipcRenderer.invoke("dialog:confirmClearBookmarks") as Promise<boolean>,
  confirmClearAppCache: () =>
    ipcRenderer.invoke("dialog:confirmClearAppCache") as Promise<boolean>,
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
  streamFile: (filePath: string) => ipcRenderer.send("file:stream", filePath),
  setWindowTitle: (title: string) => ipcRenderer.send("window:setTitle", title),
  setFullscreen: (value: boolean) =>
    ipcRenderer.invoke("window:setFullscreen", value) as Promise<boolean>,
  shouldRestoreSession: () =>
    ipcRenderer.invoke("window:shouldRestoreSession") as Promise<boolean>,
  /** 安装包关联 / 命令行启动时由主进程写入，仅可取一次 */
  consumePendingOpenTxtPath: () =>
    ipcRenderer.invoke(
      "window:consumePendingOpenTxtPath",
    ) as Promise<string | null>,
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
  openNewWindow: () => {
    ipcRenderer.send("window:new");
  },
  toggleDevTools: () =>
    ipcRenderer.invoke("window:toggleDevTools") as Promise<void>,
  getGlobalShortcut: () =>
    ipcRenderer.invoke("shortcut:getGlobalToggle") as Promise<string>,
  validateGlobalShortcut: (accelerator: string) =>
    ipcRenderer.invoke("shortcut:validateGlobalToggle", accelerator) as Promise<{
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
  isPackaged: () =>
    ipcRenderer.invoke("app:isPackaged") as Promise<boolean>,
  checkForUpdates: () =>
    ipcRenderer.invoke("updater:check") as Promise<
      | { skipped: true }
      | { ok: true }
      | { ok: false; message: string }
    >,
  downloadUpdate: () =>
    ipcRenderer.invoke("updater:download") as Promise<
      | { skipped: true }
      | { ok: true }
      | { ok: false; message: string }
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
};

contextBridge.exposeInMainWorld("colorTxt", api);

export type ColorTxtApi = typeof api;
