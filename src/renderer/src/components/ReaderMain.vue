<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
  nextTick,
} from "vue";
import * as monaco from "monaco-editor";
import kingHwaFontUrl from "../assets/KingHwa_OldSong_3.0.ttf?url";
import {
  type ChapterStickyLine,
  ensureStickyChapterBarClickDisabled,
  getStickyChapterScrollHeight,
  predictStickyChapterScrollHeight,
  refreshStickyChapterScrollWidget,
  registerChapterStickyScrollProviders,
} from "../monaco/chapterStickyScroll";
import { bindMonacoScrollbarTrackJumpGuard } from "../monaco/scrollbarTrackJumpGuard";
import {
  buildChapterMinimapSectionHeaderDecorations,
  buildChapterTitleDecorations,
  getReaderMinimapCursorLineDecorColor,
  readerMonacoThemeForAppTheme,
  setReaderSyntaxHighlightEnabled,
} from "../monaco/readerInlineDecorations";
import { useReaderInlineSearch } from "../composables/useReaderInlineSearch";
import {
  replaceImgAnchorLinesWithViewZones,
  removeViewZonesById,
  syncReaderImageViewZonesLineSpacing,
  forEachReaderImageViewZone,
  type ReplaceImgAnchorsResult,
} from "../monaco/readerImageViewZones";
import { collectBlockMarkdownImageLines } from "../markdown/markdownImages";
import {
  atxHeadingPrefixLength,
  formatMarkdownHeadingLineForDisplay,
} from "../markdown/markdownChapter";
import {
  READER_EDITOR_DEFAULT_FONT_FAMILY,
  READER_EDITOR_DEFAULT_FONT_SIZE,
  buildReaderEditorCreateOptions,
  buildReaderEditorFontSizeUpdate,
  buildReaderEditorLetterSpacingUpdate,
  buildReaderMonacoModeEditorOptions,
  buildReaderOverviewRulerBorder,
} from "../monaco/readerEditorOptions";
import {
  isCjkWrapOptimizeEnabled,
  setCjkWrapOptimizeEnabled,
} from "../monaco/cjkWrapOptimize";
import {
  getLineSpacingPx,
  setLineSpacingPx as applyMonacoLineSpacingPx,
  clampLineSpacingPx as clampMonacoLineSpacingPx,
} from "../monaco/lineSpacing";
import {
  createTxtrTextMonarchLanguage,
  type TxtrMonarchHighlightOptions,
} from "../monaco/txtrTextMonarch";
import { installReaderScrollKeyHandler } from "../monaco/readerKeyScroll";
import { installReaderReadOnlyImeGuard } from "../monaco/readerReadOnlyImeGuard";
import { flushReaderBackgroundStickyAlign, scheduleReaderBackgroundStickyAlign } from "../constants/readerBackground";
import {
  applyLeadIndentFullWidth,
  chapterTitleForDisplay,
  leadingWhitespaceColumnCount,
} from "../chapter";
import { pickActiveChapterIdx } from "../reader/chapterIndex";
import { ensureSearchAnchorCursorInViewport } from "../reader/ensureSearchAnchorCursorInViewport";
import {
  compressBlankLinesInText,
  leadIndentFullWidthInText,
  type SmartFormatPostProcessContext,
} from "../aiSmartFormat/aiSmartFormatTextPostProcess";
import { countLinesInText } from "../aiSmartFormat/aiSmartFormatSegments";
import {
  formatPhysicalPlainTextForReader,
  type ReaderDisplayFormatOptions,
} from "../reader/readerDisplayPipeline";
import {
  applyTextConvertDigits,
  applyTextConvertLetters,
  applyTextConvertZh,
} from "../services/textConvertApply";
import type {
  TextConvertWidthMode,
  TextConvertZhMode,
} from "@shared/textConvertTypes";
import {
  applyReplaceRulesToText,
  filterEnabledReplaceRules,
} from "@shared/bookSource/replaceRuleApply";
import type { ReplaceRule } from "@shared/bookSource/replaceRule";
import { isMarkdownFilePath } from "../ebook/ebookFormat";
import {
  captureReaderViewportRestoreAnchor,
  computeScrollTopForLineAtViewportSlot,
  computeScrollTopForReaderViewportRestoreAnchor,
  READER_BOOKMARK_JUMP_SLOT_FROM_TOP,
  READER_VIEWPORT_RESTORE_SLOT_FROM_TOP,
  resolveDisplayLineForViewportRestore,
  type ReaderViewportRestoreAnchor,
} from "../reader/readerViewportAnchor";
import AppContextMenu from "./AppContextMenu.vue";
import ReaderSelectionToolbar from "./ReaderSelectionToolbar.vue";
import ReaderNoteInputPanel from "./ReaderNoteInputPanel.vue";
import ReaderDictionaryPopup from "./ReaderDictionaryPopup.vue";
import ReaderTranslatePopup from "./ReaderTranslatePopup.vue";
import type { DictionarySettings } from "@shared/dictionaryTypes";
import { mergeDictionarySettings } from "../constants/dictionarySettings";
import type { WebSearchSettings } from "@shared/webSearchTypes";
import {
  buildWebSearchUrl,
  mergeWebSearchSettings,
} from "../constants/webSearchSettings";
import type { TranslationSettings } from "@shared/translationTypes";
import { mergeTranslationSettings } from "../constants/translationSettings";
import ReaderImageLightbox from "./ReaderImageLightbox.vue";
import ReaderPartialEditPanel from "./ReaderPartialEditPanel.vue";
import VoiceReadResumeGuide from "./VoiceReadResumeGuide.vue";
import "./readerMainMonaco.css";
import {
  defaultChapterMinCharCount,
  defaultChapterTitleBlankMode,
  defaultCompressBlankLines,
  defaultLeadIndentFullWidth,
  defaultMonacoAdvancedWrapping,
  defaultMonacoCjkWrapOptimize,
  defaultMonacoCustomHighlight,
  defaultMonacoSmoothScrolling,
  defaultScrollbarTrackBehavior,
  defaultMouseWheelScrollSensitivity,
  defaultFastScrollSensitivity,
  defaultStickyChapterTitleEnabled,
  defaultReaderClickMode,
  defaultReadingRulerEnabled,
  defaultReadingRulerFocusLines,
  defaultReadingRulerDimOpacity,
  defaultReadingRulerDimStickyTitle,
  defaultReadingRulerTransitionEnabled,
  defaultMarkdownImageHeightPx,
  clampReadingRulerFocusLines,
  clampReadingRulerDimOpacity,
  clampMarkdownImageHeightPx,
  clampMouseWheelScrollSensitivity,
  clampFastScrollSensitivity,
  defaultReaderEditShowLineNumbers,
  defaultReaderEditMinimap,
  defaultTxtrDelimitedMatchCrossLine,
  defaultReaderLineHeightMultiple,
  defaultLineSpacingPx,
  defaultLetterSpacingPx,
  defaultReaderHorizontalInsetPx,
  effectiveReaderHorizontalInsetPx,
  maxPartialEditSelectionChars,
  defaultReaderPaletteDark,
  defaultReaderPaletteLight,
  defaultReaderPaletteColorEnabled,
  type ChapterTitleBlankMode,
  type ReaderSurfaceColorEnabled,
  type ReaderSurfacePalette,
} from "../constants/appUi";
import {
  DEFAULT_HIGHLIGHT_COLORS_LIGHT,
  DEFAULT_HIGHLIGHT_LAST_COLOR,
} from "../constants/highlightColors";
import { DEFAULT_LINEATION_COLORS_LIGHT } from "../constants/lineationColors";
import {
  DEFAULT_LINEATION_LAST_COLORS,
  type LineationLastColorPrefs,
} from "../constants/annotationColors";
import type {
  HighlightWordsByIndex,
  ReaderAnnotationRecord,
} from "../stores/fileMetaStore";
import { useReaderAnnotations } from "../composables/useReaderAnnotations";
import {
  defaultSelectionToolbarButtons,
  type SelectionToolbarButtons,
} from "../constants/selectionToolbar";
import { annotationMarkerCssRules } from "../reader/readerAnnotationDecor";
import { floorReadingPercentFromScrollRatio } from "../utils/format";
import { whenSystemFontFacesReady } from "../utils/systemFontCatalog";
import { bookTitleForExport } from "../utils/readerAnnotationExport";
import {
  hasEscBeforeModalLayers,
  hasModalOnStack,
  READER_HL_FLOAT_ROOT_Z_INDEX,
  subscribeModalStackChange,
} from "../utils/modalStack";
import { hasDismissibleOverlay } from "../utils/dismissibleOverlayStack";
import { yieldToUi, afterNextPaints } from "../ebook/yieldToUi";
import { appAlert } from "../services/appDialog";
import { appToast } from "../services/appToast";
import {
  annotationColumnMapOptions,
  getTextInPhysicalRangeFromLines,
  monacoRangeToPhysicalRange,
  type AnnotationRange,
} from "../utils/readerAnnotations";
import type { SmartFormatReviewSession } from "../aiSmartFormat/aiSmartFormatReviewTypes";
import {
  useReaderSmartFormatDiff,
  type SmartFormatDiffContextMenuRequest,
} from "../composables/useReaderSmartFormatDiff";
import { useReaderEbookInternalLinks } from "../composables/useReaderEbookInternalLinks";
import SmartFormatReviewBar from "./SmartFormatReviewBar.vue";
import { icons } from "../icons";
import {
  READER_RULER_DIM_CSS_VAR,
  READER_RULER_DIM_STICKY_CLASS,
  READER_RULER_EDITOR_CLASS,
  READER_RULER_FADE_MS,
  READER_RULER_FOCUS_CLASS,
  READER_RULER_FOCUS_OUT_CLASS,
  READER_RULER_TRANSITION_CLASS,
  buildRulerFocusDecorations,
  collectSelectionVisualRows,
  collectVisualRowsFromAnchor,
  scrollTopToCenterVisualBand,
  seedRulerAnchorFromViewport,
  rulerAnchorForContentEdgeBand,
  advanceRulerAnchorByContentLines,
  focusBandTouchesContentEdge,
  snapRulerPosToContent,
  positionsEqual,
  visualRowStart,
  isRulerLineInModel,
  type ReadingRulerPos,
} from "../reader/readingRuler";

/** 与 `READER_HL_FLOAT_ROOT_Z_INDEX` 同步；低于 `AppModal` 蒙层（6000） */
const HL_FLOAT_Z_INDEX = READER_HL_FLOAT_ROOT_Z_INDEX;

const editorEl = ref<HTMLDivElement | null>(null);
const editorShellEl = ref<HTMLDivElement | null>(null);
const contentRootEl = ref<HTMLElement | null>(null);
const diffHostEl = ref<HTMLDivElement | null>(null);

const editorEditContextMenuOpen = ref(false);
const editorEditContextMenuX = ref(0);
const editorEditContextMenuY = ref(0);
const editorEditContextMenuHasSelection = ref(false);
/** 打开右键菜单时的章节锚点行（点击处 / 选区 / 探针），供「选中本章」判断 */
const editorEditContextMenuAnchorLine = ref(1);

const partialEditOpen = ref(false);
const partialEditDraft = ref("");
const partialEditRange = ref<AnnotationRange | null>(null);

const diffReviewContextMenuOpen = ref(false);
const diffReviewContextMenuX = ref(0);
const diffReviewContextMenuY = ref(0);
const diffReviewContextMenuSide = ref<SmartFormatDiffContextMenuRequest["side"]>(
  "modified",
);
const diffReviewContextMenuHasSelection = ref(false);

const diffReviewContextMenuItems = computed(() => {
  if (diffReviewContextMenuSide.value === "original") {
    return [
      {
        id: "copy",
        label: "复制",
        disabled: !diffReviewContextMenuHasSelection.value,
      },
    ];
  }
  return [
    {
      id: "cut",
      label: "剪切",
      disabled: !diffReviewContextMenuHasSelection.value,
    },
    {
      id: "copy",
      label: "复制",
      disabled: !diffReviewContextMenuHasSelection.value,
    },
    { id: "paste", label: "粘贴" },
  ];
});

const editorEditContextMenuItems = computed(() => {
  const engines = props.webSearchSettings?.engines ?? [];
  const hasSelection = editorEditContextMenuHasSelection.value;
  const webSearchItem = {
    id: "web-search",
    label: "网络搜索",
    iconHtml: icons.browser,
    disabled: !hasSelection,
    children: [
      ...engines.map((e) => ({
        id: `web-search:${e.id}`,
        label: e.name,
      })),
      ...(engines.length
        ? [{ id: "sep-web-search-manage", separator: true as const }]
        : []),
      {
        id: "web-search-manage",
        label: "搜索管理",
      },
    ],
  };
  const items: Array<{
    id: string;
    label?: string;
    separator?: boolean;
    disabled?: boolean;
    iconHtml?: string;
    children?: Array<{
      id: string;
      label?: string;
      disabled?: boolean;
      separator?: boolean;
    }>;
  }> = [];
  if (!props.readerEditMode) {
    items.push({
      id: "copy",
      label: "复制",
      disabled: !hasSelection,
    });
    items.push({ id: "sep-select-all", separator: true });
    if (props.showSelectChapterMenuItem !== false) {
      items.push({
        id: "select-chapter",
        label: "选中本章",
        disabled: !canSelectCurrentChapter(editorEditContextMenuAnchorLine.value),
      });
    }
    items.push({ id: "selectAll", label: "全选" });
    items.push({ id: "sep-web-search", separator: true });
    items.push(webSearchItem);
    items.push({ id: "sep-edit", separator: true });
    items.push({
      id: "edit-selection",
      label: "编辑选中文本",
      iconHtml: icons.edit,
      disabled: !hasSelection,
    });
    return items;
  }
  items.push(
    { id: "cut", label: "剪切" },
    { id: "copy", label: "复制" },
    { id: "paste", label: "粘贴" },
  );
  items.push({ id: "sep-select-all", separator: true });
  if (props.showSelectChapterMenuItem !== false) {
    items.push({
      id: "select-chapter",
      label: "选中本章",
      disabled: !canSelectCurrentChapter(editorEditContextMenuAnchorLine.value),
    });
  }
  items.push({ id: "selectAll", label: "全选" });
  items.push({ id: "sep-web-search", separator: true });
  items.push(webSearchItem);
  if (
    props.aiFeaturesEnabled &&
    props.canUseAiSmartFormat &&
    !smartFormatReviewActive.value
  ) {
    items.push({ id: "sep-ai", separator: true });
    items.push({
      id: "ai-format-selection",
      label: "AI 智能排版：选中文本",
      iconHtml: icons.aiCompose,
      disabled: !hasSelection,
    });
  }
  return items;
});
const editor = shallowRef<monaco.editor.IStandaloneCodeEditor | null>(null);
const model = shallowRef<monaco.editor.ITextModel | null>(null);
/** 章节标题行内装饰（`buildChapterTitleDecorations` / `inlineClassName` 着色）；与 View Zone 留白无关 */
const chapterTitleDecorationsCollection =
  shallowRef<monaco.editor.IEditorDecorationsCollection | null>(null);
const inlineSearchDecorationsCollection =
  shallowRef<monaco.editor.IEditorDecorationsCollection | null>(null);
const annotationDecorationsCollection =
  shallowRef<monaco.editor.IEditorDecorationsCollection | null>(null);
const voiceReadDecorationsCollection =
  shallowRef<monaco.editor.IEditorDecorationsCollection | null>(null);
const readingRulerDecorationsCollection =
  shallowRef<monaco.editor.IEditorDecorationsCollection | null>(null);
/** 编辑态小地图：无选区时为当前行铺灰底（与蓝色选区区分） */
const minimapCursorLineDecorationsCollection =
  shallowRef<monaco.editor.IEditorDecorationsCollection | null>(null);
/** 编辑态小地图：章节标题（Monaco sectionHeaderText） */
const chapterMinimapDecorationsCollection =
  shallowRef<monaco.editor.IEditorDecorationsCollection | null>(null);
/** 朗读高亮行（供上一行/下一行以「正在播的行」为锚点） */
const voiceReadHighlightLine = ref<number | null>(null);
/** 阅读尺文档锚点（聚焦带中间视觉行）；null 表示下次刷新时从视口取样 */
let readingRulerAnchor: ReadingRulerPos | null = null;
/** 尺自己引发的滚动：跟视口时若仍停在这次目标上则不重新采锚 */
let readingRulerSkipFollowResync = false;
let readingRulerOwnedScrollTop: number | null = null;
const imageLightboxSrc = ref("");
const imageViewZoneIds = ref<string[]>([]);
/** 滚动时与 View Zone 合成对齐：取消未执行的 rAF，避免 dispose 后仍 render */
let imageViewZoneScrollRenderRaf: number | null = null;

const voiceReadScrollLocked = computed(
  () => props.voiceReadScrollLocked === true,
);

let removeHlGlobalListeners: (() => void) | null = null;
let unsubModalStack: (() => void) | null = null;
let removeVoiceReadKeyCapture: (() => void) | null = null;
let removeSmartFormatReviewKeyCapture: (() => void) | null = null;
let removeSelectionToolbarDigitKeyCapture: (() => void) | null = null;
const builtInThemes = new Set(["vs", "vs-dark"]);
/** 脚注/补全等溢出挂件容器（须带 `monaco-editor` + 主题类，否则挂到 body 后默认样式失效） */
let readerMonacoOverflowHost: HTMLDivElement | null = null;

function resolveMonacoThemeClass(themeName: string): string {
  if (themeName === "vs") return "vs";
  if (builtInThemes.has(themeName)) return themeName;
  return "vs-dark";
}

function ensureReaderMonacoOverflowHost(): HTMLDivElement {
  if (readerMonacoOverflowHost?.isConnected) return readerMonacoOverflowHost;
  const host = document.createElement("div");
  host.className = "monaco-editor reader-monaco-overflow-host";
  host.classList.add(resolveMonacoThemeClass(lastAppThemeName));
  document.body.appendChild(host);
  readerMonacoOverflowHost = host;
  return host;
}

function syncReaderMonacoOverflowHostTheme(themeName: string): void {
  const host = readerMonacoOverflowHost;
  if (!host) return;
  for (const cls of ["vs", "vs-dark", "hc-black", "hc-light"]) {
    host.classList.remove(cls);
  }
  host.classList.add(resolveMonacoThemeClass(themeName));
}

function disposeReaderMonacoOverflowHost(): void {
  readerMonacoOverflowHost?.remove();
  readerMonacoOverflowHost = null;
}

/** 行间距（lineHeight）= round(fontSize * multiple)，由 App 持久化并同步 */
let lineHeightMultiple = defaultReaderLineHeightMultiple;
let currentFontFamily = READER_EDITOR_DEFAULT_FONT_FAMILY;
/** App 传入的主题名（vs / vs-dark），用于切换语法着色后重设 Monaco 主题 */
let lastAppThemeName = "vs";

let chaptersSnapshot: ChapterStickyLine[] = [];
/** `registerChapterStickyScrollProviders` 注入后赋值；`setChapters` 末尾触发折叠失效以刷新粘性条 */
let notifyChapterStickyFoldingRanges: (() => void) | null = null;
let stickyChapterScrollRefreshRaf: number | null = null;
/** 向下翻页后按实际粘性条高校正目标行位置 */
let pageTurnStickyAlignRaf: number | null = null;
let pageTurnStickyAlignGen = 0;

/** 上次已写入的章节标题行内装饰对应的「章节行号序列」键；相同时可跳过 `collection.set`（仅着色，不含留白） */
let lastChapterTitleDecorationsLineKey = "";

function chapterLineNumbersKey(lineNumbers: readonly number[]): string {
  return lineNumbers.join("\0");
}

const languageId = "txtr-text";
const globalKey = "__TXTR_MONACO_LANG_REGISTERED__";
let providersDisposables: monaco.IDisposable[] = [];

export type ReaderClearOptions = {
  /** 为 true 时表示即将流式加载新正文：换模后保持关闭 sticky，直到 `streamLoading` 变 false */
  keepStickyHiddenForStream?: boolean;
};

