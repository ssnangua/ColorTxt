<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import type { Chapter } from "../chapter";
import { useReaderSidebarLists } from "../composables/useReaderSidebarLists";
import type {
  FileCategoryDefinition,
  FileSortMode,
} from "../constants/fileCategories";
import { SIDEBAR_ACTIVITY_BAR_WIDTH } from "../constants/appUi";
import type { TxtFileItem } from "../services/fileListService";
import type { SidebarFileItem } from "../composables/useReaderSidebarLists";
import type { CategoryEditorRow } from "../constants/fileCategories";
import type { FileMetaRecord } from "../stores/fileMetaStore";
import type {
  CharacterBookStylePersisted,
  CharacterRosterEntry,
} from "@shared/characterTypes";
import SwitchToggle from "./SwitchToggle.vue";
import ChapterListPanel from "./ChapterListPanel.vue";
import FileListPanel from "./FileListPanel.vue";
import BookmarkListPanel from "./BookmarkListPanel.vue";
import HighlightListPanel from "./HighlightListPanel.vue";
import AiAssistantPanel from "./AiAssistantPanel.vue";
import CharacterSidebarPanel from "./CharacterSidebarPanel.vue";
import SearchPanel from "./SearchPanel.vue";
import type ReaderMain from "./ReaderMain.vue";
import type { AiCustomSkill, AiSkillUserOverride } from "@shared/aiSkills";
import { icons } from "../icons";
import type { ReaderSidebarTab } from "../constants/readerSidebarTab";
import {
  characterPortraitBookDirAbs,
  sanitizeBookFolderSegment,
} from "@shared/characterPortraitPaths";
import { appAlert } from "../services/appDialog";
import {
  collectFsPathsFromDataTransfer,
  dataTransferLikelyHasExternalFiles,
} from "../utils/dragDropFsPaths";

