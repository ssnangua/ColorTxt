import { ref, shallowRef, type Ref, type ShallowRef } from "vue";
import type { RecentFileItem } from "../components/AppHeader.vue";
import type ReaderMain from "../components/ReaderMain.vue";
import {
  getChapterMatchRules,
  normalizeLoadedChapterRules,
  setChapterMatchRules,
  type ChapterMatchRule,
} from "../chapter";
import {
  loadPersistedSettingsData,
  loadSessionSnapshot,
  loadTxtFileListSnapshot,
  persistSessionSnapshot,
  persistSettingsData,
  persistTxtFileListSnapshot,
  type TxtFileItem,
} from "../stores/cacheStore";
import {
  fileHistoryKey,
  loadRecentFileRecords,
  persistRecentFileRecords,
  removeRecentFileRecord,
  upsertRecentFileRecord,
} from "../stores/recentHistoryStore";
import {
  clearBookmarksForFile,
  findFileMetaRecord,
  loadFileMetaRecords,
  persistFileMetaRecords,
  removeBookmarkForFile,
  upsertBookmarkForFile,
  upsertFileMetaRecord,
  type FileMetaRecord,
  type PersistedEditorViewState,
} from "../stores/fileMetaStore";
import {
  DEFAULT_HIGHLIGHT_COLORS_DARK,
  DEFAULT_HIGHLIGHT_COLORS_LIGHT,
  highlightColorsPersistPayload,
  mergeHighlightColors,
  parseHighlightColorsArray,
} from "../constants/highlightColors";
import {
  defaultFullscreenReaderWidthPercent,
  defaultRecentFilesHistoryLimit,
  maxFullscreenReaderWidthPercent,
  clampLineHeightMultipleForFontSize,
  maxFontSize,
  maxRecentFilesHistoryLimit,
  minFullscreenReaderWidthPercent,
  minFontSize,
  fileListKey,
  fileMetaKey,
  persistKey,
  recentFilesKey,
  sessionKey,
  skipUnloadPersistenceSessionKey,
  type ReaderSurfacePalette,
} from "../constants/appUi";
import type { ShortcutBindingMap } from "../services/shortcutRegistry";
import { mergeShortcutBindings } from "../services/shortcutUtils";

type StreamApi = {
  viewportDisplayLineToPhysicalLine: (displayLine: number) => number;
};

