import { app, BrowserWindow } from "electron";
import { stat } from "node:fs/promises";
import path from "node:path";
import { isSupportedShellOpenPath } from "@shared/ebookExtensions";
import { APP_DISPLAY_NAME } from "@shared/packageDerived";
import {
  resolveInitialWindowBounds,
  saveWindowBounds,
  WINDOW_MIN_HEIGHT,
  WINDOW_MIN_WIDTH,
} from "./windowBounds";

export type CreateMainWindow = (options?: {
  openTxtPath?: string | null;
}) => BrowserWindow;

type MainWindowMaps = {
  shouldRestoreSessionByWindowId: Map<number, boolean>;
  pendingOpenTxtByWindowId: Map<number, string>;
};

export function createMainWindowFactory(maps: MainWindowMaps): CreateMainWindow {
  const { shouldRestoreSessionByWindowId, pendingOpenTxtByWindowId } = maps;

  return function createWindow(options?: { openTxtPath?: string | null }) {
    const openTxtPath = options?.openTxtPath ?? null;
    const shouldRestoreSession =
      BrowserWindow.getAllWindows().length === 0 && !openTxtPath;
    const initialBounds = resolveInitialWindowBounds();
    const SAVE_DEBOUNCE_MS = 300;
    const iconFileName = process.platform === "win32" ? "icon.ico" : "icon.png";
    const iconPath = app.isPackaged
      ? path.join(process.resourcesPath, iconFileName)
      : path.join(app.getAppPath(), "resources", iconFileName);
    const win = new BrowserWindow({
      show: false,
      width: initialBounds.width,
      height: initialBounds.height,
      x: initialBounds.x,
      y: initialBounds.y,
      minWidth: WINDOW_MIN_WIDTH,
      minHeight: WINDOW_MIN_HEIGHT,
      icon: iconPath,
      webPreferences: {
        preload: path.join(__dirname, "../preload/index.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    win.setMenuBarVisibility(false);
    win.removeMenu();
    shouldRestoreSessionByWindowId.set(win.id, shouldRestoreSession);
    win.on("closed", () => {
      shouldRestoreSessionByWindowId.delete(win.id);
      pendingOpenTxtByWindowId.delete(win.id);
    });

    if (process.env.ELECTRON_RENDERER_URL) {
      win.loadURL(process.env.ELECTRON_RENDERER_URL);
    } else {
      win.loadFile(path.join(__dirname, "../renderer/index.html"));
    }
    win.once("ready-to-show", () => {
      if (win.isDestroyed()) return;
      win.show();
      // Ensure the newly created window is frontmost and focused.
      win.focus();
    });

    win.webContents.on("before-input-event", (event, input) => {
      // 全屏下 ESC 不在此拦截，否则按键无法到达渲染进程，模态弹框无法先于退出全屏响应 ESC。
      const isToggleDevToolsKey =
        input.type === "keyDown" &&
        (input.key === "F12" ||
          ((input.control || input.meta) &&
            input.shift &&
            input.key.toLowerCase() === "i"));
      if (!isToggleDevToolsKey) return;
      event.preventDefault();
      if (!app.isPackaged) {
        win.webContents.toggleDevTools();
      }
    });

    win.setTitle(APP_DISPLAY_NAME);

    if (openTxtPath) {
      const resolved = path.resolve(openTxtPath);
      pendingOpenTxtByWindowId.set(win.id, resolved);
      void (async () => {
        try {
          const st = await stat(resolved);
          if (!st.isFile() || !isSupportedShellOpenPath(resolved)) {
            pendingOpenTxtByWindowId.delete(win.id);
          }
        } catch {
          pendingOpenTxtByWindowId.delete(win.id);
        }
      })();
    }

    win.on("enter-full-screen", () => {
      win.webContents.send("window:fullscreen-changed", { isFullscreen: true });
    });
    win.on("leave-full-screen", () => {
      win.webContents.send("window:fullscreen-changed", { isFullscreen: false });
    });

    // `resize` / `move` 会在拖拽过程中高频触发，写文件会产生不必要的 IO。
    // 对普通窗口态保存做 debounce，`close` 时仍做一次立即保存兜底。
    let saveWindowBoundsTimer: NodeJS.Timeout | null = null;
    const requestSaveWindowBounds = (immediate: boolean) => {
      if (win.isDestroyed()) return;
      if (saveWindowBoundsTimer) {
        clearTimeout(saveWindowBoundsTimer);
        saveWindowBoundsTimer = null;
      }
      if (immediate) {
        saveWindowBounds(win);
        return;
      }
      saveWindowBoundsTimer = setTimeout(() => {
        saveWindowBoundsTimer = null;
        saveWindowBounds(win);
      }, SAVE_DEBOUNCE_MS);
    };

    win.on("resize", () => {
      requestSaveWindowBounds(false);
    });
    win.on("move", () => {
      requestSaveWindowBounds(false);
    });
    win.on("close", () => {
      requestSaveWindowBounds(true);
    });

    return win;
  };
}