const props = withDefaults(
  defineProps<{
    activeTab: ReaderSidebarTab;
    /** 非全屏时是否展开右侧面板列；全屏时由 App 固定为 true */
    panelExpanded?: boolean;
    chapters: Chapter[];
    files: TxtFileItem[];
    /** 来自 file.meta 的阅读进度映射（路径 key → 百分比） */
    metaProgressByPathKey?: Map<string, number>;
    /** 与 `files` 对应的 meta 行（分类、打开时间、排序用进度等） */
    fileMetaRecords?: readonly FileMetaRecord[];
    /** 当前打开文件的实时进度（%），滚动时更新 */
    liveReadingProgressPercent?: number;
    highlightTerms?: Array<{ text: string; color: string; colorIndex: number; isGlobal: boolean }>;
    searchQuery?: string;
    searchResults?: Array<{
      physicalLine: number;
      displayLine: number;
      text: string;
      range: { start: number; end: number };
    }>;
    searchInProgress?: boolean;
    searchMatchCase?: boolean;
    searchWholeWord?: boolean;
    searchUseRegex?: boolean;
    activeSearchResult?: { physicalLine: number; rangeStart: number } | null;
    hasInlineSearchHighlight?: boolean;
    highlightPreviewBg?: string;
    monacoFontFamily?: string;
    bookmarks: Array<{ line: number; note?: string; content: string }>;
    currentFilePath: string | null;
    activeChapterIdx: number;
    activeBookmarkLine?: number | null;
    showChapterCounts: boolean;
    formatCharCount: (n: number) => string;
    /** edge：滚入可见区；center：当前项在列表视口垂直居中（全屏浮动侧栏） */
    activeScrollMode?: "edge" | "center";
    /** 全屏浮动侧栏时章节列表不使用平滑滚动（避免与呼出动画叠加） */
    inFullscreen?: boolean;
    /** 全屏浮动侧栏是否展开（用于文件列表 Teleport 浮层随侧栏收起而关闭） */
    showFullscreenSidebar?: boolean;
    /** 章节列表当前项是否平滑滚入视口（由 App 在阅读滚动导致换章时置为 true） */
    chapterListScrollSmooth?: boolean;
    /** App 在需将当前章滚入视口/居中时置为 true（一拍后清除） */
    shouldCenterChapterList?: boolean;
    /** 程序化整表刷新章节时置 true，避免 watch 与 centerActiveChapterInList 竞态 */
    suppressChapterListAutoScroll?: boolean;
    /** App 在需将文件列表滚到当前文件并居中时置为 true（一拍后清除） */
    shouldCenterFileList?: boolean;
    /** App 在需将书签列表滚到当前书签并居中时置为 true（一拍后清除） */
    shouldCenterBookmarkList?: boolean;
    fileCategory: string;
    fileSort: FileSortMode;
    fileCategoryCatalog: FileCategoryDefinition[];
    /** AI 助手：阅读器实例（取全文建索引） */
    readerMainRef?: InstanceType<typeof ReaderMain> | null;
    /** 磁盘上的当前 txt 路径（电子书转换后与逻辑路径可能不同） */
    physicalReaderPath?: string | null;
    /** 设置 → 技能，传入 AI 阅读助手 */
    aiSkillsEnabled?: Record<string, boolean>;
    aiSkillOverrides?: Record<string, AiSkillUserOverride>;
    aiCustomSkills?: AiCustomSkill[];
    /** 设置 → AI「启用 AI 阅读助手功能」为 false 时隐藏「AI 阅读助手」按钮 */
    aiAssistantTabVisible?: boolean;
    /** 设置中文生图关闭或未启用 AI 时隐藏「角色卡」活动栏按钮 */
    characterPortraitTabVisible?: boolean;
    /** 设置 → 文生图：角色立绘缓存根目录（空则默认 userData 子目录） */
    characterPortraitCacheDir?: string;
    /** 当前文件的侧栏角色列表（来自 file.meta） */
    characterRoster?: readonly CharacterRosterEntry[];
    /** 当前文件本书画风（来自 file.meta） */
    characterBookStyle?: CharacterBookStylePersisted;
    /** 设置「确定」保存 AI 配置后由 App 递增，用于阅读助手刷新快速提问等 */
    aiAssistantConfigSyncNonce?: number;
    /** 编辑态章节面板是否显示「刷新章节」（仅手动刷新场景） */
    showEditChapterRefreshButton?: boolean;
  }>(),
  {
    panelExpanded: true,
    inFullscreen: false,
    showFullscreenSidebar: undefined,
    chapterListScrollSmooth: false,
    shouldCenterChapterList: false,
    suppressChapterListAutoScroll: false,
    shouldCenterFileList: false,
    shouldCenterBookmarkList: false,
    metaProgressByPathKey: () => new Map(),
    fileMetaRecords: () => [],
    liveReadingProgressPercent: undefined,
    highlightTerms: () => [],
    searchQuery: "",
    searchResults: () => [],
    searchInProgress: false,
    searchMatchCase: false,
    searchWholeWord: false,
    searchUseRegex: false,
    activeSearchResult: null,
    hasInlineSearchHighlight: false,
    highlightPreviewBg: "var(--reader-bg, var(--bg))",
    monacoFontFamily: "",
    readerMainRef: null,
    physicalReaderPath: null,
    aiSkillsEnabled: () => ({}),
    aiSkillOverrides: () => ({}),
    aiCustomSkills: () => [],
    characterPortraitTabVisible: true,
    characterPortraitCacheDir: "",
    characterRoster: () => [],
    characterBookStyle: undefined,
    aiAssistantConfigSyncNonce: 0,
    showEditChapterRefreshButton: false,
  },
);

const deepThinking = defineModel<boolean>("deepThinking", {
  default: false,
});
const spoilerSafe = defineModel<boolean>("spoilerSafe", {
  default: false,
});

