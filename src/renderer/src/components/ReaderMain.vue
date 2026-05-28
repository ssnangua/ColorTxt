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
import kingHwaFontUrl from "../assets/KingHwa_OldSong1.0.ttf?url";
import {
  type ChapterStickyLine,
  ensureStickyChapterBarClickDisabled,
  registerChapterStickyScrollProviders,
} from "../monaco/chapterStickyScroll";
import {
  buildChapterMinimapSectionHeaderDecorations,
  buildChapterTitleDecorations,
  getReaderMinimapCursorLineDecorColor,
  setReaderSyntaxHighlightEnabled,
} from "../monaco/readerInlineDecorations";
import { useReaderInlineSearch } from "../composables/useReaderInlineSearch";
import {
  replaceImgAnchorLinesWithViewZones,
  removeViewZonesById,
  type ReplaceImgAnchorsResult,
} from "../monaco/readerImageViewZones";
import { expandMarkdownImagesInPlainText } from "../markdown/markdownImages";
import { formatMarkdownHeadingLineForDisplay } from "../markdown/markdownChapter";
import {
  READER_EDITOR_DEFAULT_FONT_FAMILY,
  READER_EDITOR_DEFAULT_FONT_SIZE,
  buildReaderEditorCreateOptions,
  buildReaderEditorFontSizeUpdate,
  buildReaderEditorLineHeightUpdate,
  buildReaderMonacoModeEditorOptions,
  buildReaderOverviewRulerBorder,
} from "../monaco/readerEditorOptions";
import {
  createTxtrTextMonarchLanguage,
  type TxtrMonarchHighlightOptions,
} from "../monaco/txtrTextMonarch";
import { installReaderScrollKeyHandler } from "../monaco/readerKeyScroll";
import {
  applyLeadIndentFullWidth,
  chapterTitleForDisplay,
  leadingWhitespaceColumnCount,
} from "../chapter";
import {
  formatPhysicalPlainTextForReader,
  type ReaderDisplayFormatOptions,
} from "../reader/readerDisplayPipeline";
import { isMarkdownFilePath } from "../ebook/ebookFormat";
import {
  captureReaderViewportRestoreAnchor,
  computeScrollTopForReaderViewportRestoreAnchor,
  resolveDisplayLineForViewportRestore,
  type ReaderViewportRestoreAnchor,
} from "../reader/readerViewportAnchor";
import AppContextMenu from "./AppContextMenu.vue";
import ReaderHighlightFloat from "./ReaderHighlightFloat.vue";
import ReaderImageLightbox from "./ReaderImageLightbox.vue";
import VoiceReadResumeGuide from "./VoiceReadResumeGuide.vue";
import "./readerMainMonaco.css";
import { getSelectionEndViewportAnchor } from "../reader/readerHighlightGeometry";
import {
  positionFromClientPoint,
  clientXWithinSingleLineModelRange,
} from "../reader/readerEbookPointer";
import { lookupEbookAnchorPhysicalLine } from "../reader/ebookAnchorLookup";
import {
  defaultChapterMinCharCount,
  defaultCompressBlankLines,
  defaultMonacoAdvancedWrapping,
  defaultMonacoCustomHighlight,
  defaultMonacoSmoothScrolling,
  defaultReaderEditShowLineNumbers,
  defaultReaderEditMinimap,
  defaultTxtrDelimitedMatchCrossLine,
  defaultReaderLineHeightMultiple,
  defaultReaderPaletteDark,
  defaultReaderPaletteLight,
  type ReaderSurfacePalette,
} from "../constants/appUi";
import { DEFAULT_HIGHLIGHT_COLORS_LIGHT } from "../constants/highlightColors";
import type { HighlightWordsByIndex } from "../stores/fileMetaStore";
import { floorReadingPercentFromScrollRatio } from "../utils/format";
import {
  hasEscBeforeModalLayers,
  hasModalOnStack,
  READER_HL_FLOAT_ROOT_Z_INDEX,
  subscribeModalStackChange,
} from "../utils/modalStack";
import { stripEbookIdAndAMarkersFromText } from "../ebook/ebookInternalLinkMarkers";
import { appAlert } from "../services/appDialog";

/** 与 `READER_HL_FLOAT_ROOT_Z_INDEX` 同步；低于 `AppModal` 蒙层（6000） */
const HL_FLOAT_Z_INDEX = READER_HL_FLOAT_ROOT_Z_INDEX;

const editorEl = ref<HTMLDivElement | null>(null);
const editorContextMenuOpen = ref(false);
const editorContextMenuX = ref(0);
const editorContextMenuY = ref(0);
/** 打开自定义复制菜单时固化的选区（右键在选区外时 Monaco 会先清选区，不能再依赖 getSelection） */
const editorContextMenuCopyRange = shallowRef<monaco.Range | null>(null);

const EDITOR_CONTEXT_MENU_ITEMS = [{ id: "copy", label: "复制" }] as const;
const editor = shallowRef<monaco.editor.IStandaloneCodeEditor | null>(null);
const model = shallowRef<monaco.editor.ITextModel | null>(null);
/** 章节标题行内装饰（`buildChapterTitleDecorations` / `inlineClassName` 着色）；与 View Zone 留白无关 */
const chapterTitleDecorationsCollection =
  shallowRef<monaco.editor.IEditorDecorationsCollection | null>(null);
const inlineSearchDecorationsCollection =
  shallowRef<monaco.editor.IEditorDecorationsCollection | null>(null);
const voiceReadDecorationsCollection =
  shallowRef<monaco.editor.IEditorDecorationsCollection | null>(null);
/** 编辑态小地图：无选区时为当前行铺灰底（与蓝色选区区分） */
const minimapCursorLineDecorationsCollection =
  shallowRef<monaco.editor.IEditorDecorationsCollection | null>(null);
/** 编辑态小地图：章节标题（Monaco sectionHeaderText） */
const chapterMinimapDecorationsCollection =
  shallowRef<monaco.editor.IEditorDecorationsCollection | null>(null);