const props = withDefaults(
  defineProps<{
    monacoCustomHighlight?: boolean;
    /** 与「内容上色」同时生效：成对引号/括号是否允许跨行 */
    txtrDelimitedMatchCrossLine?: boolean;
    /** 为 true 时由数据层压缩空行；章节标题留白由「章节标题上下保留空行」控制 */
    compressBlankLines?: boolean;
    /** Monaco 高级换行策略（wrappingStrategy: advanced） */
    monacoAdvancedWrapping?: boolean;
    /**
     * 简单换行下将 ——/…… 等按全角估算；开启高级换行时运行时自动停用。
     */
    monacoCjkWrapOptimize?: boolean;
    /** 每个物理行结束后的额外间距（px） */
    lineSpacingPx?: number;
    /** Monaco 字间距（px） */
    letterSpacingPx?: number;
    /** 正文左右边距（px）；收窄编辑器宿主，不改 Monaco 布局算法 */
    horizontalInsetPx?: number;
    /** Monaco 平滑滚动（滚轮、revealLine、setScrollTop 等） */
    monacoSmoothScrolling?: boolean;
    /**
     * 只读滚动条轨道行为：`disabled` | `page` | `jump`；
     * 编辑 / Diff 预览强制为跳转。
     */
    scrollbarTrackBehavior?: import("../constants/appUi").ScrollbarTrackBehavior;
    /** Monaco 滚轮滚动倍率 */
    mouseWheelScrollSensitivity?: number;
    /** Monaco 按住 Alt 时的滚轮加速倍率 */
    fastScrollSensitivity?: number;
    /** 阅读区顶部粘性章节标题 */
    stickyChapterTitleEnabled?: boolean;
    /**
     * 点击翻页模式：只读时正文不可选，左键下一屏、右键上一屏。
     * 编辑模式始终可选。传入生效值（含按住 Alt 的临时反转）。
     */
    readerClickMode?: boolean;
    /** 按住 Alt 临时切换交互模式（此时拖选须当普通连续选区，不能走 Monaco 列选） */
    readerClickModeAltHeld?: boolean;
    /** 阅读尺：聚焦视觉行、淡化其余行（仅只读） */
    readingRulerEnabled?: boolean;
    readingRulerFocusLines?: number;
    readingRulerDimOpacity?: number;
    /** 阅读尺开启时是否淡化粘性章节标题 */
    readingRulerDimStickyTitle?: boolean;
    /** 阅读尺焦点行切换过渡动画 */
    readingRulerTransitionEnabled?: boolean;
    /** Markdown 块级插图 ViewZone 内容高度（px） */
    markdownImageHeightPx?: number;
    /** 编辑模式下是否显示行号（只读模式始终关闭） */
    readerEditShowLineNumbers?: boolean;
    readerEditMinimap?: boolean;
    /** 主进程流式读盘期间为 true；关闭 sticky 避免旧文件黏性标题在加载全程残留 */
    streamLoading?: boolean;
    /** 合并用户覆盖后的阅读器表面色（亮色 / 暗色） */
    readerSurfaceLight?: ReaderSurfacePalette;
    readerSurfaceDark?: ReaderSurfacePalette;
    /** 当前主题下阅读器 token 独立配色开关（Monarch 引号/括号内回退用） */
    readerPaletteColorEnabled?: ReaderSurfaceColorEnabled;
    /** 当前主题下的高亮色列表（与设置中亮/暗数组之一对应） */
    highlightColors?: string[];
    /** 当前主题下的划线标注色列表（与设置中亮/暗数组之一对应） */
    lineationColors?: string[];
    /** 合并后的高亮词（全局 + 本书；上色时本书同色词优先） */
    highlightWordsByIndex?: HighlightWordsByIndex;
    /** 仅本书高亮词（选区浮层判定「是否已是高亮词」） */
    highlightWordsByIndexBookOnly?: HighlightWordsByIndex;
    /** 本书阅读器划线 / 笔记 */
    readerAnnotations?: ReaderAnnotationRecord[];
    lineationLastColors?: LineationLastColorPrefs;
    /** 选区工具条高亮词上次选用的色槽索引 */
    highlightLastColor?: number;
    /** 已打开文件路径；主窗无路径时不显示选区工具条（找书可关标注工具后仍显示） */
    readerFilePath?: string | null;
    /**
     * 选区工具条是否含高亮词 / 划线 / 笔记。
     * 找书阅读器传 false。
     */
    showSelectionAnnotationTools?: boolean;
    /** 右键是否含「选中本章」；找书按章渲染，传 false */
    showSelectChapterMenuItem?: boolean;
    /** 电子书 MD 锚点/内链：物理行号 → Monaco 显示行（与流式滤空一致） */
    ebookAnchorPhysicalToDisplay?: (physicalLine: number) => number;
    /**
     * 压缩空行时：内链侧车按 Monaco 行序记的「行号」实为显示行，需先映回源物理行再与 `ebookAnchorPhysicalToDisplay` 配对。
     */
    ebookDisplayLineToPhysical?: (displayLine: number) => number;
    /** 在**打开**查找栏（非关闭）之前调用，例如自动点亮书钉 */
    beforeRevealFindWidget?: () => void;
    /** 语音朗读播放中：禁止打开查找栏 */
    voiceReadBlocksFind?: boolean;
    /** 语音朗读播放中：禁止用户滚动（遮罩 + 滚轮拦截） */
    voiceReadScrollLocked?: boolean;
    /**
     * 只读翻页时调用：阅读尺关闭时在滚动前；阅读尺开启时在尺已无法再移之后。
     * 返回 true 表示已处理（例如找书在章节边界切章）。
     */
    interceptReadonlyPageStep?: (direction: -1 | 1) => boolean;
    /** 语音朗读已暂停：显示视口中心开播指引线 */
    voiceReadPaused?: boolean;
    /** 编辑模式：Monaco 展示磁盘原文，不经阅读管线后处理 */
    readerEditMode?: boolean;
    /**
     * 只读→编辑前由 App 采集的视口锚点（物理行 + 折行行内下标）；
     * 须在 `readerEditMode` 置 true 之前写入，避免切换后视口采样失真。
     */
    readerEditRestoreAnchor?: import("../reader/readerViewportAnchor").ReaderViewportRestoreAnchor | null;
    /** 与流式读盘一致的磁盘 txt 路径（编辑读/存用） */
    physicalReaderPath?: string | null;
    /** 章节最少字数；压缩空行格式化时与侧栏章节表一致，不足者不插入标题上下空行 */
    chapterMinCharCount?: number;
    /** Markdown 只读模式：标题行展示时剥离 ATX `#`（不影响章节检测用的内存标题） */
    fileIsMarkdown?: boolean;
    /** 全屏阅读：只读时滚动条 `auto` 淡出；窗口模式仍常显 */
    readerFullscreen?: boolean;
    /** AI 阅读助手已启用（编辑右键智能排版项） */
    aiFeaturesEnabled?: boolean;
    /** 选区工具条可选按钮显示（设置 → 阅读 → 工具条） */
    selectionToolbarButtons?: SelectionToolbarButtons;
    /** 词典设置（查词浮层） */
    dictionarySettings?: DictionarySettings;
    /** 网络搜索引擎（右键子菜单） */
    webSearchSettings?: WebSearchSettings;
    /** 翻译设置（选区翻译浮层） */
    translationSettings?: TranslationSettings;
    /** 至少一项智能排版任务已开启（设置 → 编辑） */
    canUseAiSmartFormat?: boolean;
    /** 智能排版 Diff 预览（非 null 时在编辑器区域展示左右对比） */
    smartFormatReviewSession?: SmartFormatReviewSession | null;
    /** 与 Monaco 阅读区一致的正文字体 */
    monacoFontFamily?: string;
    /** 源文件物理行文本（标注 `text` 快照） */
    getPhysicalLineContent?: (physicalLine: number) => string;
    /** 当前展示层行文本（标注 `displayText` 快照） */
    getDisplayLineContent?: (displayLine: number) => string;
    /** 只读态行首全角缩进（标注列映射须与展示层一致） */
    leadIndentFullWidth?: boolean;
  }>(),
  {
    monacoCustomHighlight: defaultMonacoCustomHighlight,
    txtrDelimitedMatchCrossLine: defaultTxtrDelimitedMatchCrossLine,
    compressBlankLines: defaultCompressBlankLines,
    monacoAdvancedWrapping: defaultMonacoAdvancedWrapping,
    monacoCjkWrapOptimize: defaultMonacoCjkWrapOptimize,
    lineSpacingPx: defaultLineSpacingPx,
    letterSpacingPx: defaultLetterSpacingPx,
    horizontalInsetPx: defaultReaderHorizontalInsetPx,
    monacoSmoothScrolling: defaultMonacoSmoothScrolling,
    scrollbarTrackBehavior: defaultScrollbarTrackBehavior,
    mouseWheelScrollSensitivity: defaultMouseWheelScrollSensitivity,
    fastScrollSensitivity: defaultFastScrollSensitivity,
    stickyChapterTitleEnabled: defaultStickyChapterTitleEnabled,
    readerClickMode: defaultReaderClickMode,
    readerClickModeAltHeld: false,
    readingRulerEnabled: defaultReadingRulerEnabled,
    readingRulerFocusLines: defaultReadingRulerFocusLines,
    readingRulerDimOpacity: defaultReadingRulerDimOpacity,
    readingRulerDimStickyTitle: defaultReadingRulerDimStickyTitle,
    readingRulerTransitionEnabled: defaultReadingRulerTransitionEnabled,
    markdownImageHeightPx: defaultMarkdownImageHeightPx,
    selectionToolbarButtons: () => ({ ...defaultSelectionToolbarButtons }),
    dictionarySettings: () => mergeDictionarySettings(undefined),
    webSearchSettings: () => mergeWebSearchSettings(undefined),
    translationSettings: () => mergeTranslationSettings(undefined),
    readerEditShowLineNumbers: defaultReaderEditShowLineNumbers,
    readerEditMinimap: defaultReaderEditMinimap,
    streamLoading: false,
    readerSurfaceLight: () => ({ ...defaultReaderPaletteLight }),
    readerSurfaceDark: () => ({ ...defaultReaderPaletteDark }),
    readerPaletteColorEnabled: () => ({ ...defaultReaderPaletteColorEnabled }),
    highlightColors: () => [...DEFAULT_HIGHLIGHT_COLORS_LIGHT],
    lineationColors: () => [...DEFAULT_LINEATION_COLORS_LIGHT],
    highlightWordsByIndex: undefined,
    highlightWordsByIndexBookOnly: undefined,
    readerAnnotations: () => [],
    lineationLastColors: () => ({ ...DEFAULT_LINEATION_LAST_COLORS }),
    highlightLastColor: DEFAULT_HIGHLIGHT_LAST_COLOR,
    readerFilePath: null,
    showSelectionAnnotationTools: true,
    showSelectChapterMenuItem: true,
    ebookAnchorPhysicalToDisplay: undefined,
    ebookDisplayLineToPhysical: undefined,
    beforeRevealFindWidget: undefined,
    voiceReadBlocksFind: false,
    voiceReadScrollLocked: false,
    interceptReadonlyPageStep: undefined,
    voiceReadPaused: false,
    readerEditMode: false,
    readerEditRestoreAnchor: null,
    physicalReaderPath: null,
    chapterMinCharCount: defaultChapterMinCharCount,
    readerFullscreen: false,
    aiFeaturesEnabled: false,
    canUseAiSmartFormat: false,
    smartFormatReviewSession: null,
    monacoFontFamily: READER_EDITOR_DEFAULT_FONT_FAMILY,
    getPhysicalLineContent: undefined,
    getDisplayLineContent: undefined,
    leadIndentFullWidth: defaultLeadIndentFullWidth,
  },
);

const emit = defineEmits<{
  probeLineChange: [
    probeLine: number,
    /** 用户阅读滚动（非 jumpTo 等程序性滚动） */
    fromReadingScroll?: boolean,
    /** 任意滚动，含侧栏跳转 / 切章 / 定时滚动自身 */
    fromAnyScroll?: boolean,
  ];
  viewportTopLineChange: [lineNumber: number];
  viewportEndLineChange: [lineNumber: number];
  viewportVisualProgressChange: [percent: number, atBottom: boolean];
  /** 仅布局变化（段间距 / 换行优化等）且视口锚点已恢复；供侧栏章节列表强制重居中 */
  layoutViewportRestored: [];
  addHighlightTerm: [payload: { text: string; colorIndex: number }];
  removeHighlightTerm: [payload: { text: string }];
  upsertReaderAnnotation: [annotation: ReaderAnnotationRecord];
  removeReaderAnnotation: [id: string];
  updateLineationLastColor: [
    payload: { type: import("../stores/fileMetaStore").ReaderLineationType; colorIndex: number },
  ];
  updateHighlightLastColor: [colorIndex: number];
  askAiWithQuote: [text: string];
  /** 选区工具条「查找」→ 侧栏全文搜索 */
  searchWithQuote: [text: string];
  readerEditDirtyChange: [dirty: boolean];
  readerEditContentChange: [];
  readerEditLoaded: [payload: { encoding: string }];
  readerEditLoadFailed: [];
  readerEditSaveRequest: [];
  readerEditCursorChange: [
    payload: { line: number; column: number; selectionLength: number },
  ];
  applyPartialPhysicalEdit: [
    payload: { range: AnnotationRange; text: string },
  ];
  voiceReadResume: [];
  aiSmartFormatFull: [];
  aiSmartFormatSelection: [];
  smartFormatReviewApply: [];
  smartFormatReviewDiscard: [];
  annotationQuotesChanged: [];
  openDictionaryManage: [];
  openWebSearchManage: [];
  openTranslateManage: [];
  "update:translationSettings": [v: TranslationSettings];
}>();

const smartFormatRunning = ref(false);

const smartFormatReviewActive = computed(
  () => props.smartFormatReviewSession != null,
);

/** 点击翻页：仅只读阅读；编辑 / 朗读锁滚动 / Diff 预览时不生效 */
const readerClickTurnPageActive = computed(
  () =>
    props.readerClickMode &&
    !props.readerEditMode &&
    !props.voiceReadScrollLocked &&
    !smartFormatReviewActive.value,
);

const horizontalInsetDesired = computed(
  () => Math.max(0, props.horizontalInsetPx ?? 0),
);

/** 按窗格宽度压缩后的实际单侧边距（保证正文宿主 ≥ 阅读区最小宽） */
const appliedHorizontalInsetPx = ref(0);

const horizontalInsetActive = computed(
  () =>
    appliedHorizontalInsetPx.value > 0 && !smartFormatReviewActive.value,
);

/** 窗口模式：把竖条 fixed 到窗格右缘时用的视口坐标 */
const windowInsetChromePinVars = ref<Record<string, string>>({});

const horizontalInsetWindowPin = computed(
  () => horizontalInsetActive.value && !props.readerFullscreen,
);

const horizontalInsetStyle = computed(() => {
  if (!horizontalInsetActive.value) return undefined;
  return {
    "--reader-h-inset": `${appliedHorizontalInsetPx.value}px`,
    ...windowInsetChromePinVars.value,
  };
});

function syncAppliedHorizontalInset() {
  const paneW = contentRootEl.value?.clientWidth ?? 0;
  const next = effectiveReaderHorizontalInsetPx(
    horizontalInsetDesired.value,
    paneW,
  );
  const changed = next !== appliedHorizontalInsetPx.value;
  appliedHorizontalInsetPx.value = next;
  return changed;
}

function syncWindowInsetChromePin() {
  if (!horizontalInsetWindowPin.value) {
    windowInsetChromePinVars.value = {};
    return;
  }
  const pane = contentRootEl.value;
  if (!pane) {
    windowInsetChromePinVars.value = {};
    return;
  }
  const paneRect = pane.getBoundingClientRect();
  const host =
    editor.value?.getDomNode() ??
    editorEl.value ??
    pane;
  const hostRect = host.getBoundingClientRect();
  windowInsetChromePinVars.value = {
    "--reader-sb-top": `${Math.round(hostRect.top)}px`,
    "--reader-sb-height": `${Math.round(hostRect.height)}px`,
    "--reader-sb-right": `${Math.max(0, Math.round(window.innerWidth - paneRect.right))}px`,
  };
}

function syncHorizontalInsetLayout() {
  const insetChanged = syncAppliedHorizontalInset();
  syncWindowInsetChromePin();
  if (insetChanged) {
    requestAnimationFrame(() => {
      editor.value?.layout();
      smartFormatDiffEditor.value?.layout();
      syncWindowInsetChromePin();
    });
  }
}

let horizontalInsetLayoutRo: ResizeObserver | null = null;

function teardownHorizontalInsetLayout() {
  horizontalInsetLayoutRo?.disconnect();
  horizontalInsetLayoutRo = null;
  window.removeEventListener("resize", syncHorizontalInsetLayout);
}

function setupHorizontalInsetLayout() {
  teardownHorizontalInsetLayout();
  syncHorizontalInsetLayout();
  // 设定边距 > 0 时持续观察：窄窗会压到 0，拉宽后仍需恢复
  if (horizontalInsetDesired.value <= 0) return;
  const pane = contentRootEl.value;
  if (!pane) return;
  horizontalInsetLayoutRo = new ResizeObserver(() => {
    syncHorizontalInsetLayout();
  });
  horizontalInsetLayoutRo.observe(pane);
  if (editorEl.value) horizontalInsetLayoutRo.observe(editorEl.value);
  window.addEventListener("resize", syncHorizontalInsetLayout);
}

const readerAnn = useReaderAnnotations({
  editor,
  model,
  readerAnnotations: () => props.readerAnnotations ?? [],
  lineationLastColors: () => props.lineationLastColors ?? DEFAULT_LINEATION_LAST_COLORS,
  highlightLastColor: () =>
    props.highlightLastColor ?? DEFAULT_HIGHLIGHT_LAST_COLOR,
  readerFilePath: () => props.readerFilePath,
  readerEditMode: () => props.readerEditMode === true,
  showSelectionAnnotationTools: () => props.showSelectionAnnotationTools !== false,
  monacoCustomHighlight: () => props.monacoCustomHighlight === true,
  aiFeaturesEnabled: () => props.aiFeaturesEnabled === true,
  selectionToolbarButtons: () =>
    props.selectionToolbarButtons ?? defaultSelectionToolbarButtons,
  highlightWordsByIndexBookOnly: () => props.highlightWordsByIndexBookOnly,
  highlightColorsLength: () => props.highlightColors.length,
  lineationColorsLength: () => props.lineationColors.length,
  emitUpsert: (ann) => emit("upsertReaderAnnotation", ann),
  emitRemove: (id) => emit("removeReaderAnnotation", id),
  emitUpdateLineationColor: (payload) => emit("updateLineationLastColor", payload),
  emitUpdateHighlightLastColor: (colorIndex) =>
    emit("updateHighlightLastColor", colorIndex),
  emitAddHighlightTerm: (payload) => emit("addHighlightTerm", payload),
  emitRemoveHighlightTerm: (payload) => emit("removeHighlightTerm", payload),
  emitAskAiWithQuote: (text) => emit("askAiWithQuote", text),
  emitFindWithQuote: (text) => {
    const target =
      (props.selectionToolbarButtons ?? defaultSelectionToolbarButtons)
        .findTarget;
    if (target === "sidebarSearch") {
      emit("searchWithQuote", text);
      return;
    }
    openFindWithSearchString(text);
  },
  ebookDisplayLineToPhysical: () => props.ebookDisplayLineToPhysical,
  ebookAnchorPhysicalToDisplay: () => props.ebookAnchorPhysicalToDisplay,
  getPhysicalLineContent: (line) => props.getPhysicalLineContent?.(line) ?? "",
  getDisplayLineContent: (line) => props.getDisplayLineContent?.(line) ?? "",
  leadIndentFullWidth: () => props.leadIndentFullWidth === true,
  onAnnotationIndexRebuilt: () => emit("annotationQuotesChanged"),
  annotationDecorationsCollection,
});

const {
  toolbarVisible,
  colorPickerMode,
  lineationPickerType,
  floatCenterX,
  floatRootTop,
  floatOpenDownward,
  floatRootRef,
  activeLineation,
  toolbarHasLineation,
  toolbarHasNote,
  lineationPickerSelectedIndex,
  hlPickerShowRemoveRow,
  hlPickerExistingColorIndex,
  notePanelOpen,
  notePanelDraft,
  notePanelEditing,
  notePanelSourceText,
  closeNotePanel,
  dictionaryPopupOpen,
  dictionaryPopupWord,
  dictionaryPopupCenterX,
  dictionaryPopupTop,
  dictionaryPopupOpenDownward,
  dictionaryPopupMaxHeight,
  dictionaryPopupRootRef,
  closeDictionaryPopup,
  translatePopupOpen,
  translatePopupText,
  translatePopupCenterX,
  translatePopupTop,
  translatePopupOpenDownward,
  translatePopupMaxHeight,
  translatePopupRootRef,
  closeTranslatePopup,
  onToolbarAction,
  onSelectionToolbarDigitKey,
  onHighlightPickConfirm,
  onHighlightPickRemove,
  onLineationPickConfirm,
  onLineationPickRemove,
  onNotePanelConfirm,
  onNotePanelDelete,
  jumpToAnnotationRange,
  getAnnotationDisplayQuote,
  getAnnotationHitsByLine,
  rebuildAnnotationIndex,
  refreshAnnotationDecorations,
  bindAnnotationScrollSync,
  disposeAnnotationDecorations,
  onSelectionChangedDuringInteraction,
} = readerAnn;

const smartFormatReviewScopeLabel = computed(() => {
  const s = props.smartFormatReviewSession;
  if (!s) return "";
  const kind = s.scope === "full" ? "全文" : "选区";
  return `${kind} · 第 ${s.startLine}–${s.endLine} 行`;
});

function getDiffEditorOptionsInput(): import("../monaco/readerEditorOptions").ReaderEditorCreateOptionsInput {
  const e = editor.value;
  // 排版改动合并到帧末执行；Diff 需要的是「最终生效值」而非当前 Monaco 旧值
  const pending = pendingTypographyUpdate;
  const fontSize =
    pending?.fontSize ??
    e?.getOption(monaco.editor.EditorOption.fontSize) ??
    READER_EDITOR_DEFAULT_FONT_SIZE;
  return {
    fontSize,
    lineHeightMultiple: pending?.lineHeightMultiple ?? lineHeightMultiple,
    letterSpacingPx: pending?.letterSpacingPx ?? props.letterSpacingPx,
    fontFamily: pending?.fontFamily ?? currentFontFamily,
    theme: readerMonacoThemeForAppTheme(lastAppThemeName),
    smoothScrolling: props.monacoSmoothScrolling,
    mouseWheelScrollSensitivity: props.mouseWheelScrollSensitivity,
    fastScrollSensitivity: props.fastScrollSensitivity,
    wrappingStrategyAdvanced: props.monacoAdvancedWrapping,
  };
}

const {
  changeCount: smartFormatDiffChangeCount,
  showWhitespaceDiff: smartFormatDiffShowWhitespace,
  hideUnchangedRegionsEnabled: smartFormatDiffHideUnchanged,
  layoutDiffEditor,
  syncDiffEditorTypography,
  goToPreviousDiff: smartFormatDiffGoToPrevious,
  goToNextDiff: smartFormatDiffGoToNext,
  toggleShowWhitespaceDiff: smartFormatDiffToggleWhitespace,
  toggleHideUnchangedRegions: smartFormatDiffToggleHideUnchanged,
  getSmartFormatReviewModifiedText,
  diffEditor: smartFormatDiffEditor,
} = useReaderSmartFormatDiff({
    diffHostEl,
    session: () => props.smartFormatReviewSession,
    getCreateOptionsInput: getDiffEditorOptionsInput,
    onContextMenuRequest: (request) => {
      closeEditorEditContextMenu();
      diffReviewContextMenuSide.value = request.side;
      diffReviewContextMenuHasSelection.value = request.hasSelection;
      diffReviewContextMenuX.value = request.x;
      diffReviewContextMenuY.value = request.y;
      diffReviewContextMenuOpen.value = true;
    },
    onDiffEditorCursorActivity: (ed) => emitReaderEditCursorStatus(ed),
  });

function onSmartFormatReviewApply() {
  emit("smartFormatReviewApply");
}

function onSmartFormatReviewDiscard() {
  emit("smartFormatReviewDiscard");
}

let readerEditSavedSnapshot = "";
/** 载入编辑正文、恢复视口等程序化写入期间不判 dirty */
let readerEditSuppressDirty = false;
let readerEditContentDisposable: monaco.IDisposable | null = null;
/** 成功载入编辑态正文的磁盘路径，用于同路径内避免重复整文件读 */
let readerEditLoadedPhysicalKey = "";
let saveCommandDisposable: monaco.IDisposable | null = null;

function teardownReaderEditContentListener() {
  readerEditContentDisposable?.dispose();
  readerEditContentDisposable = null;
}

function emitReaderEditDirtyIfChanged() {
  const m = model.value;
  if (!m || !props.readerEditMode || readerEditSuppressDirty) return;
  const dirty = m.getValue() !== readerEditSavedSnapshot;
  emit("readerEditDirtyChange", dirty);
}

function onReaderEditModelContentChange() {
  emitReaderEditDirtyIfChanged();
  if (readerEditSuppressDirty) return;
  emit("readerEditContentChange");
  emitProbeLine(false);
}

/** 以 Monaco 当前全文为「未修改」基线（须在 setValue / 视口恢复之后调用） */
function sealReaderEditBaseline() {
  const m = model.value;
  if (!m) return;
  readerEditSavedSnapshot = m.getValue();
  emit("readerEditDirtyChange", false);
}

/** 编辑 / Diff 预览强制跳转；只读用设置值 */
function effectiveScrollbarTrackBehavior(): import("../constants/appUi").ScrollbarTrackBehavior {
  if (props.readerEditMode || smartFormatReviewActive.value) return "jump";
  return props.scrollbarTrackBehavior ?? defaultScrollbarTrackBehavior;
}

/** 只读 / 编辑：切换 Monaco「阅读优化 chrome」与原生编辑 chrome（字体与配色仍走共享逻辑） */
function applyReaderMonacoModeOptions(editMode: boolean) {
  editor.value?.updateOptions(
    buildReaderMonacoModeEditorOptions(
      editMode,
      props.readerEditShowLineNumbers,
      props.readerEditMinimap,
      props.readerFullscreen,
    ),
  );
  applyReaderClickModeMouseStyle();
  syncReadingRulerEditorClass();
}

async function loadReaderEditFromDisk() {
  const p = props.physicalReaderPath?.trim();
  if (!p || !window.colorTxt?.readWholeTextFile) return;
  const r = await window.colorTxt.readWholeTextFile(p);
  if (!r.ok) {
    await appAlert(r.message);
    emit("readerEditLoadFailed");
    return;
  }
  const m = model.value;
  const e = editor.value;
  if (!m || !e) return;
  const restoreAnchor =
    props.readerEditRestoreAnchor ??
    (() => {
      const endDisplay = Math.max(1, Math.floor(getViewportEndLine()));
      const rawP =
        typeof props.ebookDisplayLineToPhysical === "function"
          ? props.ebookDisplayLineToPhysical(endDisplay)
          : endDisplay;
      return {
        physicalLine: Math.max(1, Math.floor(rawP)),
        wrappedLineIndex: 0,
      };
    })();
  disposeEbookInternalLinks();
  await applyEmbeddedImageAnchors(null);
  readerEditSuppressDirty = true;
  m.setValue(r.text);
  readerEditLoadedPhysicalKey = p;
  applyReaderMonacoModeOptions(true);
  teardownReaderEditContentListener();
  readerEditContentDisposable = m.onDidChangeContent(() => {
    onReaderEditModelContentChange();
  });
  const emitReaderEditLoadedAfterViewport = () => {
    sealReaderEditBaseline();
    readerEditSuppressDirty = false;
    emit("readerEditLoaded", { encoding: r.encoding });
    void nextTick(() => emitReaderEditCursorStatus());
  };

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      void restoreViewportToRestoreAnchor(restoreAnchor).then(() => {
        emitReaderEditLoadedAfterViewport();
      });
    });
  });
}

function markReaderEditSaved() {
  sealReaderEditBaseline();
}

function applyEditLineRangePatch(
  startLine: number,
  endLine: number,
  text: string,
): boolean {
  const m = model.value;
  const e = editor.value;
  if (!m || !e || !props.readerEditMode) {
    return false;
  }
  const sl = Math.max(1, Math.min(startLine, m.getLineCount()));
  const el = Math.max(sl, Math.min(endLine, m.getLineCount()));
  const range = new monaco.Range(
    sl,
    1,
    el,
    m.getLineMaxColumn(el),
  );
  if (text === m.getValueInRange(range)) return false;
  m.pushEditOperations(
    e.getSelections(),
    [{ range, text, forceMoveMarkers: true }],
    () => null,
  );
  return true;
}

function getSelectionRange(): monaco.Range | null {
  const e = editor.value;
  if (!e) return null;
  const sel = e.getSelection();
  if (!sel) return null;
  return monaco.Range.lift(sel);
}

/** 智能排版进行中：选中当前分段，并将分段末行贴齐视口底 */
function revealSmartFormatSegment(startLine: number, endLine: number): void {
  const e = editor.value;
  const m = model.value;
  if (!e || !m || !props.readerEditMode) return;

  const apply = () => {
    const lineCount = m.getLineCount();
    if (lineCount < 1) return;
    const sl = Math.max(1, Math.min(Math.floor(startLine), lineCount));
    const el = Math.max(sl, Math.min(Math.floor(endLine), lineCount));
    const selection = new monaco.Selection(
      sl,
      1,
      el,
      m.getLineMaxColumn(el),
    );
    e.layout();
    scrollLineToBottom(el, true);
    e.setSelection(selection);
    e.focus();
  };

  requestAnimationFrame(() => {
    requestAnimationFrame(apply);
  });
}

/** 排版预览「应用」写回后：选中写回范围，并将末行贴齐视口底 */
function focusSmartFormatAppliedRange(
  startLine: number,
  patchedText: string,
): void {
  const m = model.value;
  const e = editor.value;
  if (!m || !e || !props.readerEditMode) return;

  const apply = () => {
    const lineCount = m.getLineCount();
    if (lineCount < 1) return;
    const sl = Math.max(1, Math.min(Math.floor(startLine), lineCount));
    const insertedLines = countLinesInText(patchedText);
    if (insertedLines < 1) {
      e.setPosition({ lineNumber: sl, column: 1 });
      e.focus();
      return;
    }
    const el = Math.max(sl, Math.min(sl + insertedLines - 1, lineCount));
    const selection = new monaco.Selection(
      sl,
      1,
      el,
      m.getLineMaxColumn(el),
    );
    e.layout();
    e.setSelection(selection);
    scrollLineToBottom(el, true);
    e.setSelection(selection);
    e.focus();
  };

  requestAnimationFrame(() => {
    requestAnimationFrame(apply);
  });
}

function setSmartFormatRunning(lock: boolean): void {
  smartFormatRunning.value = lock;
  const e = editor.value;
  if (!e || !props.readerEditMode) return;
  e.updateOptions({ readOnly: lock });
  if (!lock) applyReaderMonacoModeOptions(true);
}

/** 编辑模式格式化整篇替换（`setValue` 比 `executeEdits` 更快，但会清空撤销栈，不支持撤销）。 */
function setModelTextIfChanged(text: string): boolean {
  const m = model.value;
  if (!m) return false;
  if (text === m.getValue()) return false;
  m.setValue(text);
  return true;
}