const emit = defineEmits<{
  "update:activeTab": [value: ReaderSidebarTab];
  "update:showChapterCounts": [value: boolean];
  "update:fileCategory": [value: string];
  "update:fileSort": [value: FileSortMode];
  pickDirectory: [];
  importDroppedPaths: [paths: string[]];
  openFile: [item: SidebarFileItem];
  jumpToChapter: [chapter: Chapter];
  /** AI 阅读助手内章节按钮：父级可在跳转前自动点亮书钉 */
  jumpToChapterFromAi: [chapter: Chapter];
  jumpToBookmark: [line: number];
  clearFileList: [];
  clearFileListCategory: [categoryFilter: string];
  removeFileList: [filePaths: string[]];
  clearFileMeta: [path: string];
  renameFilePath: [payload: { oldPath: string; newName: string }];
  openFileInNewWindow: [path: string];
  closeCurrentFile: [];
  clearBookmarks: [];
  removeBookmarks: [lines: number[]];
  editBookmark: [line: number];
  removeBookmark: [line: number];
  persistUi: [];
  applyCategoryCatalog: [
    payload: {
      initial: CategoryEditorRow[];
      draft: CategoryEditorRow[];
      catalog: FileCategoryDefinition[];
    },
  ];
  setFilesCategory: [paths: string[], category: string];
  "update:fullscreenFileListPopoversOpen": [open: boolean];
  "update:fullscreenAiAssistantPopoversOpen": [open: boolean];
  "update:fullscreenCharacterDrawerOpen": [open: boolean];
  "update:fileListEditing": [editing: boolean];
  requestExpandPanel: [];
  requestCollapsePanel: [];
  openColorScheme: [];
  openSettings: [];
  refreshChaptersFromReader: [];
  findHighlightTerm: [text: string];
  removeHighlightTerm: [text: string];
  toggleGlobalHighlightTerm: [text: string, enabled: boolean];
  clearInlineSearchHighlight: [];
  clearHighlights: [];
  "update:searchQuery": [value: string];
  "update:searchMatchCase": [value: boolean];
  "update:searchWholeWord": [value: boolean];
  "update:searchUseRegex": [value: boolean];
  jumpToSearchResult: [
    item: {
      physicalLine: number;
      displayLine: number;
      text: string;
      range: { start: number; end: number };
    },
  ];
  characterFileMetaPatch: [
    payload: {
      characterBookStyle?: CharacterBookStylePersisted;
      characterRoster?: CharacterRosterEntry[];
    },
  ];
}>();

const {
  chapterListRef,
  fileListRef,
  fileFilterQuery,
  fileRowsEnriched,
  filesFiltered,
  chaptersVisible,
  bookmarkListRef,
  bookmarksVisible,
  sidebarActiveLineNumber,
  onChapterItemClick,
  scrollFileListToIndex,
  resetChapterListScroll,
  centerActiveChapterInList,
} = useReaderSidebarLists(props, (e, chapter) => emit(e, chapter));

const activityBarWidthPx = `${SIDEBAR_ACTIVITY_BAR_WIDTH}px`;

const characterPortraitOpenDirDisabled = computed(() => {
  const sp =
    props.currentFilePath?.trim() || props.physicalReaderPath?.trim() || "";
  return !sp;
});

async function onOpenCharacterPortraitBookDir() {
  const sp =
    props.currentFilePath?.trim() || props.physicalReaderPath?.trim() || "";
  const rootRaw = props.characterPortraitCacheDir?.trim() ?? "";
  const root = rootRaw
    ? rootRaw
    : await window.colorTxt.getDefaultCharacterPortraitCacheDir();
  const seg = sanitizeBookFolderSegment(sp);
  const dirAbs = characterPortraitBookDirAbs(root, seg);
  const r = await window.colorTxt.openPath(dirAbs);
  if (!r.ok) {
    void appAlert(r.error || "无法打开文件夹");
  }
}

const activePanelTitle = computed(() => {
  switch (props.activeTab) {
    case "files":
      return "文件";
    case "chapters":
      return "章节";
    case "bookmarks":
      return "书签";
    case "highlights":
      return "高亮词";
    case "aiAssistant":
      return "AI 阅读助手";
    case "character":
      return "角色卡";
    case "search":
      return "搜索";
    default:
      return "";
  }
});

/** 侧栏「AI 阅读助手」标题行「更多」菜单 */
const AI_ASSISTANT_HEADER_MORE_MENU_W = 150;
const aiAssistantPanelRef = ref<{
  requestRebuildVectorIndex: () => Promise<void>;
} | null>(null);
const aiAssistantHeaderMoreOpen = ref(false);
const aiAssistantHeaderMoreBtnRef = ref<HTMLButtonElement | null>(null);
const aiAssistantHeaderMoreMenuRef = ref<HTMLElement | null>(null);
const aiAssistantHeaderMoreLeft = ref(0);
const aiAssistantHeaderMoreTop = ref(0);

const aiAssistantPanelTeleportPopoversOpen = ref(false);

watch(
  () =>
    aiAssistantPanelTeleportPopoversOpen.value ||
    aiAssistantHeaderMoreOpen.value,
  (v) => {
    emit("update:fullscreenAiAssistantPopoversOpen", v);
  },
  { immediate: true },
);

const aiAssistantHeaderMoreDisabled = computed(
  () => !props.aiAssistantTabVisible || !props.currentFilePath?.trim(),
);

