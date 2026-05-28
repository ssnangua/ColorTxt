import {
  ref,
  shallowRef,
  watch,
  triggerRef,
  type Ref,
  type ShallowRef,
} from "vue";
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
import { defaultCharacterPortraitCacheRoot } from "@shared/characterPortraitPaths";
import type {
  FileCategoryDefinition,
  FileSortMode,
} from "../constants/fileCategories";
import {
  cloneDefaultFileCategoryCatalog,
  DEFAULT_FILE_SORT,
  isFileSortMode,
  normalizeCategoryFilter,
} from "../constants/fileCategories";
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
  defaultChapterMinCharCount,
  defaultFullscreenReaderWidthPercent,
  defaultRecentFilesHistoryLimit,
  maxFullscreenReaderWidthPercent,
  clampLineHeightMultipleForFontSize,
  maxFontSize,
  maxChapterMinCharCount,
  maxRecentFilesHistoryLimit,
  minFullscreenReaderWidthPercent,
  minFontSize,
  minChapterMinCharCount,
  fileListKey,
  fileMetaKey,
  persistKey,
  recentFilesKey,
  sessionKey,
  skipSettingsPersistenceSessionKey,
  skipUnloadPersistenceSessionKey,
  APP_DISPLAY_NAME,
  type ReaderSurfacePalette,
} from "../constants/appUi";
import { EBOOK_CONVERT_DEFAULT_SUBDIR } from "@shared/ebookConvertPaths";
import type { ShortcutBindingMap } from "../services/shortcutRegistry";
import { mergeShortcutBindings } from "../services/shortcutUtils";
import { joinFs } from "../ebook/pathUtils";
import { resolveDefaultEbookConvertOutputDirSync } from "../utils/defaultCacheDirs";
import type { AiCustomSkill, AiSkillUserOverride } from "@shared/aiSkills";
import {
  mergeVoiceReadSettings,
  type VoiceReadSettings,
} from "../constants/voiceRead";
import {
  mergeAiCustomSkills,
  mergeAiSkillOverrides,
  mergeAiSkillsEnabled,
} from "@shared/aiSkills";

/** 同步路径优先；仍为空时用主进程 IPC（极早启动 preload 未就绪等） */
async function resolveDefaultEbookConvertOutputDir(): Promise<string> {
  const sync = resolveDefaultEbookConvertOutputDirSync();
  if (sync) return sync;
  try {
    const q = await window.colorTxt?.getPath?.("userData");
    if (typeof q === "string") {
      const t = q.trim();
      if (t) return joinFs(t, EBOOK_CONVERT_DEFAULT_SUBDIR);
    }
  } catch {
    // ignore
  }
  return "";
}

type StreamApi = {
  viewportDisplayLineToPhysicalLine: (displayLine: number) => number;
};

