import { readerEditorLineHeight } from "../monaco/readerEditorOptions";
import { MODAL_STACK_BASE_Z_INDEX } from "../utils/modalStack";

export type {
  ReaderSurfaceColorEnabled,
  ReaderSurfaceOptionalColorKey,
  ReaderSurfacePalette,
} from "./readerPalette";
export {
  applyReaderSurfaceToDocument,
  defaultReaderPaletteColorEnabled,
  defaultReaderPaletteDark,
  defaultReaderPaletteLight,
  isReaderSurfaceOptionalColorKey,
  isValidReaderSurfaceHex,
  mergeReaderPaletteColorEnabled,
  mergeReaderSurfacePalette,
  overridesFromColorEnabled,
  overridesFromFullPalette,
  parseReaderPaletteColorEnabledOverrides,
  parseReaderPaletteOverrides,
  READER_SURFACE_KEYS,
  READER_SURFACE_LABELS,
  READER_SURFACE_OPTIONAL_COLOR_KEYS,
  READER_SURFACE_TABLE_ROWS,
  resolveEffectiveReaderPalette,
} from "./readerPalette";

export {
  APP_DISPLAY_NAME,
  GITHUB_REPO_URL,
  GITHUB_RELEASES_LATEST_URL,
} from "@shared/packageDerived";

export const fileListEmptyHint = "无文件";
export const fileListDropHint = "（拖放目录或文件到这里）";
export const fileListNoMatchHint = "无匹配文件";

export const defaultReaderIdleHint = "未打开文件";
export const defaultReaderOpenHint = "（拖放文件到这里）";
/** 已打开但解码后无正文的文件（如 0 字节） */
export const emptyFileHintText = "文件已打开，但没有内容";

/** 阅读区居中：电子书转 `{原名}.txt` 阶段 */
export const readerEbookConvertingHintText = "转换中…";
/** 彩读书包 ZIP 解析 / 解压阶段 */
export const readerBookPackUnpackingHintText = "解包中…";
/** 阅读区居中：正文流式读入且尚未写入任何行时 */
export const readerTxtLoadingHintText = "加载中…";

export const SIDEBAR_MIN_WIDTH = 250;
export const SIDEBAR_MIN_READER_WIDTH = 300;
/** 侧栏左侧活动栏（图标列）固定宽度，与 `sidebarWidth` 持久化中的「总宽」相加关系为：总宽 = 本列 + 面板列 */
export const SIDEBAR_ACTIVITY_BAR_WIDTH = 48;
/** 找书阅读器侧栏最小宽度（无活动栏，等同主界面章节列最小宽） */
export const FIND_BOOK_SIDEBAR_MIN_WIDTH =
  SIDEBAR_MIN_WIDTH - SIDEBAR_ACTIVITY_BAR_WIDTH;

export const FULLSCREEN_LEFT_EDGE_PX = 20;
export const FULLSCREEN_TOP_EDGE_PX = 20;
export const FULLSCREEN_BOTTOM_EDGE_PX = 20;
export const FULLSCREEN_RIGHT_SCROLLBAR_GUTTER_PX = 20;

/**
 * 侧栏文件列表等 Teleport 到 `body` 的浮层根节点应带对应 `data-*` 属性，
 * 全屏浮动侧栏的 `mouseleave`、`.layout` 按下收起、空白区滚轮等逻辑据此白名单识别。
 */
export const FULLSCREEN_SIDEBAR_FLOAT_SELECTOR =
  "[data-fullscreen-sidebar-float]";

/**
 * `AppModal` 蒙层根节点带此属性；全屏浮动顶栏 `mouseleave` 时移入弹层不视为离开顶栏交互区。
 */
export const FULLSCREEN_HEADER_FLOAT_SELECTOR =
  "[data-fullscreen-header-float]";

/** 须高于 `AppModal` 模态栈，弹层内 `java.toast`（IPC→appToast）才能可见 */
export const APP_TOAST_Z_INDEX = MODAL_STACK_BASE_Z_INDEX + 500;

export const persistKey = "colorTxt.ui.settings";
/** 同窗口内 localStorage 写入 {@link persistKey} 后派发，供找书阅读器等同步主界面设置 */
export const persistedSettingsChangedEvent = "colortxt:persisted-settings-changed";
/** 「书包密码」弹框「显示密码」勾选（`"1"` / 其它） */
export const bookPackPromptShowPasswordKey =
  "colorTxt.ui.bookPackPromptShowPassword";
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
 * 恢复界面默认并刷新前写入 sessionStorage；若存在则 {@link persistSettings} 直接跳过，
 * 避免删除 {@link persistKey} 后其它变更路径把内存中的旧界面设置写回。
 */
export const skipSettingsPersistenceSessionKey = "colorTxt.skipSettingsPersistence";

