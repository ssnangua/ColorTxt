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
import {
  appReplaceRulesChangedEvent,
  type ReplaceRule,
} from "@shared/bookSource/replaceRule";
import { filterEnabledReplaceRules } from "@shared/bookSource/replaceRuleApply";
import { listReplaceRulesLocal } from "./bookSource/replaceRuleLocalStore";
import AppHeader, { type RecentFileItem } from "./components/AppHeader.vue";
import VoiceReadToolbar from "./components/VoiceReadToolbar.vue";
import ReaderChapterNavBar from "./components/ReaderChapterNavBar.vue";
import ReaderSidebar from "./components/ReaderSidebar.vue";
import AppFooter from "./components/AppFooter.vue";
import ReaderMain from "./components/ReaderMain.vue";
import AppDialogHost from "./components/AppDialogHost.vue";
import AppCaptchaHost from "./components/AppCaptchaHost.vue";
import AppToastHost from "./components/AppToastHost.vue";
import AppLoadingHost from "./components/AppLoadingHost.vue";
import AppOverlays from "./components/AppOverlays.vue";
import LoadingDotsBounce from "./components/LoadingDotsBounce.vue";
import WebDavSyncPanel from "./components/WebDavSyncPanel.vue";
import FullscreenSystemClock from "./components/FullscreenSystemClock.vue";
import PomodoroBreakOverlay from "./components/PomodoroBreakOverlay.vue";
import type { SettingsApplyPayload } from "./components/SettingsPanel.vue";
import type { ColorSchemeApplyPayload } from "./components/ColorSchemePanel.vue";
import { syncPersistedFindBookProxyToMain } from "./bookSource/services/findBookSettingsStore";
import { usePomodoroTimer } from "./composables/usePomodoroTimer";
import {
  mergePomodoroSettings,
  type PomodoroSettings,
} from "./constants/pomodoro";
import {
  mergeSelectionToolbarButtons,
  type SelectionToolbarButtons,
} from "./constants/selectionToolbar";
import {
  mergeDictionarySettings,
} from "./constants/dictionarySettings";
import {
  mergeWebSearchSettings,
} from "./constants/webSearchSettings";
import {
  mergeTranslationSettings,
} from "./constants/translationSettings";
import type { DictionarySettings } from "@shared/dictionaryTypes";
import type { WebSearchSettings } from "@shared/webSearchTypes";
import type { TranslationSettings } from "@shared/translationTypes";
import type { AiCustomSkill, AiSkillUserOverride } from "@shared/aiSkills";
import type { ColorTxtShowMessageBoxOptions } from "@shared/colorTxtShowMessageBox";
import type {
  CharacterBookStylePersisted,
  CharacterRosterEntry,
} from "@shared/characterTypes";
import {
  characterPortraitBookDirAbs,
  sanitizeBookFolderSegment,
} from "@shared/characterPortraitPaths";
import type { CharacterCardTextureEffectId } from "@shared/characterCardTextureEffects";
import { DEFAULT_CHARACTER_CARD_TEXTURE_EFFECT } from "@shared/characterCardTextureEffects";
import { formatTextEncodingLabel } from "@shared/textEncodingDisplay";
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
import { pickActiveChapterIdx } from "./reader/chapterIndex";
import {
  WORDCLOUD_DEFAULT_ANGLE_MODE,
  WORDCLOUD_DEFAULT_FONT_FAMILY,
  type WordcloudAngleMode,
} from "./constants/wordcloudUi";
import {
  WORDCLOUD_DEFAULT_PALETTE_ID,
  type WordcloudPaletteId,
} from "./constants/wordcloudPalettes";
import { useAppBookmarkPins } from "./composables/useAppBookmarkPins";
import { useAppChapterListSync } from "./composables/useAppChapterListSync";
import { useAppChapterNavigation } from "./composables/useAppChapterNavigation";
import { useAppFileSession } from "./composables/useAppFileSession";
import { useAppFullscreenReaderLayout } from "./composables/useAppFullscreenReaderLayout";
import { useAppHighlightTerms } from "./composables/useAppHighlightTerms";
import { useAppPersistence } from "./composables/useAppPersistence";
import { useAppReaderAnnotations } from "./composables/useAppReaderAnnotations";
import { useAppReaderChrome } from "./composables/useAppReaderChrome";
import { useAppReadingProgress } from "./composables/useAppReadingProgress";
import { useAppReaderUiPrefs } from "./composables/useAppReaderUiPrefs";
import { useReaderHudTip } from "./composables/useReaderHudTip";
import { useAppShellThemeWatch } from "./composables/useAppShellThemeWatch";
import { useAppSidebarSearch } from "./composables/useAppSidebarSearch";
import { useAppSyncCurrentFileWatch } from "./composables/useAppSyncCurrentFileWatch";
import { useAppWindowBindings } from "./composables/useAppWindowBindings";
import { useAiChapterPlainTextBridge } from "./composables/useAiChapterPlainTextBridge";
import { isEbookFilePath, isMarkdownFilePath, isPlainTextBookPath } from "./ebook/ebookFormat";
import { useAppVoiceRead } from "./composables/useAppVoiceRead";
import { useAppTimedScroll } from "./composables/useAppTimedScroll";
import { useReaderClickModeAltHold } from "./composables/useReaderClickModeAltHold";
import { useTxtStreamPipeline } from "./composables/useTxtStreamPipeline";
import { basenameFromPath } from "./services/fileListService";
import { bookTitleForExport } from "./utils/readerAnnotationExport";
import { fileHistoryKey } from "./stores/recentHistoryStore";
import {
  clampLineationLastColorsToCount,
  DEFAULT_LINEATION_LAST_COLORS,
  type LineationLastColorPrefs,
} from "./constants/annotationColors";
import {
  fileNameKey,
  findFileMetaRecord,
  upsertFileMetaRecord,
  normalizeFileMetaPathKey,
  type FileMetaRecord,
  type HighlightWordsByIndex,
  type ReaderLineationType,
} from "./stores/fileMetaStore";
import {
  applyReaderSurfaceToDocument,
  applyReaderBackgroundForPalettes,
  defaultCompressBlankKeepOneBlank,
  defaultChapterTitleBlankMode,
  defaultCompressBlankLines,
  defaultChapterMinCharCount,
  defaultFullscreenReaderWidthPercent,
  defaultFullscreenShowSystemTime,
  defaultLeadIndentFullWidth,
  defaultTextConvertDigitMode,
  defaultTextConvertLetterMode,
  defaultTextConvertZhMode,
  defaultMonacoAdvancedWrapping,
  defaultMonacoCjkWrapOptimize,
  defaultMonacoCustomHighlight,
  defaultMonacoSmoothScrolling,
  defaultMouseWheelScrollSensitivity,
  defaultFastScrollSensitivity,
  clampMouseWheelScrollSensitivity,
  clampFastScrollSensitivity,
  defaultStickyChapterTitleEnabled,
  defaultReaderClickMode,
  defaultReadingRulerEnabled,
  defaultReadingRulerFocusLines,
  defaultReadingRulerDimOpacity,
  defaultReadingRulerDimStickyTitle,
  defaultReadingRulerTransitionEnabled,
  clampReadingRulerFocusLines,
  clampReadingRulerDimOpacity,
  defaultMarkdownImageHeightPx,
  clampMarkdownImageHeightPx,
  defaultChapterNavToolbarEnabled,
  defaultReaderEditShowLineNumbers,
  defaultReaderEditMinimap,
  defaultEditAutoRefreshChapterList,
  editAutoRefreshChapterListMaxLines,
  defaultReaderIdleHint,
  defaultReaderOpenHint,
  defaultReaderFontSize,
  defaultReaderLineHeightMultiple,
  defaultLineSpacingPx,
  clampLineSpacingPx,
  defaultLetterSpacingPx,
  clampLetterSpacingPx,
  defaultReaderHorizontalInsetPx,
  clampReaderHorizontalInsetPx,
  defaultReaderBackgroundState,
  cloneReaderBackgroundState,
  defaultReaderTheme,
  defaultRecentFilesHistoryLimit,
  mergeReaderPaletteColorEnabled,
  resolveEffectiveReaderPalette,
  defaultRestoreSessionOnStartup,
  defaultSyncCurrentFile,
  defaultTxtrDelimitedMatchCrossLine,
  defaultShowChapterCounts,
  defaultChapterCharCountExact,
  defaultShowSidebar,
  emptyFileHintText,
  readerTxtLoadingHintText,
  GITHUB_REPO_URL,
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
  APP_DISPLAY_NAME,
  type ChapterTitleBlankMode,
  type ReaderSurfaceColorEnabled,
} from "./constants/appUi";
import {
  toPersistedReaderPaletteState,
  resolveReaderPaletteBySelectedId,
  type ReaderPalettePreset,
} from "./constants/readerPalettePresets";
import {
  type TextConvertWidthMode,
  type TextConvertZhMode,
} from "@shared/textConvertTypes";
import { mergeVoiceReadSettings, type VoiceReadSettings } from "./constants/voiceRead";
import {
  mergeTimedScrollSettings,
  type TimedScrollSettings,
} from "./constants/timedScroll";
import { migrateVoiceReadFromPersisted, cloneVoiceReadProfiles } from "./services/voiceRead/voiceReadProfileState";
import {
  voiceReadAiSpeakerTokenUsage,
  voiceReadAiSpeakerTokenUsageAvailable,
} from "./services/voiceRead/voiceReadAiSpeakerTokenUsage";
import type { VoiceReadProfile } from "@shared/voiceReadProfiles";
import {
  DEFAULT_HIGHLIGHT_COLORS_DARK,
  DEFAULT_HIGHLIGHT_COLORS_LIGHT,
  MIN_HIGHLIGHT_COLORS,
  mergeHighlightColors,
} from "./constants/highlightColors";
import {
  DEFAULT_LINEATION_COLORS_DARK,
  DEFAULT_LINEATION_COLORS_LIGHT,
  MIN_LINEATION_COLORS,
  mergeLineationColors,
} from "./constants/lineationColors";
import { formatCharCount, formatFileSize } from "./utils/format";
import { resolveDefaultUnpackedBooksDirSync } from "./utils/defaultCacheDirs";
import { clearAiReadingTracesForBook } from "./utils/clearAiChatForBook";
import { joinFs } from "./ebook/pathUtils";
import { buildWebDavAuth } from "./utils/webDavAuth";
import { READER_EDITOR_DEFAULT_FONT_FAMILY } from "./monaco/readerEditorOptions";
import {
  createDefaultShortcutBindings,
  type ShortcutBindingMap,
} from "./services/shortcutRegistry";
import {
  defaultAiSmartFormatSettings,
  aiSmartFormatHasAnyTask,
  type AiSmartFormatSettings,
} from "@shared/aiSmartFormatTypes";
import { useAiSmartFormat } from "./composables/useAiSmartFormat";
import AiSmartFormatProgressModal from "./components/AiSmartFormatProgressModal.vue";
import { appToast } from "./services/appToast";
import { appLoading } from "./services/appLoading";
import { appAlert, appConfirm } from "./services/appDialog";
import { mergeShortcutBindings } from "./services/shortcutUtils";
import { loadStealthReaderSettings } from "./utils/stealthReaderSettings";
import {
  syncTxtFilesCategoriesAfterCatalogEdit,
  normalizeTxtFileItem,
  type TxtFileItem,
} from "./services/fileListService";
import {
  cloneDefaultFileCategoryCatalog,
  DEFAULT_FILE_LIST_VIEW_MODE,
  DEFAULT_FILE_SORT,
  FILE_CATEGORY_FILTER_ALL,
  FILE_CATEGORY_FILTER_UNCATEGORIZED,
  type CategoryEditorRow,
  type FileCategoryDefinition,
  type FileListViewMode,
  type FileSortMode,
} from "./constants/fileCategories";