function resolveDisplayLineToPhysical(displayLine: number): number {
  if (props.readerEditMode) {
    return Math.max(1, Math.floor(displayLine));
  }
  const map =
    typeof props.ebookDisplayLineToPhysical === "function"
      ? props.ebookDisplayLineToPhysical
      : (d: number) => d;
  return Math.max(1, Math.floor(map(displayLine)));
}

function captureViewportRestoreAnchor(opts?: {
  skipLayout?: boolean;
}): ReaderViewportRestoreAnchor | null {
  const e = editor.value;
  const m = model.value;
  if (!e || !m) return null;
  return captureReaderViewportRestoreAnchor(
    e,
    m,
    resolveDisplayLineToPhysical,
    READER_VIEWPORT_RESTORE_SLOT_FROM_TOP,
    opts,
  );
}

function restoreViewportToRestoreAnchor(
  anchor: ReaderViewportRestoreAnchor,
  displayLineToPhysicalLine?: readonly number[],
): Promise<void> {
  const e = editor.value;
  const m = model.value;
  if (!e || !m) return Promise.resolve();

  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        beginProgrammaticScroll();
        const scrollTop = computeScrollTopForReaderViewportRestoreAnchor(
          e,
          m,
          anchor,
          displayLineToPhysicalLine,
        );
        if (scrollTop != null) {
          e.setScrollTop(scrollTop, monacoScrollType(false));
          const displayLine = resolveDisplayLineForViewportRestore(
            anchor.physicalLine,
            m.getLineCount(),
            displayLineToPhysicalLine,
            (d) => m.getLineContent(d),
          );
          e.setPosition({ lineNumber: displayLine, column: 1 });
        } else if (anchor.physicalLine >= m.getLineCount()) {
          scrollToBottom(false);
        } else {
          jumpToLine(1, false);
        }
        void nextTick(() => {
          normalizeScrollAfterEmbeddedViewZones();
          emitProbeLine(false);
          e.focus();
          resolve();
        });
      });
    });
  });
}

function readerFileIsMarkdown(): boolean {
  const p = props.physicalReaderPath ?? props.readerFilePath ?? "";
  return p ? isMarkdownFilePath(p) : false;
}

function smartFormatPostProcessContext(): SmartFormatPostProcessContext {
  const isMarkdown = readerFileIsMarkdown();
  return {
    chapterMinCharCount: props.chapterMinCharCount,
    isMarkdown,
    preserveMarkdownSourceLines: props.readerEditMode && isMarkdown,
    preservePhysicalSourceLines: props.readerEditMode,
  };
}

function readerFormatOptions(
  overrides: Partial<ReaderDisplayFormatOptions> = {},
): ReaderDisplayFormatOptions {
  const ctx = smartFormatPostProcessContext();
  return {
    compressBlankLines: false,
    compressBlankKeepOneBlank: false,
    chapterTitleBlankMode: defaultChapterTitleBlankMode,
    leadIndentFullWidth: false,
    minCharCount: ctx.chapterMinCharCount,
    isMarkdown: ctx.isMarkdown,
    preserveMarkdownSourceLines: ctx.preserveMarkdownSourceLines,
    preservePhysicalSourceLines: ctx.preservePhysicalSourceLines,
    ...overrides,
  };
}

async function applyEditFormat(
  format: (plain: string) => {
    text: string;
    displayLineToPhysicalLine?: readonly number[];
  },
): Promise<boolean> {
  const m = model.value;
  if (!m || !props.readerEditMode) return false;
  const anchor =
    captureViewportRestoreAnchor() ?? {
      physicalLine: resolveDisplayLineToPhysical(
        Math.max(1, Math.floor(getViewportEndLine())),
      ),
      wrappedLineIndex: 0,
    };
  const { text, displayLineToPhysicalLine } = format(m.getValue());
  if (!setModelTextIfChanged(text)) return false;
  emitReaderEditDirtyIfChanged();
  await restoreViewportToRestoreAnchor(anchor, displayLineToPhysicalLine);
  return true;
}

async function applyEditFormatAsync(
  format: (plain: string) => Promise<{
    text: string;
    displayLineToPhysicalLine?: readonly number[];
  }>,
): Promise<boolean> {
  const m = model.value;
  if (!m || !props.readerEditMode) return false;
  const anchor =
    captureViewportRestoreAnchor() ?? {
      physicalLine: resolveDisplayLineToPhysical(
        Math.max(1, Math.floor(getViewportEndLine())),
      ),
      wrappedLineIndex: 0,
    };
  const { text, displayLineToPhysicalLine } = await format(m.getValue());
  if (!setModelTextIfChanged(text)) return false;
  emitReaderEditDirtyIfChanged();
  await restoreViewportToRestoreAnchor(anchor, displayLineToPhysicalLine);
  return true;
}

async function applyEditFormatCompressBlankLines(
  keepOneBlank: boolean,
  chapterTitleBlankMode: ChapterTitleBlankMode = defaultChapterTitleBlankMode,
): Promise<boolean> {
  return applyEditFormat((plain) =>
    formatPhysicalPlainTextForReader(
      plain,
      readerFormatOptions({
        compressBlankLines: true,
        compressBlankKeepOneBlank: keepOneBlank,
        chapterTitleBlankMode,
      }),
    ),
  );
}

async function applyEditFormatLeadIndentFullWidth(): Promise<boolean> {
  return applyEditFormat((plain) =>
    formatPhysicalPlainTextForReader(
      plain,
      readerFormatOptions({ leadIndentFullWidth: true }),
    ),
  );
}

async function applyEditFormatTextConvertZh(
  mode: TextConvertZhMode,
): Promise<boolean> {
  return applyEditFormatAsync(async (plain) => ({
    text: await applyTextConvertZh(plain, mode),
  }));
}

async function applyEditFormatTextConvertLetters(
  mode: TextConvertWidthMode,
): Promise<boolean> {
  return applyEditFormat((plain) => ({
    text: applyTextConvertLetters(plain, mode),
  }));
}

async function applyEditFormatTextConvertDigits(
  mode: TextConvertWidthMode,
): Promise<boolean> {
  return applyEditFormat((plain) => ({
    text: applyTextConvertDigits(plain, mode),
  }));
}

async function applyEditFormatTextReplace(
  rules: readonly ReplaceRule[],
): Promise<boolean> {
  const path =
    props.physicalReaderPath?.trim() || props.readerFilePath?.trim() || "";
  const base = path
    ? path.replace(/\\/g, "/").split("/").pop() || path
    : "";
  const title = base ? bookTitleForExport(base) : "";
  const bookName = title && title !== "未命名" ? title : base;
  return applyEditFormat((plain) => ({
    text: applyReplaceRulesToText(
      plain,
      filterEnabledReplaceRules([...rules], bookName, "", "content"),
    ),
  }));
}

function applySmartFormatReviewFormat(
  format: (plain: string) => string,
): boolean {
  if (!smartFormatReviewActive.value) return false;
  const modifiedEd = smartFormatDiffEditor.value?.getModifiedEditor();
  const m = modifiedEd?.getModel();
  if (!modifiedEd || !m) return false;
  const plain = m.getValue();
  const formatted = format(plain);
  if (formatted === plain) return false;
  modifiedEd.pushUndoStop();
  modifiedEd.executeEdits("smartFormatReviewFormat", [
    {
      range: m.getFullModelRange(),
      text: formatted,
    },
  ]);
  return true;
}

function applySmartFormatReviewCompressBlankLines(
  keepOneBlank: boolean,
  chapterTitleBlankMode: ChapterTitleBlankMode = defaultChapterTitleBlankMode,
): boolean {
  return applySmartFormatReviewFormat((plain) =>
    compressBlankLinesInText(
      plain,
      smartFormatPostProcessContext(),
      keepOneBlank,
      chapterTitleBlankMode,
    ),
  );
}

function applySmartFormatReviewLeadIndentFullWidth(): boolean {
  return applySmartFormatReviewFormat((plain) =>
    leadIndentFullWidthInText(plain, smartFormatPostProcessContext()),
  );
}

function applyEditFormatInLineRange(
  startLine: number,
  endLine: number,
  format: (plain: string) => string,
): boolean {
  const m = model.value;
  if (!m || !props.readerEditMode) return false;
  const sl = Math.max(1, Math.min(startLine, m.getLineCount()));
  const el = Math.max(sl, Math.min(endLine, m.getLineCount()));
  const parts: string[] = [];
  for (let ln = sl; ln <= el; ln++) {
    parts.push(m.getLineContent(ln));
  }
  const plain = parts.join("\n");
  const formatted = format(plain);
  if (formatted === plain) return false;
  return applyEditLineRangePatch(sl, el, formatted);
}

function applyEditFormatCompressBlankLinesInRange(
  startLine: number,
  endLine: number,
  keepOneBlank: boolean,
  chapterTitleBlankMode: ChapterTitleBlankMode = defaultChapterTitleBlankMode,
): boolean {
  return applyEditFormatInLineRange(startLine, endLine, (plain) =>
    compressBlankLinesInText(
      plain,
      smartFormatPostProcessContext(),
      keepOneBlank,
      chapterTitleBlankMode,
    ),
  );
}

function applyEditFormatLeadIndentFullWidthInRange(
  startLine: number,
  endLine: number,
): boolean {
  return applyEditFormatInLineRange(startLine, endLine, (plain) =>
    leadIndentFullWidthInText(plain, smartFormatPostProcessContext()),
  );
}

function getTxtrMonarchHighlightOptions(): TxtrMonarchHighlightOptions {
  return {
    enabled: props.monacoCustomHighlight,
    highlightColorsLength: props.highlightColors.length,
    highlightWordsByIndex: props.highlightWordsByIndex,
  };
}

/** 高亮词或开关变化时更新 Monarch；会触发 TokenizationRegistry 失效并重算 token */
function applyTxtrMonarchTokenizer() {
  monaco.languages.setMonarchTokensProvider(
    languageId,
    createTxtrTextMonarchLanguage(
      getTxtrMonarchHighlightOptions(),
      props.txtrDelimitedMatchCrossLine,
      props.readerPaletteColorEnabled,
    ),
  );
}

function closeHighlightFloatUi() {
  readerAnn.closeToolbarUi();
}

watch(
  () => props.highlightColors,
  () => {
    applyReaderSyntaxFromProps();
  },
  { deep: true },
);

watch(
  () => props.lineationColors,
  () => {
    syncLineationColorStyles();
  },
  { deep: true },
);

watch(
  () => props.highlightWordsByIndex,
  () => {
    applyTxtrMonarchTokenizer();
  },
  { deep: true },
);

watch(
  () => props.readerPaletteColorEnabled,
  () => {
    applyTxtrMonarchTokenizer();
  },
  { deep: true },
);

/**
 * 高级换行开关：advanced 折行更精确但更重（80 万行实测数百毫秒）。
 * 与中文换行优化一起提交到同一个帧末排版事务，只重建一次折行映射。
 */
watch(
  () => props.monacoAdvancedWrapping,
  (advanced) => {
    scheduleTypographyUpdate({
      wrappingStrategyAdvanced: advanced,
      cjkWrapOptimize: effectiveCjkWrapOptimize(),
    });
  },
);

watch(
  () => props.monacoCjkWrapOptimize,
  () => {
    syncCjkWrapOptimizeFlag(true);
  },
);

watch(
  () => props.lineSpacingPx,
  (px) => {
    setLineSpacingPx(px);
  },
);

watch(
  () => props.markdownImageHeightPx,
  (px) => {
    const e = editor.value;
    if (!e || imageViewZoneIds.value.length === 0) return;
    syncReaderImageViewZonesLineSpacing(
      e,
      imageViewZoneIds.value,
      clampMarkdownImageHeightPx(px),
    );
  },
);

watch(
  () => props.letterSpacingPx,
  (px) => {
    setLetterSpacingPx(px);
  },
);

watch(
  () => [props.horizontalInsetPx, props.readerFullscreen] as const,
  () => {
    void nextTick(() => {
      setupHorizontalInsetLayout();
    });
  },
);

watch(
  () => props.monacoSmoothScrolling,
  (on) => {
    editor.value?.updateOptions({ smoothScrolling: on });
  },
);

watch(
  () =>
    [
      props.mouseWheelScrollSensitivity,
      props.fastScrollSensitivity,
    ] as const,
  ([wheel, fast]) => {
    editor.value?.updateOptions({
      mouseWheelScrollSensitivity: wheel,
      fastScrollSensitivity: fast,
    });
  },
);

watch(
  () => [props.stickyChapterTitleEnabled, props.streamLoading] as const,
  (val, oldVal) => {
    syncStickyScrollToStreamState();
    if (oldVal != null && oldVal[1] === true && val[1] === false) {
      refreshChapterStickyScroll();
    }
  },
);

watch(
  () =>
    [
      props.readerEditShowLineNumbers,
      props.readerEditMinimap,
      props.readerEditMode,
      props.readerFullscreen,
    ] as const,
  () => {
    if (!editor.value) return;
    applyReaderMonacoModeOptions(Boolean(props.readerEditMode));
    void nextTick(() => {
      editor.value?.layout();
    });
    syncMinimapCursorLineDecoration();
    syncChapterMinimapSectionHeaderDecorations();
  },
);

function stickyChapterTitleShouldEnable(): boolean {
  return Boolean(props.stickyChapterTitleEnabled) && !props.streamLoading;
}

function syncStickyScrollToStreamState() {
  const ed = editor.value;
  if (!ed) return;
  ed.updateOptions({
    stickyScroll: { enabled: stickyChapterTitleShouldEnable() },
  });
}

/** 章节大纲/标题装饰已更新后，强制粘性条重绘以套用样式 */
function scheduleStickyChapterScrollRefresh() {
  if (!stickyChapterTitleShouldEnable()) return;
  const ed = editor.value;
  if (!ed) return;
  if (stickyChapterScrollRefreshRaf != null) {
    cancelAnimationFrame(stickyChapterScrollRefreshRaf);
  }
  stickyChapterScrollRefreshRaf = requestAnimationFrame(() => {
    stickyChapterScrollRefreshRaf = null;
    const e = editor.value;
    if (!e || !stickyChapterTitleShouldEnable()) return;
    refreshStickyChapterScrollWidget(e);
  });
}

/** 流式/章节加载结束后刷新粘性章节标题（加载期间 sticky 关闭，须在大纲更新后再开） */
function refreshChapterStickyScroll() {
  notifyChapterStickyFoldingRanges?.();
  scheduleStickyChapterScrollRefresh();
  requestAnimationFrame(() => {
    notifyChapterStickyFoldingRanges?.();
    scheduleStickyChapterScrollRefresh();
  });
}

/** 程序性滚动（跳转、复位等）期间，onDidScrollChange 仍触发，但不视为用户阅读滚动 */
let programmaticScrollDepth = 0;

function beginProgrammaticScroll() {
  programmaticScrollDepth++;
  window.setTimeout(() => {
    programmaticScrollDepth = Math.max(0, programmaticScrollDepth - 1);
  }, 500);
}

const {
  ebookInternalLinkHitCount,
  disposeEbookInternalLinks,
  applyMarkdownInternalLinks,
  setPendingEbookInternalLinkSidecar,
  shiftPendingEbookSidecarForDeletedDisplayLines,
  clearPendingEbookSidecar,
  getEbookLeadingLinkLabelsByDisplayLine,
  tryJumpEbookInternalLinkFromPoint,
  shiftHitColumnsAfterChapterTitleEdit,
  invalidateAndSyncViewportDecorations,
} = useReaderEbookInternalLinks({
  editor,
  model,
  physicalReaderPath: () => props.physicalReaderPath,
  ebookAnchorPhysicalToDisplay: () => props.ebookAnchorPhysicalToDisplay,
  ebookDisplayLineToPhysical: () => props.ebookDisplayLineToPhysical,
  compressBlankLines: () => props.compressBlankLines === true,
  beginProgrammaticScroll,
  jumpToBookmarkLine: (line, smooth) => jumpToBookmarkLine(line, smooth),
});

/** 与设置「平滑滚动」一致：关闭时一律立即滚动 */
function monacoScrollType(wantSmooth: boolean): monaco.editor.ScrollType {
  return wantSmooth && props.monacoSmoothScrolling
    ? monaco.editor.ScrollType.Smooth
    : monaco.editor.ScrollType.Immediate;
}

/**
 * 读盘按固定字节分块时，CRLF 常被拆成上一块以 \\r 结尾、下一块以 \\n 开头。
 * 若分两次 applyEdits，Monaco 会对 \\r 与 \\n 各计一行，中间多出一行空行。
 * 故将末尾孤立的 \\r 暂存，与下一段拼接后再写入；流结束再刷出孤立的 \\r（经典 Mac 换行）。
 */
let streamCarriageReturnPending = false;

function appendText(text: string) {
  const m = model.value;
  if (!m) return;
  let t = text;
  if (streamCarriageReturnPending) {
    streamCarriageReturnPending = false;
    t = `\r${t}`;
  }
  if (t.endsWith("\r\n")) {
    // 完整 CRLF，直接写入
  } else if (t.endsWith("\r")) {
    streamCarriageReturnPending = true;
    t = t.slice(0, -1);
  }
  if (!t) return;
  const endPos = m.getPositionAt(m.getValueLength());
  m.applyEdits([
    {
      range: new monaco.Range(
        endPos.lineNumber,
        endPos.column,
        endPos.lineNumber,
        endPos.column,
      ),
      text: t,
    },
  ]);
}

/** 流式读盘结束后一次性写入正文（分块时不再逐块 append，避免重复着色与换行拼接问题） */
async function setFullText(
  text: string,
  opts?: { heavy?: boolean; resetScroll?: boolean },
) {
  /**
   * 待处理的排版改动必须先在**旧模型**上落地：
   * 等整文替换后再刷会被视口锚点采到新文，且会多触发一次全书折行。
   */
  flushTypographyUpdate();
  streamCarriageReturnPending = false;
  const m = model.value;
  const e = editor.value;
  if (!m || !e) return;
  const heavy = opts?.heavy === true;
  const resetScroll = opts?.resetScroll === true;
  beginReadingRulerModelSwap();
  try {
    if (heavy) {
      setReaderSyntaxHighlightEnabled(
        monaco,
        false,
        props.readerSurfaceLight,
        props.readerSurfaceDark,
        props.highlightColors,
      );
    }
    /** `setValue` 整文替换会使行内装饰失效；须使下次 `setChapters` 强制重建（仅切换行首缩进时行号不变） */
    lastChapterTitleDecorationsLineKey = "";
    if (heavy) {
      const langId = m.getLanguageId();
      const nextModel = monaco.editor.createModel(
        text,
        langId,
        monaco.Uri.parse(`colortxt-reader://${Date.now()}`),
      );
      e.setModel(nextModel);
      model.value = nextModel;
      m.dispose();
      annotationDecorationsCollection.value?.clear();
      annotationDecorationsCollection.value = e.createDecorationsCollection();
      if (resetScroll) {
        e.setScrollTop(0, monaco.editor.ScrollType.Immediate);
        e.setPosition({ lineNumber: 1, column: 1 });
      }
    } else {
      if (resetScroll) {
        beginProgrammaticScroll();
        e.setScrollTop(0, monaco.editor.ScrollType.Immediate);
        e.setPosition({ lineNumber: 1, column: 1 });
      }
      m.setValue(text);
    }
    await yieldToUi();
    await afterNextPaints();
    if (resetScroll) {
      scrollToDocumentStart(false);
    }
    if (heavy && props.monacoCustomHighlight) {
      window.setTimeout(() => applyReaderSyntaxFromProps(), 0);
    }
  } finally {
    endReadingRulerModelSwap();
  }
  invalidateReadingRulerAnchor();
  if (heavy) {
    readingRulerDecorationsCollection.value?.clear();
    readingRulerDecorationsCollection.value = e.createDecorationsCollection();
  }
  syncReadingRulerEditorClass();
  refreshReadingRulerDecorations();
}

function flushStreamCarriageReturn() {
  if (!streamCarriageReturnPending) return;
  streamCarriageReturnPending = false;
  const m = model.value;
  if (!m) return;
  const endPos = m.getPositionAt(m.getValueLength());
  m.applyEdits([
    {
      range: new monaco.Range(
        endPos.lineNumber,
        endPos.column,
        endPos.lineNumber,
        endPos.column,
      ),
      text: "\r",
    },
  ]);
}

/** 流结束时修正最后一行：无结尾换行时该行此前按原文缓冲，此处统一行首缩进 */
function normalizeLastLineLeadIndent() {
  const m = model.value;
  if (!m) return;
  const ln = m.getLineCount();
  if (ln < 1) return;
  const line = m.getLineContent(ln);
  const next = applyLeadIndentFullWidth(line);
  if (next === line) return;
  m.applyEdits([
    {
      range: new monaco.Range(ln, 1, ln, line.length + 1),
      text: next,
    },
  ]);
}

function cancelImageViewZoneScrollRender() {
  if (imageViewZoneScrollRenderRaf !== null) {
    cancelAnimationFrame(imageViewZoneScrollRenderRaf);
    imageViewZoneScrollRenderRaf = null;
  }
}

function disposeImageViewZones() {
  cancelImageViewZoneScrollRender();
  const e = editor.value;
  if (e && imageViewZoneIds.value.length > 0) {
    removeViewZonesById(e, imageViewZoneIds.value);
  }
  imageViewZoneIds.value = [];
}

function isMarkdownReaderPath(filePath: string): boolean {
  return /\.md$/i.test(filePath.trim());
}

async function applyEmbeddedImageAnchors(
  convertedTxtAbsPath: string | null,
): Promise<ReplaceImgAnchorsResult> {
  disposeImageViewZones();
  imageLightboxSrc.value = "";
  const p = convertedTxtAbsPath?.trim();
  if (!p) return { zoneIds: [], deletedOriginalLineNumbersDesc: [] };
  const e = editor.value;
  const m = model.value;
  if (!e || !m) return { zoneIds: [], deletedOriginalLineNumbersDesc: [] };
  const raw = m.getValue();
  const isMd = !props.readerEditMode && isMarkdownReaderPath(p);
  const result = await replaceImgAnchorLinesWithViewZones(monaco, e, p, {
    zoneHeightPx: clampMarkdownImageHeightPx(props.markdownImageHeightPx),
    sourceText: raw,
    blockImages: isMd ? collectBlockMarkdownImageLines(raw, p) : [],
  });
  imageViewZoneIds.value = result.zoneIds;
  return result;
}

/**
 * 外层切换「压缩空行 / 行首缩进 / 文本转换」会整文重排。
 * 重排前必须先把排队的排版改动落地：否则会在新旧模型之间夹一次全书折行，
 * 放大卡顿，且锚点可能采到尚未生效的排版。
 */
function flushPendingTypographyForDisplayChange(): void {
  flushTypographyUpdate();
}

function clear(opts?: ReaderClearOptions) {
  disposeEbookInternalLinks();
  disposeAnnotationDecorations();
  clearPendingEbookSidecar();
  disposeImageViewZones();
  imageLightboxSrc.value = "";
  streamCarriageReturnPending = false;
  lastChapterTitleDecorationsLineKey = "";
  chaptersSnapshot = [];

  const e = editor.value;
  const prevModel = model.value;
  chapterTitleDecorationsCollection.value?.clear();
  inlineSearch.clearInlineSearchState();
  annotationDecorationsCollection.value?.clear();
  voiceReadDecorationsCollection.value?.clear();
  readingRulerDecorationsCollection.value?.clear();
  minimapCursorLineDecorationsCollection.value?.clear();
  chapterMinimapDecorationsCollection.value?.clear();

  e?.updateOptions({ stickyScroll: { enabled: false } });

  beginReadingRulerModelSwap();
  try {
    if (e && prevModel) {
      const next = monaco.editor.createModel("", languageId);
      e.setModel(next);
      prevModel.dispose();
      model.value = next;
      chapterTitleDecorationsCollection.value = e.createDecorationsCollection();
      inlineSearchDecorationsCollection.value = e.createDecorationsCollection();
      annotationDecorationsCollection.value = e.createDecorationsCollection();
      voiceReadDecorationsCollection.value = e.createDecorationsCollection();
      readingRulerDecorationsCollection.value = e.createDecorationsCollection();
      minimapCursorLineDecorationsCollection.value =
        e.createDecorationsCollection();
      chapterMinimapDecorationsCollection.value =
        e.createDecorationsCollection();
      e.setPosition({ lineNumber: 1, column: 1 });
      e.setScrollTop(0);
      e.layout();
      bindAnnotationScrollSync(e);
    } else {
      prevModel?.setValue("");
    }
  } finally {
    endReadingRulerModelSwap();
  }

  if (!opts?.keepStickyHiddenForStream) {
    syncStickyScrollToStreamState();
  }
  invalidateReadingRulerAnchor();
  syncReadingRulerEditorClass();
}

