export type TxtFileItem = { name: string; path: string; size: number };

import type { ChapterMatchRule } from "../chapter";
import {
  parseReaderPaletteOverrides,
  type ReaderSurfacePalette,
} from "../constants/readerPalette";
import type { ShortcutActionId } from "../services/shortcutRegistry";

export type PersistedSettingsData = {
  theme?: "vs" | "vs-dark";
  /** 侧边栏宽度（px） */
  sidebarWidth?: number;
  /** 侧边栏是否打开（非全屏时） */
  showSidebar?: boolean;
  fontSize?: number;
  /** Monaco 行高倍数，实际行高 = round(fontSize * lineHeightMultiple) */
  lineHeightMultiple?: number;
  fontFamily?: string;
  monacoCustomHighlight?: boolean;
  /** 是否在加载时过滤空行（仅空格/缩进也视为空行） */
  compressBlankLines?: boolean;
  /** 压缩空行时是否在每行正文下方保留一行空行（章节标题行除外） */
  compressBlankKeepOneBlank?: boolean;
  /** 是否为正文行统一行首两个全角空格（章节标题行与空行除外） */
  leadIndentFullWidth?: boolean;
  /** 章节列表是否显示每章字数 */
  showChapterCounts?: boolean;
  chapterRules?: ChapterMatchRule[];
  /** 启动时是否从会话快照恢复上次文件与列表；关闭时关闭窗口不写入会话 */
  restoreSessionOnStartup?: boolean;
  /** 最近打开文件条数上限，0 表示不记录 */
  recentFilesHistoryLimit?: number;
  /** Monaco 换行是否使用 advanced 策略（性能开销更大） */
  monacoAdvancedWrapping?: boolean;
  /** 全屏时阅读区宽度（百分比） */
  fullscreenReaderWidthPercent?: number;
  /** 用户自定义快捷键（动作ID -> accelerator） */
  shortcutBindings?: Partial<Record<ShortcutActionId, string>>;
  /** 阅读器表面色用户覆盖（亮色侧） */
  readerPaletteOverridesLight?: Partial<ReaderSurfacePalette>;
  /** 阅读器表面色用户覆盖（暗色侧） */
  readerPaletteOverridesDark?: Partial<ReaderSurfacePalette>;
};

export type SessionSnapshot = {
  currentFile: string | null;
  /** 源文件物理行号（含空行），视口顶部行 */
  viewportTopLine: number;
  /** 源文件物理行号（含空行），视口底部行 */
  viewportBottomLine: number;
};

