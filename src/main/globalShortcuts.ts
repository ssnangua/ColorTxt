import { app, BrowserWindow, globalShortcut } from "electron";

/** Ctrl+`；各平台均使用 Control 键（非 Mac Cmd） */
const DEFAULT_TOGGLE_VISIBILITY_ACCELERATOR = "Control+`" as const;

/** 快捷键控制的唯一状态：false = 全部「显示」（含最小化等在任务栏仍可见）；true = 全部隐身（任务栏/Dock 不可见）。 */
let allWindowsStealthHidden = false;

/** 进入隐身前各窗口是否最小化，退出隐身时还原。 */
const minimizeSnapshotByWindowId = new Map<number, boolean>();
let currentToggleVisibilityAccelerator: string =
  DEFAULT_TOGGLE_VISIBILITY_ACCELERATOR;

/** 录制快捷键时临时注销全局热键，避免按键被系统级拦截而无法录入 */
let globalShortcutSuspendedForRecording = false;

function allMainWindows(): BrowserWindow[] {
  return BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed());
}

/** macOS：与隐身状态同步 `app.dock.hide` / `show`（不使用 setActivationPolicy）。 */
function syncDarwinStealthPresentation(): void {
  if (process.platform !== "darwin" || !app.dock) return;
  if (allWindowsStealthHidden) {
    if (app.dock.isVisible()) app.dock.hide();
  } else if (!app.dock.isVisible()) {
    void app.dock.show();
  }
}

function toggleAllWindowsVisibility(): void {
  const windows = allMainWindows();
  if (windows.length === 0) return;

  if (!allWindowsStealthHidden) {
    minimizeSnapshotByWindowId.clear();
    for (const win of windows) {
      minimizeSnapshotByWindowId.set(win.id, win.isMinimized());
      win.setSkipTaskbar(true);
      win.hide();
    }
    allWindowsStealthHidden = true;
    syncDarwinStealthPresentation();
  } else {
    allWindowsStealthHidden = false;
    syncDarwinStealthPresentation();
    for (const win of windows) {
      const wasMinimized = minimizeSnapshotByWindowId.get(win.id) ?? false;
      win.setSkipTaskbar(false);
      win.show();
      if (wasMinimized) win.minimize();
    }
    minimizeSnapshotByWindowId.clear();
    const toFocus = windows.find((w) => !w.isMinimized());
    toFocus?.focus();
  }
}

/** 注册主进程系统级全局快捷键；后续新增快捷键在此集中注册。 */
export function registerGlobalShortcuts(): void {
  globalShortcut.unregister(currentToggleVisibilityAccelerator);
  globalShortcut.register(currentToggleVisibilityAccelerator, () => {
    toggleAllWindowsVisibility();
  });
}

/** 应用退出前注销，避免占用系统快捷键。 */
export function unregisterGlobalShortcuts(): void {
  globalShortcut.unregister(currentToggleVisibilityAccelerator);
  if (process.platform === "darwin" && app.dock) {
    try {
      if (!app.dock.isVisible()) void app.dock.show();
    } catch {
      /* will-quit 末期部分环境已不可调 */
    }
  }
}

export function getToggleVisibilityShortcut(): string {
  return currentToggleVisibilityAccelerator;
}

export function validateGlobalShortcut(accelerator: string): {
  ok: boolean;
  message?: string;
} {
  const next = String(accelerator ?? "").trim();
  if (!next) return { ok: false, message: "快捷键不能为空" };
  const ok = globalShortcut.isRegistered(next)
    ? next === currentToggleVisibilityAccelerator
    : globalShortcut.register(next, () => {});
  if (!ok) {
    return { ok: false, message: "该快捷键不可用，可能被系统或其他程序占用" };
  }
  // 仅校验：立即撤销临时注册。
  if (next !== currentToggleVisibilityAccelerator) {
    globalShortcut.unregister(next);
  }
  return { ok: true };
}

export function setToggleVisibilityShortcut(accelerator: string): {
  ok: boolean;
  message?: string;
} {
  const next = String(accelerator ?? "").trim();
  if (!next) return { ok: false, message: "快捷键不能为空" };
  if (next === currentToggleVisibilityAccelerator) return { ok: true };
  const prev = currentToggleVisibilityAccelerator;
  globalShortcut.unregister(prev);
  const ok = globalShortcut.register(next, () => {
    toggleAllWindowsVisibility();
  });
  if (!ok) {
    // 回滚旧绑定，避免丢失全局功能。
    globalShortcut.register(prev, () => {
      toggleAllWindowsVisibility();
    });
    return { ok: false, message: "该快捷键不可用，可能被系统或其他程序占用" };
  }
  currentToggleVisibilityAccelerator = next;
  return { ok: true };
}

export function suspendGlobalShortcutsForRecording(): void {
  if (globalShortcutSuspendedForRecording) return;
  globalShortcut.unregister(currentToggleVisibilityAccelerator);
  globalShortcutSuspendedForRecording = true;
}

export function resumeGlobalShortcutsAfterRecording(): void {
  if (!globalShortcutSuspendedForRecording) return;
  globalShortcutSuspendedForRecording = false;
  registerGlobalShortcuts();
}
