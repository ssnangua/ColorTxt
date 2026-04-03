import { computed, nextTick, ref, watch } from "vue";
import type { Chapter } from "../chapter";
import type VirtualList from "../components/VirtualList.vue";

/** 行高 + 1px 行间距（用于虚拟列表内的 padding-bottom） */
export const READER_SIDEBAR_ROW_STRIDE = 41;

type SidebarFileItem = {
  name: string;
  path: string;
  size: number;
  progress?: number;
};

type SidebarBookmarkItem = {
  line: number;
  note?: string;
  content: string;
};

export type ReaderSidebarListProps = Readonly<{
  activeTab: "files" | "chapters" | "bookmarks";
  chapters: Chapter[];
  files: Array<SidebarFileItem>;
  bookmarks: SidebarBookmarkItem[];
  currentFilePath: string | null;
  activeChapterIdx: number;
  activeBookmarkLine?: number | null;
  inFullscreen?: boolean;
  chapterListScrollSmooth?: boolean;
  shouldCenterChapterList?: boolean;
  shouldCenterFileList?: boolean;
  shouldCenterBookmarkList?: boolean;
  activeScrollMode?: "edge" | "center";
}>;

export function useReaderSidebarLists(
  props: ReaderSidebarListProps,
  emit: (e: "jumpToChapter", chapter: Chapter) => void,
) {
  const chapterListRef = ref<InstanceType<typeof VirtualList> | null>(null);
  const fileListRef = ref<InstanceType<typeof VirtualList> | null>(null);
  const bookmarkListRef = ref<InstanceType<typeof VirtualList> | null>(null);

  const fileFilterQuery = ref("");

  const filesFiltered = computed<SidebarFileItem[]>(() => {
    const q = fileFilterQuery.value.trim().toLowerCase();
    if (!q) return props.files;
    return props.files.filter((f) => f.name.toLowerCase().includes(q));
  });

  watch(
    () => props.files,
    () => {
      fileFilterQuery.value = "";
    },
  );

  const chaptersVisible = computed(() =>
    props.chapters.filter((ch) => ch.charCount > 0),
  );
  const bookmarksVisible = computed<SidebarBookmarkItem[]>(() =>
    props.bookmarks.slice().sort((a, b) => a.line - b.line),
  );

  const sidebarActiveLineNumber = computed(() => {
    const list = props.chapters;
    const idx = props.activeChapterIdx;
    if (idx < 0 || idx >= list.length) return -1;
    let i = idx;
    while (i >= 0 && list[i].charCount === 0) i--;
    if (i < 0) return -1;
    return list[i].lineNumber;
  });

  let suppressAutoScrollUntil = 0;

  const MAX_CHAPTER_LIST_LAYOUT_RETRIES = 48;

  async function ensureActiveChapterVisible(
    override?: {
      smooth?: boolean;
      align?: "auto" | "center";
      /**
       * 当侧栏章节列表当前未显示（tab!=chapters / display:none）时：
       * - allowWhenHidden=true：仍尝试写入虚拟列表的 scrollTop（虚拟列表内部会在可见后同步）
       * - allowWhenHidden=false：保持原行为（不打断用户/不做隐藏滚动）
       */
      allowWhenHidden?: boolean;
    },
    layoutRetry = 0,
  ): Promise<void> {
    const wantSmoothScroll = props.inFullscreen
      ? false
      : override?.smooth !== undefined
        ? override.smooth
        : props.chapterListScrollSmooth;
    const align = override?.align ?? (props.activeScrollMode === "center" ? "center" : "auto");
    const allowWhenHidden = override?.allowWhenHidden === true;

    await nextTick();
    if (Date.now() < suppressAutoScrollUntil) {
      return;
    }
    const targetLine = sidebarActiveLineNumber.value;
    if (targetLine < 0) return;
    const list = chaptersVisible.value;
    const idx = list.findIndex((ch) => ch.lineNumber === targetLine);
    if (idx < 0) return;

    const vl = chapterListRef.value;
    const scrollHost = vl?.scrollEl as HTMLElement | undefined;
    const clientH = scrollHost?.clientHeight ?? 0;
    if (
      !vl ||
      !scrollHost ||
      (!allowWhenHidden && clientH <= 0) ||
      (!allowWhenHidden && props.activeTab !== "chapters")
    ) {
      if (layoutRetry < MAX_CHAPTER_LIST_LAYOUT_RETRIES) {
        requestAnimationFrame(() =>
          void ensureActiveChapterVisible(
            { smooth: wantSmoothScroll, allowWhenHidden },
            layoutRetry + 1,
          ),
        );
      }
      return;
    }

    const behavior = wantSmoothScroll ? "smooth" : "auto";
    vl.scrollToIndex(idx, { align: align === "center" ? "center" : "auto", behavior });
  }

  async function ensureCurrentFileVisible(mode: "edge" | "center" = "edge") {
    await nextTick();
    const path = props.currentFilePath;
    if (!path) return;
    const list = filesFiltered.value;
    const idx = list.findIndex((f) => f.path === path);
    if (idx < 0) return;

    const vl = fileListRef.value;
    if (!vl) return;
    if (mode === "center") {
      vl.scrollToIndex(idx, { align: "center", behavior: "auto" });
      return;
    }
    vl.scrollToIndex(idx, { align: "auto", behavior: "auto" });
  }

  async function ensureActiveBookmarkVisible(
    mode: "edge" | "center" = "center",
    smooth = true,
  ) {
    await nextTick();
    const activeLine = props.activeBookmarkLine ?? -1;
    if (activeLine < 0) return;
    const idx = bookmarksVisible.value.findIndex((it) => it.line === activeLine);
    if (idx < 0) return;
    const vl = bookmarkListRef.value;
    if (!vl) return;
    const behavior = props.inFullscreen ? "auto" : smooth ? "smooth" : "auto";
    if (mode === "center") {
      vl.scrollToIndex(idx, { align: "center", behavior });
      return;
    }
    vl.scrollToIndex(idx, { align: "auto", behavior });
  }

  function onChapterItemClick(chapter: Chapter) {
    suppressAutoScrollUntil = Date.now() + 800;
    emit("jumpToChapter", chapter);
  }

  watch(
    () => props.shouldCenterChapterList,
    (v) => {
      if (!v) return;
      if (props.activeChapterIdx < 0) return;
      const smooth = props.chapterListScrollSmooth;
      // 恢复阅读进度/全屏切换等场景需要做一次居中：
      // 即使章节列表未显示，也要把虚拟滚动位置写入，避免之后再打开 tab 时不对齐。
      void ensureActiveChapterVisible({ smooth, allowWhenHidden: true });
    },
  );

  watch(
    () =>
      [props.activeChapterIdx, sidebarActiveLineNumber.value] as [
        number,
        number,
      ],
    (curr, prev) => {
      const [idx, line] = curr;
      if (idx < 0 || line < 0) return;
      if (prev) {
        const [pIdx, pLine] = prev;
        if (pIdx === idx && pLine === line) return;
      }
      const smooth = props.chapterListScrollSmooth;
      // 阅读器滚动换章时：章节列表可能不处于显示状态，但仍应居中当前章。
      void ensureActiveChapterVisible({ smooth, allowWhenHidden: true });
    },
  );

  // 不在 `activeTab` 切换时触发章节列表滚动：
  // 避免用户手动从「文件列表」切到「章节列表」时被打断/移动滚动条。

  watch(
    () => props.shouldCenterFileList,
    (v) => {
      if (!v) return;
      if (!props.currentFilePath) return;
      void ensureCurrentFileVisible("center");
    },
  );

  watch(
    () => props.shouldCenterBookmarkList,
    (v) => {
      if (!v) return;
      if ((props.activeBookmarkLine ?? -1) < 0) return;
      void ensureActiveBookmarkVisible("center", true);
    },
  );

  watch(fileFilterQuery, (newVal, oldVal) => {
    if (props.activeTab !== "files") return;
    const newQ = newVal.trim();
    const oldQ = (oldVal ?? "").trim();
    void nextTick(() => {
      if (oldQ.length > 0 && newQ.length === 0) {
        const path = props.currentFilePath;
        if (path) {
          const list = filesFiltered.value;
          if (list.some((f) => f.path === path)) {
            void ensureCurrentFileVisible("center");
            return;
          }
        }
        fileListRef.value?.scrollToTop();
        return;
      }
      if (newQ.length > 0) {
        fileListRef.value?.scrollToTop();
      }
    });
  });

  async function scrollFileListToIndex(index: number) {
    await nextTick();
    const vl = fileListRef.value;
    if (!vl) return;
    const list = filesFiltered.value;
    const n = list.length;
    if (n <= 0) return;
    const idx = Math.max(0, Math.min(Math.floor(index), n - 1));
    vl.scrollToIndex(idx, { align: "auto", behavior: "auto" });
  }

  return {
    chapterListRef,
    fileListRef,
    bookmarkListRef,
    fileFilterQuery,
    filesFiltered,
    chaptersVisible,
    bookmarksVisible,
    sidebarActiveLineNumber,
    onChapterItemClick,
    ensureActiveBookmarkVisible,
    scrollFileListToIndex,
  };
}