async function positionAiAssistantHeaderMoreMenu() {
  const trig = aiAssistantHeaderMoreBtnRef.value;
  if (!trig) return;
  const r = trig.getBoundingClientRect();
  aiAssistantHeaderMoreLeft.value = r.right - AI_ASSISTANT_HEADER_MORE_MENU_W;
  aiAssistantHeaderMoreTop.value = r.bottom + 4;
  await nextTick();
  const panel = aiAssistantHeaderMoreMenuRef.value;
  if (!panel) return;
  const margin = 8;
  const w = panel.offsetWidth;
  const h = panel.offsetHeight;
  const maxX = Math.max(margin, window.innerWidth - w - margin);
  const maxY = Math.max(margin, window.innerHeight - h - margin);
  aiAssistantHeaderMoreLeft.value = Math.min(
    Math.max(margin, aiAssistantHeaderMoreLeft.value),
    maxX,
  );
  aiAssistantHeaderMoreTop.value = Math.min(
    Math.max(margin, aiAssistantHeaderMoreTop.value),
    maxY,
  );
}

async function toggleAiAssistantHeaderMoreMenu() {
  if (aiAssistantHeaderMoreDisabled.value) return;
  aiAssistantHeaderMoreOpen.value = !aiAssistantHeaderMoreOpen.value;
  if (aiAssistantHeaderMoreOpen.value) {
    await nextTick();
    await positionAiAssistantHeaderMoreMenu();
  }
}

async function onAiAssistantHeaderMoreRebuildIndex() {
  aiAssistantHeaderMoreOpen.value = false;
  await nextTick();
  await aiAssistantPanelRef.value?.requestRebuildVectorIndex?.();
}

function onDocPointerDownAiAssistantMore(ev: PointerEvent) {
  if (!aiAssistantHeaderMoreOpen.value) return;
  const t = ev.target as Node | null;
  if (t && aiAssistantHeaderMoreMenuRef.value?.contains(t)) return;
  if (t && aiAssistantHeaderMoreBtnRef.value?.contains(t)) return;
  aiAssistantHeaderMoreOpen.value = false;
}

function onDocKeydownAiAssistantMore(ev: KeyboardEvent) {
  if (ev.key !== "Escape") return;
  if (!aiAssistantHeaderMoreOpen.value) return;
  ev.preventDefault();
  aiAssistantHeaderMoreOpen.value = false;
}

function onWindowResizeAiAssistantMore() {
  if (aiAssistantHeaderMoreOpen.value) void positionAiAssistantHeaderMoreMenu();
}

watch(
  () => props.activeTab,
  () => {
    aiAssistantHeaderMoreOpen.value = false;
  },
);

onMounted(() => {
  document.addEventListener("pointerdown", onDocPointerDownAiAssistantMore);
  document.addEventListener("keydown", onDocKeydownAiAssistantMore, true);
  window.addEventListener("resize", onWindowResizeAiAssistantMore);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onDocPointerDownAiAssistantMore);
  document.removeEventListener("keydown", onDocKeydownAiAssistantMore, true);
  window.removeEventListener("resize", onWindowResizeAiAssistantMore);
});

const bookmarkTabIconHtml = computed(() => {
  const hasFile = Boolean(props.currentFilePath);
  const hasBookmarks = props.bookmarks.length > 0;
  if (hasFile && hasBookmarks) return icons.bookmarkActive;
  return icons.bookmark;
});

const highlightTabIconMuted = computed(() => {
  const hasFile = Boolean(props.currentFilePath);
  const hasHighlights = (props.highlightTerms?.length ?? 0) > 0;
  return !(hasFile && hasHighlights);
});

function onPrimaryTabClick(tab: ReaderSidebarTab) {
  if (props.panelExpanded && props.activeTab === tab) {
    emit("requestCollapsePanel");
    return;
  }
  emit("update:activeTab", tab);
  if (!props.panelExpanded) emit("requestExpandPanel");
}

function bindChapterListRef(value: any) {
  chapterListRef.value = value;
}
function bindFileListRef(value: any) {
  fileListRef.value = value;
}
function bindBookmarkListRef(value: any) {
  bookmarkListRef.value = value;
}

const sidebarDragOverlayVisible = ref(false);

function onSidebarDragEnter(ev: DragEvent) {
  const dt = ev.dataTransfer;
  if (!dataTransferLikelyHasExternalFiles(dt)) return;
  ev.preventDefault();
  sidebarDragOverlayVisible.value = true;
}

function onSidebarDragOver(ev: DragEvent) {
  const dt = ev.dataTransfer;
  if (!dataTransferLikelyHasExternalFiles(dt)) return;
  ev.preventDefault();
  sidebarDragOverlayVisible.value = true;
  try {
    if (dt) dt.dropEffect = "copy";
  } catch {
    /* ignore */
  }
}

