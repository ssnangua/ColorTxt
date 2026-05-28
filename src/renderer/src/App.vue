<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  provide,
  ref,
  useTemplateRef,
  watch,
} from "vue";
import { nextTick, type ComponentPublicInstance } from "vue";
import { getChapterMatchRules, type Chapter } from "./chapter";
import AppHeader, { type RecentFileItem } from "./components/AppHeader.vue";
import VoiceReadToolbar from "./components/VoiceReadToolbar.vue";
import ReaderSidebar from "./components/ReaderSidebar.vue";
import AppFooter from "./components/AppFooter.vue";
import ReaderMain from "./components/ReaderMain.vue";
import AppDialogHost from "./components/AppDialogHost.vue";
import AppToastHost from "./components/AppToastHost.vue";
import AppOverlays from "./components/AppOverlays.vue";
import type { SettingsApplyPayload } from "./components/SettingsPanel.vue";
import type { AiCustomSkill, AiSkillUserOverride } from "@shared/aiSkills";
import type { ColorTxtShowMessageBoxOptions } from "@shared/colorTxtShowMessageBox";
import type {
  CharacterBookStylePersisted,
  CharacterRosterEntry,
} from "@shared/characterTypes";
import {
  mergeAiCustomSkills,
  mergeAiSkillOverrides,
  mergeAiSkillsEnabled,
} from "@shared/aiSkills";
import { bookmarkNoteInputRefKey } from "./injectionKeys";
import type { ReaderSidebarTab } from "./constants/readerSidebarTab";
import {
  resolveInitialReaderSidebarTab,
  type InitialWindowLoadIntent,
} from "./reader/initialSidebarTab";
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
import { useAppSyncCurrentFileWatch } from "./composables/useAppSyncCurrentFileWatch";
import { useAppWindowBindings } from "./composables/useAppWindowBindings";
import { useAiChapterPlainTextBridge } from "./composables/useAiChapterPlainTextBridge";
import { isMarkdownFilePath } from "./ebook/ebookFormat";
import { useAppVoiceRead } from "./composables/useAppVoiceRead";
import { useTxtStreamPipeline } from "./composables/useTxtStreamPipeline";
import { fileHistoryKey } from "./stores/recentHistoryStore";
import {
  assignHighlightTermToColorForFile,
  fileNameKey,
  findFileMetaRecord,
  removeHighlightTermFromFile,
  upsertFileMetaRecord,
  type FileMetaRecord,
} from "./stores/fileMetaStore";
import {
  applyReaderSurfaceToDocument,
  defaultCompressBlankKeepOneBlank,
  defaultCompressBlankLines,
  defaultChapterMinCharCount,
  defaultFullscreenReaderWidthPercent,
  defaultLeadIndentFullWidth,
  defaultMonacoAdvancedWrapping,
  defaultMonacoCustomHighlight,
  defaultMonacoSmoothScrolling,
  defaultReaderEditShowLineNumbers,
  defaultReaderEditMinimap,
  defaultEditAutoRefreshChapterList,
  editAutoRefreshChapterListMaxLines,
  defaultReaderIdleHint,
  defaultReaderOpenHint,
  defaultReaderFontSize,
  defaultReaderLineHeightMultiple,
  defaultReaderPaletteDark,
  defaultReaderPaletteLight,
  defaultReaderTheme,
  defaultRecentFilesHistoryLimit,
  mergeReaderSurfacePalette,
  overridesFromFullPalette,
  defaultRestoreSessionOnStartup,
  defaultSyncCurrentFile,
  defaultTxtrDelimitedMatchCrossLine,
  defaultShowChapterCounts,
  defaultShowSidebar,
  emptyFileHintText,
  readerTxtLoadingHintText,
  GITHUB_REPO_URL,
  APP_DISPLAY_NAME,
  maxFullscreenReaderWidthPercent,
  clampLineHeightMultipleForFontSize,
  maxFontSize,
  maxChapterMinCharCount,
  maxLineHeightMultipleForFontSize,
  maxRecentFilesHistoryLimit,
  minFullscreenReaderWidthPercent,
  minFontSize,
  minChapterMinCharCount,
  minLineHeightMultiple,
  SIDEBAR_ACTIVITY_BAR_WIDTH,
  type ReaderSurfacePalette,
} from "./constants/appUi";
import { mergeVoiceReadSettings, type VoiceReadSettings } from "./constants/voiceRead";
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
import { appAlert } from "./services/appDialog";
import { appToast } from "./services/appToast";
import { mergeShortcutBindings } from "./services/shortcutUtils";
import {
  syncTxtFilesCategoriesAfterCatalogEdit,
  normalizeTxtFileItem,
  type TxtFileItem,
} from "./services/fileListService";
import {
  cloneDefaultFileCategoryCatalog,
  DEFAULT_FILE_SORT,
  FILE_CATEGORY_FILTER_ALL,
  FILE_CATEGORY_FILTER_UNCATEGORIZED,
  type CategoryEditorRow,
  type FileCategoryDefinition,
  type FileSortMode,
} from "./constants/fileCategories";

const readerRef = ref<InstanceType<typeof ReaderMain> | null>(null);
/** 全屏侧栏文件列表 Teleport 弹层（分类/筛选下拉、右键菜单等） */
const fullscreenFileListPopoversOpen = ref(false);
/** AI 阅读助手：历史/导出/模型菜单等 Teleport；与文件列表合并后交给全屏侧栏收起逻辑 */
const fullscreenAiAssistantPopoversOpen = ref(false);
/** 角色卡：编辑/添加角色抽屉打开 */
const fullscreenCharacterDrawerOpen = ref(false);
const fullscreenSidebarPopoversSuppressCollapse = computed(
  () =>
    fullscreenFileListPopoversOpen.value ||
    fullscreenAiAssistantPopoversOpen.value ||
    fullscreenCharacterDrawerOpen.value,
);
/** 全屏下打开设置/配色弹框期间，禁用左缘感应自动唤起侧栏 */
const suppressFullscreenSidebarHover = ref(false);
const chrome = useAppReaderChrome({
  readerRef,
  fullscreenSidebarPopoversSuppressCollapse,
  suppressFullscreenSidebarHover,
});
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
  recordFullscreenPointer,
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
watch(
  () => [showSettingsPanel.value, showColorSchemePanel.value] as const,
  ([settingsOpen, colorOpen]) => {
    suppressFullscreenSidebarHover.value = settingsOpen || colorOpen;
  },
  { immediate: true },
);
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
/** 拖入阅读区时显示局部「打开文件」蒙层（由 useAppWindowBindings 驱动） */
const readerDropOverlayVisible = ref(false);
const fileEncoding = ref<string>("-");
const currentFileSize = ref<number | null>(null);
const totalCharCount = ref(0);
const totalLineCount = ref(0);

const chapters = ref<Chapter[]>([]);
const activeChapterIdx = ref<number>(-1);

useAiChapterPlainTextBridge(readerRef, chapters);
const showChapterCounts = ref(defaultShowChapterCounts);
/** AI 阅读助手工具栏：深度思考 / 防剧透（持久化至 colorTxt.ui.settings） */
const aiAssistantDeepThinking = ref(false);
const aiAssistantSpoilerSafe = ref(false);
const voiceReadSettings = ref<VoiceReadSettings>(
  mergeVoiceReadSettings(undefined),
);
const initialWindowLoadIntent: InitialWindowLoadIntent =
  typeof window !== "undefined" && window.colorTxt?.getInitialWindowLoadIntent
    ? window.colorTxt.getInitialWindowLoadIntent()
    : { shouldRestoreSession: false, hasPendingOpenTxt: false };
const sidebarTab = ref<ReaderSidebarTab>(
  resolveInitialReaderSidebarTab(initialWindowLoadIntent),
);
/** 设置 → AI「启用 AI 阅读助手功能」，控制侧栏「AI 阅读助手」 */
const aiFeaturesEnabled = ref(true);
/** AI 开启且文生图开启时显示「角色卡」标签 */
const txt2imgFeatureEnabled = ref(true);
/** 设置「确定」保存后递增，供 AI 阅读助手重新拉取快速提问等配置 */
const aiAssistantConfigSyncNonce = ref(0);

async function refreshAiSidebarFlags() {
  try {
    const c = await window.colorTxt.ai.configGet();
    aiFeaturesEnabled.value = Boolean(c.aiEnabled);
    txt2imgFeatureEnabled.value =
      aiFeaturesEnabled.value && Boolean(c.txt2img?.enabled);
  } catch {
    aiFeaturesEnabled.value = true;
    txt2imgFeatureEnabled.value = true;
  }
}

onMounted(() => {
  /** 旧版侧栏曾含扩展视图 tab（`ext:`）或设置「扩展」占位 id */
  const t = sidebarTab.value as string;
  if (t === "extensions" || t.startsWith("ext:")) {
    sidebarTab.value = "files";
  }
  void refreshAiSidebarFlags();
});

watch(showSettingsPanel, (open, wasOpen) => {
  if (wasOpen && !open) void refreshAiSidebarFlags();
});

watch(aiFeaturesEnabled, (en) => {
  if (
    !en &&
    (sidebarTab.value === "aiAssistant" || sidebarTab.value === "character")
  ) {
    sidebarTab.value = "files";
  }
});

