<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import type { Chapter } from "../chapter";
import { useReaderSidebarLists } from "../composables/useReaderSidebarLists";
import type {
  FileCategoryDefinition,
  FileListViewMode,
  FileSortMode,
} from "../constants/fileCategories";
import { SIDEBAR_ACTIVITY_BAR_WIDTH } from "../constants/appUi";
import type { ShortcutBindingMap } from "../services/shortcutRegistry";
import { titleWithShortcut } from "../services/shortcutUtils";
import type { TxtFileItem } from "../services/fileListService";
import type { SidebarFileItem } from "../composables/useReaderSidebarLists";
import type { CategoryEditorRow } from "../constants/fileCategories";
import type { FileMetaRecord } from "../stores/fileMetaStore";
import type {
  CharacterBookStylePersisted,
  CharacterRosterEntry,
} from "@shared/characterTypes";
import AppShellMenuTeleport from "./AppShellMenuTeleport.vue";
import SwitchToggle from "./SwitchToggle.vue";
import { useAnchoredAppShellMenu } from "../composables/useAnchoredAppShellMenu";
import { useHighlightAiSearch } from "../composables/useHighlightAiSearch";
import ChapterListPanel from "./ChapterListPanel.vue";
import FileListPanel from "./FileListPanel.vue";
import BookmarkListPanel from "./BookmarkListPanel.vue";
import HighlightListPanel from "./HighlightListPanel.vue";
import AnnotationListPanel from "./AnnotationListPanel.vue";
import type { HighlightListTerm } from "../utils/highlightWords";
import type {
  AnnotationListChapterGroup,
} from "../utils/readerAnnotations";
import type { ReaderAnnotationRecord } from "../stores/fileMetaStore";
import AiAssistantPanel from "./AiAssistantPanel.vue";
import CharacterSidebarPanel from "./CharacterSidebarPanel.vue";
import SearchPanel from "./SearchPanel.vue";
import type ReaderMain from "./ReaderMain.vue";
import type { AiCustomSkill, AiSkillUserOverride } from "@shared/aiSkills";
import {
  WORDCLOUD_DEFAULT_ANGLE_MODE,
  WORDCLOUD_DEFAULT_FONT_FAMILY,
  type WordcloudAngleMode,
} from "../constants/wordcloudUi";
import {
  WORDCLOUD_DEFAULT_PALETTE_ID,
  type WordcloudPaletteId,
} from "../constants/wordcloudPalettes";
import { icons } from "../icons";
import type { ReaderSidebarTab } from "../constants/readerSidebarTab";
import {
  defaultVoiceReadSettings,
  type VoiceReadSettings,
} from "../constants/voiceRead";
import {
  characterPortraitBookDirAbs,
  sanitizeBookFolderSegment,
} from "@shared/characterPortraitPaths";
import {
  CHARACTER_CARD_TEXTURE_EFFECTS,
  DEFAULT_CHARACTER_CARD_TEXTURE_EFFECT,
  type CharacterCardTextureEffectId,
} from "@shared/characterCardTextureEffects";
import { appAlert } from "../services/appDialog";
import {
  collectFsPathsFromDataTransfer,
  dataTransferLikelyHasExternalFiles,
  DROP_ZONE_CHARACTER_PORTRAIT,
  isDragOverDropZone,
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
    highlightTerms?: HighlightListTerm[];
    annotationGroups?: AnnotationListChapterGroup[];
    searchQuery?: string;
    searchResults?: Array<{
      physicalLine: number;
      displayLine: number;
      text: string;
      range: { start: number; end: number };
      physicalStartColumn: number;
    }>;
    searchInProgress?: boolean;
    searchMatchCase?: boolean;
    searchWholeWord?: boolean;
    searchUseRegex?: boolean;
    activeSearchResult?: { displayLine: number; rangeStart: number } | null;
    hasInlineSearchHighlight?: boolean;
    highlightPreviewBg?: string;
    /** 当前主题下的高亮色列表（侧栏改色色盘） */
    highlightColors?: readonly string[];
    monacoFontFamily?: string;
    lineationColors?: readonly string[];
    bookmarks: Array<{ line: number; note?: string; content: string }>;
    currentFilePath: string | null;
    activeChapterIdx: number;
    activeBookmarkLine?: number | null;
    showChapterCounts: boolean;
    formatCharCount: (n: number) => string;
    /** 与设置「章节最少字数」一致 */
    chapterMinCharCount?: number;
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
    fileListViewMode: FileListViewMode;
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
    /** 角色卡纹理/全息效果（全局，存 colorTxt.ui.settings） */
    characterCardTextureEffect?: CharacterCardTextureEffectId;
    /** 当前文件的侧栏角色列表（来自 file.meta） */
    characterRoster?: readonly CharacterRosterEntry[];
    /** 当前文件本书画风（来自 file.meta） */
    characterBookStyle?: CharacterBookStylePersisted;
    /** 设置「确定」保存 AI 配置后由 App 递增，用于阅读助手刷新快速提问等 */
    aiAssistantConfigSyncNonce?: number;
    /** 全局语音朗读设置（角色卡专属朗读语音） */
    voiceReadSettings?: VoiceReadSettings;
    /** 编辑态章节面板是否显示「刷新章节」（仅手动刷新场景） */
    showEditChapterRefreshButton?: boolean;
    /** 设置已启用 WebDAV 时在活动栏显示同步入口 */
    webDavEnabled?: boolean;
    shortcutBindings?: ShortcutBindingMap;
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
    highlightColors: () => [],
    monacoFontFamily: "",
    lineationColors: () => [],
    readerMainRef: null,
    physicalReaderPath: null,
    aiSkillsEnabled: () => ({}),
    aiSkillOverrides: () => ({}),
    aiCustomSkills: () => [],
    characterPortraitTabVisible: true,
    characterPortraitCacheDir: "",
    characterCardTextureEffect: DEFAULT_CHARACTER_CARD_TEXTURE_EFFECT,
    characterRoster: () => [],
    characterBookStyle: undefined,
    aiAssistantConfigSyncNonce: 0,
    voiceReadSettings: () => ({ ...defaultVoiceReadSettings }),
    showEditChapterRefreshButton: false,
    webDavEnabled: false,
  },
);