/** 朗读高亮行（供上一行/下一行以「正在播的行」为锚点） */
const voiceReadHighlightLine = ref<number | null>(null);
const hlTipVisible = ref(false);
const hlPickerVisible = ref(false);
const hlFloatTop = ref(0);
const hlFloatLeft = ref(0);
const hlPickerTop = ref(0);
const hlPickerLeft = ref(0);
const hlDraftText = ref("");
const hlFloatRootRef = ref<HTMLElement | null>(null);
const imageLightboxSrc = ref("");
const imageViewZoneIds = ref<string[]>([]);
/** 滚动时与 View Zone 合成对齐：取消未执行的 rAF，避免 dispose 后仍 render */
let imageViewZoneScrollRenderRaf: number | null = null;
/** 电子书内链装饰 id（`deltaDecorations` 返回） */
let ebookInternalLinkDecorationIds: string[] = [];
/** 锚点 id → 物理行（strip 后、与正文行号一致） */
const ebookAnchorIdToPhysicalLine = shallowRef<Map<string, number>>(new Map());
/** 行首起经多段 `<<A:…>>`（中间可夹任意字符）收集的链内文案；重建章节时若标题以前缀命中则跳过 */
const ebookLeadingLinkLabelsByDisplayLine = shallowRef<
  ReadonlyMap<number, readonly string[]>
>(new Map());
type EbookLinkHit = { range: monaco.Range; targetId: string };
const ebookInternalLinkHits = shallowRef<EbookLinkHit[]>([]);
/** 选区靠近阅读区上缘时为 true：笔尖与色盘改为在选区下方展开 */
const hlFloatOpenDownward = ref(false);

const voiceReadScrollLocked = computed(
  () => props.voiceReadScrollLocked === true,
);

let removeHlGlobalListeners: (() => void) | null = null;
let unsubModalStack: (() => void) | null = null;
let removeVoiceReadKeyCapture: (() => void) | null = null;
const builtInThemes = new Set(["vs", "vs-dark"]);
/** 行高 = round(fontSize * multiple)，由 App 持久化并同步 */
let lineHeightMultiple = defaultReaderLineHeightMultiple;
let currentFontFamily = READER_EDITOR_DEFAULT_FONT_FAMILY;

let chaptersSnapshot: ChapterStickyLine[] = [];
/** `registerChapterStickyScrollProviders` 注入后赋值；`setChapters` 末尾触发折叠失效以刷新粘性条 */
let notifyChapterStickyFoldingRanges: (() => void) | null = null;

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
    /** 为 true 时由数据层压缩空行并标准化章节留白（标题下 1 行；标题上 1 或 2 行取决于「保留一个空行」） */
    compressBlankLines?: boolean;
    /** Monaco 高级换行策略（wrappingStrategy: advanced） */
    monacoAdvancedWrapping?: boolean;
    /** Monaco 平滑滚动（滚轮、revealLine、setScrollTop 等） */
    monacoSmoothScrolling?: boolean;
    /** 编辑模式下是否显示行号（只读模式始终关闭） */
    readerEditShowLineNumbers?: boolean;
    readerEditMinimap?: boolean;
    /** 主进程流式读盘期间为 true；关闭 sticky 避免旧文件黏性标题在加载全程残留 */
    streamLoading?: boolean;
    /** 合并用户覆盖后的阅读器表面色（亮色 / 暗色） */
    readerSurfaceLight?: ReaderSurfacePalette;
    readerSurfaceDark?: ReaderSurfacePalette;
    /** 当前主题下的高亮色列表（与设置中亮/暗数组之一对应） */
    highlightColors?: string[];
    /** 当前打开文件的自定义高亮词（来自 file.meta） */
    highlightWordsByIndex?: HighlightWordsByIndex;
    /** 全局自定义高亮词（来自 settings，所有文件匹配） */
    globalHighlightWords?: HighlightWordsByIndex;
    /** 已打开文件路径；为空时不显示选区高亮入口 */
    readerFilePath?: string | null;
    /** 电子书 `<<ID>>` / `<<A>>`：物理行号 → Monaco 显示行（与流式滤空一致） */
    ebookAnchorPhysicalToDisplay?: (physicalLine: number) => number;
    /**
     * 压缩空行时：`stripEbook…` 按 Monaco 行序记的「行号」实为显示行，需先映回源物理行再与 `ebookAnchorPhysicalToDisplay` 配对。
     */
    ebookDisplayLineToPhysical?: (displayLine: number) => number;
    /** 在**打开**查找栏（非关闭）之前调用，例如自动点亮书钉 */
    beforeRevealFindWidget?: () => void;
    /** 语音朗读播放中：禁止打开查找栏 */
    voiceReadBlocksFind?: boolean;
    /** 语音朗读播放中：禁止用户滚动（遮罩 + 滚轮拦截） */
    voiceReadScrollLocked?: boolean;
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
  }>(),
  {
    monacoCustomHighlight: defaultMonacoCustomHighlight,
    txtrDelimitedMatchCrossLine: defaultTxtrDelimitedMatchCrossLine,
    compressBlankLines: defaultCompressBlankLines,
    monacoAdvancedWrapping: defaultMonacoAdvancedWrapping,
    monacoSmoothScrolling: defaultMonacoSmoothScrolling,
    readerEditShowLineNumbers: defaultReaderEditShowLineNumbers,
    readerEditMinimap: defaultReaderEditMinimap,
    streamLoading: false,
    readerSurfaceLight: () => ({ ...defaultReaderPaletteLight }),
    readerSurfaceDark: () => ({ ...defaultReaderPaletteDark }),
    highlightColors: () => [...DEFAULT_HIGHLIGHT_COLORS_LIGHT],
    highlightWordsByIndex: undefined,
    globalHighlightWords: undefined,
    readerFilePath: null,
    ebookAnchorPhysicalToDisplay: undefined,
    ebookDisplayLineToPhysical: undefined,
    beforeRevealFindWidget: undefined,
    voiceReadBlocksFind: false,
    voiceReadScrollLocked: false,
    voiceReadPaused: false,
    readerEditMode: false,
    readerEditRestoreAnchor: null,
    physicalReaderPath: null,
    chapterMinCharCount: defaultChapterMinCharCount,
    readerFullscreen: false,
  },
);

const emit = defineEmits<{
  probeLineChange: [probeLine: number, fromScroll?: boolean];
  viewportTopLineChange: [lineNumber: number];
  viewportEndLineChange: [lineNumber: number];
  viewportVisualProgressChange: [percent: number, atBottom: boolean];
  addHighlightTerm: [payload: { text: string; colorIndex: number }];
  removeHighlightTerm: [payload: { text: string }];
  readerEditDirtyChange: [dirty: boolean];
  readerEditContentChange: [];
  readerEditLoaded: [payload: { encoding: string }];
  readerEditLoadFailed: [];
  readerEditSaveRequest: [];
  voiceReadResume: [];
}>();

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

