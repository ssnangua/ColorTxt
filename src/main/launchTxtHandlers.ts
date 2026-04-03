import { app, BrowserWindow } from "electron";
import { existsSync, statSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import type { CreateMainWindow } from "./windowFactory";

type SetupLaunchTxtHandlersOptions = {
  createWindow: CreateMainWindow;
};

type LaunchTxtHandlerApi = {
  resolveLaunchTxtForStartup: (argv: string[]) => string | null;
  openRemainingMacPendingTxtPaths: () => void;
};

function getTxtPathFromArgv(argv: string[]): string | null {
  for (const arg of argv.slice(1)) {
    if (arg.startsWith("-")) continue;
    const lower = arg.toLowerCase();
    if (!lower.endsWith(".txt")) continue;
    try {
      if (!existsSync(arg)) continue;
      const s = statSync(arg);
      if (s.isFile()) return path.resolve(arg);
    } catch {
      continue;
    }
  }
  return null;
}

export function setupLaunchTxtHandlers(
  options: SetupLaunchTxtHandlersOptions,
): LaunchTxtHandlerApi {
  const { createWindow } = options;
  const macPendingTxtPaths: string[] = [];

  async function focusAndOpenTxtPath(filePath: string) {
    const resolved = path.resolve(filePath);
    try {
      const st = await stat(resolved);
      if (!st.isFile() || !resolved.toLowerCase().endsWith(".txt")) return;
    } catch {
      return;
    }

    let win = BrowserWindow.getFocusedWindow();
    if (!win) {
      const all = BrowserWindow.getAllWindows();
      win = all[0] ?? undefined;
    }
    if (win && !win.isDestroyed()) {
      win.focus();
      win.webContents.send("app:open-txt-path", resolved);
      return;
    }

    createWindow({ openTxtPath: resolved });
  }

  const gotSingleInstanceLock = app.requestSingleInstanceLock();
  if (!gotSingleInstanceLock) {
    app.quit();
  } else {
    app.on("second-instance", (_event, argv) => {
      const fromArgv = getTxtPathFromArgv(argv);
      if (fromArgv) {
        void focusAndOpenTxtPath(fromArgv);
        app.focus({ steal: true });
        return;
      }
      createWindow();
      app.focus({ steal: true });
    });
  }

  if (process.platform === "darwin") {
    app.on("open-file", (event, filePath) => {
      event.preventDefault();
      if (!filePath.toLowerCase().endsWith(".txt")) return;
      if (app.isReady()) {
        void focusAndOpenTxtPath(filePath);
      } else {
        macPendingTxtPaths.push(filePath);
      }
    });
  }

  return {
    resolveLaunchTxtForStartup(argv: string[]) {
      const fromArgv = getTxtPathFromArgv(argv);
      const fromMac = macPendingTxtPaths.shift() ?? null;
      return fromArgv ?? fromMac;
    },
    openRemainingMacPendingTxtPaths() {
      for (const p of macPendingTxtPaths) {
        void focusAndOpenTxtPath(p);
      }
      macPendingTxtPaths.length = 0;
    },
  };
}
