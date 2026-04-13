<script setup lang="ts">
import { computed, provide, ref, useTemplateRef } from "vue";
import type { ComponentPublicInstance } from "vue";
import { getChapterMatchRules, type Chapter } from "./chapter";
import AppHeader, { type RecentFileItem } from "./components/AppHeader.vue";
import ReaderSidebar from "./components/ReaderSidebar.vue";
import AppFooter from "./components/AppFooter.vue";
import ReaderMain from "./components/ReaderMain.vue";
import AppOverlays from "./components/AppOverlays.vue";
import type { SettingsApplyPayload } from "./components/SettingsPanel.vue";
import { bookmarkNoteInputRefKey } from "./injectionKeys";
import { useAppBookmarkPins } from "./composables/useAppBookmarkPins";
import { useAppChapterListSync } from "./composables/useAppChapterListSync";
import { useAppChapterNavigation } from "./composables/useAppChapterNavigation";
import { useAppFileSession } from "./composables/useAppFileSession";
import { useAppFullscreenReaderLayout } from "./composables/useAppFullscreenReaderLayout";
import { useAppPersistence } from "./composables/useAppPersistence";
import { useAppReaderChrome } from "./composables/useAppReaderChrome";
import { useAppReadingProgress } from "./composables/useAppReadingProgress";
import { useAppReaderUiPrefs } from "./composables/useAppReaderUiPrefs";
import { useAppShellThemeWatch } from "./composables/useAppShellThemeWatch";
import { useAppWindowBindings } from "./composables/useAppWindowBindings";
import { useTxtStreamPipeline } from "./composables/useTxtStreamPipeline";
import { fileHistoryKey } from "./stores/recentHistoryStore";
import {
  assignHighlightTermToColorForFile,
  findFileMetaRecord,
  removeHighlightTermFromFile,
  type FileMetaRecord,
} from "./stores/fileMetaStore";
import {
  applyReaderSurfaceToDocument,
  defaultCompressBlankKeepOneBlank,
  defaultCompressBlankLines,
  defaultFullscreenReaderWidthPercent,
  defaultLeadIndentFullWidth,
  defaultMonacoAdvancedWrapping,
  defaultMonacoCustomHighlight,
  defaultReaderIdleHint,
  defaultReaderFontSize,
  defaultReaderLineHeightMultiple,
  defaultReaderPaletteDark,
  defaultReaderPaletteLight,
  defaultReaderTheme,
  defaultRecentFilesHistoryLimit,
  mergeReaderSurfacePalette,
  overridesFromFullPalette,
  defaultRestoreSessionOnStartup,
  defaultTxtrDelimitedMatchCrossLine,
  defaultShowChapterCounts,
  defaultShowSidebar,
  emptyFileHintText,
  readerTxtLoadingHintText,
  GITHUB_REPO_URL,
  maxFullscreenReaderWidthPercent,
  clampLineHeightMultipleForFontSize,
  maxFontSize,
  maxLineHeightMultipleForFontSize,
  maxRecentFilesHistoryLimit,
  minFullscreenReaderWidthPercent,
  minFontSize,
  minLineHeightMultiple,
  type ReaderSurfacePalette,
} from "./constants/appUi";
import {
  DEFAULT_HIGHLIGHT_COLORS_DARK,
  DEFAULT_HIGHLIGHT_COLORS_LIGHT,
  MIN_HIGHLIGHT_COLORS,
  mergeHighlightColors,
} from "./constants/highlightColors";
import { formatCharCount, formatFileSize } from "./utils/format";
import { READER_EDITOR_DEFAULT_FONT_FAMILY } from "./monaco/readerEditorOptions";
import {
  createDefaultShortcutBindings,
  type ShortcutBindingMap,
} from "./services/shortcutRegistry";
import { mergeShortcutBindings } from "./services/shortcutUtils";

const readerRef = ref<InstanceType<typeof ReaderMain> | null>(null);
const chrome = useAppReaderChrome({ readerRef });
const {
  isFullscreenView,
  showFullscreenTip,
  fullscreenTipFading,
  showFullscreenHeader,
  fullscreenHeaderOverlayRef,
  showFullscreenFooter,
  fullscreenFooterOverlayRef,
  showFullscreenSidebar,
  fullscreenSidebarOverlayRef,
  sidebarWidth,
  fullscreenSidebarWidth,
  sidebarWidthForLayout,
  resizingSidebar,
  enterOrExitFullscreenView,
  getSidebarMaxWidth,
  getSidebarMinWidth,
  clampSidebarWidthToViewport,
  startResizeSidebar,
  updateFullscreenHeaderHover,
  updateFullscreenFooterHover,
  updateFullscreenSidebarHover,
  onFullscreenSidebarMouseLeave,
  onFullscreenHeaderMouseLeave,
  onFullscreenFooterMouseLeave,
  dismissFullscreenPanelsOnLayoutPointerDown,
  endSidebarResize,
  dismissFullscreenChromeForNativeExit,
  fullscreenCursorHidden,
  bumpFullscreenCursorIdle,
} = chrome;

function setFullscreenHeaderOverlayEl(
  el: Element | ComponentPublicInstance | null,
) {
  if (el == null) {
    fullscreenHeaderOverlayRef.value = null;
    return;
  }
  fullscreenHeaderOverlayRef.value =
    el instanceof HTMLElement
      ? el
      : ((el as ComponentPublicInstance).$el as HTMLElement | null);
}

