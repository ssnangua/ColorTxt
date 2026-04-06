import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeTheme,
  shell,
  type MessageBoxOptions,
} from "electron";
import { createReadStream } from "node:fs";
import { open, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { getFonts } from "font-list";
import iconv from "iconv-lite";
import jschardet from "jschardet";
import { APP_DISPLAY_NAME } from "@shared/packageDerived";
import type { CreateMainWindow } from "./windowFactory";
import {
  getToggleVisibilityShortcut,
  resumeGlobalShortcutsAfterRecording,
  setToggleVisibilityShortcut,
  suspendGlobalShortcutsForRecording,
  validateGlobalShortcut,
} from "./globalShortcuts";

type TxtFileItem = { name: string; path: string; size: number };
type DirListScanProgress = (item: { name: string; path: string }) => void;

type RegisterMainIpcHandlersOptions = {
  createWindow: CreateMainWindow;
  shouldRestoreSessionByWindowId: Map<number, boolean>;
  pendingOpenTxtByWindowId: Map<number, string>;
};

let cachedSystemFonts: string[] | null = null;

/**
 * 迭代遍历子目录，避免符号链接 / 目录联接成环导致递归栈溢出；
 * 用 realpath 去重已访问目录。
 */
async function collectTxtFilesUnderRoot(
  rootDir: string,
  onProgress?: DirListScanProgress,
): Promise<TxtFileItem[]> {
  const files: TxtFileItem[] = [];
  const visitedDirs = new Set<string>();
  const stack: string[] = [rootDir];

  while (stack.length > 0) {
    const currentDir = stack.pop()!;
    let dirReal: string;
    try {
      dirReal = await realpath(currentDir);
    } catch {
      continue;
    }
    if (visitedDirs.has(dirReal)) continue;
    visitedDirs.add(dirReal);

    let entries;
    try {
      entries = await readdir(currentDir, { withFileTypes: true });
    } catch {
      continue;
    }

    const subdirs: string[] = [];
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        subdirs.push(fullPath);
        continue;
      }

      if (entry.isSymbolicLink()) {
        try {
          const st = await stat(fullPath);
          if (st.isDirectory()) {
            subdirs.push(fullPath);
          } else if (st.isFile() && entry.name.toLowerCase().endsWith(".txt")) {
            const relativePath = path
              .relative(rootDir, fullPath)
              .replaceAll("\\", "/");
            onProgress?.({ name: relativePath, path: fullPath });
            files.push({
              name: relativePath,
              path: fullPath,
              size: st.size,
            });
          }
        } catch {
          // 失效链接等
        }
        continue;
      }

      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".txt")) {
        continue;
      }

      const relativePath = path
        .relative(rootDir, fullPath)
        .replaceAll("\\", "/");
      onProgress?.({ name: relativePath, path: fullPath });
      let fileStat;
      try {
        fileStat = await stat(fullPath);
      } catch {
        continue;
      }
      files.push({
        name: relativePath,
        path: fullPath,
        size: fileStat.size,
      });
    }

    for (let i = subdirs.length - 1; i >= 0; i--) {
      stack.push(subdirs[i]);
    }
  }

  return files;
}

async function detectEncoding(filePath: string): Promise<string> {
  const fd = await open(filePath, "r");
  const header = Buffer.alloc(64 * 1024);
  const { bytesRead } = await fd.read(header, 0, header.length, 0);
  await fd.close();
  if (bytesRead === 0) return "utf8";
  const sample = header.subarray(0, bytesRead);
  const detected = jschardet.detect(sample);
  const enc = detected?.encoding;
  if (typeof enc !== "string" || !enc.trim()) return "utf8";
  return enc.trim();
}