const readerRef = ref<InstanceType<typeof ReaderMain> | null>(null);
const readerEditMode = ref(false);
/** 全屏侧栏文件列表 Teleport 弹层（分类/筛选下拉、右键菜单等） */
const fullscreenFileListPopoversOpen = ref(false);
/** AI 阅读助手：历史/导出/模型菜单等 Teleport；与文件列表合并后交给全屏侧栏收起逻辑 */
const fullscreenAiAssistantPopoversOpen = ref(false);
/** 角色卡：编辑/添加角色抽屉打开 */
const fullscreenCharacterDrawerOpen = ref(false);
const fullscreenCharacterPopoversOpen = ref(false);
const fullscreenSidebarPopoversSuppressCollapse = computed(
  () =>
    fullscreenFileListPopoversOpen.value ||
    fullscreenAiAssistantPopoversOpen.value ||
    fullscreenCharacterDrawerOpen.value ||
    fullscreenCharacterPopoversOpen.value,
);
const chrome = useAppReaderChrome({
  readerRef,
  fullscreenSidebarPopoversSuppressCollapse,
  readerEditMode,
});
const {
  readerHudTipVisible,
  readerHudTipFading,
  readerHudTipText,
  showReaderHudTip,
} = useReaderHudTip();
const {
  isFullscreenView,
  isMinimalistView,
  chromeAutoHide,
  toggleMinimalistView,
  showFullscreenTip,
  fullscreenTipFading,
  fullscreenTipText,
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
  handleReaderChromeEscape,
  revealFullscreenSidebar,
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
const showWebDavPanel = ref(false);
const appOverlaysRef = ref<InstanceType<typeof AppOverlays> | null>(null);
const showChapterRulePanel = ref(false);
const showReplaceRulePanel = ref(false);
const showVoiceReadSpeakSettingsPanel = ref(false);
const chapterRuleErrorText = ref("");
const chapterRuleState = ref(getChapterMatchRules());
/** 主窗口文本替换规则（localStorage，与找书分键） */
const cachedReplaceRules = ref<ReplaceRule[]>([]);
/** 替换范围匹配 / 建议用的「书名」= 当前打开文件名去掉常见后缀（如 foo.epub.md → foo） */
const replaceRuleScopeBookName = computed(() => {
  const p = currentFile.value?.trim();
  if (!p) return "";
  const base = basenameFromPath(p);
  const title = bookTitleForExport(base);
  return title === "未命名" ? base : title;
});
const textReplaceActive = computed(() => {
  const name = replaceRuleScopeBookName.value;
  return (
    filterEnabledReplaceRules(cachedReplaceRules.value, name, "", "content")
      .length > 0 ||
    filterEnabledReplaceRules(cachedReplaceRules.value, name, "", "title")
      .length > 0
  );
});

function refreshReplaceRulesCache() {
  cachedReplaceRules.value = listReplaceRulesLocal("app");
}

/** 按当前展示设置（替换/转换/压缩空行/缩进等）从物理行重跑管线，并尽量保持视口 */
function reformatReaderDisplayPreservingViewport() {
  if (!currentFile.value || readerEditMode.value || loading.value) return;
  const anchor =
    captureViewportRestoreAnchor() ?? {
      physicalLine: captureViewportAnchorPhysicalLine(),
      wrappedLineIndex: 0,
    };
  void withChapterListScrollSuppressed(async () => {
    const ok = await stream.applyReaderDisplayFromPhysicalLines(anchor);
    if (!ok) return;
    await nextTick();
    readerRef.value?.emitProbeLine?.();
    await syncChaptersAfterViewportSettled();
  });
}

function onReplaceRulesChanged() {
  refreshReplaceRulesCache();
  reformatReaderDisplayPreservingViewport();
}

let offStealthOwnerProgress: (() => void) | undefined;

const currentFile = ref<string | null>(null);
const loading = ref(false);
/** 打开文件时主进程流式读取的字节进度（0–100），无总大小时为 null */
const loadingProgressPercent = ref<number | null>(null);
/** 底栏路径旁：WebDAV 书包上传/同步进度 */
const webDavBookPackProgress = ref<{
  kind: "upload" | "sync";
  percent: number;
} | null>(null);
let webDavBookPackProgressRequestId: string | null = null;
let webDavBookPackProgressUnsub: (() => void) | null = null;

function beginWebDavBookPackProgress(kind: "upload" | "sync"): string {
  const requestId = `webdav-bp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  webDavBookPackProgressRequestId = requestId;
  webDavBookPackProgress.value = { kind, percent: 0 };
  webDavBookPackProgressUnsub?.();
  webDavBookPackProgressUnsub =
    window.colorTxt?.webdav?.onTransferProgress((p) => {
      if (p.requestId !== webDavBookPackProgressRequestId) return;
      const cur = webDavBookPackProgress.value;
      if (!cur) return;
      webDavBookPackProgress.value = { ...cur, percent: p.percent };
    }) ?? null;
  return requestId;
}

function endWebDavBookPackProgress() {
  webDavBookPackProgressUnsub?.();
  webDavBookPackProgressUnsub = null;
  webDavBookPackProgressRequestId = null;
  webDavBookPackProgress.value = null;
}
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
const chapterCharCountExact = ref(defaultChapterCharCountExact);
/** 依赖 exact 开关，变更时更新函数引用以刷新章节列表字数展示（底栏总字数直接读同一开关） */
const formatChapterCharCount = computed(
  () => (n: number) => formatCharCount(n, chapterCharCountExact.value),
);
/** AI 阅读助手工具栏：深度思考 / 防剧透（持久化至 colorTxt.ui.settings） */
const aiAssistantDeepThinking = ref(false);
const aiAssistantSpoilerSafe = ref(false);
const wordcloudFontFamily = ref(WORDCLOUD_DEFAULT_FONT_FAMILY);
const wordcloudAngleMode = ref<WordcloudAngleMode>(WORDCLOUD_DEFAULT_ANGLE_MODE);
const wordcloudPaletteId = ref<WordcloudPaletteId>(WORDCLOUD_DEFAULT_PALETTE_ID);
const voiceReadSettings = ref<VoiceReadSettings>(
  mergeVoiceReadSettings(undefined),
);
const voiceReadProfiles = ref<VoiceReadProfile[]>(
  migrateVoiceReadFromPersisted(undefined).profiles,
);
const activeVoiceReadProfileId = ref(
  migrateVoiceReadFromPersisted(undefined).activeProfileId,
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
  refreshReplaceRulesCache();
  window.addEventListener(appReplaceRulesChangedEvent, onReplaceRulesChanged);
  // 主窗口推送找书/设置共用的 HTTP 代理（词典等网络请求依赖主进程默认代理）
  syncPersistedFindBookProxyToMain();
  offStealthOwnerProgress = window.colorTxt.onStealthOwnerProgress((payload) => {
    // 摸鱼期间不同步；仅退出时 focus=true 跳回主阅读器行号
    if (payload.focus) {
      readerRef.value?.jumpToLine(payload.line, false);
    }
  });
});

onBeforeUnmount(() => {
  window.removeEventListener(appReplaceRulesChangedEvent, onReplaceRulesChanged);
  offStealthOwnerProgress?.();
  endWebDavBookPackProgress();
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
const CHAPTER_REFRESH_DEBOUNCE_MS = 400;
const txtFiles = ref<TxtFileItem[]>([]);
const fileCategory = ref<string>(FILE_CATEGORY_FILTER_ALL);
const fileSort = ref<FileSortMode>(DEFAULT_FILE_SORT);
const fileListViewMode = ref<FileListViewMode>(DEFAULT_FILE_LIST_VIEW_MODE);
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
/** 已打开文件且流式加载完成、正文行数与字数均为 0 时居中提示（仅只读；编辑模式不遮挡空白编辑区） */
/** 字数 0 即视为无内容（Monaco 空模型仍可能计 1 行，勿与行数强绑定） */
const showReaderEmptyHint = computed(
  () =>
    Boolean(currentFile.value) &&
    !loading.value &&
    !readerEditMode.value &&
    totalCharCount.value === 0,
);
/** 非自动隐藏：侧栏壳（含活动栏）始终占位；全屏 / 极简：仅浮动展开时显示整块 */
const sidebarShellVisible = computed(
  () => !chromeAutoHide.value || showFullscreenSidebar.value,
);
/** 自动隐藏时用完整侧栏宽；窗口态收起面板时仅活动栏宽度 */
const sidebarPaneLayoutWidth = computed(() => {
  if (chromeAutoHide.value) return sidebarWidthForLayout.value;
  if (!showSidebar.value) return SIDEBAR_ACTIVITY_BAR_WIDTH;
  return sidebarWidthForLayout.value;
});
const currentTheme = ref(defaultReaderTheme);
/** Monaco txtr.* 语法着色（标点/数字/英文/引号与括号内等） */
const monacoCustomHighlight = ref(defaultMonacoCustomHighlight);
/** 为 true 时在加载文件流中丢弃空行（仅空格/缩进也视为空行） */
const compressBlankLines = ref(defaultCompressBlankLines);
/** 压缩空行时是否在每行（含章节标题）下方保留一行空行 */
const compressBlankKeepOneBlank = ref(defaultCompressBlankKeepOneBlank);
/** 压缩空行时章节标题上下空行模式 */
const chapterTitleBlankMode = ref<ChapterTitleBlankMode>(
  defaultChapterTitleBlankMode,
);
/** 与「内容上色」同时生效：Monarch 成对引号/括号是否跨行 */
const txtrDelimitedMatchCrossLine = ref(defaultTxtrDelimitedMatchCrossLine);
/** 为 true 时正文行统一行首两个全角空格（章节标题行与空行除外） */
const leadIndentFullWidth = ref(defaultLeadIndentFullWidth);
const textConvertZh = ref<TextConvertZhMode>(defaultTextConvertZhMode);
const textConvertLetter = ref<TextConvertWidthMode>(defaultTextConvertLetterMode);
const textConvertDigit = ref<TextConvertWidthMode>(defaultTextConvertDigitMode);
const readerFontSize = ref(defaultReaderFontSize);
const readerLineHeightMultiple = ref(defaultReaderLineHeightMultiple);
const readerLineSpacingPx = ref(defaultLineSpacingPx);
const readerLetterSpacingPx = ref(defaultLetterSpacingPx);
const readerHorizontalInsetPx = ref(defaultReaderHorizontalInsetPx);
const monacoFontFamily = ref(READER_EDITOR_DEFAULT_FONT_FAMILY);
/** 阅读器字体弹框：钉在外层的「其他字体」 */
const pinnedOtherFonts = ref<string[]>([]);
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
/** 简单换行下中文标点全角估算（高级换行开启时运行时停用） */
const monacoCjkWrapOptimize = ref(defaultMonacoCjkWrapOptimize);
/** Monaco 阅读区平滑滚动（设置可关） */
const monacoSmoothScrolling = ref(defaultMonacoSmoothScrolling);
const mouseWheelScrollSensitivity = ref(defaultMouseWheelScrollSensitivity);
const fastScrollSensitivity = ref(defaultFastScrollSensitivity);
/** 阅读区顶部粘性章节标题 */
const stickyChapterTitleEnabled = ref(defaultStickyChapterTitleEnabled);
const readerClickMode = ref(defaultReaderClickMode);
const readingRulerEnabled = ref(defaultReadingRulerEnabled);
const readingRulerFocusLines = ref(defaultReadingRulerFocusLines);
const readingRulerDimOpacity = ref(defaultReadingRulerDimOpacity);
const readingRulerDimStickyTitle = ref(defaultReadingRulerDimStickyTitle);
const readingRulerTransitionEnabled = ref(
  defaultReadingRulerTransitionEnabled,
);
const markdownImageHeightPx = ref(defaultMarkdownImageHeightPx);
const chapterNavToolbarEnabled = ref(defaultChapterNavToolbarEnabled);
const readerEditShowLineNumbers = ref(defaultReaderEditShowLineNumbers);
const readerEditMinimap = ref(defaultReaderEditMinimap);
const editAutoRefreshChapterList = ref(defaultEditAutoRefreshChapterList);
const aiSmartFormat = ref<AiSmartFormatSettings>({
  ...defaultAiSmartFormatSettings,
});
const canUseAiSmartFormat = computed(() =>
  aiSmartFormatHasAnyTask(aiSmartFormat.value),
);
/** 全屏时阅读区域宽度（百分比） */
const fullscreenReaderWidthPercent = ref(defaultFullscreenReaderWidthPercent);
/** 全屏时是否在左下角显示系统时间 */
const fullscreenShowSystemTime = ref(defaultFullscreenShowSystemTime);
const timedScrollSettings = ref<TimedScrollSettings>(
  mergeTimedScrollSettings(undefined),
);
const pomodoroSettings = ref<PomodoroSettings>(mergePomodoroSettings(undefined));
const selectionToolbarButtons = ref<SelectionToolbarButtons>(
  mergeSelectionToolbarButtons(undefined),
);
const dictionarySettings = ref<DictionarySettings>(
  mergeDictionarySettings(undefined),
);
const webSearchSettings = ref<WebSearchSettings>(
  mergeWebSearchSettings(undefined),
);
const translationSettings = ref<TranslationSettings>(
  mergeTranslationSettings(undefined),
);
const showDictionaryManagePanel = ref(false);
const showWebSearchManagePanel = ref(false);
const showTranslateManagePanel = ref(false);

function openTranslateManagePanel() {
  showTranslateManagePanel.value = true;
}
const {
  phase: pomodoroPhase,
  displayMode: pomodoroDisplayMode,
  progress: pomodoroProgress,
  countdownText: pomodoroCountdownText,
  pauseResumeLabel: pomodoroPauseResumeLabel,
  paused: pomodoroPaused,
  showBreakOverlay: pomodoroShowBreakOverlay,
  start: startPomodoro,
  toggleDisplayMode: togglePomodoroDisplayMode,
  togglePause: togglePomodoroPause,
  stop: stopPomodoro,
  finishBreakEarly: finishPomodoroBreakEarly,
} = usePomodoroTimer(pomodoroSettings);
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
/** 彩读书包解压目录；默认 userData/UnpackedBooks；空串时运行时仍回退该默认 */
const bookPackUnpackDir = ref(resolveDefaultUnpackedBooksDirSync());
/** 彩读书包默认密码；空串表示导出不加密 */
const bookPackPassword = ref("");
/** 是否启用 WebDAV 同步入口 */
const webDavEnabled = ref(false);
/** WebDAV 服务地址 */
const webDavUrl = ref("");
/** WebDAV 用户名 */
const webDavUsername = ref("");
/** WebDAV 应用根目录名（默认 ColorTxt） */
const webDavRemoteDir = ref("ColorTxt");
/** 角色立绘缓存根目录（绝对路径）；出厂默认 userData/CharacterPortrait */
const characterPortraitCacheDir = ref(
  (() => {
    try {
      return window.colorTxt.getDefaultCharacterPortraitCacheDir();
    } catch {
      return "";
    }
  })(),
);
const characterCardTextureEffect = ref<CharacterCardTextureEffectId>(
  DEFAULT_CHARACTER_CARD_TEXTURE_EFFECT,
);
/** 技能开关（设置 → 技能） */
const aiSkillsEnabled = ref<Record<string, boolean>>(
  mergeAiSkillsEnabled(undefined, []),
);
const aiSkillOverrides = ref<Record<string, AiSkillUserOverride>>({});
const aiCustomSkills = ref<AiCustomSkill[]>([]);
/** 电子书转换阶段（底栏显示「转换中…」） */
const ebookParsing = ref(false);
/** 彩读书包 ZIP 解析 / 解压（全屏「解包中…」蒙层） */
const bookPackUnpacking = ref(false);
/** 转换进行中的电子书原路径（底栏路径；早于 currentFile 更新） */
const ebookConversionSourcePath = ref<string | null>(null);
/** PDF 转换页进度（底栏 / 蒙层「转换中 12/480」） */
const ebookConvertProgressText = ref("");

const readerPaletteColorEnabledOverrides = ref<
  Partial<ReaderSurfaceColorEnabled>
>({});
const readerPaletteUserPresets = ref<ReaderPalettePreset[]>([]);
const readerPaletteSelectedIdLight = ref("");
const readerPaletteSelectedIdDark = ref("");
const readerBackground = ref(
  cloneReaderBackgroundState(defaultReaderBackgroundState),
);

const readerSurfaceLight = computed(() =>
  resolveReaderPaletteBySelectedId(
    readerPaletteSelectedIdLight.value,
    "light",
    readerPaletteUserPresets.value,
  ),
);
const readerSurfaceDark = computed(() =>
  resolveReaderPaletteBySelectedId(
    readerPaletteSelectedIdDark.value,
    "dark",
    readerPaletteUserPresets.value,
  ),
);

const readerPaletteColorEnabled = computed(() =>
  mergeReaderPaletteColorEnabled(readerPaletteColorEnabledOverrides.value),
);

const effectiveReaderSurfaceLight = computed(() =>
  resolveEffectiveReaderPalette(
    readerSurfaceLight.value,
    readerPaletteColorEnabled.value,
  ),
);
const effectiveReaderSurfaceDark = computed(() =>
  resolveEffectiveReaderPalette(
    readerSurfaceDark.value,
    readerPaletteColorEnabled.value,
  ),
);

const highlightColorsLight = ref<string[]>([...DEFAULT_HIGHLIGHT_COLORS_LIGHT]);
const highlightColorsDark = ref<string[]>([...DEFAULT_HIGHLIGHT_COLORS_DARK]);
const lineationColorsLight = ref<string[]>([...DEFAULT_LINEATION_COLORS_LIGHT]);
const lineationColorsDark = ref<string[]>([...DEFAULT_LINEATION_COLORS_DARK]);
/** 已收藏（全书通用）高亮词 */
const highlightWordsByIndexGlobal = ref<HighlightWordsByIndex | undefined>(
  undefined,
);
const lineationLastColors = ref<LineationLastColorPrefs>({
  ...DEFAULT_LINEATION_LAST_COLORS,
});

const highlightColorsForReader = computed(() =>
  currentTheme.value === "vs"
    ? highlightColorsLight.value
    : highlightColorsDark.value,
);

const lineationColorsForReader = computed(() =>
  currentTheme.value === "vs"
    ? lineationColorsLight.value
    : lineationColorsDark.value,
);

const readerPaletteColorEnabledForReader = computed(
  () => readerPaletteColorEnabled.value,
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

const readerPaneWrapRef = useTemplateRef<HTMLElement>("readerPaneWrapRef");
const {
  fullscreenReaderPaneStyle,
  onLayoutMouseDown: onFullscreenLayoutMouseDown,
  onLayoutContextMenu: onFullscreenLayoutContextMenu,
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

function onLayoutContextMenu(ev: MouseEvent) {
  onFullscreenLayoutContextMenu(ev);
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

const readerEditorDirty = ref(false);

const { effectiveClickMode, clickModeAltHeld } = useReaderClickModeAltHold({
  persistedClickMode: readerClickMode,
  readerEditMode,
});

const readerSaveEncoding = ref("utf8");
/** 编辑态 / 编码另存：整文件写盘中（禁用保存按钮，防重复点） */
const readerFileSaving = ref(false);

type ReaderEditCursorStatus = {
  line: number;
  column: number;
  selectionLength: number;
};
const readerEditCursorStatus = ref<ReaderEditCursorStatus | null>(null);

const readerEditCursorFooterLabel = computed(() => {
  if (!readerEditMode.value) return "";
  const s = readerEditCursorStatus.value;
  if (!s) return "";
  let text = `行 ${s.line}，列 ${s.column}`;
  if (s.selectionLength > 0) {
    text += ` (已选择 ${s.selectionLength})`;
  }
  return text;
});

function onReaderEditCursorChange(payload: ReaderEditCursorStatus) {
  readerEditCursorStatus.value = payload;
}

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
/** 原始会话路径为电子书（非 txt/md）时展示「重新转换」 */
const footerPathMenuReconvertEnabled = computed(
  () =>
    Boolean(
      currentFile.value &&
        isEbookFilePath(currentFile.value) &&
        !loading.value &&
        !ebookParsing.value,
    ),
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
  if (readerFileSaving.value) return false;
  const normalized = normalizeIpcEncoding(ipcEncoding);
  const p = physicalReaderPath.value;
  if (!p || !window.colorTxt?.writeTextFile) return false;
  readerFileSaving.value = true;
  try {
    return await appLoading.with("保存中", async () => {
      const text = textForReaderDiskSave();
      const r = await window.colorTxt.writeTextFile(p, text, normalized);
      if (!r.ok) {
        void appAlert(r.message ?? "保存失败");
        return false;
      }
      readerSaveEncoding.value = normalized;
      fileEncoding.value = formatTextEncodingLabel(normalized);
      readerRef.value?.markReaderEditSaved?.();
      readerEditorDirty.value = false;
      return true;
    });
  } finally {
    readerFileSaving.value = false;
  }
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
  chapterTitleBlankMode,
  leadIndentFullWidth,
  textConvertZh,
  textConvertLetter,
  textConvertDigit,
  replaceRules: cachedReplaceRules,
  replaceRuleBookName: replaceRuleScopeBookName,
  chapterMinCharCount,
  currentFileIsMarkdown,
  afterFullTextInstalled: () => afterStreamFullTextInstalled(),
  onReaderDisplayReady: () => {
    loading.value = false;
    loadingProgressPercent.value = null;
  },
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
  isMinimalistView,
  currentTheme,
  monacoCustomHighlight,
  compressBlankLines,
  compressBlankKeepOneBlank,
  chapterTitleBlankMode,
  txtrDelimitedMatchCrossLine,
  leadIndentFullWidth,
  textConvertZh,
  textConvertLetter,
  textConvertDigit,
  showChapterCounts,
  chapterCharCountExact,
  readerFontSize,
  readerLineHeightMultiple,
  readerLineSpacingPx,
  readerLetterSpacingPx,
  readerHorizontalInsetPx,
  monacoFontFamily,
  pinnedOtherFonts,
  chapterRuleState,
  recentFiles,
  restoreSessionOnStartup,
  recentFilesHistoryLimit,
  chapterMinCharCount,
  monacoAdvancedWrapping,
  monacoCjkWrapOptimize,
  monacoSmoothScrolling,
  mouseWheelScrollSensitivity,
  fastScrollSensitivity,
  stickyChapterTitleEnabled,
  readerClickMode,
  readingRulerEnabled,
  readingRulerFocusLines,
  readingRulerDimOpacity,
  readingRulerDimStickyTitle,
  readingRulerTransitionEnabled,
  markdownImageHeightPx,
  chapterNavToolbarEnabled,
  readerEditShowLineNumbers,
  readerEditMinimap,
  editAutoRefreshChapterList,
  aiSmartFormat,
  fullscreenReaderWidthPercent,
  fullscreenShowSystemTime,
  timedScrollSettings,
  pomodoroSettings,
  selectionToolbarButtons,
  dictionarySettings,
  webSearchSettings,
  translationSettings,
  fileMetaRecords,
  shortcutBindings,
  defaultShortcutBindings,
  readerPaletteColorEnabledOverrides,
  readerPaletteUserPresets,
  readerPaletteSelectedIdLight,
  readerPaletteSelectedIdDark,
  readerBackground,
  highlightColorsLight,
  highlightColorsDark,
  lineationColorsLight,
  lineationColorsDark,
  highlightWordsByIndexGlobal,
  lineationLastColors,
  ebookConvertOutputDir,
  bookPackUnpackDir,
  bookPackPassword,
  webDavEnabled,
  webDavUrl,
  webDavUsername,
  webDavRemoteDir,
  characterPortraitCacheDir,
  characterCardTextureEffect,
  fileCategory,
  fileSort,
  fileListViewMode,
  fileCategoryCatalog,
  fileListEditing,
  syncCurrentFile,
  aiSkillsEnabled,
  aiSkillOverrides,
  aiCustomSkills,
  aiAssistantDeepThinking,
  aiAssistantSpoilerSafe,
  wordcloudFontFamily,
  wordcloudAngleMode,
  wordcloudPaletteId,
  voiceReadSettings,
  voiceReadProfiles,
  activeVoiceReadProfileId,
});
const {
  persistSettings,
  persistSidebarWidth,
  persistVoiceReadSecretsToVault,
  persistTranslationSecretsToVault,
  clearRecentFiles,
  persistWindowUnloadState,
  persistFileListCache,
  persistFileMeta,
  removeFileMetaPaths,
  persistRecentFiles,
  touchRecentFile,
  upsertBookmark,
  removeBookmark,
  clearBookmarks,
  initPersistenceBootstrap,
  applyRecentFilesHistoryLimitFromSettings,
  clearPersistedSession,
  metaProgressByPathKey,
  loadPersistedSettings,
} = persistence;

watch(fileListEditing, (editing, wasEditing) => {
  if (wasEditing === true && editing === false) {
    persistFileListCache();
  }
});

watch(showSidebar, () => persistSettings());
watch(isMinimalistView, () => persistSettings());
watch(aiAssistantDeepThinking, () => persistSettings());
watch(aiAssistantSpoilerSafe, () => persistSettings());
watch(wordcloudAngleMode, () => persistSettings());
watch(wordcloudPaletteId, () => persistSettings());
watch(wordcloudFontFamily, () => persistSettings());
watch(characterCardTextureEffect, () => persistSettings());
watch(
  voiceReadSettings,
  () => persistSettings(),
  { deep: true },
);
watch(
  timedScrollSettings,
  () => persistSettings(),
  { deep: true },
);
watch(
  dictionarySettings,
  () => persistSettings(),
  { deep: true },
);
watch(
  webSearchSettings,
  () => persistSettings(),
  { deep: true },
);
watch(
  translationSettings,
  () => persistSettings(),
  { deep: true },
);
watch(
  voiceReadProfiles,
  () => persistSettings(),
  { deep: true },
);
watch(activeVoiceReadProfileId, () => persistSettings());
watch(
  voiceReadAiSpeakerTokenUsage,
  () => persistSettings(),
  { deep: true },
);
watch(voiceReadAiSpeakerTokenUsageAvailable, () => persistSettings());

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

/**
 * 侧栏筛选非「全部」时：将路径归入当前筛选。
 * - 具体分类名：写入 `category`
 * - 「未分类」：清除 `category`
 * 路径可含新加入与已在列表中再次添加的项。
 */
function applyCurrentFileCategoryToPaths(paths: string[]) {
  const fc = fileCategory.value;
  if (fc === FILE_CATEGORY_FILTER_ALL || paths.length === 0) {
    return;
  }
  if (fc === FILE_CATEGORY_FILTER_UNCATEGORIZED) {
    onSetFilesCategory(paths, "");
  } else {
    onSetFilesCategory(paths, fc);
  }
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

async function migratePortraitBookDirIfNeeded(
  oldPath: string,
  newPath: string,
): Promise<void> {
  const oldSeg = sanitizeBookFolderSegment(oldPath);
  const newSeg = sanitizeBookFolderSegment(newPath);
  if (!oldSeg || oldSeg === newSeg) return;
  try {
    const rootRaw = characterPortraitCacheDir.value.trim();
    const root =
      rootRaw ||
      (await window.colorTxt.getDefaultCharacterPortraitCacheDir());
    if (!root?.trim()) return;
    const from = characterPortraitBookDirAbs(root.trim(), oldSeg);
    const to = characterPortraitBookDirAbs(root.trim(), newSeg);
    let st;
    try {
      st = await window.colorTxt.stat(from);
    } catch {
      return;
    }
    if (!st.isDirectory) return;
    const mig = await window.colorTxt.characterPortrait.migrateCacheRoot({
      from,
      to,
    });
    if (!mig.ok) {
      console.warn("migrate portrait book dir failed", mig.error);
    }
  } catch (e) {
    console.warn("migrate portrait book dir failed", e);
  }
}

/**
 * 侧栏「替换文件」：用另一个 txt/md 路径替换列表项，继承原阅读数据（书签/高亮/笔记/角色卡/进度等）。
 */
async function onReplaceFilePath(oldPathRaw: string) {
  const oldPath = oldPathRaw.trim();
  if (!oldPath || !isPlainTextBookPath(oldPath)) return;
  if (!window.colorTxt) {
    await appAlert("preload 未注入：请重启应用（或检查主进程 preload 路径）");
    return;
  }

  const r = await window.colorTxt.showOpenDialog({
    title: "选择替换文件",
    properties: ["openFile"],
    filters: [
      { name: "文本", extensions: ["txt", "md"] },
      { name: "所有文件", extensions: ["*"] },
    ],
  });
  if (r.canceled || r.filePaths.length === 0) return;
  const newPath = (r.filePaths[0] ?? "").trim();
  if (!newPath) return;
  if (!isPlainTextBookPath(newPath)) {
    await appAlert("请选择 txt 或 md 文件。");
    return;
  }

  const oldKey = fileHistoryKey(oldPath);
  const nextKey = fileHistoryKey(newPath);
  if (oldKey === nextKey) return;

  const newName = fileNameKey(newPath);

  let size = 0;
  try {
    const st = await window.colorTxt.stat(newPath);
    if (!st.isFile) {
      await appAlert("所选路径不是有效文件。");
      return;
    }
    size = typeof st.size === "number" ? st.size : 0;
  } catch {
    await appAlert("无法读取所选文件。");
    return;
  }

  const wasOpen =
    Boolean(currentFile.value) &&
    fileHistoryKey(currentFile.value!) === oldKey;

  txtFiles.value = txtFiles.value
    .filter((f) => {
      const k = fileHistoryKey(f.path);
      // 若新路径已在列表中，去掉旧的那条，避免重复
      if (k === nextKey && k !== oldKey) return false;
      return true;
    })
    .map((f) => {
      if (fileHistoryKey(f.path) !== oldKey) return f;
      return normalizeTxtFileItem({
        ...f,
        path: newPath,
        size,
      });
    });

  recentFiles.value = recentFiles.value.map((item) =>
    fileHistoryKey(item.path) === oldKey ? { ...item, path: newPath } : item,
  );

  let prevMeta = fileMetaRecords.value.find(
    (m) => fileHistoryKey(m.path) === oldKey,
  );
  if (!prevMeta) {
    const fallbackCandidates = fileMetaRecords.value.filter(
      (m) => m.fileName === fileNameKey(oldPath),
    );
    if (fallbackCandidates.length === 1) {
      prevMeta = fallbackCandidates[0];
    }
  }
  if (prevMeta) {
    const prevMetaKey = fileHistoryKey(prevMeta.path);
    const migrated: FileMetaRecord = {
      ...prevMeta,
      path: newPath,
      fileName: fileNameKey(newPath),
      // 纯文本替换不沿用电子书转换缓存路径
      convertedMdPath: undefined,
      sourceMtimeMsAtConvert: undefined,
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
  } else {
    // 原项无阅读数据：去掉可能挂在旧路径上的空壳，保留新路径已有 meta（若有）
    fileMetaRecords.value = fileMetaRecords.value.filter(
      (m) => fileHistoryKey(m.path) !== oldKey,
    );
  }

  if (metaProgressByPathKey.value.has(oldKey)) {
    const m = new Map(metaProgressByPathKey.value);
    const v = m.get(oldKey);
    m.delete(oldKey);
    m.delete(nextKey);
    if (typeof v === "number") m.set(nextKey, v);
    metaProgressByPathKey.value = m;
  } else if (metaProgressByPathKey.value.has(nextKey) && prevMeta) {
    // 已用旧 meta 覆盖新路径时，清掉仅属于新路径旧进度的映射（进度在 meta 内）
    const m = new Map(metaProgressByPathKey.value);
    if (typeof prevMeta.progress === "number") {
      m.set(nextKey, prevMeta.progress);
    }
    metaProgressByPathKey.value = m;
  }

  await migratePortraitBookDirIfNeeded(oldPath, newPath);

  persistFileListCache();
  persistRecentFiles();
  persistFileMeta();

  if (wasOpen) {
    await openFilePath(newPath, { keepSidebarTab: true });
  } else {
    if (
      physicalReaderPath.value &&
      fileHistoryKey(physicalReaderPath.value) === oldKey
    ) {
      physicalReaderPath.value = newPath;
    }
    if (
      activeStreamFilePath.value &&
      fileHistoryKey(activeStreamFilePath.value) === oldKey
    ) {
      activeStreamFilePath.value = newPath;
    }
  }

  appToast(`已替换为「${newName}」`, { kind: "success" });
}

function onOpenFileInNewWindow(path: string) {
  if (!path.trim()) return;
  window.colorTxt.openFileInNewWindow(path);
}

function onClearFileMeta(path: string) {
  const key = fileHistoryKey(path);
  if (!fileMetaRecords.value.some((m) => fileHistoryKey(m.path) === key)) {
    return;
  }
  removeFileMetaPaths([key]);
}

function metaHasClearableReadingData(rec: FileMetaRecord | undefined): boolean {
  if (!rec) return false;
  if ((rec.bookmarks?.length ?? 0) > 0) return true;
  if (rec.highlightWordsByIndex && Object.keys(rec.highlightWordsByIndex).length)
    return true;
  if ((rec.readerAnnotations?.length ?? 0) > 0) return true;
  if ((rec.characterRoster?.length ?? 0) > 0) return true;
  if (rec.characterBookStyle) return true;
  if (typeof rec.progress === "number") return true;
  if (rec.editorViewState != null) return true;
  if (typeof rec.viewportTopPhysicalLine === "number") return true;
  return false;
}

const showReadingDataPanel = ref(false);

const readingDataItems = computed(() => {
  const live = liveReadingProgressForUi.value;
  const cur = currentFile.value;
  const curKey = cur ? fileHistoryKey(cur) : "";
  const progressMap = metaProgressByPathKey.value;
  const rows = fileMetaRecords.value
    .filter((m) => metaHasClearableReadingData(m))
    .map((m) => {
      const k = fileHistoryKey(m.path);
      let progress: number | undefined;
      if (curKey && k === curKey && typeof live === "number") {
        progress = live;
      } else if (typeof m.progress === "number" && Number.isFinite(m.progress)) {
        progress = m.progress;
      } else {
        progress = progressMap.get(k);
      }
      const normalized = m.path.replace(/\\/g, "/");
      const slash = normalized.lastIndexOf("/");
      const fileName =
        slash >= 0 ? normalized.slice(slash + 1) : normalized || m.path;
      return {
        path: m.path,
        fileName,
        progress,
        lastOpenedAt: m.lastOpenedAt,
      };
    });
  return rows;
});

async function removePortraitCacheForBook(bookPath: string) {
  try {
    const rootRaw = characterPortraitCacheDir.value.trim();
    const root =
      rootRaw ||
      (await window.colorTxt.getDefaultCharacterPortraitCacheDir());
    if (root?.trim()) {
      const bookDir = characterPortraitBookDirAbs(
        root.trim(),
        sanitizeBookFolderSegment(bookPath),
      );
      await window.colorTxt.removePath(bookDir);
    }
  } catch {
    /* 目录不存在或删除失败不阻断清除 meta */
  }
}

/** 与 AI 助手一致：会话路径 + 正文文件 size/mtime → bookHash，再删对话/向量/分词 */
async function clearAiReadingTracesForReadingDataPath(
  sessionPath: string,
  meta: FileMetaRecord | null | undefined,
): Promise<void> {
  const session = sessionPath.trim();
  if (!session) return;
  const sessionKey = normalizeFileMetaPathKey(session);
  const curKey = currentFile.value?.trim()
    ? normalizeFileMetaPathKey(currentFile.value)
    : "";
  let physical = "";
  if (curKey && sessionKey === curKey && physicalReaderPath.value?.trim()) {
    physical = physicalReaderPath.value.trim();
  } else {
    const converted = meta?.convertedMdPath?.trim() ?? "";
    if (converted) {
      try {
        const st = await window.colorTxt.stat(converted);
        if (st.isFile) physical = converted;
      } catch {
        /* fall through */
      }
    }
    if (!physical) physical = session;
  }
  try {
    await clearAiReadingTracesForBook({
      sessionPath: session,
      physicalPath: physical,
    });
  } catch {
    /* AI 库不可用或路径失效时不阻断清除阅读数据 */
  }
}

/**
 * 清除若干路径的阅读数据（进度/书签/高亮/笔记/角色卡及立绘），
 * 并清除对应 AI 对话、向量索引与分词缓存。
 * 从 file.meta 删除路径并移出最近打开 → 直接覆盖写盘（不合并）→ 他窗经 storage 按磁盘重载。
 * 不关闭当前打开的文件。先落盘，再异步清 AI / 立绘。
 */
async function clearReadingDataForPaths(
  paths: string[],
  options?: { toast?: boolean },
): Promise<boolean> {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const raw of paths) {
    const p = raw?.trim();
    if (!p) continue;
    const k = normalizeFileMetaPathKey(p);
    if (seen.has(k)) continue;
    seen.add(k);
    unique.push(p);
  }
  if (unique.length === 0) return false;

  type ClearJob = {
    path: string;
    pathKey: string;
    prevExact: FileMetaRecord | null;
    isCurrent: boolean;
  };
  const jobs: ClearJob[] = [];
  const cur = currentFile.value?.trim() ?? "";
  const curKey = cur ? normalizeFileMetaPathKey(cur) : "";

  for (const path of unique) {
    const historyKey = fileHistoryKey(path);
    const pathKey = normalizeFileMetaPathKey(path);
    const shown = findFileMetaRecord(fileMetaRecords.value, path);
    const hadProgress = metaProgressByPathKey.value.has(historyKey);
    if (!metaHasClearableReadingData(shown) && !hadProgress) continue;
    const prevExact =
      fileMetaRecords.value.find(
        (m) => normalizeFileMetaPathKey(m.path) === pathKey,
      ) ?? null;
    jobs.push({
      path,
      pathKey,
      prevExact,
      isCurrent: Boolean(curKey && pathKey === curKey),
    });
  }

  if (jobs.length === 0) {
    if (options?.toast !== false) {
      appToast("没有可清除的阅读数据", { kind: "info" });
    }
    return false;
  }

  const touchedCurrent = jobs.some((j) => j.isCurrent);
  removeFileMetaPaths(jobs.map((j) => j.pathKey));

  if (touchedCurrent) {
    void refreshReaderHighlightDisplayLayer();
    bumpAnnotationDisplayEpoch();
    void readerSidebarRef.value?.reloadAiAssistantAfterChatHistoryCleared?.();
  }
  if (options?.toast !== false) {
    appToast("已清除阅读数据", { kind: "success" });
  }

  for (const job of jobs) {
    await clearAiReadingTracesForReadingDataPath(job.path, job.prevExact);
    await removePortraitCacheForBook(job.path);
  }
  return true;
}

async function clearCurrentFileReadingData() {
  const path = currentFile.value?.trim();
  if (!path) {
    await appAlert("请先打开文件");
    return;
  }
  const ok = await appConfirm(
    "将清除当前文件的阅读进度、书签、高亮词、笔记、角色卡（含立绘）、AI 对话记录、向量索引与分词缓存等数据，并从最近打开中移除；不会删除文件本身。",
    "清除阅读数据",
  );
  if (!ok) return;
  await clearReadingDataForPaths([path]);
}

async function onClearReadingDataPaths(paths: string[]) {
  await clearReadingDataForPaths(paths);
}

async function onClearAllReadingData() {
  const paths = readingDataItems.value.map((i) => i.path);
  if (paths.length === 0) {
    appToast("没有可清除的阅读数据", { kind: "info" });
    return;
  }
  const r = await window.colorTxt.showMessageBox({
    type: "warning",
    title: APP_DISPLAY_NAME,
    buttons: ["取消", "清空"],
    defaultId: 1,
    cancelId: 0,
    message: "是否清空全部阅读数据？",
    detail:
      "将清除全部文件的阅读数据；不会删除文件本身。",
    noLink: true,
  });
  if (r.response !== 1) return;
  await clearReadingDataForPaths(paths);
}

async function onRemoveMissingReadingDataFiles() {
  const paths = readingDataItems.value.map((i) => i.path);
  if (paths.length === 0) {
    appToast("没有可清除的阅读数据", { kind: "info" });
    return;
  }
  await appLoading.with("检查中", async () => {
    const missing: string[] = [];
    for (const p of paths) {
      try {
        // file:stat 对 ENOENT 返回 isFile/isDirectory 均为 false，不抛错
        const st = await window.colorTxt.stat(p);
        if (!st.isFile) missing.push(p);
      } catch {
        missing.push(p);
      }
    }
    if (missing.length === 0) {
      appToast("没有失效文件", { kind: "info" });
      return;
    }
    await clearReadingDataForPaths(missing);
  });
}

function openReadingDataPanel() {
  showReadingDataPanel.value = true;
}

function onDictionarySettingsUpdate(v: DictionarySettings) {
  dictionarySettings.value = mergeDictionarySettings(v);
}

function onWebSearchSettingsUpdate(v: WebSearchSettings) {
  webSearchSettings.value = mergeWebSearchSettings(v);
}

function onTranslationSettingsUpdate(v: TranslationSettings) {
  translationSettings.value = mergeTranslationSettings(v);
  void persistTranslationSecretsToVault();
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
  currentFileBookmarks,
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
  textConvertZh,
  textConvertLetter,
  textConvertDigit,
  compressBlankLines,
  leadIndentFullWidth,
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
  bookPackUnpacking,
  ebookConversionSourcePath,
  ebookConvertProgressText,
  fileMetaRecords,
  bookPackUnpackDir,
  bookPackPassword,
  characterPortraitCacheDir,
  applyCurrentFileCategoryIfConcrete: applyCurrentFileCategoryToPaths,
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
  pickTxtFilesIntoFileList,
  importPathsIntoFileList,
  refreshFileListDirectories,
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

/** 文件列表页签头部「刷新」：重新扫描已添加文件夹，把新文件并入列表 */
async function onRefreshFileList() {
  const result = await refreshFileListDirectories();
  if (result.kind === "noRoots") {
    appToast("没有可刷新的文件夹：请先通过「选择目录」或拖入文件夹添加书籍", {
      kind: "info",
    });
    return;
  }
  if (result.kind === "busy") {
    appToast("正在扫描中，请稍候…", { kind: "info" });
    return;
  }
  if (result.failedDirs.length > 0) {
    appToast(
      `已刷新：新增 ${result.added} 个文件；${result.failedDirs.length} 个目录无法访问`,
      { kind: "warning" },
    );
    return;
  }
  if (result.added > 0) {
    appToast(`刷新完成，新增 ${result.added} 个文件`, { kind: "success" });
  } else {
    appToast("文件列表已是最新", { kind: "info" });
  }
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
  compressBlankLines,
  leadIndentFullWidth,
  captureViewportRestoreAnchor,
  captureViewportAnchorPhysicalLine,
  withChapterListScrollSuppressed,
  onAfterChapterListRefresh: async () => {
    await nextTick();
    await readerSidebarRef.value?.centerActiveChapterInList?.(false);
  },
  readingRulerEnabled,
  isVoiceReadActive: () => isVoiceReadActive.value,
});

/** 视口已按物理行恢复且 probe 已更新后：重算章节并居中侧栏（加载结束等） */
async function syncChaptersAfterViewportSettled() {
  try {
    await chapterNav.refreshChapterListFromReaderAsync?.();
    await nextTick();
    await readerSidebarRef.value?.centerActiveChapterInList?.(false);
  } finally {
    // 退出编辑后 openFilePath 会保持 suppress 直至流式加载结束；此处解除以恢复滚动换章居中
    suppressChapterListAutoScroll.value = false;
  }
}

/** 段间距 / 换行优化等布局恢复后：activeChapterIdx 常不变，需强制重居中章节列表 */
function onLayoutViewportRestored() {
  if (suppressChapterListAutoScroll.value) return;
  void readerSidebarRef.value?.centerActiveChapterInList?.(false);
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
  synthesizingPhase: voiceReadSynthesizingPhase,
  toolbarRate: voiceReadToolbarRate,
  toolbarVolume: voiceReadToolbarVolume,
  setToolbarVolume: setVoiceReadToolbarVolume,
  canStartVoiceRead: canVoiceRead,
  isVoiceReadActive,
  isVoiceReadScrollLocked,
  isVoiceReadBlocksFind,
  isVoiceReadHeaderLocked,
  isVoiceReadNavigationBlocked,
  voiceReadFooterStatus,
  toggleVoiceReadToolbar,
  togglePlayPause: voiceReadTogglePlayPause,
  exitVoiceRead,
  playPrevLine: voiceReadPlayPrevLine,
  playNextLine: voiceReadPlayNextLine,
  regenerateCurrentLine: voiceReadRegenerateCurrentLine,
  canPlayPrevLine: voiceReadCanPlayPrevLine,
  canPlayNextLine: voiceReadCanPlayNextLine,
} = useAppVoiceRead({
  readerRef,
  voiceReadSettings,
  voiceReadProfiles,
  activeVoiceReadProfileId,
  currentFile,
  loading,
  readerEditMode,
  monacoSmoothScrolling,
  aiFeaturesEnabled,
  characterRoster: currentFileCharacterRoster,
  chapters,
});

const {
  searchQuery,
  searchResults,
  searchInProgress,
  activeSearchResult,
  hasInlineSearchHighlight,
  searchMatchCase,
  searchWholeWord,
  searchUseRegex,
  scheduleSidebarSearch,
  clearReaderInlineSearchHighlight,
  onJumpToSearchResult,
} = useAppSidebarSearch({
  readerRef,
  stream,
  currentFile,
  loading,
  totalLineCount,
  readerEditMode,
  textConvertZh,
  textConvertLetter,
  textConvertDigit,
  compressBlankLines,
  leadIndentFullWidth,
  isVoiceReadNavigationBlocked,
  ensurePinBeforeRevealFindWidget,
});

const {
  readerDisplayHighlightWordsByIndex,
  readerDisplayHighlightWordsBookOnly,
  currentFileHighlightTerms,
  refreshReaderHighlightDisplayLayer,
  onAddHighlightTerm,
  onRemoveHighlightTerm,
  onFavoriteHighlightTerm,
  onUnfavoriteHighlightTerm,
  onCommitHighlightGroup,
  onMergeHighlightGroups,
  onSplitHighlightTerm,
  clearCurrentFileHighlightTerms,
  onExportBookHighlightsJson,
  onImportBookHighlightsJson,
  onExportFavoriteHighlightsJson,
  onImportFavoriteHighlightsJson,
  onFindHighlightTermFromSidebar,
} = useAppHighlightTerms({
  readerRef,
  currentFile,
  loading,
  totalLineCount,
  readerEditMode,
  fileMetaRecords,
  highlightWordsByIndexGlobal,
  highlightColorsForReader,
  currentTheme,
  readerSurfaceLight,
  readerSurfaceDark,
  textConvertZh,
  textConvertLetter,
  textConvertDigit,
  persistFileMeta,
  persistSettings,
  isVoiceReadNavigationBlocked,
  ensurePinBeforeRevealFindWidget,
  hasInlineSearchHighlight,
});

const {
  currentFileAnnotations,
  annotationListGroups,
  bumpAnnotationDisplayEpoch,
  revalidateCurrentFileAnnotations,
  refreshCurrentFileAnnotationDisplayTexts,
  onUpsertReaderAnnotation,
  onRemoveReaderAnnotation,
  onClearStaleReaderAnnotations,
  onJumpToReaderAnnotation,
  onClearReaderAnnotationsWithConfirm,
  onExportAnnotationsMd,
  onExportAnnotationsJson,
  onImportAnnotationsJson,
} = useAppReaderAnnotations({
  readerRef,
  stream,
  currentFile,
  readerEditMode,
  fileMetaRecords,
  chapters,
  leadIndentFullWidth,
  textConvertZh,
  textConvertLetter,
  textConvertDigit,
  compressBlankLines,
  persistFileMeta,
  isVoiceReadNavigationBlocked,
  ensurePinBeforeRevealFindWidget,
});

afterStreamFullTextInstalled = async () => {
  await new Promise<void>((resolve) => {
    const ric = (
      globalThis as typeof globalThis & {
        requestIdleCallback?: (
          cb: () => void,
          opts?: { timeout: number },
        ) => number;
      }
    ).requestIdleCallback;
    if (typeof ric === "function") {
      ric(() => resolve(), { timeout: 120 });
    } else {
      window.setTimeout(resolve, 16);
    }
  });
  const imgAnchors = await readerRef.value?.applyEmbeddedImageAnchors(
    physicalReaderPath.value,
  );
  // 插图删行会改变 Monaco 行数；须同步 display↔physical 映射（含未压缩空行），否则内链跳转错位。
  if (imgAnchors?.deletedOriginalLineNumbersDesc?.length) {
    stream.removeFilteredDisplayLinesAtOriginalIndices(
      imgAnchors.deletedOriginalLineNumbersDesc,
    );
  }
  if (imgAnchors?.deletedOriginalLineNumbersDesc?.length) {
    readerRef.value?.shiftPendingEbookSidecarForDeletedDisplayLines?.(
      imgAnchors.deletedOriginalLineNumbersDesc,
    );
  }
  stream.resyncFormattedDisplayLinesFromReader?.();
  if (currentFileIsMarkdown.value && !readerEditMode.value) {
    await readerRef.value?.applyMarkdownInternalLinks?.();
  }
  stream.resyncMirrorFromReader();
  revalidateCurrentFileAnnotations();
  refreshCurrentFileAnnotationDisplayTexts();
  bumpAnnotationDisplayEpoch();
  readerRef.value?.refreshReaderAnnotationDecorations?.();
};

const {
  isTimedScrollActive,
  canStartTimedScroll,
  toggleTimedScroll,
  nudgeTimedScrollTimer,
} = useAppTimedScroll({
  readerRef,
  timedScrollSettings,
  currentFile,
  loading,
  readerEditMode,
  viewportAtBottom,
  isVoiceReadActive,
});

function onProbeLineChangeForTimedScroll(
  probeLine: number,
  fromReadingScroll?: boolean,
  fromAnyScroll?: boolean,
) {
  onProbeLineChange(probeLine, fromReadingScroll);
  if (fromAnyScroll === true) nudgeTimedScrollTimer();
}

function onVoiceReadToggle() {
  if (!isVoiceReadActive.value && isTimedScrollActive.value) return;
  toggleVoiceReadToolbar();
}

function guardReaderNavigation(action: () => void): void {
  if (isVoiceReadNavigationBlocked.value) return;
  action();
}

function onJumpToChapterFromSidebar(ch: Chapter) {
  guardReaderNavigation(() => jumpToChapter(ch));
}

function jumpToBookmarkWithVoiceRead(line: number) {
  guardReaderNavigation(() => jumpToBookmark(line));
}

function jumpToPrevChapterWithVoiceRead() {
  guardReaderNavigation(() => jumpToPrevChapter());
}

function jumpToNextChapterWithVoiceRead() {
  guardReaderNavigation(() => jumpToNextChapter());
}

const showReaderChapterNav = computed(
  () =>
    chapterNavToolbarEnabled.value &&
    Boolean(currentFile.value) &&
    chapters.value.length > 1,
);

const readerChapterNavUiVisible = computed(
  () => showReaderChapterNav.value && !isVoiceReadActive.value,
);

const readerChapterNavVisible = computed(
  () =>
    readerChapterNavUiVisible.value &&
    (!chromeAutoHide.value || showFullscreenFooter.value),
);

const readerChapterNavBusy = computed(
  () => loading.value || isVoiceReadNavigationBlocked.value,
);

const readerChapterNavActiveIdx = computed(() => {
  if (activeChapterIdx.value >= 0) return activeChapterIdx.value;
  return pickActiveChapterIdx(chapters.value, lastProbeLine.value);
});

const readerChapterNavCanPrev = computed(
  () => showReaderChapterNav.value && readerChapterNavActiveIdx.value > 0,
);

const readerChapterNavCanNext = computed(() => {
  if (!showReaderChapterNav.value) return false;
  const idx = readerChapterNavActiveIdx.value;
  if (idx === -1) return true;
  return idx + 1 < chapters.value.length;
});

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

async function onApplyPartialPhysicalEdit(payload: {
  range: {
    startPhysicalLine: number;
    startColumn: number;
    endPhysicalLine: number;
    endColumn: number;
  };
  text: string;
}) {
  if (readerEditMode.value) return;
  if (!canEnterReaderEditMode.value) {
    appToast("请等待当前文件加载完成后再编辑。", { kind: "info" });
    return;
  }
  const p = physicalReaderPath.value;
  if (!p || !window.colorTxt?.writeTextFile) {
    appToast("无法保存：文件路径不可用。", { kind: "danger" });
    return;
  }
  const nextText = stream.buildPlainTextAfterPhysicalReplace(
    payload.range,
    payload.text,
  );
  if (nextText == null) {
    appToast("无法应用局部编辑（选区映射失败）。", { kind: "danger" });
    return;
  }
  if (readerFileSaving.value) return;
  readerFileSaving.value = true;
  try {
    await appLoading.with("保存中", async () => {
      const normalized = normalizeIpcEncoding(readerSaveEncoding.value);
      const written = await window.colorTxt.writeTextFile(p, nextText, normalized);
      if (!written.ok) {
        void appAlert(written.message ?? "保存失败");
        return;
      }
      readerSaveEncoding.value = normalized;
      fileEncoding.value = formatTextEncodingLabel(normalized);
      stream.commitPhysicalLinesFromPlainText(nextText);
      const anchor =
        captureViewportRestoreAnchor() ?? {
          physicalLine: payload.range.startPhysicalLine,
          wrappedLineIndex: 0,
        };
      await withChapterListScrollSuppressed(async () => {
        const ok = await stream.applyReaderDisplayFromPhysicalLines(anchor);
        if (!ok) {
          appToast("已写入磁盘，但刷新阅读显示失败，请重新打开文件。", {
            kind: "warning",
          });
          return;
        }
        await syncChaptersAfterViewportSettled();
      });
      revalidateCurrentFileAnnotations();
      refreshCurrentFileAnnotationDisplayTexts();
      bumpAnnotationDisplayEpoch();
      readerRef.value?.refreshReaderAnnotationDecorations?.();
      appToast("已保存局部修改", { kind: "success" });
    });
  } finally {
    readerFileSaving.value = false;
  }
}

function toggleReaderClickMode() {
  readerClickMode.value = !readerClickMode.value;
  persistSettings();
}

function toggleReadingRuler() {
  if (isVoiceReadActive.value) return;
  readingRulerEnabled.value = !readingRulerEnabled.value;
  persistSettings();
}

async function onToggleReaderEdit() {
  if (readerEditMode.value && aiSmartFormatReviewSession.value) {
    appToast("排版预览进行中，请先点击「应用」或「放弃」。", { kind: "info" });
    return;
  }
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
      appToast("请等待当前文件加载完成后再进入编辑模式。", { kind: "info" });
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
  if (aiSmartFormatReviewSession.value) {
    readerRef.value?.applySmartFormatReviewCompressBlankLines?.(
      compressBlankKeepOneBlank.value,
      chapterTitleBlankMode.value,
    );
    return;
  }
  void runEditFormatWithChapterSync(() =>
    readerRef.value?.applyEditFormatCompressBlankLines?.(
      compressBlankKeepOneBlank.value,
      chapterTitleBlankMode.value,
    ),
  );
}

function onFormatEditLeadIndentFullWidth() {
  if (aiSmartFormatReviewSession.value) {
    readerRef.value?.applySmartFormatReviewLeadIndentFullWidth?.();
    return;
  }
  void runEditFormatWithChapterSync(() =>
    readerRef.value?.applyEditFormatLeadIndentFullWidth?.(),
  );
}

function onApplyTextConvertZhEdit(mode: Exclude<TextConvertZhMode, "off">) {
  void runEditFormatWithChapterSync(() =>
    readerRef.value?.applyEditFormatTextConvertZh?.(mode),
  );
}

function onApplyTextConvertLetterEdit(
  mode: Exclude<TextConvertWidthMode, "off">,
) {
  void runEditFormatWithChapterSync(() =>
    readerRef.value?.applyEditFormatTextConvertLetters?.(mode),
  );
}

function onApplyTextConvertDigitEdit(
  mode: Exclude<TextConvertWidthMode, "off">,
) {
  void runEditFormatWithChapterSync(() =>
    readerRef.value?.applyEditFormatTextConvertDigits?.(mode),
  );
}

function onApplyReplaceRuleFormat(rules: ReplaceRule[]) {
  void runEditFormatWithChapterSync(() =>
    readerRef.value?.applyEditFormatTextReplace?.(rules),
  );
}

const smartFormatCtl = useAiSmartFormat({
  readerRef,
  chapters,
  aiSmartFormat,
  aiFeaturesEnabled,
  aiSkillOverrides,
  compressBlankKeepOneBlank,
  chapterTitleBlankMode,
  runEditFormatWithChapterSync,
  onReaderEditDirty: () => {
    onReaderEditContentChange();
  },
  resyncMirrorFromReader: () => stream.resyncMirrorFromReader(),
});
const {
  running: aiSmartFormatRunning,
  progressOpen: aiSmartFormatProgressOpen,
  progressCurrent: aiSmartFormatProgressCurrent,
  progressTotal: aiSmartFormatProgressTotal,
  progressShowTokenUsage: aiSmartFormatProgressShowTokenUsage,
  progressTokenUsage: aiSmartFormatProgressTokenUsage,
  progressTokenUsageAvailable: aiSmartFormatProgressTokenUsageAvailable,
  progressTokenPricePerMillion: aiSmartFormatProgressTokenPricePerMillion,
  reviewSession: aiSmartFormatReviewSession,
  runSmartFormat: runAiSmartFormat,
  stopSmartFormat: stopAiSmartFormat,
  applySmartFormatReview,
  discardSmartFormatReview,
} = smartFormatCtl;

async function confirmAndRunAiSmartFormatFull() {
  const ok = await appConfirm(
    "如果只想对特定选区进行排版，可在编辑器中选中相应文本 → 右键 →「AI 智能排版：选中文本」。",
    "将进行全文智能排版，是否继续？",
  );
  if (!ok) return;
  void runAiSmartFormat("full");
}

function onAiSmartFormatFull() {
  void confirmAndRunAiSmartFormatFull();
}

function onAiSmartFormatSelection() {
  void runAiSmartFormat("selection");
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
  guardReaderNavigation(() => {
    ensurePinBeforeRevealFindWidget();
    jumpToChapter(ch);
  });
}

const readerUi = useAppReaderUiPrefs({
  readerRef,
  readerFontSize,
  readerLineHeightMultiple,
  readerLineSpacingPx,
  readerLetterSpacingPx,
  readerHorizontalInsetPx,
  monacoFontFamily,
  pinnedOtherFonts,
  monacoCustomHighlight,
  monacoAdvancedWrapping,
  compressBlankLines,
  leadIndentFullWidth,
  textConvertZh,
  textConvertLetter,
  textConvertDigit,
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
  showReaderHudTip,
});

const {
  onViewportTopLineChange,
  onViewportEndLineChange,
  onViewportVisualProgressChange,
  increaseFontSize,
  decreaseFontSize,
  increaseLineHeight,
  decreaseLineHeight,
  increaseLetterSpacing,
  decreaseLetterSpacing,
  increaseParagraphSpacing,
  decreaseParagraphSpacing,
  increaseHorizontalInset,
  decreaseHorizontalInset,
  setMonacoFontFamily,
  togglePinnedOtherFont,
  toggleMonacoCustomHighlight,
  toggleMonacoAdvancedWrapping,
  toggleCompressBlankLines,
  toggleLeadIndentFullWidth,
  setTextConvertZhRead,
  setTextConvertLetterRead,
  setTextConvertDigitRead,
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

function openFindBookWindow() {
  window.colorTxt.openFindBookWindow();
}

const canEnterStealth = computed(
  () => Boolean(currentFile.value) && !loading.value,
);

/** 阅读区（Monaco）在屏幕上的位置；供首次摸鱼窗对齐用。 */
async function resolveReaderAreaScreenBounds(): Promise<{
  x: number;
  y: number;
  width: number;
  height: number;
} | null> {
  const dom = readerRef.value?.getReaderEditorDomNode?.() ?? null;
  if (!dom) return null;
  const r = dom.getBoundingClientRect();
  if (r.width < 8 || r.height < 8) return null;
  const content = await window.colorTxt.getWindowContentBounds();
  const originX = content?.x ?? window.screenX;
  const originY = content?.y ?? window.screenY;
  return {
    x: Math.round(originX + r.left),
    y: Math.round(originY + r.top),
    width: Math.round(r.width),
    height: Math.round(r.height),
  };
}

async function enterStealthMode() {
  const reader = readerRef.value;
  const body = reader?.getAllText() ?? "";
  if (!body) {
    appToast("没有可阅读的正文", { kind: "warning", duration: 2000 });
    return;
  }
  const startLine = reader?.getViewportTopLine() ?? 1;
  const chaps = chapters.value.map((c) => ({
    title: c.title,
    lineNumber: c.lineNumber,
    tocOrder: c.tocOrder,
  }));
  const saved = loadStealthReaderSettings();
  const bounds =
    saved.bounds ?? (await resolveReaderAreaScreenBounds()) ?? undefined;
  const result = await window.colorTxt.stealthReaderEnter({
    text: body,
    startLine,
    chapters: chaps,
    bounds,
    exitAccelerator: shortcutBindings.value.enterStealthReader || "F9",
    navShortcuts: saved.shortcuts,
  });
  if (!result?.ok) {
    appToast(result?.message || "无法进入摸鱼模式", {
      kind: "warning",
      duration: 2200,
    });
  }
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

/** 底栏路径菜单：忽略缓存，强制重新转换电子书源文件 */
async function reconvertCurrentEbookFromDisk() {
  const path = currentFile.value;
  if (!path || !isEbookFilePath(path)) return;
  await openFilePath(path, {
    keepSidebarTab: true,
    forceEbookConvert: true,
  });
}

async function exportCurrentReaderBookPack(includeReadingProgress: boolean) {
  const sessionPath = currentFile.value?.trim();
  const physicalPath =
    physicalReaderPath.value?.trim() || sessionPath || "";
  if (!sessionPath || !physicalPath) {
    await appAlert("请先打开文件");
    return;
  }
  const {
    buildReaderBookPackDefaultName,
    buildReaderBookPackZip,
    saveReaderBookPackFile,
  } = await import("./utils/readerBookPack");
  let viewportTopPhysicalLine: number | undefined;
  if (includeReadingProgress) {
    const top = readerRef.value?.getViewportTopLine?.();
    if (typeof top === "number" && Number.isFinite(top)) {
      viewportTopPhysicalLine = readerEditMode.value
        ? Math.max(1, Math.floor(top))
        : stream.viewportDisplayLineToPhysicalLine(top);
    }
  }
  try {
    const zipBuffer = await buildReaderBookPackZip({
      physicalContentPath: physicalPath,
      sessionFilePath: sessionPath,
      meta: findFileMetaRecord(fileMetaRecords.value, sessionPath),
      portraitCacheDir: characterPortraitCacheDir.value,
      includeReadingProgress,
      viewportTopPhysicalLine,
      password: bookPackPassword.value,
    });
    const encrypted = Boolean(bookPackPassword.value.trim());
    const name = buildReaderBookPackDefaultName(
      fileNameKey(sessionPath),
      encrypted,
    );
    const r = await saveReaderBookPackFile(name, zipBuffer, encrypted);
    if (!r.ok) {
      if ("error" in r) await appAlert(r.error);
      return;
    }
    appToast(
      includeReadingProgress ? "已导出书包（含阅读进度）" : "已导出书包",
      { kind: "success" },
    );
  } catch (e) {
    await appAlert(e instanceof Error ? e.message : String(e));
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    const sub = bytes.subarray(i, Math.min(i + chunk, bytes.length));
    binary += String.fromCharCode(...sub);
  }
  return btoa(binary);
}

async function uploadCurrentReaderBookPackToWebDav() {
  if (webDavBookPackProgress.value) return;
  const sessionPath = currentFile.value?.trim();
  const physicalPath =
    physicalReaderPath.value?.trim() || sessionPath || "";
  if (!sessionPath || !physicalPath) {
    await appAlert("请先打开文件");
    return;
  }
  const auth = buildWebDavAuth({
    webDavEnabled: webDavEnabled.value,
    webDavUrl: webDavUrl.value,
    webDavUsername: webDavUsername.value,
    webDavRemoteDir: webDavRemoteDir.value,
  });
  if (!auth || !window.colorTxt?.webdav) {
    appToast("请先在设置中配置 WebDAV", { kind: "warning" });
    return;
  }
  const requestId = beginWebDavBookPackProgress("upload");
  const {
    buildReaderBookPackDefaultName,
    buildReaderBookPackZip,
  } = await import("./utils/readerBookPack");
  let viewportTopPhysicalLine: number | undefined;
  const top = readerRef.value?.getViewportTopLine?.();
  if (typeof top === "number" && Number.isFinite(top)) {
    viewportTopPhysicalLine = readerEditMode.value
      ? Math.max(1, Math.floor(top))
      : stream.viewportDisplayLineToPhysicalLine(top);
  }
  try {
    const zipBuffer = await buildReaderBookPackZip({
      physicalContentPath: physicalPath,
      sessionFilePath: sessionPath,
      meta: findFileMetaRecord(fileMetaRecords.value, sessionPath),
      portraitCacheDir: characterPortraitCacheDir.value,
      includeReadingProgress: true,
      viewportTopPhysicalLine,
      password: bookPackPassword.value,
    });
    const encrypted = Boolean(bookPackPassword.value.trim());
    const name = buildReaderBookPackDefaultName(
      fileNameKey(sessionPath),
      encrypted,
    );
    const tempRoot = await window.colorTxt.getPath("temp");
    if (!tempRoot) {
      await appAlert("无法获取临时目录");
      return;
    }
    const tempDir = joinFs(tempRoot, "colortxt-webdav-upload");
    await window.colorTxt.mkdir(tempDir);
    const tempPath = joinFs(tempDir, name);
    await window.colorTxt.writeBinaryFile(
      tempPath,
      arrayBufferToBase64(zipBuffer),
    );
    const ensure = await window.colorTxt.webdav.ensureLayout(auth);
    if (!ensure.ok) {
      appToast(ensure.error, { kind: "danger" });
      return;
    }
    const put = await window.colorTxt.webdav.putFile(
      auth,
      `Books/${name}`,
      tempPath,
      "application/octet-stream",
      requestId,
    );
    try {
      await window.colorTxt.removePath(tempPath);
    } catch {
      /* ignore */
    }
    if (!put.ok) {
      appToast(put.error, { kind: "danger" });
      return;
    }
    appToast(`已上传书包：${name}`, { kind: "success" });
  } catch (e) {
    await appAlert(e instanceof Error ? e.message : String(e));
  } finally {
    endWebDavBookPackProgress();
  }
}

async function updateCurrentReaderBookPackFromWebDav() {
  if (webDavBookPackProgress.value) return;
  const sessionPath = currentFile.value?.trim();
  if (!sessionPath) {
    await appAlert("请先打开文件");
    return;
  }
  const auth = buildWebDavAuth({
    webDavEnabled: webDavEnabled.value,
    webDavUrl: webDavUrl.value,
    webDavUsername: webDavUsername.value,
    webDavRemoteDir: webDavRemoteDir.value,
  });
  if (!auth || !window.colorTxt?.webdav) {
    appToast("请先在设置中配置 WebDAV", { kind: "warning" });
    return;
  }
  const requestId = beginWebDavBookPackProgress("sync");
  const { buildReaderBookPackDefaultName } = await import(
    "./utils/readerBookPack"
  );
  const encrypted = Boolean(bookPackPassword.value.trim());
  const preferred = buildReaderBookPackDefaultName(
    fileNameKey(sessionPath),
    encrypted,
  );
  const fallback = buildReaderBookPackDefaultName(
    fileNameKey(sessionPath),
    !encrypted,
  );
  const names = preferred === fallback ? [preferred] : [preferred, fallback];
  let downloadedPath: string | null = null;
  let lastError = "";
  try {
    for (const name of names) {
      const r = await window.colorTxt.webdav.getToFile(
        auth,
        `Books/${name}`,
        name,
        requestId,
      );
      if (r.ok) {
        downloadedPath = r.filePath;
        break;
      }
      lastError = r.error;
    }
    if (!downloadedPath) {
      appToast(lastError || "远端未找到对应书包", { kind: "danger" });
      return;
    }
    endWebDavBookPackProgress();
    const opened = await openFilePath(downloadedPath);
    if (opened) {
      appToast("已从 WebDAV 同步书包", { kind: "success" });
    }
  } catch (e) {
    await appAlert(e instanceof Error ? e.message : String(e));
  } finally {
    endWebDavBookPackProgress();
  }
}

async function onWebDavImportPackPaths(
  paths: string[],
  opts?: {
    silent?: boolean;
    passwordBook?: string[];
    skipOnDecryptFail?: boolean;
  },
): Promise<{
  imported: Array<{ packPath: string; openPath: string }>;
  okCount: number;
  skipCount: number;
  failCount: number;
  passwordBook: string[];
  skipOnDecryptFail: boolean;
}> {
  if (!paths.length) {
    return {
      imported: [],
      okCount: 0,
      skipCount: 0,
      failCount: 0,
      passwordBook: opts?.passwordBook ? [...opts.passwordBook] : [],
      skipOnDecryptFail: opts?.skipOnDecryptFail ?? false,
    };
  }
  return await importPathsIntoFileList(paths, opts);
}

function onWebDavConfigDownloaded() {
  loadPersistedSettings();
  refreshReplaceRulesCache();
  // loadPersistedSettings 只写 ref；字号/行间距/字体等需推到 Monaco 才生效
  applyReaderAppearanceFromSettings();
  applyRecentFilesHistoryLimitFromSettings();
  // 替换、转换、压缩空行、行首缩进、章节字数等可能已变，按物理行重跑展示
  reformatReaderDisplayPreservingViewport();
}

function quitApp() {
  void (async () => {
    if (readerEditMode.value && readerEditorDirty.value) {
      if (!(await confirmReaderEditDiscardUnsaved())) return;
    }
    window.colorTxt.quitApp();
  })();
}

function applyReaderAppearanceFromSettings() {
  applyReaderSurfaceToDocument(
    currentTheme.value,
    readerSurfaceLight.value,
    readerSurfaceDark.value,
  );
  void applyReaderBackgroundForPalettes(
    currentTheme.value,
    readerBackground.value,
    readerSurfaceLight.value,
    readerSurfaceDark.value,
  );
  readerRef.value?.setTheme(currentTheme.value);
  readerRef.value?.setFontSize(readerFontSize.value);
  readerRef.value?.setLineHeightMultiple(readerLineHeightMultiple.value);
  readerRef.value?.setLineSpacingPx(readerLineSpacingPx.value);
  readerRef.value?.setLetterSpacingPx(readerLetterSpacingPx.value);
  readerRef.value?.setFontFamily(monacoFontFamily.value);
  readerRef.value?.setWrappingStrategyAdvanced(monacoAdvancedWrapping.value);
}

function refreshReaderSurfaceAfterPaletteChange() {
  applyReaderSurfaceToDocument(
    currentTheme.value,
    readerSurfaceLight.value,
    readerSurfaceDark.value,
  );
  void applyReaderBackgroundForPalettes(
    currentTheme.value,
    readerBackground.value,
    readerSurfaceLight.value,
    readerSurfaceDark.value,
  );
  readerRef.value?.setTheme(currentTheme.value);
}

function onApplyColorScheme(payload: ColorSchemeApplyPayload) {
  if (payload.reader) {
    const persisted = toPersistedReaderPaletteState(payload.reader);
    readerPaletteColorEnabledOverrides.value =
      persisted.readerPaletteColorEnabledOverrides;
    readerPaletteUserPresets.value = persisted.readerPaletteUserPresets;
    readerPaletteSelectedIdLight.value = persisted.readerPaletteSelectedIdLight;
    readerPaletteSelectedIdDark.value = persisted.readerPaletteSelectedIdDark;
    if (payload.reader.background) {
      readerBackground.value = cloneReaderBackgroundState(
        payload.reader.background,
      );
    }
  }
  if (payload.highlight) {
    highlightColorsLight.value = mergeHighlightColors(
      DEFAULT_HIGHLIGHT_COLORS_LIGHT,
      payload.highlight.light.length >= MIN_HIGHLIGHT_COLORS
        ? payload.highlight.light
        : undefined,
    );
    highlightColorsDark.value = mergeHighlightColors(
      DEFAULT_HIGHLIGHT_COLORS_DARK,
      payload.highlight.dark.length >= MIN_HIGHLIGHT_COLORS
        ? payload.highlight.dark
        : undefined,
    );
  }
  if (payload.lineation) {
    lineationColorsLight.value = mergeLineationColors(
      DEFAULT_LINEATION_COLORS_LIGHT,
      payload.lineation.light.length >= MIN_LINEATION_COLORS
        ? payload.lineation.light
        : undefined,
    );
    lineationColorsDark.value = mergeLineationColors(
      DEFAULT_LINEATION_COLORS_DARK,
      payload.lineation.dark.length >= MIN_LINEATION_COLORS
        ? payload.lineation.dark
        : undefined,
    );
    lineationLastColors.value = clampLineationLastColorsToCount(
      lineationLastColors.value,
      lineationColorsForReader.value.length,
    );
  }
  persistSettings();
  if (payload.reader) {
    refreshReaderSurfaceAfterPaletteChange();
  }
}

function onUpdateLineationLastColor(payload: {
  type: ReaderLineationType;
  colorIndex: number;
}) {
  lineationLastColors.value = clampLineationLastColorsToCount(
    {
      ...lineationLastColors.value,
      [payload.type]: payload.colorIndex,
    },
    lineationColorsForReader.value.length,
  );
  persistSettings();
}

async function onExportBookmarksJson() {
  const path = currentFile.value;
  const list = currentFileBookmarks.value;
  if (!path || list.length === 0) return;
  const {
    buildBookmarkExportDefaultName,
    buildReaderBookmarksExportJson,
    saveBookmarkExportFile,
  } = await import("./utils/readerBookmarkExport");
  const name = buildBookmarkExportDefaultName(fileNameKey(path));
  const data = buildReaderBookmarksExportJson(
    path,
    fileNameKey(path),
    list,
  );
  const r = await saveBookmarkExportFile(name, data);
  if (!r.ok && "error" in r) await appAlert(r.error);
}

async function onImportBookmarksJson() {
  const path = currentFile.value;
  if (!path) return;
  const {
    mergeImportedBookmarks,
    parseReaderBookmarksExportJson,
    pickAndReadBookmarkJsonFile,
  } = await import("./utils/readerBookmarkExport");
  const picked = await pickAndReadBookmarkJsonFile();
  if (!picked.ok) {
    if ("error" in picked) await appAlert(picked.error);
    return;
  }
  const envelope = parseReaderBookmarksExportJson(picked.text);
  if (!envelope) {
    await appAlert("无效的书签 JSON 文件");
    return;
  }
  if (
    envelope.bookPath.replace(/\\/g, "/").toLowerCase() !==
    path.replace(/\\/g, "/").toLowerCase()
  ) {
    const ok = await appConfirm("该文件来自其他书籍，仍导入到当前书？");
    if (!ok) return;
  }
  const merged = mergeImportedBookmarks(
    currentFileBookmarks.value,
    envelope.bookmarks,
  );
  fileMetaRecords.value = upsertFileMetaRecord(
    fileMetaRecords.value,
    path,
    () => ({ bookmarks: merged }),
  );
  persistFileMeta();
  appToast(`已导入 ${envelope.bookmarks.length} 条书签`, { kind: "success" });
}

function onAskAiWithQuote(text: string) {
  sidebarTab.value = "aiAssistant";
  showSidebar.value = true;
  void nextTick(() => {
    readerSidebarRef.value?.prefillAiAssistantQuotedText?.(text);
  });
}

function onSearchWithQuote(text: string) {
  const q = text.trim();
  if (!q) return;
  sidebarTab.value = "search";
  showSidebar.value = true;
  searchQuery.value = q;
}

function openReaderSidebarTab(tab: ReaderSidebarTab) {
  if (tab === "aiAssistant" && !aiFeaturesEnabled.value) return;
  sidebarTab.value = tab;
  showSidebar.value = true;
  if (chromeAutoHide.value) revealFullscreenSidebar();
}

function openSidebarSearch() {
  const sel = readerRef.value?.getSelectedText?.()?.trim() ?? "";
  openReaderSidebarTab("search");
  if (sel) searchQuery.value = sel;
  void nextTick(() => {
    readerSidebarRef.value?.focusSidebarSearchInput?.();
  });
}

watch(readerEditMode, (edit) => {
  if (!edit) {
    clearChapterRefreshDebounce();
    readerEditCursorStatus.value = null;
  }
});

onBeforeUnmount(() => {
  clearChapterRefreshDebounce();
});

async function applySettings(payload: SettingsApplyPayload) {
  const prevCompressBlankKeepOneBlank = compressBlankKeepOneBlank.value;
  const prevChapterTitleBlankMode = chapterTitleBlankMode.value;
  const prevChapterMinCharCount = chapterMinCharCount.value;
  monacoSmoothScrolling.value = payload.monacoSmoothScrolling;
  monacoCjkWrapOptimize.value = payload.monacoCjkWrapOptimize;
  mouseWheelScrollSensitivity.value = clampMouseWheelScrollSensitivity(
    payload.mouseWheelScrollSensitivity,
  );
  fastScrollSensitivity.value = clampFastScrollSensitivity(
    payload.fastScrollSensitivity,
  );
  stickyChapterTitleEnabled.value = payload.stickyChapterTitleEnabled;
  readingRulerEnabled.value = payload.readingRulerEnabled;
  readingRulerFocusLines.value = clampReadingRulerFocusLines(
    payload.readingRulerFocusLines,
  );
  readingRulerDimOpacity.value = clampReadingRulerDimOpacity(
    payload.readingRulerDimOpacity,
  );
  readingRulerDimStickyTitle.value = payload.readingRulerDimStickyTitle;
  readingRulerTransitionEnabled.value = payload.readingRulerTransitionEnabled;
  markdownImageHeightPx.value = clampMarkdownImageHeightPx(
    payload.markdownImageHeightPx,
  );
  chapterNavToolbarEnabled.value = payload.chapterNavToolbarEnabled;
  chapterCharCountExact.value = payload.chapterCharCountExact;
  timedScrollSettings.value = mergeTimedScrollSettings(payload.timedScroll);
  pomodoroSettings.value = mergePomodoroSettings(payload.pomodoro);
  selectionToolbarButtons.value = mergeSelectionToolbarButtons(
    payload.selectionToolbarButtons,
  );
  readerEditShowLineNumbers.value = payload.readerEditShowLineNumbers;
  readerEditMinimap.value = payload.readerEditMinimap;
  editAutoRefreshChapterList.value = payload.editAutoRefreshChapterList;
  aiSmartFormat.value = { ...payload.aiSmartFormat };
  compressBlankKeepOneBlank.value = payload.compressBlankKeepOneBlank;
  chapterTitleBlankMode.value = payload.chapterTitleBlankMode;
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
  fullscreenShowSystemTime.value = payload.fullscreenShowSystemTime;
  ebookConvertOutputDir.value = payload.ebookConvertOutputDir;
  bookPackUnpackDir.value = payload.bookPackUnpackDir.trim();
  bookPackPassword.value = payload.bookPackPassword ?? "";
  webDavEnabled.value = payload.webDavEnabled === true;
  webDavUrl.value = payload.webDavUrl ?? "";
  webDavUsername.value = payload.webDavUsername ?? "";
  webDavRemoteDir.value =
    (payload.webDavRemoteDir ?? "").trim() || "ColorTxt";
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
  const nextLineSpacingPx = clampLineSpacingPx(payload.lineSpacingPx);
  const nextLetterSpacingPx = clampLetterSpacingPx(payload.letterSpacingPx);
  const nextReaderHorizontalInsetPx = clampReaderHorizontalInsetPx(
    payload.readerHorizontalInsetPx,
  );
  const nextFontFamily = payload.fontFamily.trim() || monacoFontFamily.value;
  const lineSpacingChanged = readerLineSpacingPx.value !== nextLineSpacingPx;
  readerFontSize.value = nextFontSize;
  monacoFontFamily.value = nextFontFamily;
  readerLineHeightMultiple.value = nextLineHeightMultiple;
  readerLineSpacingPx.value = nextLineSpacingPx;
  readerLetterSpacingPx.value = nextLetterSpacingPx;
  readerHorizontalInsetPx.value = nextReaderHorizontalInsetPx;
  readerRef.value?.setFontSize(nextFontSize);
  readerRef.value?.setFontFamily(nextFontFamily);
  readerRef.value?.setLineHeightMultiple(nextLineHeightMultiple);
  if (lineSpacingChanged) {
    // 抑制高度变化中间态换章滚动；恢复视口后强制居中（idx 常不变不会触发 watch）
    await withChapterListScrollSuppressed(async () => {
      await readerRef.value?.setLineSpacingPx?.(nextLineSpacingPx);
      await nextTick();
      await readerSidebarRef.value?.centerActiveChapterInList?.(false);
    });
  } else {
    await readerRef.value?.setLineSpacingPx?.(nextLineSpacingPx);
  }
  readerRef.value?.setLetterSpacingPx(nextLetterSpacingPx);
  aiSkillOverrides.value = mergeAiSkillOverrides(payload.aiSkillOverrides);
  aiCustomSkills.value = mergeAiCustomSkills(payload.aiCustomSkills ?? []);
  aiSkillsEnabled.value = mergeAiSkillsEnabled(
    payload.aiSkillsEnabled,
    aiCustomSkills.value.map((s) => s.id),
  );
  voiceReadSettings.value = mergeVoiceReadSettings(payload.voiceRead);
  voiceReadProfiles.value = cloneVoiceReadProfiles(payload.voiceReadProfiles);
  activeVoiceReadProfileId.value = payload.activeVoiceReadProfileId.trim();
  await persistVoiceReadSecretsToVault();
  await persistTranslationSecretsToVault();
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
    (prevCompressBlankKeepOneBlank !== compressBlankKeepOneBlank.value ||
      prevChapterTitleBlankMode !== chapterTitleBlankMode.value) &&
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
        chapterTitleBlankMode.value = prevChapterTitleBlankMode;
        persistSettings();
        return;
      }
      await syncChaptersAfterViewportSettled();
    });
  }
}

/** 来自主进程的跨窗口主题同步，避免再发 theme:set 造成循环 */
const skipNextThemeNativeIpc = ref(false);

function applyShellTheme(theme: string) {
  if (appOverlaysRef.value?.isColorSchemeThemeLocked()) return;
  currentTheme.value = theme === "vs-dark" ? "vs-dark" : "vs";
}

useAppWindowBindings({
  readerRef,
  stream,
  fileSession,
  persistWindowUnloadState,
  persistFileListCache,
  persistSidebarWidth,
  isFullscreenView,
  chromeAutoHide,
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
  handleReaderChromeEscape,
  bumpFullscreenCursorIdle,
  recordFullscreenPointer,
  enterOrExitFullscreenView,
  toggleMinimalistView,
  toggleTheme: () => {
    applyShellTheme(currentTheme.value === "vs" ? "vs-dark" : "vs");
  },
  pulseChapterListCenter,
  syncChaptersAfterViewportSettled,
  currentTheme,
  readerFontSize,
  readerLineHeightMultiple,
  readerLineSpacingPx,
  readerLetterSpacingPx,
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
  increaseLetterSpacing,
  decreaseLetterSpacing,
  increaseParagraphSpacing,
  decreaseParagraphSpacing,
  increaseHorizontalInset,
  decreaseHorizontalInset,
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
  openFindBook: openFindBookWindow,
  enterStealthReader: () => {
    void enterStealthMode();
  },
  toggleFind: onToggleFind,
  openSidebarSearch,
  openSidebarFiles: () => openReaderSidebarTab("files"),
  openSidebarChapters: () => openReaderSidebarTab("chapters"),
  openSidebarAiAssistant: () => openReaderSidebarTab("aiAssistant"),
  revealFullscreenSidebar,
  toggleReaderEdit: () => {
    void onToggleReaderEdit();
  },
  editSelectedText: () => {
    readerRef.value?.tryOpenPartialEditFromSelection?.();
  },
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
  isVoiceReadActive,
  onVoiceReadTogglePlayPause: voiceReadTogglePlayPause,
  onVoiceReadPlayPrevLine: voiceReadPlayPrevLine,
  onVoiceReadPlayNextLine: voiceReadPlayNextLine,
});

useAppShellThemeWatch({
  currentTheme,
  readerRef,
  readerSurfaceLight,
  readerSurfaceDark,
  readerBackground,
  skipNextThemeNativeIpc,
  persistSettings,
  showChapterCounts,
  currentFile,
  readerEditMode,
  readerEditorDirty,
  isFullscreenView: chromeAutoHide,
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
      chromeHidden: chromeAutoHide,
      'fullscreen--cursorHidden': chromeAutoHide && fullscreenCursorHidden,
    }"
  >
    <Transition name="chromeFloatHeader" :css="chromeAutoHide">
    <div
      :ref="setFullscreenHeaderOverlayEl"
      class="appHeaderWrap"
      v-show="!chromeAutoHide || showFullscreenHeader"
      @mouseleave="onFullscreenHeaderMouseLeave"
    >
      <AppHeader
        :in-fullscreen="isFullscreenView"
        :in-minimalist="isMinimalistView"
        :recent-files="recentFilesForMenu"
        :pin-active="pinActive"
        :can-pin="canPin"
        :bookmark-active="bookmarkActive"
        :can-bookmark="canBookmark"
        :voice-read-active="isVoiceReadActive"
        :can-voice-read="canVoiceRead"
        :timed-scroll-active="isTimedScrollActive"
        :can-timed-scroll="canStartTimedScroll"
        :voice-read-header-locked="isVoiceReadHeaderLocked"
        :current-theme="currentTheme"
        :can-increase-font="readerFontSize < maxFontSize"
        :can-decrease-font="readerFontSize > minFontSize"
        :can-increase-line-height="
          readerLineHeightMultiple <
          maxLineHeightMultipleForFontSize(readerFontSize) - 1e-6
        "
        :can-decrease-line-height="
          readerLineHeightMultiple > minLineHeightMultiple + 1e-6
        "
        :reader-font-size="readerFontSize"
        :reader-line-height-multiple="readerLineHeightMultiple"
        :monaco-font-family="monacoFontFamily"
        :pinned-other-fonts="pinnedOtherFonts"
        :monaco-advanced-wrapping="monacoAdvancedWrapping"
        :monaco-custom-highlight="monacoCustomHighlight"
        :text-replace-active="textReplaceActive"
        :compress-blank-lines="compressBlankLines"
        :lead-indent-full-width="leadIndentFullWidth"
        :text-convert-zh="textConvertZh"
        :text-convert-letter="textConvertLetter"
        :text-convert-digit="textConvertDigit"
        :reader-edit-mode="readerEditMode"
        :reader-click-mode="effectiveClickMode"
        :reader-click-mode-alt-held="clickModeAltHeld"
        :reading-ruler-enabled="readingRulerEnabled"
        :can-enter-reader-edit-mode="canEnterReaderEditMode"
        :shortcut-bindings="shortcutBindings"
        :can-enter-stealth="canEnterStealth"
        @open-file="openFileViaDialog"
        @pin-click="onPinClick"
        @bookmark-click="onBookmarkClick"
        @go-back-from-pin="onGoBackFromPin"
        @change-theme="applyShellTheme"
        @toggle-minimalist="toggleMinimalistView"
        @toggle-fullscreen="enterOrExitFullscreenView"
        @set-monaco-font="setMonacoFontFamily"
        @toggle-pin-other-font="togglePinnedOtherFont"
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
        @select-text-convert-zh-read="setTextConvertZhRead"
        @select-text-convert-letter-read="setTextConvertLetterRead"
        @select-text-convert-digit-read="setTextConvertDigitRead"
        @apply-text-convert-zh-edit="onApplyTextConvertZhEdit"
        @apply-text-convert-letter-edit="onApplyTextConvertLetterEdit"
        @apply-text-convert-digit-edit="onApplyTextConvertDigitEdit"
        @toggle-find="onToggleFind"
        :chapter-rules-disabled="currentFileIsMarkdown"
        @open-chapter-rules="
          chapterRuleErrorText = '';
          showChapterRulePanel = true;
        "
        @open-text-replace="showReplaceRulePanel = true"
        @open-github="openGithubRepo"
        @check-for-updates="requestCheckForUpdates"
        @open-shortcuts="showShortcutPanel = true"
        @open-settings="showSettingsPanel = true"
        @open-color-scheme="showColorSchemePanel = true"
        @open-find-book="openFindBookWindow"
        @enter-stealth-reader="enterStealthMode"
        @open-new-window="openNewWindow"
        @open-recent-file="openRecentFileFromHistory"
        @clear-recent-files="clearRecentFiles"
        @open-about="showAboutPanel = true"
        @quit-app="quitApp"
        @toggle-reader-edit="onToggleReaderEdit"
        @toggle-reader-click-mode="toggleReaderClickMode"
        @toggle-reading-ruler="toggleReadingRuler"
        @save-reader-file="onSaveReaderFile"
        :ai-features-enabled="aiFeaturesEnabled"
        :can-use-ai-smart-format="canUseAiSmartFormat"
        :ai-smart-format-running="aiSmartFormatRunning"
        :smart-format-review-active="aiSmartFormatReviewSession != null"
        :reader-file-saving="readerFileSaving"
        @ai-smart-format-full="onAiSmartFormatFull"
        @voice-read-toggle="onVoiceReadToggle"
        @timed-scroll-toggle="toggleTimedScroll"
      />
    </div>
    </Transition>

    <div
      class="layout"
      :class="{ readerSurfaceBg: chromeAutoHide }"
      @pointerdown.capture="onLayoutMouseDown"
      @contextmenu="onLayoutContextMenu"
      @wheel.capture="onLayoutWheel"
    >
      <Transition name="chromeFloatSidebar" :css="chromeAutoHide">
      <div
        ref="fullscreenSidebarOverlayRef"
        class="sidebarPaneWrap"
        :class="{ 'sidebarPaneWrap--fullscreen': chromeAutoHide }"
        v-show="sidebarShellVisible"
        :style="{ width: `${sidebarPaneLayoutWidth}px` }"
        @mouseleave="onFullscreenSidebarMouseLeave"
      >
        <ReaderSidebar
          ref="readerSidebarRef"
          active-scroll-mode="center"
          :panel-expanded="chromeAutoHide || showSidebar"
          :activity-icons-on-dark="currentTheme === 'vs-dark'"
          :in-fullscreen="chromeAutoHide"
          :show-fullscreen-sidebar="
            chromeAutoHide ? showFullscreenSidebar : undefined
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
          :file-list-view-mode="fileListViewMode"
          :file-category-catalog="fileCategoryCatalog"
          :meta-progress-by-path-key="metaProgressByPathKey"
          :live-reading-progress-percent="liveReadingProgressForUi"
          :bookmarks="bookmarkListItems"
          :highlight-terms="currentFileHighlightTerms"
          :annotation-groups="annotationListGroups"
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
          :highlight-colors="highlightColorsForReader"
          :monaco-font-family="monacoFontFamily"
          :lineation-colors="lineationColorsForReader"
          :active-bookmark-line="activeBookmarkLine"
          :current-file-path="currentFile"
          :physical-reader-path="physicalReaderPath"
          :reader-main-ref="readerRef"
          :ai-assistant-tab-visible="aiFeaturesEnabled"
          :character-portrait-tab-visible="txt2imgFeatureEnabled"
          :character-portrait-cache-dir="characterPortraitCacheDir"
          v-model:character-card-texture-effect="characterCardTextureEffect"
          :character-roster="currentFileCharacterRoster"
          :character-book-style="currentFileCharacterBookStyle"
          :voice-read-settings="voiceReadSettings"
          v-model:deep-thinking="aiAssistantDeepThinking"
          v-model:spoiler-safe="aiAssistantSpoilerSafe"
          :ai-skills-enabled="aiSkillsEnabled"
          :ai-skill-overrides="aiSkillOverrides"
          :ai-custom-skills="aiCustomSkills"
          :ai-assistant-config-sync-nonce="aiAssistantConfigSyncNonce"
          :chapters="chapters"
          :active-chapter-idx="activeChapterIdx"
          :chapter-min-char-count="chapterMinCharCount"
          :format-char-count="formatChapterCharCount"
          :show-edit-chapter-refresh-button="showEditChapterRefreshButton"
          @pick-directory="pickTxtDirectory"
          @refresh-file-list="onRefreshFileList"
          @pick-files="pickTxtFilesIntoFileList"
          @import-dropped-paths="onImportDroppedPathsFromList"
          @open-file="openFileFromSidebar"
          @jump-to-chapter="onJumpToChapterFromSidebar"
          @jump-to-chapter-from-ai="jumpToChapterFromAiAssistant"
          v-model:wordcloud-font-family="wordcloudFontFamily"
          v-model:wordcloud-angle-mode="wordcloudAngleMode"
          v-model:wordcloud-palette-id="wordcloudPaletteId"
          @clear-file-list="clearFileList"
          @clear-file-list-category="clearFileListForCategory"
          @remove-file-list="removeFileList"
          @clear-file-meta="onClearFileMeta"
          @rename-file-path="onRenameFilePath"
          @replace-file-path="onReplaceFilePath"
          @open-file-in-new-window="onOpenFileInNewWindow"
          @close-current-file="closeCurrentFile"
          @refresh-chapters-from-reader="applyChaptersFromReaderPlainText"
          @jump-to-bookmark="jumpToBookmarkWithVoiceRead"
          @clear-bookmarks="clearCurrentFileBookmarks"
          @remove-bookmarks="removeCurrentFileBookmarks"
          @edit-bookmark="onEditBookmark"
          @remove-bookmark="onRemoveBookmark"
          @export-bookmarks-json="onExportBookmarksJson"
          @import-bookmarks-json="onImportBookmarksJson"
          @find-highlight-term="onFindHighlightTermFromSidebar"
          @clear-inline-search-highlight="clearReaderInlineSearchHighlight"
          @update:search-query="searchQuery = $event"
          @update:search-match-case="searchMatchCase = $event"
          @update:search-whole-word="searchWholeWord = $event"
          @update:search-use-regex="searchUseRegex = $event"
          @jump-to-search-result="onJumpToSearchResult"
          @remove-highlight-term="onRemoveHighlightTerm"
          @favorite-highlight-term="onFavoriteHighlightTerm"
          @unfavorite-highlight-term="onUnfavoriteHighlightTerm"
          @commit-highlight-group="onCommitHighlightGroup"
          @merge-highlight-groups="onMergeHighlightGroups"
          @split-highlight-term="onSplitHighlightTerm"
          @clear-highlights="clearCurrentFileHighlightTerms"
          @export-book-highlights-json="onExportBookHighlightsJson"
          @import-book-highlights-json="onImportBookHighlightsJson"
          @export-favorite-highlights-json="onExportFavoriteHighlightsJson"
          @import-favorite-highlights-json="onImportFavoriteHighlightsJson"
          @jump-to-annotation="onJumpToReaderAnnotation"
          @remove-annotation="onRemoveReaderAnnotation"
          @clear-annotations="onClearReaderAnnotationsWithConfirm"
          @clear-stale-annotations="onClearStaleReaderAnnotations"
          @export-annotations-md="onExportAnnotationsMd"
          @export-annotations-json="onExportAnnotationsJson"
          @import-annotations-json="onImportAnnotationsJson"
          @character-file-meta-patch="onCharacterFileMetaPatch"
          @persist-ui="onPersistUi"
          @update:file-category="fileCategory = $event"
          @update:file-sort="fileSort = $event"
          @update:file-list-view-mode="fileListViewMode = $event"
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
          @update:fullscreen-character-popovers-open="
            fullscreenCharacterPopoversOpen = $event
          "
          @update:file-list-editing="fileListEditing = $event"
          @request-expand-panel="showSidebar = true"
          @request-collapse-panel="showSidebar = false"
          :web-dav-enabled="webDavEnabled"
          :shortcut-bindings="shortcutBindings"
          @open-web-dav="showWebDavPanel = true"
          @open-color-scheme="showColorSchemePanel = true"
        @open-find-book="openFindBookWindow"
          @open-settings="showSettingsPanel = true"
        />
        <!-- 放在侧栏容器内，避免移到拖条时触发 @mouseleave 导致全屏侧栏收起 -->
        <div
          v-show="chromeAutoHide"
          class="resizer resizer--fullscreenSidebar"
          :class="{ 'resizer--active': resizingSidebar }"
          @mousedown="startResizeSidebar"
        ></div>
      </div>
      </Transition>
      <div
        v-show="showSidebar && !chromeAutoHide"
        class="resizer"
        :class="{ 'resizer--active': resizingSidebar }"
        :style="{ left: `calc(${sidebarWidthForLayout}px - var(--app-sash-size, 4px) / 2)` }"
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
          :lead-indent-full-width="leadIndentFullWidth"
          :chapter-min-char-count="chapterMinCharCount"
          :monaco-advanced-wrapping="monacoAdvancedWrapping"
          :monaco-cjk-wrap-optimize="monacoCjkWrapOptimize"
          :line-spacing-px="readerLineSpacingPx"
          :letter-spacing-px="readerLetterSpacingPx"
          :horizontal-inset-px="readerHorizontalInsetPx"
          :monaco-smooth-scrolling="monacoSmoothScrolling"
          :mouse-wheel-scroll-sensitivity="mouseWheelScrollSensitivity"
          :fast-scroll-sensitivity="fastScrollSensitivity"
          :sticky-chapter-title-enabled="stickyChapterTitleEnabled"
          :reader-click-mode="effectiveClickMode"
          :reading-ruler-enabled="readingRulerEnabled"
          :reading-ruler-focus-lines="readingRulerFocusLines"
          :reading-ruler-dim-opacity="readingRulerDimOpacity"
          :reading-ruler-dim-sticky-title="readingRulerDimStickyTitle"
          :reading-ruler-transition-enabled="readingRulerTransitionEnabled"
          :markdown-image-height-px="markdownImageHeightPx"
          :reader-click-mode-alt-held="clickModeAltHeld"
          :selection-toolbar-buttons="selectionToolbarButtons"
          :dictionary-settings="dictionarySettings"
          :web-search-settings="webSearchSettings"
          :translation-settings="translationSettings"
          :reader-edit-show-line-numbers="readerEditShowLineNumbers"
          :reader-edit-minimap="readerEditMinimap"
          :stream-loading="loading"
          :reader-surface-light="effectiveReaderSurfaceLight"
          :reader-surface-dark="effectiveReaderSurfaceDark"
          :reader-palette-color-enabled="readerPaletteColorEnabledForReader"
          :highlight-colors="highlightColorsForReader"
          :lineation-colors="lineationColorsForReader"
          :highlight-words-by-index="readerDisplayHighlightWordsByIndex"
          :highlight-words-by-index-book-only="readerDisplayHighlightWordsBookOnly"
          :reader-annotations="currentFileAnnotations"
          :lineation-last-colors="lineationLastColors"
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
          :ai-features-enabled="aiFeaturesEnabled"
          :can-use-ai-smart-format="canUseAiSmartFormat"
          :smart-format-review-session="aiSmartFormatReviewSession"
          :monaco-font-family="monacoFontFamily"
          :get-physical-line-content="stream.getPhysicalLineContent"
          :get-display-line-content="stream.getDisplayLineContent"
          @ai-smart-format-full="onAiSmartFormatFull"
          @ai-smart-format-selection="onAiSmartFormatSelection"
          @smart-format-review-apply="applySmartFormatReview()"
          @smart-format-review-discard="discardSmartFormatReview()"
          @probe-line-change="onProbeLineChangeForTimedScroll"
          @layout-viewport-restored="onLayoutViewportRestored"
          @viewport-top-line-change="onViewportTopLineChange"
          @viewport-end-line-change="onViewportEndLineChange"
          @viewport-visual-progress-change="onViewportVisualProgressChange"
          @add-highlight-term="onAddHighlightTerm"
          @remove-highlight-term="onRemoveHighlightTerm"
          @upsert-reader-annotation="onUpsertReaderAnnotation"
          @remove-reader-annotation="onRemoveReaderAnnotation"
          @annotation-quotes-changed="bumpAnnotationDisplayEpoch"
          @update-lineation-last-color="onUpdateLineationLastColor"
          @ask-ai-with-quote="onAskAiWithQuote"
          @search-with-quote="onSearchWithQuote"
          @open-dictionary-manage="showDictionaryManagePanel = true"
          @open-web-search-manage="showWebSearchManagePanel = true"
          @open-translate-manage="openTranslateManagePanel"
          @update:translation-settings="onTranslationSettingsUpdate"
          @reader-edit-dirty-change="onReaderEditDirtyChange"
          @reader-edit-content-change="onReaderEditContentChange"
          @reader-edit-loaded="onReaderEditLoaded"
          @reader-edit-load-failed="onReaderEditLoadFailed"
          @reader-edit-save-request="onSaveReaderFile"
          @reader-edit-cursor-change="onReaderEditCursorChange"
          @apply-partial-physical-edit="onApplyPartialPhysicalEdit"
        />
        <VoiceReadToolbar
          :visible="isVoiceReadActive"
          :mode="voiceReadMode"
          :synthesizing="voiceReadSynthesizing"
          :synthesizing-phase="voiceReadSynthesizingPhase"
          :toolbar-rate="voiceReadToolbarRate"
          :toolbar-volume="voiceReadToolbarVolume"
          :engine="voiceReadSettings.engine"
          :can-prev-line="voiceReadCanPlayPrevLine"
          :can-next-line="voiceReadCanPlayNextLine"
          @update:toolbar-rate="voiceReadToolbarRate = $event"
          @update:toolbar-volume="setVoiceReadToolbarVolume($event)"
          @toggle-play-pause="voiceReadTogglePlayPause"
          @prev-line="voiceReadPlayPrevLine"
          @next-line="voiceReadPlayNextLine"
          @regenerate="voiceReadRegenerateCurrentLine"
          @stop="exitVoiceRead"
          @open-speak-settings="showVoiceReadSpeakSettingsPanel = true"
        />
        <ReaderChapterNavBar
          v-if="readerChapterNavUiVisible && !chromeAutoHide"
          :visible="readerChapterNavVisible"
          :can-go-prev="readerChapterNavCanPrev"
          :can-go-next="readerChapterNavCanNext"
          :disabled="readerChapterNavBusy"
          @prev="jumpToPrevChapterWithVoiceRead"
          @next="jumpToNextChapterWithVoiceRead"
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
          <span class="readerBusyHintLine">
            {{ readerTxtLoadingHintText }}<LoadingDotsBounce />
          </span>
        </div>
        <div
          v-if="showReaderEmptyHint"
          class="readerIdleHint"
          aria-hidden="true"
        >
          {{ emptyFileHintText }}
        </div>
        <div
          v-if="readerHudTipVisible"
          class="fullscreenTip readerHudTip"
          :class="{ fading: readerHudTipFading }"
          aria-live="polite"
        >
          {{ readerHudTipText }}
        </div>
      </div>
    </div>
    <div
      v-if="showFullscreenTip"
      class="fullscreenTip"
      :class="{ fading: fullscreenTipFading }"
    >
      {{ fullscreenTipText }}
    </div>
    <FullscreenSystemClock
      :visible="isFullscreenView && fullscreenShowSystemTime"
      :pomodoro-visible="chromeAutoHide && pomodoroPhase !== 'idle'"
      :pomodoro-progress="pomodoroProgress"
      :pomodoro-paused="pomodoroPaused"
    />

    <Transition name="chromeFloatFooter" :css="chromeAutoHide">
    <div
      :ref="setFullscreenFooterOverlayEl"
      class="appFooterWrap"
      v-show="!chromeAutoHide || showFullscreenFooter"
      @mouseleave="onFullscreenFooterMouseLeave"
    >
      <ReaderChapterNavBar
        v-if="readerChapterNavUiVisible && chromeAutoHide"
        :visible="readerChapterNavVisible"
        :can-go-prev="readerChapterNavCanPrev"
        :can-go-next="readerChapterNavCanNext"
        :disabled="readerChapterNavBusy"
        @prev="jumpToPrevChapterWithVoiceRead"
        @next="jumpToNextChapterWithVoiceRead"
      />
      <AppFooter
        :loading="loading"
        :loading-progress-percent="loadingProgressPercent"
        :ebook-parsing="ebookParsing"
        :ebook-convert-progress-text="ebookConvertProgressText"
        :current-file="currentFile"
        :path-caption="footerPathCaption"
        :reading-progress-percent-part="readingProgressParts.percentPart"
        :reading-progress-detail-part="readingProgressParts.detailPart"
        :reading-progress-placeholder="readingProgressParts.placeholder"
        :reading-progress-complete="readingProgressParts.complete"
        :voice-read-footer-status="voiceReadFooterStatus"
        :total-char-count-text="
          formatCharCount(totalCharCount, chapterCharCountExact)
        "
        :file-size-text="formatFileSize(currentFileSize)"
        :file-encoding="fileEncoding"
        :encoding-actions-enabled="footerEncodingActionsEnabled"
        :path-menu-reveal-enabled="footerPathMenuRevealEnabled"
        :path-menu-reload-enabled="footerPathMenuReloadEnabled"
        :path-menu-reconvert-enabled="footerPathMenuReconvertEnabled"
        :path-menu-close-enabled="footerPathMenuCloseEnabled"
        :web-dav-menu-enabled="webDavEnabled"
        :web-dav-book-pack-progress="webDavBookPackProgress"
        :edit-cursor-label="readerEditCursorFooterLabel"
        :pomodoro-enabled="pomodoroSettings.enabled"
        :pomodoro-phase="pomodoroPhase"
        :pomodoro-display-mode="pomodoroDisplayMode"
        :pomodoro-progress="pomodoroProgress"
        :pomodoro-countdown-text="pomodoroCountdownText"
        :pomodoro-pause-resume-label="pomodoroPauseResumeLabel"
        :pomodoro-paused="pomodoroPaused"
        @path-reveal-in-folder="revealCurrentFileInFolder"
        @path-reload="reloadCurrentFileFromDisk"
        @path-reconvert="reconvertCurrentEbookFromDisk"
        @path-upload-book-pack-web-dav="uploadCurrentReaderBookPackToWebDav"
        @path-update-book-pack-web-dav="updateCurrentReaderBookPackFromWebDav"
        @path-export-book-pack="exportCurrentReaderBookPack(false)"
        @path-export-book-pack-with-progress="exportCurrentReaderBookPack(true)"
        @path-clear-reading-data="clearCurrentFileReadingData"
        @path-close="closeCurrentFile"
        @save-file-as-encoding="onFooterSaveFileAsEncoding"
        @pomodoro-start="startPomodoro"
        @pomodoro-toggle-display-mode="togglePomodoroDisplayMode"
        @pomodoro-toggle-pause="togglePomodoroPause"
        @pomodoro-stop="stopPomodoro"
      />
    </div>
    </Transition>
    <PomodoroBreakOverlay
      :visible="pomodoroShowBreakOverlay"
      :countdown-text="pomodoroCountdownText"
      @finish="finishPomodoroBreakEarly"
    />

    <AppDialogHost />
    <AppCaptchaHost />
    <AppLoadingHost />
    <AppToastHost />
    <AiSmartFormatProgressModal
      v-model="aiSmartFormatProgressOpen"
      :current="aiSmartFormatProgressCurrent"
      :total="aiSmartFormatProgressTotal"
      :show-token-usage="aiSmartFormatProgressShowTokenUsage"
      :token-usage="aiSmartFormatProgressTokenUsage"
      :token-usage-available="aiSmartFormatProgressTokenUsageAvailable"
      :token-price-per-million="aiSmartFormatProgressTokenPricePerMillion"
      @stop="stopAiSmartFormat()"
    />

    <WebDavSyncPanel
      v-model="showWebDavPanel"
      :web-dav="{
        webDavEnabled,
        webDavUrl,
        webDavUsername,
        webDavRemoteDir,
      }"
      :import-pack-paths="onWebDavImportPackPaths"
      @open-file="(p) => void openFilePath(p)"
      @config-downloaded="onWebDavConfigDownloaded"
    />

    <AppOverlays
      ref="appOverlaysRef"
      v-model:show-about-panel="showAboutPanel"
      v-model:show-shortcut-panel="showShortcutPanel"
      v-model:show-settings-panel="showSettingsPanel"
      v-model:show-color-scheme-panel="showColorSchemePanel"
      v-model:show-chapter-rule-panel="showChapterRulePanel"
      v-model:show-reading-data-panel="showReadingDataPanel"
      v-model:show-dictionary-manage-panel="showDictionaryManagePanel"
      v-model:show-web-search-manage-panel="showWebSearchManagePanel"
      v-model:show-translate-manage-panel="showTranslateManagePanel"
      v-model:show-replace-rule-panel="showReplaceRulePanel"
      v-model:show-voice-read-speak-settings-panel="showVoiceReadSpeakSettingsPanel"
      v-model:add-bookmark-open="addBookmarkOpen"
      v-model:remove-bookmark-open="removeBookmarkOpen"
      v-model:bookmark-note-input="bookmarkNoteInput"
      :restore-session-on-startup="restoreSessionOnStartup"
      :sync-current-file="syncCurrentFile"
      :recent-files-history-limit="recentFilesHistoryLimit"
      :chapter-min-char-count="chapterMinCharCount"
      :fullscreen-reader-width-percent="fullscreenReaderWidthPercent"
      :fullscreen-show-system-time="fullscreenShowSystemTime"
      :reader-font-size="readerFontSize"
      :reader-line-height-multiple="readerLineHeightMultiple"
      :reader-line-spacing-px="readerLineSpacingPx"
      :reader-letter-spacing-px="readerLetterSpacingPx"
      :reader-horizontal-inset-px="readerHorizontalInsetPx"
      :chapter-title-blank-mode="chapterTitleBlankMode"
      :compress-blank-keep-one-blank="compressBlankKeepOneBlank"
      :monaco-smooth-scrolling="monacoSmoothScrolling"
      :monaco-cjk-wrap-optimize="monacoCjkWrapOptimize"
      :mouse-wheel-scroll-sensitivity="mouseWheelScrollSensitivity"
      :fast-scroll-sensitivity="fastScrollSensitivity"
      :sticky-chapter-title-enabled="stickyChapterTitleEnabled"
      :reading-ruler-enabled="readingRulerEnabled"
      :reading-ruler-focus-lines="readingRulerFocusLines"
      :reading-ruler-dim-opacity="readingRulerDimOpacity"
      :reading-ruler-dim-sticky-title="readingRulerDimStickyTitle"
      :reading-ruler-transition-enabled="readingRulerTransitionEnabled"
      :markdown-image-height-px="markdownImageHeightPx"
      :chapter-nav-toolbar-enabled="chapterNavToolbarEnabled"
      :chapter-char-count-exact="chapterCharCountExact"
      :timed-scroll-settings="timedScrollSettings"
      :pomodoro-settings="pomodoroSettings"
      :selection-toolbar-buttons="selectionToolbarButtons"
      :dictionary-settings="dictionarySettings"
      :web-search-settings="webSearchSettings"
      :translation-settings="translationSettings"
      :reader-edit-show-line-numbers="readerEditShowLineNumbers"
      :reader-edit-minimap="readerEditMinimap"
      :edit-auto-refresh-chapter-list="editAutoRefreshChapterList"
      :ai-smart-format="aiSmartFormat"
      :monaco-custom-highlight="monacoCustomHighlight"
      :txtr-delimited-match-cross-line="txtrDelimitedMatchCrossLine"
      :chapter-rules="chapterRuleState.rules"
      :chapter-rule-error-text="chapterRuleErrorText"
      :reader-edit-mode="readerEditMode"
      :replace-rule-scope-book-name="replaceRuleScopeBookName"
      :editing-bookmark-line="editingBookmarkLine"
      :can-bookmark="canBookmark"
      :add-bookmark-dialog-preview="addBookmarkDialogPreview"
      :active-bookmark-in-viewport="activeBookmarkInViewport"
      :dir-list-scanning="dirListScanning"
      :dir-list-current-name="dirListCurrentName"
      :ebook-parsing="ebookParsing"
      :ebook-convert-progress-text="ebookConvertProgressText"
      :book-pack-unpacking="bookPackUnpacking"
      :shortcut-bindings="shortcutBindings"
      :default-shortcut-bindings="defaultShortcutBindings"
      :current-theme="currentTheme"
      :reader-palette-color-enabled="readerPaletteColorEnabled"
      :reader-palette-user-presets="readerPaletteUserPresets"
      :reader-palette-selected-id-light="readerPaletteSelectedIdLight"
      :reader-palette-selected-id-dark="readerPaletteSelectedIdDark"
      :reader-background="readerBackground"
      :monaco-font-family="monacoFontFamily"
      :pinned-other-fonts="pinnedOtherFonts"
      :highlight-colors-light="highlightColorsLight"
      :highlight-colors-dark="highlightColorsDark"
      :lineation-colors-light="lineationColorsLight"
      :lineation-colors-dark="lineationColorsDark"
      :ebook-convert-output-dir="ebookConvertOutputDir"
      :book-pack-unpack-dir="bookPackUnpackDir"
      :book-pack-password="bookPackPassword"
      :web-dav-enabled="webDavEnabled"
      :web-dav-url="webDavUrl"
      :web-dav-username="webDavUsername"
      :web-dav-remote-dir="webDavRemoteDir"
      :character-portrait-cache-dir="characterPortraitCacheDir"
      :voice-read-settings="voiceReadSettings"
      :voice-read-profiles="voiceReadProfiles"
      :active-voice-read-profile-id="activeVoiceReadProfileId"
      :character-roster="currentFileCharacterRoster"
      :ai-skills-enabled="aiSkillsEnabled"
      :ai-skill-overrides="aiSkillOverrides"
      :ai-custom-skills="aiCustomSkills"
      :reading-data-items="readingDataItems"
      @apply-settings="applySettings"
      @toggle-pin-other-font="togglePinnedOtherFont"
      @apply-shortcut-bindings="applyShortcutBindings"
      @apply-chapter-rules="applyChapterMatchRules"
      @confirm-add-bookmark="confirmAddBookmark"
      @update-bookmark-to-current-viewport-line="
        updateEditingBookmarkToCurrentViewportLine
      "
      @confirm-remove-active-bookmark="confirmRemoveActiveBookmark"
      @apply-color-scheme="onApplyColorScheme"
      @change-theme="applyShellTheme"
      @open-reading-data="openReadingDataPanel"
      @open-dictionary-manage="showDictionaryManagePanel = true"
      @open-web-search-manage="showWebSearchManagePanel = true"
      @open-translate-manage="openTranslateManagePanel"
      @update:dictionary-settings="onDictionarySettingsUpdate"
      @update:web-search-settings="onWebSearchSettingsUpdate"
      @update:translation-settings="onTranslationSettingsUpdate"
      @clear-reading-data-paths="onClearReadingDataPaths"
      @clear-all-reading-data="onClearAllReadingData"
      @remove-missing-reading-data-files="onRemoveMissingReadingDataFiles"
      @open-reading-data-path="(p) => void openFilePath(p)"
      @apply-replace-rule-format="onApplyReplaceRuleFormat"
    />
  </div>
</template>

<style scoped src="./appShell.css"></style>