function setFullscreenFooterOverlayEl(
  el: Element | ComponentPublicInstance | null,
) {
  if (el == null) {
    fullscreenFooterOverlayRef.value = null;
    return;
  }
  fullscreenFooterOverlayRef.value =
    el instanceof HTMLElement
      ? el
      : ((el as ComponentPublicInstance).$el as HTMLElement | null);
}

const showAboutPanel = ref(false);
const showShortcutPanel = ref(false);
const showSettingsPanel = ref(false);
const showColorSchemePanel = ref(false);
const appOverlaysRef = ref<InstanceType<typeof AppOverlays> | null>(null);
const showChapterRulePanel = ref(false);
const chapterRuleErrorText = ref("");
const chapterRuleState = ref(getChapterMatchRules());
const currentFile = ref<string | null>(null);
const loading = ref(false);
/** 打开文件时主进程流式读取的字节进度（0–100），无总大小时为 null */
const loadingProgressPercent = ref<number | null>(null);
/** 递归扫描目录中的 .txt 时：蒙版 + 当前处理的相对路径 */
const dirListScanning = ref(false);
const dirListCurrentName = ref("");
const fileEncoding = ref<string>("-");
const currentFileSize = ref<number | null>(null);
const totalCharCount = ref(0);
const totalLineCount = ref(0);

const chapters = ref<Chapter[]>([]);
const activeChapterIdx = ref<number>(-1);
const showChapterCounts = ref(defaultShowChapterCounts);
const sidebarTab = ref<"files" | "chapters" | "bookmarks">("files");
const txtFiles = ref<Array<{ name: string; path: string; size: number }>>([]);
const fileMetaRecords = ref<FileMetaRecord[]>([]);
const showSidebar = ref(defaultShowSidebar);
const readerSidebarRef = ref<InstanceType<typeof ReaderSidebar> | null>(null);
const chapterSync = useAppChapterListSync();
const {
  chapterListScrollSmooth,
  shouldCenterChapterList,
  pulseChapterListCenter,
  shouldCenterFileList,
  suppressFileListCenterAfterLoad,
  shouldCenterBookmarkList,
  pulseBookmarkListCenter,
} = chapterSync;
/** 阅读区无打开文件且未在加载/转换时，居中显示 defaultReaderIdleHint */
const showReaderIdleHint = computed(() => !currentFile.value && !loading.value);
/** 电子书正文流尚未写入行时，复用 `.readerIdleHint` 居中提示 */
const showReaderBusyHint = computed(
  () =>
    loading.value && totalLineCount.value === 0 && totalCharCount.value === 0,
);
const readerBusyHintText = computed(() => readerTxtLoadingHintText);
/** 已打开文件且流式加载完成、正文行数与字数均为 0 时居中提示 */
const showReaderEmptyHint = computed(
  () =>
    Boolean(currentFile.value) &&
    !loading.value &&
    totalCharCount.value === 0 &&
    totalLineCount.value === 0,
);
/** 非全屏：受 showSidebar；全屏：左缘悬停显示 */
const sidebarVisible = computed(
  () =>
    (!isFullscreenView.value && showSidebar.value) ||
    (isFullscreenView.value && showFullscreenSidebar.value),
);
const currentTheme = ref(defaultReaderTheme);
/** Monaco txtr.* 语法着色（标点/数字/英文/引号与括号内等） */
const monacoCustomHighlight = ref(defaultMonacoCustomHighlight);
/** 为 true 时在加载文件流中丢弃空行（仅空格/缩进也视为空行） */
const compressBlankLines = ref(defaultCompressBlankLines);
/** 压缩空行时是否在每行正文下方保留一行空行（章节标题行除外） */
const compressBlankKeepOneBlank = ref(defaultCompressBlankKeepOneBlank);
/** 与「内容上色」同时生效：Monarch 成对引号/括号是否跨行 */
const txtrDelimitedMatchCrossLine = ref(defaultTxtrDelimitedMatchCrossLine);
/** 为 true 时正文行统一行首两个全角空格（章节标题行与空行除外） */
const leadIndentFullWidth = ref(defaultLeadIndentFullWidth);
const readerFontSize = ref(defaultReaderFontSize);
const readerLineHeightMultiple = ref(defaultReaderLineHeightMultiple);
const monacoFontFamily = ref(READER_EDITOR_DEFAULT_FONT_FAMILY);
const defaultShortcutBindings = createDefaultShortcutBindings(
  /mac|iphone|ipad|ipod/i.test(navigator.platform || ""),
);
const shortcutBindings = ref<ShortcutBindingMap>({
  ...defaultShortcutBindings,
});

/** 启动时是否恢复上次会话快照（localStorage）；关闭时不写入会话 */
const restoreSessionOnStartup = ref(defaultRestoreSessionOnStartup);
/** 最近打开文件条数上限，0 表示不记录 */
const recentFilesHistoryLimit = ref(defaultRecentFilesHistoryLimit);
/** Monaco wrappingStrategy：advanced 换行更优、更重 */
const monacoAdvancedWrapping = ref(defaultMonacoAdvancedWrapping);
/** 全屏时阅读区域宽度（百分比） */
const fullscreenReaderWidthPercent = ref(defaultFullscreenReaderWidthPercent);
/** 电子书转换缓存目录；默认 userData/ConvertedTxt；设置里清空则为与源文件同目录 */
const ebookConvertOutputDir = ref(
  (() => {
    try {
      return window.colorTxt.getDefaultEbookConvertOutputDir();
    } catch {
      return "";
    }
  })(),
);
/** 电子书转换阶段（底栏显示「转换中…」） */
const ebookParsing = ref(false);
/** 转换进行中的电子书原路径（底栏路径；早于 currentFile 更新） */
const ebookConversionSourcePath = ref<string | null>(null);