watch(txt2imgFeatureEnabled, (en) => {
  if (!en && sidebarTab.value === "character") sidebarTab.value = "files";
});
type SidebarSearchResult = {
  physicalLine: number;
  displayLine: number;
  text: string;
  /** 该行内单次匹配（同一行多次匹配各占一条结果） */
  range: { start: number; end: number };
};

function isSameSidebarSearchResult(
  item: SidebarSearchResult,
  active: { physicalLine: number; rangeStart: number },
): boolean {
  return (
    item.physicalLine === active.physicalLine &&
    item.range.start === active.rangeStart
  );
}
const searchQuery = ref("");
const searchResults = ref<SidebarSearchResult[]>([]);
const searchInProgress = ref(false);
const activeSearchResult = ref<{
  physicalLine: number;
  rangeStart: number;
} | null>(null);
const hasInlineSearchHighlight = ref(false);
const searchMatchCase = ref(false);
const searchWholeWord = ref(false);
const searchUseRegex = ref(false);
const SEARCH_RESULT_LIMIT = 20000;
const SEARCH_DEBOUNCE_MS = 180;
const CHAPTER_REFRESH_DEBOUNCE_MS = 400;
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let searchRunToken = 0;
const txtFiles = ref<TxtFileItem[]>([]);
const fileCategory = ref<string>(FILE_CATEGORY_FILTER_ALL);
const fileSort = ref<FileSortMode>(DEFAULT_FILE_SORT);
const fileCategoryCatalog = ref<FileCategoryDefinition[]>(
  cloneDefaultFileCategoryCatalog(),
);
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
/** 流式读盘期间底栏显示字节进度；行/字数在格式化完成后才有 */
const showReaderBusyHint = computed(
  () => loading.value && Boolean(currentFile.value),
);
const readerBusyHintText = computed(() => readerTxtLoadingHintText);
/** 已打开文件且流式加载完成、正文行数与字数均为 0 时居中提示（仅只读；编辑模式不遮挡空白编辑区） */
/** 字数 0 即视为无内容（Monaco 空模型仍可能计 1 行，勿与行数强绑定） */
const showReaderEmptyHint = computed(
  () =>
    Boolean(currentFile.value) &&
    !loading.value &&
    !readerEditMode.value &&
    totalCharCount.value === 0,
);
/** 非全屏：侧栏壳（含活动栏）始终占位；全屏：仅浮动展开时显示整块 */
const sidebarShellVisible = computed(
  () => !isFullscreenView.value || showFullscreenSidebar.value,
);
/** 非全屏且收起面板时仅活动栏宽度；其余与 `sidebarWidthForLayout` 一致 */
const sidebarPaneLayoutWidth = computed(() => {
  if (isFullscreenView.value) return sidebarWidthForLayout.value;
  if (!showSidebar.value) return SIDEBAR_ACTIVITY_BAR_WIDTH;
  return sidebarWidthForLayout.value;
});
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
/** 磁盘上当前正文变更后是否自动重新加载（设置项） */
const syncCurrentFile = ref(defaultSyncCurrentFile);
/** 最近打开文件条数上限，0 表示不记录 */
const recentFilesHistoryLimit = ref(defaultRecentFilesHistoryLimit);
/** 小于该字数的章节不纳入章节列表与导航 */
const chapterMinCharCount = ref(defaultChapterMinCharCount);
/** Monaco wrappingStrategy：advanced 换行更优、更重 */
const monacoAdvancedWrapping = ref(defaultMonacoAdvancedWrapping);
/** Monaco 阅读区平滑滚动（设置可关） */
const monacoSmoothScrolling = ref(defaultMonacoSmoothScrolling);
const readerEditShowLineNumbers = ref(defaultReaderEditShowLineNumbers);
const readerEditMinimap = ref(defaultReaderEditMinimap);
const editAutoRefreshChapterList = ref(defaultEditAutoRefreshChapterList);
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
/** 角色立绘缓存根目录（绝对路径）；启动后由持久化或默认 userData/CharacterPortrait 填充 */
const characterPortraitCacheDir = ref("");
/** 技能开关（设置 → 技能） */
const aiSkillsEnabled = ref<Record<string, boolean>>(
  mergeAiSkillsEnabled(undefined, []),
);
const aiSkillOverrides = ref<Record<string, AiSkillUserOverride>>({});
const aiCustomSkills = ref<AiCustomSkill[]>([]);
/** 电子书转换阶段（底栏显示「转换中…」） */
const ebookParsing = ref(false);
/** 转换进行中的电子书原路径（底栏路径；早于 currentFile 更新） */
const ebookConversionSourcePath = ref<string | null>(null);

const readerPaletteOverridesLight = ref<Partial<ReaderSurfacePalette>>({});
const readerPaletteOverridesDark = ref<Partial<ReaderSurfacePalette>>({});

const highlightColorsLight = ref<string[]>([...DEFAULT_HIGHLIGHT_COLORS_LIGHT]);
const highlightColorsDark = ref<string[]>([...DEFAULT_HIGHLIGHT_COLORS_DARK]);
const globalHighlightWords = ref<Record<string, string[]>>({});

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

const currentFileMetaRecord = computed(() => {
  const p = currentFile.value;
  if (!p) return undefined;
  return findFileMetaRecord(fileMetaRecords.value, p);
});

const currentFileCharacterRoster = computed(
  () => currentFileMetaRecord.value?.characterRoster ?? [],
);

const currentFileCharacterBookStyle = computed(
  () => currentFileMetaRecord.value?.characterBookStyle,
);

const currentFileHighlightWords = computed(
  () => currentFileMetaRecord.value?.highlightWordsByIndex,
);

function onCharacterFileMetaPatch(payload: {
  characterBookStyle?: CharacterBookStylePersisted;
  characterRoster?: CharacterRosterEntry[];
}) {
  const path = currentFile.value;
  if (!path) return;
  fileMetaRecords.value = upsertFileMetaRecord(
    fileMetaRecords.value,
    path,
    () => ({
      ...(payload.characterBookStyle !== undefined
        ? { characterBookStyle: payload.characterBookStyle }
        : {}),
      ...(payload.characterRoster !== undefined
        ? { characterRoster: payload.characterRoster }
        : {}),
    }),
  );
  persistFileMeta();
}

const currentFileHighlightTerms = computed<
  Array<{ text: string; color: string; colorIndex: number; isGlobal: boolean }>
