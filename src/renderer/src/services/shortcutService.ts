export type AppShortcutActions = {
  openSettings: () => void | Promise<void>;
  toggleFullscreen: () => void | Promise<void>;
  increaseFontSize: () => void | Promise<void>;
  decreaseFontSize: () => void | Promise<void>;
  increaseLineHeight: () => void | Promise<void>;
  decreaseLineHeight: () => void | Promise<void>;
  toggleSidebar: () => void | Promise<void>;
  openNewWindow: () => void | Promise<void>;
  openFile: () => void | Promise<void>;
  pickTxtDirectory: () => void | Promise<void>;
  openChapterRules: () => void | Promise<void>;
  toggleBookmark: () => void | Promise<void>;
  jumpToPrevChapter: () => void | Promise<void>;
  jumpToNextChapter: () => void | Promise<void>;
  toggleFind: () => void | Promise<void>;
  scrollDownLine: () => void | Promise<void>;
  scrollUpLine: () => void | Promise<void>;
  scrollPageUp: () => void | Promise<void>;
  scrollPageDown: () => void | Promise<void>;
};

import type { ShortcutBindingMap } from "./shortcutRegistry";
import { keyboardEventToAccelerator, normalizeAccelerator } from "./shortcutUtils";

type ActionKey = keyof AppShortcutActions;

const ACTION_BY_ID: Record<string, ActionKey> = {
  openFile: "openFile",
  pickTxtDirectory: "pickTxtDirectory",
  scrollDownLine: "scrollDownLine",
  scrollUpLine: "scrollUpLine",
  scrollPageUp: "scrollPageUp",
  scrollPageDown: "scrollPageDown",
  jumpPrevChapter: "jumpToPrevChapter",
  jumpNextChapter: "jumpToNextChapter",
  decreaseFontSize: "decreaseFontSize",
  increaseFontSize: "increaseFontSize",
  decreaseLineHeight: "decreaseLineHeight",
  increaseLineHeight: "increaseLineHeight",
  toggleFind: "toggleFind",
  openChapterRules: "openChapterRules",
  toggleBookmark: "toggleBookmark",
  toggleSidebar: "toggleSidebar",
  toggleFullscreen: "toggleFullscreen",
  openSettings: "openSettings",
  openNewWindow: "openNewWindow",
};

export function bindAppShortcuts(
  actions: AppShortcutActions,
  getBindings: () => ShortcutBindingMap,
  shouldHandleEvent?: (ev: KeyboardEvent) => boolean,
): () => void {
  const onShortcutKeyDown = (ev: KeyboardEvent) => {
    if (shouldHandleEvent && !shouldHandleEvent(ev)) return;
    const eventAccel = keyboardEventToAccelerator(ev);
    if (!eventAccel) return;
    const bindings = getBindings();
    let matchedAction: ActionKey | null = null;
    for (const [actionId, binding] of Object.entries(bindings)) {
      const normalized = normalizeAccelerator(binding);
      if (!normalized || normalized !== eventAccel) continue;
      const actionKey = ACTION_BY_ID[actionId];
      if (!actionKey) continue;
      matchedAction = actionKey;
      break;
    }
    if (!matchedAction) return;
    ev.preventDefault();
    ev.stopPropagation();
    void actions[matchedAction]();
  };

  window.addEventListener("keydown", onShortcutKeyDown, true);
  return () => window.removeEventListener("keydown", onShortcutKeyDown, true);
}
