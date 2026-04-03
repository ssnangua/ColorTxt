import { app, BrowserWindow } from "electron";
import { registerMainIpcHandlers } from "./ipcHandlers";
import { setupLaunchTxtHandlers } from "./launchTxtHandlers";
import { registerGlobalShortcuts, unregisterGlobalShortcuts } from "./globalShortcuts";
import { registerUpdaterIpc, setupAutoUpdater } from "./updater";
import { createMainWindowFactory } from "./windowFactory";

registerUpdaterIpc();

const shouldRestoreSessionByWindowId = new Map<number, boolean>();
/** 从资源管理器 / 命令行启动时待打开的 txt，由渲染进程 pull 一次 */
const pendingOpenTxtByWindowId = new Map<number, string>();

const createWindow = createMainWindowFactory({
  shouldRestoreSessionByWindowId,
  pendingOpenTxtByWindowId,
});

registerMainIpcHandlers({
  createWindow,
  shouldRestoreSessionByWindowId,
  pendingOpenTxtByWindowId,
});

const launchTxtHandlers = setupLaunchTxtHandlers({ createWindow });

app.whenReady().then(() => {
  setupAutoUpdater();
  const launchTxt = launchTxtHandlers.resolveLaunchTxtForStartup(process.argv);
  createWindow({ openTxtPath: launchTxt });
  launchTxtHandlers.openRemainingMacPendingTxtPaths();
  registerGlobalShortcuts();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow({});
  });
});

app.on("will-quit", () => {
  unregisterGlobalShortcuts();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