const readerPaletteOverridesLight = ref<Partial<ReaderSurfacePalette>>({});
const readerPaletteOverridesDark = ref<Partial<ReaderSurfacePalette>>({});

const highlightColorsLight = ref<string[]>([...DEFAULT_HIGHLIGHT_COLORS_LIGHT]);
const highlightColorsDark = ref<string[]>([...DEFAULT_HIGHLIGHT_COLORS_DARK]);

const readerSurfaceLight = computed(() =>
  mergeReaderSurfacePalette(
    defaultReaderPaletteLight,
    readerPaletteOverridesLight.value,
  ),
);
const readerSurfaceDark = computed(() =>
  mergeReaderSurfacePalette(
    defaultReaderPaletteDark,
    readerPaletteOverridesDark.value,
  ),
);

const highlightColorsForReader = computed(() =>
  currentTheme.value === "vs"
    ? highlightColorsLight.value
    : highlightColorsDark.value,
);

const currentFileHighlightWords = computed(() => {
  const p = currentFile.value;
  if (!p) return undefined;
  return findFileMetaRecord(fileMetaRecords.value, p)?.highlightWordsByIndex;
});

const currentFileHighlightTerms = computed<
  Array<{ text: string; color: string; colorIndex: number }>
>(() => {
  const groups = currentFileHighlightWords.value;
  if (!groups) return [];
  const colors = highlightColorsForReader.value;
  const bodyText =
    currentTheme.value === "vs"
      ? readerSurfaceLight.value.bodyText
      : readerSurfaceDark.value.bodyText;
  const out: Array<{ text: string; color: string; colorIndex: number }> = [];
  for (const [idxKey, terms] of Object.entries(groups)) {
    const idx = Number.parseInt(idxKey, 10);
    if (!Number.isFinite(idx) || idx < 0) continue;
    const color = idx < colors.length ? colors[idx] : bodyText;
    for (const text of terms) {
      if (!text) continue;
      out.push({ text, color, colorIndex: idx });
    }
  }
  return out;
});

const readerPaneWrapRef = useTemplateRef<HTMLElement>("readerPaneWrapRef");
const {
  fullscreenReaderPaneStyle,
  onLayoutMouseDown: onFullscreenLayoutMouseDown,
  onLayoutWheel,
} = useAppFullscreenReaderLayout({
  isFullscreenView,
  readerRef,
  fullscreenSidebarOverlayRef,
  fullscreenReaderWidthPercent,
  readerPaneWrapRef,
});

function onLayoutMouseDown(ev: MouseEvent) {
  dismissFullscreenPanelsOnLayoutPointerDown(ev);
  onFullscreenLayoutMouseDown(ev);
}

const recentFiles = ref<RecentFileItem[]>([]);

/** 当前阅读位置（与 Monaco 可见区 probe 一致），用于会话恢复 */
const lastProbeLine = ref(1);
/** 视窗可见区首行 / 末行（Monaco 显示行号），用于阅读进度计算 */
const viewportTopLine = ref(1);
const viewportEndLine = ref(1);
/** 阅读区域滚动进度（0-100），按 scrollTop/maxScrollTop 计算 */
const viewportVisualProgressPercent = ref(0);
/** 阅读区域当前是否在底部（滚动意义） */
const viewportAtBottom = ref(false);
/** 流式加载结束后按源文件物理行号（含空行）恢复滚动；滤空时映射为显示行号 */
const pendingRestorePhysicalLine = ref<number | null>(null);
/** 流结束后 Monaco `restoreViewState`；与 pendingRestorePhysicalLine 二选一 */
const pendingRestoreEditorViewState = ref<unknown | null>(null);
/** 与视图状态同时恢复的视口首行物理行号锚点（用于恢复后校验） */
const pendingRestoreViewportTopPhysicalLine = ref<number | null>(null);
/** 与主进程 file:stream 的 requestId 对齐；resetSession 时清空，避免重复打开同一文件时旧 chunk 串入 */
const activeStreamRequestId = ref<number | null>(null);
const activeStreamFilePath = ref<string | null>(null);
/** 底栏路径与「在文件夹中显示」：电子书打开时为转换后的 `{原名}.txt` 路径 */
const physicalReaderPath = ref<string | null>(null);
/** 当前文件是否已完成加载与阅读位置同步；无打开文件时为 true，打开/重置会话后为 false，流结束并完成滚动后为 true */
const readingProgressSynced = ref(true);

let afterStreamFullTextInstalled: () => void | Promise<void> = async () => {};

const stream = useTxtStreamPipeline({
  readerRef,
  chapters,
  totalCharCount,
  totalLineCount,
  compressBlankLines,
  compressBlankKeepOneBlank,
  leadIndentFullWidth,
  afterFullTextInstalled: () => afterStreamFullTextInstalled(),
});