/**
 * 无本地设置或与 {@link persistKey} 对应字段缺失时的初始值。
 * 修改默认体验时只改此处（及组件 prop 的 withDefaults，若需一致）。
 */
export const defaultReaderTheme = "vs";
export const defaultShowSidebar = true;
export const defaultMonacoCustomHighlight = true;
/**
 * 为 true 且开启「内容上色」时，Monarch 成对引号/括号可跨行。
 * 为 false 时：换行即退出未闭合的引号/括号状态；开启时也会在异常长的未闭合范围后自动恢复。
 */
export const defaultTxtrDelimitedMatchCrossLine = true;
/** 为 true 时在加载文件流中丢弃空行（仅空格/缩进也视为空行） */
export const defaultCompressBlankLines = false;
/** 压缩空行时是否在每行正文下方保留一行空行（章节标题行除外） */
export const defaultCompressBlankKeepOneBlank = false;
/** 为 true 时正文行统一行首两个全角空格（章节标题行与空行除外） */
export const defaultLeadIndentFullWidth = false;
export {
  defaultTextConvertDigitMode,
  defaultTextConvertLetterMode,
  defaultTextConvertZhMode,
} from "@shared/textConvertTypes";
export const defaultShowChapterCounts = true;
/** 章节列表与底栏总字数是否显示具体数值（关闭时 ≥1 万用「万字」简写） */
export const defaultChapterCharCountExact = false;
/** 少于该字数的片段不作为章节（作用于章节列表/导航） */
export const defaultChapterMinCharCount = 1;
export const minChapterMinCharCount = 0;
export const maxChapterMinCharCount = 100000;
export const defaultReaderFontSize = 24;
export const defaultReaderLineHeightMultiple = 1.5;
export const defaultRestoreSessionOnStartup = true;
/** 是否监控当前打开文件并在磁盘变更后自动重新加载（默认关闭） */
export const defaultSyncCurrentFile = false;
export const defaultMonacoAdvancedWrapping = false;
/** Monaco 阅读区：滚轮/跳转等是否使用平滑滚动动画 */
export const defaultMonacoSmoothScrolling = true;
/** Monaco `mouseWheelScrollSensitivity`：滚轮 delta 倍率 */
export const defaultMouseWheelScrollSensitivity = 1;
export const minMouseWheelScrollSensitivity = 0.1;
export const maxMouseWheelScrollSensitivity = 10;
/** Monaco `fastScrollSensitivity`：按住 Alt 时的滚轮加速倍率 */
export const defaultFastScrollSensitivity = 5;
export const minFastScrollSensitivity = 1;
export const maxFastScrollSensitivity = 20;

export function clampMouseWheelScrollSensitivity(n: number): number {
  if (!Number.isFinite(n)) return defaultMouseWheelScrollSensitivity;
  return Math.min(
    maxMouseWheelScrollSensitivity,
    Math.max(minMouseWheelScrollSensitivity, n),
  );
}

export function clampFastScrollSensitivity(n: number): number {
  if (!Number.isFinite(n)) return defaultFastScrollSensitivity;
  return Math.min(
    maxFastScrollSensitivity,
    Math.max(minFastScrollSensitivity, n),
  );
}

/** 阅读区顶部是否显示粘性章节标题（Monaco stickyScroll + outlineModel） */
export const defaultStickyChapterTitleEnabled = true;
/** 主界面阅读区底部「上一章 / 下一章」工具栏（默认关闭） */
export const defaultChapterNavToolbarEnabled = false;
/** 编辑模式下 Monaco 是否显示行号（只读模式始终关闭） */
export const defaultReaderEditShowLineNumbers = false;
/** 编辑模式下 Monaco 是否显示小地图（只读模式始终关闭） */
export const defaultReaderEditMinimap = false;
/** 编辑模式下内容变更时自动刷新侧栏章节列表（超过行数上限时需手动刷新） */
export const defaultEditAutoRefreshChapterList = true;
/** 自动刷新章节列表的最大行数（含） */
export const editAutoRefreshChapterListMaxLines = 300_000;

export { defaultAiSmartFormatSettings } from "@shared/aiSmartFormatTypes";

/** 默认「最近打开」条数上限（可被设置覆盖） */
export const defaultRecentFilesHistoryLimit = 20;
export const maxRecentFilesHistoryLimit = 1000;
/** 全屏时阅读区域宽度百分比（仅 Monaco 主体区域） */
export const defaultFullscreenReaderWidthPercent = 50;
export const minFullscreenReaderWidthPercent = 30;
export const maxFullscreenReaderWidthPercent = 100;
/** 全屏时是否在左下角显示系统时间 */
export const defaultFullscreenShowSystemTime = true;

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