function setChapters(chapters: ChapterStickyLine[]) {
  const m = model.value;
  const collection = chapterTitleDecorationsCollection.value;
  if (!m || !collection) return;

  chaptersSnapshot = chapters
    .slice()
    .sort(
      (a, b) =>
        (a.tocOrder ?? a.lineNumber) - (b.tocOrder ?? b.lineNumber) ||
        a.lineNumber - b.lineNumber,
    )
    .map((c) => ({
      lineNumber: c.lineNumber,
      title: chapterTitleForDisplay(c.title),
      headingLevel: c.headingLevel,
      tocOrder: c.tocOrder,
    }));

  const maxLine = m.getLineCount();
  let chapterTitleDisplayEdited = false;
  /** 编辑态仅同步章节元数据，勿 applyEdits 剥标题行首空白（会误触 dirty） */
  if (!props.readerEditMode) {
    const edits: monaco.editor.IIdentifiedSingleEditOperation[] = [];
    const normalizedChapterLines = new Set<number>();
    const linkColumnShiftByLine = new Map<number, number>();
    for (const ch of chaptersSnapshot) {
      const ln = ch.lineNumber;
      if (ln < 1 || ln > maxLine || normalizedChapterLines.has(ln)) continue;
      normalizedChapterLines.add(ln);
      const original = m.getLineContent(ln);
      let line = original;
      let colShift = 0;
      if (props.fileIsMarkdown) {
        const atxCols = atxHeadingPrefixLength(line);
        const withoutAtx = formatMarkdownHeadingLineForDisplay(line);
        if (atxCols > 0 && withoutAtx !== line && line.slice(atxCols) === withoutAtx) {
          colShift += atxCols;
          line = withoutAtx;
        } else {
          line = withoutAtx;
        }
      }
      const n = leadingWhitespaceColumnCount(line);
      if (n > 0) {
        line = line.slice(n);
        colShift += n;
      }
      if (line !== original) {
        if (colShift > 0) linkColumnShiftByLine.set(ln, colShift);
        edits.push({
          range: new monaco.Range(ln, 1, ln, m.getLineMaxColumn(ln)),
          text: line,
        });
      }
    }
    if (edits.length > 0) {
      chapterTitleDisplayEdited = true;
      m.applyEdits(edits);
      shiftHitColumnsAfterChapterTitleEdit(linkColumnShiftByLine);
    } else if (chaptersSnapshot.length > 0) {
      // EPUB 等无标题行改写时亦须 bump 模型版本，否则粘性大纲不刷新
      const lc = m.getLineCount();
      const col = m.getLineMaxColumn(lc);
      m.applyEdits([
        {
          range: new monaco.Range(lc, col, lc, col),
          text: "",
        },
      ]);
    }
  }

  const maxAfter = m.getLineCount();
  for (const ch of chaptersSnapshot) {
    if (ch.title) continue;
    const ln = ch.lineNumber;
    if (ln < 1 || ln > maxAfter) continue;
    ch.title = chapterTitleForDisplay(m.getLineContent(ln));
  }
  for (const ch of chaptersSnapshot) {
    if (!ch.title) {
      ch.title = `第 ${ch.lineNumber} 行`;
    }
  }

  const sortedChapters = chaptersSnapshot
    .filter((c) => c.lineNumber >= 1 && c.lineNumber <= maxAfter)
    .slice()
    .sort((a, b) => a.lineNumber - b.lineNumber);

  const lineKey = chapterLineNumbersKey(
    sortedChapters.map((c) => c.lineNumber),
  );
  /** 编辑态不加章节标题行内样式（scale/着色），避免改标题前后正文时 Monaco 渲染异常 */
  if (props.readerEditMode) {
    collection.clear();
    lastChapterTitleDecorationsLineKey = "";
    syncChapterMinimapSectionHeaderDecorations();
    notifyChapterStickyFoldingRanges?.();
    syncStickyScrollToStreamState();
    scheduleStickyChapterScrollRefresh();
    return;
  }
  syncChapterMinimapSectionHeaderDecorations();
  if (
    lineKey !== lastChapterTitleDecorationsLineKey ||
    chapterTitleDisplayEdited
  ) {
    collection.set(buildChapterTitleDecorations(monaco, m, chaptersSnapshot));
    lastChapterTitleDecorationsLineKey = lineKey;
  }
  notifyChapterStickyFoldingRanges?.();
  syncStickyScrollToStreamState();
  scheduleStickyChapterScrollRefresh();
  invalidateAndSyncViewportDecorations();
  requestAnimationFrame(() => {
    notifyChapterStickyFoldingRanges?.();
    scheduleStickyChapterScrollRefresh();
  });
}

function syncChapterMinimapSectionHeaderDecorations() {
  const col = chapterMinimapDecorationsCollection.value;
  const m = model.value;
  if (!col || !m) return;
  if (!props.readerEditMode || !props.readerEditMinimap) {
    col.clear();
    return;
  }
  col.set(buildChapterMinimapSectionHeaderDecorations(monaco, m, chaptersSnapshot));
}

function syncMinimapCursorLineDecoration() {
  const col = minimapCursorLineDecorationsCollection.value;
  const e = editor.value;
  const m = model.value;
  if (!col || !e || !m) return;
  if (!props.readerEditMode || !props.readerEditMinimap) {
    col.clear();
    return;
  }
  const selections = e.getSelections() ?? [];
  if (selections.some((s) => !s.isEmpty())) {
    col.clear();
    return;
  }
  const line = Math.max(1, Math.min(m.getLineCount(), e.getPosition()?.lineNumber ?? 1));
  col.set([
    {
      range: new monaco.Range(line, 1, line, 1),
      options: {
        minimap: {
          color: getReaderMinimapCursorLineDecorColor(lastAppThemeName),
          position: monaco.editor.MinimapPosition.Inline,
        },
      },
    },
  ]);
}

function setTheme(themeName: string) {
  lastAppThemeName = themeName;
  syncMinimapCursorLineDecoration();
  monaco.editor.setTheme(readerMonacoThemeForAppTheme(themeName));
  syncReaderMonacoOverflowHostTheme(themeName);
  forceOverviewRulerCanvasRepaint();
  if (smartFormatReviewActive.value) {
    requestAnimationFrame(() => layoutDiffEditor());
  }
}

/**
 * setTheme 后概览尺常走 Maybe 并跳过 Canvas border；通过 overviewRulerBorder 关→开
 * 触发 onConfigurationChanged → Needed，完整重绘左边线。
 */
function forceOverviewRulerCanvasRepaint() {
  const ed = editor.value;
  if (!ed) return;
  const wantBorder = buildReaderOverviewRulerBorder(
    Boolean(props.readerEditMode),
    props.readerFullscreen,
  );
  void nextTick(() => {
    ed.updateOptions({ overviewRulerBorder: false });
    if (!wantBorder) return;
    requestAnimationFrame(() => {
      ed.updateOptions({
        overviewRulerBorder: true,
      });
      ed.layout();
    });
  });
}

/**
 * 字号/行高/字距/字体或窗口宽度变化都会让 Monaco 对**全书**重算折行
 *（实测 80 万行约 0.7s/次）。连续 Ctrl+滚轮或拖拽窗口边缘会逐事件触发，
 * 表现就是「每次界面缩放都卡一下」。
 *
 * 因此把所有「会触发整书折行」的排版改动合并到同一帧末尾执行：
 * 连续事件只保留最后一次的值，并且在执行前后保持视口锚点不漂。
 */
let pendingTypographyUpdate: {
  fontSize?: number;
  lineHeightMultiple?: number;
  letterSpacingPx?: number;
  fontFamily?: string;
  /** Monaco 换行策略（简单 / 高级） */
  wrappingStrategyAdvanced?: boolean;
  /** 中文换行优化开关（需 forceWrappingRecalc 才会重建折行映射） */
  cjkWrapOptimize?: boolean;
  /** 段间距（物理行后空隙 px） */
  lineSpacingPx?: number;
} | null = null;
let typographyFlushRaf: number | null = null;

function scheduleTypographyUpdate(patch: {
  fontSize?: number;
  lineHeightMultiple?: number;
  letterSpacingPx?: number;
  fontFamily?: string;
  wrappingStrategyAdvanced?: boolean;
  cjkWrapOptimize?: boolean;
  lineSpacingPx?: number;
}): void {
  pendingTypographyUpdate = { ...(pendingTypographyUpdate ?? {}), ...patch };
  if (typographyFlushRaf != null) return;
  typographyFlushRaf = requestAnimationFrame(() => {
    typographyFlushRaf = null;
    flushTypographyUpdate();
  });
}

/** 立即应用待处理的排版改动（切换文件/进入编辑前调用，避免与整文替换交错） */
function flushTypographyUpdate(): void {
  if (typographyFlushRaf != null) {
    cancelAnimationFrame(typographyFlushRaf);
    typographyFlushRaf = null;
  }
  const patch = pendingTypographyUpdate;
  pendingTypographyUpdate = null;
  const e = editor.value;
  if (!patch || !e) return;

  const displayAnchor =
    model.value != null
      ? captureReaderViewportRestoreAnchor(e, model.value, (l) => l, undefined, {
          skipLayout: true,
        })
      : null;

  const options: Parameters<typeof e.updateOptions>[0] = {};
  if (patch.fontFamily !== undefined) {
    currentFontFamily = patch.fontFamily;
    options.fontFamily = patch.fontFamily;
  }
  if (patch.fontSize !== undefined || patch.lineHeightMultiple !== undefined) {
    const size =
      patch.fontSize ??
      e.getOption(monaco.editor.EditorOption.fontSize);
    const multiple = patch.lineHeightMultiple ?? lineHeightMultiple;
    if (patch.lineHeightMultiple !== undefined) {
      lineHeightMultiple = patch.lineHeightMultiple;
    }
    Object.assign(
      options,
      buildReaderEditorFontSizeUpdate({
        fontSize: size,
        lineHeightMultiple: multiple,
      }),
    );
  }
  if (patch.letterSpacingPx !== undefined) {
    Object.assign(
      options,
      buildReaderEditorLetterSpacingUpdate({
        letterSpacingPx: patch.letterSpacingPx,
      }),
    );
  }
  e.updateOptions(options);

  /**
   * 换行策略 / 中文换行优化 / 段间距同样要重算全书折行（或全行高），
   * 一并合并到本帧，避免与字号改动叠加触发多次重排。
   */
  if (patch.wrappingStrategyAdvanced !== undefined) {
    e.updateOptions({
      wrappingStrategy: patch.wrappingStrategyAdvanced ? "advanced" : "simple",
    });
  }
  if (patch.cjkWrapOptimize !== undefined) {
    if (isCjkWrapOptimizeEnabled() !== patch.cjkWrapOptimize) {
      setCjkWrapOptimizeEnabled(patch.cjkWrapOptimize);
      forceWrappingRecalc();
    }
  }
  if (patch.lineSpacingPx !== undefined) {
    const next = clampMonacoLineSpacingPx(patch.lineSpacingPx);
    if (next !== getLineSpacingPx()) {
      applyMonacoLineSpacingPx(next);
      if (imageViewZoneIds.value.length > 0) {
        // 独占行插图已删物理行，段间距改动时同步 ViewZone 底部空隙
        syncReaderImageViewZonesLineSpacing(e, imageViewZoneIds.value);
      }
    }
  }

  if (displayAnchor) {
    // 折行行数已变：把锚点行重新放回原字高带，避免缩放后视口跳到别处
    void restoreViewportToRestoreAnchor(displayAnchor);
  }
  emit("layoutViewportRestored");
}

/** 字号（含派生行高）—— 立即让出 UI，实际重排合并到帧末 */
function setFontSize(fontSize: number) {
  if (!editor.value) return;
  scheduleTypographyUpdate({ fontSize });
  if (smartFormatReviewActive.value) {
    syncDiffEditorTypography();
  }
}

function setLineHeightMultiple(multiple: number) {
  lineHeightMultiple = multiple;
  if (!editor.value) return;
  scheduleTypographyUpdate({ lineHeightMultiple: multiple });
  if (smartFormatReviewActive.value) {
    syncDiffEditorTypography();
  }
}

/**
 * 段间距：改变所有物理行高度（大文件同样是一次全量重排）。
 * 合并到帧末执行，连按快捷键只生效一次。
 */
function setLineSpacingPx(px: number): void {
  const next = clampMonacoLineSpacingPx(px);
  if (next === getLineSpacingPx()) return;
  scheduleTypographyUpdate({ lineSpacingPx: next });
}

function setLetterSpacingPx(px: number) {
  if (!editor.value) return;
  // 字距变化同样会让全书重算折行（804k 行实测 ~0.7s），与字号共用帧末合并
  scheduleTypographyUpdate({ letterSpacingPx: px });
  if (smartFormatReviewActive.value) {
    syncDiffEditorTypography();
  }
}

/**
 * 换行策略切换（简单 / 高级）会让 Monaco 重建全书折行映射。
 * 与字号等共用帧末合并：advanced 下折行计算更重，连续切换不应逐次重排。
 */
function setWrappingStrategyAdvanced(advanced: boolean) {
  if (!editor.value) return;
  scheduleTypographyUpdate({ wrappingStrategyAdvanced: advanced });
}

function effectiveCjkWrapOptimize(): boolean {
  return props.monacoCjkWrapOptimize && !props.monacoAdvancedWrapping;
}

/** 切换中文换行优化后强制重建折行映射（仅改 flag 不会触发 setWrappingSettings） */
function forceWrappingRecalc() {
  const e = editor.value;
  if (!e) return;
  const current = e.getOption(monaco.editor.EditorOption.wordBreak);
  const bounced = current === "keepAll" ? "normal" : "keepAll";
  e.updateOptions({ wordBreak: bounced });
  e.updateOptions({ wordBreak: current });
}

function syncCjkWrapOptimizeFlag(recalcIfChanged: boolean): void {
  const next = effectiveCjkWrapOptimize();
  const prev = isCjkWrapOptimizeEnabled();
  if (prev === next) return;
  if (!recalcIfChanged) {
    setCjkWrapOptimizeEnabled(next);
    return;
  }
  // 开关只影响折行估算：与字号等排版改动一起在帧末重建，保留视口锚点
  scheduleTypographyUpdate({ cjkWrapOptimize: next });
}

function setFontFamily(fontFamily: string) {
  if (!editor.value) return;
  scheduleTypographyUpdate({ fontFamily });

  // Ensure KingHwa webfont is loaded before applying to avoid fallback flashes.
  if (fontFamily.includes("KingHwa OldSong")) {
    const fontSize =
      editor.value.getOption(monaco.editor.EditorOption.fontSize);
    void document.fonts?.load(`${fontSize}px "KingHwa OldSong"`).then(() => {
      if (!editor.value) return;
      scheduleTypographyUpdate({ fontFamily });
    });
  }
  if (smartFormatReviewActive.value) {
    syncDiffEditorTypography();
  }
}

function resetToTop() {
  const e = editor.value;
  if (!e) return;
  beginProgrammaticScroll();
  e.setPosition({ lineNumber: 1, column: 1 });
  e.revealLineInCenter(1, monacoScrollType(true));
  e.setScrollTop(0, monacoScrollType(true));
  queueMicrotask(() => {
    try {
      e.setPosition({ lineNumber: 1, column: 1 });
      e.setScrollTop(0, monacoScrollType(true));
    } catch {
      // ignore
    }
  });
}

/**
 * 将视口对齐到文档最顶（scrollTop=0）。
 * 首屏为 `afterLineNumber: 0` 的插图 View Zone 时，若用 `jumpToLine(1)` 会按正文第 1 行顶对齐，等于滚过插图，滚动条也不在顶。
 */
function scrollToDocumentStart(smooth = false) {
  const e = editor.value;
  const m = model.value;
  if (!e || !m) return;
  beginProgrammaticScroll();
  const scrollType = monacoScrollType(smooth);
  const apply = () => {
    e.layout();
    e.setScrollTop(0, scrollType);
    e.setPosition({ lineNumber: 1, column: 1 });
  };
  apply();
  normalizeScrollAfterEmbeddedViewZones();
  requestAnimationFrame(() => {
    apply();
    normalizeScrollAfterEmbeddedViewZones();
  });
}

/**
 * 将目标行顶对齐视口指定字高带；不移动光标、不抢焦点（编辑态章节导航等）。
 * @param anchorSlotFromTop 视口顶沿往下第几条字高带（1 = 贴顶）；省略则与历史行为一致（贴顶）。
 */
function scrollToLineNearTop(
  lineNumber: number,
  smooth = true,
  anchorSlotFromTop?: number,
) {
  const e = editor.value;
  const m = model.value;
  if (!e || !m) return;
  beginProgrammaticScroll();
  const lineCount = m.getLineCount();
  const line = Math.max(
    1,
    Math.min(Math.floor(lineNumber), Math.max(1, lineCount)),
  );
  const scrollType = monacoScrollType(smooth);
  e.layout();
  e.revealLineNearTop(line, scrollType);
  let scrollTop = e.getTopForLineNumber(line);
  if (anchorSlotFromTop != null && anchorSlotFromTop >= 1) {
    const slotted = computeScrollTopForLineAtViewportSlot(
      e,
      line,
      anchorSlotFromTop,
    );
    if (slotted != null) scrollTop = slotted;
  }
  e.setScrollTop(Math.max(0, scrollTop), scrollType);
}

function jumpToLine(lineNumber: number, smooth = true) {
  const e = editor.value;
  const m = model.value;
  if (!e || !m) return;
  scrollToLineNearTop(lineNumber, smooth);
  const line = Math.max(
    1,
    Math.min(Math.floor(lineNumber), Math.max(1, m.getLineCount())),
  );
  e.setPosition({ lineNumber: line, column: 1 });
  e.focus();
}

/** 搜索结果跳转：将目标行尽量居中显示 */
function jumpToLineCentered(lineNumber: number, smooth = true) {
  const e = editor.value;
  const m = model.value;
  if (!e || !m) return;
  beginProgrammaticScroll();
  const lineCount = m.getLineCount();
  const line = Math.max(
    1,
    Math.min(Math.floor(lineNumber), Math.max(1, lineCount)),
  );
  const scrollType = monacoScrollType(smooth);
  e.layout();
  e.revealLineInCenter(line, scrollType);
  e.setPosition({ lineNumber: line, column: 1 });
  e.focus();
}

/** 语音朗读：自动换行块垂直居中滚动（不写光标位置、不抢焦点，避免只读模式出现闪烁 caret） */
function scrollModelLineBlockToViewportCenter(
  lineNumber: number,
  smooth = true,
) {
  const e = editor.value;
  const m = model.value;
  if (!e || !m) return;
  beginProgrammaticScroll();
  const lineCount = m.getLineCount();
  const line = Math.max(
    1,
    Math.min(Math.floor(lineNumber), Math.max(1, lineCount)),
  );
  const scrollType = monacoScrollType(smooth);
  e.layout();
  const top = e.getTopForLineNumber(line);
  const bottom = e.getBottomForLineNumber(line);
  const blockCenter = (top + bottom) / 2;
  const layoutH = Math.max(1, e.getLayoutInfo().height);
  const maxTop = Math.max(0, e.getScrollHeight() - layoutH);
  const targetTop = Math.max(0, Math.min(maxTop, blockCenter - layoutH / 2));
  e.setScrollTop(targetTop, scrollType);
}