function onSidebarDragLeave(ev: DragEvent) {
  const root = ev.currentTarget;
  if (!(root instanceof HTMLElement)) return;
  const related = ev.relatedTarget;
  if (related instanceof Node && root.contains(related)) return;
  sidebarDragOverlayVisible.value = false;
}

function onSidebarDrop(ev: DragEvent) {
  ev.preventDefault();
  ev.stopPropagation();
  sidebarDragOverlayVisible.value = false;
  const paths = collectFsPathsFromDataTransfer(ev.dataTransfer);
  if (paths.length === 0) return;
  emit("importDroppedPaths", paths);
}

defineExpose({
  scrollFileListToIndex,
  resetChapterListScroll,
  centerActiveChapterInList,
});
</script>

<template>
  <aside
    class="sidebar"
    data-reader-sidebar-root
    data-drop-zone="reader-sidebar"
    @dragenter="onSidebarDragEnter"
    @dragover="onSidebarDragOver"
    @dragleave="onSidebarDragLeave"
    @drop="onSidebarDrop"
  >
    <nav
      class="activityBar"
      :style="{ width: activityBarWidthPx, flexBasis: activityBarWidthPx }"
      aria-label="侧栏视图切换"
    >
      <div class="activityPrimaryTabs">
        <button
          type="button"
          class="activityTabBtn"
          :class="{ active: panelExpanded && activeTab === 'files' }"
          title="文件"
          aria-label="文件"
          @click="onPrimaryTabClick('files')"
        >
          <span class="activityIcon" v-html="icons.ebook"></span>
        </button>
        <button
          type="button"
          class="activityTabBtn"
          :class="{ active: panelExpanded && activeTab === 'chapters' }"
          title="章节"
          aria-label="章节"
          @click="onPrimaryTabClick('chapters')"
        >
          <span class="activityIcon" v-html="icons.chapterList"></span>
        </button>
        <button
          type="button"
          class="activityTabBtn"
          :class="{ active: panelExpanded && activeTab === 'search' }"
          title="搜索"
          aria-label="搜索"
          @click="onPrimaryTabClick('search')"
        >
          <span class="activityIcon" v-html="icons.find"></span>
        </button>
        <button
          type="button"
          class="activityTabBtn"
          :class="{ active: panelExpanded && activeTab === 'bookmarks' }"
          title="书签"
          aria-label="书签"
          @click="onPrimaryTabClick('bookmarks')"
        >
          <span class="activityIcon" v-html="bookmarkTabIconHtml"></span>
        </button>
        <button
          type="button"
          class="activityTabBtn color"
          :class="{
            active: panelExpanded && activeTab === 'highlights',
            'activityTabBtn--mutedColor': highlightTabIconMuted,
          }"
          title="高亮词"
          aria-label="高亮词"
          @click="onPrimaryTabClick('highlights')"
        >
          <span class="activityIcon" v-html="icons.highlightMark"></span>
        </button>
        <button
          v-if="aiAssistantTabVisible"
          type="button"
          class="activityTabBtn"
          :class="{ active: panelExpanded && activeTab === 'aiAssistant' }"
          title="AI 阅读助手"
          aria-label="AI 阅读助手"
          @click="onPrimaryTabClick('aiAssistant')"
        >
          <span class="activityIcon" v-html="icons.aiChat"></span>
        </button>
        <button
          v-if="characterPortraitTabVisible"
          type="button"
          class="activityTabBtn"
          :class="{ active: panelExpanded && activeTab === 'character' }"
          title="角色卡"
          aria-label="角色卡"
          @click="onPrimaryTabClick('character')"
        >
          <span class="activityIcon" v-html="icons.character"></span>
        </button>
      </div>
      <div class="activityBarSpacer" aria-hidden="true" />
      <div class="activitySecondaryTabs">
        <button
          type="button"
          class="activityTabBtn color"
          title="配色"
          aria-label="配色"
          @click="emit('openColorScheme')"
        >
          <span class="activityIcon" v-html="icons.palette"></span>
        </button>
        <button
          type="button"
          class="activityTabBtn"
          title="设置"
          aria-label="设置"
          @click="emit('openSettings')"
        >
          <span class="activityIcon" v-html="icons.setting"></span>
        </button>
      </div>
    </nav>
    <div v-show="panelExpanded" class="sidebarPanelColumn">
      <div class="sidebarHeader">
        <div class="sidebarHeaderStart">
          <span class="sidebarHeaderTitle">{{ activePanelTitle }}</span>
          <button
            v-if="activeTab === 'chapters' && showEditChapterRefreshButton"
            type="button"
            class="aiReaderSidebarHeaderIconBtn"
            title="刷新章节"
            aria-label="刷新章节"
            @click="emit('refreshChaptersFromReader')"
          >
            <span class="svg" v-html="icons.refresh" />
          </button>
        </div>
        <button
          v-if="activeTab === 'files'"
          class="btn"
          @click="emit('pickDirectory')"
        >
          选择目录
        </button>
        <div v-else-if="activeTab === 'chapters'" class="sidebarCountToggle">
          <span class="sidebarCountToggleLabel">字数</span>
          <SwitchToggle
            size="sm"
            :model-value="showChapterCounts"
            aria-label="章节列表显示字数"
            @update:model-value="emit('update:showChapterCounts', $event)"
          />
        </div>
        <button
          v-else-if="activeTab === 'character'"
          type="button"
          class="btn"
          :disabled="characterPortraitOpenDirDisabled"
          aria-label="打开立绘目录"
          @click="onOpenCharacterPortraitBookDir"
        >
          打开立绘目录
        </button>
        <div v-else-if="activeTab === 'aiAssistant'" class="sidebarHeaderEnd">
          <button
            ref="aiAssistantHeaderMoreBtnRef"
            type="button"
            class="aiReaderSidebarHeaderIconBtn"
            title="更多"
            aria-label="更多"
            aria-haspopup="menu"
            :aria-expanded="aiAssistantHeaderMoreOpen"
            :disabled="aiAssistantHeaderMoreDisabled"
            @click="toggleAiAssistantHeaderMoreMenu"
          >
            <span class="svg" v-html="icons.more" />
          </button>
        </div>
        <div v-else></div>
      </div>
      <ChapterListPanel
        v-show="activeTab === 'chapters'"
        :current-file-path="currentFilePath"
        :chapters-visible="chaptersVisible"
        :sidebar-active-line-number="sidebarActiveLineNumber"
        :show-chapter-counts="showChapterCounts"
        :format-char-count="formatCharCount"
        @jump-to-chapter="onChapterItemClick"
        @close-current-file="emit('closeCurrentFile')"
        @bind-list-ref="bindChapterListRef"
      />
      <FileListPanel
        v-show="activeTab === 'files'"
        :show-fullscreen-sidebar="showFullscreenSidebar"
        :files="fileRowsEnriched"
        :files-filtered="filesFiltered"
        :file-filter-query="fileFilterQuery"
        :current-file-path="currentFilePath"
        :meta-progress-map="metaProgressByPathKey"
        :live-reading-progress-percent="liveReadingProgressPercent"
        :file-category="fileCategory"
        :file-sort="fileSort"
        :file-category-catalog="fileCategoryCatalog"
        @update-file-filter-query="fileFilterQuery = $event"
        @update:file-category="emit('update:fileCategory', $event)"
        @update:file-sort="emit('update:fileSort', $event)"
        @persist-ui="emit('persistUi')"
        @apply-category-catalog="emit('applyCategoryCatalog', $event)"
        @set-files-category="
          (paths, category) => emit('setFilesCategory', paths, category)
        "
        @open-file="(item: SidebarFileItem) => emit('openFile', item)"
        @clear-file-list="emit('clearFileList')"
        @clear-file-list-category="emit('clearFileListCategory', $event)"
        @remove-file-list="emit('removeFileList', $event)"
        @clear-file-meta="emit('clearFileMeta', $event)"
        @rename-file-path="emit('renameFilePath', $event)"
        @open-file-in-new-window="emit('openFileInNewWindow', $event)"
        @import-dropped-paths="emit('importDroppedPaths', $event)"
        @bind-list-ref="bindFileListRef"
        @update:fullscreen-file-list-popovers-open="
          emit('update:fullscreenFileListPopoversOpen', $event)
        "
        @update:file-list-editing="emit('update:fileListEditing', $event)"
      />
      <BookmarkListPanel
        v-show="activeTab === 'bookmarks'"
        :current-file-path="currentFilePath"
        :bookmarks="bookmarksVisible"
        :active-bookmark-line="activeBookmarkLine ?? null"
        @jump-to-bookmark="emit('jumpToBookmark', $event)"
        @clear-bookmarks="emit('clearBookmarks')"
        @edit-bookmark="emit('editBookmark', $event)"
        @remove-bookmark="emit('removeBookmark', $event)"
        @bind-list-ref="bindBookmarkListRef"
      />
      <HighlightListPanel
        v-show="activeTab === 'highlights'"
        :current-file-path="currentFilePath"
        :highlight-terms="highlightTerms"
        :has-inline-search-highlight="hasInlineSearchHighlight"
        :highlight-preview-bg="highlightPreviewBg"
        :monaco-font-family="monacoFontFamily"
        @find-highlight-term="emit('findHighlightTerm', $event)"
        @remove-highlight-term="emit('removeHighlightTerm', $event)"
        @toggle-global-highlight-term="(text, enabled) => emit('toggleGlobalHighlightTerm', text, enabled)"
        @clear-inline-search-highlight="emit('clearInlineSearchHighlight')"
        @clear-highlights="emit('clearHighlights')"
      />
      <div v-show="activeTab === 'aiAssistant'" class="sidebarAiHost">
        <AiAssistantPanel
          ref="aiAssistantPanelRef"
          :session-file-path="currentFilePath"
          :physical-reader-path="physicalReaderPath ?? null"
          :chapters="chapters"
          :active-chapter-idx="activeChapterIdx"
          :reader-main-ref="readerMainRef ?? null"
          :assistant-panel-visible="activeTab === 'aiAssistant'"
          v-model:deep-thinking="deepThinking"
          v-model:spoiler-safe="spoilerSafe"
          :ai-skills-enabled="aiSkillsEnabled"
          :ai-skill-overrides="aiSkillOverrides"
          :ai-custom-skills="aiCustomSkills"
          :ai-config-sync-nonce="aiAssistantConfigSyncNonce"
          @jump-to-chapter="emit('jumpToChapterFromAi', $event)"
          @update:fullscreen-ai-assistant-popovers-open="
            aiAssistantPanelTeleportPopoversOpen = $event
          "
        />
      </div>
      <div v-show="activeTab === 'character'" class="sidebarAiHost">
        <CharacterSidebarPanel
          :session-file-path="currentFilePath"
          :physical-reader-path="physicalReaderPath ?? null"
          :chapters="chapters"
          :active-chapter-idx="activeChapterIdx"
          :reader-main-ref="readerMainRef ?? null"
          :panel-visible="activeTab === 'character'"
          v-model:spoiler-safe="spoilerSafe"
          :character-portrait-cache-dir="characterPortraitCacheDir"
          :character-roster="characterRoster"
          :character-book-style="characterBookStyle"
          @character-file-meta-patch="emit('characterFileMetaPatch', $event)"
          @update:fullscreen-character-drawer-open="
            emit('update:fullscreenCharacterDrawerOpen', $event)
          "
        />
      </div>
      <SearchPanel
        v-show="activeTab === 'search'"
        :active="activeTab === 'search'"
        :current-file-path="currentFilePath"
        :query="searchQuery ?? ''"
        :results="searchResults ?? []"
        :loading="searchInProgress ?? false"
        :match-case="searchMatchCase ?? false"
        :whole-word="searchWholeWord ?? false"
        :use-regex="searchUseRegex ?? false"
        :active-search-result="activeSearchResult ?? null"
        @update:query="emit('update:searchQuery', $event)"
        @update:match-case="emit('update:searchMatchCase', $event)"
        @update:whole-word="emit('update:searchWholeWord', $event)"
        @update:use-regex="emit('update:searchUseRegex', $event)"
        @jump-to-result="emit('jumpToSearchResult', $event)"
      />
    </div>
    <Transition name="sidebarDropOverlay">
      <div
        v-if="sidebarDragOverlayVisible"
        class="sidebarDropOverlay"
        aria-hidden="true"
      >
        <p class="sidebarDropOverlayText">添加文件</p>
      </div>
    </Transition>
    <Teleport to="body">
      <div
        v-if="aiAssistantHeaderMoreOpen"
        ref="aiAssistantHeaderMoreMenuRef"
        class="sidebarAiHeaderMoreMenu appShellMenuPanel"
        data-fullscreen-sidebar-float
        role="menu"
        aria-label="AI 阅读助手更多"
        :style="{
          left: `${aiAssistantHeaderMoreLeft}px`,
          top: `${aiAssistantHeaderMoreTop}px`,
          width: `${AI_ASSISTANT_HEADER_MORE_MENU_W}px`,
        }"
        @click.stop
      >
        <button
          type="button"
          class="appShellMenuItem"
          role="menuitem"
          @click="onAiAssistantHeaderMoreRebuildIndex"
        >
          重建向量索引
        </button>
      </div>
    </Teleport>
  </aside>