>(() => {
  const fileGroups = currentFileHighlightWords.value;
  const colors = highlightColorsForReader.value;
  const bodyText =
    currentTheme.value === "vs"
      ? readerSurfaceLight.value.bodyText
      : readerSurfaceDark.value.bodyText;

  // 合并：全局高亮词优先，文件级高亮词作为补充（去重）
  const seen = new Set<string>();
  const out: Array<{ text: string; color: string; colorIndex: number; isGlobal: boolean }> = [];

  // 1. 全局高亮词优先（始终显示）
  for (const [idxKey, terms] of Object.entries(globalHighlightWords.value)) {
    const idx = Number.parseInt(idxKey, 10);
    if (!Number.isFinite(idx) || idx < 0) continue;
    const color = idx < colors.length ? colors[idx] : bodyText;
    for (const text of terms) {
      if (!text || seen.has(text)) continue;
      seen.add(text);
      out.push({ text, color, colorIndex: idx, isGlobal: true });
    }
  }

  // 2. 文件级高亮词（补充未在全局词中出现的）
  if (fileGroups) {
    for (const [idxKey, terms] of Object.entries(fileGroups)) {
      const idx = Number.parseInt(idxKey, 10);
      if (!Number.isFinite(idx) || idx < 0) continue;
      const color = idx < colors.length ? colors[idx] : bodyText;
      for (const text of terms) {
        if (!text || seen.has(text)) continue;
        seen.add(text);
        out.push({ text, color, colorIndex: idx, isGlobal: false });
      }
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
/** 只读↔编辑：在切换模式前采集的视口第二行高锚点 */
const pendingReaderEditRestoreAnchor = ref<
  import("./reader/readerViewportAnchor").ReaderViewportRestoreAnchor | null
>(null);
/** 编辑→只读：流式加载结束后按视口锚点恢复（与压缩空行切换一致） */
const pendingRestoreViewportAnchor = ref<
  import("./reader/readerViewportAnchor").ReaderViewportRestoreAnchor | null
>(null);
/** 与主进程 file:stream 的 requestId 对齐；resetSession 时清空，避免重复打开同一文件时旧 chunk 串入 */
const activeStreamRequestId = ref<number | null>(null);
const activeStreamFilePath = ref<string | null>(null);
/** 底栏路径与「在文件夹中显示」：电子书打开时为转换后的 `{原名}.txt` 路径 */
const physicalReaderPath = ref<string | null>(null);
const currentFileIsMarkdown = computed(() => {
  const p = physicalReaderPath.value ?? currentFile.value;
  return p ? isMarkdownFilePath(p) : false;
});
/** 当前文件是否已完成加载与阅读位置同步；无打开文件时为 true，打开/重置会话后为 false，流结束并完成滚动后为 true */
const readingProgressSynced = ref(true);

const readerEditMode = ref(false);
const readerEditorDirty = ref(false);
const readerSaveEncoding = ref("utf8");

const footerEncodingActionsEnabled = computed(
  () =>
    Boolean(
      physicalReaderPath.value &&
        currentFile.value &&
        !loading.value &&
        !ebookParsing.value &&
        typeof window.colorTxt?.writeTextFile === "function",
    ),
);

/** 底栏路径菜单条目可用性（条目仍展示不可用时置灰） */
const footerPathMenuRevealEnabled = computed(
  () =>
    Boolean(
      physicalReaderPath.value ??
        currentFile.value ??
        ebookConversionSourcePath.value,
    ),
);
const footerPathMenuReloadEnabled = computed(
  () =>
    Boolean(currentFile.value && !loading.value && !ebookParsing.value),
);
const footerPathMenuCloseEnabled = computed(() =>
  Boolean(currentFile.value),
);

/** 主进程 `iconv.encode` 使用的编码名 */
function normalizeIpcEncoding(raw: string): string {
  const u = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (!u || u === "utf-8" || u === "utf8") return "utf8";
  if (u === "gb2312") return "gb2312";
  return raw.trim() || "utf8";
}

function encodingLabelForFooter(ipcEncoding: string): string {
  const n = normalizeIpcEncoding(ipcEncoding);
  if (n === "utf8") return "UTF-8";
  if (n === "gb2312") return "GB2312";
  return ipcEncoding.trim().toUpperCase() || "-";
}

/** 写入磁盘：编辑模式用 Monaco 全文；只读且开压缩空行/行首缩进时用流管道物理行原文 */
function textForReaderDiskSave(): string {
  if (readerEditMode.value) {
    return readerRef.value?.getAllText() ?? "";
  }
  if (compressBlankLines.value || leadIndentFullWidth.value) {
    return stream.getPhysicalFilePlainText();
  }
  return readerRef.value?.getAllText() ?? "";
}

async function saveReaderBufferWithIpcEncoding(
  ipcEncoding: string,
): Promise<boolean> {
  const normalized = normalizeIpcEncoding(ipcEncoding);
  const p = physicalReaderPath.value;
  if (!p || !window.colorTxt?.writeTextFile) return false;
  const text = textForReaderDiskSave();
  const r = await window.colorTxt.writeTextFile(p, text, normalized);
  if (!r.ok) {
    void appAlert(r.message ?? "保存失败");
    return false;
  }
  readerSaveEncoding.value = normalized;
  fileEncoding.value = encodingLabelForFooter(normalized);
  readerRef.value?.markReaderEditSaved?.();
  readerEditorDirty.value = false;
  return true;
}

/** 切书、关文件、编辑↔只读、关窗、退出应用等场景共用 */
const readerEditDiscardUnsavedMessageBox: ColorTxtShowMessageBoxOptions = {
  type: "warning",
  title: "修改未保存",
  buttons: ["取消", "确定"],
  defaultId: 0,
  cancelId: 0,
  message: "当前文件已修改但尚未保存，确定要放弃这些改动吗？",
  noLink: true,
};

async function confirmReaderEditDiscardUnsaved(): Promise<boolean> {
  if (!window.colorTxt?.showMessageBox) return false;
  const r = await window.colorTxt.showMessageBox(
    readerEditDiscardUnsavedMessageBox,
  );
  return r.response === 1;
}

async function confirmIfReaderEditDiscard(): Promise<boolean> {
  if (!readerEditMode.value || !readerEditorDirty.value) return true;
  return confirmReaderEditDiscardUnsaved();
}

let afterStreamFullTextInstalled: () => void | Promise<void> = async () => {};

const stream = useTxtStreamPipeline({
  readerRef,
  totalCharCount,
  totalLineCount,
  readerEditMode,
  compressBlankLines,
  compressBlankKeepOneBlank,
  leadIndentFullWidth,
  chapterMinCharCount,
  currentFileIsMarkdown,
  afterFullTextInstalled: () => afterStreamFullTextInstalled(),
});

/** 程序化刷新章节表期间禁止侧栏 watch 抢跑滚动（会与 centerActiveChapterInList 竞态） */
const suppressChapterListAutoScroll = ref(false);

function captureViewportAnchorPhysicalLine(): number {
  const endLine = Math.max(
    1,
    Math.floor(
      readerRef.value?.getViewportEndLine?.() ?? viewportEndLine.value,
    ),
  );
  return stream.viewportDisplayLineToPhysicalLine(endLine);
}

function captureViewportRestoreAnchor() {
  return readerRef.value?.captureViewportRestoreAnchor?.() ?? null;
}

async function withChapterListScrollSuppressed<T>(
  fn: () => Promise<T> | T,
): Promise<T> {
  suppressChapterListAutoScroll.value = true;
  try {
    return await fn();
  } finally {
    suppressChapterListAutoScroll.value = false;
  }
}

/** 侧栏文件列表是否处于编辑模式；编辑中不写文件列表缓存，退出时再落盘 */
const fileListEditing = ref(false);

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
  chapterMinCharCount,
  monacoAdvancedWrapping,
  monacoSmoothScrolling,
  readerEditShowLineNumbers,
  readerEditMinimap,
  editAutoRefreshChapterList,
  fullscreenReaderWidthPercent,
  fileMetaRecords,
  shortcutBindings,
  defaultShortcutBindings,
  readerPaletteOverridesLight,
  readerPaletteOverridesDark,
  highlightColorsLight,
  highlightColorsDark,
  globalHighlightWords,
  ebookConvertOutputDir,
  characterPortraitCacheDir,
  fileCategory,
  fileSort,
  fileCategoryCatalog,
  fileListEditing,
  syncCurrentFile,
  aiSkillsEnabled,
  aiSkillOverrides,
  aiCustomSkills,
  aiAssistantDeepThinking,
  aiAssistantSpoilerSafe,
  voiceReadSettings,
});
const {
  persistSettings,
  clearRecentFiles,
  persistWindowUnloadState,
  persistFileListCache,
  persistFileMeta,
  persistRecentFiles,
  touchRecentFile,
  upsertBookmark,
  removeBookmark,
  clearBookmarks,
  initPersistenceBootstrap,
  applyRecentFilesHistoryLimitFromSettings,
  clearPersistedSession,
  metaProgressByPathKey,
} = persistence;

watch(fileListEditing, (editing, wasEditing) => {
  if (wasEditing === true && editing === false) {
    persistFileListCache();
  }
});

watch(aiAssistantDeepThinking, () => persistSettings());
watch(aiAssistantSpoilerSafe, () => persistSettings());
watch(globalHighlightWords, () => persistSettings(), { deep: true });
watch(
  voiceReadSettings,
  () => persistSettings(),
  { deep: true },
);

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

function onPersistUi() {
  persistSettings();
}

function onSetFilesCategory(paths: string[], category: string) {
  const set = new Set(paths);
  const cat = category.trim() ? category.trim() : undefined;
  const list = txtFiles.value;
  for (let i = 0; i < list.length; i++) {
    const f = list[i]!;
    if (!set.has(f.path)) continue;
    if (cat) {
      if (f.category === cat) continue;
      /** 原地改 `category`，保持对象引用，减少分配且仍能触发深度响应更新 */
      f.category = cat;
    } else {
      if (f.category === undefined) continue;
      delete f.category;
    }
  }
  if (!fileListEditing.value) {
    persistFileListCache();
  }
}

/** 侧栏筛选为具体分类时，新加入列表的文件自动归入该分类 */
function applyCurrentFileCategoryToNewPaths(paths: string[]) {
  const fc = fileCategory.value;
  if (
    fc === FILE_CATEGORY_FILTER_ALL ||
    fc === FILE_CATEGORY_FILTER_UNCATEGORIZED ||
    paths.length === 0
  ) {
    return;
  }
  onSetFilesCategory(paths, fc);
}

function onApplyCategoryCatalog(payload: {
  initial: CategoryEditorRow[];
  draft: CategoryEditorRow[];
  catalog: FileCategoryDefinition[];
}) {
  txtFiles.value = syncTxtFilesCategoriesAfterCatalogEdit(
    txtFiles.value,
    payload.initial,
    payload.draft,
  );
  fileCategoryCatalog.value = payload.catalog.map((c) => ({ ...c }));
  const fc = fileCategory.value;
  if (
    fc !== FILE_CATEGORY_FILTER_ALL &&
    fc !== FILE_CATEGORY_FILTER_UNCATEGORIZED &&
    !payload.catalog.some((c) => c.name === fc)
  ) {
    fileCategory.value = FILE_CATEGORY_FILTER_ALL;
  }
  if (!fileListEditing.value) {
    persistFileListCache();
  }
  persistSettings();
}

function replaceFileBaseName(filePath: string, newBaseName: string): string {
  const idx = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  if (idx < 0) return newBaseName;
  return `${filePath.slice(0, idx + 1)}${newBaseName}`;
}

async function onRenameFilePath(payload: { oldPath: string; newName: string }) {
  const oldPath = payload.oldPath.trim();
  const newName = payload.newName.trim();
  if (!oldPath || !newName) return;
  const targetPath = replaceFileBaseName(oldPath, newName);
  if (fileHistoryKey(targetPath) === fileHistoryKey(oldPath)) return;
  const result = await window.colorTxt.renamePath(oldPath, targetPath);
  if (!result.ok) {
    await appAlert(`重命名失败：${result.message}`);
    return;
  }

  const nextPath = result.path;
  const oldKey = fileHistoryKey(oldPath);
  const nextKey = fileHistoryKey(nextPath);
  txtFiles.value = txtFiles.value.map((f) => {
    if (fileHistoryKey(f.path) !== oldKey) return f;
    return normalizeTxtFileItem({
      ...f,
      path: nextPath,
      size: result.size,
    });
  });

  recentFiles.value = recentFiles.value.map((item) =>
    fileHistoryKey(item.path) === oldKey ? { ...item, path: nextPath } : item,
  );

  // file.meta 迁移：优先按旧路径精确匹配；若不存在再按旧文件名兜底（仅唯一候选时迁移，避免同名串数据）。
  let prevMeta = fileMetaRecords.value.find(
    (m) => fileHistoryKey(m.path) === oldKey,
  );
  if (!prevMeta) {
    const oldNameKey = fileNameKey(oldPath);
    const fallbackCandidates = fileMetaRecords.value.filter(
      (m) => m.fileName === oldNameKey,
    );
    if (fallbackCandidates.length === 1) {
      prevMeta = fallbackCandidates[0];
    }
  }
  if (prevMeta) {
    const prevMetaKey = fileHistoryKey(prevMeta.path);
    const migrated: FileMetaRecord = {
      ...prevMeta,
      path: nextPath,
      fileName: fileNameKey(nextPath),
      updatedAt: Date.now(),
    };
    fileMetaRecords.value = [
      migrated,
      ...fileMetaRecords.value.filter((m) => {
        const k = fileHistoryKey(m.path);
        if (k === prevMetaKey) return false;
        if (k === oldKey) return false;
        if (k === nextKey) return false;
        return true;
      }),
    ];
  }

  // 进度映射 key 基于 path，重命名后需迁移，否则 UI 可能仍引用旧路径进度。
  if (metaProgressByPathKey.value.has(oldKey)) {
    const m = new Map(metaProgressByPathKey.value);
    const v = m.get(oldKey);
    m.delete(oldKey);
    if (typeof v === "number") m.set(nextKey, v);
    metaProgressByPathKey.value = m;
  }

  if (currentFile.value && fileHistoryKey(currentFile.value) === oldKey) {
    currentFile.value = nextPath;
  }
  if (
    physicalReaderPath.value &&
    fileHistoryKey(physicalReaderPath.value) === oldKey
  ) {
    physicalReaderPath.value = nextPath;
  }
  if (
    activeStreamFilePath.value &&
    fileHistoryKey(activeStreamFilePath.value) === oldKey
  ) {
    activeStreamFilePath.value = nextPath;
  }

  persistFileListCache();
  persistRecentFiles();
  // 落盘时机保持原有策略：走现有防抖 + 门控；窗口卸载仍会兜底立即落盘。
  persistFileMeta();
}

function onOpenFileInNewWindow(path: string) {
  if (!path.trim()) return;
  window.colorTxt.openFileInNewWindow(path);
}

function onClearFileMeta(path: string) {
  const key = fileHistoryKey(path);
  const next = fileMetaRecords.value.filter(
    (m) => fileHistoryKey(m.path) !== key,
  );
  if (next.length === fileMetaRecords.value.length) return;
  fileMetaRecords.value = next;
  if (metaProgressByPathKey.value.has(key)) {
    const m = new Map(metaProgressByPathKey.value);
    m.delete(key);
    metaProgressByPathKey.value = m;
  }
  persistFileMeta();
}

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
  addBookmarkDialogPreview,
  onPinClick,
  ensurePinBeforeRevealFindWidget,
  onGoBackFromPin,
  onBookmarkClick,
  confirmAddBookmark,
  updateEditingBookmarkToCurrentViewportLine,
  confirmRemoveActiveBookmark,
  jumpToBookmark,
  clearCurrentFileBookmarks,
  removeCurrentFileBookmarks,
  onEditBookmark,
  onRemoveBookmark,
} = useAppBookmarkPins({
  readerRef,
  stream,
  readerEditMode,
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
  chapters,
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
  pendingRestoreViewportAnchor,
  recentFiles,
  restoreSessionOnStartup,
  activeStreamRequestId,
  activeStreamFilePath,
  physicalReaderPath,
  readingProgressSynced,
  ebookConvertOutputDir,
  ebookParsing,
  ebookConversionSourcePath,
  applyCurrentFileCategoryIfConcrete: applyCurrentFileCategoryToNewPaths,
  readerEditMode,
  readerEditorDirty,
  confirmIfReaderEditDiscard,
});

const {
  clearFileList,
  clearFileListForCategory,
  removeFileList,
  closeCurrentFile,
  openFileViaDialog,
  openFileFromSidebar,
  pickTxtDirectory,
  importPathsIntoFileList,
  openFilePath,
  openRecentFileFromHistory,
} = fileSession;

useAppSyncCurrentFileWatch({
  syncCurrentFile,
  physicalReaderPath,
  currentFile,
  loading,
  readingProgressSynced,
  ebookParsing,
  readerEditMode,
  stream,
  viewportEndLine,
  openFilePath,
});

async function onImportDroppedPathsFromList(paths: string[]) {
  readerDropOverlayVisible.value = false;
  await importPathsIntoFileList(paths);
}

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
  currentFileIsMarkdown,
  readerEditMode,
  readingProgressSynced,
  stream,
  touchRecentFile,
  chapterListScrollSmooth,
  chapterRuleState,
  chapterMinCharCount,
  chapterRuleErrorText,
  showChapterRulePanel,
  sidebarTab,
  persistSettings,
});

