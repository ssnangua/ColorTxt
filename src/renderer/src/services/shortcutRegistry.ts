type ShortcutScope = "window" | "global";

export type ShortcutActionId =
  | "openFile"
  | "pickTxtDirectory"
  | "scrollDownLine"
  | "scrollUpLine"
  | "scrollPageUp"
  | "scrollPageDown"
  | "jumpPrevChapter"
  | "jumpNextChapter"
  | "decreaseFontSize"
  | "increaseFontSize"
  | "decreaseLineHeight"
  | "increaseLineHeight"
  | "toggleFind"
  | "openChapterRules"
  | "toggleBookmark"
  | "toggleSidebar"
  | "toggleFullscreen"
  | "openSettings"
  | "openColorScheme"
  | "openNewWindow"
  | "toggleAllWindowsVisibility";

type ShortcutActionDef = {
  id: ShortcutActionId;
  scope: ShortcutScope;
  desc: string;
  handlerKey: ShortcutActionId;
};

export const SHORTCUT_ACTIONS: ShortcutActionDef[] = [
  { id: "openFile", scope: "window", desc: "打开文件", handlerKey: "openFile" },
  {
    id: "pickTxtDirectory",
    scope: "window",
    desc: "选择目录",
    handlerKey: "pickTxtDirectory",
  },
  {
    id: "scrollDownLine",
    scope: "window",
    desc: "向下滚动",
    handlerKey: "scrollDownLine",
  },
  { id: "scrollUpLine", scope: "window", desc: "向上滚动", handlerKey: "scrollUpLine" },
  { id: "scrollPageUp", scope: "window", desc: "上一屏", handlerKey: "scrollPageUp" },
  {
    id: "scrollPageDown",
    scope: "window",
    desc: "下一屏",
    handlerKey: "scrollPageDown",
  },
  {
    id: "jumpPrevChapter",
    scope: "window",
    desc: "上一章节",
    handlerKey: "jumpPrevChapter",
  },
  {
    id: "jumpNextChapter",
    scope: "window",
    desc: "下一章节",
    handlerKey: "jumpNextChapter",
  },
  {
    id: "decreaseFontSize",
    scope: "window",
    desc: "减小字号",
    handlerKey: "decreaseFontSize",
  },
  {
    id: "increaseFontSize",
    scope: "window",
    desc: "加大字号",
    handlerKey: "increaseFontSize",
  },
  {
    id: "decreaseLineHeight",
    scope: "window",
    desc: "减小行高",
    handlerKey: "decreaseLineHeight",
  },
  {
    id: "increaseLineHeight",
    scope: "window",
    desc: "加大行高",
    handlerKey: "increaseLineHeight",
  },
  { id: "toggleFind", scope: "window", desc: "查找", handlerKey: "toggleFind" },
  {
    id: "openChapterRules",
    scope: "window",
    desc: "章节匹配规则",
    handlerKey: "openChapterRules",
  },
  {
    id: "toggleBookmark",
    scope: "window",
    desc: "添加/移除书签",
    handlerKey: "toggleBookmark",
  },
  {
    id: "toggleSidebar",
    scope: "window",
    desc: "显示/隐藏侧边栏",
    handlerKey: "toggleSidebar",
  },
  {
    id: "toggleFullscreen",
    scope: "window",
    desc: "进入/退出全屏阅读",
    handlerKey: "toggleFullscreen",
  },
  { id: "openSettings", scope: "window", desc: "设置", handlerKey: "openSettings" },
  {
    id: "openColorScheme",
    scope: "window",
    desc: "配色",
    handlerKey: "openColorScheme",
  },
  {
    id: "openNewWindow",
    scope: "window",
    desc: "打开新窗口",
    handlerKey: "openNewWindow",
  },
  {
    id: "toggleAllWindowsVisibility",
    scope: "global",
    desc: "（全局）显示/隐藏阅读器",
    handlerKey: "toggleAllWindowsVisibility",
  },
];

export type ShortcutBindingMap = Record<ShortcutActionId, string>;

function accelKeyName(isMac: boolean) {
  return isMac ? "Command" : "Control";
}

export function createDefaultShortcutBindings(isMac: boolean): ShortcutBindingMap {
  const accel = accelKeyName(isMac);
  return {
    openFile: `${accel}+O`,
    pickTxtDirectory: `${accel}+Shift+O`,
    scrollDownLine: "Down",
    scrollUpLine: "Up",
    scrollPageUp: "PageUp",
    scrollPageDown: "PageDown",
    jumpPrevChapter: `${accel}+Left`,
    jumpNextChapter: `${accel}+Right`,
    decreaseFontSize: `${accel}+-`,
    increaseFontSize: `${accel}+=`,
    decreaseLineHeight: `${accel}+[`,
    increaseLineHeight: `${accel}+]`,
    toggleFind: `${accel}+F`,
    openChapterRules: `${accel}+R`,
    toggleBookmark: `${accel}+D`,
    toggleSidebar: `${accel}+B`,
    toggleFullscreen: "F11",
    openSettings: "F5",
    openColorScheme: "F6",
    openNewWindow: `${accel}+Shift+N`,
    toggleAllWindowsVisibility: "Control+`",
  };
}