export function useAppPersistence(deps: {
  readerRef: Ref<InstanceType<typeof ReaderMain> | null>;
  stream: StreamApi;
  lastProbeLine: Ref<number>;
  viewportEndLine: Ref<number>;
  txtFiles: Ref<Array<{ name: string; path: string; size: number }>>;
  currentFile: Ref<string | null>;
  /**
   * 当前打开文件是否已完成「加载 + 阅读位置同步」（流结束并完成跳转/滚动，或无需恢复时）。
   * 为 false 时不写 colorTxt.file.meta，避免未稳定进度覆盖磁盘；无打开文件时应为 true。
   */
  readingProgressSynced: Ref<boolean>;
  sidebarWidth: Ref<number>;
  showSidebar: Ref<boolean>;
  currentTheme: Ref<string>;
  monacoCustomHighlight: Ref<boolean>;
  compressBlankLines: Ref<boolean>;
  compressBlankKeepOneBlank: Ref<boolean>;
  /** 与「内容上色」同时生效：成对引号/括号是否跨行 */
  txtrDelimitedMatchCrossLine: Ref<boolean>;
  leadIndentFullWidth: Ref<boolean>;
  showChapterCounts: Ref<boolean>;
  readerFontSize: Ref<number>;
  readerLineHeightMultiple: Ref<number>;
  monacoFontFamily: Ref<string>;
  chapterRuleState: Ref<{ rules: ChapterMatchRule[] }>;
  recentFiles: Ref<RecentFileItem[]>;
  restoreSessionOnStartup: Ref<boolean>;
  recentFilesHistoryLimit: Ref<number>;
  monacoAdvancedWrapping: Ref<boolean>;
  fullscreenReaderWidthPercent: Ref<number>;
  fileMetaRecords: Ref<FileMetaRecord[]>;
  shortcutBindings: Ref<ShortcutBindingMap>;
  defaultShortcutBindings: ShortcutBindingMap;
  readerPaletteOverridesLight: Ref<Partial<ReaderSurfacePalette>>;
  readerPaletteOverridesDark: Ref<Partial<ReaderSurfacePalette>>;
  highlightColorsLight: Ref<string[]>;
  highlightColorsDark: Ref<string[]>;
  /** 电子书转换输出目录；空字符串表示与源文件同目录；无持久化键时默认 userData */
  ebookConvertOutputDir: Ref<string>;
}) {
  const settingsLoaded = ref(false);

  /** 从 file.meta 构建的进度映射；仅在 meta 结构变化时整表重建，避免滚动时 O(列表长度) */
  const metaProgressByPathKey: ShallowRef<Map<string, number>> = shallowRef(
    new Map(),
  );
  /** 当前打开文件的实时阅读进度（%），滚动 probe 更新；切书/落盘 meta 后清除 */
  const liveReadingProgress = ref<number | undefined>(undefined);

  function rebuildMetaProgressMap() {
    const m = new Map<string, number>();
    for (const r of deps.fileMetaRecords.value) {
      if (typeof r.progress !== "number" || !Number.isFinite(r.progress)) {
        continue;
      }
      m.set(fileHistoryKey(r.path), r.progress);
    }
    metaProgressByPathKey.value = m;
  }

  /** 避免每次写文件列表缓存都重写相同 JSON */
  let lastPersistedTxtFilesJson = (() => {
    try {
      return window.localStorage.getItem(fileListKey) ?? "";
    } catch {
      return "";
    }
  })();

  function persistFileListCache() {
    const next = deps.txtFiles.value as TxtFileItem[];
    let json: string;
    try {
      json = JSON.stringify(next);
    } catch {
      return;
    }
    if (json === lastPersistedTxtFilesJson) return;
    persistTxtFileListSnapshot(window.localStorage, fileListKey, next);
    lastPersistedTxtFilesJson = json;
  }

  function recentLimit(): number {
    const n = Math.floor(deps.recentFilesHistoryLimit.value);
    return Math.max(0, Math.min(maxRecentFilesHistoryLimit, n));
  }

  function persistRecentFiles() {
    persistRecentFileRecords(
      window.localStorage,
      recentFilesKey,
      deps.recentFiles.value,
    );
  }

  function loadRecentFiles() {
    deps.recentFiles.value = loadRecentFileRecords(
      window.localStorage,
      recentFilesKey,
      recentLimit(),
    ) as RecentFileItem[];
  }

  function persistFileMeta() {
    if (deps.currentFile.value && !deps.readingProgressSynced.value) return;
    persistFileMetaRecords(
      window.localStorage,
      fileMetaKey,
      deps.fileMetaRecords.value,
    );
  }

  /** 将内存中的最近文件与 file meta 写入 localStorage（窗口关闭时与内存中滚动等未落盘状态对齐） */
  function flushRecentFilesAndFileMetaToDisk() {
    persistRecentFiles();
    persistFileMeta();
  }

  function loadFileMeta() {
    deps.fileMetaRecords.value = loadFileMetaRecords(
      window.localStorage,
      fileMetaKey,
    );
    rebuildMetaProgressMap();
  }

  /** 设置中的历史条数变更后：裁剪列表并写盘 */
  function applyRecentFilesHistoryLimitFromSettings() {
    const lim = recentLimit();
    if (lim <= 0) {
      deps.recentFiles.value = [];
    } else {
      deps.recentFiles.value = deps.recentFiles.value.slice(
        0,
        lim,
      ) as RecentFileItem[];
    }
    persistRecentFiles();
  }

  /**
   * 同步更新内存中的 recent（仅路径顺序）与 file meta（进度 + Monaco 视图状态）。
   * - persistRecent：写入 colorTxt.recent.files
   * - persistMeta：写入 colorTxt.file.meta（关窗前等；受 readingProgressSynced 门控见 persistFileMeta）
   * - updateMeta：为 false 时（滚动 probe）不替换 meta 数组，仅原地改当前条，降低开销
   * 未传 `editorViewState` 且 `currentFile === path` 时从阅读器 `saveViewState` 取快照。
   */
  function touchRecentFile(
    path: string,
    moveToTop: boolean,
    opts?: {
      persistRecent?: boolean;
      persistMeta?: boolean;
      updateMeta?: boolean;
      progress?: number;
      editorViewState?: unknown;
    },
  ) {
    if (recentLimit() <= 0) return;
    deps.recentFiles.value = upsertRecentFileRecord(
      deps.recentFiles.value,
      path,
      recentLimit(),
      moveToTop,
    ) as RecentFileItem[];

    const progress = opts?.progress;
    const viewStateRaw =
      opts?.editorViewState !== undefined
        ? opts.editorViewState
        : deps.currentFile.value === path
          ? deps.readerRef.value?.getSerializedEditorViewState?.() ?? undefined
          : undefined;
    const viewState: PersistedEditorViewState | undefined =
      viewStateRaw != null &&
      typeof viewStateRaw === "object" &&
      !Array.isArray(viewStateRaw)
        ? (viewStateRaw as PersistedEditorViewState)
        : undefined;

    const viewportTopPhysicalLine =
      viewState !== undefined &&
      deps.currentFile.value === path &&
      deps.readerRef.value?.getViewportTopLine
        ? deps.stream.viewportDisplayLineToPhysicalLine(
            deps.readerRef.value.getViewportTopLine(),
          )
        : undefined;

    const updateMeta = opts?.updateMeta !== false;
    if (updateMeta) {
      deps.fileMetaRecords.value = upsertFileMetaRecord(
        deps.fileMetaRecords.value,
        path,
        () => ({
          ...(typeof progress === "number" ? { progress } : {}),
          ...(viewState !== undefined ? { editorViewState: viewState } : {}),
          ...(viewportTopPhysicalLine !== undefined
            ? { viewportTopPhysicalLine }
            : {}),
        }),
      );
      rebuildMetaProgressMap();
      liveReadingProgress.value = undefined;
    } else {
      const prev = findFileMetaRecord(deps.fileMetaRecords.value, path);
      if (prev) {
        if (typeof progress === "number") prev.progress = progress;
        if (viewState !== undefined) prev.editorViewState = viewState;
        if (viewportTopPhysicalLine !== undefined) {
          prev.viewportTopPhysicalLine = viewportTopPhysicalLine;
        }
      } else if (typeof progress === "number" || viewState !== undefined) {
        deps.fileMetaRecords.value = upsertFileMetaRecord(
          deps.fileMetaRecords.value,
          path,
          () => ({
            ...(typeof progress === "number" ? { progress } : {}),
            ...(viewState !== undefined ? { editorViewState: viewState } : {}),
            ...(viewportTopPhysicalLine !== undefined
              ? { viewportTopPhysicalLine }
              : {}),
          }),
        );
        rebuildMetaProgressMap();
      }
      liveReadingProgress.value =
        typeof progress === "number" ? progress : undefined;
    }

    if (opts?.persistRecent) persistRecentFiles();
    if (opts?.persistMeta) persistFileMeta();
  }

  function removeRecentFile(path: string) {
    deps.recentFiles.value = removeRecentFileRecord(
      deps.recentFiles.value,
      path,
    ) as RecentFileItem[];
    persistRecentFiles();
  }

  function getFileMeta(path: string) {
    return findFileMetaRecord(deps.fileMetaRecords.value, path);
  }

  function setEbookConvertedMeta(
    bookPath: string,
    convertedTxtPath: string,
    sourceMtimeMs: number,
  ) {
    deps.fileMetaRecords.value = upsertFileMetaRecord(
      deps.fileMetaRecords.value,
      bookPath,
      () => ({
        convertedTxtPath,
        sourceMtimeMsAtConvert: sourceMtimeMs,
      }),
    );
    rebuildMetaProgressMap();
  }

  function upsertBookmark(path: string, line: number, note: string) {
    deps.fileMetaRecords.value = upsertBookmarkForFile(
      deps.fileMetaRecords.value,
      path,
      Math.max(1, Math.floor(line)),
      note,
    );
    rebuildMetaProgressMap();
  }

  function removeBookmark(path: string, line: number) {
    deps.fileMetaRecords.value = removeBookmarkForFile(
      deps.fileMetaRecords.value,
      path,
      Math.max(1, Math.floor(line)),
    );
    rebuildMetaProgressMap();
  }

  function clearBookmarks(path: string) {
    deps.fileMetaRecords.value = clearBookmarksForFile(
      deps.fileMetaRecords.value,
      path,
    );
    rebuildMetaProgressMap();
  }

  async function clearRecentFiles() {
    const confirmed = await window.colorTxt.confirmClearRecentFiles();
    if (!confirmed) return;
    deps.recentFiles.value = [];
    persistRecentFiles();
  }

  function loadPersistedSettings(): { ebookConvertOutputDirKeyPresent: boolean } {
    const loaded = loadPersistedSettingsData(
      typeof window !== "undefined" ? window.localStorage : undefined,
      persistKey,
    );
    if (!loaded) {
      return { ebookConvertOutputDirKeyPresent: false };
    }
    const { data, ebookConvertOutputDirKeyPresent } = loaded;

    if (data.theme) deps.currentTheme.value = data.theme;

    if (typeof data.sidebarWidth === "number" && Number.isFinite(data.sidebarWidth)) {
      deps.sidebarWidth.value = Math.max(0, Math.floor(data.sidebarWidth));
    }

    if (typeof data.showSidebar === "boolean") {
      deps.showSidebar.value = data.showSidebar;
    }

    if (typeof data.monacoCustomHighlight === "boolean") {
      deps.monacoCustomHighlight.value = data.monacoCustomHighlight;
    }

    if (typeof data.compressBlankLines === "boolean") {
      deps.compressBlankLines.value = data.compressBlankLines;
    }

    if (typeof data.compressBlankKeepOneBlank === "boolean") {
      deps.compressBlankKeepOneBlank.value = data.compressBlankKeepOneBlank;
    }

    if (typeof data.txtrDelimitedMatchCrossLine === "boolean") {
      deps.txtrDelimitedMatchCrossLine.value = data.txtrDelimitedMatchCrossLine;
    }

    if (typeof data.leadIndentFullWidth === "boolean") {
      deps.leadIndentFullWidth.value = data.leadIndentFullWidth;
    }

    if (typeof data.showChapterCounts === "boolean") {
      deps.showChapterCounts.value = data.showChapterCounts;
    }

    if (typeof data.fontSize === "number") {
      deps.readerFontSize.value = Math.max(
        minFontSize,
        Math.min(maxFontSize, Math.round(data.fontSize)),
      );
    }

    if (typeof data.lineHeightMultiple === "number") {
      deps.readerLineHeightMultiple.value = clampLineHeightMultipleForFontSize(
        deps.readerFontSize.value,
        data.lineHeightMultiple,
      );
    }

    if (typeof data.fontFamily === "string" && data.fontFamily.trim()) {
      deps.monacoFontFamily.value = data.fontFamily;
    }

    if (typeof data.restoreSessionOnStartup === "boolean") {
      deps.restoreSessionOnStartup.value = data.restoreSessionOnStartup;
    }

    if (
      typeof data.recentFilesHistoryLimit === "number" &&
      Number.isFinite(data.recentFilesHistoryLimit)
    ) {
      deps.recentFilesHistoryLimit.value = Math.max(
        0,
        Math.min(
          maxRecentFilesHistoryLimit,
          Math.floor(data.recentFilesHistoryLimit),
        ),
      );
    } else {
      deps.recentFilesHistoryLimit.value = defaultRecentFilesHistoryLimit;
    }

    if (typeof data.monacoAdvancedWrapping === "boolean") {
      deps.monacoAdvancedWrapping.value = data.monacoAdvancedWrapping;
    }
    if (
      typeof data.fullscreenReaderWidthPercent === "number" &&
      Number.isFinite(data.fullscreenReaderWidthPercent)
    ) {
      deps.fullscreenReaderWidthPercent.value = Math.max(
        minFullscreenReaderWidthPercent,
        Math.min(
          maxFullscreenReaderWidthPercent,
          Math.floor(data.fullscreenReaderWidthPercent),
        ),
      );
    } else {
      deps.fullscreenReaderWidthPercent.value = defaultFullscreenReaderWidthPercent;
    }
    deps.shortcutBindings.value = mergeShortcutBindings(
      deps.defaultShortcutBindings,
      data.shortcutBindings,
    );

    deps.readerPaletteOverridesLight.value = data.readerPaletteOverridesLight
      ? { ...data.readerPaletteOverridesLight }
      : {};
    deps.readerPaletteOverridesDark.value = data.readerPaletteOverridesDark
      ? { ...data.readerPaletteOverridesDark }
      : {};

    const parsedHL = parseHighlightColorsArray(data.highlightColorsLight);
    deps.highlightColorsLight.value = mergeHighlightColors(
      DEFAULT_HIGHLIGHT_COLORS_LIGHT,
      parsedHL,
    );
    const parsedHD = parseHighlightColorsArray(data.highlightColorsDark);
    deps.highlightColorsDark.value = mergeHighlightColors(
      DEFAULT_HIGHLIGHT_COLORS_DARK,
      parsedHD,
    );

    const normalizedRules = normalizeLoadedChapterRules(data.chapterRules);
    if (normalizedRules) {
      try {
        setChapterMatchRules(normalizedRules);
        deps.chapterRuleState.value = getChapterMatchRules();
      } catch {
        // ignore invalid persisted patterns
      }
    }

    if (typeof data.ebookConvertOutputDir === "string") {
      deps.ebookConvertOutputDir.value = data.ebookConvertOutputDir;
    }
    return { ebookConvertOutputDirKeyPresent };
  }

  function persistSettings() {
    if (!settingsLoaded.value) return;
    persistSettingsData(window.localStorage, persistKey, {
      theme: deps.currentTheme.value === "vs" ? "vs" : "vs-dark",
      sidebarWidth: deps.sidebarWidth.value,
      showSidebar: deps.showSidebar.value,
      fontSize: deps.readerFontSize.value,
      lineHeightMultiple: deps.readerLineHeightMultiple.value,
      fontFamily: deps.monacoFontFamily.value,
      monacoCustomHighlight: deps.monacoCustomHighlight.value,
      compressBlankLines: deps.compressBlankLines.value,
      compressBlankKeepOneBlank: deps.compressBlankKeepOneBlank.value,
      txtrDelimitedMatchCrossLine: deps.txtrDelimitedMatchCrossLine.value,
      leadIndentFullWidth: deps.leadIndentFullWidth.value,
      showChapterCounts: deps.showChapterCounts.value,
      chapterRules: deps.chapterRuleState.value.rules,
      restoreSessionOnStartup: deps.restoreSessionOnStartup.value,
      recentFilesHistoryLimit: recentLimit(),
      monacoAdvancedWrapping: deps.monacoAdvancedWrapping.value,
      fullscreenReaderWidthPercent: deps.fullscreenReaderWidthPercent.value,
      shortcutBindings: deps.shortcutBindings.value,
      readerPaletteOverridesLight:
        Object.keys(deps.readerPaletteOverridesLight.value).length > 0
          ? deps.readerPaletteOverridesLight.value
          : undefined,
      readerPaletteOverridesDark:
        Object.keys(deps.readerPaletteOverridesDark.value).length > 0
          ? deps.readerPaletteOverridesDark.value
          : undefined,
      highlightColorsLight: highlightColorsPersistPayload(
        deps.highlightColorsLight.value,
        DEFAULT_HIGHLIGHT_COLORS_LIGHT,
      ),
      highlightColorsDark: highlightColorsPersistPayload(
        deps.highlightColorsDark.value,
        DEFAULT_HIGHLIGHT_COLORS_DARK,
      ),
      ebookConvertOutputDir: deps.ebookConvertOutputDir.value,
    });
  }

  function clearPersistedSession() {
    const session = loadSessionSnapshot(window.localStorage, sessionKey);
    if (!session) return;
    persistSessionSnapshot(window.localStorage, sessionKey, {
      currentFile: null,
      viewportTopLine: 1,
      viewportBottomLine: 1,
    });
  }

  /** 仅写入 colorTxt.session（窗口卸载前调用；与文件列表、meta、recent 解耦） */
  function persistReadingSessionSnapshot() {
    const viewportTopDisplayLine =
      deps.readerRef.value?.getViewportTopLine?.() ?? deps.lastProbeLine.value;
    const physicalTopLine = deps.stream.viewportDisplayLineToPhysicalLine(
      viewportTopDisplayLine,
    );
    const physicalBottomLine = deps.stream.viewportDisplayLineToPhysicalLine(
      deps.viewportEndLine.value,
    );
    const restoreOnStartup = deps.restoreSessionOnStartup.value;
    persistSessionSnapshot(window.localStorage, sessionKey, {
      currentFile: restoreOnStartup ? deps.currentFile.value : null,
      viewportTopLine: restoreOnStartup ? physicalTopLine : 1,
      viewportBottomLine: restoreOnStartup ? physicalBottomLine : 1,
    });
  }

  /** 窗口关闭/隐藏前：会话快照 + 文件列表缓存 + 未落盘的 recent / file.meta */
  function persistWindowUnloadState() {
    if (
      typeof sessionStorage !== "undefined" &&
      sessionStorage.getItem(skipUnloadPersistenceSessionKey) === "1"
    ) {
      return;
    }
    persistReadingSessionSnapshot();
    persistFileListCache();
    flushRecentFilesAndFileMetaToDisk();
  }

  function initPersistenceBootstrap() {
    try {
      sessionStorage.removeItem(skipUnloadPersistenceSessionKey);
    } catch {
      // ignore
    }
    const { ebookConvertOutputDirKeyPresent } = loadPersistedSettings();
    settingsLoaded.value = true;
    if (!ebookConvertOutputDirKeyPresent) {
      persistSettings();
    }
    loadRecentFiles();
    loadFileMeta();
  }

  return {
    settingsLoaded,
    persistRecentFiles,
    loadRecentFiles,
    applyRecentFilesHistoryLimitFromSettings,
    touchRecentFile,
    removeRecentFile,
    clearRecentFiles,
    loadFileMeta,
    persistFileMeta,
    getFileMeta,
    setEbookConvertedMeta,
    upsertBookmark,
    removeBookmark,
    clearBookmarks,
    loadPersistedSettings,
    persistSettings,
    persistReadingSessionSnapshot,
    persistWindowUnloadState,
    persistFileListCache,
    metaProgressByPathKey,
    liveReadingProgress,
    clearPersistedSession,
    initPersistenceBootstrap,
    loadSessionSnapshot,
    loadTxtFileListSnapshot,
    sessionKey,
    fileListKey,
  };
}