</template>

<style scoped>
.sidebar {
  position: relative;
  background: var(--panel);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: row;
  align-items: stretch;
  height: 100%;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
}

.sidebarDropOverlay {
  position: absolute;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 5px;
  background: rgba(0, 0, 0, 0.45);
  pointer-events: none;
}

.sidebarDropOverlayText {
  margin: 0;
  max-width: 100%;
  z-index: 10000;
  padding: 6px 10px;
  border-radius: 4px;
  background-color: var(--bg);
  color: var(--fg);
  font-size: 12px;
  text-align: center;
}

.sidebarDropOverlay-enter-active,
.sidebarDropOverlay-leave-active {
  transition: opacity 0.15s ease;
}

.sidebarDropOverlay-enter-from,
.sidebarDropOverlay-leave-to {
  opacity: 0;
}

.activityBar {
  flex: 0 0 auto;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  background: var(--bg);
  border-right: 1px solid var(--border);
  position: relative;
  /* 高于右侧面板列内绝对定位层（如角色编辑抽屉滑入动画），避免动画过程盖住图标列 */
  z-index: 60;
}

.activityPrimaryTabs {
  display: flex;
  flex-direction: column;
}

.activityBarSpacer {
  flex: 1 1 auto;
  min-height: 0;
}

.activitySecondaryTabs {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
}