function captureViewportRestoreAnchor(): ReaderViewportRestoreAnchor | null {
  const e = editor.value;
  const m = model.value;
  if (!e || !m) return null;
  return captureReaderViewportRestoreAnchor(e, m, resolveDisplayLineToPhysical);
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

function readerFormatOptions(
  overrides: Partial<ReaderDisplayFormatOptions> = {},
): ReaderDisplayFormatOptions {
  const isMarkdown = readerFileIsMarkdown();
  return {
    compressBlankLines: false,
    compressBlankKeepOneBlank: false,
    leadIndentFullWidth: false,
    minCharCount: props.chapterMinCharCount,
    isMarkdown,
    preserveMarkdownSourceLines: props.readerEditMode && isMarkdown,
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

async function applyEditFormatCompressBlankLines(
  keepOneBlank: boolean,
): Promise<boolean> {
  return applyEditFormat((plain) =>
    formatPhysicalPlainTextForReader(
      plain,
      readerFormatOptions({
        compressBlankLines: true,
        compressBlankKeepOneBlank: keepOneBlank,
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

const HL_TIP_H = 36;
const HL_FLOAT_GAP = 4;
const HL_READER_EDGE = 10;

function getReaderSelectionEndAnchor() {
  const e = editor.value;
  const m = model.value;
  if (!e || !m) return null;
  return getSelectionEndViewportAnchor(e, m);
}

/**
 * 根据阅读区上缘空间决定向上或向下展开，并写入 `hlFloatTop` / `hlPickerTop`。
 * `reserveSpaceForPicker`：仅展示笔尖时为 false，避免为色盘预留高度而把笔尖误摆到下方；打开色盘时为 true。
 */
function applyHighlightVerticalPlacement(
  anchor: {
    anchorTop: number;
    lineBottom: number;
  },
  opts?: { reserveSpaceForPicker?: boolean },
): void {
  const reservePicker = opts?.reserveSpaceForPicker ?? true;
  const dom = editor.value?.getDomNode();
  if (!dom) return;
  const er = dom.getBoundingClientRect();

  // 总共有多少行色块
  const totalRows = Math.ceil(props.highlightColors.length / 5);
  /** 色盘在「向上」模式时占用高度（用于判断是否顶到阅读区上缘） */
  const hlPanelEstHeightUp =
    /* padding */ 20 +
    /* color swatch width */ totalRows * 26 +
    /* color swatch gap */ (totalRows - 1) * 8 +
    /* remove row + gap */ (hlPickerShowRemoveRow.value ? 26 + 10 : 0);
  const tipTopIfUp = anchor.anchorTop - HL_TIP_H - HL_FLOAT_GAP;
  const cantFitTipUp = tipTopIfUp < er.top + HL_READER_EDGE;
  const cantFitPanelUp =
    anchor.anchorTop - hlPanelEstHeightUp < er.top + HL_READER_EDGE;
  hlFloatOpenDownward.value = cantFitTipUp || (reservePicker && cantFitPanelUp);

  if (hlFloatOpenDownward.value) {
    const below = anchor.lineBottom + HL_FLOAT_GAP;
    hlFloatTop.value = Math.min(
      Math.max(below, er.top + HL_READER_EDGE),
      window.innerHeight - HL_TIP_H - 6,
    );
    hlPickerTop.value = Math.max(below, er.top + HL_READER_EDGE);
  } else {
    hlFloatTop.value = Math.max(
      er.top + HL_READER_EDGE,
      anchor.anchorTop - HL_TIP_H - HL_FLOAT_GAP,
    );
    hlPickerTop.value = Math.max(6, anchor.anchorTop - 6);
  }
}

function findStoredHighlightColorIndex(term: string): number | null {
  const map = props.highlightWordsByIndex;
  if (!map || !term) return null;
  for (const [k, words] of Object.entries(map)) {
    if (words.some((w) => w === term)) {
      const idx = Number.parseInt(k, 10);
      if (Number.isFinite(idx) && idx >= 0) return idx;
    }
  }
  return null;
}

const hlPickerExistingColorIndex = computed(() => {
  if (!hlPickerVisible.value) return null;
  return findStoredHighlightColorIndex(hlDraftText.value.trim());
});

const hlPickerShowRemoveRow = computed(
  () => hlPickerExistingColorIndex.value !== null,
);

function getTxtrMonarchHighlightOptions(): TxtrMonarchHighlightOptions {
  /** 全局高亮词开关关闭时，不使用全局高亮词 */
  const globalWords = props.monacoCustomHighlight
    ? props.globalHighlightWords
    : undefined;
  /** 合并全局高亮词与文件级高亮词：全局词优先（全局词在同色索引下先去重） */
  const merged = mergeHighlightWords(
    globalWords,
    props.highlightWordsByIndex,
  );
  return {
    enabled: props.monacoCustomHighlight,
    highlightColorsLength: props.highlightColors.length,
    highlightWordsByIndex: merged,
  };
}

/** 合并全局与文件级高亮词：同名词在冲突时保留文件级（更具体） */
function mergeHighlightWords(
  globalWords: HighlightWordsByIndex | undefined,
  fileWords: HighlightWordsByIndex | undefined,
): HighlightWordsByIndex | undefined {
  if (!globalWords && !fileWords) return undefined;
  if (!globalWords) return fileWords;
  if (!fileWords) return globalWords;
  const merged: HighlightWordsByIndex = { ...globalWords };
  for (const [idx, words] of Object.entries(fileWords)) {
    const existing = merged[idx] ? [...merged[idx]!] : [];
    const set = new Set(existing);
    for (const w of words) {
      if (!set.has(w)) {
        set.add(w);
        existing.push(w);
      }
    }
    merged[idx] = existing;
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

/** 高亮词或开关变化时更新 Monarch；会触发 TokenizationRegistry 失效并重算 token */
function applyTxtrMonarchTokenizer() {
  monaco.languages.setMonarchTokensProvider(
    languageId,
    createTxtrTextMonarchLanguage(
      getTxtrMonarchHighlightOptions(),
      props.txtrDelimitedMatchCrossLine,
    ),
  );
}

function closeHighlightFloatUi() {
  hlTipVisible.value = false;
  hlPickerVisible.value = false;
  hlDraftText.value = "";
}

/** 设为/取消高亮词后：取消选区，光标落在原选区几何末端 */
function collapseMonacoSelectionToHighlightEnd() {
  const e = editor.value;
  if (!e) return;
  const sel = e.getSelection();
  if (!sel || sel.isEmpty()) return;
  const end = sel.getEndPosition();
  e.setSelection(monaco.Selection.fromPositions(end, end));
  e.focus();
}

/** 笔尖右缘与选区右缘对齐；仅按笔尖宽度夹紧视口，不因色盘宽度左移笔尖 */
function placeHighlightFloatHorizontal(anchor: {
  selectionRightX: number;
}): void {
  const tipW = 36;
  // 每行最多显示 5 个色块
  const colorsPerRow = Math.min(5, props.highlightColors.length);
  const panelReserve =
    /* padding */ 24 +
    /* color swatch width */ colorsPerRow * 26 +
    /* color swatch gap */ (colorsPerRow - 1) * 8;
  const leftRaw = anchor.selectionRightX - tipW;
  hlFloatLeft.value = Math.max(
    6,
    Math.min(leftRaw, window.innerWidth - tipW - 6),
  );
  hlPickerLeft.value = Math.max(
    6,
    Math.min(leftRaw, window.innerWidth - panelReserve - 6),
  );
}

function updateHighlightTipFromSelection() {
  if (!props.monacoCustomHighlight) {
    closeHighlightFloatUi();
    return;
  }
  const e = editor.value;
  if (!e || !props.readerFilePath) {
    closeHighlightFloatUi();
    return;
  }
  const m = model.value;
  if (!m) {
    closeHighlightFloatUi();
    return;
  }
  const sel = e.getSelection();
  if (!sel || sel.isEmpty()) {
    closeHighlightFloatUi();
    return;
  }
  const raw = m.getValueInRange(sel);
  const trimmed = raw.trim();
  if (!trimmed) {
    closeHighlightFloatUi();
    return;
  }
  if (hlPickerVisible.value && trimmed !== hlDraftText.value.trim()) {
    closeHighlightFloatUi();
    return;
  }
  const anchor = getReaderSelectionEndAnchor();
  if (!anchor) {
    closeHighlightFloatUi();
    return;
  }
  placeHighlightFloatHorizontal(anchor);
  if (hlPickerVisible.value) {
    applyHighlightVerticalPlacement(anchor, { reserveSpaceForPicker: true });
    return;
  }
  applyHighlightVerticalPlacement(anchor, { reserveSpaceForPicker: false });
  hlTipVisible.value = true;
}

function openHighlightPicker(ev: PointerEvent) {
  ev.preventDefault();
  ev.stopPropagation();
  if (!props.monacoCustomHighlight) return;
  const e = editor.value;
  const m = model.value;
  if (!e || !m || !props.readerFilePath) return;
  const sel = e.getSelection();
  if (!sel || sel.isEmpty()) return;
  const text = m.getValueInRange(sel).trim();
  if (!text) return;
  hlDraftText.value = text;
  hlTipVisible.value = false;
  hlPickerVisible.value = true;
  const anchor = getReaderSelectionEndAnchor();
  if (!anchor) return;
  placeHighlightFloatHorizontal(anchor);
  applyHighlightVerticalPlacement(anchor, { reserveSpaceForPicker: true });
}

function removeHighlightKeywordFromPicker() {
  const t = hlDraftText.value.trim();
  if (!t) {
    closeHighlightFloatUi();
    return;
  }
  emit("removeHighlightTerm", { text: t });
  collapseMonacoSelectionToHighlightEnd();
  closeHighlightFloatUi();
}

function confirmHighlightColor(colorIndex: number) {
  if (
    colorIndex < 0 ||
    colorIndex >= props.highlightColors.length ||
    !Number.isFinite(colorIndex)
  ) {
    closeHighlightFloatUi();
    return;
  }
  const t = hlDraftText.value.trim();
  if (!t) {
    closeHighlightFloatUi();
    return;
  }
  emit("addHighlightTerm", { text: t, colorIndex });
  collapseMonacoSelectionToHighlightEnd();
  closeHighlightFloatUi();
}

watch(
  () => props.highlightColors,
  () => {
    applyReaderSyntaxFromProps();
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
  () => props.globalHighlightWords,
  () => {
    applyTxtrMonarchTokenizer();
  },
  { deep: true },
);

watch([hlTipVisible, hlPickerVisible], () => {
  removeHlGlobalListeners?.();
  removeHlGlobalListeners = null;
  if (!hlTipVisible.value && !hlPickerVisible.value) return;
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === "Escape") closeHighlightFloatUi();
  };
  const onPtr = (ev: PointerEvent) => {
    const t = ev.target as Node | null;
    if (!t) return;
    const root = hlFloatRootRef.value;
    const ed = editor.value?.getDomNode();
    if (root?.contains(t)) return;
    // 点在编辑器内不关；点顶栏/侧栏/底栏等外面关
    if (ed?.contains(t)) return;
    closeHighlightFloatUi();
  };
  document.addEventListener("keydown", onKey, true);
  document.addEventListener("pointerdown", onPtr, true);
  removeHlGlobalListeners = () => {
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("pointerdown", onPtr, true);
  };
});

watch(
  () => props.monacoAdvancedWrapping,
  (advanced) => {
    setWrappingStrategyAdvanced(advanced);
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

function syncStickyScrollToStreamState() {
  const ed = editor.value;
  if (!ed) return;
  ed.updateOptions({
    stickyScroll: { enabled: !props.streamLoading },
  });
}

watch(
  () => props.streamLoading,
  () => {
    syncStickyScrollToStreamState();
  },
);

/** 程序性滚动（跳转、复位等）期间，onDidScrollChange 仍触发，但不视为用户阅读滚动 */
let programmaticScrollDepth = 0;
/** 程序化改选区后的短时间抑制：避免搜索跳转触发笔尖提示。 */
let suppressHighlightTipUntilMs = 0;

function beginProgrammaticScroll() {
  programmaticScrollDepth++;
  window.setTimeout(() => {
    programmaticScrollDepth = Math.max(0, programmaticScrollDepth - 1);
  }, 500);
}

/** 与设置「平滑滚动」一致：关闭时一律立即滚动 */
function monacoScrollType(wantSmooth: boolean): monaco.editor.ScrollType {
  return wantSmooth && props.monacoSmoothScrolling
    ? monaco.editor.ScrollType.Smooth
    : monaco.editor.ScrollType.Immediate;
}

/** App 传入的主题名（vs / vs-dark），用于切换语法着色后重设 Monaco 主题 */
let lastAppThemeName = "vs";

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
function setFullText(text: string) {
  streamCarriageReturnPending = false;
  const m = model.value;
  const e = editor.value;
  if (!m || !e) return;
  /** `setValue` 整文替换会使行内装饰失效；须使下次 `setChapters` 强制重建（仅切换行首缩进时行号不变） */
  lastChapterTitleDecorationsLineKey = "";
  m.setValue(text);
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

function disposeEbookInternalLinks() {
  const e = editor.value;
  if (e && ebookInternalLinkDecorationIds.length > 0) {
    e.deltaDecorations(ebookInternalLinkDecorationIds, []);
    ebookInternalLinkDecorationIds = [];
  }
  ebookInternalLinkHits.value = [];
  ebookAnchorIdToPhysicalLine.value = new Map();
  ebookLeadingLinkLabelsByDisplayLine.value = new Map();
}

function getEbookAnchorPhysicalLine(targetId: string): number | undefined {
  return lookupEbookAnchorPhysicalLine(
    ebookAnchorIdToPhysicalLine.value,
    targetId,
  );
}

function getEbookLeadingLinkLabelsByDisplayLine(): ReadonlyMap<
  number,
  readonly string[]
> {
  return ebookLeadingLinkLabelsByDisplayLine.value;
}

function tryJumpEbookInternalLinkFromPoint(
  clientX: number,
  clientY: number,
): boolean {
  const ed = editor.value;
  const m = model.value;
  if (!ed || !m || ebookInternalLinkHits.value.length === 0) return false;
  const pos = positionFromClientPoint(ed, clientX, clientY);
  if (!pos) return false;
  const mapPhys =
    props.ebookAnchorPhysicalToDisplay ?? ((n: number) => Math.max(1, n));
  for (const h of ebookInternalLinkHits.value) {
    if (!h.range.containsPosition(pos)) continue;
    if (!clientXWithinSingleLineModelRange(ed, m, h.range, clientX)) continue;
    const phys = getEbookAnchorPhysicalLine(h.targetId);
    if (phys == null) continue;
    beginProgrammaticScroll();
    jumpToBookmarkLine(mapPhys(phys), true);
    return true;
  }
  return false;
}

/**
 * 在插图 Zone 处理之后调用：去掉 `<<ID:…>>`、将 `<<A:…|…>>` 换为可见文案并加下划线。
 * 内链装饰范围用 strip 给出的**显示行**（与 Monaco 行号一致）；跳转目标 id 在压缩空行时已映为源物理行，点击时用 `ebookAnchorPhysicalToDisplay` 再映回显示行。
 * 必须用按行 `applyEdits` 而非 `setValue`：整文替换会破坏已插入的插图 View Zone 行号绑定（EPUB 含大量 `<<ID:…>>` 时尤甚）。
 */
function applyEbookInternalLinkMarkers() {
  disposeEbookInternalLinks();
  const e = editor.value;
  const m = model.value;
  if (!e || !m) return;
  const raw = m.getValue();
  if (!/<<(?:ID|A):/.test(raw)) return;
  beginProgrammaticScroll();
  const normalized = raw.replace(/\r\n/g, "\n");
  let {
    text,
    outLines,
    idToPhysicalLine,
    linkOccurrences,
    leadingEbookLinkLabelsByLine,
  } = stripEbookIdAndAMarkersFromText(normalized);
  ebookLeadingLinkLabelsByDisplayLine.value = leadingEbookLinkLabelsByLine;
  if (
    text === normalized &&
    idToPhysicalLine.size === 0 &&
    linkOccurrences.length === 0
  ) {
    return;
  }
  if (props.compressBlankLines) {
    const toPhys =
      props.ebookDisplayLineToPhysical ??
      ((n: number) => Math.max(1, Math.floor(n)));
    const idMap = new Map<string, number>();
    for (const [id, displayLine] of idToPhysicalLine) {
      idMap.set(id, toPhys(displayLine));
    }
    idToPhysicalLine = idMap;
  }
  const lc = m.getLineCount();
  const edits: monaco.editor.IIdentifiedSingleEditOperation[] = [];
  for (let lineNumber = 1; lineNumber <= lc; lineNumber++) {
    const i = lineNumber - 1;
    const nextLine = outLines[i];
    if (nextLine === undefined) break;
    if (m.getLineContent(lineNumber) !== nextLine) {
      edits.push({
        range: new monaco.Range(
          lineNumber,
          1,
          lineNumber,
          m.getLineMaxColumn(lineNumber),
        ),
        text: nextLine,
      });
    }
  }
  if (edits.length > 0) {
    m.applyEdits(edits);
  }
  ebookAnchorIdToPhysicalLine.value = idToPhysicalLine;
  const decs: monaco.editor.IModelDeltaDecoration[] = [];
  const hits: EbookLinkHit[] = [];
  const lineCount = Math.max(1, m.getLineCount());
  for (const occ of linkOccurrences) {
    const dl = Math.min(lineCount, Math.max(1, occ.physicalLine));
    const r = new monaco.Range(dl, occ.startColumn, dl, occ.endColumnExclusive);
    decs.push({
      range: r,
      options: {
        inlineClassName: "readerEbookInternalLink",
        hoverMessage: { value: "内部跳转" },
      },
    });
    hits.push({ range: r, targetId: occ.targetId });
  }
  ebookInternalLinkHits.value = hits;
  ebookInternalLinkDecorationIds = e.deltaDecorations([], decs);
}

function expandMarkdownImagesInModel(mdFileAbsPath: string | null): void {
  const p = mdFileAbsPath?.trim();
  if (!p || props.readerEditMode) return;
  const m = model.value;
  if (!m) return;
  const text = m.getValue();
  const expanded = expandMarkdownImagesInPlainText(text, p);
  if (expanded !== text) {
    m.setValue(expanded);
  }
}

async function applyEmbeddedImageAnchors(
  convertedTxtAbsPath: string | null,
): Promise<ReplaceImgAnchorsResult> {
  disposeImageViewZones();
  imageLightboxSrc.value = "";
  const p = convertedTxtAbsPath?.trim();
  if (!p) return { zoneIds: [], deletedOriginalLineNumbersDesc: [] };
  const e = editor.value;
  if (!e) return { zoneIds: [], deletedOriginalLineNumbersDesc: [] };
  const result = await replaceImgAnchorLinesWithViewZones(monaco, e, p, {
    zoneHeightPx: 100,
  });
  imageViewZoneIds.value = result.zoneIds;
  return result;
}

function clear(opts?: ReaderClearOptions) {
  disposeEbookInternalLinks();
  disposeImageViewZones();
  imageLightboxSrc.value = "";
  streamCarriageReturnPending = false;
  lastChapterTitleDecorationsLineKey = "";
  chaptersSnapshot = [];

  const e = editor.value;
  const prevModel = model.value;
  chapterTitleDecorationsCollection.value?.clear();
  inlineSearch.clearInlineSearchState();
  voiceReadDecorationsCollection.value?.clear();
  minimapCursorLineDecorationsCollection.value?.clear();
  chapterMinimapDecorationsCollection.value?.clear();

  e?.updateOptions({ stickyScroll: { enabled: false } });

  if (e && prevModel) {
    const next = monaco.editor.createModel("", languageId);
    e.setModel(next);
    prevModel.dispose();
    model.value = next;
    chapterTitleDecorationsCollection.value = e.createDecorationsCollection();
    inlineSearchDecorationsCollection.value = e.createDecorationsCollection();
    voiceReadDecorationsCollection.value = e.createDecorationsCollection();
    minimapCursorLineDecorationsCollection.value =
      e.createDecorationsCollection();
    chapterMinimapDecorationsCollection.value =
      e.createDecorationsCollection();
    e.setPosition({ lineNumber: 1, column: 1 });
    e.setScrollTop(0);
    e.layout();
  } else {
    prevModel?.setValue("");
  }

  if (!opts?.keepStickyHiddenForStream) {
    syncStickyScrollToStreamState();
  }
}

function setChapters(chapters: ChapterStickyLine[]) {
  const m = model.value;
  const collection = chapterTitleDecorationsCollection.value;
  if (!m || !collection) return;

  chaptersSnapshot = chapters
    .slice()
    .sort((a, b) => a.lineNumber - b.lineNumber)
    .map((c) => ({
      lineNumber: c.lineNumber,
      title: chapterTitleForDisplay(c.title),
    }));

  const maxLine = m.getLineCount();
  /** 编辑态仅同步章节元数据，勿 applyEdits 剥标题行首空白（会误触 dirty） */
  if (!props.readerEditMode) {
    const edits: monaco.editor.IIdentifiedSingleEditOperation[] = [];
    for (const ch of chaptersSnapshot) {
      const ln = ch.lineNumber;
      if (ln < 1 || ln > maxLine) continue;
      let line = m.getLineContent(ln);
      if (props.fileIsMarkdown) {
        const withoutMarkers = formatMarkdownHeadingLineForDisplay(line);
        if (withoutMarkers !== line) {
          edits.push({
            range: new monaco.Range(
              ln,
              1,
              ln,
              m.getLineMaxColumn(ln),
            ),
            text: withoutMarkers,
          });
          line = withoutMarkers;
        }
      }
      const n = leadingWhitespaceColumnCount(line);
      if (n > 0) {
        edits.push({
          range: new monaco.Range(ln, 1, ln, n + 1),
          text: "",
        });
      }
    }
    if (edits.length > 0) {
      m.applyEdits(edits);
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
    return;
  }
  syncChapterMinimapSectionHeaderDecorations();
  if (lineKey !== lastChapterTitleDecorationsLineKey) {
    collection.set(buildChapterTitleDecorations(monaco, m, chaptersSnapshot));
    lastChapterTitleDecorationsLineKey = lineKey;
  }
  notifyChapterStickyFoldingRanges?.();
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
  if (themeName === "vs") {
    monaco.editor.setTheme("vs");
  } else if (builtInThemes.has(themeName)) {
    monaco.editor.setTheme(themeName);
  } else {
    monaco.editor.setTheme("vs-dark");
  }
  forceOverviewRulerCanvasRepaint();
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

function setFontSize(fontSize: number) {
  const e = editor.value;
  if (!e) return;
  e.updateOptions(
    buildReaderEditorFontSizeUpdate({
      fontSize,
      lineHeightMultiple,
    }),
  );
}

function setLineHeightMultiple(multiple: number) {
  lineHeightMultiple = multiple;
  const e = editor.value;
  if (!e) return;
  const fontSize = e.getOption(monaco.editor.EditorOption.fontSize);
  e.updateOptions(
    buildReaderEditorLineHeightUpdate({
      fontSize,
      lineHeightMultiple,
    }),
  );
}

function setWrappingStrategyAdvanced(advanced: boolean) {
  editor.value?.updateOptions({
    wrappingStrategy: advanced ? "advanced" : "simple",
  });
}

function setFontFamily(fontFamily: string) {
  const e = editor.value;
  if (!e) return;

  currentFontFamily = fontFamily;
  e.updateOptions({ fontFamily: currentFontFamily });

  // Ensure KingHwa webfont is loaded before applying to avoid fallback flashes.
  if (currentFontFamily.includes("KingHwa OldSong")) {
    const fontSize = e.getOption(monaco.editor.EditorOption.fontSize);
    void document.fonts?.load(`${fontSize}px "KingHwa OldSong"`).then(() => {
      e.updateOptions({ fontFamily: currentFontFamily });
    });
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
  e.layout();
  e.setScrollTop(0, scrollType);
  e.setPosition({ lineNumber: 1, column: 1 });
  e.focus();
}

function jumpToLine(lineNumber: number, smooth = true) {
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
  const top = e.getTopForLineNumber(line);
  // 勿再减 lineHeight：否则视口顶行会变成 line-1，恢复阅读位置/章节跳转都会「回退一行」
  e.setScrollTop(Math.max(0, top), scrollType);
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

function suppressHighlightTipForProgrammaticSelection() {
  suppressHighlightTipUntilMs = Date.now() + 300;
  closeHighlightFloatUi();
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
 * 书签列表跳转：将目标行顶对齐视口顶后再向上偏移「一行高」像素，为黏性章节条留白；
 * 与物理行号 −1 不同，上一行若自动折行占多段高度时仍只减一行字高。
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
  const lineHeightPx = e.getOption(monaco.editor.EditorOption.lineHeight);
  e.layout();
  e.revealLineNearTop(line, scrollType);
  const top = e.getTopForLineNumber(line);
  e.setScrollTop(Math.max(0, top - lineHeightPx), scrollType);
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

/** 仅在右键落点落在当前选区内（或命中隐藏 textarea）时提供复制菜单，避免在选区外右键仍出现「复制」 */
function contextMenuTargetInSelection(
  mouseEv: monaco.editor.IEditorMouseEvent,
  sel: monaco.Selection,
): boolean {
  const t = mouseEv.target;
  if (t.type === monaco.editor.MouseTargetType.TEXTAREA) {
    return true;
  }
  if (
    t.type === monaco.editor.MouseTargetType.CONTENT_TEXT ||
    t.type === monaco.editor.MouseTargetType.CONTENT_EMPTY
  ) {
    const pos = t.position;
    return pos != null && sel.containsPosition(pos);
  }
  return false;
}

function closeEditorContextMenu() {
  editorContextMenuOpen.value = false;
  editorContextMenuCopyRange.value = null;
}

function onEditorContextMenuSelect(id: string) {
  const range = editorContextMenuCopyRange.value;
  closeEditorContextMenu();
  if (id !== "copy") return;
  const m = model.value;
  if (!m || !range || range.isEmpty()) return;
  const text = m.getValueInRange(range);
  if (!text) return;
  void navigator.clipboard.writeText(text);
}

const FIND_CONTROLLER_ID = "editor.contrib.findController";

function toggleFindWidget() {
  if (props.voiceReadBlocksFind) return;
  const e = editor.value;
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
    e.getAction("actions.find")?.run();
  }
}

function isFindWidgetRevealed(): boolean {
  const e = editor.value;
  if (!e) return false;
  const findCtrl = e.getContribution(FIND_CONTROLLER_ID) as {
    getState?: () => { isRevealed: boolean };
  } | null;
  return findCtrl?.getState?.().isRevealed === true;
}

/** 全屏顶栏收起等场景：仅当查找栏已显示时关闭，不打开查找栏 */
function closeFindWidgetIfRevealed() {
  const e = editor.value;
  if (!e) return;
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
  const e = editor.value;
  const term = raw.trim();
  if (!e || !term) return;

  props.beforeRevealFindWidget?.();

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
  const e = editor.value;
  if (!e) return;
  const ed = e as monaco.editor.IStandaloneCodeEditor & {
    delegateScrollFromMouseWheelEvent?(browserEvent: WheelEvent): void;
  };
  ed.delegateScrollFromMouseWheelEvent?.(ev);
}

function scrollByLineStep(direction: -1 | 1) {
  const e = editor.value;
  if (!e) return;
  const lineHeight = Math.max(
    1,
    e.getOption(monaco.editor.EditorOption.lineHeight),
  );
  scrollByDeltaY(direction * lineHeight);
}

function scrollByPageStep(direction: -1 | 1) {
  const e = editor.value;
  if (!e) return;
  const lineHeight = Math.max(
    1,
    e.getOption(monaco.editor.EditorOption.lineHeight),
  );
  const viewportHeight = Math.max(1, e.getLayoutInfo().height);
  // 预留两行，避免翻屏后阅读点跳得过猛。
  const step = Math.max(lineHeight, viewportHeight - lineHeight * 2);
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
  requestAnimationFrame(runPass);
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

/** 供 `colorTxt.file.meta` 持久化；深拷贝为可 JSON 序列化的纯对象 */
function getSerializedEditorViewState(): Record<string, unknown> | null {
  const e = editor.value;
  if (!e) return null;
  const vs = e.saveViewState();
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

/** 与 `emitProbeLine` 内 `endLine` 一致：当前视口末行（Monaco 显示行号） */
function getViewportEndLine(): number {
  const e = editor.value;
  if (!e) return 1;
  const r = e.getVisibleRanges()[0];
  const fallbackLine = e.getPosition()?.lineNumber ?? 1;
  if (!r) return fallbackLine;
  return Math.max(1, r.endLineNumber);
}

/**
 * @param fromScroll 来自视口滚动（onDidScrollChange）；为 false 时表示光标/程序性同步等
 */
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
  emit("probeLineChange", probeLine, fromReadingScroll);
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
  setChapters,
  setTheme,
  setFontSize,
  setLineHeightMultiple,
  setFontFamily,
  setWrappingStrategyAdvanced,
  resetToTop,
  scrollToDocumentStart,
  jumpToLine,
  jumpToLineCentered,
  scrollModelLineBlockToViewportCenter,
  getModelLineAtViewportCenter,
  getViewportStartModelLine,
  setVoiceReadLineHighlight,
  getVoiceReadHighlightedLine: () => voiceReadHighlightLine.value,
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
  applyEditFormatLeadIndentFullWidth,
  markReaderEditSaved,
  sealReaderEditBaseline,
  getEditorLineContent,
  getModelLineCount,
  getSelectedText,
  toggleFindWidget,
  closeFindWidgetIfRevealed,
  openFindWithSearchString,
  isFindWidgetRevealed,
  focusEditor,
  scrollByDeltaY,
  delegateEditorWheelFromBrowserEvent,
  scrollByLineStep,
  scrollByPageStep,
  scrollToBottom,
  normalizeScrollAfterEmbeddedViewZones,
  scrollLineToBottom,
  getScrollTop,
  scrollToScrollTop,
  getSerializedEditorViewState,
  restoreEditorViewState,
  expandMarkdownImagesInModel,
  applyEmbeddedImageAnchors,
  applyEbookInternalLinkMarkers,
  getEbookLeadingLinkLabelsByDisplayLine,
  getReaderEditorDomNode: () => editor.value?.getDomNode() ?? null,
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
  // Register language + providers once (across HMR)。
  const g = globalThis as any;
  if (!g[globalKey]) {
    monaco.languages.register({ id: languageId });

    const chapterSticky = registerChapterStickyScrollProviders(
      monaco,
      languageId,
      () => chaptersSnapshot,
    );
    providersDisposables.push(chapterSticky.disposable);
    notifyChapterStickyFoldingRanges =
      chapterSticky.notifyChapterFoldingRangesChanged;

    g[globalKey] = true;
  }

  applyTxtrMonarchTokenizer();
  applyReaderSyntaxFromProps();

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

  editor.value = monaco.editor.create(editorEl.value!, {
    model: m,
    ...buildReaderEditorCreateOptions({
      fontSize: READER_EDITOR_DEFAULT_FONT_SIZE,
      lineHeightMultiple,
      fontFamily: currentFontFamily,
      wrappingStrategyAdvanced: props.monacoAdvancedWrapping,
      smoothScrolling: props.monacoSmoothScrolling,
    }),
  });
  chapterTitleDecorationsCollection.value =
    editor.value.createDecorationsCollection();
  inlineSearchDecorationsCollection.value =
    editor.value.createDecorationsCollection();
  voiceReadDecorationsCollection.value =
    editor.value.createDecorationsCollection();
  minimapCursorLineDecorationsCollection.value =
    editor.value.createDecorationsCollection();
  chapterMinimapDecorationsCollection.value =
    editor.value.createDecorationsCollection();

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
      closeHighlightFloatUi();
      emitProbeLine(true);
    });
    const d2 = e.onDidChangeCursorPosition(() => {
      emitProbeLine(false);
      syncMinimapCursorLineDecoration();
    });
    const dSel = e.onDidChangeCursorSelection(() => {
      if (Date.now() < suppressHighlightTipUntilMs) {
        closeHighlightFloatUi();
        return;
      }
      void nextTick(() => updateHighlightTipFromSelection());
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
    const d4 = e.onContextMenu((mouseEv) => {
      // 编辑模式使用 Monaco 自带右键菜单，避免与自定义「复制」菜单重叠
      if (props.readerEditMode) return;
      const m = model.value;
      if (!m) return;
      const sel = e.getSelection();
      if (!sel || sel.isEmpty()) return;
      if (!contextMenuTargetInSelection(mouseEv, sel)) return;
      mouseEv.event.preventDefault();
      mouseEv.event.stopPropagation();
      editorContextMenuCopyRange.value = monaco.Range.lift(sel);
      editorContextMenuX.value = mouseEv.event.browserEvent.clientX;
      editorContextMenuY.value = mouseEv.event.browserEvent.clientY;
      editorContextMenuOpen.value = true;
    });
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
     */
    const editorHost = editorEl.value;
    const onReaderPointerDownCapture = (ev: PointerEvent) => {
      if (ev.button !== 0) return;
      if (
        ebookInternalLinkHits.value.length > 0 &&
        tryJumpEbookInternalLinkFromPoint(ev.clientX, ev.clientY)
      ) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        return;
      }
      if (imageViewZoneIds.value.length === 0) return;
      const t = ev.target;
      if (!(t instanceof Element)) return;
      const zone = t.closest(".readerImageViewZone");
      if (!zone || !(zone instanceof HTMLElement)) return;
      if (!editorHost?.contains(zone)) return;
      const url = zone.dataset.colortxtImgUrl?.trim();
      if (!url) return;
      const img = zone.querySelector("img");
      if (!(img instanceof HTMLImageElement)) return;
      const r = img.getBoundingClientRect();
      const { clientX, clientY } = ev;
      if (
        clientX < r.left ||
        clientX > r.right ||
        clientY < r.top ||
        clientY > r.bottom
      ) {
        return;
      }
      ev.preventDefault();
      ev.stopImmediatePropagation();
      imageLightboxSrc.value = url;
    };
    editorHost?.addEventListener(
      "pointerdown",
      onReaderPointerDownCapture,
      true,
    );
    onBeforeUnmount(() => {
      d1.dispose();
      d2.dispose();
      dSel.dispose();
      d3.dispose();
      d4.dispose();
      saveCommandDisposable?.dispose();
      saveCommandDisposable = null;
      editorHost?.removeEventListener(
        "pointerdown",
        onReaderPointerDownCapture,
        true,
      );
    });

    applyReaderMonacoModeOptions(Boolean(props.readerEditMode));
    syncStickyScrollToStreamState();
    syncMinimapCursorLineDecoration();
    syncChapterMinimapSectionHeaderDecorations();
  }
});

onBeforeUnmount(() => {
  notifyChapterStickyFoldingRanges = null;
  disposeEbookInternalLinks();
  cancelImageViewZoneScrollRender();
  removeHlGlobalListeners?.();
  removeHlGlobalListeners = null;
  unsubModalStack?.();
  unsubModalStack = null;
  removeVoiceReadKeyCapture?.();
  removeVoiceReadKeyCapture = null;
  editor.value?.dispose();
  model.value?.dispose();
  for (const d of providersDisposables) d.dispose();
  providersDisposables = [];
});

watch(
  () => [props.readerEditMode, props.physicalReaderPath] as const,
  async ([edit, physRaw]) => {
    const phys = physRaw?.trim() ?? "";
    if (edit) closeEditorContextMenu();
    if (!edit) {
      teardownReaderEditContentListener();
      readerEditLoadedPhysicalKey = "";
      applyReaderMonacoModeOptions(false);
      return;
    }
    if (!phys) return;
    if (readerEditLoadedPhysicalKey !== phys) {
      await loadReaderEditFromDisk();
      return;
    }
    applyReaderMonacoModeOptions(true);
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
      const k = ev.key;
      if (
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
    if (!hlTipVisible.value && !hlPickerVisible.value) return;
    if (hasModalOnStack() || hasEscBeforeModalLayers()) {
      closeHighlightFloatUi();
    }
  });
});
</script>

<template>
  <main
    class="content"
    :class="{
      'content--readerEdit': readerEditMode,
      'content--readerEditMinimap': readerEditMode && readerEditMinimap,
    }"
  >
    <div class="editorShell">
      <div ref="editorEl" class="editorHost"></div>
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
    </div>
    <div
      v-if="hlTipVisible || hlPickerVisible"
      ref="hlFloatRootRef"
      class="hlFloatRoot"
      :style="{ zIndex: HL_FLOAT_Z_INDEX }"
      aria-live="polite"
    >
      <ReaderHighlightFloat
        :tip-visible="hlTipVisible"
        :picker-visible="hlPickerVisible"
        :tip-top="hlFloatTop"
        :tip-left="hlFloatLeft"
        :picker-top="hlPickerTop"
        :picker-left="hlPickerLeft"
        :open-downward="hlFloatOpenDownward"
        :highlight-colors="highlightColors"
        :show-remove-row="hlPickerShowRemoveRow"
        :existing-color-index="hlPickerExistingColorIndex"
        @pick-open="openHighlightPicker"
        @pick-confirm="confirmHighlightColor"
        @pick-remove="removeHighlightKeywordFromPicker"
      />
    </div>
    <AppContextMenu
      :open="editorContextMenuOpen"
      :x="editorContextMenuX"
      :y="editorContextMenuY"
      :items="EDITOR_CONTEXT_MENU_ITEMS"
      :min-width="120"
      @close="closeEditorContextMenu"
      @select="onEditorContextMenuSelect"
    />
    <ReaderImageLightbox v-model="imageLightboxSrc" />
  </main>
</template>

<style scoped>
.content {
  height: 100%;
  background: var(--reader-bg);
  overflow: hidden;
  min-height: 0;
  user-select: text;
}

.editorShell {
  position: relative;
  height: 100%;
  width: 100%;
  min-height: 0;
}

.voiceReadScrollBlocker {
  position: absolute;
  inset: 0;
  z-index: 50;
  cursor: default;
}

.editorHost {
  height: 100%;
  width: 100%;
  overflow: hidden;
  user-select: text;
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

/* 仅只读：隐藏文本光标（与 cursorWidth:0 配合）；编辑模式交给 Monaco 默认绘制 */
.content:not(.content--readerEdit) :deep(.monaco-editor .cursor) {
  display: none !important;
}

/* 仅只读：弱化单词高亮装饰，避免「当前行」类视觉干扰阅读 */
.content:not(.content--readerEdit) :deep(.monaco-editor .wordHighlight),
.content:not(.content--readerEdit) :deep(.monaco-editor .wordHighlightStrong) {
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
  font-size: 2em !important;
}
:deep(.monaco-editor span:has(> .chapterTitleLine)) {
  display: inline-block;
  transform-origin: left;
  transform: scale(0.6);
}
</style>