/** 视口内容区垂直中心对应的模型行（与暂停指引横线、{@link scrollModelLineBlockToViewportCenter} 同一套滚动坐标） */
function getModelLineAtViewportCenter(): number {
  const e = editor.value;
  const m = model.value;
  if (!e || !m) return 1;
  e.layout();
  const layout = e.getLayoutInfo();
  const layoutH = Math.max(1, layout.height);
  const targetY = Math.max(0, e.getScrollTop()) + layoutH / 2;
  const lc = Math.max(1, m.getLineCount());

  let lo = 1;
  let hi = lc;
  let seed = 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const top = e.getTopForLineNumber(mid);
    if (!Number.isFinite(top)) break;
    if (top <= targetY) {
      seed = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  let best = seed;
  let bestDist = Infinity;
  const from = Math.max(1, seed - 1);
  const to = Math.min(lc, seed + 1);
  for (let line = from; line <= to; line++) {
    const top = e.getTopForLineNumber(line);
    const bottom = e.getBottomForLineNumber(line);
    if (!Number.isFinite(top) || !Number.isFinite(bottom)) continue;
    const dist = Math.abs((top + bottom) / 2 - targetY);
    if (dist < bestDist) {
      bestDist = dist;
      best = line;
    }
  }
  return best;
}

function getViewportStartModelLine(): number {
  const e = editor.value;
  if (!e) return 1;
  const r = e.getVisibleRanges()[0];
  return r ? Math.max(1, r.startLineNumber) : 1;
}

function setVoiceReadLineHighlight(lineNumber: number | null) {
  const col = voiceReadDecorationsCollection.value;
  const m = model.value;
  if (!col || !m) return;
  if (lineNumber == null || !Number.isFinite(lineNumber)) {
    voiceReadHighlightLine.value = null;
    col.clear();
    return;
  }
  const line = Math.max(1, Math.min(Math.floor(lineNumber), m.getLineCount()));
  voiceReadHighlightLine.value = line;
  col.set([
    {
      range: new monaco.Range(line, 1, line, m.getLineMaxColumn(line)),
      options: {
        isWholeLine: true,
        className: "readerVoiceReadCurrentLine",
        linesDecorationsClassName: "readerVoiceReadCurrentLineDecor",
      },
    },
  ]);
}

function isVoiceReadSessionActive(): boolean {
  return props.voiceReadScrollLocked === true || props.voiceReadPaused === true;
}

function isReadingRulerActive(): boolean {
  return (
    props.readingRulerEnabled === true &&
    !props.readerEditMode &&
    !isVoiceReadSessionActive()
  );
}

function readingRulerFocusLineCount(): number {
  return clampReadingRulerFocusLines(props.readingRulerFocusLines ?? 1);
}

function syncReadingRulerEditorClass() {
  const e = editor.value;
  if (!e) return;
  const active = isReadingRulerActive();
  const classes: string[] = [];
  if (active) {
    classes.push(READER_RULER_EDITOR_CLASS);
    if (props.readingRulerDimStickyTitle) {
      classes.push(READER_RULER_DIM_STICKY_CLASS);
    }
    if (props.readingRulerTransitionEnabled !== false) {
      classes.push(READER_RULER_TRANSITION_CLASS);
    }
  }
  e.updateOptions({
    extraEditorClassName: classes.join(" "),
  });
  const dim = clampReadingRulerDimOpacity(
    props.readingRulerDimOpacity ?? defaultReadingRulerDimOpacity,
  );
  e.getDomNode()?.style.setProperty(READER_RULER_DIM_CSS_VAR, String(dim));
}

function invalidateReadingRulerAnchor() {
  readingRulerAnchor = null;
}

/** 整文替换期间暂停跟尺：`setValue` 会先清空再写入，旧行号会触发 Monaco Illegal lineNumber。 */
let readingRulerRefreshPaused = 0;

function beginReadingRulerModelSwap() {
  readingRulerRefreshPaused++;
  cancelReadingRulerFollowViewport();
  readingRulerSkipFollowResync = false;
  readingRulerOwnedScrollTop = null;
  clearReadingRulerFade();
  invalidateReadingRulerAnchor();
}

function endReadingRulerModelSwap() {
  readingRulerRefreshPaused = Math.max(0, readingRulerRefreshPaused - 1);
}

/** 按当前视口中间视觉行重新采锚（该行为聚焦带中间行，不滚动）。用于启用尺、恢复阅读进度、滚正文后跟视口。 */
function resyncReadingRulerFromViewport() {
  if (readingRulerRefreshPaused > 0) return;
  if (!isReadingRulerActive()) return;
  invalidateReadingRulerAnchor();
  refreshReadingRulerDecorations();
}

let readingRulerFollowRaf: number | null = null;
let readingRulerFollowGen = 0;

function cancelReadingRulerFollowViewport() {
  readingRulerFollowGen++;
  if (readingRulerFollowRaf == null) return;
  cancelAnimationFrame(readingRulerFollowRaf);
  readingRulerFollowRaf = null;
}

function beginReadingRulerOwnedScroll(expectedTop?: number) {
  readingRulerSkipFollowResync = true;
  const e = editor.value;
  if (expectedTop != null && Number.isFinite(expectedTop)) {
    readingRulerOwnedScrollTop = Math.max(0, expectedTop);
    return;
  }
  readingRulerOwnedScrollTop = e ? Math.max(0, e.getScrollTop()) : null;
}

function readingRulerScrollMatchesOwned(): boolean {
  if (readingRulerOwnedScrollTop == null) return false;
  const e = editor.value;
  if (!e) return false;
  return Math.abs(Math.max(0, e.getScrollTop()) - readingRulerOwnedScrollTop) <= 1;
}

/**
 * 阅读尺开启：用户滚正文（拖滚动条 / 点击模式拖动抓取 / 小地图 /
 * 侧栏搜索·书签 / 书钉返回等跳转）时，把视口中间视觉行采为聚焦带中间行（只改装饰，不改 scrollTop）。
 * 尺自己移锚点、切章居中标题时不跟；朗读锁滚动时不跟。
 */
function scheduleReadingRulerFollowViewport() {
  if (readingRulerRefreshPaused > 0) return;
  if (!isReadingRulerActive()) return;
  if (voiceReadScrollLocked.value) return;
  const e = editor.value;
  if (!e) return;
  if (readingRulerSkipFollowResync) {
    scheduleReadingRulerOwnedScrollWatch();
    return;
  }
  scheduleReadingRulerLiveFollowFrame();
}

function scheduleReadingRulerLiveFollowFrame() {
  if (readingRulerFollowRaf != null) return;
  const gen = readingRulerFollowGen;
  readingRulerFollowRaf = requestAnimationFrame(() => {
    readingRulerFollowRaf = null;
    if (gen !== readingRulerFollowGen) return;
    if (readingRulerRefreshPaused > 0) return;
    if (!isReadingRulerActive()) return;
    if (voiceReadScrollLocked.value) return;
    if (readingRulerSkipFollowResync) {
      scheduleReadingRulerOwnedScrollWatch();
      return;
    }
    resyncReadingRulerFromViewport();
  });
}

/** 尺自己引发的平滑滚动：等停在目标 scrollTop 后再决定是否跟视口，避免中途把锚点采跑。 */
function scheduleReadingRulerOwnedScrollWatch() {
  const e = editor.value;
  if (!e) return;
  cancelReadingRulerFollowViewport();
  const gen = readingRulerFollowGen;
  let lastTop = e.getScrollTop();
  let stableFrames = 0;
  let frames = 0;
  const tick = () => {
    readingRulerFollowRaf = null;
    if (gen !== readingRulerFollowGen) return;
    if (readingRulerRefreshPaused > 0) return;
    if (!isReadingRulerActive()) return;
    if (voiceReadScrollLocked.value) return;
    frames++;
    const top = editor.value?.getScrollTop() ?? lastTop;
    if (top === lastTop) stableFrames++;
    else {
      stableFrames = 0;
      lastTop = top;
    }
    if ((stableFrames >= 2 && frames >= 2) || frames > 60) {
      if (readingRulerSkipFollowResync) {
        const stillProgrammatic =
          programmaticScrollDepth > 0 && frames <= 90;
        if (readingRulerScrollMatchesOwned()) {
          if (stillProgrammatic) {
            readingRulerFollowRaf = requestAnimationFrame(tick);
            return;
          }
          // 居中滚动已到位：不要改锚点，但必须放开跟视口，
          // 否则下一次拖动仍走「等停稳」而不会按帧跟随。
          readingRulerSkipFollowResync = false;
          readingRulerOwnedScrollTop = null;
          return;
        }
        if (stillProgrammatic) {
          readingRulerFollowRaf = requestAnimationFrame(tick);
          return;
        }
        readingRulerSkipFollowResync = false;
        readingRulerOwnedScrollTop = null;
      }
      resyncReadingRulerFromViewport();
      return;
    }
    readingRulerFollowRaf = requestAnimationFrame(tick);
  };
  readingRulerFollowRaf = requestAnimationFrame(tick);
}

/** 把指定行滚到视口（扣粘性条）垂直中间，与启用尺时的采锚几何一致。 */
function scrollLineToReadingRulerViewportCenter(
  lineNumber: number,
  smooth = true,
) {
  const e = editor.value;
  const m = model.value;
  if (!e || !m) return;
  beginProgrammaticScroll();
  const lineCount = m.getLineCount();
  const line = Math.max(
    1,
    Math.min(Math.floor(lineNumber), Math.max(1, lineCount)),
  );
  const scrollType = monacoScrollType(smooth);
  e.layout();
  const stickyHeight = getStickyChapterScrollHeight(e);
  const layoutH = Math.max(1, e.getLayoutInfo().height);
  const visibleH = Math.max(1, layoutH - stickyHeight);
  const top = e.getTopForLineNumber(line);
  const bottom = e.getBottomForLineNumber(line);
  if (!Number.isFinite(top) || !Number.isFinite(bottom)) return;
  const blockCenter = (top + bottom) / 2;
  const maxTop = Math.max(0, e.getScrollHeight() - layoutH);
  const targetTop = Math.max(
    0,
    Math.min(maxTop, blockCenter - stickyHeight - visibleH / 2),
  );
  e.setScrollTop(targetTop, scrollType);
}

/** 切章：章节标题滚到视口中间，并作为聚焦带中间行（不把整条聚焦带再居中）。 */
function scrollChapterTitleToRulerFocus(lineNumber: number, smooth = true) {
  const e = editor.value;
  const m = model.value;
  if (!e || !m) return;
  const lineCount = m.getLineCount();
  const line = Math.max(
    1,
    Math.min(Math.floor(lineNumber), Math.max(1, lineCount)),
  );
  const stickyHeight = getStickyChapterScrollHeight(e);
  const layoutH = Math.max(1, e.getLayoutInfo().height);
  const visibleH = Math.max(1, layoutH - stickyHeight);
  const top = e.getTopForLineNumber(line);
  const bottom = e.getBottomForLineNumber(line);
  if (Number.isFinite(top) && Number.isFinite(bottom)) {
    const blockCenter = (top + bottom) / 2;
    const maxTop = Math.max(0, e.getScrollHeight() - layoutH);
    const targetTop = Math.max(
      0,
      Math.min(maxTop, blockCenter - stickyHeight - visibleH / 2),
    );
    beginReadingRulerOwnedScroll(targetTop);
  } else {
    beginReadingRulerOwnedScroll();
  }
  scrollLineToReadingRulerViewportCenter(line, smooth);
  if (isReadingRulerActive()) {
    setReadingRulerAnchorFromPos(visualRowStart(e, line, 1), false);
  }
  scheduleReadingRulerFollowViewport();
}

function ensureReadingRulerAnchor() {
  const e = editor.value;
  const m = model.value;
  if (!e || !m) return;
  if (!readingRulerAnchor) {
    readingRulerAnchor = snapRulerPosToContent(
      e,
      m,
      seedRulerAnchorFromViewport(e, m, readingRulerFocusLineCount()),
    );
  } else {
    readingRulerAnchor = snapRulerPosToContent(e, m, readingRulerAnchor);
  }
}

let readingRulerLiveFocusKeys = new Set<string>();
const readingRulerFadingOut = new Map<string, ReadingRulerPos>();
let readingRulerFadeTimer: number | null = null;
let readingRulerFadeGen = 0;

function prefersReadingRulerFade(): boolean {
  return (
    props.readingRulerTransitionEnabled !== false &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function prefersReadingRulerFadeOut(): boolean {
  return prefersReadingRulerFade() && props.monacoSmoothScrolling === true;
}

function clearReadingRulerFade() {
  readingRulerFadeGen++;
  if (readingRulerFadeTimer != null) {
    window.clearTimeout(readingRulerFadeTimer);
    readingRulerFadeTimer = null;
  }
  readingRulerLiveFocusKeys.clear();
  readingRulerFadingOut.clear();
}

function refreshReadingRulerDecorations() {
  if (readingRulerRefreshPaused > 0) return;
  const col = readingRulerDecorationsCollection.value;
  const e = editor.value;
  const m = model.value;
  if (!col || !e || !m) return;
  if (!isReadingRulerActive()) {
    clearReadingRulerFade();
    col.clear();
    syncReadingRulerImageFocus([]);
    return;
  }
  ensureReadingRulerAnchor();
  if (!readingRulerAnchor) {
    clearReadingRulerFade();
    col.clear();
    syncReadingRulerImageFocus([]);
    return;
  }
  for (const [key, pos] of readingRulerFadingOut) {
    if (!isRulerLineInModel(m, pos.lineNumber)) readingRulerFadingOut.delete(key);
  }
  const windowRows = collectVisualRowsFromAnchor(
    e,
    m,
    readingRulerAnchor,
    readingRulerFocusLineCount(),
  );
  const selRows = collectSelectionVisualRows(e, m);
  const liveRows: ReadingRulerPos[] = [];
  const liveKeys = new Set<string>();
  for (const row of [...windowRows, ...selRows]) {
    if (!isRulerLineInModel(m, row.lineNumber)) continue;
    const start = visualRowStart(e, row.lineNumber, row.column);
    if (!isRulerLineInModel(m, start.lineNumber)) continue;
    const key = `${start.lineNumber}:${start.column}`;
    if (liveKeys.has(key)) continue;
    liveKeys.add(key);
    liveRows.push(start);
  }
  if (prefersReadingRulerFadeOut() && readingRulerLiveFocusKeys.size > 0) {
    for (const key of readingRulerLiveFocusKeys) {
      if (liveKeys.has(key)) continue;
      const colon = key.indexOf(":");
      const lineNumber = Number(key.slice(0, colon));
      const column = Number(key.slice(colon + 1));
      if (!Number.isFinite(lineNumber) || !Number.isFinite(column)) continue;
      if (!isRulerLineInModel(m, lineNumber)) continue;
      readingRulerFadingOut.set(key, { lineNumber, column });
    }
    for (const key of liveKeys) readingRulerFadingOut.delete(key);
  } else {
    readingRulerFadingOut.clear();
  }
  const fadingRows = [...readingRulerFadingOut.values()].filter((pos) =>
    isRulerLineInModel(m, pos.lineNumber),
  );
  syncReadingRulerImageFocus([...liveRows, ...fadingRows]);
  col.set([
    ...buildRulerFocusDecorations(e, m, liveRows, READER_RULER_FOCUS_CLASS),
    ...buildRulerFocusDecorations(
      e,
      m,
      fadingRows,
      READER_RULER_FOCUS_OUT_CLASS,
    ),
  ]);
  readingRulerLiveFocusKeys = liveKeys;
  if (readingRulerFadeTimer != null) {
    window.clearTimeout(readingRulerFadeTimer);
    readingRulerFadeTimer = null;
  }
  if (fadingRows.length === 0) return;
  const gen = ++readingRulerFadeGen;
  readingRulerFadeTimer = window.setTimeout(() => {
    readingRulerFadeTimer = null;
    if (gen !== readingRulerFadeGen) return;
    readingRulerFadingOut.clear();
    refreshReadingRulerDecorations();
  }, READER_RULER_FADE_MS);
}

function syncReadingRulerImageFocus(focusedRows: readonly ReadingRulerPos[]) {
  const e = editor.value;
  const m = model.value;
  const keys = new Set(
    focusedRows.map((r) => `${r.lineNumber}:${r.column}`),
  );
  const hasRow = (pos: ReadingRulerPos) =>
    keys.has(`${pos.lineNumber}:${pos.column}`);
  forEachReaderImageViewZone(imageViewZoneIds.value, (dom, afterLine) => {
    let on = false;
    if (e && m && afterLine > 0 && isRulerLineInModel(m, afterLine)) {
      on = hasRow(
        visualRowStart(e, afterLine, m.getLineMaxColumn(afterLine)),
      );
    }
    if (!on && e && m) {
      const nextLine = afterLine + 1;
      if (nextLine >= 1 && isRulerLineInModel(m, nextLine)) {
        on = hasRow(visualRowStart(e, nextLine, 1));
      }
    }
    dom.classList.toggle("readerRulerFocus", on);
  });
}

function setReadingRulerAnchorFromPos(pos: ReadingRulerPos, scrollToCenter: boolean) {
  const e = editor.value;
  const m = model.value;
  if (!e || !m || !isReadingRulerActive()) return;
  readingRulerAnchor = snapRulerPosToContent(e, m, pos);
  refreshReadingRulerDecorations();
  if (!scrollToCenter) return;
  const rows = collectVisualRowsFromAnchor(
    e,
    m,
    readingRulerAnchor,
    readingRulerFocusLineCount(),
  );
  const top = scrollTopToCenterVisualBand(e, rows);
  if (top == null) return;
  beginReadingRulerOwnedScroll(top);
  beginProgrammaticScroll();
  e.setScrollTop(top, monacoScrollType(true));
  scheduleReadingRulerFollowViewport();
}

/** 视口已在文首/文末时，聚焦带贴该侧（锚点取带的自然中间行，不改滚动）。 */
function syncReadingRulerToDocumentContentEdge(direction: -1 | 1) {
  const e = editor.value;
  const m = model.value;
  if (!e || !m || !isReadingRulerActive()) return;
  beginReadingRulerOwnedScroll();
  setReadingRulerAnchorFromPos(
    rulerAnchorForContentEdgeBand(
      e,
      m,
      direction,
      readingRulerFocusLineCount(),
    ),
    false,
  );
  scheduleReadingRulerFollowViewport();
}

function peekReadingRulerMove(
  direction: -1 | 1,
  stepCount: number,
): ReadingRulerPos | null {
  const e = editor.value;
  const m = model.value;
  if (!e || !m || !isReadingRulerActive()) return null;
  ensureReadingRulerAnchor();
  if (!readingRulerAnchor) return null;
  if (
    focusBandTouchesContentEdge(
      e,
      m,
      readingRulerAnchor,
      readingRulerFocusLineCount(),
      direction,
    )
  ) {
    return readingRulerAnchor;
  }
  return advanceRulerAnchorByContentLines(
    e,
    m,
    readingRulerAnchor,
    direction,
    stepCount,
    readingRulerFocusLineCount(),
  );
}

/** 尺已贴文首/文末，再沿该方向移一条有内容的视觉行也不会动 */
function readingRulerCannotMove(direction: -1 | 1): boolean {
  if (!isReadingRulerActive()) return false;
  const next = peekReadingRulerMove(direction, 1);
  if (!next || !readingRulerAnchor) return true;
  return positionsEqual(next, readingRulerAnchor);
}

/** 按有内容的视觉行移动锚点，并把聚焦带滚到视口中央。未移动则返回 false。 */
function moveReadingRulerByContentLines(
  direction: -1 | 1,
  stepCount: number,
): boolean {
  if (!isReadingRulerActive()) return false;
  const next = peekReadingRulerMove(direction, stepCount);
  if (!next || !readingRulerAnchor) return false;
  if (positionsEqual(next, readingRulerAnchor)) return false;
  setReadingRulerAnchorFromPos(next, true);
  return true;
}

function finishReadingRulerMoveOrBound(direction: -1 | 1) {
  props.interceptReadonlyPageStep?.(direction);
}

/**
 * 阅读尺开启：滚轮按滚动倍率（Alt 为加速倍率）移动锚点。
 * 鼠标一格多为 ±100～120 像素（不足 120 时若按 120 累加，隔几格会缺一次）。
 * 幅度够一格的事件直接按整行走并清余数；触控板小位移仍累计。
 * 同一事件只处理一次（全屏空白 / 左右留白 / 正文捕获会重复进）。
 */
let readingRulerWheelAcc = 0;
let lastHandledReadingRulerWheel: WheelEvent | null = null;
const READING_RULER_WHEEL_PIXELS_PER_LINE = 120;

function wheelEventToRulerLineDelta(ev: WheelEvent): number {
  let dy = ev.deltaY;
  if (ev.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    // already in lines
  } else if (ev.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    dy *= readingRulerFocusLineCount();
  } else {
    dy /= READING_RULER_WHEEL_PIXELS_PER_LINE;
  }
  let sens = clampMouseWheelScrollSensitivity(
    props.mouseWheelScrollSensitivity ?? defaultMouseWheelScrollSensitivity,
  );
  if (ev.altKey) {
    sens *= clampFastScrollSensitivity(
      props.fastScrollSensitivity ?? defaultFastScrollSensitivity,
    );
  }
  return dy * sens;
}

function isDiscreteReadingRulerWheel(ev: WheelEvent): boolean {
  if (ev.deltaMode === WheelEvent.DOM_DELTA_LINE) return true;
  if (ev.deltaMode === WheelEvent.DOM_DELTA_PAGE) return true;
  return (
    Math.abs(ev.deltaY) >= READING_RULER_WHEEL_PIXELS_PER_LINE * 0.5
  );
}

function applyReadingRulerWheelSteps(lineDelta: number) {
  if (!Number.isFinite(lineDelta) || lineDelta === 0) return;
  const direction: -1 | 1 = lineDelta > 0 ? 1 : -1;
  let left = Math.abs(lineDelta);
  while (left >= 1) {
    if (!moveReadingRulerByContentLines(direction, 1)) {
      readingRulerWheelAcc = 0;
      finishReadingRulerMoveOrBound(direction);
      return;
    }
    left -= 1;
  }
}

function tryHandleReadingRulerWheel(ev: WheelEvent): boolean {
  if (lastHandledReadingRulerWheel === ev) return true;
  if (!isReadingRulerActive() || voiceReadScrollLocked.value) {
    readingRulerWheelAcc = 0;
    return false;
  }
  if (isClickModeIgnoredTarget(ev.target, ev.clientX, ev.clientY)) {
    return false;
  }
  if (ev.deltaY === 0) return false;

  lastHandledReadingRulerWheel = ev;
  ev.preventDefault();
  ev.stopPropagation();

  const lines = wheelEventToRulerLineDelta(ev);
  if (
    (readingRulerWheelAcc > 0 && lines < 0) ||
    (readingRulerWheelAcc < 0 && lines > 0)
  ) {
    readingRulerWheelAcc = 0;
  }

  if (isDiscreteReadingRulerWheel(ev)) {
    const step = Math.round(Math.abs(lines));
    if (step >= 1) {
      readingRulerWheelAcc = 0;
      applyReadingRulerWheelSteps(Math.sign(lines) * step);
      return true;
    }
  }

  readingRulerWheelAcc += lines;
  applyReadingRulerWheelSteps(
    Math.trunc(readingRulerWheelAcc) || 0,
  );
  readingRulerWheelAcc -= Math.trunc(readingRulerWheelAcc);
  return true;
}

function suppressHighlightTipForProgrammaticSelection() {
  readerAnn.setSuppressToolbarUntilMs(Date.now() + 300);
  readerAnn.closeToolbarUi();
}

const inlineSearch = useReaderInlineSearch({
  editor,
  model,
  inlineSearchDecorationsCollection,
  beginProgrammaticScroll,
  monacoScrollType,
  suppressHighlightTipForProgrammaticSelection,
});

/**
 * 书签列表跳转：目标行对齐视口第 2 条字高带，为单层黏性章节条留白。
 * 不并入 {@link jumpToLine}，避免会话恢复/章节导航产生额外偏移。
 */
function jumpToBookmarkLine(lineNumber: number, smooth = true) {
  const e = editor.value;
  const m = model.value;
  if (!e || !m) return;
  beginProgrammaticScroll();
  const lineCount = m.getLineCount();
  const line = Math.max(
    1,
    Math.min(Math.floor(lineNumber), Math.max(1, lineCount)),
  );
  const scrollType = monacoScrollType(smooth);
  e.layout();
  e.revealLineNearTop(line, scrollType);
  const scrollTop =
    computeScrollTopForLineAtViewportSlot(
      e,
      line,
      READER_BOOKMARK_JUMP_SLOT_FROM_TOP,
    ) ?? e.getTopForLineNumber(line);
  e.setScrollTop(Math.max(0, scrollTop), scrollType);
  e.setPosition({ lineNumber: line, column: 1 });
  e.focus();
}

/**
 * 与 {@link jumpToBookmarkLine} 对齐：当前滚动下，视口内容区上沿往下约「一行字高」处的逻辑行（Monaco 显示行号）。
 * 用于保存书签，使「记下的一行」与从书签列表跳回后光标所在行一致。
 */
function getBookmarkSaveAnchorDisplayLine(): number | null {
  const e = editor.value;
  const m = model.value;
  if (!e || !m) return null;
  e.layout();
  const lineHeightPx = e.getOption(monaco.editor.EditorOption.lineHeight);
  const scrollTop = Math.max(0, e.getScrollTop());
  const targetY = scrollTop + lineHeightPx;
  const lc = Math.max(1, m.getLineCount());
  let lo = 1;
  let hi = lc;
  let ans = 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const top = e.getTopForLineNumber(mid);
    if (!Number.isFinite(top)) return null;
    if (top <= targetY) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return Math.max(1, Math.min(ans, lc));
}

/**
 * 视口内首行（Monaco 显示行号，1-based）。
 * 用于 `viewportDisplayLineToPhysicalLine`：滤空时必须为真实显示行，不得 +1，否则物理行号会错位。
 */
function getViewportTopLine(): number {
  const e = editor.value;
  if (!e) return 1;
  const r = e.getVisibleRanges()[0];
  return r?.startLineNumber ?? 1;
}

/** 当前视口可见行跨度（end-start，最小为 0） */
function getViewportLineSpan(): number {
  const e = editor.value;
  if (!e) return 0;
  const r = e.getVisibleRanges()[0];
  if (!r) return 0;
  return Math.max(0, r.endLineNumber - r.startLineNumber);
}

function getAllText(): string {
  return model.value?.getValue() ?? "";
}

/** Monaco 指定显示行（1-based）的文本，供物理行→显示行映射与正文比对 */
function getEditorLineContent(lineNumber: number): string {
  const m = model.value;
  if (!m) return "";
  const lc = m.getLineCount();
  const ln = Math.max(1, Math.min(Math.floor(lineNumber), lc));
  return m.getLineContent(ln);
}

function getSelectedText(): string {
  const e = editor.value;
  const m = model.value;
  if (!e || !m) return "";
  const sel = e.getSelection();
  if (!sel || sel.isEmpty()) return "";
  return m.getValueInRange(sel);
}

function getModelLineCount(): number {
  return model.value?.getLineCount() ?? 0;
}

function monacoPositionAfterPaste(
  start: monaco.Position,
  text: string,
): monaco.Position {
  const lines = text.replace(/\r\n|\r/g, "\n").split("\n");
  if (lines.length === 1) {
    return new monaco.Position(
      start.lineNumber,
      start.column + lines[0].length,
    );
  }
  return new monaco.Position(
    start.lineNumber + lines.length - 1,
    lines[lines.length - 1].length + 1,
  );
}

/** 菜单粘贴：Electron 下 `trigger(clipboardPasteAction)` 常无效，改读剪贴板后 executeEdits */
async function pasteClipboardIntoMonacoEditor(
  e: monaco.editor.ICodeEditor,
): Promise<void> {
  await nextTick();
  e.focus();
  let text: string;
  try {
    text = await navigator.clipboard.readText();
  } catch {
    return;
  }
  if (!text) return;
  const m = e.getModel();
  const sel = e.getSelection();
  if (!m || !sel) return;
  const anchor = sel.getStartPosition();
  e.pushUndoStop();
  const ok = e.executeEdits("colortxt-context-paste", [
    { range: sel, text, forceMoveMarkers: true },
  ]);
  if (!ok) return;
  e.pushUndoStop();
  const end = monacoPositionAfterPaste(anchor, text);
  e.setSelection(monaco.Selection.fromPositions(end, end));
}

function closeEditorEditContextMenu() {
  editorEditContextMenuOpen.value = false;
}

function closeDiffReviewContextMenu() {
  diffReviewContextMenuOpen.value = false;
}

function onDiffReviewContextMenuSelect(id: string) {
  closeDiffReviewContextMenu();
  const diff = smartFormatDiffEditor.value;
  if (!diff) return;
  const e =
    diffReviewContextMenuSide.value === "original"
      ? diff.getOriginalEditor()
      : diff.getModifiedEditor();
  if (id === "cut") {
    e.focus();
    e.trigger("keyboard", "editor.action.clipboardCutAction", null);
    return;
  }
  if (id === "copy") {
    e.focus();
    e.trigger("keyboard", "editor.action.clipboardCopyAction", null);
    return;
  }
  if (id === "paste") {
    void pasteClipboardIntoMonacoEditor(e);
  }
}

function onEditorEditContextMenuSelect(id: string) {
  closeEditorEditContextMenu();
  if (smartFormatReviewActive.value) return;
  if (id === "web-search-manage") {
    emit("openWebSearchManage");
    return;
  }
  if (id.startsWith("web-search:")) {
    const engineId = id.slice("web-search:".length);
    const engine = props.webSearchSettings?.engines?.find(
      (e) => e.id === engineId,
    );
    const query = getSelectedText();
    if (!engine || !query) return;
    const url = buildWebSearchUrl(engine.urlTemplate, query);
    if (!url) {
      appToast("搜索链接无效，请检查 URL 模板是否包含 %s。", { kind: "danger" });
      return;
    }
    void window.colorTxt.openExternal(url);
    return;
  }
  const e = editor.value;
  if (!e) return;
  if (id === "copy") {
    e.focus();
    e.trigger("keyboard", "editor.action.clipboardCopyAction", null);
    return;
  }
  if (id === "selectAll") {
    e.focus();
    e.trigger("keyboard", "editor.action.selectAll", null);
    return;
  }
  if (id === "select-chapter") {
    selectCurrentChapter();
    return;
  }
  if (!props.readerEditMode) {
    if (id === "edit-selection") {
      tryOpenPartialEditFromSelection();
    }
    return;
  }
  if (smartFormatRunning.value) return;
  if (id === "cut") {
    e.focus();
    e.trigger("keyboard", "editor.action.clipboardCutAction", null);
    return;
  }
  if (id === "paste") {
    void pasteClipboardIntoMonacoEditor(e);
    return;
  }
  if (id === "ai-format-selection") {
    emit("aiSmartFormatSelection");
  }
}

function partialEditColumnMap() {
  return annotationColumnMapOptions({
    readerEditMode: false,
    leadIndentFullWidth: props.leadIndentFullWidth === true,
  });
}

function tryOpenPartialEditFromSelection() {
  if (props.readerEditMode) return;
  if (props.streamLoading) {
    appToast("请等待当前文件加载完成后再编辑。", { kind: "info" });
    return;
  }
  const getPhys = props.getPhysicalLineContent;
  const displayToPhysical = props.ebookDisplayLineToPhysical;
  if (typeof getPhys !== "function" || typeof displayToPhysical !== "function") {
    appToast("当前内容暂不支持编辑选中文本，请使用顶栏进入编辑模式。", {
      kind: "info",
    });
    return;
  }
  const sel = getSelectionRange();
  if (!sel || sel.isEmpty()) return;
  const columnMap = partialEditColumnMap();
  const range = monacoRangeToPhysicalRange(
    sel,
    displayToPhysical,
    getPhys,
    columnMap,
  );
  const text = getTextInPhysicalRangeFromLines(
    getPhys,
    range,
    "physical",
    columnMap,
  );
  if (text.length > maxPartialEditSelectionChars) {
    void appAlert(
      `选取内容过大（超过 ${maxPartialEditSelectionChars} 字），请缩小选区。`,
    );
    return;
  }
  partialEditRange.value = range;
  partialEditDraft.value = text;
  partialEditOpen.value = true;
}

function onPartialEditConfirm(text: string) {
  const range = partialEditRange.value;
  partialEditOpen.value = false;
  partialEditRange.value = null;
  if (!range) return;
  if (text === partialEditDraft.value) return;
  emit("applyPartialPhysicalEdit", { range, text });
}

const FIND_CONTROLLER_ID = "editor.contrib.findController";

/** 查找目标：Diff 预览时用当前聚焦侧（默认右侧 modified），否则用主编辑器 */
function getFindTargetEditor(): monaco.editor.ICodeEditor | null {
  if (smartFormatReviewActive.value) {
    const diff = smartFormatDiffEditor.value;
    if (!diff) return null;
    const original = diff.getOriginalEditor();
    const modified = diff.getModifiedEditor();
    if (original.hasTextFocus()) return original;
    if (modified.hasTextFocus()) return modified;
    return modified;
  }
  return editor.value;
}

function toggleFindWidget() {
  if (props.voiceReadBlocksFind) return;
  const e = getFindTargetEditor();
  if (!e) return;
  const findCtrl = e.getContribution(FIND_CONTROLLER_ID) as {
    getState?: () => { isRevealed: boolean };
    closeFindWidget?: () => void;
  } | null;
  const revealed = findCtrl?.getState?.().isRevealed === true;
  e.focus();
  if (revealed) {
    if (findCtrl?.closeFindWidget) {
      findCtrl.closeFindWidget();
      return;
    }
    e.getAction("closeFindWidget")?.run();
  } else {
    props.beforeRevealFindWidget?.();
    ensureSearchAnchorCursorInViewport(e);
    e.getAction("actions.find")?.run();
  }
}

function isFindWidgetRevealed(): boolean {
  if (smartFormatReviewActive.value) {
    const diff = smartFormatDiffEditor.value;
    if (!diff) return false;
    for (const ed of [diff.getModifiedEditor(), diff.getOriginalEditor()]) {
      const findCtrl = ed.getContribution(FIND_CONTROLLER_ID) as {
        getState?: () => { isRevealed: boolean };
      } | null;
      if (findCtrl?.getState?.().isRevealed === true) return true;
    }
    return false;
  }
  const e = editor.value;
  if (!e) return false;
  const findCtrl = e.getContribution(FIND_CONTROLLER_ID) as {
    getState?: () => { isRevealed: boolean };
  } | null;
  return findCtrl?.getState?.().isRevealed === true;
}

/** 全屏顶栏收起等场景：仅当查找栏已显示时关闭，不打开查找栏 */
function closeFindWidgetIfRevealed() {
  const closeOn = (e: monaco.editor.ICodeEditor) => {
    const findCtrl = e.getContribution(FIND_CONTROLLER_ID) as {
      getState?: () => { isRevealed: boolean };
      closeFindWidget?: () => void;
    } | null;
    if (findCtrl?.getState?.().isRevealed !== true) return;
    if (findCtrl.closeFindWidget) {
      findCtrl.closeFindWidget();
      return;
    }
    e.getAction("closeFindWidget")?.run();
  };
  if (smartFormatReviewActive.value) {
    const diff = smartFormatDiffEditor.value;
    if (!diff) return;
    closeOn(diff.getModifiedEditor());
    closeOn(diff.getOriginalEditor());
    return;
  }
  const e = editor.value;
  if (!e) return;
  closeOn(e);
}

type FindControllerStartOpts = {
  forceRevealReplace: boolean;
  seedSearchStringFromSelection: "none" | "single" | "multiple";
  seedSearchStringFromNonEmptySelection: boolean;
  seedSearchStringFromGlobalClipboard: boolean;
  shouldFocus: number;
  shouldAnimate: boolean;
  updateSearchScope: boolean;
  loop: boolean;
};

/** 顶栏高亮词：先经书钉回调，再打开查找并填入高亮词（字面量），并跳到下一处匹配 */
function openFindWithSearchString(raw: string) {
  void openFindWithSearchStringAsync(raw);
}

async function openFindWithSearchStringAsync(raw: string) {
  if (props.voiceReadBlocksFind) return;
  const e = getFindTargetEditor();
  const term = raw.trim();
  if (!e || !term) return;

  props.beforeRevealFindWidget?.();
  ensureSearchAnchorCursorInViewport(e);

  const findOpt = e.getOption(monaco.editor.EditorOption.find);
  const ctrl = e.getContribution(FIND_CONTROLLER_ID) as {
    start?: (
      opts: FindControllerStartOpts,
      newState?: Record<string, unknown>,
    ) => Promise<void>;
    moveToNextMatch?: () => boolean;
  } | null;

  e.focus();

  if (!ctrl?.start) {
    e.getAction("actions.find")?.run();
    e.trigger("colortxt", "editor.actions.findWithArgs", {
      searchString: term,
      isRegex: false,
      matchWholeWord: false,
      isCaseSensitive: false,
      preserveCase: false,
      findInSelection: false,
    });
    return;
  }

  await ctrl.start(
    {
      forceRevealReplace: false,
      seedSearchStringFromSelection: "none",
      seedSearchStringFromNonEmptySelection: false,
      seedSearchStringFromGlobalClipboard: false,
      shouldFocus: 1,
      shouldAnimate: false,
      updateSearchScope: false,
      loop: findOpt.loop,
    },
    {
      searchString: term,
      isReplaceRevealed: false,
      isRegex: false,
      wholeWord: false,
      matchCase: false,
      preserveCase: false,
    },
  );
  ctrl.moveToNextMatch?.();
}

function focusEditor() {
  if (smartFormatReviewActive.value) {
    getFindTargetEditor()?.focus();
    return;
  }
  editor.value?.focus();
}

function scrollByDeltaY(deltaY: number) {
  const e = editor.value;
  if (!e || !Number.isFinite(deltaY) || deltaY === 0) return;
  const maxTop = Math.max(0, e.getScrollHeight() - e.getLayoutInfo().height);
  const nextTop = Math.max(0, Math.min(maxTop, e.getScrollTop() + deltaY));
  e.setScrollTop(nextTop, monacoScrollType(true));
}

/**
 * 将原生 wheel 交给 Monaco 内部滚动（与编辑区内触控板/滚轮一致）。
 * `delegateScrollFromMouseWheelEvent` 在运行时的 CodeEditorWidget 上存在，但未写入 monaco d.ts。
 */
function delegateEditorWheelFromBrowserEvent(ev: WheelEvent) {
  if (tryHandleReadingRulerWheel(ev)) return;
  const e = editor.value;
  if (!e) return;
  const ed = e as monaco.editor.IStandaloneCodeEditor & {
    delegateScrollFromMouseWheelEvent?(browserEvent: WheelEvent): void;
  };
  ed.delegateScrollFromMouseWheelEvent?.(ev);
}

/**
 * 左右留白落在 `.editorShell` 的 padding 上，滚轮/点击不会进 Monaco；
 * 与全屏「阅读区外两侧空白」同样委托给正文滚动。
 */
function isClickModeIgnoredTarget(
  target: EventTarget | null,
  clientX?: number,
  clientY?: number,
): boolean {
  if (target instanceof Element) {
    // Monaco 滚动条是 `.scrollbar` / `.slider`，不是 `.monaco-scrollbar`
    if (
      target.closest(
        ".find-widget, .scrollbar, .slider, .minimap, .decorationsOverviewRuler",
      )
    ) {
      return true;
    }
  }
  const e = editor.value;
  if (!e || clientX == null || clientY == null) return false;
  const dom = e.getDomNode();
  if (!dom) return false;
  const r = dom.getBoundingClientRect();
  const layout = e.getLayoutInfo();
  const sbW = Math.max(0, layout.verticalScrollbarWidth);
  const sbH = Math.max(0, layout.horizontalScrollbarHeight);
  if (
    sbW > 0 &&
    clientX >= r.right - sbW - 1 &&
    clientX <= r.right + 1 &&
    clientY >= r.top &&
    clientY <= r.bottom
  ) {
    return true;
  }
  if (
    sbH > 0 &&
    clientY >= r.bottom - sbH - 1 &&
    clientY <= r.bottom + 1 &&
    clientX >= r.left &&
    clientX <= r.right
  ) {
    return true;
  }
  return false;
}

function runClickModePage(direction: -1 | 1) {
  scrollByPageStep(direction);
}

function hasNonEmptyEditorSelection(): boolean {
  const sel = editor.value?.getSelection();
  return Boolean(sel && !sel.isEmpty());
}

/** 点击模式：有选区时只取消选中，不翻页 */
function clearEditorSelectionKeepCursor() {
  const e = editor.value;
  if (!e) return;
  const sel = e.getSelection();
  if (sel && !sel.isEmpty()) {
    e.setPosition(sel.getPosition());
  }
  closeHighlightFloatUi();
  readerAnn.cancelSelectionPointerInteraction();
  closeEditorEditContextMenu();
}

function runClickModePointerAction(direction: -1 | 1) {
  if (hasNonEmptyEditorSelection()) {
    clearEditorSelectionKeepCursor();
    return;
  }
  runClickModePage(direction);
}

/** 超过此位移视为拖动滚动，松开时不再翻页 */
const CLICK_MODE_DRAG_THRESHOLD_PX = 5;

type ClickModePointerGesture = {
  pointerId: number;
  button: number;
  startX: number;
  startY: number;
  startScrollTop: number;
  dragged: boolean;
  captureEl: Element | null;
  /** 按下时已有弹层：松开不翻页，仍可拖动滚动 */
  suppressPageOnRelease: boolean;
};

let clickModeGesture: ClickModePointerGesture | null = null;

function clickModeGesturePointerId(ev: MouseEvent): number {
  return "pointerId" in ev &&
    typeof (ev as PointerEvent).pointerId === "number"
    ? (ev as PointerEvent).pointerId
    : -1;
}

function setClickModeDraggingClass(on: boolean) {
  document.documentElement.classList.toggle("colortxtClickModeDragging", on);
}

function unbindClickModeGestureListeners() {
  window.removeEventListener("pointermove", onClickModePointerMove, true);
  window.removeEventListener("pointerup", onClickModePointerUp, true);
  window.removeEventListener("pointercancel", onClickModePointerCancel, true);
  window.removeEventListener("blur", onClickModeWindowBlur);
}

function releaseClickModePointerCapture(g: ClickModePointerGesture) {
  if (!g.captureEl || g.pointerId < 0) return;
  try {
    g.captureEl.releasePointerCapture(g.pointerId);
  } catch {
    /* 已释放或元素卸载 */
  }
}

function endClickModePointerGesture(commitClick: boolean) {
  const g = clickModeGesture;
  clickModeGesture = null;
  unbindClickModeGestureListeners();
  setClickModeDraggingClass(false);
  if (g) releaseClickModePointerCapture(g);
  if (g?.dragged) scheduleReadingRulerFollowViewport();
  if (!g || !commitClick || g.dragged || g.suppressPageOnRelease) return;
  if (!readerClickTurnPageActive.value) return;
  runClickModePointerAction(g.button === 2 ? -1 : 1);
}

function applyClickModeGrabScroll(g: ClickModePointerGesture, clientY: number) {
  const e = editor.value;
  if (!e) return;
  const maxTop = Math.max(0, e.getScrollHeight() - e.getLayoutInfo().height);
  const nextTop = Math.max(
    0,
    Math.min(maxTop, g.startScrollTop - (clientY - g.startY)),
  );
  e.setScrollTop(nextTop, monaco.editor.ScrollType.Immediate);
}

function onClickModePointerMove(ev: PointerEvent) {
  const g = clickModeGesture;
  if (!g) return;
  if (g.pointerId >= 0 && ev.pointerId !== g.pointerId) return;
  if (!g.dragged) {
    const dx = ev.clientX - g.startX;
    const dy = ev.clientY - g.startY;
    if (
      dx * dx + dy * dy <
      CLICK_MODE_DRAG_THRESHOLD_PX * CLICK_MODE_DRAG_THRESHOLD_PX
    ) {
      return;
    }
    g.dragged = true;
    setClickModeDraggingClass(true);
    cancelPageTurnStickyAlign();
  }
  applyClickModeGrabScroll(g, ev.clientY);
}

function onClickModePointerUp(ev: PointerEvent) {
  const g = clickModeGesture;
  if (!g) return;
  if (g.pointerId >= 0 && ev.pointerId !== g.pointerId) return;
  if (ev.button !== g.button) return;
  ev.preventDefault();
  ev.stopImmediatePropagation();
  endClickModePointerGesture(true);
}

function onClickModePointerCancel(ev: PointerEvent) {
  const g = clickModeGesture;
  if (!g) return;
  if (g.pointerId >= 0 && ev.pointerId !== g.pointerId) return;
  endClickModePointerGesture(false);
}

function onClickModeWindowBlur() {
  endClickModePointerGesture(false);
}

/** 按下开始手势；松开且未拖动才翻页（阅读尺开启时按聚焦行数移尺）。正文与全屏两侧空白共用。 */
function beginClickModePointerGesture(ev: MouseEvent): boolean {
  if (!readerClickTurnPageActive.value) return false;
  if (ev.button !== 0 && ev.button !== 2) return false;
  if (clickModeGesture) return true;
  // 点击模式会 preventDefault，浏览器不会把焦点交给阅读区；
  // ↑↓ / PageUp / PageDown 在侧栏列表上会让给列表，须把焦点从侧栏拿走。
  focusEditor();
  const pointerId = clickModeGesturePointerId(ev);
  let captureEl: Element | null = null;
  const el = ev.currentTarget;
  if (pointerId >= 0 && el instanceof Element) {
    try {
      el.setPointerCapture(pointerId);
      captureEl = el;
    } catch {
      captureEl = null;
    }
  }
  clickModeGesture = {
    pointerId,
    button: ev.button,
    startX: ev.clientX,
    startY: ev.clientY,
    startScrollTop: editor.value?.getScrollTop() ?? 0,
    dragged: false,
    captureEl,
    suppressPageOnRelease: shouldSkipClickModePageForOverlay(),
  };
  window.addEventListener("pointermove", onClickModePointerMove, true);
  window.addEventListener("pointerup", onClickModePointerUp, true);
  window.addEventListener("pointercancel", onClickModePointerCancel, true);
  window.addEventListener("blur", onClickModeWindowBlur);
  return true;
}

function shouldSuppressClickModeContextMenu(): boolean {
  return readerClickTurnPageActive.value;
}

/**
 * 弹层在 window 捕获阶段仍开着：本轮松开不翻页，仍开始拖动手势。
 * 顶栏「转换/更多」在 document 捕获里关菜单，必须提前记下。
 * 窗口失焦后点阅读区重新激活：同样当次不翻页。
 */
let skipClickModePageUntilPointerUp = false;
let clickModeWindowWasBlurred = false;
let clickModeLastWindowFocusAt = 0;
const CLICK_MODE_FOCUS_ACTIVATE_MS = 400;

function onClickModeTrackWindowBlur() {
  clickModeWindowWasBlurred = true;
}

function onClickModeTrackWindowFocus() {
  clickModeLastWindowFocusAt = performance.now();
}

function armClickModeOverlaySkipIfNeeded(ev: PointerEvent) {
  if (ev.button !== 0 && ev.button !== 2) return;
  if (hasDismissibleOverlay()) skipClickModePageUntilPointerUp = true;
  if (
    !document.hasFocus() ||
    (clickModeWindowWasBlurred &&
      performance.now() - clickModeLastWindowFocusAt <
        CLICK_MODE_FOCUS_ACTIVATE_MS)
  ) {
    skipClickModePageUntilPointerUp = true;
  }
  clickModeWindowWasBlurred = false;
}

function armClickModePageSkip() {
  skipClickModePageUntilPointerUp = true;
}

function clearClickModeOverlaySkip(ev: PointerEvent) {
  if (ev.button !== 0 && ev.button !== 2) return;
  skipClickModePageUntilPointerUp = false;
}

function shouldSkipClickModePageForOverlay(): boolean {
  return skipClickModePageUntilPointerUp;
}

/**
 * 按住 Alt 临时切到可选模式时，Monaco 会把 Alt+拖动当成列选。
 * 在捕获阶段把本次指针/鼠标事件的 alt 抹掉，使拖选与普通可选模式相同。
 */
function maskMouseEventAltKey(ev: MouseEvent) {
  try {
    Object.defineProperty(ev, "altKey", {
      configurable: true,
      enumerable: true,
      get: () => false,
    });
  } catch {
    /* ignore */
  }
  try {
    const orig = ev.getModifierState.bind(ev);
    Object.defineProperty(ev, "getModifierState", {
      configurable: true,
      value: (key: string) => {
        if (key === "Alt" || key === "AltGraph") return false;
        return orig(key);
      },
    });
  } catch {
    /* ignore */
  }
}

const TEMP_SELECT_STRIP_ALT_EVENTS = [
  "pointerdown",
  "pointermove",
  "pointerup",
  "mousedown",
  "mousemove",
  "mouseup",
] as const;

function onTempSelectStripAltMouse(ev: Event) {
  if (!props.readerClickModeAltHeld || props.readerEditMode) return;
  if (!(ev instanceof MouseEvent) || !ev.altKey) return;
  maskMouseEventAltKey(ev);
}

onMounted(() => {
  for (const type of TEMP_SELECT_STRIP_ALT_EVENTS) {
    window.addEventListener(type, onTempSelectStripAltMouse, true);
  }
  window.addEventListener("pointerdown", armClickModeOverlaySkipIfNeeded, true);
  window.addEventListener("pointerup", clearClickModeOverlaySkip, true);
  window.addEventListener("pointercancel", clearClickModeOverlaySkip, true);
  window.addEventListener("blur", onClickModeTrackWindowBlur);
  window.addEventListener("focus", onClickModeTrackWindowFocus);
});
onBeforeUnmount(() => {
  for (const type of TEMP_SELECT_STRIP_ALT_EVENTS) {
    window.removeEventListener(type, onTempSelectStripAltMouse, true);
  }
  window.removeEventListener(
    "pointerdown",
    armClickModeOverlaySkipIfNeeded,
    true,
  );
  window.removeEventListener("pointerup", clearClickModeOverlaySkip, true);
  window.removeEventListener("pointercancel", clearClickModeOverlaySkip, true);
  window.removeEventListener("blur", onClickModeTrackWindowBlur);
  window.removeEventListener("focus", onClickModeTrackWindowFocus);
});

function applyReaderClickModeMouseStyle() {
  const click = readerClickTurnPageActive.value;
  editor.value?.updateOptions({
    mouseStyle: click ? "default" : "text",
  });
  if (click) closeEditorEditContextMenu();
}

function eventOverHorizontalInsetGutter(ev: MouseEvent | WheelEvent): boolean {
  if (!horizontalInsetActive.value) return false;
  if (smartFormatReviewActive.value) return false;
  const host = editorEl.value;
  const shell = editorShellEl.value;
  if (!host || !shell) return false;
  const t = ev.target;
  if (t instanceof Node) {
    if (host.contains(t)) return false;
    if (diffHostEl.value?.contains(t)) return false;
  }
  const hostRect = host.getBoundingClientRect();
  const shellRect = shell.getBoundingClientRect();
  if (ev.clientY < hostRect.top || ev.clientY > hostRect.bottom) return false;
  return (
    (ev.clientX >= shellRect.left && ev.clientX < hostRect.left) ||
    (ev.clientX > hostRect.right && ev.clientX <= shellRect.right)
  );
}

function onHorizontalInsetGutterWheel(ev: WheelEvent) {
  if (!eventOverHorizontalInsetGutter(ev)) return;
  if (props.voiceReadScrollLocked) return;
  if (tryHandleReadingRulerWheel(ev)) return;
  // 须先委托：Monaco 若见 defaultPrevented 会直接 return
  delegateEditorWheelFromBrowserEvent(ev);
  ev.preventDefault();
}

function onHorizontalInsetGutterMouseDown(ev: MouseEvent) {
  if (!eventOverHorizontalInsetGutter(ev)) return;
  if (
    readerClickTurnPageActive.value &&
    (ev.button === 0 || ev.button === 2)
  ) {
    ev.preventDefault();
    beginClickModePointerGesture(ev);
    return;
  }
  if (ev.button !== 0) return;
  ev.preventDefault();
  editor.value?.focus();
}

function onHorizontalInsetGutterContextMenu(ev: MouseEvent) {
  if (!readerClickTurnPageActive.value) return;
  if (!eventOverHorizontalInsetGutter(ev)) return;
  ev.preventDefault();
}

function scrollByLineStep(direction: -1 | 1) {
  if (isReadingRulerActive()) {
    if (moveReadingRulerByContentLines(direction, 1)) return;
    finishReadingRulerMoveOrBound(direction);
    return;
  }
  const e = editor.value;
  if (!e) return;
  const lineHeight = Math.max(
    1,
    e.getOption(monaco.editor.EditorOption.lineHeight),
  );
  scrollByDeltaY(direction * lineHeight);
}

function cancelPageTurnStickyAlign() {
  pageTurnStickyAlignGen++;
  if (pageTurnStickyAlignRaf == null) return;
  cancelAnimationFrame(pageTurnStickyAlignRaf);
  pageTurnStickyAlignRaf = null;
}

/** 完整可见 view line 转成的模型位置；软换行边界列会映射到下一视觉行，故退一列。 */
function lastCompletelyVisibleModelPosition(
  e: monaco.editor.ICodeEditor,
): monaco.IPosition | null {
  const last = e.getVisibleRanges().at(-1);
  if (!last) return null;
  return {
    lineNumber: last.endLineNumber,
    column: Math.max(1, last.endColumn - 1),
  };
}

function visualLineHeightPx(
  e: monaco.editor.ICodeEditor,
  position: monaco.IPosition,
  fallback: number,
): number {
  const h = e.getScrolledVisiblePosition(position)?.height;
  return h && Number.isFinite(h) && h > 0 ? h : fallback;
}

/** 粘性条下方第一条未被挡住的完整视觉行 */
function firstCompletelyVisibleModelPositionBelowSticky(
  e: monaco.editor.ICodeEditor,
): monaco.IPosition | null {
  const stickyHeight = getStickyChapterScrollHeight(e);
  const dom = e.getDomNode();
  if (!dom) return null;
  const layout = e.getLayoutInfo();
  const rect = dom.getBoundingClientRect();
  const x = rect.left + layout.contentLeft + 4;
  const viewportHeight = Math.max(1, layout.height);
  const lineHeight = Math.max(
    1,
    e.getOption(monaco.editor.EditorOption.lineHeight),
  );
  let y = rect.top + stickyHeight + 1;
  const yMax = rect.top + viewportHeight - 2;
  while (y < yMax) {
    const hit = e.getTargetAtClientPoint(x, y)?.position;
    if (!hit) {
      y += lineHeight;
      continue;
    }
    const pos = { lineNumber: hit.lineNumber, column: hit.column };
    const vis = e.getScrolledVisiblePosition(pos);
    if (!vis) {
      y += lineHeight;
      continue;
    }
    if (vis.top + 0.5 < stickyHeight) {
      const nextY = rect.top + vis.top + vis.height + 1;
      y = nextY > y ? nextY : y + lineHeight;
      continue;
    }
    if (vis.top + vis.height > viewportHeight + 0.5) return null;
    return pos;
  }
  return null;
}

function setScrollTopClamped(
  e: monaco.editor.ICodeEditor,
  scrollTop: number,
  wantSmooth: boolean,
) {
  const maxTop = Math.max(0, e.getScrollHeight() - e.getLayoutInfo().height);
  e.setScrollTop(
    Math.max(0, Math.min(maxTop, scrollTop)),
    monacoScrollType(wantSmooth),
  );
}

/** 把该模型位置所在视觉行的顶对齐到粘性条下 */
function alignLineBelowSticky(
  e: monaco.editor.ICodeEditor,
  position: monaco.IPosition,
  stickyHeight: number,
  wantSmooth: boolean,
) {
  const lineTop = e.getTopForPosition(position.lineNumber, position.column);
  if (!Number.isFinite(lineTop)) return;
  setScrollTopClamped(e, lineTop - stickyHeight, wantSmooth);
}

/** 把该视觉行完整落在视口底部（向上翻页的重叠行） */
function alignLineToViewportBottom(
  e: monaco.editor.ICodeEditor,
  position: monaco.IPosition,
  lineHeightPx: number,
  wantSmooth: boolean,
) {
  const lineTop = e.getTopForPosition(position.lineNumber, position.column);
  if (!Number.isFinite(lineTop)) return;
  const vp = Math.max(1, e.getLayoutInfo().height);
  setScrollTopClamped(e, lineTop + lineHeightPx - vp, wantSmooth);
}

function scheduleAfterPageTurnScrollSettled(
  e: monaco.editor.ICodeEditor,
  correct: () => void,
) {
  cancelPageTurnStickyAlign();
  const gen = pageTurnStickyAlignGen;
  const startTop = e.getScrollTop();
  let moved = !props.monacoSmoothScrolling;
  let lastTop = startTop;
  let stableFrames = 0;
  let frames = 0;

  const run = () => {
    pageTurnStickyAlignRaf = null;
    if (gen !== pageTurnStickyAlignGen) return;
    if (editor.value !== e || !e.getDomNode()) return;
    correct();
  };

  const tick = () => {
    if (gen !== pageTurnStickyAlignGen) return;
    frames++;
    const top = e.getScrollTop();
    if (top !== startTop) moved = true;
    if (top === lastTop) stableFrames++;
    else {
      stableFrames = 0;
      lastTop = top;
    }
    const canSettle = moved || frames >= 8;
    if ((canSettle && stableFrames >= 2) || frames > 60) {
      run();
      return;
    }
    pageTurnStickyAlignRaf = requestAnimationFrame(tick);
  };
  pageTurnStickyAlignRaf = requestAnimationFrame(tick);
}

function scrollByPageStep(direction: -1 | 1) {
  if (isReadingRulerActive()) {
    if (
      moveReadingRulerByContentLines(direction, readingRulerFocusLineCount())
    ) {
      return;
    }
    finishReadingRulerMoveOrBound(direction);
    return;
  }
  if (props.interceptReadonlyPageStep?.(direction)) return;
  const e = editor.value;
  if (!e) return;
  cancelPageTurnStickyAlign();
  const lineHeight = Math.max(
    1,
    e.getOption(monaco.editor.EditorOption.lineHeight),
  );
  const viewportHeight = Math.max(1, e.getLayoutInfo().height);

  if (direction > 0) {
    const lastPos = lastCompletelyVisibleModelPosition(e);
    if (lastPos) {
      const lineTop = e.getTopForPosition(lastPos.lineNumber, lastPos.column);
      const stickyHeight = predictStickyChapterScrollHeight(
        e,
        chaptersSnapshot,
        lastPos.lineNumber,
      );
      if (
        Number.isFinite(lineTop) &&
        lineTop - e.getScrollTop() - stickyHeight >= lineHeight
      ) {
        alignLineBelowSticky(e, lastPos, stickyHeight, true);
        scheduleAfterPageTurnScrollSettled(e, () => {
          const desired =
            e.getTopForPosition(lastPos.lineNumber, lastPos.column) -
            getStickyChapterScrollHeight(e);
          if (!Number.isFinite(desired)) return;
          if (Math.abs(desired - e.getScrollTop()) < 1) return;
          setScrollTopClamped(e, desired, true);
        });
        return;
      }
    }
  } else {
    const firstPos = firstCompletelyVisibleModelPositionBelowSticky(e);
    if (firstPos) {
      const lineTop = e.getTopForPosition(firstPos.lineNumber, firstPos.column);
      const h = visualLineHeightPx(e, firstPos, lineHeight);
      const nextTop = lineTop + h - viewportHeight;
      if (Number.isFinite(lineTop) && e.getScrollTop() - nextTop >= lineHeight) {
        alignLineToViewportBottom(e, firstPos, h, true);
        scheduleAfterPageTurnScrollSettled(e, () => {
          const nh = visualLineHeightPx(e, firstPos, h);
          const desired =
            e.getTopForPosition(firstPos.lineNumber, firstPos.column) +
            nh -
            Math.max(1, e.getLayoutInfo().height);
          if (!Number.isFinite(desired)) return;
          if (Math.abs(desired - e.getScrollTop()) < 1) return;
          setScrollTopClamped(e, desired, true);
        });
        return;
      }
    }
  }

  const lastPos = lastCompletelyVisibleModelPosition(e);
  const reserveSticky =
    direction > 0
      ? predictStickyChapterScrollHeight(
          e,
          chaptersSnapshot,
          lastPos?.lineNumber ?? 1,
        )
      : getStickyChapterScrollHeight(e);
  const step = Math.max(
    lineHeight,
    viewportHeight - reserveSticky - lineHeight,
  );
  scrollByDeltaY(direction * step);
}

function scrollToBottom(smooth = false) {
  const e = editor.value;
  if (!e) return;
  beginProgrammaticScroll();
  const maxTop = Math.max(0, e.getScrollHeight() - e.getLayoutInfo().height);
  e.setScrollTop(maxTop, monacoScrollType(smooth));
}

/**
 * 嵌入图片 View Zone 会改变 scrollHeight；须在 Zone 与正文都进布局后再钳制滚动。
 * - 贴近物理顶：scrollTop≤edge 或「篇首插图」时 jumpToLine(1) 会得到 scrollTop≈getTopForLineNumber(1)（>0），须归一为 0。
 * - 贴近物理底：scrollTop≈maxTop。
 * 双帧：首帧 + rAF 再跑一遍，避免 Zone 插入后首帧 scrollHeight 仍未稳定。
 */
function normalizeScrollAfterEmbeddedViewZones() {
  const runPass = () => {
    const e = editor.value;
    if (!e) return;
    beginProgrammaticScroll();
    e.layout();
    e.render(true);
    const layoutH = Math.max(1, e.getLayoutInfo().height);
    const maxTop = Math.max(0, e.getScrollHeight() - layoutH);
    const lh = Math.max(1, e.getOption(monaco.editor.EditorOption.lineHeight));
    const edgePx = Math.min(8, lh * 0.35);
    const alignTol = Math.max(edgePx, Math.floor(lh * 0.45));
    const st0 = Math.max(0, e.getScrollTop());
    const top1 = e.getTopForLineNumber(1);

    if (st0 <= edgePx) {
      e.setScrollTop(0, monaco.editor.ScrollType.Immediate);
    } else if (top1 > 0 && st0 >= top1 - alignTol && st0 <= top1 + alignTol) {
      // 与 jumpToLine(1) 顶对齐同一语义：正文第 1 行顶在视口顶；篇首若有 Zone 在上方，物理「篇首」应为 scrollTop=0。
      e.setScrollTop(0, monaco.editor.ScrollType.Immediate);
    } else if (maxTop > 0 && st0 >= maxTop - edgePx) {
      e.setScrollTop(maxTop, monaco.editor.ScrollType.Immediate);
    }
  };
  runPass();
  if (!readingRulerSkipFollowResync) {
    resyncReadingRulerFromViewport();
  }
  requestAnimationFrame(() => {
    runPass();
    if (!readingRulerSkipFollowResync) {
      resyncReadingRulerFromViewport();
    }
  });
}

function getScrollTop(): number {
  const e = editor.value;
  if (!e) return 0;
  return Math.max(0, e.getScrollTop());
}

/** 滚动到指定 scrollTop（可选平滑）；会钳制到当前可滚动范围 */
function scrollToScrollTop(scrollTop: number, smooth = true) {
  const e = editor.value;
  if (!e) return;
  beginProgrammaticScroll();
  const maxTop = Math.max(0, e.getScrollHeight() - e.getLayoutInfo().height);
  const target = Math.max(0, Math.min(maxTop, scrollTop));
  e.setScrollTop(target, monacoScrollType(smooth));
  e.focus();
}

/**
 * 将指定行尽量贴到底部（近似 revealLineNearBottom）。
 * 通过行底像素 - 视口高度计算 scrollTop，避免“先按顶部跳转再减跨度”带来的累计漂移。
 */
function scrollLineToBottom(lineNumber: number, smooth = false) {
  const e = editor.value;
  const m = model.value;
  if (!e || !m) return;
  beginProgrammaticScroll();
  const lineCount = Math.max(1, m.getLineCount());
  const line = Math.max(1, Math.min(Math.floor(lineNumber), lineCount));
  const layoutH = Math.max(1, e.getLayoutInfo().height);
  const lineBottomPx =
    line >= lineCount ? e.getScrollHeight() : e.getTopForLineNumber(line + 1);
  const maxTop = Math.max(0, e.getScrollHeight() - layoutH);
  const targetTop = Math.max(0, Math.min(maxTop, lineBottomPx - layoutH));
  e.setScrollTop(targetTop, monacoScrollType(smooth));
  e.setPosition({ lineNumber: line, column: 1 });
}

/** 内存短生命周期快照（全屏进出恢复）；勿持久化，可能含不可 JSON 的引用 */
function captureEditorViewState(): monaco.editor.ICodeEditorViewState | null {
  const e = editor.value;
  if (!e) return null;
  return e.saveViewState();
}

/** 供 `colorTxt.file.meta` 持久化；深拷贝为可 JSON 序列化的纯对象 */
function getSerializedEditorViewState(): Record<string, unknown> | null {
  const vs = captureEditorViewState();
  if (!vs) return null;
  try {
    return JSON.parse(JSON.stringify(vs)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function restoreEditorViewState(state: unknown): boolean {
  const e = editor.value;
  if (!e || state == null || typeof state !== "object") return false;
  beginProgrammaticScroll();
  try {
    e.restoreViewState(state as monaco.editor.ICodeEditorViewState);
    scheduleReaderBackgroundStickyAlign();
    emitProbeLine(false);
    return true;
  } catch {
    return false;
  }
}

/** 与 `emitProbeLine` 相同的阅读探针行号（视口内约 3/4 处），1-based */
function getProbeLine(): number {
  const e = editor.value;
  if (!e) return 1;
  const r = e.getVisibleRanges()[0];
  const fallbackLine = e.getPosition()?.lineNumber ?? 1;
  if (!r) return fallbackLine;
  const span = Math.max(0, r.endLineNumber - r.startLineNumber);
  return r.startLineNumber + Math.floor(span * 0.75);
}

/** 右键「选中本章」锚点行：优先菜单打开时记录的点击行，否则选区起点 / 探针行 */
function getContextChapterAnchorLine(): number {
  return editorEditContextMenuAnchorLine.value;
}

/**
 * 指定展示行所属章节在展示层上的起止行（含标题行，至下一章标题前一行）。
 * 无章节或未落入任何章时返回 null。
 */
function resolveCurrentChapterDisplayRange(
  anchorLine?: number,
): {
  startLine: number;
  endLine: number;
} | null {
  const m = model.value;
  if (!m || chaptersSnapshot.length === 0) return null;
  const line = anchorLine ?? getContextChapterAnchorLine();
  const idx = pickActiveChapterIdx(
    chaptersSnapshot as unknown as import("../chapter").Chapter[],
    line,
  );
  if (idx < 0) return null;
  const startLine = chaptersSnapshot[idx]!.lineNumber;
  let endLine = m.getLineCount();
  for (const ch of chaptersSnapshot) {
    if (ch.lineNumber > startLine && ch.lineNumber - 1 < endLine) {
      endLine = ch.lineNumber - 1;
    }
  }
  if (endLine < startLine) return null;
  return { startLine, endLine };
}

function canSelectCurrentChapter(anchorLine?: number): boolean {
  return resolveCurrentChapterDisplayRange(anchorLine) != null;
}

function selectCurrentChapter() {
  const e = editor.value;
  const m = model.value;
  const range = resolveCurrentChapterDisplayRange();
  if (!e || !m || !range) return;
  e.focus();
  e.setSelection(
    new monaco.Selection(
      range.startLine,
      1,
      range.endLine,
      m.getLineMaxColumn(range.endLine),
    ),
  );
  // 程序化设选区不会走划词 pointerup，需主动弹出选区工具条
  if (!props.readerEditMode) {
    void nextTick(() => {
      readerAnn.showToolbarFromSelectionIfAny();
    });
  }
}

/** 与 `emitProbeLine` 内 `endLine` 一致：当前视口末行（Monaco 显示行号） */
function getViewportEndLine(): number {
  const e = editor.value;
  if (!e) return 1;
  const r = e.getVisibleRanges()[0];
  const fallbackLine = e.getPosition()?.lineNumber ?? 1;
  if (!r) return fallbackLine;
  return Math.max(1, r.endLineNumber);
}

function readerEditCursorPayload(
  ed: monaco.editor.ICodeEditor,
): { line: number; column: number; selectionLength: number } | null {
  const m = ed.getModel();
  const pos = ed.getPosition();
  if (!m || !pos) return null;
  const sel = ed.getSelection();
  let selectionLength = 0;
  if (sel && !sel.isEmpty()) {
    selectionLength = m.getValueLengthInRange(sel);
  }
  return {
    line: pos.lineNumber,
    column: pos.column,
    selectionLength,
  };
}

/** 底栏行列号：Diff 预览时跟随当前聚焦的左/右编辑器，否则为主编辑器 */
function emitReaderEditCursorStatus(fromEditor?: monaco.editor.ICodeEditor) {
  if (!props.readerEditMode) return;
  let ed = fromEditor;
  if (!ed) {
    if (smartFormatReviewActive.value) {
      const diff = smartFormatDiffEditor.value;
      if (!diff) return;
      const modified = diff.getModifiedEditor();
      const original = diff.getOriginalEditor();
      if (modified.hasTextFocus()) ed = modified;
      else if (original.hasTextFocus()) ed = original;
      else return;
    } else {
      ed = editor.value ?? undefined;
    }
  }
  if (!ed) return;
  const payload = readerEditCursorPayload(ed);
  if (!payload) return;
  emit("readerEditCursorChange", payload);
}

function emitProbeLine(fromScroll = false) {
  const e = editor.value;
  if (!e) return;
  const fromReadingScroll = fromScroll && programmaticScrollDepth === 0;
  const probeLine = getProbeLine();
  const r = e.getVisibleRanges()[0];
  const startLine = r ? Math.max(1, r.startLineNumber) : 1;
  const endLine = r ? Math.max(1, r.endLineNumber) : probeLine;
  const maxTop = Math.max(0, e.getScrollHeight() - e.getLayoutInfo().height);
  const scrollTop = Math.max(0, e.getScrollTop());
  const atBottom = maxTop <= 0 ? true : scrollTop >= maxTop - 1;
  const percent =
    maxTop <= 0 ? 100 : floorReadingPercentFromScrollRatio(scrollTop / maxTop);
  emit("probeLineChange", probeLine, fromReadingScroll, fromScroll);
  emit("viewportTopLineChange", startLine);
  emit("viewportEndLineChange", endLine);
  emit("viewportVisualProgressChange", percent, atBottom);
}

defineExpose({
  appendText,
  setFullText,
  flushStreamCarriageReturn,
  normalizeLastLineLeadIndent,
  clear,
  flushPendingTypographyForDisplayChange,
  setChapters,
  setTheme,
  setFontSize,
  setLineHeightMultiple,
  setLineSpacingPx,
  setLetterSpacingPx,
  setFontFamily,
  setWrappingStrategyAdvanced,
  resetToTop,
  scrollToDocumentStart,
  refreshChapterStickyScroll,
  jumpToLine,
  scrollToLineNearTop,
  jumpToLineCentered,
  scrollModelLineBlockToViewportCenter,
  getModelLineAtViewportCenter,
  getViewportStartModelLine,
  setVoiceReadLineHighlight,
  getVoiceReadHighlightedLine: () => voiceReadHighlightLine.value,
  isReadingRulerActive,
  readingRulerCannotMove,
  resyncReadingRulerFromViewport,
  syncReadingRulerToDocumentContentEdge,
  scrollChapterTitleToRulerFocus,
  jumpToSearchMatchCentered: inlineSearch.jumpToSearchMatchCentered,
  jumpToNextInlineSearchMatch: inlineSearch.jumpToNextInlineSearchMatch,
  hasInlineSearchQuery: inlineSearch.hasInlineSearchQuery,
  jumpToBookmarkLine,
  getBookmarkSaveAnchorDisplayLine,
  captureViewportRestoreAnchor,
  restoreViewportToRestoreAnchor,
  setInlineSearchState: inlineSearch.setInlineSearchState,
  clearInlineSearchState: inlineSearch.clearInlineSearchState,
  emitProbeLine,
  getProbeLine,
  getViewportEndLine,
  getViewportTopLine,
  getViewportLineSpan,
  getAllText,
  applyEditFormatCompressBlankLines,
  applyEditFormatCompressBlankLinesInRange,
  applyEditFormatLeadIndentFullWidth,
  applyEditFormatTextConvertZh,
  applyEditFormatTextConvertLetters,
  applyEditFormatTextConvertDigits,
  applyEditFormatTextReplace,
  applyEditFormatLeadIndentFullWidthInRange,
  applySmartFormatReviewCompressBlankLines,
  applySmartFormatReviewLeadIndentFullWidth,
  markReaderEditSaved,
  sealReaderEditBaseline,
  getEditorLineContent,
  getModelLineCount,
  getSelectedText,
  getSelectionRange,
  applyEditLineRangePatch,
  tryOpenPartialEditFromSelection,
  getSmartFormatPostProcessContext: smartFormatPostProcessContext,
  getSmartFormatReviewModifiedText,
  focusSmartFormatAppliedRange,
  revealSmartFormatSegment,
  setSmartFormatRunning,
  toggleFindWidget,
  closeFindWidgetIfRevealed,
  openFindWithSearchString,
  isFindWidgetRevealed,
  focusEditor,
  scrollByDeltaY,
  delegateEditorWheelFromBrowserEvent,
  tryHandleReadingRulerWheel,
  beginClickModePointerGesture,
  armClickModePageSkip,
  shouldSuppressClickModeContextMenu,
  scrollByLineStep,
  scrollByPageStep,
  scrollToBottom,
  normalizeScrollAfterEmbeddedViewZones,
  scrollLineToBottom,
  getScrollTop,
  scrollToScrollTop,
  captureEditorViewState,
  getSerializedEditorViewState,
  restoreEditorViewState,
  applyEmbeddedImageAnchors,
  applyMarkdownInternalLinks,
  setPendingEbookInternalLinkSidecar,
  shiftPendingEbookSidecarForDeletedDisplayLines,
  getEbookLeadingLinkLabelsByDisplayLine,
  getReaderEditorDomNode: () => {
    if (smartFormatReviewActive.value) {
      return (
        diffHostEl.value ??
        smartFormatDiffEditor.value?.getModifiedEditor().getDomNode() ??
        null
      );
    }
    return editor.value?.getDomNode() ?? null;
  },
  jumpToAnnotationRange,
  getAnnotationDisplayQuote,
  getAnnotationHitsByLine,
  getModel: () => model.value,
  refreshReaderAnnotationDecorations: refreshAnnotationDecorations,
  suppressHighlightTipForProgrammaticSelection,
});

function applyReaderSyntaxFromProps() {
  setReaderSyntaxHighlightEnabled(
    monaco,
    props.monacoCustomHighlight,
    props.readerSurfaceLight,
    props.readerSurfaceDark,
    props.highlightColors,
  );
  setTheme(lastAppThemeName);
}

const LINEATION_COLOR_STYLE_ID = "txtr-reader-lineation-colors";

function syncLineationColorStyles() {
  let styleEl = document.getElementById(
    LINEATION_COLOR_STYLE_ID,
  ) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = LINEATION_COLOR_STYLE_ID;
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = annotationMarkerCssRules(props.lineationColors);
}

watch(
  () =>
    [props.monacoCustomHighlight, props.txtrDelimitedMatchCrossLine] as const,
  () => {
    applyReaderSyntaxFromProps();
    applyTxtrMonarchTokenizer();
    if (!props.monacoCustomHighlight) {
      closeHighlightFloatUi();
    }
  },
);

watch(
  () => [props.readerSurfaceLight, props.readerSurfaceDark] as const,
  () => {
    applyReaderSyntaxFromProps();
  },
  { deep: true },
);

onMounted(() => {
  // 语言只需注册一次（跨 HMR）；章节粘性 DocumentSymbolProvider 须随本实例挂载/卸载。
  // AppModal 用 v-if 关闭阅读器会销毁 ReaderMain：若只注册一次，卸载后 provider 已 dispose，
  // 第二次打开不会再注册 → 粘性章节标题失效。
  const g = globalThis as any;
  if (!g[globalKey]) {
    monaco.languages.register({ id: languageId });
    g[globalKey] = true;
  }

  const chapterSticky = registerChapterStickyScrollProviders(
    monaco,
    languageId,
    () => chaptersSnapshot,
  );
  providersDisposables.push(chapterSticky.disposable);
  notifyChapterStickyFoldingRanges =
    chapterSticky.notifyChapterFoldingRangesChanged;

  applyTxtrMonarchTokenizer();
  applyReaderSyntaxFromProps();
  syncLineationColorStyles();

  const fontStyleId = "txtr-reader-kinghwa-font";
  if (!document.getElementById(fontStyleId)) {
    const styleEl = document.createElement("style");
    styleEl.id = fontStyleId;
    styleEl.textContent = `
@font-face {
  font-family: "KingHwa OldSong";
  src: url("${kingHwaFontUrl}") format("truetype");
  font-weight: normal;
  font-style: normal;
  font-display: swap;
}
`;
    document.head.appendChild(styleEl);
  }

  const m = monaco.editor.createModel("", languageId);
  model.value = m;

  ensureStickyChapterBarClickDisabled();

  syncCjkWrapOptimizeFlag(false);
  applyMonacoLineSpacingPx(props.lineSpacingPx);

  editor.value = monaco.editor.create(editorEl.value!, {
    model: m,
    /** 脚注悬停/补全等溢出挂件挂到专用容器，脱离 `.editorHost { overflow:hidden }` */
    overflowWidgetsDomNode: ensureReaderMonacoOverflowHost(),
    ...buildReaderEditorCreateOptions({
      fontSize: READER_EDITOR_DEFAULT_FONT_SIZE,
      lineHeightMultiple,
      letterSpacingPx: props.letterSpacingPx,
      fontFamily: currentFontFamily,
      theme: readerMonacoThemeForAppTheme(lastAppThemeName),
      wrappingStrategyAdvanced: props.monacoAdvancedWrapping,
      smoothScrolling: props.monacoSmoothScrolling,
      mouseWheelScrollSensitivity: props.mouseWheelScrollSensitivity,
      fastScrollSensitivity: props.fastScrollSensitivity,
      stickyChapterTitleEnabled: props.stickyChapterTitleEnabled,
    }),
  });
  // 字重 @font-face 晚于编辑器创建时，重新测量以便按锁定字重排版
  void whenSystemFontFacesReady().then(() => {
    const e = editor.value;
    if (!e || !currentFontFamily) return;
    const size = e.getOption(monaco.editor.EditorOption.fontSize);
    const family = currentFontFamily;
    const done = () => {
      if (!editor.value) return;
      monaco.editor.remeasureFonts();
      setFontFamily(family);
    };
    const pending = document.fonts?.load(`${size}px ${family}`);
    if (pending) void pending.then(done, done);
    else done();
  });
  chapterTitleDecorationsCollection.value =
    editor.value.createDecorationsCollection();
  inlineSearchDecorationsCollection.value =
    editor.value.createDecorationsCollection();
  annotationDecorationsCollection.value =
    editor.value.createDecorationsCollection();
  voiceReadDecorationsCollection.value =
    editor.value.createDecorationsCollection();
  readingRulerDecorationsCollection.value =
    editor.value.createDecorationsCollection();
  minimapCursorLineDecorationsCollection.value =
    editor.value.createDecorationsCollection();
  chapterMinimapDecorationsCollection.value =
    editor.value.createDecorationsCollection();

  bindAnnotationScrollSync(editor.value);
  rebuildAnnotationIndex();
  syncReadingRulerEditorClass();

  const e = editor.value;
  if (e) {
    if (currentFontFamily.includes("KingHwa OldSong")) {
      void document.fonts
        ?.load(`${READER_EDITOR_DEFAULT_FONT_SIZE}px "KingHwa OldSong"`)
        .then(() => {
          e.updateOptions({ fontFamily: currentFontFamily });
        });
    }
    const d1 = e.onDidScrollChange(() => {
      emitProbeLine(true);
      flushReaderBackgroundStickyAlign();
      scheduleReadingRulerFollowViewport();
    });
    const dLayout = e.onDidLayoutChange(() => {
      flushReaderBackgroundStickyAlign();
      // 阅读尺未启用时 refresh 会立刻 clear 并返回；缩放热路径上省掉这次调用
      if (isReadingRulerActive()) refreshReadingRulerDecorations();
    });
    window.addEventListener("resize", flushReaderBackgroundStickyAlign);
    const d2 = e.onDidChangeCursorPosition(() => {
      emitProbeLine(false);
      syncMinimapCursorLineDecoration();
      if (!smartFormatReviewActive.value) emitReaderEditCursorStatus();
    });
    const dSel = e.onDidChangeCursorSelection(() => {
      refreshReadingRulerDecorations();
      if (!smartFormatReviewActive.value) emitReaderEditCursorStatus();
      if (readerAnn.shouldSuppressToolbar()) {
        closeHighlightFloatUi();
        return;
      }
      onSelectionChangedDuringInteraction();
      if (inlineSearch.hasInlineSearchQuery()) {
        inlineSearch.applyInlineSearchDecorations();
      }
      syncMinimapCursorLineDecoration();
    });
    const d3 = installReaderScrollKeyHandler(monaco, e, {
      onSpacePageDown: () => {
        if (props.voiceReadScrollLocked) return;
        scrollByPageStep(1);
      },
      shouldInterceptReadOnlyKeys: () =>
        !props.readerEditMode && !props.voiceReadScrollLocked,
    });
    const dReadOnlyIme = installReaderReadOnlyImeGuard(monaco, e);
    function openEditorEditContextMenu(clientX: number, clientY: number) {
      if (smartFormatReviewActive.value) return;
      if (props.readerEditMode && smartFormatRunning.value) return;
      const sel = e.getSelection();
      editorEditContextMenuHasSelection.value = Boolean(sel && !sel.isEmpty());
      // 无选区时勿依赖光标（滚动阅读时常停在文首）；用右键落点行，再退回探针行
      let anchorLine: number | null = null;
      if (sel && !sel.isEmpty()) {
        anchorLine = Math.min(
          sel.selectionStartLineNumber,
          sel.positionLineNumber,
        );
      } else {
        const target = e.getTargetAtClientPoint(clientX, clientY);
        anchorLine = target?.position?.lineNumber ?? null;
      }
      editorEditContextMenuAnchorLine.value =
        anchorLine ?? getProbeLine();
      editorEditContextMenuX.value = clientX;
      editorEditContextMenuY.value = clientY;
      editorEditContextMenuOpen.value = true;
    }
    saveCommandDisposable = e.addAction({
      id: "colortxt.readerEdit.save",
      label: "保存",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run() {
        if (props.readerEditMode) emit("readerEditSaveRequest");
      },
    });
    /**
     * Monaco 内部命中测试在部分 DOM 路径下会先得到 UNKNOWN 并短路；`.view-lines` 在 `.view-zones` 之后插入会盖住 zone。
     * CSS 抬高 `.view-zones`；在 `editorHost` 上 **捕获** pointerdown：先处理电子书内链（须早于 Monaco 默认 mousedown），再处理插图灯箱。
     * 右键在捕获阶段截断，不交给 Monaco（否则会把光标移到点击处并清空选区）；菜单改由原生 contextmenu 打开。
     */
    const editorHost = editorEl.value;
    /**
     * 挂在 editorHost 捕获阶段：
     * 「禁用」拦掉；「翻页」走 `scrollByPageStep`（与空格/PageUp/Down 同套）；「跳转」放行 Monaco。
     */
    const disposeScrollbarTrackJumpGuard = bindMonacoScrollbarTrackJumpGuard(
      e,
      () => {
        const b = effectiveScrollbarTrackBehavior();
        if (b === "disabled") return "block";
        if (b === "page") return "page";
        return "none";
      },
      (direction) => {
        scrollByPageStep(direction);
      },
      editorHost,
    );
    const onReaderPointerDownCapture = (ev: PointerEvent) => {
      if (ev.button === 2) {
        // 只截断冒泡到 Monaco，勿 preventDefault（否则可能不再触发 contextmenu）
        ev.stopImmediatePropagation();
        if (
          readerClickTurnPageActive.value &&
          !isClickModeIgnoredTarget(ev.target, ev.clientX, ev.clientY)
        ) {
          beginClickModePointerGesture(ev);
        }
        return;
      }
      if (ev.button !== 0) return;
      if (
        ebookInternalLinkHitCount.value > 0 &&
        tryJumpEbookInternalLinkFromPoint(ev.clientX, ev.clientY)
      ) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        return;
      }
      if (imageViewZoneIds.value.length > 0) {
        const t = ev.target;
        if (t instanceof Element) {
          const zone = t.closest(".readerImageViewZone");
          if (zone instanceof HTMLElement && editorHost?.contains(zone)) {
            const url = zone.dataset.colortxtImgUrl?.trim();
            const img = url ? zone.querySelector("img") : null;
            if (url && img instanceof HTMLImageElement) {
              const r = img.getBoundingClientRect();
              const { clientX, clientY } = ev;
              if (
                clientX >= r.left &&
                clientX <= r.right &&
                clientY >= r.top &&
                clientY <= r.bottom
              ) {
                ev.preventDefault();
                ev.stopImmediatePropagation();
                imageLightboxSrc.value = url;
                readerAnn.cancelSelectionPointerInteraction();
                return;
              }
            }
          }
        }
      }
      if (readerClickTurnPageActive.value) {
        if (
          isClickModeIgnoredTarget(ev.target, ev.clientX, ev.clientY)
        ) {
          return;
        }
        ev.preventDefault();
        ev.stopImmediatePropagation();
        beginClickModePointerGesture(ev);
        return;
      }
      readerAnn.beginSelectionPointerInteraction(ev.target);
    };
    const onReaderMouseDownCapture = (ev: MouseEvent) => {
      if (ev.button !== 2) return;
      ev.stopImmediatePropagation();
    };
    const onReaderContextMenuCapture = (ev: MouseEvent) => {
      if (readerClickTurnPageActive.value) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        return;
      }
      ev.preventDefault();
      ev.stopImmediatePropagation();
      openEditorEditContextMenu(ev.clientX, ev.clientY);
    };
    editorHost?.addEventListener(
      "pointerdown",
      onReaderPointerDownCapture,
      true,
    );
    editorHost?.addEventListener("mousedown", onReaderMouseDownCapture, true);
    editorHost?.addEventListener(
      "contextmenu",
      onReaderContextMenuCapture,
      true,
    );
    const onReaderRulerWheelCapture = (ev: WheelEvent) => {
      tryHandleReadingRulerWheel(ev);
    };
    editorHost?.addEventListener("wheel", onReaderRulerWheelCapture, {
      capture: true,
      passive: false,
    });
    /** 查找栏下一处/上一处：先把视口外光标挪到视口首行，再让 Monaco 从该锚点搜 */
    const onFindNavigateAnchorCapture = (ev: Event) => {
      const t = ev.target;
      if (!(t instanceof Element)) return;
      if (
        !t.closest(
          ".find-widget .codicon-find-next-match, .find-widget .codicon-find-previous-match, .find-widget .button[aria-label*='下一个'], .find-widget .button[aria-label*='上一个'], .find-widget .button[title*='下一个'], .find-widget .button[title*='上一个'], .find-widget .button[aria-label*='Next'], .find-widget .button[aria-label*='Previous'], .find-widget .button[title*='Next'], .find-widget .button[title*='Previous']",
        )
      ) {
        return;
      }
      ensureSearchAnchorCursorInViewport(e);
    };
    const onFindNavigateKeyCapture = (ev: KeyboardEvent) => {
      if (!isFindWidgetRevealed()) return;
      const isF3 = ev.key === "F3";
      const isEnterInFind =
        ev.key === "Enter" &&
        ev.target instanceof Element &&
        Boolean(ev.target.closest(".find-widget"));
      if (!isF3 && !isEnterInFind) return;
      ensureSearchAnchorCursorInViewport(e);
    };
    editorHost?.addEventListener("click", onFindNavigateAnchorCapture, true);
    window.addEventListener("keydown", onFindNavigateKeyCapture, true);
    onBeforeUnmount(() => {
      disposeScrollbarTrackJumpGuard();
      d1.dispose();
      dLayout.dispose();
      window.removeEventListener("resize", flushReaderBackgroundStickyAlign);
      d2.dispose();
      dSel.dispose();
      d3.dispose();
      dReadOnlyIme.dispose();
      saveCommandDisposable?.dispose();
      saveCommandDisposable = null;
      editorHost?.removeEventListener(
        "pointerdown",
        onReaderPointerDownCapture,
        true,
      );
      editorHost?.removeEventListener(
        "mousedown",
        onReaderMouseDownCapture,
        true,
      );
      editorHost?.removeEventListener(
        "contextmenu",
        onReaderContextMenuCapture,
        true,
      );
      editorHost?.removeEventListener(
        "wheel",
        onReaderRulerWheelCapture,
        true,
      );
      editorHost?.removeEventListener("click", onFindNavigateAnchorCapture, true);
      window.removeEventListener("keydown", onFindNavigateKeyCapture, true);
      readerAnn.cancelSelectionPointerInteraction();
    });

    applyReaderMonacoModeOptions(Boolean(props.readerEditMode));
    syncStickyScrollToStreamState();
    syncMinimapCursorLineDecoration();
    syncChapterMinimapSectionHeaderDecorations();
    setupHorizontalInsetLayout();
  }
});

onBeforeUnmount(() => {
  endClickModePointerGesture(false);
  teardownHorizontalInsetLayout();
  if (stickyChapterScrollRefreshRaf != null) {
    cancelAnimationFrame(stickyChapterScrollRefreshRaf);
    stickyChapterScrollRefreshRaf = null;
  }
  cancelPageTurnStickyAlign();
  cancelReadingRulerFollowViewport();
  clearReadingRulerFade();
  notifyChapterStickyFoldingRanges = null;
  disposeEbookInternalLinks();
  cancelImageViewZoneScrollRender();
  removeHlGlobalListeners?.();
  removeHlGlobalListeners = null;
  unsubModalStack?.();
  unsubModalStack = null;
  removeVoiceReadKeyCapture?.();
  removeVoiceReadKeyCapture = null;
  removeSmartFormatReviewKeyCapture?.();
  removeSmartFormatReviewKeyCapture = null;
  removeSelectionToolbarDigitKeyCapture?.();
  removeSelectionToolbarDigitKeyCapture = null;
  disposeAnnotationDecorations();
  editor.value?.dispose();
  model.value?.dispose();
  disposeReaderMonacoOverflowHost();
  for (const d of providersDisposables) d.dispose();
  providersDisposables = [];
});

watch(
  () =>
    [
      props.readingRulerEnabled,
      props.readingRulerFocusLines,
      props.readingRulerDimOpacity,
      props.readingRulerDimStickyTitle,
      props.readingRulerTransitionEnabled,
      props.readerEditMode,
      props.voiceReadScrollLocked,
      props.voiceReadPaused,
    ] as const,
  (curr, prev) => {
    const nowActive =
      curr[0] === true && !curr[5] && !curr[6] && !curr[7];
    const wasActive = prev
      ? prev[0] === true && !prev[5] && !prev[6] && !prev[7]
      : false;
    if (nowActive && !wasActive) {
      invalidateReadingRulerAnchor();
    }
    if (!nowActive) {
      cancelReadingRulerFollowViewport();
      readingRulerSkipFollowResync = false;
      readingRulerOwnedScrollTop = null;
      clearReadingRulerFade();
      readingRulerDecorationsCollection.value?.clear();
    }
    syncReadingRulerEditorClass();
    refreshReadingRulerDecorations();
  },
);

watch(
  () => [props.readerEditMode, props.physicalReaderPath] as const,
  async ([edit, physRaw]) => {
    const phys = physRaw?.trim() ?? "";
    if (!edit) {
      teardownReaderEditContentListener();
      readerEditLoadedPhysicalKey = "";
      applyReaderMonacoModeOptions(false);
      return;
    }
    // 有磁盘路径：优先整文件载入（主阅读器）；无路径：对内存正文进入编辑（找书章节缓存）
    if (phys && readerEditLoadedPhysicalKey !== phys) {
      await loadReaderEditFromDisk();
      return;
    }
    if (!phys) readerEditLoadedPhysicalKey = "";
    applyReaderMonacoModeOptions(true);
    // 找书等内存正文：进入编辑时清阅读态章节标题样式，保留章节快照供粘性标题
    chapterTitleDecorationsCollection.value?.clear();
    lastChapterTitleDecorationsLineKey = "";
    syncChapterMinimapSectionHeaderDecorations();
    notifyChapterStickyFoldingRanges?.();
    scheduleStickyChapterScrollRefresh();
    teardownReaderEditContentListener();
    const m = model.value;
    if (m) {
      readerEditContentDisposable = m.onDidChangeContent(() => {
        onReaderEditModelContentChange();
      });
      sealReaderEditBaseline();
    }
  },
  { flush: "post" },
);

watch(
  () => props.readerFilePath,
  () => {
    closeHighlightFloatUi();
  },
);

watch(readerClickTurnPageActive, (active) => {
  if (!active) endClickModePointerGesture(false);
  applyReaderClickModeMouseStyle();
});

watch(
  () => !props.readerEditMode,
  (enabled) => {
    removeSelectionToolbarDigitKeyCapture?.();
    removeSelectionToolbarDigitKeyCapture = null;
    if (!enabled) return;
    const onKey = (ev: KeyboardEvent) => {
      onSelectionToolbarDigitKey(ev);
    };
    document.addEventListener("keydown", onKey, true);
    removeSelectionToolbarDigitKeyCapture = () =>
      document.removeEventListener("keydown", onKey, true);
  },
  { immediate: true },
);

watch(
  () => props.voiceReadScrollLocked,
  (locked) => {
    removeVoiceReadKeyCapture?.();
    removeVoiceReadKeyCapture = null;
    if (!locked) return;
    const onKey = (ev: KeyboardEvent) => {
      const root = editor.value?.getDomNode();
      if (!root) return;
      const t = ev.target;
      if (!(t instanceof Node) || !root.contains(t)) return;
      if (t instanceof Element && t.closest(".find-widget")) return;
      const k = ev.key;
      if (
        k === "ArrowLeft" ||
        k === "ArrowRight" ||
        k === "ArrowUp" ||
        k === "ArrowDown" ||
        k === "PageUp" ||
        k === "PageDown" ||
        k === " " ||
        k === "Home" ||
        k === "End"
      ) {
        ev.preventDefault();
        ev.stopPropagation();
      }
    };
    document.addEventListener("keydown", onKey, true);
    removeVoiceReadKeyCapture = () =>
      document.removeEventListener("keydown", onKey, true);
  },
);

onMounted(() => {
  unsubModalStack = subscribeModalStackChange(() => {
    if (!toolbarVisible.value && !colorPickerMode.value) return;
    if (readerAnn.shouldSuppressToolbar()) return;
    if (hasModalOnStack() || hasEscBeforeModalLayers()) {
      closeHighlightFloatUi();
    }
  });
  setupHorizontalInsetLayout();
});

watch(smartFormatReviewActive, (active) => {
  removeSmartFormatReviewKeyCapture?.();
  removeSmartFormatReviewKeyCapture = null;
  void nextTick(() => {
    setupHorizontalInsetLayout();
    layoutDiffEditor();
    editor.value?.layout();
  });
  if (!active) {
    closeDiffReviewContextMenu();
    void nextTick(() => emitReaderEditCursorStatus());
    return;
  }
  const onKey = (ev: KeyboardEvent) => {
    if (!ev.ctrlKey || ev.metaKey || ev.altKey || ev.shiftKey) return;
    if (smartFormatDiffChangeCount.value === 0) return;
    if (ev.key === "ArrowUp") {
      ev.preventDefault();
      ev.stopPropagation();
      smartFormatDiffGoToPrevious();
    } else if (ev.key === "ArrowDown") {
      ev.preventDefault();
      ev.stopPropagation();
      smartFormatDiffGoToNext();
    }
  };
  document.addEventListener("keydown", onKey, true);
  removeSmartFormatReviewKeyCapture = () =>
    document.removeEventListener("keydown", onKey, true);
});
</script>

<template>
  <main
    ref="contentRootEl"
    class="content readerSurfaceBg"
    :class="{
      'content--readerEdit': readerEditMode,
      'content--readerEditMinimap': readerEditMode && readerEditMinimap,
      'content--clickMode': readerClickTurnPageActive,
      'content--hInset': horizontalInsetActive,
      'content--hInsetWindowPin': horizontalInsetWindowPin,
    }"
    :style="horizontalInsetStyle"
  >
    <div
      ref="editorShellEl"
      class="editorShell"
      :class="{ 'editorShell--smartFormatReview': smartFormatReviewActive }"
      @wheel="onHorizontalInsetGutterWheel"
      @pointerdown="onHorizontalInsetGutterMouseDown"
      @contextmenu="onHorizontalInsetGutterContextMenu"
    >
      <SmartFormatReviewBar
        v-if="smartFormatReviewActive"
        :scope-label="smartFormatReviewScopeLabel"
        :change-count="smartFormatDiffChangeCount"
        :show-whitespace-diff="smartFormatDiffShowWhitespace"
        :hide-unchanged-regions="smartFormatDiffHideUnchanged"
        @go-to-previous="smartFormatDiffGoToPrevious"
        @go-to-next="smartFormatDiffGoToNext"
        @toggle-whitespace="smartFormatDiffToggleWhitespace"
        @toggle-hide-unchanged="smartFormatDiffToggleHideUnchanged"
        @discard="onSmartFormatReviewDiscard"
        @apply="onSmartFormatReviewApply"
      />
      <div
        ref="editorEl"
        class="editorHost"
        :class="{ 'editorHost--hidden': smartFormatReviewActive }"
      ></div>
      <div
        ref="diffHostEl"
        class="editorHost editorHost--diff"
        :class="{ 'editorHost--hidden': !smartFormatReviewActive }"
      ></div>
      <div
        v-if="voiceReadScrollLocked"
        class="voiceReadScrollBlocker"
        aria-hidden="true"
        @wheel.prevent.stop
      />
      <VoiceReadResumeGuide
        :visible="voiceReadPaused === true"
        @resume="emit('voiceReadResume')"
      />
      <div ref="notePanelRootRef" class="notePanelHost">
        <ReaderNoteInputPanel
          :open="notePanelOpen"
          :draft="notePanelDraft"
          :source-text="notePanelSourceText"
          :editing="notePanelEditing"
          :monaco-font-family="monacoFontFamily"
          @confirm="onNotePanelConfirm"
          @close="closeNotePanel"
          @delete-note="onNotePanelDelete"
        />
      </div>
      <div ref="dictionaryPopupRootRef">
        <ReaderDictionaryPopup
          :open="dictionaryPopupOpen"
          :word="dictionaryPopupWord"
          :settings="dictionarySettings"
          :float-center-x="dictionaryPopupCenterX"
          :float-root-top="dictionaryPopupTop"
          :open-downward="dictionaryPopupOpenDownward"
          :max-height="dictionaryPopupMaxHeight"
          @close="closeDictionaryPopup"
          @open-dictionary-manage="emit('openDictionaryManage')"
        />
      </div>
      <div ref="translatePopupRootRef">
        <ReaderTranslatePopup
          :open="translatePopupOpen"
          :text="translatePopupText"
          :settings="translationSettings"
          :float-center-x="translatePopupCenterX"
          :float-root-top="translatePopupTop"
          :open-downward="translatePopupOpenDownward"
          :max-height="translatePopupMaxHeight"
          @close="closeTranslatePopup"
          @open-translate-manage="emit('openTranslateManage')"
          @update:settings="emit('update:translationSettings', $event)"
        />
      </div>
    </div>
    <div
      v-if="toolbarVisible || colorPickerMode"
      ref="floatRootRef"
      class="hlFloatRoot"
      :style="{ zIndex: HL_FLOAT_Z_INDEX }"
      aria-live="polite"
    >
      <ReaderSelectionToolbar
        :toolbar-visible="toolbarVisible"
        :color-picker-mode="colorPickerMode"
        :lineation-picker-type="lineationPickerType"
        :float-center-x="floatCenterX"
        :float-root-top="floatRootTop"
        :open-downward="floatOpenDownward"
        :highlight-colors="highlightColors"
        :lineation-colors="lineationColors"
        :show-highlight-remove-row="hlPickerShowRemoveRow"
        :existing-highlight-color-index="hlPickerExistingColorIndex"
        :active-lineation="activeLineation"
        :lineation-picker-selected-index="lineationPickerSelectedIndex"
        :monaco-custom-highlight="monacoCustomHighlight"
        :show-selection-annotation-tools="showSelectionAnnotationTools"
        :ai-features-enabled="aiFeaturesEnabled"
        :selection-toolbar-buttons="selectionToolbarButtons"
        :has-lineation="toolbarHasLineation"
        :has-note="toolbarHasNote"
        @action="onToolbarAction"
        @highlight-pick-confirm="onHighlightPickConfirm"
        @highlight-pick-remove="onHighlightPickRemove"
        @lineation-pick-confirm="onLineationPickConfirm"
        @lineation-pick-remove="onLineationPickRemove"
      />
    </div>
    <AppContextMenu
      :open="editorEditContextMenuOpen"
      :x="editorEditContextMenuX"
      :y="editorEditContextMenuY"
      :items="editorEditContextMenuItems"
      :min-width="readerEditMode ? 200 : 168"
      @close="closeEditorEditContextMenu"
      @select="onEditorEditContextMenuSelect"
    />
    <ReaderPartialEditPanel
      v-model:open="partialEditOpen"
      :draft="partialEditDraft"
      :monaco-font-family="monacoFontFamily"
      @confirm="onPartialEditConfirm"
    />
    <AppContextMenu
      :open="diffReviewContextMenuOpen"
      :x="diffReviewContextMenuX"
      :y="diffReviewContextMenuY"
      :items="diffReviewContextMenuItems"
      :min-width="96"
      @close="closeDiffReviewContextMenu"
      @select="onDiffReviewContextMenuSelect"
    />
    <ReaderImageLightbox v-model="imageLightboxSrc" />
  </main>
</template>

<style scoped>
.content {
  height: 100%;
  background-color: var(--reader-bg);
  overflow: hidden;
  min-height: 0;
  user-select: text;
}

.editorShell {
  position: relative;
  z-index: 1;
  height: 100%;
  width: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/** 左右边距：收窄 Monaco 宿主，换行随 automaticLayout 变窄 */
.content.content--hInset .editorShell {
  padding-left: var(--reader-h-inset);
  padding-right: var(--reader-h-inset);
  box-sizing: border-box;
}

/*
 * 窗口模式：竖条/概览尺/小地图 fixed 到阅读窗格右缘（全屏仍走 appShell 的 right:0）。
 * 勿用负 right 伸出：会被 Monaco overflow-guard 裁掉导致「滚动条消失」。
 */
.content.content--hInsetWindowPin {
  --txtr-window-scrollbar-size: 14px;
}

.content.content--hInsetWindowPin
  .editorHost:not(.editorHost--diff)
  :deep(.monaco-editor .monaco-scrollable-element > .scrollbar.vertical),
.content.content--hInsetWindowPin
  .editorHost:not(.editorHost--diff)
  :deep(.monaco-editor .decorationsOverviewRuler) {
  position: fixed !important;
  left: auto !important;
  right: var(--reader-sb-right, 0px) !important;
  top: var(--reader-sb-top, 0px) !important;
  height: var(--reader-sb-height, 100%) !important;
}

.content.content--hInsetWindowPin.content--readerEditMinimap
  .editorHost:not(.editorHost--diff)
  :deep(.monaco-editor .minimap) {
  position: fixed !important;
  left: auto !important;
  right: calc(
    var(--reader-sb-right, 0px) + var(--txtr-window-scrollbar-size)
  ) !important;
  top: var(--reader-sb-top, 0px) !important;
  height: var(--reader-sb-height, 100%) !important;
  z-index: 9;
}

.editorShell--smartFormatReview .editorHost--diff {
  flex: 1;
  min-height: 0;
}

.editorHost--hidden {
  display: none !important;
}

.editorHost--diff :deep(.monaco-diff-editor),
.editorHost--diff :deep(.monaco-editor) {
  height: 100%;
}

.voiceReadScrollBlocker {
  position: absolute;
  inset: 0;
  z-index: 50;
  cursor: default;
}

.editorHost {
  /* 查找栏 tooltip 走 Monaco ContextView（position:absolute 挂在本节点）。
   * 须自己形成定位包含块，否则会落到带左右 padding 的 .editorShell 上，tips 偏左。 */
  position: relative;
  flex: 1;
  min-height: 0;
  width: 100%;
  overflow: hidden;
  user-select: text;
  background-color: transparent;
}

.hlFloatRoot {
  position: fixed;
  inset: 0;
  pointer-events: none;
}

:deep(.monaco-editor),
:deep(.monaco-editor *) {
  user-select: text;
}

/*
 * 只读正文由 Monaco 画 `.selected-text`。上面这条 `* { user-select: text }`
 * 会让 Chromium 再叠一层原生 `::selection`；大行高中文经常只剩选区顶/底一条细线。
 * 编辑模式走 EditContext，不会在 view-lines 上画原生选区。
 */
.content:not(.content--readerEdit) :deep(.monaco-editor .view-lines),
.content:not(.content--readerEdit) :deep(.monaco-editor .view-lines *) {
  user-select: none;
  -webkit-user-select: none;
}
.content:not(.content--readerEdit) :deep(.monaco-editor .view-lines ::selection),
.content:not(.content--readerEdit) :deep(.monaco-editor .view-lines *::selection) {
  background: transparent !important;
  color: inherit !important;
}

.content.content--clickMode:not(.content--readerEdit) .editorHost,
.content.content--clickMode:not(.content--readerEdit) .editorShell,
.content.content--clickMode:not(.content--readerEdit)
  :deep(.monaco-editor .monaco-mouse-cursor-text),
.content.content--clickMode:not(.content--readerEdit)
  :deep(.monaco-editor .view-lines),
.content.content--clickMode:not(.content--readerEdit)
  :deep(.monaco-editor .view-lines *) {
  user-select: none;
  -webkit-user-select: none;
  cursor: default;
}

.content.content--clickMode:not(.content--readerEdit)
  :deep(.monaco-editor .view-lines .readerEbookInternalLink),
.content.content--clickMode:not(.content--readerEdit)
  :deep(.monaco-editor .view-lines .readerEbookExternalLink) {
  cursor: pointer;
}

/* 查找栏计数/按钮不可拖选；搜索框仍可选中（须高于上一则 universal 选择器） */
:deep(.monaco-editor .find-widget),
:deep(.monaco-editor .find-widget *) {
  user-select: none;
  -webkit-user-select: none;
}

:deep(.monaco-editor .find-widget input),
:deep(.monaco-editor .find-widget textarea),
:deep(.monaco-editor .find-widget .monaco-inputbox),
:deep(.monaco-editor .find-widget .monaco-inputbox .input),
:deep(.monaco-editor .find-widget .monaco-findInput .input) {
  user-select: text;
  -webkit-user-select: text;
}

/* 仅只读：隐藏文本光标（与 cursorWidth:0 配合）；编辑模式交给 Monaco 默认绘制 */
.content:not(.content--readerEdit) :deep(.monaco-editor .cursor) {
  display: none !important;
}

/* 只读/编辑都不用「当前词」高亮：无空格中文会被当成整段词铺底 */
:deep(.monaco-editor .wordHighlight),
:deep(.monaco-editor .wordHighlightStrong) {
  background: transparent !important;
}

/* 仅只读：打开自定义右键菜单时编辑器会失去 .focused，统一为活动选区背景 */
.content:not(.content--readerEdit) :deep(.monaco-editor .selected-text) {
  background-color: var(--vscode-editor-selectionBackground) !important;
}

/* 仅只读：去掉顶缘滚动阴影 */
.content:not(.content--readerEdit) :deep(.monaco-editor .scroll-decoration) {
  box-shadow: none !important;
  display: none !important;
}

/* 与 chapterStickyScroll.CHAPTER_TITLE_LINE_CLASS（chapterTitleLine）一致 */
:deep(.monaco-editor .chapterTitleLine) {
  color: var(--reader-chapter-title) !important;
  /* 勿用 transform:scale 配合大字号：缩放不占布局宽，行尾脚注图标会被挤到右侧 */
  font-size: 1.2em !important;
}
:deep(.monaco-editor .chapterTitleLine.readerEbookLinkIcon),
:deep(.monaco-editor .readerEbookLinkIcon.chapterTitleLine) {
  color: transparent !important;
  font-size: 1em !important;
}
/* 章节标题行内文字链接：须压过上行 .chapterTitleLine 的 color !important */
:deep(.monaco-editor .chapterTitleLine.readerEbookInternalLink),
:deep(.monaco-editor .readerEbookInternalLink.chapterTitleLine),
:deep(.monaco-editor .chapterTitleLine.readerEbookExternalLink),
:deep(.monaco-editor .readerEbookExternalLink.chapterTitleLine) {
  color: var(--reader-ebook-link-color) !important;
}
:deep(.monaco-editor .chapterTitleLine.readerEbookInternalLink:hover),
:deep(.monaco-editor .readerEbookInternalLink.chapterTitleLine:hover),
:deep(.monaco-editor .chapterTitleLine.readerEbookExternalLink:hover),
:deep(.monaco-editor .readerEbookExternalLink.chapterTitleLine:hover) {
  color: var(--reader-ebook-link-color) !important;
}
</style>

<style>
html.colortxtClickModeDragging,
html.colortxtClickModeDragging * {
  cursor: grabbing !important;
}
</style>
