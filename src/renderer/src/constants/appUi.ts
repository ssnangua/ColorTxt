import { readerEditorLineHeight } from "../monaco/readerEditorOptions";

export type { ReaderSurfacePalette } from "./readerPalette";
export {
  applyReaderSurfaceToDocument,
  defaultReaderPaletteDark,
  defaultReaderPaletteLight,
  isValidReaderSurfaceHex,
  mergeReaderSurfacePalette,
  overridesFromFullPalette,
  parseReaderPaletteOverrides,
  READER_SURFACE_KEYS,
  READER_SURFACE_LABELS,
  READER_SURFACE_ROW_PAIRS,
} from "./readerPalette";

export {
  APP_DISPLAY_NAME,
  GITHUB_REPO_URL,
  GITHUB_RELEASES_LATEST_URL,
} from "@shared/packageDerived";

export const defaultPathText = "拖放目录或 .txt 文件到窗口";

/** 已打开但解码后无正文的文件（如 0 字节） */
export const emptyFileHintText = "文件已打开，但没有内容";

export const SIDEBAR_MIN_WIDTH = 250;
export const SIDEBAR_MIN_READER_WIDTH = 300;

export const FULLSCREEN_LEFT_EDGE_PX = 20;
export const FULLSCREEN_TOP_EDGE_PX = 20;
export const FULLSCREEN_BOTTOM_EDGE_PX = 20;
export const FULLSCREEN_RIGHT_SCROLLBAR_GUTTER_PX = 20;

export const persistKey = "colorTxt.ui.settings";
export const sessionKey = "colorTxt.session";
export const fileListKey = "colorTxt.file.list";
export const recentFilesKey = "colorTxt.recent.files";
export const fileMetaKey = "colorTxt.file.meta";

/**
 * 清除缓存并刷新前写入 sessionStorage；卸载时若存在则跳过会话/列表/meta 落盘，
 * 避免 `beforeunload` / `pagehide` 把内存状态写回已清空的 localStorage。
 */
export const skipUnloadPersistenceSessionKey = "colorTxt.skipUnloadPersistence";

/**
 * 无本地设置或与 {@link persistKey} 对应字段缺失时的初始值。
 * 修改默认体验时只改此处（及组件 prop 的 withDefaults，若需一致）。
 */
export const defaultReaderTheme = "vs";
export const defaultShowSidebar = true;
export const defaultMonacoCustomHighlight = true;
/** 为 true 时在加载文件流中丢弃空行（仅空格/缩进也视为空行） */
export const defaultCompressBlankLines = false;
/** 压缩空行时是否在每行正文下方保留一行空行（章节标题行除外） */
export const defaultCompressBlankKeepOneBlank = false;
/** 为 true 时正文行统一行首两个全角空格（章节标题行与空行除外） */
export const defaultLeadIndentFullWidth = false;
export const defaultShowChapterCounts = true;
export const defaultReaderFontSize = 24;
export const defaultReaderLineHeightMultiple = 1.5;
export const defaultRestoreSessionOnStartup = true;
export const defaultMonacoAdvancedWrapping = false;

/** 默认「最近打开」条数上限（可被设置覆盖） */
export const defaultRecentFilesHistoryLimit = 20;
export const maxRecentFilesHistoryLimit = 1000;
/** 全屏时阅读区域宽度百分比（仅 Monaco 主体区域） */
export const defaultFullscreenReaderWidthPercent = 50;
export const minFullscreenReaderWidthPercent = 30;
export const maxFullscreenReaderWidthPercent = 100;

export const minFontSize = 10;
export const maxFontSize = 100;

export const minLineHeightMultiple = 1.0;
/** Monaco `lineHeight` 选项在像素意义上的有效上限（见 `readerEditorLineHeight`） */
export const monacoMaxLineHeightPx = 150;
export const lineHeightMultipleStep = 0.1;

export function normalizeLineHeightMultiple(m: number): number {
  return Math.round(m * 10) / 10;
}

/**
 * 在给定字号下，行高倍数的上限（与 {@link readerEditorLineHeight}、Monaco 行高上限一致）。
 */
export function maxLineHeightMultipleForFontSize(fontSize: number): number {
  const F = Math.max(
    minFontSize,
    Math.min(maxFontSize, Math.round(Number(fontSize))),
  );
  if (!Number.isFinite(F)) return minLineHeightMultiple;

  let m = normalizeLineHeightMultiple(monacoMaxLineHeightPx / F);
  while (m >= minLineHeightMultiple - 1e-9) {
    if (readerEditorLineHeight(F, m) <= monacoMaxLineHeightPx) {
      return Math.max(minLineHeightMultiple, m);
    }
    m = normalizeLineHeightMultiple(m - lineHeightMultipleStep);
  }
  return minLineHeightMultiple;
}

export function clampLineHeightMultipleForFontSize(
  fontSize: number,
  multiple: number,
): number {
  const cap = maxLineHeightMultipleForFontSize(fontSize);
  return normalizeLineHeightMultiple(
    Math.max(minLineHeightMultiple, Math.min(cap, multiple)),
  );
}