const deepThinking = defineModel<boolean>("deepThinking", {
  default: false,
});
const spoilerSafe = defineModel<boolean>("spoilerSafe", {
  default: false,
});
const characterCardTextureEffect = defineModel<CharacterCardTextureEffectId>(
  "characterCardTextureEffect",
  { default: DEFAULT_CHARACTER_CARD_TEXTURE_EFFECT },
);
const wordcloudFontFamily = defineModel<string>("wordcloudFontFamily", {
  default: WORDCLOUD_DEFAULT_FONT_FAMILY,
});
const wordcloudAngleMode = defineModel<WordcloudAngleMode>("wordcloudAngleMode", {
  default: WORDCLOUD_DEFAULT_ANGLE_MODE,
});
const wordcloudPaletteId = defineModel<WordcloudPaletteId>("wordcloudPaletteId", {
  default: WORDCLOUD_DEFAULT_PALETTE_ID,
});

const emit = defineEmits<{
  "update:activeTab": [value: ReaderSidebarTab];
  "update:showChapterCounts": [value: boolean];
  "update:fileCategory": [value: string];
  "update:fileSort": [value: FileSortMode];
  "update:fileListViewMode": [value: FileListViewMode];
  pickDirectory: [];
  /** 文件列表页签：重新扫描已添加文件夹，让新增文件出现在列表 */
  refreshFileList: [];
  importDroppedPaths: [paths: string[]];
  pickFiles: [];
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
  replaceFilePath: [oldPath: string];
  openFileInNewWindow: [path: string];
  closeCurrentFile: [];
  clearBookmarks: [];
  removeBookmarks: [lines: number[]];
  editBookmark: [line: number];
  removeBookmark: [line: number];
  exportBookmarksJson: [];
  importBookmarksJson: [];
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
  "update:fullscreenCharacterPopoversOpen": [open: boolean];
  "update:characterCardTextureEffect": [value: CharacterCardTextureEffectId];
  "update:fileListEditing": [editing: boolean];
  requestExpandPanel: [];
  requestCollapsePanel: [];
  openColorScheme: [];
  openWebDav: [];
  openSettings: [];
  refreshChaptersFromReader: [];
  findHighlightTerm: [payload: { query: string; useRegex: boolean }];
  removeHighlightTerm: [
    payload: { storedTerms: string[]; scope: "global" | "book" },
  ];
  favoriteHighlightTerm: [
    payload: { storedTerms: string[]; colorIndex: number },
  ];
  unfavoriteHighlightTerm: [
    payload: { storedTerms: string[]; colorIndex: number },
  ];
  commitHighlightGroup: [
    payload: {
      mode: "add" | "edit";
      scope: "global" | "book";
      colorIndex: number;
      terms: string[];
      replaceStoredTerms?: string[];
    },
  ];
  mergeHighlightGroups: [
    payload: {
      source: { storedTerms: string[]; scope: "global" | "book" };
      target: {
        storedTerms: string[];
        scope: "global" | "book";
        colorIndex: number;
      };
    },
  ];
  splitHighlightTerm: [
    payload: {
      storedTerms: string[];
      scope: "global" | "book";
      colorIndex: number;
      term: string;
    },
  ];
  clearInlineSearchHighlight: [];
  clearHighlights: [];
  exportBookHighlightsJson: [];
  importBookHighlightsJson: [];
  exportFavoriteHighlightsJson: [];
  importFavoriteHighlightsJson: [];
  jumpToAnnotation: [ann: ReaderAnnotationRecord];
  removeAnnotation: [id: string];
  clearAnnotations: [];
  clearStaleAnnotations: [];
  exportAnnotationsMd: [];
  exportAnnotationsJson: [];
  importAnnotationsJson: [];
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
      physicalStartColumn: number;
    },
  ];
  characterFileMetaPatch: [
    payload: {
      characterBookStyle?: CharacterBookStylePersisted;
      characterRoster?: CharacterRosterEntry[];
    },
  ];
}>();

const chapterListPanelRef = ref<InstanceType<typeof ChapterListPanel> | null>(
  null,
);

const {
  chapterListRef,
  fileListRef,
  fileFilterQuery,
  fileRowsEnriched,
  filesFiltered,
  chaptersVisible,
  bookmarkListRef,
  bookmarksVisible,
  isChapterActive,
  onChapterItemClick,
  scrollFileListToIndex,
  resetChapterListScroll,
  centerActiveChapterInList,
} = useReaderSidebarLists(props, (e, chapter) => emit(e, chapter), {
  resolveDisplayedChapterIndex: () =>
    chapterListPanelRef.value?.displayedIndexOfActive(),
});

const activityBarWidthPx = `${SIDEBAR_ACTIVITY_BAR_WIDTH}px`;

const characterPortraitOpenDirDisabled = computed(() => {
  const sp =
    props.currentFilePath?.trim() || props.physicalReaderPath?.trim() || "";
  return !sp;
});

