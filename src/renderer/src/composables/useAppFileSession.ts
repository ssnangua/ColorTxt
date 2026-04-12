import { nextTick, type Ref } from "vue";
import type ReaderMain from "../components/ReaderMain.vue";
import ReaderSidebar from "../components/ReaderSidebar.vue";
import {
  normalizeTxtFileItem,
  readTxtDirectoryFromDialog,
  mergeTxtFileLists,
} from "../services/fileListService";
import { prepareOpenFile } from "../services/fileOpenService";
import { loadSessionSnapshot } from "../stores/cacheStore";
import { useAppPersistence } from "./useAppPersistence";
import { isEbookFilePath } from "../ebook/ebookFormat";
import { ensureEbookColorTxt } from "../ebook/convertEbookToColorTxt";
import { yieldToUi } from "../ebook/yieldToUi";
import { useAppChapterListSync } from "./useAppChapterListSync";
import { useTxtStreamPipeline } from "./useTxtStreamPipeline";
import type { Chapter } from "../chapter";
import { sessionKey, fileListKey } from "../constants/appUi";

/** 等浏览器下一帧再续，让 Monaco 在空文档上完成绘制，避免黏性章节标题滞留 */
function waitNextPaintFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

/**
 * 流结束时 `restorePhys >= totalPhysical` 会走 `scrollToBottom`（见 useAppWindowBindings）。
 * 用于已读完（100%）时跳过可能因窗口缩放而失准的 Monaco viewState / 行号恢复。
 */
const RESTORE_PHYSICAL_LINE_SCROLL_TO_END = Number.MAX_SAFE_INTEGER;

function isReadingCompleteProgress(progress: number | undefined): boolean {
  return typeof progress === "number" && Number.isFinite(progress) && progress >= 100;
}

type Persistence = ReturnType<typeof useAppPersistence>;
type ChapterSync = ReturnType<typeof useAppChapterListSync>;
type Stream = ReturnType<typeof useTxtStreamPipeline>;