export function registerMainIpcHandlers(
  options: RegisterMainIpcHandlersOptions,
) {
  const {
    createWindow,
    shouldRestoreSessionByWindowId,
    pendingOpenTxtByWindowId,
  } = options;
  const activeStreamBySenderId = new Map<
    number,
    ReturnType<typeof createReadStream>
  >();
  const streamRequestSeqBySenderId = new Map<number, number>();

  ipcMain.handle("shell:openExternal", async (_evt, url: string) => {
    await shell.openExternal(url);
  });

  ipcMain.handle("shell:showItemInFolder", async (_evt, filePath: string) => {
    shell.showItemInFolder(filePath);
  });

  ipcMain.on("app:quit", () => {
    app.quit();
  });

  ipcMain.on("window:new", () => {
    createWindow({});
  });

  ipcMain.handle("window:toggleDevTools", (evt) => {
    const win = BrowserWindow.fromWebContents(evt.sender);
    if (!win || win.isDestroyed()) return;
    win.webContents.toggleDevTools();
  });

  ipcMain.handle("window:shouldRestoreSession", (evt) => {
    const win = BrowserWindow.fromWebContents(evt.sender);
    if (!win) return false;
    return shouldRestoreSessionByWindowId.get(win.id) === true;
  });

  ipcMain.handle("window:consumePendingOpenTxtPath", (evt) => {
    const win = BrowserWindow.fromWebContents(evt.sender);
    if (!win) return null;
    const p = pendingOpenTxtByWindowId.get(win.id);
    if (!p) return null;
    pendingOpenTxtByWindowId.delete(win.id);
    return p;
  });

  ipcMain.handle("dialog:openTxt", async () => {
    const res = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "Text", extensions: ["txt"] }],
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    return res.filePaths[0];
  });

  ipcMain.handle("dialog:openTxtDirectory", async (evt) => {
    const res = await dialog.showOpenDialog({
      properties: ["openDirectory"],
    });
    if (res.canceled || res.filePaths.length === 0) return null;

    const dirPath = res.filePaths[0];
    const sender = evt.sender;
    sender.send("dir:listTxtFiles:scan", {
      phase: "start",
      dirPath,
    } satisfies { phase: "start"; dirPath: string });
    const files = (
      await collectTxtFilesUnderRoot(dirPath, (item) => {
        sender.send("dir:listTxtFiles:scan", {
          phase: "progress",
          name: item.name,
        } satisfies { phase: "progress"; name: string });
      })
    ).sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));

    return { dirPath, files };
  });

  ipcMain.removeHandler("dialog:confirmClearRecentFiles");
  ipcMain.handle("dialog:confirmClearRecentFiles", async (evt) => {
    const win = BrowserWindow.fromWebContents(evt.sender);
    const options: MessageBoxOptions = {
      type: "warning",
      title: APP_DISPLAY_NAME,
      buttons: ["取消", "清除"],
      defaultId: 1,
      cancelId: 0,
      message: "是否要清除最近打开的所有文件？",
      detail: "此操作不可逆！",
      noLink: true,
    };
    const result = win
      ? await dialog.showMessageBox(win, options)
      : await dialog.showMessageBox(options);
    return result.response === 1;
  });

  ipcMain.removeHandler("dialog:confirmClearFileList");
  ipcMain.handle("dialog:confirmClearFileList", async (evt) => {
    const win = BrowserWindow.fromWebContents(evt.sender);
    const options: MessageBoxOptions = {
      type: "warning",
      title: APP_DISPLAY_NAME,
      buttons: ["取消", "清空"],
      defaultId: 1,
      cancelId: 0,
      message: "是否要清空文件列表？",
      detail: "不会关闭当前正在阅读的文本。",
      noLink: true,
    };
    const result = win
      ? await dialog.showMessageBox(win, options)
      : await dialog.showMessageBox(options);
    return result.response === 1;
  });

  ipcMain.removeHandler("dialog:confirmClearBookmarks");
  ipcMain.handle("dialog:confirmClearBookmarks", async (evt) => {
    const win = BrowserWindow.fromWebContents(evt.sender);
    const options: MessageBoxOptions = {
      type: "warning",
      title: APP_DISPLAY_NAME,
      buttons: ["取消", "清空"],
      defaultId: 1,
      cancelId: 0,
      message: "是否要清空当前文件的所有书签？",
      detail: "此操作将清除当前文件的全部书签记录。",
      noLink: true,
    };
    const result = win
      ? await dialog.showMessageBox(win, options)
      : await dialog.showMessageBox(options);
    return result.response === 1;
  });

  ipcMain.removeHandler("dialog:confirmClearAppCache");
  ipcMain.handle("dialog:confirmClearAppCache", async (evt) => {
    const win = BrowserWindow.fromWebContents(evt.sender);
    const options: MessageBoxOptions = {
      type: "warning",
      title: APP_DISPLAY_NAME,
      buttons: ["取消", "清除"],
      defaultId: 1,
      cancelId: 0,
      message: "是否清除应用缓存？",
      detail:
        "将删除会话、最近打开、文件列表、书签与阅读进度等本地数据；界面设置（字号、主题等）将保留。清除后窗口会重新加载。",
      noLink: true,
    };
    const result = win
      ? await dialog.showMessageBox(win, options)
      : await dialog.showMessageBox(options);
    return result.response === 1;
  });

  ipcMain.handle("file:stat", async (_evt, filePath: string) => {
    const s = await stat(filePath);
    return {
      size: s.size,
      mtimeMs: s.mtimeMs,
      isFile: s.isFile(),
      isDirectory: s.isDirectory(),
    };
  });

  ipcMain.handle("dir:listTxtFiles", async (evt, dirPath: string) => {
    const sender = evt.sender;
    sender.send("dir:listTxtFiles:scan", {
      phase: "start",
      dirPath,
    } satisfies { phase: "start"; dirPath: string });
    const files = (
      await collectTxtFilesUnderRoot(dirPath, (item) => {
        sender.send("dir:listTxtFiles:scan", {
          phase: "progress",
          name: item.name,
        } satisfies { phase: "progress"; name: string });
      })
    ).sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));
    return { dirPath, files };
  });

  ipcMain.handle("fonts:listSystemFonts", async () => {
    if (cachedSystemFonts) return cachedSystemFonts;

    try {
      const fonts = await getFonts({ disableQuoting: true });
      cachedSystemFonts = Array.from(new Set(fonts)).sort((a, b) =>
        a.localeCompare(b, "zh-Hans-CN"),
      );
    } catch {
      cachedSystemFonts = [];
    }

    return cachedSystemFonts;
  });

  ipcMain.on("window:setTitle", (evt, title: string) => {
    const win = BrowserWindow.fromWebContents(evt.sender);
    win?.setTitle(title);
  });

  ipcMain.handle("window:setFullscreen", (evt, value: boolean) => {
    const win = BrowserWindow.fromWebContents(evt.sender);
    if (!win) return false;
    win.setFullScreen(Boolean(value));
    return win.isFullScreen();
  });

  ipcMain.handle("shortcut:getGlobalToggle", () => {
    return getToggleVisibilityShortcut();
  });
  ipcMain.handle(
    "shortcut:validateGlobalToggle",
    (_evt, accelerator: string) => {
      return validateGlobalShortcut(accelerator);
    },
  );
  ipcMain.handle("shortcut:setGlobalToggle", (_evt, accelerator: string) => {
    return setToggleVisibilityShortcut(accelerator);
  });
  ipcMain.handle("shortcut:suspendForRecording", () => {
    suspendGlobalShortcutsForRecording();
  });
  ipcMain.handle("shortcut:resumeAfterRecording", () => {
    resumeGlobalShortcutsAfterRecording();
  });

  ipcMain.on("theme:set", (_evt, theme: string) => {
    if (theme !== "vs" && theme !== "vs-dark") return;
    const isLight = theme === "vs";
    nativeTheme.themeSource = isLight ? "light" : "dark";
    const bg = isLight ? "#ffffff" : "#1e1e1e";
    for (const win of BrowserWindow.getAllWindows()) {
      win.setBackgroundColor(bg);
      win.webContents.send("theme:sync", theme);
    }
  });

  // Stream file content to renderer in chunks. Renderer assembles text + detects chapters.
  ipcMain.on("file:stream", async (evt, filePath: string) => {
    const sender = evt.sender;
    const senderId = sender.id;
    const prevStream = activeStreamBySenderId.get(senderId);
    if (prevStream) {
      // 切换文件时立即终止上一个读取流，避免旧 chunk 继续涌入。
      prevStream.destroy();
      activeStreamBySenderId.delete(senderId);
    }
    const requestId = (streamRequestSeqBySenderId.get(senderId) ?? 0) + 1;
    streamRequestSeqBySenderId.set(senderId, requestId);

    let totalBytes = 0;
    try {
      const st = await stat(filePath);
      totalBytes = st.size;
    } catch {
      // createReadStream will emit error if missing
    }
    const encoding = await detectEncoding(filePath);
    const decoder = iconv.getDecoder(encoding);
    const fileStream = createReadStream(filePath, {
      highWaterMark: 1024 * 256,
    });
    activeStreamBySenderId.set(senderId, fileStream);

    sender.send("file:stream-start", {
      requestId,
      filePath,
      encoding,
      totalBytes,
    });

    let readBytes = 0;
    fileStream.on("data", (chunk: string | Buffer) => {
      if (streamRequestSeqBySenderId.get(senderId) !== requestId) return;
      const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      readBytes += buf.length;
      const text = decoder.write(buf);
      sender.send("file:stream-chunk", {
        requestId,
        filePath,
        text,
        readBytes,
        totalBytes,
      });
    });
    fileStream.on("end", () => {
      if (streamRequestSeqBySenderId.get(senderId) !== requestId) return;
      const tail = decoder.end();
      if (tail) {
        sender.send("file:stream-chunk", {
          requestId,
          filePath,
          text: tail,
          readBytes,
          totalBytes,
        });
      }
      activeStreamBySenderId.delete(senderId);
      sender.send("file:stream-end", { requestId, filePath });
    });
    fileStream.on("error", (err) => {
      if (streamRequestSeqBySenderId.get(senderId) !== requestId) return;
      activeStreamBySenderId.delete(senderId);
      sender.send("file:stream-error", {
        requestId,
        filePath,
        message: err?.message ?? String(err),
      });
    });
  });
}
