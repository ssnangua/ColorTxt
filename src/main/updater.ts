import { createRequire } from "node:module";
import { BrowserWindow, app, ipcMain } from "electron";

import { translateUpdaterError } from "./updaterMessages";

const require = createRequire(import.meta.url);
const { autoUpdater } =
  require("electron-updater") as typeof import("electron-updater");

/** electron-builder 便携版启动器会注入，见 app-builder-lib portable.nsi */
function isWindowsPortableBuild(): boolean {
  return process.platform === "win32" && !!process.env.PORTABLE_EXECUTABLE_DIR;
}

function broadcast(channel: string, payload?: unknown) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

export function registerUpdaterIpc() {
  ipcMain.handle("app:isPackaged", () => app.isPackaged);
  ipcMain.handle("app:isWindowsPortable", () => isWindowsPortableBuild());

  ipcMain.handle("updater:check", async () => {
    if (!app.isPackaged) {
      return { skipped: true as const };
    }
    try {
      await autoUpdater.checkForUpdates();
      return { ok: true as const };
    } catch (e) {
      return {
        ok: false as const,
        message: translateUpdaterError(e),
      };
    }
  });

  ipcMain.handle("updater:download", async () => {
    if (!app.isPackaged) {
      return { skipped: true as const };
    }
    if (isWindowsPortableBuild()) {
      return {
        ok: false as const,
        message: "便携版不支持应用内下载，请到发布页下载新版本。",
      };
    }
    try {
      await autoUpdater.downloadUpdate();
      return { ok: true as const };
    } catch (e) {
      return {
        ok: false as const,
        message: translateUpdaterError(e),
      };
    }
  });

  ipcMain.handle("updater:quitAndInstall", () => {
    if (!app.isPackaged || isWindowsPortableBuild()) return false;
    autoUpdater.quitAndInstall(false, true);
    return true;
  });
}

export function setupAutoUpdater() {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info) => {
    broadcast("updater:update-available", { version: info.version });
  });

  autoUpdater.on("update-not-available", () => {
    broadcast("updater:update-not-available", undefined);
  });

  autoUpdater.on("download-progress", (p) => {
    broadcast("updater:download-progress", {
      percent: p.percent,
      transferred: p.transferred,
      total: p.total,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    broadcast("updater:update-downloaded", { version: info.version });
  });

  autoUpdater.on("error", (err) => {
    broadcast("updater:error", {
      message: translateUpdaterError(err),
    });
  });
}