afterStreamFullTextInstalled = async () => {
  if (currentFileIsMarkdown.value && !readerEditMode.value) {
    readerRef.value?.expandMarkdownImagesInModel?.(physicalReaderPath.value);
  }
  const imgAnchors = await readerRef.value?.applyEmbeddedImageAnchors(
    physicalReaderPath.value,
  );
  readerRef.value?.applyEbookInternalLinkMarkers?.();
  if (
    imgAnchors?.deletedOriginalLineNumbersDesc?.length &&
    compressBlankLines.value
  ) {
    stream.removeFilteredDisplayLinesAtOriginalIndices(
      imgAnchors.deletedOriginalLineNumbersDesc,
    );
  }
  stream.resyncMirrorFromReader();
};

/** 视口已按物理行恢复且 probe 已更新后：重算章节并居中侧栏（加载结束等） */
async function syncChaptersAfterViewportSettled() {
  try {
    chapterNav.refreshChapterListFromReader();
    await nextTick();
    await readerSidebarRef.value?.centerActiveChapterInList?.(false);
  } finally {
    // 退出编辑后 openFilePath 会保持 suppress 直至流式加载结束；此处解除以恢复滚动换章居中
    suppressChapterListAutoScroll.value = false;
  }
}

const {
  jumpToChapter,
  jumpToPrevChapter,
  jumpToNextChapter,
  onProbeLineChange,
  applyChapterMatchRules,
} = chapterNav;

const {
  mode: voiceReadMode,
  isSynthesizing: voiceReadSynthesizing,
  toolbarRate: voiceReadToolbarRate,
  toolbarPitch: voiceReadToolbarPitch,
  canStartVoiceRead: canVoiceRead,
  isVoiceReadActive,
  isVoiceReadScrollLocked,
  isVoiceReadBlocksFind,
  isVoiceReadHeaderLocked,
  toggleVoiceReadToolbar,
  togglePlayPause: voiceReadTogglePlayPause,
  restartFromViewportTopAfterNavigation: voiceReadRestartFromViewportTop,
  exitVoiceRead,
  playPrevLine: voiceReadPlayPrevLine,
  playNextLine: voiceReadPlayNextLine,
  regenerateCurrentLine: voiceReadRegenerateCurrentLine,
  canPlayPrevLine: voiceReadCanPlayPrevLine,
  canPlayNextLine: voiceReadCanPlayNextLine,
} = useAppVoiceRead({
  readerRef,
  voiceReadSettings,
  currentFile,
  loading,
  readerEditMode,
  monacoSmoothScrolling,
});

function scheduleVoiceReadResumeAfterJump() {
  if (voiceReadMode.value !== "playing") return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      voiceReadRestartFromViewportTop();
    });
  });
}

function onJumpToChapterFromSidebar(ch: Chapter) {
  jumpToChapter(ch);
  scheduleVoiceReadResumeAfterJump();
}

function jumpToBookmarkWithVoiceRead(line: number) {
  jumpToBookmark(line);
  scheduleVoiceReadResumeAfterJump();
}

function jumpToPrevChapterWithVoiceRead() {
  jumpToPrevChapter();
  scheduleVoiceReadResumeAfterJump();
}

function jumpToNextChapterWithVoiceRead() {
  jumpToNextChapter();
  scheduleVoiceReadResumeAfterJump();
}

const canEnterReaderEditMode = computed(
  () =>
    Boolean(currentFile.value) &&
    !loading.value &&
    readingProgressSynced.value &&
    !ebookParsing.value,
);

/** 编辑态侧栏是否显示「刷新章节」（自动刷新不可用或已关闭时需手动刷新） */
const showEditChapterRefreshButton = computed(
  () =>
    readerEditMode.value &&
    (!editAutoRefreshChapterList.value ||
      totalLineCount.value > editAutoRefreshChapterListMaxLines),
);

function applyChaptersFromReaderPlainText() {
  if (!readerEditMode.value) return;
  chapterNav.refreshChapterListFromReader();
}