export function useAppPersistence(deps: {
  readerRef: Ref<InstanceType<typeof ReaderMain> | null>;
  stream: StreamApi;
  lastProbeLine: Ref<number>;
  viewportEndLine: Ref<number>;
  txtFiles: Ref<TxtFileItem[]>;
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
  chapterMinCharCount: Ref<number>;
  monacoAdvancedWrapping: Ref<boolean>;
  monacoSmoothScrolling: Ref<boolean>;
  readerEditShowLineNumbers: Ref<boolean>;
  readerEditMinimap: Ref<boolean>;
  editAutoRefreshChapterList: Ref<boolean>;
  fullscreenReaderWidthPercent: Ref<number>;
  fileMetaRecords: Ref<FileMetaRecord[]>;
  shortcutBindings: Ref<ShortcutBindingMap>;
  defaultShortcutBindings: ShortcutBindingMap;
  readerPaletteOverridesLight: Ref<Partial<ReaderSurfacePalette>>;
  readerPaletteOverridesDark: Ref<Partial<ReaderSurfacePalette>>;
  highlightColorsLight: Ref<string[]>;
  highlightColorsDark: Ref<string[]>;
  /** 全局高亮词：跨文件匹配，Record<string, string[]> 按色值索引组织 */
  globalHighlightWords: Ref<Record<string, string[]>>;
  /** 电子书转换输出目录；空字符串表示与源文件同目录；无持久化键时默认 userData/ConvertedTxt */
  ebookConvertOutputDir: Ref<string>;
  /** 角色立绘缓存根目录（绝对路径）；无键时默认 userData/CharacterPortrait */
  characterPortraitCacheDir: Ref<string>;
  fileCategory: Ref<string>;
  fileSort: Ref<FileSortMode>;
  fileCategoryCatalog: Ref<FileCategoryDefinition[]>;
  /** 侧栏文件列表「编辑」模式：为 true 时跳过文件列表 localStorage 写入，退出并保存时由 App 再落盘 */
  fileListEditing: Ref<boolean>;
  /** 监控当前打开文件，磁盘变更后自动重新加载 */
  syncCurrentFile: Ref<boolean>;
  /** 内置技能启用状态 */
  aiSkillsEnabled: Ref<Record<string, boolean>>;
  aiSkillOverrides: Ref<Record<string, AiSkillUserOverride>>;
  aiCustomSkills: Ref<AiCustomSkill[]>;
  aiAssistantDeepThinking: Ref<boolean>;
  aiAssistantSpoilerSafe: Ref<boolean>;
  voiceReadSettings: Ref<VoiceReadSettings>;
}) {
  const settingsLoaded = ref(false);
  let storageSyncBound = false;

  /** 合并短时间内的 file.meta 写盘，避免换书 / 恢复 / 拖入打开时主线程长时间 JSON.stringify */
  const FILE_META_DISK_DEBOUNCE_MS = 420;
  let fileMetaWriteTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingFileMetaWrite: "gated" | "forced" | null = null;

  function mergePendingFileMetaMode(
    prev: "gated" | "forced" | null,
    next: "gated" | "forced",
  ): "gated" | "forced" {
    if (prev === "forced" || next === "forced") return "forced";
    return "gated";
  }

  function cancelScheduledFileMetaWrite() {
    if (fileMetaWriteTimer !== null) {
      clearTimeout(fileMetaWriteTimer);
      fileMetaWriteTimer = null;
    }
    pendingFileMetaWrite = null;
  }

  function runScheduledFileMetaWrite() {
    fileMetaWriteTimer = null;
    const mode = pendingFileMetaWrite;
    pendingFileMetaWrite = null;
    if (mode === null) return;
    if (mode === "gated") {
      if (deps.currentFile.value && !deps.readingProgressSynced.value) return;
    }
    persistFileMetaRecords(
      window.localStorage,
      fileMetaKey,
      deps.fileMetaRecords.value,
    );
  }

  function scheduleFileMetaDiskWrite(mode: "gated" | "forced") {
    pendingFileMetaWrite = mergePendingFileMetaMode(pendingFileMetaWrite, mode);
    if (fileMetaWriteTimer !== null) clearTimeout(fileMetaWriteTimer);
    fileMetaWriteTimer = setTimeout(
      runScheduledFileMetaWrite,
      FILE_META_DISK_DEBOUNCE_MS,
    );
  }

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

  /** 换书前仅更新一条路径的进度映射，避免 `rebuildMetaProgressMap` 整表 O(M) 扫描拖慢打开 */
  function patchMetaProgressForPath(path: string, progress: number) {
    if (!Number.isFinite(progress)) return;
    const key = fileHistoryKey(path);
    const m = metaProgressByPathKey.value;
    if (m.get(key) === progress) return;
    m.set(key, progress);
    triggerRef(metaProgressByPathKey);
  }

  /** 避免每次写文件列表缓存都重写相同 JSON */
  let lastPersistedTxtFilesJson = (() => {
    try {
      return window.localStorage.getItem(fileListKey) ?? "";
    } catch {
      return "";
    }
  })();

  function persistFileListCache(opts?: { force?: boolean }) {
    if (deps.fileListEditing.value && !opts?.force) return;
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
    scheduleFileMetaDiskWrite("gated");
  }

  /** 取消防抖并不受阅读进度同步门控，立即写入 file.meta（关窗等场景须落盘进度/书签/视图状态等） */
  function persistFileMetaImmediate() {
    cancelScheduledFileMetaWrite();
    persistFileMetaRecords(
      window.localStorage,
      fileMetaKey,
      deps.fileMetaRecords.value,
    );
  }

  /** 将内存中的最近文件与 file meta 写入 localStorage（窗口关闭时与内存中滚动等未落盘状态对齐） */
  function flushRecentFilesAndFileMetaToDisk() {
    persistRecentFiles();
    persistFileMetaImmediate();
  }

  function loadFileMeta() {
    deps.fileMetaRecords.value = loadFileMetaRecords(
      window.localStorage,
      fileMetaKey,
    );
    rebuildMetaProgressMap();
  }

  /** 多窗口：其它窗口写 localStorage 后，本窗口按 key 增量重载内存态。 */
  function onStorageSync(ev: StorageEvent) {
    if (ev.storageArea !== window.localStorage) return;
    if (ev.key === null) {
      // clear()：按当前配置保留既有加载流程，做最小必要重载
      loadRecentFiles();
      loadFileMeta();
      deps.txtFiles.value = loadTxtFileListSnapshot(
        window.localStorage,
        fileListKey,
      );
      return;
    }
    if (ev.key === fileListKey) {
      deps.txtFiles.value = loadTxtFileListSnapshot(
        window.localStorage,
        fileListKey,
      );
      try {
        lastPersistedTxtFilesJson =
          window.localStorage.getItem(fileListKey) ?? "";
      } catch {
        lastPersistedTxtFilesJson = "";
      }
      return;
    }
    if (ev.key === fileMetaKey) {
      loadFileMeta();
      return;
    }
    if (ev.key === recentFilesKey) {
      loadRecentFiles();
      return;
    }
    if (ev.key === persistKey) {
      loadPersistedSettings();
    }
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
   * - rebuildProgressMap：仅在与 `updateMeta: false` 联用且需刷新 `metaProgressByPathKey` 时设为 true（如换书前落盘）；滚动 probe 切勿开启，否则每帧整表重建映射会卡死滚动。
   * 未传 `editorViewState` 且 `currentFile === path` 时从阅读器 `saveViewState` 取快照。
   */
  function touchRecentFile(
    path: string,
    moveToTop: boolean,
    opts?: {
      persistRecent?: boolean;
      persistMeta?: boolean;
      updateMeta?: boolean;
      /** 原地写 progress 后是否重建进度映射（默认 false） */
      rebuildProgressMap?: boolean;
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
          ? (deps.readerRef.value?.getSerializedEditorViewState?.() ??
            undefined)
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
        if (opts?.rebuildProgressMap === true && typeof progress === "number") {
          rebuildMetaProgressMap();
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

  /** 仅更新「最后打开时间」；写盘与换书落盘合并防抖，避免每次打开都同步 stringify 整份 meta */
  function touchFileLastOpened(path: string) {
    const p = path.trim();
    if (!p) return;
    const now = Date.now();
    const prev = findFileMetaRecord(deps.fileMetaRecords.value, p);
    if (prev) {
      prev.lastOpenedAt = now;
    } else {
      deps.fileMetaRecords.value = upsertFileMetaRecord(
        deps.fileMetaRecords.value,
        p,
        () => ({ lastOpenedAt: now }),
      );
    }
    scheduleFileMetaDiskWrite("forced");
  }

  watch(
    () => deps.readingProgressSynced.value,
    (synced, wasSynced) => {
      if (synced && wasSynced === false) {
        const p = deps.currentFile.value?.trim();
        if (p) touchFileLastOpened(p);
        scheduleFileMetaDiskWrite("gated");
      }
    },
  );

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
    const r = await window.colorTxt.showMessageBox({
      type: "warning",
      title: APP_DISPLAY_NAME,
      buttons: ["取消", "清除"],
      defaultId: 1,
      cancelId: 0,
      message: "是否要清除最近打开的所有文件？",
      detail: "此操作不可逆！",
      noLink: true,
    });
    if (r.response !== 1) return;
    deps.recentFiles.value = [];
    persistRecentFiles();
  }

  async function hydrateVoiceReadSecretFromVault(): Promise<boolean> {
    try {
      const r = await window.colorTxt.secrets.getVoiceReadDashScopeApiKey();
      const vaultKey = r.apiKey.trim();
      const legacyKey = deps.voiceReadSettings.value.dashscopeApiKey.trim();
      if (vaultKey) {
        deps.voiceReadSettings.value = mergeVoiceReadSettings({
          ...deps.voiceReadSettings.value,
          dashscopeApiKey: vaultKey,
        });
        return legacyKey !== "" && legacyKey !== vaultKey;
      }
      if (legacyKey) {
        await window.colorTxt.secrets.setVoiceReadDashScopeApiKey(legacyKey);
        return true;
      }
    } catch {
      // ignore
    }
    return false;
  }

  function loadPersistedSettings(): {
    ebookConvertOutputDirKeyPresent: boolean;
    characterPortraitCacheDirKeyPresent: boolean;
  } {
    const loaded = loadPersistedSettingsData(
      typeof window !== "undefined" ? window.localStorage : undefined,
      persistKey,
    );
    if (!loaded) {
      return {
        ebookConvertOutputDirKeyPresent: false,
        characterPortraitCacheDirKeyPresent: false,
      };
    }
    const {
      data,
      ebookConvertOutputDirKeyPresent,
      characterPortraitCacheDirKeyPresent,
    } = loaded;

    if (data.theme) deps.currentTheme.value = data.theme;

    if (
      typeof data.sidebarWidth === "number" &&
      Number.isFinite(data.sidebarWidth)
    ) {
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

    if (typeof data.syncCurrentFile === "boolean") {
      deps.syncCurrentFile.value = data.syncCurrentFile;
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
    if (
      typeof data.chapterMinCharCount === "number" &&
      Number.isFinite(data.chapterMinCharCount)
    ) {
      deps.chapterMinCharCount.value = Math.max(
        minChapterMinCharCount,
        Math.min(maxChapterMinCharCount, Math.floor(data.chapterMinCharCount)),
      );
    } else {
      deps.chapterMinCharCount.value = defaultChapterMinCharCount;
    }

    if (typeof data.monacoAdvancedWrapping === "boolean") {
      deps.monacoAdvancedWrapping.value = data.monacoAdvancedWrapping;
    }
    if (typeof data.monacoSmoothScrolling === "boolean") {
      deps.monacoSmoothScrolling.value = data.monacoSmoothScrolling;
    }
    if (typeof data.readerEditShowLineNumbers === "boolean") {
      deps.readerEditShowLineNumbers.value = data.readerEditShowLineNumbers;
    }
    if (typeof data.readerEditMinimap === "boolean") {
      deps.readerEditMinimap.value = data.readerEditMinimap;
    }
    if (typeof data.editAutoRefreshChapterList === "boolean") {
      deps.editAutoRefreshChapterList.value = data.editAutoRefreshChapterList;
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
      deps.fullscreenReaderWidthPercent.value =
        defaultFullscreenReaderWidthPercent;
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

    /** 全局高亮词 */
    if (data.globalHighlightWords && typeof data.globalHighlightWords === "object") {
      const cleaned: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(data.globalHighlightWords)) {
        if (Array.isArray(v) && v.length > 0) {
          cleaned[k] = v;
        }
      }
      deps.globalHighlightWords.value = cleaned;
    }

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

    if (typeof data.characterPortraitCacheDir === "string") {
      deps.characterPortraitCacheDir.value =
        data.characterPortraitCacheDir.trim();
    }

    deps.fileCategory.value = normalizeCategoryFilter(data.fileCategory);
    deps.fileSort.value = isFileSortMode(data.fileSort)
      ? data.fileSort
      : DEFAULT_FILE_SORT;
    if (data.fileCategoryCatalog && data.fileCategoryCatalog.length > 0) {
      deps.fileCategoryCatalog.value = data.fileCategoryCatalog.map((c) => ({
        ...c,
      }));
    } else {
      deps.fileCategoryCatalog.value = cloneDefaultFileCategoryCatalog();
    }

    deps.aiSkillOverrides.value = mergeAiSkillOverrides(data.aiSkillOverrides);
    deps.aiCustomSkills.value = data.aiCustomSkills?.length
      ? mergeAiCustomSkills(data.aiCustomSkills)
      : [];

    const customIds = deps.aiCustomSkills.value.map((s) => s.id);
    deps.aiSkillsEnabled.value = mergeAiSkillsEnabled(
      data.aiSkillsEnabled,
      customIds,
    );

    if (typeof data.aiAssistantDeepThinking === "boolean") {
      deps.aiAssistantDeepThinking.value = data.aiAssistantDeepThinking;
    }
    if (typeof data.aiAssistantSpoilerSafe === "boolean") {
      deps.aiAssistantSpoilerSafe.value = data.aiAssistantSpoilerSafe;
    }

    deps.voiceReadSettings.value = mergeVoiceReadSettings(data.voiceRead);

    return {
      ebookConvertOutputDirKeyPresent,
      characterPortraitCacheDirKeyPresent,
    };
  }

  function persistSettings() {
    if (!settingsLoaded.value) return;
    try {
      if (
        typeof sessionStorage !== "undefined" &&
        sessionStorage.getItem(skipSettingsPersistenceSessionKey) === "1"
      ) {
        return;
      }
    } catch {
      // ignore
    }
    const voiceReadMerged = mergeVoiceReadSettings(deps.voiceReadSettings.value);
    void window.colorTxt.secrets.setVoiceReadDashScopeApiKey(
      voiceReadMerged.dashscopeApiKey,
    );
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
      syncCurrentFile: deps.syncCurrentFile.value,
      recentFilesHistoryLimit: recentLimit(),
      chapterMinCharCount: deps.chapterMinCharCount.value,
      monacoAdvancedWrapping: deps.monacoAdvancedWrapping.value,
      monacoSmoothScrolling: deps.monacoSmoothScrolling.value,
      readerEditShowLineNumbers: deps.readerEditShowLineNumbers.value,
      readerEditMinimap: deps.readerEditMinimap.value,
      editAutoRefreshChapterList: deps.editAutoRefreshChapterList.value,
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
      globalHighlightWords: Object.keys(deps.globalHighlightWords.value).length > 0
        ? deps.globalHighlightWords.value
        : undefined,
      ebookConvertOutputDir: deps.ebookConvertOutputDir.value,
      characterPortraitCacheDir: deps.characterPortraitCacheDir.value.trim(),
      fileCategory: deps.fileCategory.value,
      fileSort: deps.fileSort.value,
      fileCategoryCatalog: deps.fileCategoryCatalog.value,
      aiSkillsEnabled: deps.aiSkillsEnabled.value,
      aiSkillOverrides:
        Object.keys(deps.aiSkillOverrides.value).length > 0
          ? deps.aiSkillOverrides.value
          : undefined,
      aiCustomSkills:
        deps.aiCustomSkills.value.length > 0
          ? deps.aiCustomSkills.value
          : undefined,
      aiAssistantDeepThinking: deps.aiAssistantDeepThinking.value,
      aiAssistantSpoilerSafe: deps.aiAssistantSpoilerSafe.value,
      voiceRead: {
        ...voiceReadMerged,
        dashscopeApiKey: "",
      },
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
    persistFileListCache({ force: true });
    flushRecentFilesAndFileMetaToDisk();
  }

  async function initPersistenceBootstrap() {
    try {
      sessionStorage.removeItem(skipUnloadPersistenceSessionKey);
      sessionStorage.removeItem(skipSettingsPersistenceSessionKey);
    } catch {
      // ignore
    }
    const {
      ebookConvertOutputDirKeyPresent,
      characterPortraitCacheDirKeyPresent,
    } = loadPersistedSettings();
    const migratedVoiceSecret = await hydrateVoiceReadSecretFromVault();
    settingsLoaded.value = true;
    let needDefaultSettingsPersist = false;
    if (!ebookConvertOutputDirKeyPresent) {
      try {
        const ud = await resolveDefaultEbookConvertOutputDir();
        if (ud) deps.ebookConvertOutputDir.value = ud;
      } catch {
        // ignore
      }
      needDefaultSettingsPersist = true;
    }
    if (!characterPortraitCacheDirKeyPresent) {
      try {
        const ud = await window.colorTxt.getPath("userData");
        if (ud) {
          deps.characterPortraitCacheDir.value =
            defaultCharacterPortraitCacheRoot(ud);
        }
      } catch {
        // ignore
      }
      needDefaultSettingsPersist = true;
    }
    if (needDefaultSettingsPersist || migratedVoiceSecret) {
      persistSettings();
    }
    loadRecentFiles();
    loadFileMeta();
    if (!storageSyncBound) {
      window.addEventListener("storage", onStorageSync);
      storageSyncBound = true;
    }
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
    touchFileLastOpened,
    upsertBookmark,
    removeBookmark,
    clearBookmarks,
    loadPersistedSettings,
    persistSettings,
    persistReadingSessionSnapshot,
    persistWindowUnloadState,
    persistFileListCache,
    metaProgressByPathKey,
    patchMetaProgressForPath,
    liveReadingProgress,
    clearPersistedSession,
    initPersistenceBootstrap,
    loadSessionSnapshot,
    loadTxtFileListSnapshot,
    sessionKey,
    fileListKey,
  };
}