const persistence = useAppPersistence({
  readerRef,
  stream,
  lastProbeLine,
  viewportEndLine,
  txtFiles,
  currentFile,
  readingProgressSynced,
  sidebarWidth,
  showSidebar,
  currentTheme,
  monacoCustomHighlight,
  compressBlankLines,
  compressBlankKeepOneBlank,
  txtrDelimitedMatchCrossLine,
  leadIndentFullWidth,
  showChapterCounts,
  readerFontSize,
  readerLineHeightMultiple,
  monacoFontFamily,
  chapterRuleState,
  recentFiles,
  restoreSessionOnStartup,
  recentFilesHistoryLimit,
  monacoAdvancedWrapping,
  fullscreenReaderWidthPercent,
  fileMetaRecords,
  shortcutBindings,
  defaultShortcutBindings,
  readerPaletteOverridesLight,
  readerPaletteOverridesDark,
  highlightColorsLight,
  highlightColorsDark,
  ebookConvertOutputDir,
});
const {
  persistSettings,
  clearRecentFiles,
  persistWindowUnloadState,
  persistFileListCache,
  persistFileMeta,
  touchRecentFile,
  upsertBookmark,
  removeBookmark,
  clearBookmarks,
  initPersistenceBootstrap,
  applyRecentFilesHistoryLimitFromSettings,
  clearPersistedSession,
  metaProgressByPathKey,
} = persistence;

/** 加载期底栏/侧栏：当前文件的存档进度仅来自 file.meta */
const archivedProgressForCurrentFile = computed(() => {
  const cur = currentFile.value;
  if (!cur) return undefined;
  const key = fileHistoryKey(cur);
  const fromMap = metaProgressByPathKey.value.get(key);
  if (typeof fromMap === "number" && Number.isFinite(fromMap)) {
    return fromMap;
  }
  return undefined;
});

const { readingProgressParts } = useAppReadingProgress({
  totalLineCount,
  viewportTopLine,
  viewportEndLine,
  viewportVisualProgressPercent,
  currentFile,
  loading,
  readingProgressSynced,
  archivedProgressPercentForCurrentFile: archivedProgressForCurrentFile,
  physicalProgress: stream,
});

/** 与底栏 `readingProgressParts.percentValue` 一致，加载期用存档或 0%，避免当前行不显示 */
const liveReadingProgressForUi = computed<number | undefined>(() => {
  const v = readingProgressParts.value.percentValue;
  return typeof v === "number" ? v : undefined;
});

/** 顶栏「更多」里最近文件：仅路径来自 recent，进度来自 meta（当前书用 live） */
const recentFilesForMenu = computed<RecentFileItem[]>(() => {
  const map = metaProgressByPathKey.value;
  const live = liveReadingProgressForUi.value;
  const cur = currentFile.value;
  const curKey = cur ? fileHistoryKey(cur) : "";
  return recentFiles.value.map((item) => {
    const k = fileHistoryKey(item.path);
    let progress: number | undefined;
    if (curKey && k === curKey && typeof live === "number") {
      progress = live;
    } else {
      progress = map.get(k);
    }
    return { path: item.path, progress };
  });
});

void initPersistenceBootstrap().catch(() => {
  // 启动引导失败时不阻断应用；目录兜底见 useAppPersistence
});

const {
  pinActive,
  canPin,
  canBookmark,
  addBookmarkOpen,
  removeBookmarkOpen,
  bookmarkNoteInput,
  bookmarkNoteInputRef,
  editingBookmarkLine,
  activeBookmarkInViewport,
  activeBookmarkLine,
  bookmarkActive,
  bookmarkListItems,
  onPinClick,
  onGoBackFromPin,
  onBookmarkClick,
  confirmAddBookmark,
  confirmRemoveActiveBookmark,
  jumpToBookmark,
  clearCurrentFileBookmarks,
  removeCurrentFileBookmarks,
  onEditBookmark,
  onRemoveBookmark,
} = useAppBookmarkPins({
  readerRef,
  stream,
  currentFile,
  loading,
  totalLineCount,
  fileMetaRecords,
  lastProbeLine,
  viewportEndLine,
  sidebarTab,
  pulseBookmarkListCenter,
  upsertBookmark,
  removeBookmark,
  clearBookmarks,
});

provide(bookmarkNoteInputRefKey, bookmarkNoteInputRef);

const fileSession = useAppFileSession({
  readerRef,
  readerSidebarRef,
  stream,
  persistence,
  chapterSync,
  currentFile,
  loading,
  loadingProgressPercent,
  dirListScanning,
  dirListCurrentName,
  fileEncoding,
  currentFileSize,
  totalCharCount,
  totalLineCount,
  chapters,
  activeChapterIdx,
  sidebarTab,
  txtFiles,
  lastProbeLine,
  viewportTopLine,
  viewportEndLine,
  pendingRestorePhysicalLine,
  pendingRestoreEditorViewState,
  pendingRestoreViewportTopPhysicalLine,
  recentFiles,
  restoreSessionOnStartup,
  activeStreamRequestId,
  activeStreamFilePath,
  physicalReaderPath,
  readingProgressSynced,
  ebookConvertOutputDir,
  ebookParsing,
  ebookConversionSourcePath,
});

const {
  clearFileList,
  removeFileList,
  closeCurrentFile,
  openFileViaDialog,
  openFileFromSidebar,
  pickTxtDirectory,
  openFilePath,
  openRecentFileFromHistory,
} = fileSession;

const footerPathCaption = computed(() => {
  if (ebookParsing.value && ebookConversionSourcePath.value) {
    return ebookConversionSourcePath.value;
  }
  return physicalReaderPath.value ?? currentFile.value ?? "";
});

