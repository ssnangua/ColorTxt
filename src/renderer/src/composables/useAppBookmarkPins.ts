import { computed, nextTick, ref, watch, type Ref } from "vue";
import type ReaderMain from "../components/ReaderMain.vue";
import {
  findFileMetaRecord,
  type FileBookmarkItem,
  type FileMetaRecord,
} from "../stores/fileMetaStore";

type ReaderRef = Ref<InstanceType<typeof ReaderMain> | null>;
type TxtStreamPipeline = ReturnType<
  typeof import("./useTxtStreamPipeline").useTxtStreamPipeline
>;

export function useAppBookmarkPins(deps: {
  readerRef: ReaderRef;
  stream: TxtStreamPipeline;
  currentFile: Ref<string | null>;
  loading: Ref<boolean>;
  totalLineCount: Ref<number>;
  fileMetaRecords: Ref<FileMetaRecord[]>;
  lastProbeLine: Ref<number>;
  viewportEndLine: Ref<number>;
  sidebarTab: Ref<"files" | "chapters" | "bookmarks">;
  pulseBookmarkListCenter: () => void;
  upsertBookmark: (path: string, line: number, note: string) => void;
  removeBookmark: (path: string, line: number) => void;
  clearBookmarks: (path: string) => void;
}) {
  const pinnedScrollTop = ref<number | null>(null);
  const pinActive = computed(() => pinnedScrollTop.value !== null);
  const canPin = computed(
    () =>
      Boolean(deps.currentFile.value) &&
      !deps.loading.value &&
      deps.totalLineCount.value > 0,
  );
  const canBookmark = canPin;

  const addBookmarkOpen = ref(false);
  const removeBookmarkOpen = ref(false);
  const bookmarkNoteInput = ref("");
  const bookmarkNoteInputRef = ref<HTMLTextAreaElement | null>(null);
  const editingBookmarkLine = ref<number | null>(null);

  watch(deps.currentFile, () => {
    pinnedScrollTop.value = null;
  });
  watch(addBookmarkOpen, async (open) => {
    if (!open) return;
    await nextTick();
    const el = bookmarkNoteInputRef.value;
    if (!el) return;
    el.focus();
    el.select();
  });

  const currentFileBookmarks = computed<FileBookmarkItem[]>(() => {
    const path = deps.currentFile.value;
    if (!path) return [];
    return (
      findFileMetaRecord(deps.fileMetaRecords.value, path)
        ?.bookmarks.slice()
        .sort((a, b) => a.line - b.line) ?? []
    );
  });

  const viewportTopPhysicalLine = computed(() =>
    deps.stream.viewportDisplayLineToPhysicalLine(
      (() => {
        const probeTick = deps.lastProbeLine.value;
        const top = deps.readerRef.value?.getViewportTopLine?.();
        return typeof top === "number" && Number.isFinite(top)
          ? top
          : probeTick;
      })(),
    ),
  );
  const viewportBottomPhysicalLine = computed(() =>
    deps.stream.viewportDisplayLineToPhysicalLine(deps.viewportEndLine.value),
  );

  const activeBookmarkInViewport = computed<FileBookmarkItem | null>(() => {
    const top = Math.min(
      viewportTopPhysicalLine.value,
      viewportBottomPhysicalLine.value,
    );
    const bottom = Math.max(
      viewportTopPhysicalLine.value,
      viewportBottomPhysicalLine.value,
    );
    for (const item of currentFileBookmarks.value) {
      if (item.line >= top && item.line <= bottom) return item;
    }
    return null;
  });
  const activeBookmarkLine = computed(
    () => activeBookmarkInViewport.value?.line ?? null,
  );
  const bookmarkActive = computed(
    () => activeBookmarkInViewport.value !== null,
  );

  function resolveBookmarkPreviewContent(line: number) {
    const start = Math.max(1, Math.floor(line));
    const end = Math.max(start, deps.stream.getPhysicalLineCount());
    for (let i = start; i <= end; i += 1) {
      const text = deps.stream.getPhysicalLineContent(i).trim();
      if (text) return text;
    }
    return "";
  }

  const bookmarkListItems = computed(() =>
    currentFileBookmarks.value.map((it) => {
      const _tick = deps.totalLineCount.value;
      void _tick;
      return {
        line: it.line,
        note: it.note,
        content: resolveBookmarkPreviewContent(it.line),
      };
    }),
  );

  watch(activeBookmarkLine, (line, prev) => {
    if (line == null || line === prev) return;
    if (deps.sidebarTab.value === "bookmarks") deps.pulseBookmarkListCenter();
  });

  function onPinClick() {
    if (pinnedScrollTop.value !== null) {
      pinnedScrollTop.value = null;
      return;
    }
    if (!canPin.value) return;
    const top = deps.readerRef.value?.getScrollTop?.() ?? 0;
    pinnedScrollTop.value = Math.max(0, top);
  }

  /** 与手动点亮书钉一致；已激活或不可钉时不修改。 */
  function ensurePinBeforeRevealFindWidget() {
    if (pinnedScrollTop.value !== null) return;
    if (!canPin.value) return;
    const top = deps.readerRef.value?.getScrollTop?.() ?? 0;
    pinnedScrollTop.value = Math.max(0, top);
  }

  function onGoBackFromPin() {
    const top = pinnedScrollTop.value;
    if (top == null) return;
    deps.readerRef.value?.scrollToScrollTop?.(top, true);
    pinnedScrollTop.value = null;
    queueMicrotask(() => {
      deps.readerRef.value?.emitProbeLine?.();
    });
  }

  function onBookmarkClick() {
    if (!deps.currentFile.value || !canBookmark.value) return;
    if (bookmarkActive.value) {
      removeBookmarkOpen.value = true;
      addBookmarkOpen.value = false;
      return;
    }
    editingBookmarkLine.value = null;
    bookmarkNoteInput.value = deps.readerRef.value?.getSelectedText?.() ?? "";
    addBookmarkOpen.value = true;
    removeBookmarkOpen.value = false;
  }

  function confirmAddBookmark() {
    const path = deps.currentFile.value;
    if (!path) return;
    const line = editingBookmarkLine.value ?? viewportTopPhysicalLine.value;
    const note = bookmarkNoteInput.value.replace(/\r?\n/g, " ").trim();
    deps.upsertBookmark(path, line, note);
    editingBookmarkLine.value = null;
    addBookmarkOpen.value = false;
    if (deps.sidebarTab.value === "bookmarks") deps.pulseBookmarkListCenter();
  }

  function confirmRemoveActiveBookmark() {
    const path = deps.currentFile.value;
    const line = activeBookmarkLine.value;
    if (!path || line == null) return;
    deps.removeBookmark(path, line);
    removeBookmarkOpen.value = false;
  }

  function jumpToBookmark(line: number) {
    const displayLine = deps.stream.physicalLineToDisplayForReader(line);
    deps.readerRef.value?.jumpToBookmarkLine(displayLine);
    queueMicrotask(() => deps.readerRef.value?.emitProbeLine?.());
  }

  async function clearCurrentFileBookmarks() {
    const path = deps.currentFile.value;
    if (!path) return;
    if (!window.colorTxt) return;
    const confirmed = await window.colorTxt.confirmClearBookmarks();
    if (!confirmed) return;
    deps.clearBookmarks(path);
  }

  function removeCurrentFileBookmarks(lines: number[]) {
    const path = deps.currentFile.value;
    if (!path) return;
    for (const line of lines) deps.removeBookmark(path, line);
  }

  function onEditBookmark(line: number) {
    const item = currentFileBookmarks.value.find((it) => it.line === line);
    editingBookmarkLine.value = line;
    bookmarkNoteInput.value = item?.note ?? "";
    addBookmarkOpen.value = true;
    removeBookmarkOpen.value = false;
  }

  function onRemoveBookmark(line: number) {
    const path = deps.currentFile.value;
    if (!path) return;
    deps.removeBookmark(path, line);
  }

  return {
    pinnedScrollTop,
    pinActive,
    canPin,
    canBookmark,
    addBookmarkOpen,
    removeBookmarkOpen,
    bookmarkNoteInput,
    bookmarkNoteInputRef,
    editingBookmarkLine,
    currentFileBookmarks,
    viewportTopPhysicalLine,
    viewportBottomPhysicalLine,
    activeBookmarkInViewport,
    activeBookmarkLine,
    bookmarkActive,
    bookmarkListItems,
    onPinClick,
    ensurePinBeforeRevealFindWidget,
    onGoBackFromPin,
    onBookmarkClick,
    confirmAddBookmark,
    confirmRemoveActiveBookmark,
    jumpToBookmark,
    clearCurrentFileBookmarks,
    removeCurrentFileBookmarks,
    onEditBookmark,
    onRemoveBookmark,
  };
}