async function onToggleReaderEdit() {
  if (readerEditMode.value) {
    if (readerEditorDirty.value) {
      if (!(await confirmReaderEditDiscardUnsaved())) return;
    }
    readerEditorDirty.value = false;
    const path = currentFile.value;
    if (!path) {
      readerEditMode.value = false;
      return;
    }
    const exitAnchor = readerRef.value?.captureViewportRestoreAnchor?.() ?? {
      physicalLine: Math.max(
        1,
        Math.floor(
          readerRef.value?.getViewportEndLine?.() ?? viewportEndLine.value,
        ),
      ),
      wrappedLineIndex: 0,
    };
    suppressChapterListAutoScroll.value = true;
    readerEditMode.value = false;
    const opened = await openFilePath(path, {
      restoreViewportAnchor: exitAnchor,
      skipRememberCurrent: true,
      keepSidebarTab: true,
      skipReaderEditGuard: true,
    });
    if (!opened) {
      suppressChapterListAutoScroll.value = false;
    }
    // 成功时保持 suppress，待流式加载结束 syncChapters 后解除
  } else {
    if (!canEnterReaderEditMode.value) {
      appToast("请等待当前文件加载完成后再进入编辑模式。");
      return;
    }
    pendingReaderEditRestoreAnchor.value =
      captureViewportRestoreAnchor() ?? {
        physicalLine: captureViewportAnchorPhysicalLine(),
        wrappedLineIndex: 0,
      };
    suppressChapterListAutoScroll.value = true;
    readerEditMode.value = true;
  }
}

async function onSaveReaderFile() {
  void (await saveReaderBufferWithIpcEncoding(readerSaveEncoding.value));
}

async function runEditFormatWithChapterSync(
  format: () => Promise<boolean | undefined> | boolean | undefined,
) {
  if (!readerEditMode.value) return;
  await withChapterListScrollSuppressed(async () => {
    const changed = await format();
    if (changed) await syncChaptersAfterViewportSettled();
  });
}

function onFormatEditCompressBlankLines() {
  void runEditFormatWithChapterSync(() =>
    readerRef.value?.applyEditFormatCompressBlankLines?.(
      compressBlankKeepOneBlank.value,
    ),
  );
}

function onFormatEditLeadIndentFullWidth() {
  void runEditFormatWithChapterSync(() =>
    readerRef.value?.applyEditFormatLeadIndentFullWidth?.(),
  );
}

async function onFooterSaveFileAsEncoding(codec: "utf8" | "gb2312") {
  void (await saveReaderBufferWithIpcEncoding(codec));
}

function onReaderEditLoaded(payload: { encoding: string }) {
  readerSaveEncoding.value = normalizeIpcEncoding(
    (payload.encoding || "utf8").trim() || "utf8",
  );
  pendingReaderEditRestoreAnchor.value = null;
  stream.resyncMirrorFromReader();
  if (searchQuery.value.trim()) {
    scheduleSidebarSearch();
  }
  try {
    chapterNav.refreshChapterListFromReader();
  } finally {
    suppressChapterListAutoScroll.value = false;
  }
}

let chapterRefreshDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function clearChapterRefreshDebounce() {
  if (chapterRefreshDebounceTimer) {
    clearTimeout(chapterRefreshDebounceTimer);
    chapterRefreshDebounceTimer = null;
  }
}

function scheduleChapterListRefreshFromEdit() {
  clearChapterRefreshDebounce();
  if (!readerEditMode.value) return;
  if (!editAutoRefreshChapterList.value) return;
  if (totalLineCount.value > editAutoRefreshChapterListMaxLines) return;

  chapterRefreshDebounceTimer = setTimeout(() => {
    chapterRefreshDebounceTimer = null;
    if (!readerEditMode.value) return;
    if (!editAutoRefreshChapterList.value) return;
    if (totalLineCount.value > editAutoRefreshChapterListMaxLines) return;
    void withChapterListScrollSuppressed(async () => {
      chapterNav.refreshChapterListFromReader();
    });
  }, CHAPTER_REFRESH_DEBOUNCE_MS);
}

function onReaderEditContentChange() {
  stream.resyncMirrorFromReader();
  scheduleChapterListRefreshFromEdit();
  if (readerEditMode.value && searchQuery.value.trim()) {
    scheduleSidebarSearch();
  }
}

function onReaderEditLoadFailed() {
  pendingReaderEditRestoreAnchor.value = null;
  suppressChapterListAutoScroll.value = false;
  readerEditMode.value = false;
}

function onReaderEditDirtyChange(dirty: boolean) {
  readerEditorDirty.value = dirty;
}

async function handleWindowCloseRequest() {
  if (readerEditMode.value && readerEditorDirty.value) {
    if (!(await confirmReaderEditDiscardUnsaved())) return;
  }
  window.colorTxt.proceedCloseWindow();
}

/** AI 助手跳转章节：未激活书钉时先记住当前滚动位置（与查找打开前一致），再跳转 */
function jumpToChapterFromAiAssistant(ch: Chapter) {
  ensurePinBeforeRevealFindWidget();
  jumpToChapter(ch);
  scheduleVoiceReadResumeAfterJump();
}