function safeJsonParse(value: string | null | undefined) {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function isTxtFileItemArray(x: unknown): x is TxtFileItem[] {
  if (!Array.isArray(x)) return false;
  return x.every(
    (item) =>
      item &&
      typeof item === "object" &&
      typeof (item as TxtFileItem).path === "string",
  );
}

export function loadPersistedSettingsData(
  storage: Storage | undefined,
  key: string,
): PersistedSettingsData | null {
  const parsed = safeJsonParse(storage?.getItem(key));
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  const data: PersistedSettingsData = {};

  if (obj.theme === "vs" || obj.theme === "vs-dark") data.theme = obj.theme;
  if (typeof obj.sidebarWidth === "number" && Number.isFinite(obj.sidebarWidth)) {
    data.sidebarWidth = obj.sidebarWidth;
  }
  if (typeof obj.showSidebar === "boolean") {
    data.showSidebar = obj.showSidebar;
  }
  if (typeof obj.fontSize === "number" && Number.isFinite(obj.fontSize)) {
    data.fontSize = obj.fontSize;
  }
  if (
    typeof obj.lineHeightMultiple === "number" &&
    Number.isFinite(obj.lineHeightMultiple)
  ) {
    data.lineHeightMultiple = obj.lineHeightMultiple;
  }
  if (typeof obj.fontFamily === "string" && obj.fontFamily.trim()) {
    data.fontFamily = obj.fontFamily;
  }
  if (typeof obj.monacoCustomHighlight === "boolean") {
    data.monacoCustomHighlight = obj.monacoCustomHighlight;
  }
  if (typeof obj.compressBlankLines === "boolean") {
    data.compressBlankLines = obj.compressBlankLines;
  }
  if (typeof obj.compressBlankKeepOneBlank === "boolean") {
    data.compressBlankKeepOneBlank = obj.compressBlankKeepOneBlank;
  }
  if (typeof obj.leadIndentFullWidth === "boolean") {
    data.leadIndentFullWidth = obj.leadIndentFullWidth;
  }
  if (typeof obj.showChapterCounts === "boolean") {
    data.showChapterCounts = obj.showChapterCounts;
  }
  if (Array.isArray(obj.chapterRules)) {
    data.chapterRules = obj.chapterRules as ChapterMatchRule[];
  }
  if (typeof obj.restoreSessionOnStartup === "boolean") {
    data.restoreSessionOnStartup = obj.restoreSessionOnStartup;
  }
  if (
    typeof obj.recentFilesHistoryLimit === "number" &&
    Number.isFinite(obj.recentFilesHistoryLimit)
  ) {
    data.recentFilesHistoryLimit = Math.max(
      0,
      Math.min(100, Math.floor(obj.recentFilesHistoryLimit)),
    );
  }
  if (typeof obj.monacoAdvancedWrapping === "boolean") {
    data.monacoAdvancedWrapping = obj.monacoAdvancedWrapping;
  }
  if (
    typeof obj.fullscreenReaderWidthPercent === "number" &&
    Number.isFinite(obj.fullscreenReaderWidthPercent)
  ) {
    data.fullscreenReaderWidthPercent = Math.max(
      30,
      Math.min(100, Math.floor(obj.fullscreenReaderWidthPercent)),
    );
  }
  if (obj.shortcutBindings && typeof obj.shortcutBindings === "object") {
    data.shortcutBindings = obj.shortcutBindings as Partial<
      Record<ShortcutActionId, string>
    >;
  }
  if (
    obj.readerPaletteOverridesLight &&
    typeof obj.readerPaletteOverridesLight === "object"
  ) {
    const p = parseReaderPaletteOverrides(obj.readerPaletteOverridesLight);
    if (Object.keys(p).length) data.readerPaletteOverridesLight = p;
  }
  if (
    obj.readerPaletteOverridesDark &&
    typeof obj.readerPaletteOverridesDark === "object"
  ) {
    const p = parseReaderPaletteOverrides(obj.readerPaletteOverridesDark);
    if (Object.keys(p).length) data.readerPaletteOverridesDark = p;
  }
  return data;
}

export function persistSettingsData(
  storage: Storage | undefined,
  key: string,
  data: PersistedSettingsData,
) {
  try {
    storage?.setItem(key, JSON.stringify(data));
  } catch {
    // ignore
  }
}

export function loadSessionSnapshot(
  storage: Storage | undefined,
  key: string,
): SessionSnapshot | null {
  const parsed = safeJsonParse(storage?.getItem(key));
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;

  const currentFile =
    typeof obj.currentFile === "string" && obj.currentFile.trim()
      ? obj.currentFile
      : null;
  const viewportTopLine =
    typeof obj.viewportTopLine === "number" && Number.isFinite(obj.viewportTopLine)
      ? Math.max(1, Math.floor(obj.viewportTopLine))
      : 1;
  const viewportBottomLine =
    typeof obj.viewportBottomLine === "number" &&
    Number.isFinite(obj.viewportBottomLine)
      ? Math.max(1, Math.floor(obj.viewportBottomLine))
      : 1;

  return {
    currentFile,
    viewportTopLine,
    viewportBottomLine,
  };
}

export function persistSessionSnapshot(
  storage: Storage | undefined,
  key: string,
  data: SessionSnapshot,
) {
  try {
    storage?.setItem(key, JSON.stringify(data));
  } catch {
    // ignore
  }
}

export function clearSessionSnapshot(storage: Storage | undefined, key: string) {
  try {
    storage?.removeItem(key);
  } catch {
    // ignore
  }
}

export function loadTxtFileListSnapshot(
  storage: Storage | undefined,
  key: string,
): TxtFileItem[] {
  const parsed = safeJsonParse(storage?.getItem(key));
  return isTxtFileItemArray(parsed) ? parsed : [];
}

export function persistTxtFileListSnapshot(
  storage: Storage | undefined,
  key: string,
  data: TxtFileItem[],
) {
  try {
    storage?.setItem(key, JSON.stringify(data));
  } catch {
    // ignore
  }
}