.activityTabBtn {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  padding: 0;
  margin: 0;
  border: none;
  border-left: 2px solid transparent;
  border-right: 2px solid transparent;
  background: transparent;
  cursor: pointer;
  color: var(--tab-fg);
}

.activityTabBtn:not(.color) .activityIcon :deep(svg) path {
  fill: currentColor;
}
.activityTabBtn.color {
  opacity: 0.6;
}
.activityTabBtn.color:hover,
.activityTabBtn.color.active {
  opacity: 1;
}
.activityTabBtn--mutedColor .activityIcon :deep(svg) {
  filter: grayscale(1) brightness(1.2);
}

.activityTabBtn:hover {
  color: var(--tab-fg-hover);
  /* background: var(--icon-btn-bg-hover); */
}

.activityTabBtn.active {
  color: var(--tab-fg-active);
  border-left-color: var(--tab-underline);
  /* background: transparent; */
}

.activityIcon {
  line-height: 0;
  display: block;
}

.activityIcon :deep(svg) {
  width: 22px;
  height: 22px;
  display: block;
}

.sidebarPanelColumn {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--panel);
  position: relative;
  z-index: 0;
}

.sidebarAiHost {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  position: relative;
}

.sidebarHeader {
  flex: 0 0 auto;
  background: var(--bg);
  padding: 8px 10px;
  font-size: 12px;
  color: var(--muted);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  height: 44px;
}