const readerUi = useAppReaderUiPrefs({
  readerRef,
  readerFontSize,
  readerLineHeightMultiple,
  monacoFontFamily,
  monacoCustomHighlight,
  monacoAdvancedWrapping,
  compressBlankLines,
  leadIndentFullWidth,
  withChapterListScrollSuppressed,
  currentFile,
  stream,
  syncChaptersAfterViewportSettled,
  persistSettings,
  isFullscreenView,
  showFullscreenHeader,
  viewportTopLine,
  viewportEndLine,
  viewportVisualProgressPercent,
  viewportAtBottom,
  isVoiceReadBlocksFind,
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
    await appAlert(globalResult.message || "系统级快捷键设置失败");
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

/** 底栏路径菜单：重新自磁盘载入当前会话文件 */
async function reloadCurrentFileFromDisk() {
  const path = currentFile.value;
  if (!path) return;
  await openFilePath(path, { keepSidebarTab: true });
}

function quitApp() {
  void (async () => {
    if (readerEditMode.value && readerEditorDirty.value) {
      if (!(await confirmReaderEditDiscardUnsaved())) return;
    }
    window.colorTxt.quitApp();
  })();
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

  const term = payload.text;

  // 先检查是否是全局词，如果是则从全局删除
  let foundInGlobal = false;
  for (const [idxKey, terms] of Object.entries(globalHighlightWords.value)) {
    if (terms.includes(term)) {
      foundInGlobal = true;
      const idx = Number.parseInt(idxKey, 10);
      if (Number.isFinite(idx) && idx >= 0) {
        const nextWords = terms.filter((w) => w !== term);
        const newGlobal = { ...globalHighlightWords.value };
        if (nextWords.length > 0) {
          newGlobal[idxKey] = nextWords;
        } else {
          // 数组为空则删除该键，避免留下空数组
          delete newGlobal[idxKey];
        }
        globalHighlightWords.value = newGlobal;
      }
    }
  }

  // 额外清理：移除所有空数组（可能是之前操作遗留的）
  if (foundInGlobal) {
    const newGlobal = { ...globalHighlightWords.value };
    for (const [idxKey, terms] of Object.entries(newGlobal)) {
      if (terms.length === 0) {
        delete newGlobal[idxKey];
      }
    }
    globalHighlightWords.value = newGlobal;
  }

  // 如果不在全局列表，则从文件级高亮词中删除
  if (!foundInGlobal) {
    fileMetaRecords.value = removeHighlightTermFromFile(
      fileMetaRecords.value,
      path,
      term,
    );
    persistFileMeta();
  } else {
    // 全局词已从 globalHighlightWords 删除，触发持久化
    persistSettings();
  }
}

/** 切换单个高亮词的全局状态（开关） */
function onToggleGlobalHighlightTerm([text, enabled]: [string, boolean]) {
  const term = text.trim();
  if (!term) return;
  const path = currentFile.value;
  if (!path) return;

  if (!enabled) {
    // 关闭：从全局词列表移除该词，添加回文件级高亮词
    // 1. 从全局删除
    const newGlobal = { ...globalHighlightWords.value };
    let foundIdx: number | null = null;
    for (const [idxKey, terms] of Object.entries(newGlobal)) {
      if (terms.includes(term)) {
        foundIdx = Number.parseInt(idxKey, 10);
        const nextWords = terms.filter((w) => w !== term);
        if (nextWords.length > 0) {
          newGlobal[idxKey] = nextWords;
        } else {
          delete newGlobal[idxKey];
        }
      }
    }
    globalHighlightWords.value = newGlobal;

    // 2. 添加回文件级
    if (foundIdx !== null && Number.isFinite(foundIdx) && foundIdx >= 0) {
      fileMetaRecords.value = upsertFileMetaRecord(
        fileMetaRecords.value,
        path,
        (record) => {
          let words = { ...(record?.highlightWordsByIndex ?? {}) };
          const idxKey = String(foundIdx);
          const existing = words[idxKey] ?? [];
          if (!existing.includes(term)) {
            words = { ...words, [idxKey]: [...existing, term] };
          }
          return { highlightWordsByIndex: words };
        },
      );
    }
    persistFileMeta();
    persistSettings();
    return;
  }

  // 开启：从文件级高亮词移除该词，添加到全局高亮词
  const groups = currentFileHighlightWords.value;
  let foundColorIndex: number | null = null;

  // 1. 从文件级找到色值索引
  if (groups) {
    for (const [idxKey, terms] of Object.entries(groups)) {
      const idx = Number.parseInt(idxKey, 10);
      if (!Number.isFinite(idx) || idx < 0) continue;
      if (terms.includes(term)) {
        foundColorIndex = idx;
        break;
      }
    }
  }

  if (foundColorIndex === null) return; // 文件级没有这个词，无法移动
  const idxKey = String(foundColorIndex);

  // 2. 从文件级删除该词
  fileMetaRecords.value = upsertFileMetaRecord(
    fileMetaRecords.value,
    path,
    (record) => {
      let words = { ...(record?.highlightWordsByIndex ?? {}) };
      const existing = words[idxKey] ?? [];
      const nextWords = existing.filter((w) => w !== term);
      if (nextWords.length > 0) {
        words = { ...words, [idxKey]: nextWords };
      } else {
        delete words[idxKey];
      }
      return { highlightWordsByIndex: words };
    },
  );
  persistFileMeta();

  // 3. 添加到全局词
  const existingWords = globalHighlightWords.value[idxKey] ?? [];
  if (existingWords.includes(term)) return; // 已经是全局词
  const nextWords = [...existingWords, term];
  globalHighlightWords.value = {
    ...globalHighlightWords.value,
    [idxKey]: nextWords,
  };
  persistSettings();
}

async function clearCurrentFileHighlightTerms() {
  const path = currentFile.value;
  if (!path) return;
  const r = await window.colorTxt.showMessageBox({
    type: "warning",
    title: APP_DISPLAY_NAME,
    buttons: ["取消", "清空"],
    defaultId: 1,
    cancelId: 0,
    message: "是否要清空当前文件的所有高亮词？",
    detail: "此操作不可逆！",
    noLink: true,
  });
  if (r.response !== 1) return;
  fileMetaRecords.value = upsertFileMetaRecord(
    fileMetaRecords.value,
    path,
    () => ({ highlightWordsByIndex: undefined }),
  );
  persistFileMeta();
}

function onFindHighlightTermFromSidebar(text: string) {
  if (!currentFile.value || loading.value || totalLineCount.value <= 0) return;
  ensurePinBeforeRevealFindWidget();
  const found = readerRef.value?.jumpToNextInlineSearchMatch?.(text, {
    caseSensitive: false,
    wholeWord: false,
    useRegex: false,
    smooth: true,
  });
  hasInlineSearchHighlight.value = found === true;
  scheduleVoiceReadResumeAfterJump();
}

function clearReaderInlineSearchHighlight() {
  readerRef.value?.clearInlineSearchState?.();
  hasInlineSearchHighlight.value = false;
}

function clearSidebarSearchState() {
  searchQuery.value = "";
  searchResults.value = [];
  searchInProgress.value = false;
  activeSearchResult.value = null;
  searchRunToken += 1;
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = null;
  }
  readerRef.value?.clearInlineSearchState?.();
  hasInlineSearchHighlight.value = false;
}

function isWordChar(ch: string): boolean {
  return /[0-9A-Za-z_]/.test(ch);
}

function isWholeWordBoundary(
  text: string,
  start: number,
  end: number,
): boolean {
  const before = start > 0 ? text[start - 1] : "";
  const after = end < text.length ? text[end] : "";
  const leftOk = before === "" || !isWordChar(before);
  const rightOk = after === "" || !isWordChar(after);
  return leftOk && rightOk;
}

function collectPlainRanges(
  text: string,
  query: string,
  caseSensitive: boolean,
  wholeWord: boolean,
): Array<{ start: number; end: number }> {
  const source = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();
  const out: Array<{ start: number; end: number }> = [];
  if (!needle) return out;
  let from = 0;
  while (from < source.length) {
    const idx = source.indexOf(needle, from);
    if (idx < 0) break;
    const end = idx + needle.length;
    if (!wholeWord || isWholeWordBoundary(text, idx, end)) {
      out.push({ start: idx, end });
    }
    from = end;
  }
  return out;
}

function collectRegexRanges(
  text: string,
  query: string,
  caseSensitive: boolean,
  wholeWord: boolean,
): Array<{ start: number; end: number }> | null {
  const flags = caseSensitive ? "g" : "gi";
  let reg: RegExp;
  try {
    reg = new RegExp(query, flags);
  } catch {
    return null;
  }
  const out: Array<{ start: number; end: number }> = [];
  let match: RegExpExecArray | null = null;
  while ((match = reg.exec(text)) != null) {
    const matched = match[0] ?? "";
    const start = match.index;
    const end = start + matched.length;
    if (matched.length === 0) {
      reg.lastIndex = start + 1;
      continue;
    }
    if (!wholeWord || isWholeWordBoundary(text, start, end)) {
      out.push({ start, end });
    }
  }
  return out;
}

function runSidebarSearch(token: number) {
  if (token !== searchRunToken) return;
  const q = searchQuery.value.trim();
  if (!currentFile.value || !q) {
    searchResults.value = [];
    searchInProgress.value = false;
    return;
  }
  const caseSensitive = searchMatchCase.value;
  const wholeWord = searchWholeWord.value;
  const useRegex = searchUseRegex.value;
  const maxLine = stream.getPhysicalLineCount();
  const next: SidebarSearchResult[] = [];
  for (let line = 1; line <= maxLine; line += 1) {
    const text = stream.getPhysicalLineContent(line);
    const ranges = useRegex
      ? collectRegexRanges(text, q, caseSensitive, wholeWord)
      : collectPlainRanges(text, q, caseSensitive, wholeWord);
    if (ranges == null) {
      searchResults.value = [];
      activeSearchResult.value = null;
      searchInProgress.value = false;
      return;
    }
    if (ranges.length === 0) continue;
    const displayLine = readerEditMode.value
      ? line
      : stream.physicalLineToDisplayForReader(line);
    for (const range of ranges) {
      next.push({
        physicalLine: line,
        displayLine,
        text,
        range,
      });
      if (next.length >= SEARCH_RESULT_LIMIT) break;
    }
    if (next.length >= SEARCH_RESULT_LIMIT) break;
  }
  if (token !== searchRunToken) return;
  searchResults.value = next;
  readerRef.value?.setInlineSearchState?.(q, null, {
    caseSensitive: caseSensitive,
    wholeWord: wholeWord,
    useRegex: useRegex,
  });
  hasInlineSearchHighlight.value = next.length > 0;
  if (
    activeSearchResult.value != null &&
    !next.some((it) => isSameSidebarSearchResult(it, activeSearchResult.value!))
  ) {
    activeSearchResult.value = null;
  }
  searchInProgress.value = false;
}

function scheduleSidebarSearch() {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = null;
  }
  const q = searchQuery.value.trim();
  if (!currentFile.value || !q) {
    searchResults.value = [];
    searchInProgress.value = false;
    activeSearchResult.value = null;
    readerRef.value?.clearInlineSearchState?.();
    hasInlineSearchHighlight.value = false;
    return;
  }
  const token = ++searchRunToken;
  searchInProgress.value = true;
  searchDebounceTimer = setTimeout(() => {
    searchDebounceTimer = null;
    runSidebarSearch(token);
  }, SEARCH_DEBOUNCE_MS);
}

watch(searchQuery, () => {
  scheduleSidebarSearch();
});

watch([searchMatchCase, searchWholeWord, searchUseRegex], () => {
  scheduleSidebarSearch();
});

watch(totalLineCount, () => {
  if (!searchQuery.value.trim()) return;
  // 编辑态正文/换行均由 onReaderEditContentChange 触发重搜
  if (readerEditMode.value) return;
  scheduleSidebarSearch();
});

watch(readerEditMode, (edit) => {
  if (!edit) clearChapterRefreshDebounce();
  if (!searchQuery.value.trim()) return;
  // 进入编辑：等磁盘原文写入 Monaco（readerEditLoaded）后再搜，避免只读展示文与列映射不一致
  if (edit) return;
  scheduleSidebarSearch();
});

watch(currentFile, (next, prev) => {
  if (next === prev) return;
  clearSidebarSearchState();
});

function onJumpToSearchResult(item: SidebarSearchResult) {
  if (!currentFile.value || loading.value || totalLineCount.value <= 0) return;
  activeSearchResult.value = {
    physicalLine: item.physicalLine,
    rangeStart: item.range.start,
  };
  ensurePinBeforeRevealFindWidget();
  const displayLine = item.displayLine;
  const { startColumn, endColumn } = stream.physicalSearchRangeToDisplayColumns(
    item.physicalLine,
    item.range,
  );
  readerRef.value?.setInlineSearchState?.(
    searchQuery.value,
    {
      lineNumber: displayLine,
      startColumn,
      endColumn,
    },
    {
      caseSensitive: searchMatchCase.value,
      wholeWord: searchWholeWord.value,
      useRegex: searchUseRegex.value,
    },
  );
  hasInlineSearchHighlight.value = true;
  readerRef.value?.jumpToSearchMatchCentered?.(
    displayLine,
    startColumn,
    endColumn,
  );
  queueMicrotask(() => readerRef.value?.emitProbeLine?.());
  scheduleVoiceReadResumeAfterJump();
}