const chapterNav = useAppChapterNavigation({
  readerRef,
  chapters,
  activeChapterIdx,
  lastProbeLine,
  viewportTopLine,
  viewportEndLine,
  currentFile,
  readingProgressSynced,
  stream,
  touchRecentFile,
  chapterListScrollSmooth,
  chapterRuleState,
  chapterRuleErrorText,
  showChapterRulePanel,
  sidebarTab,
  persistSettings,
  openFilePath,
});

afterStreamFullTextInstalled = async () => {
  await readerRef.value?.applyEmbeddedImageAnchors(physicalReaderPath.value);
  readerRef.value?.applyEbookInternalLinkMarkers?.();
  stream.resyncMirrorFromReader();
  chapterNav.rebuildChaptersFromCurrentText();
};

const {
  jumpToChapter,
  jumpToPrevChapter,
  jumpToNextChapter,
  onProbeLineChange,
  applyChapterMatchRules,
} = chapterNav;

const readerUi = useAppReaderUiPrefs({
  readerRef,
  readerFontSize,
  readerLineHeightMultiple,
  monacoFontFamily,
  monacoCustomHighlight,
  monacoAdvancedWrapping,
  compressBlankLines,
  leadIndentFullWidth,
  currentFile,
  stream,
  persistSettings,
  openFilePath,
  isFullscreenView,
  showFullscreenHeader,
  viewportTopLine,
  viewportEndLine,
  viewportVisualProgressPercent,
  viewportAtBottom,
});

const {
  onViewportTopLineChange,
  onViewportEndLineChange,
  onViewportVisualProgressChange,
  increaseFontSize,
  decreaseFontSize,
  increaseLineHeight,
  decreaseLineHeight,
  setMonacoFontFamily,
  toggleMonacoCustomHighlight,
  toggleMonacoAdvancedWrapping,
  toggleCompressBlankLines,
  toggleLeadIndentFullWidth,
  onToggleFind,
} = readerUi;

function openGithubRepo() {
  void window.colorTxt.openExternal(GITHUB_REPO_URL);
}

function requestCheckForUpdates() {
  void appOverlaysRef.value?.checkForUpdates();
}

function openNewWindow() {
  window.colorTxt.openNewWindow();
}

async function applyShortcutBindings(next: ShortcutBindingMap) {
  const merged = mergeShortcutBindings(defaultShortcutBindings, next);
  const globalResult = await window.colorTxt.setGlobalShortcut(
    merged.toggleAllWindowsVisibility,
  );
  if (!globalResult.ok) {
    window.alert(globalResult.message || "系统级快捷键设置失败");
    return;
  }
  shortcutBindings.value = merged;
  persistSettings();
}

function revealCurrentFileInFolder() {
  const filePath =
    physicalReaderPath.value ??
    currentFile.value ??
    ebookConversionSourcePath.value;
  if (!filePath) return;
  void window.colorTxt.showItemInFolder(filePath).catch(() => {});
}

function quitApp() {
  window.colorTxt.quitApp();
}

function refreshReaderSurfaceAfterPaletteChange() {
  applyReaderSurfaceToDocument(
    currentTheme.value,
    readerSurfaceLight.value,
    readerSurfaceDark.value,
  );
  readerRef.value?.setTheme(currentTheme.value);
}

function onApplyReaderPalettes(payload: {
  light: ReaderSurfacePalette;
  dark: ReaderSurfacePalette;
}) {
  readerPaletteOverridesLight.value = overridesFromFullPalette(
    payload.light,
    defaultReaderPaletteLight,
  );
  readerPaletteOverridesDark.value = overridesFromFullPalette(
    payload.dark,
    defaultReaderPaletteDark,
  );
  persistSettings();
  refreshReaderSurfaceAfterPaletteChange();
}

function onApplyHighlightColors(payload: { light: string[]; dark: string[] }) {
  highlightColorsLight.value = mergeHighlightColors(
    DEFAULT_HIGHLIGHT_COLORS_LIGHT,
    payload.light.length >= MIN_HIGHLIGHT_COLORS ? payload.light : undefined,
  );
  highlightColorsDark.value = mergeHighlightColors(
    DEFAULT_HIGHLIGHT_COLORS_DARK,
    payload.dark.length >= MIN_HIGHLIGHT_COLORS ? payload.dark : undefined,
  );
  persistSettings();
}

function onAddHighlightTerm(payload: { text: string; colorIndex: number }) {
  const path = currentFile.value;
  if (!path) return;
  fileMetaRecords.value = assignHighlightTermToColorForFile(
    fileMetaRecords.value,
    path,
    payload.colorIndex,
    payload.text,
  );
  persistFileMeta();
}

function onRemoveHighlightTerm(payload: { text: string }) {
  const path = currentFile.value;
  if (!path) return;
  fileMetaRecords.value = removeHighlightTermFromFile(
    fileMetaRecords.value,
    path,
    payload.text,
  );
  persistFileMeta();
}

function onRemoveHighlightTermFromHeader(text: string) {
  onRemoveHighlightTerm({ text });
}