.sidebarHeaderTitle {
  font-size: 12px;
  font-weight: 600;
  color: var(--tab-fg-active);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.sidebarHeaderStart {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1;
}

.sidebarHeaderEnd {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
}

/**
 * 与 AiAssistantPanel「新对话」同属 aiActivityLikeBtn 系（透明底、tab 字色、24×24）。
 */
.aiReaderSidebarHeaderIconBtn {
  box-sizing: border-box;
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  margin: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  color: var(--tab-fg);
}

.aiReaderSidebarHeaderIconBtn:hover:not(:disabled) {
  color: var(--tab-fg-hover);
  background: var(--icon-btn-bg-hover);
}

.aiReaderSidebarHeaderIconBtn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.aiReaderSidebarHeaderIconBtn .svg :deep(svg) {
  width: 16px;
  height: 16px;
  display: block;
}

.aiReaderSidebarHeaderIconBtn .svg :deep(svg path) {
  fill: currentColor;
}

.sidebarAiHeaderMoreMenu {
  position: fixed;
  z-index: 7200;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

/** AI 顶栏关闭：与活动栏图标同系，缩至与侧栏标题行高度协调 */
.sidebarHeaderActivityBtn {
  flex-shrink: 0;
  width: 36px !important;
  height: 36px !important;
}

.sidebarHeaderActivityBtn .activityIcon :deep(svg) {
  width: 18px;
  height: 18px;
}

.sidebarCountToggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.sidebarCountToggleLabel {
  font-size: 12px;
  color: var(--tab-fg);
  white-space: nowrap;
}
</style>