async function onOpenCharacterPortraitBookDir() {
  closeCharacterMoreMenu();
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

async function onExportCharacterRosterPack() {
  closeCharacterMoreMenu();
  await characterPanelRef.value?.exportCharacterRosterPack();
}

async function onImportCharacterRosterPack() {
  closeCharacterMoreMenu();
  await characterPanelRef.value?.importCharacterRosterPack();
}

/** 侧栏「角色卡」标题行「更多」菜单 */
const CHARACTER_HEADER_MORE_MENU_W = 150;
const CHARACTER_TEXTURE_FLYOUT_MIN_W = 120;
const characterHeaderMoreBtnRef = ref<HTMLButtonElement | null>(null);
const characterTextureSubTriggerRef = ref<HTMLElement | null>(null);
const characterTextureSubOpen = ref(false);
let characterTextureSubCloseTimer: ReturnType<typeof setTimeout> | null = null;
const characterCardZoomOpen = ref(false);

const characterHeaderMoreDisabled = computed(
  () => !props.characterPortraitTabVisible,
);

const characterTextureFlyoutMenu = useAnchoredAppShellMenu({
  open: characterTextureSubOpen,
  anchor: characterTextureSubTriggerRef,
  placement: "beside-right",
  widthPx: CHARACTER_TEXTURE_FLYOUT_MIN_W,
  enableDismiss: false,
  zIndex: 7201,
  panelMaxHeight: 320,
});
const {
  left: characterTextureFlyoutLeft,
  top: characterTextureFlyoutTop,
  panelRef: characterTextureFlyoutPanelRef,
  reposition: repositionCharacterTextureFlyout,
} = characterTextureFlyoutMenu;

const characterMoreMenu = useAnchoredAppShellMenu({
  anchor: characterHeaderMoreBtnRef,
  placement: "below-end",
  widthPx: CHARACTER_HEADER_MORE_MENU_W,
  gap: 6,
  disabled: characterHeaderMoreDisabled,
  excludeCloseWithin: computed(() => [
    characterTextureFlyoutPanelRef.value,
  ]),
  onClose: () => {
    characterTextureSubOpen.value = false;
  },
});
const {
  open: characterHeaderMoreOpen,
  left: characterHeaderMoreLeft,
  top: characterHeaderMoreTop,
  panelRef: characterHeaderMorePanelRef,
  toggleMenu: toggleCharacterHeaderMoreMenu,
  closeMenu: closeCharacterMoreMenu,
} = characterMoreMenu;

watch(
  () => characterHeaderMoreOpen.value || characterCardZoomOpen.value,
  (v) => {
    emit("update:fullscreenCharacterPopoversOpen", v);
  },
  { immediate: true },
);

function clearCharacterTextureSubCloseTimer() {
  if (characterTextureSubCloseTimer) {
    clearTimeout(characterTextureSubCloseTimer);
    characterTextureSubCloseTimer = null;
  }
}

async function openCharacterTextureSub() {
  clearCharacterTextureSubCloseTimer();
  characterTextureSubOpen.value = true;
  await repositionCharacterTextureFlyout();
}

function isNodeWithinCharacterTextureSubHoverZone(node: Node | null) {
  if (!node) return false;
  if (characterTextureSubTriggerRef.value?.contains(node)) return true;
  if (characterTextureFlyoutPanelRef.value?.contains(node)) return true;
  return false;
}

function onCharacterTextureSubTriggerLeave(ev: MouseEvent) {
  const next = ev.relatedTarget as Node | null;
  if (isNodeWithinCharacterTextureSubHoverZone(next)) return;
  scheduleCloseCharacterTextureSub();
}

function onCharacterTextureFlyoutLeave(ev: MouseEvent) {
  const next = ev.relatedTarget as Node | null;
  if (isNodeWithinCharacterTextureSubHoverZone(next)) return;
  scheduleCloseCharacterTextureSub();
}

function scheduleCloseCharacterTextureSub() {
  clearCharacterTextureSubCloseTimer();
  characterTextureSubCloseTimer = setTimeout(() => {
    characterTextureSubOpen.value = false;
    characterTextureSubCloseTimer = null;
  }, 200);
}

function onCharacterTexturePicked(id: CharacterCardTextureEffectId) {
  characterCardTextureEffect.value = id;
  closeCharacterMoreMenu();
}

function bindAiAssistantHeaderMorePanel(el: HTMLElement | null) {
  aiAssistantHeaderMorePanelRef.value = el;
}

function bindCharacterHeaderMorePanel(el: HTMLElement | null) {
  characterHeaderMorePanelRef.value = el;
}

function bindCharacterTextureFlyoutPanel(el: HTMLElement | null) {
  characterTextureFlyoutPanelRef.value = el;
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
    case "notes":
      return "笔记";
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
  requestRebuildSegmentCache: () => Promise<void>;
  requestClearVectorIndexCache: () => Promise<void>;
  requestClearSegmentCache: () => Promise<void>;
  requestClearAiChatHistory: () => Promise<void>;
  reloadUiAfterChatHistoryCleared: () => Promise<void>;
  prefillQuotedText: (text: string) => void;
} | null>(null);
const fileListPanelRef = ref<InstanceType<typeof FileListPanel> | null>(null);
const filesHeaderMoreBtnRef = ref<HTMLButtonElement | null>(null);
const chaptersHeaderMoreBtnRef = ref<HTMLButtonElement | null>(null);
const searchPanelRef = ref<InstanceType<typeof SearchPanel> | null>(null);
const searchHeaderMoreBtnRef = ref<HTMLButtonElement | null>(null);

const annotationPanelRef = ref<InstanceType<typeof AnnotationListPanel> | null>(
  null,
);
const highlightPanelRef = ref<InstanceType<typeof HighlightListPanel> | null>(
  null,
);
const bookmarkPanelRef = ref<InstanceType<typeof BookmarkListPanel> | null>(
  null,
);
const characterPanelRef = ref<InstanceType<
  typeof CharacterSidebarPanel
> | null>(null);
const highlightsHeaderMoreBtnRef = ref<HTMLButtonElement | null>(null);
const highlightsAiSearchBtnRef = ref<HTMLButtonElement | null>(null);
const HIGHLIGHTS_AI_SEARCH_MENU_W = 160;
const highlightsAiSearchDisabled = computed(
  () => !props.aiAssistantTabVisible || !props.currentFilePath?.trim(),
);
const highlightsAiSearchMenu = useAnchoredAppShellMenu({
  anchor: highlightsAiSearchBtnRef,
  placement: "below-center",
  widthPx: HIGHLIGHTS_AI_SEARCH_MENU_W,
  gap: 6,
  disabled: highlightsAiSearchDisabled,
});
const {
  open: highlightsAiSearchOpen,
  left: highlightsAiSearchLeft,
  top: highlightsAiSearchTop,
  panelRef: highlightsAiSearchPanelRef,
  toggleMenu: toggleHighlightsAiSearchMenu,
  closeMenu: closeHighlightsAiSearchMenu,
} = highlightsAiSearchMenu;

function bindHighlightsAiSearchPanel(el: HTMLElement | null) {
  highlightsAiSearchPanelRef.value = el;
}

const highlightAiSearchSessionPath = computed(() => props.currentFilePath);
const highlightAiSearchPhysicalPath = computed(
  () => props.physicalReaderPath ?? props.currentFilePath,
);
const highlightAiSearchChapterCount = computed(() => props.chapters.length);

const { searchPreset: highlightAiSearchPreset, searchCustomSemantic } =
  useHighlightAiSearch({
    sessionFilePath: highlightAiSearchSessionPath,
    physicalReaderPath: highlightAiSearchPhysicalPath,
    chapterCount: highlightAiSearchChapterCount,
    onTerms: (terms) => {
      highlightPanelRef.value?.openAddModal(terms);
    },
  });

async function onHighlightsAiSearchSelect(
  action: "person" | "place" | "custom",
) {
  closeHighlightsAiSearchMenu();
  await nextTick();
  if (action === "person") await highlightAiSearchPreset("人名");
  else if (action === "place") await highlightAiSearchPreset("地名");
  else await searchCustomSemantic();
}

const bookmarksHeaderMoreBtnRef = ref<HTMLButtonElement | null>(null);
const notesHeaderMoreBtnRef = ref<HTMLButtonElement | null>(null);
const aiAssistantHeaderMoreBtnRef = ref<HTMLButtonElement | null>(null);

const aiAssistantPanelTeleportPopoversOpen = ref(false);

const aiAssistantHeaderMoreDisabled = computed(
  () => !props.aiAssistantTabVisible || !props.currentFilePath?.trim(),
);

const aiMoreMenu = useAnchoredAppShellMenu({
  anchor: aiAssistantHeaderMoreBtnRef,
  placement: "below-end",
  widthPx: AI_ASSISTANT_HEADER_MORE_MENU_W,
  gap: 6,
  disabled: aiAssistantHeaderMoreDisabled,
});
const {
  open: aiAssistantHeaderMoreOpen,
  left: aiAssistantHeaderMoreLeft,
  top: aiAssistantHeaderMoreTop,
  panelRef: aiAssistantHeaderMorePanelRef,
  toggleMenu: toggleAiAssistantHeaderMoreMenu,
  closeMenu: closeAiAssistantHeaderMoreMenu,
} = aiMoreMenu;

watch(
  () =>
    aiAssistantPanelTeleportPopoversOpen.value ||
    aiAssistantHeaderMoreOpen.value,
  (v) => {
    emit("update:fullscreenAiAssistantPopoversOpen", v);
  },
  { immediate: true },
);

async function onAiAssistantHeaderMoreRebuildIndex() {
  closeAiAssistantHeaderMoreMenu();
  await nextTick();
  await aiAssistantPanelRef.value?.requestRebuildVectorIndex?.();
}

async function onAiAssistantHeaderMoreRebuildSegment() {
  closeAiAssistantHeaderMoreMenu();
  await nextTick();
  await aiAssistantPanelRef.value?.requestRebuildSegmentCache?.();
}

async function onAiAssistantHeaderMoreClearVectorIndex() {
  closeAiAssistantHeaderMoreMenu();
  await nextTick();
  await aiAssistantPanelRef.value?.requestClearVectorIndexCache?.();
}

async function onAiAssistantHeaderMoreClearSegment() {
  closeAiAssistantHeaderMoreMenu();
  await nextTick();
  await aiAssistantPanelRef.value?.requestClearSegmentCache?.();
}

async function onAiAssistantHeaderMoreClearChatHistory() {
  closeAiAssistantHeaderMoreMenu();
  await nextTick();
  await aiAssistantPanelRef.value?.requestClearAiChatHistory?.();
}

watch(
  () => props.activeTab,
  () => {
    closeAiAssistantHeaderMoreMenu();
    closeCharacterMoreMenu();
  },
);

onBeforeUnmount(() => {
  clearCharacterTextureSubCloseTimer();
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

const isMacPlatform = /mac|iphone|ipad|ipod/i.test(navigator.platform || "");
function activityTabTitle(
  label: string,
  action:
    | "openSidebarSearch"
    | "openSidebarFiles"
    | "openSidebarChapters"
    | "openSidebarAiAssistant"
    | "openColorScheme"
    | "openSettings",
): string {
  const accel = props.shortcutBindings?.[action];
  return accel ? titleWithShortcut(label, accel, isMacPlatform) : label;
}
const filesTabTitle = computed(() =>
  activityTabTitle("文件", "openSidebarFiles"),
);
const chaptersTabTitle = computed(() =>
  activityTabTitle("章节", "openSidebarChapters"),
);
const searchTabTitle = computed(() =>
  activityTabTitle("搜索", "openSidebarSearch"),
);
const aiAssistantTabTitle = computed(() =>
  activityTabTitle("AI 阅读助手", "openSidebarAiAssistant"),
);
const colorSchemeTabTitle = computed(() =>
  activityTabTitle("配色", "openColorScheme"),
);
const settingsTabTitle = computed(() =>
  activityTabTitle("设置", "openSettings"),
);

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

function syncSidebarDragOverlay(ev: DragEvent) {
  const dt = ev.dataTransfer;
  if (!dataTransferLikelyHasExternalFiles(dt)) {
    sidebarDragOverlayVisible.value = false;
    return;
  }
  if (isDragOverDropZone(ev, DROP_ZONE_CHARACTER_PORTRAIT)) {
    sidebarDragOverlayVisible.value = false;
    return;
  }
  sidebarDragOverlayVisible.value = true;
}

function onSidebarDragEnter(ev: DragEvent) {
  ev.preventDefault();
  syncSidebarDragOverlay(ev);
}

function onSidebarDragOver(ev: DragEvent) {
  ev.preventDefault();
  syncSidebarDragOverlay(ev);
  try {
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = "copy";
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
  prefillAiAssistantQuotedText(text: string) {
    aiAssistantPanelRef.value?.prefillQuotedText(text);
  },
  reloadAiAssistantAfterChatHistoryCleared() {
    return aiAssistantPanelRef.value?.reloadUiAfterChatHistoryCleared?.();
  },
  focusSidebarSearchInput() {
    searchPanelRef.value?.focusSearchInput?.();
  },
});
</script>

<template>
  <aside
    class="sidebar"
    data-reader-sidebar-root
    data-drop-zone="reader-sidebar"
    @dragenter.capture="onSidebarDragEnter"
    @dragover.capture="onSidebarDragOver"
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
          :title="filesTabTitle"
          :aria-label="filesTabTitle"
          @click="onPrimaryTabClick('files')"
        >
          <span class="activityIcon" v-html="icons.ebook"></span>
        </button>
        <button
          type="button"
          class="activityTabBtn"
          :class="{ active: panelExpanded && activeTab === 'chapters' }"
          :title="chaptersTabTitle"
          :aria-label="chaptersTabTitle"
          @click="onPrimaryTabClick('chapters')"
        >
          <span class="activityIcon" v-html="icons.chapterList"></span>
        </button>
        <button
          type="button"
          class="activityTabBtn"
          :class="{ active: panelExpanded && activeTab === 'search' }"
          :title="searchTabTitle"
          :aria-label="searchTabTitle"
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
          type="button"
          class="activityTabBtn"
          :class="{ active: panelExpanded && activeTab === 'notes' }"
          title="笔记"
          aria-label="笔记"
          @click="onPrimaryTabClick('notes')"
        >
          <span class="activityIcon" v-html="icons.note"></span>
        </button>
        <button
          v-if="aiAssistantTabVisible"
          type="button"
          class="activityTabBtn"
          :class="{ active: panelExpanded && activeTab === 'aiAssistant' }"
          :title="aiAssistantTabTitle"
          :aria-label="aiAssistantTabTitle"
          @click="onPrimaryTabClick('aiAssistant')"
        >
          <span class="activityIcon" v-html="icons.aiChat"></span>
        </button>
        <button
          v-if="characterPortraitTabVisible"
          type="button"
          class="activityTabBtn activityTabBtn--character"
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
          v-if="webDavEnabled"
          type="button"
          class="activityTabBtn"
          title="WebDAV"
          aria-label="WebDAV"
          @click="emit('openWebDav')"
        >
          <span class="activityIcon" v-html="icons.webDav"></span>
        </button>
        <button
          type="button"
          class="activityTabBtn color"
          :title="colorSchemeTabTitle"
          :aria-label="colorSchemeTabTitle"
          @click="emit('openColorScheme')"
        >
          <span class="activityIcon" v-html="icons.palette"></span>
        </button>
        <button
          type="button"
          class="activityTabBtn"
          :title="settingsTabTitle"
          :aria-label="settingsTabTitle"
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
            v-if="activeTab === 'files'"
            type="button"
            class="aiReaderSidebarHeaderIconBtn"
            :class="{ active: fileListViewMode === 'tree' }"
            :title="
              fileListViewMode === 'tree' ? '切换为列表' : '切换为树状'
            "
            :aria-label="
              fileListViewMode === 'tree' ? '切换为列表' : '切换为树状'
            "
            @click="
              emit(
                'update:fileListViewMode',
                fileListViewMode === 'tree' ? 'list' : 'tree',
              );
              emit('persistUi');
            "
          >
            <span class="svg" v-html="icons.tree" />
          </button>
          <button
            v-if="
              activeTab === 'chapters' &&
              chapterListPanelRef?.hasNestedChapters
            "
            type="button"
            class="aiReaderSidebarHeaderIconBtn"
            :aria-label="
              chapterListPanelRef?.allParentsCollapsed
                ? '全部展开'
                : '全部折叠'
            "
            :title="
              chapterListPanelRef?.allParentsCollapsed
                ? '全部展开'
                : '全部折叠'
            "
            @click="chapterListPanelRef?.toggleExpandAll()"
          >
            <span
              class="svg"
              v-html="
                chapterListPanelRef?.allParentsCollapsed
                  ? icons.allExpand
                  : icons.allCollapse
              "
            />
          </button>
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
        <div v-if="activeTab === 'files'" class="sidebarHeaderEnd">
          <button
            type="button"
            class="aiReaderSidebarHeaderIconBtn"
            title="刷新文件列表"
            aria-label="刷新文件列表"
            @click="emit('refreshFileList')"
          >
            <span class="svg" v-html="icons.refresh" />
          </button>
          <button class="btn" @click="emit('pickDirectory')">选择目录</button>
          <button
            ref="filesHeaderMoreBtnRef"
            type="button"
            class="aiReaderSidebarHeaderIconBtn"
            :class="{ active: fileListPanelRef?.moreOpen }"
            title="更多"
            aria-label="更多"
            aria-haspopup="menu"
            :aria-expanded="!!fileListPanelRef?.moreOpen"
            @click="fileListPanelRef?.openMoreMenu()"
          >
            <span class="svg" v-html="icons.more" />
          </button>
        </div>
        <div v-else-if="activeTab === 'chapters'" class="sidebarHeaderEnd">
          <div class="sidebarCountToggle">
            <span class="sidebarCountToggleLabel">字数</span>
            <SwitchToggle
              size="sm"
              :model-value="showChapterCounts"
              aria-label="章节列表显示字数"
              @update:model-value="emit('update:showChapterCounts', $event)"
            />
          </div>
          <button
            ref="chaptersHeaderMoreBtnRef"
            type="button"
            class="aiReaderSidebarHeaderIconBtn"
            :class="{ active: chapterListPanelRef?.moreOpen }"
            title="更多"
            aria-label="更多"
            aria-haspopup="menu"
            :aria-expanded="!!chapterListPanelRef?.moreOpen"
            @click="chapterListPanelRef?.openMoreMenu()"
          >
            <span class="svg" v-html="icons.more" />
          </button>
        </div>
        <div v-else-if="activeTab === 'bookmarks'" class="sidebarHeaderEnd">
          <button
            ref="bookmarksHeaderMoreBtnRef"
            type="button"
            class="aiReaderSidebarHeaderIconBtn"
            :class="{ active: bookmarkPanelRef?.moreOpen }"
            title="更多"
            aria-label="更多"
            aria-haspopup="menu"
            :aria-expanded="!!bookmarkPanelRef?.moreOpen"
            @click="bookmarkPanelRef?.openMoreMenu()"
          >
            <span class="svg" v-html="icons.more" />
          </button>
        </div>
        <div v-else-if="activeTab === 'character'" class="sidebarHeaderEnd">
          <button
            ref="characterHeaderMoreBtnRef"
            type="button"
            class="aiReaderSidebarHeaderIconBtn"
            :class="{ active: characterHeaderMoreOpen }"
            title="更多"
            aria-label="更多"
            aria-haspopup="menu"
            :aria-expanded="characterHeaderMoreOpen"
            :disabled="characterHeaderMoreDisabled"
            @click="toggleCharacterHeaderMoreMenu"
          >
            <span class="svg" v-html="icons.more" />
          </button>
        </div>
        <div v-else-if="activeTab === 'highlights'" class="sidebarHeaderEnd">
          <button
            v-if="aiAssistantTabVisible"
            ref="highlightsAiSearchBtnRef"
            type="button"
            class="aiReaderSidebarHeaderIconBtn"
            :class="{ active: highlightsAiSearchOpen }"
            title="AI 检索"
            aria-label="AI 检索"
            aria-haspopup="menu"
            :aria-expanded="highlightsAiSearchOpen"
            :disabled="highlightsAiSearchDisabled"
            @click="toggleHighlightsAiSearchMenu"
          >
            <span class="svg" v-html="icons.aiSearch" />
          </button>
          <button
            type="button"
            class="aiReaderSidebarHeaderIconBtn"
            title="添加"
            aria-label="添加"
            :disabled="!currentFilePath"
            @click="highlightPanelRef?.openAddModal()"
          >
            <span class="svg" v-html="icons.newChat" />
          </button>
          <button
            ref="highlightsHeaderMoreBtnRef"
            type="button"
            class="aiReaderSidebarHeaderIconBtn"
            :class="{ active: highlightPanelRef?.moreOpen }"
            title="更多"
            aria-label="更多"
            aria-haspopup="menu"
            :aria-expanded="!!highlightPanelRef?.moreOpen"
            @click="highlightPanelRef?.openMoreMenu()"
          >
            <span class="svg" v-html="icons.more" />
          </button>
        </div>
        <div v-else-if="activeTab === 'notes'" class="sidebarHeaderEnd">
          <button
            ref="notesHeaderMoreBtnRef"
            type="button"
            class="aiReaderSidebarHeaderIconBtn"
            :class="{ active: annotationPanelRef?.moreOpen }"
            title="更多"
            aria-label="更多"
            aria-haspopup="menu"
            :aria-expanded="!!annotationPanelRef?.moreOpen"
            @click="annotationPanelRef?.openMoreMenu()"
          >
            <span class="svg" v-html="icons.more" />
          </button>
        </div>
        <div v-else-if="activeTab === 'aiAssistant'" class="sidebarHeaderEnd">
          <button
            ref="aiAssistantHeaderMoreBtnRef"
            type="button"
            class="aiReaderSidebarHeaderIconBtn"
            :class="{ active: aiAssistantHeaderMoreOpen }"
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
        <div v-else-if="activeTab === 'search'" class="sidebarHeaderEnd">
          <button
            ref="searchHeaderMoreBtnRef"
            type="button"
            class="aiReaderSidebarHeaderIconBtn"
            :class="{ active: searchPanelRef?.moreOpen }"
            title="更多"
            aria-label="更多"
            aria-haspopup="menu"
            :aria-expanded="!!searchPanelRef?.moreOpen"
            @click="searchPanelRef?.openMoreMenu()"
          >
            <span class="svg" v-html="icons.more" />
          </button>
        </div>
        <div v-else></div>
      </div>
      <ChapterListPanel
        ref="chapterListPanelRef"
        v-show="activeTab === 'chapters'"
        :current-file-path="currentFilePath"
        :chapters-visible="chaptersVisible"
        :is-chapter-active="isChapterActive"
        :show-chapter-counts="showChapterCounts"
        :format-char-count="formatCharCount"
        :menu-anchor-el="chaptersHeaderMoreBtnRef"
        @jump-to-chapter="onChapterItemClick"
        @close-current-file="emit('closeCurrentFile')"
        @bind-list-ref="bindChapterListRef"
      />
      <FileListPanel
        ref="fileListPanelRef"
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
        :file-list-view-mode="fileListViewMode"
        :file-category-catalog="fileCategoryCatalog"
        :should-center-file-list="shouldCenterFileList"
        :panel-visible="activeTab === 'files'"
        :menu-anchor-el="filesHeaderMoreBtnRef"
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
        @replace-file-path="emit('replaceFilePath', $event)"
        @open-file-in-new-window="emit('openFileInNewWindow', $event)"
        @import-dropped-paths="emit('importDroppedPaths', $event)"
        @pick-files="emit('pickFiles')"
        @bind-list-ref="bindFileListRef"
        @update:fullscreen-file-list-popovers-open="
          emit('update:fullscreenFileListPopoversOpen', $event)
        "
        @update:file-list-editing="emit('update:fileListEditing', $event)"
      />
      <BookmarkListPanel
        ref="bookmarkPanelRef"
        v-show="activeTab === 'bookmarks'"
        :current-file-path="currentFilePath"
        :bookmarks="bookmarksVisible"
        :active-bookmark-line="activeBookmarkLine ?? null"
        :menu-anchor-el="bookmarksHeaderMoreBtnRef"
        @jump-to-bookmark="emit('jumpToBookmark', $event)"
        @clear-bookmarks="emit('clearBookmarks')"
        @edit-bookmark="emit('editBookmark', $event)"
        @remove-bookmark="emit('removeBookmark', $event)"
        @export-bookmarks-json="emit('exportBookmarksJson')"
        @import-bookmarks-json="emit('importBookmarksJson')"
        @bind-list-ref="bindBookmarkListRef"
      />
      <HighlightListPanel
        ref="highlightPanelRef"
        v-show="activeTab === 'highlights'"
        :current-file-path="currentFilePath"
        :highlight-terms="highlightTerms"
        :has-inline-search-highlight="hasInlineSearchHighlight"
        :highlight-preview-bg="highlightPreviewBg"
        :highlight-colors="highlightColors"
        :monaco-font-family="monacoFontFamily"
        :menu-anchor-el="highlightsHeaderMoreBtnRef"
        @find-highlight-term="emit('findHighlightTerm', $event)"
        @remove-highlight-term="emit('removeHighlightTerm', $event)"
        @favorite-highlight-term="emit('favoriteHighlightTerm', $event)"
        @unfavorite-highlight-term="emit('unfavoriteHighlightTerm', $event)"
        @commit-highlight-group="emit('commitHighlightGroup', $event)"
        @merge-highlight-groups="emit('mergeHighlightGroups', $event)"
        @split-highlight-term="emit('splitHighlightTerm', $event)"
        @clear-inline-search-highlight="emit('clearInlineSearchHighlight')"
        @clear-highlights="emit('clearHighlights')"
        @export-book-highlights-json="emit('exportBookHighlightsJson')"
        @import-book-highlights-json="emit('importBookHighlightsJson')"
        @export-favorite-highlights-json="emit('exportFavoriteHighlightsJson')"
        @import-favorite-highlights-json="emit('importFavoriteHighlightsJson')"
      />
      <AnnotationListPanel
        ref="annotationPanelRef"
        v-show="activeTab === 'notes'"
        :current-file-path="currentFilePath"
        :groups="annotationGroups ?? []"
        :menu-anchor-el="notesHeaderMoreBtnRef"
        :monaco-font-family="monacoFontFamily"
        :lineation-colors="lineationColors"
        @jump-to-annotation="emit('jumpToAnnotation', $event)"
        @remove-annotation="emit('removeAnnotation', $event)"
        @clear-annotations="emit('clearAnnotations')"
        @clear-stale-annotations="emit('clearStaleAnnotations')"
        @export-annotations-md="emit('exportAnnotationsMd')"
        @export-annotations-json="emit('exportAnnotationsJson')"
        @import-annotations-json="emit('importAnnotationsJson')"
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
          v-model:wordcloud-font-family="wordcloudFontFamily"
          v-model:wordcloud-angle-mode="wordcloudAngleMode"
          v-model:wordcloud-palette-id="wordcloudPaletteId"
          @jump-to-chapter="emit('jumpToChapterFromAi', $event)"
          @update:fullscreen-ai-assistant-popovers-open="
            aiAssistantPanelTeleportPopoversOpen = $event
          "
        />
      </div>
      <div v-show="activeTab === 'character'" class="sidebarAiHost">
        <CharacterSidebarPanel
          ref="characterPanelRef"
          :session-file-path="currentFilePath"
          :physical-reader-path="physicalReaderPath ?? null"
          :chapters="chapters"
          :active-chapter-idx="activeChapterIdx"
          :reader-main-ref="readerMainRef ?? null"
          :panel-visible="activeTab === 'character'"
          v-model:spoiler-safe="spoilerSafe"
          :character-portrait-cache-dir="characterPortraitCacheDir"
          :character-card-texture-effect="characterCardTextureEffect"
          :character-roster="characterRoster"
          :character-book-style="characterBookStyle"
          :ai-config-sync-nonce="aiAssistantConfigSyncNonce"
          :voice-read-settings="voiceReadSettings"
          @character-file-meta-patch="emit('characterFileMetaPatch', $event)"
          @update:fullscreen-character-drawer-open="
            emit('update:fullscreenCharacterDrawerOpen', $event)
          "
          @update:fullscreen-character-card-zoom-open="
            characterCardZoomOpen = $event
          "
        />
      </div>
      <SearchPanel
        ref="searchPanelRef"
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
        :menu-anchor-el="searchHeaderMoreBtnRef"
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
    <AppShellMenuTeleport
      v-model:open="highlightsAiSearchOpen"
      :left="highlightsAiSearchLeft"
      :top="highlightsAiSearchTop"
      :width="HIGHLIGHTS_AI_SEARCH_MENU_W"
      caret="center"
      :on-panel-mount="bindHighlightsAiSearchPanel"
      aria-label="AI 检索"
    >
      <button
        type="button"
        class="appShellMenuItem"
        role="menuitem"
        @click="onHighlightsAiSearchSelect('person')"
      >
        <span class="appShellMenuLabel">AI 检索：人名</span>
      </button>
      <button
        type="button"
        class="appShellMenuItem"
        role="menuitem"
        @click="onHighlightsAiSearchSelect('place')"
      >
        <span class="appShellMenuLabel">AI 检索：地名</span>
      </button>
      <div class="appShellMenuDivider" role="separator" />
      <button
        type="button"
        class="appShellMenuItem"
        role="menuitem"
        @click="onHighlightsAiSearchSelect('custom')"
      >
        <span class="appShellMenuLabel">AI 检索：自定义语义</span>
      </button>
    </AppShellMenuTeleport>
    <AppShellMenuTeleport
      v-model:open="aiAssistantHeaderMoreOpen"
      :left="aiAssistantHeaderMoreLeft"
      :top="aiAssistantHeaderMoreTop"
      :width="AI_ASSISTANT_HEADER_MORE_MENU_W"
      caret="end"
      :on-panel-mount="bindAiAssistantHeaderMorePanel"
      aria-label="AI 阅读助手更多"
    >
      <button
        type="button"
        class="appShellMenuItem"
        role="menuitem"
        @click="onAiAssistantHeaderMoreRebuildIndex"
      >
        重建向量索引
      </button>
      <button
        type="button"
        class="appShellMenuItem"
        role="menuitem"
        @click="onAiAssistantHeaderMoreRebuildSegment"
      >
        重建词云分词
      </button>
      <div class="appShellMenuDivider" role="separator" />
      <button
        type="button"
        class="appShellMenuItem appShellMenuItem--warning"
        role="menuitem"
        @click="onAiAssistantHeaderMoreClearVectorIndex"
      >
        清除向量索引缓存
      </button>
      <button
        type="button"
        class="appShellMenuItem appShellMenuItem--warning"
        role="menuitem"
        @click="onAiAssistantHeaderMoreClearSegment"
      >
        清除词云分词缓存
      </button>
      <button
        type="button"
        class="appShellMenuItem appShellMenuItem--danger"
        role="menuitem"
        @click="onAiAssistantHeaderMoreClearChatHistory"
      >
        清除对话记录
      </button>
    </AppShellMenuTeleport>
    <AppShellMenuTeleport
      v-model:open="characterHeaderMoreOpen"
      :left="characterHeaderMoreLeft"
      :top="characterHeaderMoreTop"
      :width="CHARACTER_HEADER_MORE_MENU_W"
      caret="end"
      :on-panel-mount="bindCharacterHeaderMorePanel"
      aria-label="角色卡更多"
    >
      <div
        ref="characterTextureSubTriggerRef"
        class="appShellMenuSubWrap"
        @mouseenter="openCharacterTextureSub"
        @mouseleave="onCharacterTextureSubTriggerLeave"
      >
        <button
          type="button"
          class="appShellMenuItem"
          role="menuitem"
          aria-haspopup="menu"
          :aria-expanded="characterTextureSubOpen"
        >
          <span class="appShellMenuIconSlot" v-html="icons.effect" />
          <span class="appShellMenuLabel">卡片效果</span>
          <span class="appShellMenuSubChevron">›</span>
        </button>
      </div>
      <div class="appShellMenuDivider" role="separator" />
      <button
        type="button"
        class="appShellMenuItem"
        role="menuitem"
        :disabled="characterPortraitOpenDirDisabled"
        @click="onOpenCharacterPortraitBookDir"
      >
        <span class="appShellMenuIconSlot" v-html="icons.folderOpen" />
        <span class="appShellMenuLabel">打开立绘目录</span>
      </button>
      <div class="appShellMenuDivider" role="separator" />
      <button
        type="button"
        class="appShellMenuItem"
        role="menuitem"
        :disabled="characterPortraitOpenDirDisabled"
        @click="onExportCharacterRosterPack"
      >
        <span class="appShellMenuIconSlot" v-html="icons.export" />
        <span class="appShellMenuLabel">导出角色卡包</span>
      </button>
      <button
        type="button"
        class="appShellMenuItem"
        role="menuitem"
        :disabled="characterPortraitOpenDirDisabled"
        @click="onImportCharacterRosterPack"
      >
        <span class="appShellMenuIconSlot" v-html="icons.import" />
        <span class="appShellMenuLabel">导入角色卡包</span>
      </button>
    </AppShellMenuTeleport>
    <AppShellMenuTeleport
      v-if="characterHeaderMoreOpen"
      v-model:open="characterTextureSubOpen"
      :left="characterTextureFlyoutLeft"
      :top="characterTextureFlyoutTop"
      :z-index="7201"
      :min-width="CHARACTER_TEXTURE_FLYOUT_MIN_W"
      :max-height="320"
      :on-panel-mount="bindCharacterTextureFlyoutPanel"
      aria-label="卡片效果"
      @mouseenter="openCharacterTextureSub"
      @mouseleave="onCharacterTextureFlyoutLeave"
    >
      <div class="appShellMenuFlyoutList">
        <template
          v-for="opt in CHARACTER_CARD_TEXTURE_EFFECTS"
          :key="opt.id"
        >
          <div
            v-if="opt.dividerBefore"
            class="appShellMenuFlyoutDivider"
            role="separator"
          />
          <button
            type="button"
            class="appShellMenuFlyoutItem"
            :class="{ 'is-active': characterCardTextureEffect === opt.id }"
            role="menuitemradio"
            :aria-checked="characterCardTextureEffect === opt.id"
            @click="onCharacterTexturePicked(opt.id)"
          >
            <span class="appShellMenuFlyoutLabel">{{ opt.labelZh }}</span>
          </button>
          <div
            v-if="opt.id === 'off'"
            class="appShellMenuFlyoutDivider"
            role="separator"
          />
        </template>
      </div>
    </AppShellMenuTeleport>
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

.activityTabBtn:not(.color) .activityIcon :deep(svg path) {
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
  filter: grayscale(1);
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

.activityTabBtn--character .activityIcon :deep(svg circle) {
  stroke: currentColor;
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
  gap: 6px;
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

.aiReaderSidebarHeaderIconBtn:hover:not(:disabled),
.aiReaderSidebarHeaderIconBtn.active:not(:disabled) {
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