export function useAppFileSession(deps: {
  readerRef: Ref<InstanceType<typeof ReaderMain> | null>;
  readerSidebarRef: Ref<InstanceType<typeof ReaderSidebar> | null>;
  stream: Stream;
  persistence: Persistence;
  chapterSync: ChapterSync;
  currentFile: Ref<string | null>;
  loading: Ref<boolean>;
  loadingProgressPercent: Ref<number | null>;
  dirListScanning: Ref<boolean>;
  dirListCurrentName: Ref<string>;
  fileEncoding: Ref<string>;
  currentFileSize: Ref<number | null>;
  totalCharCount: Ref<number>;
  totalLineCount: Ref<number>;
  chapters: Ref<Chapter[]>;
  activeChapterIdx: Ref<number>;
  sidebarTab: Ref<"files" | "chapters" | "bookmarks">;
  txtFiles: Ref<Array<{ name: string; path: string; size: number }>>;
  lastProbeLine: Ref<number>;
  viewportTopLine: Ref<number>;
  viewportEndLine: Ref<number>;
  pendingRestorePhysicalLine: Ref<number | null>;
  /** 流结束后 `restoreViewState`；与 pendingRestorePhysicalLine 二选一 */
  pendingRestoreEditorViewState: Ref<unknown | null>;
  /** 与视图状态配套的视口首行物理行号，用于流结束后校验 */
  pendingRestoreViewportTopPhysicalLine: Ref<number | null>;
  recentFiles: Ref<import("../components/AppHeader.vue").RecentFileItem[]>;
  restoreSessionOnStartup: Ref<boolean>;
  /** 与主进程流 requestId 对齐；resetSession 时清空，避免旧 chunk 在清空后仍被当作当前流处理 */
  activeStreamRequestId: Ref<number | null>;
  activeStreamFilePath: Ref<string | null>;
  /** 磁盘上实际被流式读取的路径（电子书为转换后的 `{原名}.txt`，与 currentFile 可能不同） */
  physicalReaderPath: Ref<string | null>;
  /** 打开/重置会话后为 false，流结束并完成阅读位置同步后为 true */
  readingProgressSynced: Ref<boolean>;
  ebookConvertOutputDir: Ref<string>;
  ebookParsing: Ref<boolean>;
  /** 正在转换的电子书源路径（用于底栏在 resetSession 之前显示「转换中…」） */
  ebookConversionSourcePath: Ref<string | null>;
}) {
  const {
    persistFileListCache,
    loadTxtFileListSnapshot,
    touchRecentFile,
    removeRecentFile,
    getFileMeta,
    persistFileMeta,
    setEbookConvertedMeta,
  } = deps.persistence;
  const {
    pulseFileListCenter,
    suppressFileListCenterAfterLoad,
  } = deps.chapterSync;

  async function resolvePhysicalTextForOpen(
    filePath: string,
    preparedSize: number | null,
  ): Promise<
    | {
        ok: true;
        physicalPath: string;
        sessionFilePath?: string;
        displaySize: number;
      }
    | { ok: false; message: string }
  > {
    if (!isEbookFilePath(filePath)) {
      try {
        const st = await window.colorTxt.stat(filePath);
        if (!st.isFile) {
          return { ok: false, message: `文件不存在或不可访问：${filePath}` };
        }
        return {
          ok: true,
          physicalPath: filePath,
          displaySize: preparedSize ?? st.size,
        };
      } catch {
        return { ok: false, message: `文件不存在或不可访问：${filePath}` };
      }
    }

    deps.ebookConversionSourcePath.value = filePath;
    deps.ebookParsing.value = true;
    await nextTick();
    await yieldToUi();
    try {
      const st = await window.colorTxt.stat(filePath);
      if (!st.isFile) {
        return { ok: false, message: `文件不存在或不可访问：${filePath}` };
      }
      const meta = getFileMeta(filePath);
      const { colorTxtPath } = await ensureEbookColorTxt({
        sourceBookPath: filePath,
        ebookConvertOutputDir: deps.ebookConvertOutputDir.value,
        sourceMtimeMs: st.mtimeMs,
        existingConvertedPath: meta?.convertedTxtPath,
        existingSourceMtimeMs: meta?.sourceMtimeMsAtConvert,
      });
      setEbookConvertedMeta(filePath, colorTxtPath, st.mtimeMs);
      persistFileMeta();
      const tst = await window.colorTxt.stat(colorTxtPath);
      if (!tst.isFile) {
        return {
          ok: false,
          message: `转换结果未生成或路径不可读：${colorTxtPath}`,
        };
      }
      return {
        ok: true,
        physicalPath: colorTxtPath,
        sessionFilePath: filePath,
        displaySize: tst.size,
      };
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message : String(e),
      };
    } finally {
      deps.ebookParsing.value = false;
      deps.ebookConversionSourcePath.value = null;
    }
  }

  /** 文件列表替换后：若当前打开的文件仍在列表中，则将该项滚入视口并居中 */
  function centerFileListIfCurrentInList() {
    const path = deps.currentFile.value;
    if (!path) return;
    if (!deps.txtFiles.value.some((f) => f.path === path)) return;
    void nextTick(() => {
      pulseFileListCenter();
    });
  }

  async function clearFileList() {
    if (!window.colorTxt) return;
    const confirmed = await window.colorTxt.confirmClearFileList();
    if (!confirmed) return;
    deps.txtFiles.value = [];
    persistFileListCache();
  }

  function removeFileList(filePaths: string[]) {
    if (!window.colorTxt) return;
    if (filePaths.length === 0) return;
    const removeSet = new Set(filePaths);
    const next = deps.txtFiles.value.filter((f) => !removeSet.has(f.path));
    if (next.length === deps.txtFiles.value.length) return;
    deps.txtFiles.value = next;
    persistFileListCache();
  }

  function closeCurrentFile() {
    if (!deps.currentFile.value) return;
    rememberCurrentFileLine();
    deps.pendingRestorePhysicalLine.value = null;
    deps.pendingRestoreEditorViewState.value = null;
    deps.pendingRestoreViewportTopPhysicalLine.value = null;
    deps.readingProgressSynced.value = true;
    deps.currentFile.value = null;
    deps.activeStreamRequestId.value = null;
    deps.activeStreamFilePath.value = null;
    deps.physicalReaderPath.value = null;
    deps.loading.value = false;
    deps.loadingProgressPercent.value = null;
    deps.fileEncoding.value = "-";
    deps.currentFileSize.value = null;
    deps.totalCharCount.value = 0;
    deps.totalLineCount.value = 0;
    deps.viewportTopLine.value = 1;
    deps.viewportEndLine.value = 1;
    deps.lastProbeLine.value = 1;
    deps.chapters.value = [];
    deps.activeChapterIdx.value = -1;
    deps.stream.resetStreamInternals();
    deps.readerRef.value?.clear();
    deps.readerRef.value?.resetToTop();
  }

  function rememberCurrentFileLine() {
    if (!deps.currentFile.value) return;
    if (!deps.readingProgressSynced.value) return;
    touchRecentFile(deps.currentFile.value, false, {
      persistRecent: true,
      persistMeta: true,
      progress: deps.stream.calcProgressPercentByViewportDisplay(
        deps.viewportTopLine.value,
        deps.viewportEndLine.value,
      ),
    });
  }

  /** 在解析/转换（如 EPUB）与 `resetSession` 之前清空阅读区，便于感知正在加载 */
  function clearReaderBeforeResolve() {
    deps.readerRef.value?.clear({ keepStickyHiddenForStream: true });
    deps.readerRef.value?.resetToTop();
  }

  function resetSession(filePath: string) {
    deps.activeStreamRequestId.value = null;
    deps.activeStreamFilePath.value = null;
    deps.readingProgressSynced.value = false;
    deps.currentFile.value = filePath;
    deps.chapters.value = [];
    deps.activeChapterIdx.value = -1;
    deps.viewportTopLine.value = 1;
    deps.viewportEndLine.value = 1;
    deps.totalCharCount.value = 0;
    deps.totalLineCount.value = 0;
    deps.fileEncoding.value = "-";
    deps.currentFileSize.value = null;
    deps.stream.resetStreamInternals();
    deps.loading.value = true;
    deps.loadingProgressPercent.value = 0;

    deps.readerRef.value?.clear({ keepStickyHiddenForStream: true });
    deps.readerRef.value?.resetToTop();
  }

  function restoreFileListFromSession() {
    const fileList = loadTxtFileListSnapshot(window.localStorage, fileListKey);
    if (fileList.length === 0) return false;
    deps.txtFiles.value = fileList.map((f) =>
      normalizeTxtFileItem({
        name: String(f.name ?? ""),
        path: String(f.path ?? ""),
        size: typeof f.size === "number" ? f.size : 0,
      }),
    );
    persistFileListCache();
    return true;
  }

  async function tryRestoreSession() {
    if (!window.colorTxt) return;
    if (!deps.restoreSessionOnStartup.value) return;
    const session = loadSessionSnapshot(window.localStorage, sessionKey);
    if (!session) return;
    restoreFileListFromSession();

    const path = session.currentFile;
    const viewportTopLine = Math.max(1, Math.floor(session.viewportTopLine));
    const scrollLine = session.viewportBottomLine;

    if (!path) {
      deps.sidebarTab.value = "files";
      deps.lastProbeLine.value = scrollLine;
      return;
    }

    try {
      const st = await window.colorTxt.stat(path);
      if (!st.isFile) {
        deps.sidebarTab.value = "files";
        return;
      }
      clearReaderBeforeResolve();
      const resolved = await resolvePhysicalTextForOpen(path, st.size);
      if (!resolved.ok) {
        deps.sidebarTab.value = "files";
        return;
      }
      const meta = getFileMeta(path);
      const savedVs = meta?.editorViewState;
      const anchorRaw = meta?.viewportTopPhysicalLine;
      const hasAnchor =
        typeof anchorRaw === "number" && Number.isFinite(anchorRaw);
      const canRestoreViewState =
        savedVs != null &&
        typeof savedVs === "object" &&
        !Array.isArray(savedVs) &&
        hasAnchor;
      if (isReadingCompleteProgress(meta?.progress)) {
        deps.pendingRestoreEditorViewState.value = null;
        deps.pendingRestoreViewportTopPhysicalLine.value = null;
        deps.pendingRestorePhysicalLine.value = RESTORE_PHYSICAL_LINE_SCROLL_TO_END;
      } else if (canRestoreViewState) {
        deps.pendingRestoreEditorViewState.value = savedVs;
        deps.pendingRestorePhysicalLine.value = null;
        deps.pendingRestoreViewportTopPhysicalLine.value = Math.max(
          1,
          Math.floor(anchorRaw),
        );
      } else {
        deps.pendingRestoreEditorViewState.value = null;
        deps.pendingRestoreViewportTopPhysicalLine.value = null;
        // 若上次视口首行就是物理第一行，说明可能只是打开过文件未开始阅读；
        // 此时不做恢复滚动，保留在顶部。
        deps.pendingRestorePhysicalLine.value =
          viewportTopLine === 1 ? null : Math.max(1, Math.floor(scrollLine));
      }
      resetSession(path);
      deps.physicalReaderPath.value = resolved.physicalPath;
      deps.currentFileSize.value = resolved.displaySize;
      deps.sidebarTab.value = "chapters";
      await waitNextPaintFrame();
      window.colorTxt.streamFile(resolved.physicalPath, {
        sessionFilePath: resolved.sessionFilePath,
      });
      const fileInList = deps.txtFiles.value.some((f) => f.path === path);
      if (fileInList) {
        void nextTick(() => {
          pulseFileListCenter();
        });
      }
    } catch {
      deps.sidebarTab.value = "files";
    }
  }

  async function openFileViaDialog() {
    if (!window.colorTxt) {
      window.alert("preload 未注入：请重启应用（或检查主进程 preload 路径）");
      return;
    }
    const filePath = await window.colorTxt.openTxtDialog();
    if (!filePath) return;
    await openFilePath(filePath);
  }

  function openFileFromSidebar(filePath: string) {
    suppressFileListCenterAfterLoad.value = true;
    void openFilePath(filePath, { keepSidebarTab: true });
  }

  function subscribeDirListTxtScan(): () => void {
    return window.colorTxt.onDirListTxtScan((p) => {
      if (p.phase === "start") {
        deps.dirListScanning.value = true;
        deps.dirListCurrentName.value = "";
      } else {
        deps.dirListCurrentName.value = p.name;
      }
    });
  }

  async function pickTxtDirectory() {
    if (!window.colorTxt) {
      window.alert("目录选择接口未加载，请重启应用");
      return;
    }
    const unsub = subscribeDirListTxtScan();
    try {
      const result = await readTxtDirectoryFromDialog(window.colorTxt);
      if (!result.ok && result.reason === "missingApi") {
        window.alert("目录选择接口未加载，请重启应用");
        return;
      }
      if (!result.ok) return;
      deps.txtFiles.value = mergeTxtFileLists(deps.txtFiles.value, result.files);
      persistFileListCache();
      deps.sidebarTab.value = "files";
      centerFileListIfCurrentInList();
      if (
        !deps.currentFile.value ||
        !deps.txtFiles.value.some((f) => f.path === deps.currentFile.value)
      ) {
        scrollFileListsToIndex(0);
      }
    } finally {
      unsub();
      deps.dirListScanning.value = false;
      deps.dirListCurrentName.value = "";
    }
  }

  function scrollFileListsToIndex(index: number) {
    if (deps.txtFiles.value.length === 0 || index < 0) return;
    const idx = Math.min(index, deps.txtFiles.value.length - 1);
    void nextTick(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          void deps.readerSidebarRef.value?.scrollFileListToIndex(idx);
        });
      });
    });
  }

  async function openFilePath(
    filePath: string,
    options?: {
      restoreLine?: number;
      restorePhysicalLine?: number;
      skipRememberCurrent?: boolean;
      keepSidebarTab?: boolean;
    },
  ) {
    if (!options?.keepSidebarTab) {
      suppressFileListCenterAfterLoad.value = false;
    }

    if (!options?.skipRememberCurrent) {
      rememberCurrentFileLine();
    }

    const normalizedExplicitRestore =
      options?.restoreLine != null
        ? Math.max(1, Math.floor(options.restoreLine))
        : undefined;

    const prepared = await prepareOpenFile({
      filePath,
      txtFiles: deps.txtFiles.value,
      statFile: (path) => window.colorTxt.stat(path),
    });
    if (!prepared.ok) {
      const tip = prepared.message;
      window.alert(tip);
      removeRecentFile(filePath);
      suppressFileListCenterAfterLoad.value = false;
      return false;
    }

    clearReaderBeforeResolve();
    const resolved = await resolvePhysicalTextForOpen(
      filePath,
      prepared.fileSize,
    );
    if (!resolved.ok) {
      window.alert(resolved.message);
      removeRecentFile(filePath);
      suppressFileListCenterAfterLoad.value = false;
      return false;
    }

    const meta = getFileMeta(filePath);
    const savedVs = meta?.editorViewState;
    const anchorRaw = meta?.viewportTopPhysicalLine;
    const hasAnchor =
      typeof anchorRaw === "number" && Number.isFinite(anchorRaw);
    const canRestoreViewState =
      savedVs != null &&
      typeof savedVs === "object" &&
      !Array.isArray(savedVs) &&
      hasAnchor;

    if (options?.restorePhysicalLine != null || normalizedExplicitRestore != null) {
      deps.pendingRestoreEditorViewState.value = null;
      deps.pendingRestoreViewportTopPhysicalLine.value = null;
      deps.pendingRestorePhysicalLine.value =
        options?.restorePhysicalLine != null
          ? Math.max(1, Math.floor(options.restorePhysicalLine))
          : normalizedExplicitRestore!;
    } else if (isReadingCompleteProgress(meta?.progress)) {
      deps.pendingRestoreEditorViewState.value = null;
      deps.pendingRestoreViewportTopPhysicalLine.value = null;
      deps.pendingRestorePhysicalLine.value = RESTORE_PHYSICAL_LINE_SCROLL_TO_END;
    } else if (canRestoreViewState) {
      deps.pendingRestoreEditorViewState.value = savedVs;
      deps.pendingRestorePhysicalLine.value = null;
      deps.pendingRestoreViewportTopPhysicalLine.value = Math.max(
        1,
        Math.floor(anchorRaw),
      );
    } else {
      deps.pendingRestoreEditorViewState.value = null;
      deps.pendingRestoreViewportTopPhysicalLine.value = null;
      deps.pendingRestorePhysicalLine.value = null;
    }

    resetSession(filePath);
    deps.physicalReaderPath.value = resolved.physicalPath;
    deps.currentFileSize.value = resolved.displaySize;
    if (!options?.keepSidebarTab) {
      deps.sidebarTab.value = "chapters";
    }
    touchRecentFile(filePath, true, { persistRecent: true, updateMeta: false });
    await waitNextPaintFrame();
    window.colorTxt.streamFile(resolved.physicalPath, {
      sessionFilePath: resolved.sessionFilePath,
    });

    const fileInList = deps.txtFiles.value.some((f) => f.path === filePath);
    if (fileInList && !suppressFileListCenterAfterLoad.value) {
      void nextTick(() => {
        pulseFileListCenter();
      });
    }
    suppressFileListCenterAfterLoad.value = false;

    return true;
  }

  function openRecentFileFromHistory(filePath: string) {
    return openFilePath(filePath);
  }

  return {
    restoreFileListFromSession,
    centerFileListIfCurrentInList,
    clearFileList,
    removeFileList,
    closeCurrentFile,
    rememberCurrentFileLine,
    tryRestoreSession,
    resetSession,
    openFileViaDialog,
    openFileFromSidebar,
    subscribeDirListTxtScan,
    pickTxtDirectory,
    scrollFileListsToIndex,
    openFilePath,
    openRecentFileFromHistory,
  };
}