onBeforeUnmount(() => {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = null;
  }
  clearChapterRefreshDebounce();
  activeSearchResult.value = null;
  readerRef.value?.clearInlineSearchState?.();
  hasInlineSearchHighlight.value = false;
});

async function applySettings(payload: SettingsApplyPayload) {
  const prevCompressBlankKeepOneBlank = compressBlankKeepOneBlank.value;
  const prevChapterMinCharCount = chapterMinCharCount.value;
  monacoSmoothScrolling.value = payload.monacoSmoothScrolling;
  readerEditShowLineNumbers.value = payload.readerEditShowLineNumbers;
  readerEditMinimap.value = payload.readerEditMinimap;
  editAutoRefreshChapterList.value = payload.editAutoRefreshChapterList;
  compressBlankKeepOneBlank.value = payload.compressBlankKeepOneBlank;
  txtrDelimitedMatchCrossLine.value = payload.txtrDelimitedMatchCrossLine;
  restoreSessionOnStartup.value = payload.restoreSessionOnStartup;
  syncCurrentFile.value = payload.syncCurrentFile;
  recentFilesHistoryLimit.value = Math.max(
    0,
    Math.min(
      maxRecentFilesHistoryLimit,
      Math.floor(payload.recentFilesHistoryLimit),
    ),
  );
  chapterMinCharCount.value = Math.max(
    minChapterMinCharCount,
    Math.min(maxChapterMinCharCount, Math.floor(payload.chapterMinCharCount)),
  );
  fullscreenReaderWidthPercent.value = Math.max(
    minFullscreenReaderWidthPercent,
    Math.min(
      maxFullscreenReaderWidthPercent,
      Math.floor(payload.fullscreenReaderWidthPercent),
    ),
  );
  ebookConvertOutputDir.value = payload.ebookConvertOutputDir;
  const prevPortraitCache = characterPortraitCacheDir.value.trim();
  const nextPortraitCache = payload.characterPortraitCacheDir.trim();
  if (
    prevPortraitCache &&
    nextPortraitCache &&
    prevPortraitCache !== nextPortraitCache
  ) {
    try {
      const mig = await window.colorTxt.characterPortrait.migrateCacheRoot({
        from: prevPortraitCache,
        to: nextPortraitCache,
      });
      if (!mig.ok) {
        await appAlert(mig.error ?? "迁移角色立绘缓存失败，已保留原目录。");
      } else {
        characterPortraitCacheDir.value = nextPortraitCache;
      }
    } catch (e) {
      await appAlert(e instanceof Error ? e.message : String(e));
    }
  } else {
    characterPortraitCacheDir.value = nextPortraitCache;
  }
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
  aiSkillOverrides.value = mergeAiSkillOverrides(payload.aiSkillOverrides);
  aiCustomSkills.value = mergeAiCustomSkills(payload.aiCustomSkills ?? []);
  aiSkillsEnabled.value = mergeAiSkillsEnabled(
    payload.aiSkillsEnabled,
    aiCustomSkills.value.map((s) => s.id),
  );
  voiceReadSettings.value = mergeVoiceReadSettings(payload.voiceRead);
  aiAssistantConfigSyncNonce.value += 1;
  persistSettings();
  if (!payload.restoreSessionOnStartup) {
    clearPersistedSession();
  }
  applyRecentFilesHistoryLimitFromSettings();
  readerRef.value?.setWrappingStrategyAdvanced(monacoAdvancedWrapping.value);
  showSettingsPanel.value = false;
  if (
    prevChapterMinCharCount !== chapterMinCharCount.value &&
    compressBlankLines.value &&
    currentFile.value &&
    !readerEditMode.value
  ) {
    const anchor =
      captureViewportRestoreAnchor() ?? {
        physicalLine: captureViewportAnchorPhysicalLine(),
        wrappedLineIndex: 0,
      };
    void withChapterListScrollSuppressed(async () => {
      const ok = await stream.applyReaderDisplayFromPhysicalLines(anchor);
      if (!ok) {
        chapterMinCharCount.value = prevChapterMinCharCount;
        persistSettings();
        return;
      }
      await syncChaptersAfterViewportSettled();
    });
  } else if (prevChapterMinCharCount !== chapterMinCharCount.value) {
    chapterNav.refreshChapterListFromReader();
  }

  if (
    prevCompressBlankKeepOneBlank !== compressBlankKeepOneBlank.value &&
    compressBlankLines.value &&
    currentFile.value &&
    !readerEditMode.value
  ) {
    const anchor =
      captureViewportRestoreAnchor() ?? {
        physicalLine: captureViewportAnchorPhysicalLine(),
        wrappedLineIndex: 0,
      };
    void withChapterListScrollSuppressed(async () => {
      const ok = await stream.applyReaderDisplayFromPhysicalLines(anchor);
      if (!ok) {
        compressBlankKeepOneBlank.value = prevCompressBlankKeepOneBlank;
        persistSettings();
        return;
      }
      await syncChaptersAfterViewportSettled();
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
  recordFullscreenPointer,
  enterOrExitFullscreenView,
  pulseChapterListCenter,
  syncChaptersAfterViewportSettled,
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
  pendingRestoreViewportAnchor,
  compressBlankLines,
  suppressFileListCenterAfterLoad,
  suppressChapterListAutoScroll,
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
  jumpToPrevChapter: jumpToPrevChapterWithVoiceRead,
  jumpToNextChapter: jumpToNextChapterWithVoiceRead,
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
  readerDropOverlayVisible,
  handleWindowCloseRequest,
  readerEditMode,
  voiceReadScrollLocked: isVoiceReadScrollLocked,
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
  readerEditMode,
  readerEditorDirty,
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
        :voice-read-active="isVoiceReadActive"
        :can-voice-read="canVoiceRead"
        :voice-read-header-locked="isVoiceReadHeaderLocked"
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
        :reader-edit-mode="readerEditMode"
        :can-enter-reader-edit-mode="canEnterReaderEditMode"
        :shortcut-bindings="shortcutBindings"
        @open-file="openFileViaDialog"
        @pin-click="onPinClick"
        @bookmark-click="onBookmarkClick"
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
        @format-edit-compress-blank-lines="onFormatEditCompressBlankLines"
        @format-edit-lead-indent-full-width="onFormatEditLeadIndentFullWidth"
        @toggle-find="onToggleFind"
        :chapter-rules-disabled="currentFileIsMarkdown"
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
        @toggle-reader-edit="onToggleReaderEdit"
        @save-reader-file="onSaveReaderFile"
        @voice-read-toggle="toggleVoiceReadToolbar"
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
        v-show="sidebarShellVisible"
        :style="{ width: `${sidebarPaneLayoutWidth}px` }"
        @mouseleave="onFullscreenSidebarMouseLeave"
      >
        <ReaderSidebar
          ref="readerSidebarRef"
          active-scroll-mode="center"
          :panel-expanded="isFullscreenView || showSidebar"
          :activity-icons-on-dark="currentTheme === 'vs-dark'"
          :in-fullscreen="isFullscreenView"
          :show-fullscreen-sidebar="
            isFullscreenView ? showFullscreenSidebar : undefined
          "
          :chapter-list-scroll-smooth="chapterListScrollSmooth"
          :should-center-chapter-list="shouldCenterChapterList"
          :suppress-chapter-list-auto-scroll="suppressChapterListAutoScroll"
          :should-center-file-list="shouldCenterFileList"
          :should-center-bookmark-list="shouldCenterBookmarkList"
          v-model:activeTab="sidebarTab"
          v-model:showChapterCounts="showChapterCounts"
          :files="txtFiles"
          :file-meta-records="fileMetaRecords"
          :file-category="fileCategory"
          :file-sort="fileSort"
          :file-category-catalog="fileCategoryCatalog"
          :meta-progress-by-path-key="metaProgressByPathKey"
          :live-reading-progress-percent="liveReadingProgressForUi"
          :bookmarks="bookmarkListItems"
          :highlight-terms="currentFileHighlightTerms"
          :search-query="searchQuery"
          :search-results="searchResults"
          :search-in-progress="searchInProgress"
          :search-match-case="searchMatchCase"
          :search-whole-word="searchWholeWord"
          :search-use-regex="searchUseRegex"
          :active-search-result="activeSearchResult"
          :has-inline-search-highlight="hasInlineSearchHighlight"
          :highlight-preview-bg="
            currentTheme === 'vs'
              ? readerSurfaceLight.readerBg
              : readerSurfaceDark.readerBg
          "
          :monaco-font-family="monacoFontFamily"
          :active-bookmark-line="activeBookmarkLine"
          :current-file-path="currentFile"
          :physical-reader-path="physicalReaderPath"
          :reader-main-ref="readerRef"
          :ai-assistant-tab-visible="aiFeaturesEnabled"
          :character-portrait-tab-visible="txt2imgFeatureEnabled"
          :character-portrait-cache-dir="characterPortraitCacheDir"
          :character-roster="currentFileCharacterRoster"
          :character-book-style="currentFileCharacterBookStyle"
          v-model:deep-thinking="aiAssistantDeepThinking"
          v-model:spoiler-safe="aiAssistantSpoilerSafe"
          :ai-skills-enabled="aiSkillsEnabled"
          :ai-skill-overrides="aiSkillOverrides"
          :ai-custom-skills="aiCustomSkills"
          :ai-assistant-config-sync-nonce="aiAssistantConfigSyncNonce"
          :chapters="chapters"
          :active-chapter-idx="activeChapterIdx"
          :format-char-count="formatCharCount"
          :show-edit-chapter-refresh-button="showEditChapterRefreshButton"
          @pick-directory="pickTxtDirectory"
          @import-dropped-paths="onImportDroppedPathsFromList"
          @open-file="openFileFromSidebar"
          @jump-to-chapter="onJumpToChapterFromSidebar"
          @jump-to-chapter-from-ai="jumpToChapterFromAiAssistant"
          @clear-file-list="clearFileList"
          @clear-file-list-category="clearFileListForCategory"
          @remove-file-list="removeFileList"
          @clear-file-meta="onClearFileMeta"
          @rename-file-path="onRenameFilePath"
          @open-file-in-new-window="onOpenFileInNewWindow"
          @close-current-file="closeCurrentFile"
          @refresh-chapters-from-reader="applyChaptersFromReaderPlainText"
          @jump-to-bookmark="jumpToBookmarkWithVoiceRead"
          @clear-bookmarks="clearCurrentFileBookmarks"
          @remove-bookmarks="removeCurrentFileBookmarks"
          @edit-bookmark="onEditBookmark"
          @remove-bookmark="onRemoveBookmark"
          @find-highlight-term="onFindHighlightTermFromSidebar"
          @clear-inline-search-highlight="clearReaderInlineSearchHighlight"
          @toggle-global-highlight-term="(text, enabled) => onToggleGlobalHighlightTerm([text, enabled])"
          @update:search-query="searchQuery = $event"
          @update:search-match-case="searchMatchCase = $event"
          @update:search-whole-word="searchWholeWord = $event"
          @update:search-use-regex="searchUseRegex = $event"
          @jump-to-search-result="onJumpToSearchResult"
          @remove-highlight-term="onRemoveHighlightTerm({ text: $event })"
          @clear-highlights="clearCurrentFileHighlightTerms"
          @character-file-meta-patch="onCharacterFileMetaPatch"
          @persist-ui="onPersistUi"
          @update:file-category="fileCategory = $event"
          @update:file-sort="fileSort = $event"
          @apply-category-catalog="onApplyCategoryCatalog"
          @set-files-category="onSetFilesCategory"
          @update:fullscreen-file-list-popovers-open="
            fullscreenFileListPopoversOpen = $event
          "
          @update:fullscreen-ai-assistant-popovers-open="
            fullscreenAiAssistantPopoversOpen = $event
          "
          @update:fullscreen-character-drawer-open="
            fullscreenCharacterDrawerOpen = $event
          "
          @update:file-list-editing="fileListEditing = $event"
          @request-expand-panel="showSidebar = true"
          @request-collapse-panel="showSidebar = false"
          @open-color-scheme="showColorSchemePanel = true"
          @open-settings="showSettingsPanel = true"
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
        data-drop-zone="reader"
        :style="fullscreenReaderPaneStyle"
      >
        <Transition name="readerDropOverlay">
          <div
            v-if="readerDropOverlayVisible"
            class="readerDropOverlay"
            aria-hidden="true"
          >
            <p class="readerDropOverlayText">打开文件</p>
          </div>
        </Transition>
        <ReaderMain
          ref="readerRef"
          class="readerPane"
          :voice-read-scroll-locked="isVoiceReadScrollLocked"
          :voice-read-paused="isVoiceReadActive && voiceReadMode === 'paused'"
          :voice-read-blocks-find="isVoiceReadBlocksFind"
          @voice-read-resume="voiceReadTogglePlayPause"
          :monaco-custom-highlight="monacoCustomHighlight"
          :txtr-delimited-match-cross-line="txtrDelimitedMatchCrossLine"
          :compress-blank-lines="compressBlankLines"
          :chapter-min-char-count="chapterMinCharCount"
          :monaco-advanced-wrapping="monacoAdvancedWrapping"
          :monaco-smooth-scrolling="monacoSmoothScrolling"
          :reader-edit-show-line-numbers="readerEditShowLineNumbers"
          :reader-edit-minimap="readerEditMinimap"
          :stream-loading="loading"
          :reader-surface-light="readerSurfaceLight"
          :reader-surface-dark="readerSurfaceDark"
          :highlight-colors="highlightColorsForReader"
          :highlight-words-by-index="currentFileHighlightWords"
          :global-highlight-words="globalHighlightWords"
          :reader-file-path="currentFile"
          :ebook-anchor-physical-to-display="
            stream.physicalLineToDisplayForReader
          "
          :ebook-display-line-to-physical="
            stream.viewportDisplayLineToPhysicalLine
          "
          :before-reveal-find-widget="ensurePinBeforeRevealFindWidget"
          :reader-fullscreen="isFullscreenView"
          :reader-edit-mode="readerEditMode"
          :reader-edit-restore-anchor="pendingReaderEditRestoreAnchor"
          :physical-reader-path="physicalReaderPath"
          :file-is-markdown="currentFileIsMarkdown && !readerEditMode"
          @probe-line-change="onProbeLineChange"
          @viewport-top-line-change="onViewportTopLineChange"
          @viewport-end-line-change="onViewportEndLineChange"
          @viewport-visual-progress-change="onViewportVisualProgressChange"
          @add-highlight-term="onAddHighlightTerm"
          @remove-highlight-term="onRemoveHighlightTerm"
          @reader-edit-dirty-change="onReaderEditDirtyChange"
          @reader-edit-content-change="onReaderEditContentChange"
          @reader-edit-loaded="onReaderEditLoaded"
          @reader-edit-load-failed="onReaderEditLoadFailed"
          @reader-edit-save-request="onSaveReaderFile"
        />
        <VoiceReadToolbar
          :visible="isVoiceReadActive"
          :mode="voiceReadMode"
          :synthesizing="voiceReadSynthesizing"
          :toolbar-rate="voiceReadToolbarRate"
          :toolbar-pitch="voiceReadToolbarPitch"
          :engine="voiceReadSettings.engine"
          :can-prev-line="voiceReadCanPlayPrevLine"
          :can-next-line="voiceReadCanPlayNextLine"
          @update:toolbar-rate="voiceReadToolbarRate = $event"
          @update:toolbar-pitch="voiceReadToolbarPitch = $event"
          @toggle-play-pause="voiceReadTogglePlayPause"
          @prev-line="voiceReadPlayPrevLine"
          @next-line="voiceReadPlayNextLine"
          @regenerate="voiceReadRegenerateCurrentLine"
          @stop="exitVoiceRead"
        />
        <div
          v-if="showReaderIdleHint"
          class="readerIdleHint"
          aria-hidden="true"
        >
          <div>{{ defaultReaderIdleHint }}</div>
          <p>{{ defaultReaderOpenHint }}</p>
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
        :encoding-actions-enabled="footerEncodingActionsEnabled"
        :path-menu-reveal-enabled="footerPathMenuRevealEnabled"
        :path-menu-reload-enabled="footerPathMenuReloadEnabled"
        :path-menu-close-enabled="footerPathMenuCloseEnabled"
        @path-reveal-in-folder="revealCurrentFileInFolder"
        @path-reload="reloadCurrentFileFromDisk"
        @path-close="closeCurrentFile"
        @save-file-as-encoding="onFooterSaveFileAsEncoding"
      />
    </div>

    <AppDialogHost />
    <AppToastHost />

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
      :sync-current-file="syncCurrentFile"
      :recent-files-history-limit="recentFilesHistoryLimit"
      :chapter-min-char-count="chapterMinCharCount"
      :fullscreen-reader-width-percent="fullscreenReaderWidthPercent"
      :reader-font-size="readerFontSize"
      :reader-line-height-multiple="readerLineHeightMultiple"
      :compress-blank-keep-one-blank="compressBlankKeepOneBlank"
      :monaco-smooth-scrolling="monacoSmoothScrolling"
      :reader-edit-show-line-numbers="readerEditShowLineNumbers"
      :reader-edit-minimap="readerEditMinimap"
      :edit-auto-refresh-chapter-list="editAutoRefreshChapterList"
      :monaco-custom-highlight="monacoCustomHighlight"
      :txtr-delimited-match-cross-line="txtrDelimitedMatchCrossLine"
      :chapter-rules="chapterRuleState.rules"
      :chapter-rule-error-text="chapterRuleErrorText"
      :editing-bookmark-line="editingBookmarkLine"
      :can-bookmark="canBookmark"
      :add-bookmark-dialog-preview="addBookmarkDialogPreview"
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
      :character-portrait-cache-dir="characterPortraitCacheDir"
      :voice-read-settings="voiceReadSettings"
      :ai-skills-enabled="aiSkillsEnabled"
      :ai-skill-overrides="aiSkillOverrides"
      :ai-custom-skills="aiCustomSkills"
      @apply-settings="applySettings"
      @apply-shortcut-bindings="applyShortcutBindings"
      @apply-chapter-rules="applyChapterMatchRules"
      @confirm-add-bookmark="confirmAddBookmark"
      @update-bookmark-to-current-viewport-line="
        updateEditingBookmarkToCurrentViewportLine
      "
      @confirm-remove-active-bookmark="confirmRemoveActiveBookmark"
      @apply-reader-palettes="onApplyReaderPalettes"
      @apply-highlight-colors="onApplyHighlightColors"
    />
  </div>
</template>

<style scoped src="./appShell.css"></style>
