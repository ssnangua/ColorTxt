import { nextTick, type Ref } from "vue";
import type ReaderMain from "../components/ReaderMain.vue";
import {
  detectChapterTitle,
  getChapterMatchRules,
  setChapterMatchRules,
  type Chapter,
  type ChapterMatchRule,
} from "../chapter";
import { pickActiveChapterIdx } from "../reader/chapterIndex";
import { countCharsForLine } from "../utils/format";
import type { useTxtStreamPipeline } from "./useTxtStreamPipeline";

type Stream = ReturnType<typeof useTxtStreamPipeline>;

export function useAppChapterNavigation(deps: {
  readerRef: Ref<InstanceType<typeof ReaderMain> | null>;
  chapters: Ref<Chapter[]>;
  activeChapterIdx: Ref<number>;
  lastProbeLine: Ref<number>;
  viewportTopLine: Ref<number>;
  viewportEndLine: Ref<number>;
  currentFile: Ref<string | null>;
  /** 为 false 时不根据视口调用 touchRecentFile（加载与滚动恢复完成前忽略阅读进度写账） */
  readingProgressSynced: Ref<boolean>;
  stream: Stream;
  touchRecentFile: (
    path: string,
    moveToTop: boolean,
    opts?: {
      persistRecent?: boolean;
      persistMeta?: boolean;
      updateMeta?: boolean;
      progress?: number;
      editorViewState?: unknown;
    },
  ) => void;
  chapterListScrollSmooth: Ref<boolean>;
  chapterRuleState: Ref<{ rules: ChapterMatchRule[] }>;
  chapterRuleErrorText: Ref<string>;
  showChapterRulePanel: Ref<boolean>;
  sidebarTab: Ref<"files" | "chapters" | "bookmarks">;
  persistSettings: () => void;
  openFilePath: (
    filePath: string,
    options?: {
      restorePhysicalLine?: number;
      skipRememberCurrent?: boolean;
      keepSidebarTab?: boolean;
    },
  ) => Promise<boolean>;
}) {
  function jumpToChapter(ch: Chapter) {
    deps.readerRef.value?.jumpToLine(ch.lineNumber);
    const idx = pickActiveChapterIdx(deps.chapters.value, ch.lineNumber);
    if (idx !== deps.activeChapterIdx.value) deps.activeChapterIdx.value = idx;
  }

  /** 与阅读器滚动换章一致：侧栏章节列表随当前章平滑滚入视口 */
  function withChapterListSmoothScroll(run: () => void) {
    deps.chapterListScrollSmooth.value = true;
    void nextTick(() => {
      deps.chapterListScrollSmooth.value = false;
    });
    run();
  }

  /** 按当前阅读位置所在章节，跳到上一/下一章标题行 */
  function jumpToPrevChapter() {
    const list = deps.chapters.value;
    if (list.length === 0) return;
    const idx = pickActiveChapterIdx(list, deps.lastProbeLine.value);
    if (idx > 0) {
      withChapterListSmoothScroll(() => jumpToChapter(list[idx - 1]!));
    }
  }

  function jumpToNextChapter() {
    const list = deps.chapters.value;
    if (list.length === 0) return;
    const idx = pickActiveChapterIdx(list, deps.lastProbeLine.value);
    if (idx === -1) {
      withChapterListSmoothScroll(() => jumpToChapter(list[0]!));
      return;
    }
    if (idx + 1 < list.length) {
      withChapterListSmoothScroll(() => jumpToChapter(list[idx + 1]!));
    }
  }

  function onProbeLineChange(probeLine: number, fromScroll?: boolean) {
    deps.lastProbeLine.value = probeLine;
    const idx = pickActiveChapterIdx(deps.chapters.value, probeLine);
    if (idx !== deps.activeChapterIdx.value) {
      deps.activeChapterIdx.value = idx;
      if (fromScroll === true) {
        deps.chapterListScrollSmooth.value = true;
        void nextTick(() => {
          deps.chapterListScrollSmooth.value = false;
        });
      }
    }
    if (
      deps.readingProgressSynced.value &&
      deps.currentFile.value
    ) {
      deps.touchRecentFile(deps.currentFile.value, false, {
        updateMeta: false,
        progress: deps.stream.calcProgressPercentByViewportDisplay(
          deps.viewportTopLine.value,
          deps.viewportEndLine.value,
        ),
      });
    }
  }

  function rebuildChaptersFromCurrentText() {
    const text = deps.readerRef.value?.getAllText?.();
    if (!text) {
      deps.chapters.value = [];
      deps.activeChapterIdx.value = -1;
      deps.stream.setChapterWriteIndex(-1);
      deps.readerRef.value?.setChapters([]);
      return;
    }

    const lines = text.split(/\n/);
    const next: Chapter[] = [];
    let lineNo = 0;
    let currentIdx = -1;

    for (const rawLine of lines) {
      lineNo += 1;
      const title = detectChapterTitle(rawLine);
      if (title) {
        next.push({ title, lineNumber: lineNo, charCount: 0 });
        currentIdx = next.length - 1;
        continue;
      }
      if (currentIdx >= 0) {
        next[currentIdx].charCount += countCharsForLine(rawLine);
      }
    }

    deps.chapters.value = next;
    deps.stream.setChapterWriteIndex(next.length - 1);
    deps.readerRef.value?.setChapters(
      next.map((ch) => ({ title: ch.title, lineNumber: ch.lineNumber })),
    );
    deps.activeChapterIdx.value = pickActiveChapterIdx(
      deps.chapters.value,
      deps.lastProbeLine.value,
    );
  }

  async function applyChapterMatchRules(payload: {
    rules: ChapterMatchRule[];
  }) {
    try {
      setChapterMatchRules(payload.rules);
      deps.chapterRuleState.value = getChapterMatchRules();
      deps.chapterRuleErrorText.value = "";
      deps.persistSettings();
      const openedFilePath = deps.currentFile.value;
      if (openedFilePath) {
        const physicalP = deps.stream.viewportDisplayLineToPhysicalLine(
          deps.viewportEndLine.value,
        );
        await deps.openFilePath(openedFilePath, { restorePhysicalLine: physicalP });
      } else {
        rebuildChaptersFromCurrentText();
      }
      deps.sidebarTab.value = "chapters";
      deps.showChapterRulePanel.value = false;
    } catch (e) {
      deps.chapterRuleErrorText.value =
        e instanceof Error ? e.message : "规则无效，请检查正则表达式";
    }
  }

  return {
    jumpToChapter,
    jumpToPrevChapter,
    jumpToNextChapter,
    onProbeLineChange,
    rebuildChaptersFromCurrentText,
    applyChapterMatchRules,
  };
}