function applySettings(payload: SettingsApplyPayload) {
  const prevCompressBlankKeepOneBlank = compressBlankKeepOneBlank.value;
  compressBlankKeepOneBlank.value = payload.compressBlankKeepOneBlank;
  txtrDelimitedMatchCrossLine.value = payload.txtrDelimitedMatchCrossLine;
  restoreSessionOnStartup.value = payload.restoreSessionOnStartup;
  recentFilesHistoryLimit.value = Math.max(
    0,
    Math.min(
      maxRecentFilesHistoryLimit,
      Math.floor(payload.recentFilesHistoryLimit),
    ),
  );
  fullscreenReaderWidthPercent.value = Math.max(
    minFullscreenReaderWidthPercent,
    Math.min(
      maxFullscreenReaderWidthPercent,
      Math.floor(payload.fullscreenReaderWidthPercent),
    ),
  );
  ebookConvertOutputDir.value = payload.ebookConvertOutputDir;
  const nextFontSize = Math.max(
    minFontSize,
    Math.min(maxFontSize, Math.round(payload.fontSize)),
  );
  const nextLineHeightMultiple = clampLineHeightMultipleForFontSize(
    nextFontSize,
    payload.lineHeightMultiple,
  );
  readerFontSize.value = nextFontSize;
  readerLineHeightMultiple.value = nextLineHeightMultiple;
  readerRef.value?.setFontSize(nextFontSize);
  readerRef.value?.setLineHeightMultiple(nextLineHeightMultiple);
  persistSettings();
  if (!payload.restoreSessionOnStartup) {
    clearPersistedSession();
  }
  applyRecentFilesHistoryLimitFromSettings();
  readerRef.value?.setWrappingStrategyAdvanced(monacoAdvancedWrapping.value);
  showSettingsPanel.value = false;

  if (
    prevCompressBlankKeepOneBlank !== compressBlankKeepOneBlank.value &&
    compressBlankLines.value &&
    currentFile.value
  ) {
    const path = currentFile.value;
    const physicalP = stream.viewportDisplayLineToPhysicalLine(
      viewportEndLine.value,
    );
    void openFilePath(path, {
      restorePhysicalLine: physicalP,
      skipRememberCurrent: true,
      keepSidebarTab: true,
    }).then((ok) => {
      if (!ok) {
        compressBlankKeepOneBlank.value = prevCompressBlankKeepOneBlank;
        persistSettings();
      }
    });
  }
}

/** 来自主进程的跨窗口主题同步，避免再发 theme:set 造成循环 */
const skipNextThemeNativeIpc = ref(false);

useAppWindowBindings({
  readerRef,
  stream,
  fileSession,
  persistWindowUnloadState,
  persistFileListCache,
  persistSettings,
  isFullscreenView,
  showSidebar,
  sidebarWidth,
  fullscreenSidebarWidth,
  resizingSidebar,
  getSidebarMaxWidth,
  getSidebarMinWidth,
  clampSidebarWidthToViewport,
  updateFullscreenHeaderHover,
  updateFullscreenFooterHover,
  updateFullscreenSidebarHover,
  endSidebarResize,
  dismissFullscreenChromeForNativeExit,
  bumpFullscreenCursorIdle,
  enterOrExitFullscreenView,
  pulseChapterListCenter,
  currentTheme,
  readerFontSize,
  readerLineHeightMultiple,
  monacoFontFamily,
  fileEncoding,
  loading,
  loadingProgressPercent,
  pendingRestorePhysicalLine,
  pendingRestoreEditorViewState,
  pendingRestoreViewportTopPhysicalLine,
  compressBlankLines,
  suppressFileListCenterAfterLoad,
  txtFiles,
  sidebarTab,
  currentFile,
  dirListScanning,
  dirListCurrentName,
  chapterRuleErrorText,
  showChapterRulePanel,
  increaseFontSize,
  decreaseFontSize,
  increaseLineHeight,
  decreaseLineHeight,
  openNewWindow,
  openFileViaDialog,
  pickTxtDirectory,
  onBookmarkClick,
  skipNextThemeNativeIpc,
  jumpToPrevChapter,
  jumpToNextChapter,
  openSettings: () => {
    showSettingsPanel.value = true;
  },
  openColorScheme: () => {
    showColorSchemePanel.value = true;
  },
  toggleFind: onToggleFind,
  scrollDownLine: () => readerRef.value?.scrollByLineStep?.(1),
  scrollUpLine: () => readerRef.value?.scrollByLineStep?.(-1),
  scrollPageUp: () => readerRef.value?.scrollByPageStep?.(-1),
  scrollPageDown: () => readerRef.value?.scrollByPageStep?.(1),
  shortcutBindings,
  activeStreamRequestId,
  activeStreamFilePath,
  readingProgressSynced,
});

useAppShellThemeWatch({
  currentTheme,
  readerRef,
  readerSurfaceLight,
  readerSurfaceDark,
  skipNextThemeNativeIpc,
  persistSettings,
  showChapterCounts,
  currentFile,
  isFullscreenView,
  showFullscreenSidebar,
  pulseChapterListCenter,
});
</script>

<template>
  <div
    ref="appRoot"
    class="app"
    :class="{
      fullscreen: isFullscreenView,
      'fullscreen--cursorHidden': isFullscreenView && fullscreenCursorHidden,
    }"
  >
    <div
      :ref="setFullscreenHeaderOverlayEl"
      class="appHeaderWrap"
      v-show="!isFullscreenView || showFullscreenHeader"
      @mouseleave="onFullscreenHeaderMouseLeave"
    >
      <AppHeader
        :in-fullscreen="isFullscreenView"
        :recent-files="recentFilesForMenu"
        :pin-active="pinActive"
        :can-pin="canPin"
        :bookmark-active="bookmarkActive"
        :can-bookmark="canBookmark"
        :highlight-terms="currentFileHighlightTerms"
        :highlight-preview-bg="
          currentTheme === 'vs'
            ? readerSurfaceLight.readerBg
            : readerSurfaceDark.readerBg
        "
        :current-theme="currentTheme"
        :show-sidebar="showSidebar"
        :can-increase-font="readerFontSize < maxFontSize"
        :can-decrease-font="readerFontSize > minFontSize"
        :can-increase-line-height="
          readerLineHeightMultiple <
          maxLineHeightMultipleForFontSize(readerFontSize) - 1e-6
        "
        :can-decrease-line-height="
          readerLineHeightMultiple > minLineHeightMultiple + 1e-6
        "
        :monaco-font-family="monacoFontFamily"
        :monaco-advanced-wrapping="monacoAdvancedWrapping"
        :monaco-custom-highlight="monacoCustomHighlight"
        :compress-blank-lines="compressBlankLines"
        :lead-indent-full-width="leadIndentFullWidth"
        :shortcut-bindings="shortcutBindings"
        @open-file="openFileViaDialog"
        @pin-click="onPinClick"
        @bookmark-click="onBookmarkClick"
        @remove-highlight-term="onRemoveHighlightTermFromHeader"
        @go-back-from-pin="onGoBackFromPin"
        @change-theme="currentTheme = $event"
        @toggle-sidebar="showSidebar = !showSidebar"
        @toggle-fullscreen="enterOrExitFullscreenView"
        @set-monaco-font="setMonacoFontFamily"
        @increase-font-size="increaseFontSize"
        @decrease-font-size="decreaseFontSize"
        @increase-line-height="increaseLineHeight"
        @decrease-line-height="decreaseLineHeight"
        @toggle-monaco-advanced-wrapping="toggleMonacoAdvancedWrapping"
        @toggle-monaco-custom-highlight="toggleMonacoCustomHighlight"
        @toggle-compress-blank-lines="toggleCompressBlankLines"
        @toggle-lead-indent-full-width="toggleLeadIndentFullWidth"
        @toggle-find="onToggleFind"
        @open-chapter-rules="
          chapterRuleErrorText = '';
          showChapterRulePanel = true;
        "
        @open-github="openGithubRepo"
        @check-for-updates="requestCheckForUpdates"
        @open-shortcuts="showShortcutPanel = true"
        @open-settings="showSettingsPanel = true"
        @open-color-scheme="showColorSchemePanel = true"
        @open-new-window="openNewWindow"
        @open-recent-file="openRecentFileFromHistory"
        @clear-recent-files="clearRecentFiles"
        @open-about="showAboutPanel = true"
        @quit-app="quitApp"
      />
    </div>

    <div
      class="layout"
      @mousedown="onLayoutMouseDown"
      @wheel.capture="onLayoutWheel"
    >
      <div
        ref="fullscreenSidebarOverlayRef"
        class="sidebarPaneWrap"
        :class="{ 'sidebarPaneWrap--fullscreen': isFullscreenView }"
        v-show="sidebarVisible"
        :style="{ width: `${sidebarWidthForLayout}px` }"
        @mouseleave="onFullscreenSidebarMouseLeave"
      >
        <ReaderSidebar
          ref="readerSidebarRef"
          active-scroll-mode="center"
          :in-fullscreen="isFullscreenView"
          :chapter-list-scroll-smooth="chapterListScrollSmooth"
          :should-center-chapter-list="shouldCenterChapterList"
          :should-center-file-list="shouldCenterFileList"
          :should-center-bookmark-list="shouldCenterBookmarkList"
          v-model:activeTab="sidebarTab"
          v-model:showChapterCounts="showChapterCounts"
          :files="txtFiles"
          :meta-progress-by-path-key="metaProgressByPathKey"
          :live-reading-progress-percent="liveReadingProgressForUi"
          :bookmarks="bookmarkListItems"
          :active-bookmark-line="activeBookmarkLine"
          :current-file-path="currentFile"
          :chapters="chapters"
          :active-chapter-idx="activeChapterIdx"
          :format-char-count="formatCharCount"
          @pick-directory="pickTxtDirectory"
          @open-file="openFileFromSidebar"
          @jump-to-chapter="jumpToChapter"
          @clear-file-list="clearFileList"
          @remove-file-list="removeFileList"
          @close-current-file="closeCurrentFile"
          @jump-to-bookmark="jumpToBookmark"
          @clear-bookmarks="clearCurrentFileBookmarks"
          @remove-bookmarks="removeCurrentFileBookmarks"
          @edit-bookmark="onEditBookmark"
          @remove-bookmark="onRemoveBookmark"
        />
        <!-- 放在侧栏容器内，避免移到拖条时触发 @mouseleave 导致全屏侧栏收起 -->
        <div
          v-show="isFullscreenView"
          class="resizer resizer--fullscreenSidebar"
          @mousedown="startResizeSidebar"
        ></div>
      </div>
      <div
        v-show="showSidebar && !isFullscreenView"
        class="resizer"
        :style="{ left: `${sidebarWidthForLayout - 3}px` }"
        @mousedown="startResizeSidebar"
      ></div>
      <div
        ref="readerPaneWrapRef"
        class="readerPaneWrap"
        :style="fullscreenReaderPaneStyle"
      >
        <ReaderMain
          ref="readerRef"
          class="readerPane"
          :monaco-custom-highlight="monacoCustomHighlight"
          :txtr-delimited-match-cross-line="txtrDelimitedMatchCrossLine"
          :compress-blank-lines="compressBlankLines"
          :monaco-advanced-wrapping="monacoAdvancedWrapping"
          :stream-loading="loading"
          :reader-surface-light="readerSurfaceLight"
          :reader-surface-dark="readerSurfaceDark"
          :highlight-colors="highlightColorsForReader"
          :highlight-words-by-index="currentFileHighlightWords"
          :reader-file-path="currentFile"
          :ebook-anchor-physical-to-display="
            stream.physicalLineToDisplayForReader
          "
          :ebook-display-line-to-physical="
            stream.viewportDisplayLineToPhysicalLine
          "
          @probe-line-change="onProbeLineChange"
          @viewport-top-line-change="onViewportTopLineChange"
          @viewport-end-line-change="onViewportEndLineChange"
          @viewport-visual-progress-change="onViewportVisualProgressChange"
          @add-highlight-term="onAddHighlightTerm"
          @remove-highlight-term="onRemoveHighlightTerm"
        />
        <div
          v-if="showReaderIdleHint"
          class="readerIdleHint"
          aria-hidden="true"
        >
          {{ defaultReaderIdleHint }}
        </div>
        <div
          v-if="showReaderBusyHint"
          class="readerIdleHint"
          aria-live="polite"
        >
          {{ readerBusyHintText }}
        </div>
        <div
          v-if="showReaderEmptyHint"
          class="readerIdleHint"
          aria-hidden="true"
        >
          {{ emptyFileHintText }}
        </div>
      </div>
    </div>
    <div
      v-if="showFullscreenTip"
      class="fullscreenTip"
      :class="{ fading: fullscreenTipFading }"
    >
      按 ESC 退出全屏
    </div>

    <div
      :ref="setFullscreenFooterOverlayEl"
      class="appFooterWrap"
      v-show="!isFullscreenView || showFullscreenFooter"
      @mouseleave="onFullscreenFooterMouseLeave"
    >
      <AppFooter
        :loading="loading"
        :loading-progress-percent="loadingProgressPercent"
        :ebook-parsing="ebookParsing"
        :current-file="currentFile"
        :path-caption="footerPathCaption"
        :reading-progress-percent-part="readingProgressParts.percentPart"
        :reading-progress-detail-part="readingProgressParts.detailPart"
        :reading-progress-placeholder="readingProgressParts.placeholder"
        :reading-progress-complete="readingProgressParts.complete"
        :total-char-count-text="formatCharCount(totalCharCount)"
        :file-size-text="formatFileSize(currentFileSize)"
        :file-encoding="fileEncoding"
        @reveal-file-in-folder="revealCurrentFileInFolder"
      />
    </div>

    <AppOverlays
      ref="appOverlaysRef"
      v-model:show-about-panel="showAboutPanel"
      v-model:show-shortcut-panel="showShortcutPanel"
      v-model:show-settings-panel="showSettingsPanel"
      v-model:show-color-scheme-panel="showColorSchemePanel"
      v-model:show-chapter-rule-panel="showChapterRulePanel"
      v-model:add-bookmark-open="addBookmarkOpen"
      v-model:remove-bookmark-open="removeBookmarkOpen"
      v-model:bookmark-note-input="bookmarkNoteInput"
      :restore-session-on-startup="restoreSessionOnStartup"
      :recent-files-history-limit="recentFilesHistoryLimit"
      :fullscreen-reader-width-percent="fullscreenReaderWidthPercent"
      :reader-font-size="readerFontSize"
      :reader-line-height-multiple="readerLineHeightMultiple"
      :compress-blank-keep-one-blank="compressBlankKeepOneBlank"
      :monaco-custom-highlight="monacoCustomHighlight"
      :txtr-delimited-match-cross-line="txtrDelimitedMatchCrossLine"
      :chapter-rules="chapterRuleState.rules"
      :chapter-rule-error-text="chapterRuleErrorText"
      :editing-bookmark-line="editingBookmarkLine"
      :active-bookmark-in-viewport="activeBookmarkInViewport"
      :dir-list-scanning="dirListScanning"
      :dir-list-current-name="dirListCurrentName"
      :ebook-parsing="ebookParsing"
      :shortcut-bindings="shortcutBindings"
      :default-shortcut-bindings="defaultShortcutBindings"
      :current-theme="currentTheme"
      :reader-surface-light="readerSurfaceLight"
      :reader-surface-dark="readerSurfaceDark"
      :monaco-font-family="monacoFontFamily"
      :highlight-colors-light="highlightColorsLight"
      :highlight-colors-dark="highlightColorsDark"
      :ebook-convert-output-dir="ebookConvertOutputDir"
      @apply-settings="applySettings"
      @apply-shortcut-bindings="applyShortcutBindings"
      @apply-chapter-rules="applyChapterMatchRules"
      @confirm-add-bookmark="confirmAddBookmark"
      @confirm-remove-active-bookmark="confirmRemoveActiveBookmark"
      @apply-reader-palettes="onApplyReaderPalettes"
      @apply-highlight-colors="onApplyHighlightColors"
    />
  </div>
</template>

<style scoped src="./appShell.css"></style>
