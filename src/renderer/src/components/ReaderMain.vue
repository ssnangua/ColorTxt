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
  buildChapterTitleDecorations,
  setReaderSyntaxHighlightEnabled,
} from "../monaco/readerInlineDecorations";
import {
  replaceImgAnchorLinesWithViewZones,
  removeViewZonesById,
} from "../monaco/readerImageViewZones";
import {
  READER_EDITOR_DEFAULT_FONT_FAMILY,
  READER_EDITOR_DEFAULT_FONT_SIZE,
  buildReaderEditorCreateOptions,
  buildReaderEditorFontSizeUpdate,
  buildReaderEditorLineHeightUpdate,
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
import AppContextMenu from "./AppContextMenu.vue";
import ReaderHighlightFloat from "./ReaderHighlightFloat.vue";
import ReaderImageLightbox from "./ReaderImageLightbox.vue";
import "./readerMainMonaco.css";
import { getSelectionEndViewportAnchor } from "../reader/readerHighlightGeometry";
import {
  positionFromClientPoint,
  clientXWithinSingleLineModelRange,
} from "../reader/readerEbookPointer";
import { lookupEbookAnchorPhysicalLine } from "../reader/ebookAnchorLookup";
import {
  defaultCompressBlankLines,
  defaultMonacoAdvancedWrapping,
  defaultMonacoCustomHighlight,
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
  hasModalOnStack,
  MODAL_STACK_BASE_Z_INDEX,
  subscribeModalStackChange,
} from "../utils/modalStack";
import { stripEbookIdAndAMarkersFromText } from "../ebook/ebookInternalLinkMarkers";

/** 低于 `AppModal` 蒙层（BASE 6000），避免盖住弹框 */
const HL_FLOAT_Z_INDEX = MODAL_STACK_BASE_Z_INDEX - 20;

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
type EbookLinkHit = { range: monaco.Range; targetId: string };
const ebookInternalLinkHits = shallowRef<EbookLinkHit[]>([]);
/** 选区靠近阅读区上缘时为 true：笔尖与色盘改为在选区下方展开 */
const hlFloatOpenDownward = ref(false);

let removeHlGlobalListeners: (() => void) | null = null;
let unsubModalStack: (() => void) | null = null;
const builtInThemes = new Set(["vs", "vs-dark"]);
/** 行高 = round(fontSize * multiple)，由 App 持久化并同步 */
let lineHeightMultiple = defaultReaderLineHeightMultiple;
let currentFontFamily = READER_EDITOR_DEFAULT_FONT_FAMILY;

let chaptersSnapshot: ChapterStickyLine[] = [];

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
    /** 主进程流式读盘期间为 true；关闭 sticky 避免旧文件黏性标题在加载全程残留 */
    streamLoading?: boolean;
    /** 合并用户覆盖后的阅读器表面色（亮色 / 暗色） */
    readerSurfaceLight?: ReaderSurfacePalette;
    readerSurfaceDark?: ReaderSurfacePalette;
    /** 当前主题下的高亮色列表（与设置中亮/暗数组之一对应） */
    highlightColors?: string[];
    /** 当前打开文件的自定义高亮词（来自 file.meta） */
    highlightWordsByIndex?: HighlightWordsByIndex;
    /** 已打开文件路径；为空时不显示选区高亮入口 */
    readerFilePath?: string | null;
    /** 电子书 `<<ID>>` / `<<A>>`：物理行号 → Monaco 显示行（与流式滤空一致） */
    ebookAnchorPhysicalToDisplay?: (physicalLine: number) => number;
    /**
     * 压缩空行时：`stripEbook…` 按 Monaco 行序记的「行号」实为显示行，需先映回源物理行再与 `ebookAnchorPhysicalToDisplay` 配对。
     */
    ebookDisplayLineToPhysical?: (displayLine: number) => number;
  }>(),
  {
    monacoCustomHighlight: defaultMonacoCustomHighlight,
    txtrDelimitedMatchCrossLine: defaultTxtrDelimitedMatchCrossLine,
    compressBlankLines: defaultCompressBlankLines,
    monacoAdvancedWrapping: defaultMonacoAdvancedWrapping,
    streamLoading: false,
    readerSurfaceLight: () => ({ ...defaultReaderPaletteLight }),
    readerSurfaceDark: () => ({ ...defaultReaderPaletteDark }),
    highlightColors: () => [...DEFAULT_HIGHLIGHT_COLORS_LIGHT],
    highlightWordsByIndex: undefined,
    readerFilePath: null,
    ebookAnchorPhysicalToDisplay: undefined,
    ebookDisplayLineToPhysical: undefined,
  },
);

const emit = defineEmits<{
  probeLineChange: [probeLine: number, fromScroll?: boolean];
  viewportTopLineChange: [lineNumber: number];
  viewportEndLineChange: [lineNumber: number];
  viewportVisualProgressChange: [percent: number, atBottom: boolean];
  addHighlightTerm: [payload: { text: string; colorIndex: number }];
  removeHighlightTerm: [payload: { text: string }];
}>();

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
  return {
    enabled: props.monacoCustomHighlight,
    highlightColorsLength: props.highlightColors.length,
    highlightWordsByIndex: props.highlightWordsByIndex,
  };
}

/** 关键词或开关变化时更新 Monarch；会触发 TokenizationRegistry 失效并重算 token */
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

/** 设为/取消关键词后：取消选区，光标落在原选区几何末端 */
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

function beginProgrammaticScroll() {
  programmaticScrollDepth++;
  window.setTimeout(() => {
    programmaticScrollDepth = Math.max(0, programmaticScrollDepth - 1);
  }, 500);
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
}

function getEbookAnchorPhysicalLine(targetId: string): number | undefined {
  return lookupEbookAnchorPhysicalLine(ebookAnchorIdToPhysicalLine.value, targetId);
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
  let { text, outLines, idToPhysicalLine, linkOccurrences } =
    stripEbookIdAndAMarkersFromText(normalized);
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
    const r = new monaco.Range(
      dl,
      occ.startColumn,
      dl,
      occ.endColumnExclusive,
    );
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

async function applyEmbeddedImageAnchors(convertedTxtAbsPath: string | null) {
  disposeImageViewZones();
  imageLightboxSrc.value = "";
  const p = convertedTxtAbsPath?.trim();
  if (!p) return;
  const e = editor.value;
  if (!e) return;
  const ids = await replaceImgAnchorLinesWithViewZones(monaco, e, p, {
    zoneHeightPx: 100,
  });
  imageViewZoneIds.value = ids;
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

  e?.updateOptions({ stickyScroll: { enabled: false } });

  if (e && prevModel) {
    const next = monaco.editor.createModel("", languageId);
    e.setModel(next);
    prevModel.dispose();
    model.value = next;
    chapterTitleDecorationsCollection.value = e.createDecorationsCollection();
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
  const edits: monaco.editor.IIdentifiedSingleEditOperation[] = [];
  for (const ch of chaptersSnapshot) {
    const ln = ch.lineNumber;
    if (ln < 1 || ln > maxLine) continue;
    const line = m.getLineContent(ln);
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
  if (lineKey !== lastChapterTitleDecorationsLineKey) {
    collection.set(buildChapterTitleDecorations(monaco, m, chaptersSnapshot));
    lastChapterTitleDecorationsLineKey = lineKey;
  }
}

function setTheme(themeName: string) {
  lastAppThemeName = themeName;
  if (themeName === "vs") {
    monaco.editor.setTheme("vs");
  } else if (builtInThemes.has(themeName)) {
    monaco.editor.setTheme(themeName);
  } else {
    monaco.editor.setTheme("vs-dark");
  }
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
  e.revealLineInCenter(1, monaco.editor.ScrollType.Smooth);
  e.setScrollTop(0, monaco.editor.ScrollType.Smooth);
  queueMicrotask(() => {
    try {
      e.setPosition({ lineNumber: 1, column: 1 });
      e.setScrollTop(0, monaco.editor.ScrollType.Smooth);
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
  const scrollType = smooth
    ? monaco.editor.ScrollType.Smooth
    : monaco.editor.ScrollType.Immediate;
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
  const scrollType = smooth
    ? monaco.editor.ScrollType.Smooth
    : monaco.editor.ScrollType.Immediate;
  e.layout();
  e.revealLineNearTop(line, scrollType);
  const top = e.getTopForLineNumber(line);
  // 勿再减 lineHeight：否则视口顶行会变成 line-1，恢复阅读位置/章节跳转都会「回退一行」
  e.setScrollTop(Math.max(0, top), scrollType);
  e.setPosition({ lineNumber: line, column: 1 });
  e.focus();
}

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
  const scrollType = smooth
    ? monaco.editor.ScrollType.Smooth
    : monaco.editor.ScrollType.Immediate;
  const lineHeightPx = e.getOption(monaco.editor.EditorOption.lineHeight);
  e.layout();
  e.revealLineNearTop(line, scrollType);
  const top = e.getTopForLineNumber(line);
  e.setScrollTop(Math.max(0, top - lineHeightPx), scrollType);
  e.setPosition({ lineNumber: line, column: 1 });
  e.focus();
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

function getSelectedText(): string {
  const e = editor.value;
  const m = model.value;
  if (!e || !m) return "";
  const sel = e.getSelection();
  if (!sel || sel.isEmpty()) return "";
  return m.getValueInRange(sel);
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

function focusEditor() {
  editor.value?.focus();
}

function scrollByDeltaY(deltaY: number) {
  const e = editor.value;
  if (!e || !Number.isFinite(deltaY) || deltaY === 0) return;
  const maxTop = Math.max(0, e.getScrollHeight() - e.getLayoutInfo().height);
  const nextTop = Math.max(0, Math.min(maxTop, e.getScrollTop() + deltaY));
  e.setScrollTop(nextTop, monaco.editor.ScrollType.Smooth);
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
  e.setScrollTop(
    maxTop,
    smooth
      ? monaco.editor.ScrollType.Smooth
      : monaco.editor.ScrollType.Immediate,
  );
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
    } else if (
      top1 > 0 &&
      st0 >= top1 - alignTol &&
      st0 <= top1 + alignTol
    ) {
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
  e.setScrollTop(
    target,
    smooth
      ? monaco.editor.ScrollType.Smooth
      : monaco.editor.ScrollType.Immediate,
  );
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
  e.setScrollTop(
    targetTop,
    smooth
      ? monaco.editor.ScrollType.Smooth
      : monaco.editor.ScrollType.Immediate,
  );
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
  jumpToBookmarkLine,
  emitProbeLine,
  getProbeLine,
  getViewportEndLine,
  getViewportTopLine,
  getViewportLineSpan,
  getAllText,
  getSelectedText,
  toggleFindWidget,
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
  applyEmbeddedImageAnchors,
  applyEbookInternalLinkMarkers,
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
  () => [props.monacoCustomHighlight, props.txtrDelimitedMatchCrossLine] as const,
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

    providersDisposables.push(
      registerChapterStickyScrollProviders(
        monaco,
        languageId,
        () => chaptersSnapshot,
      ),
    );

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
    }),
  });
  chapterTitleDecorationsCollection.value =
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
    const d2 = e.onDidChangeCursorPosition(() => emitProbeLine(false));
    const dSel = e.onDidChangeCursorSelection(() => {
      void nextTick(() => updateHighlightTipFromSelection());
    });
    const d3 = installReaderScrollKeyHandler(monaco, e, {
      onSpacePageDown: () => scrollByPageStep(1),
    });
    const d4 = e.onContextMenu((mouseEv) => {
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
    editorHost?.addEventListener("pointerdown", onReaderPointerDownCapture, true);
    onBeforeUnmount(() => {
      d1.dispose();
      d2.dispose();
      dSel.dispose();
      d3.dispose();
      d4.dispose();
      editorHost?.removeEventListener(
        "pointerdown",
        onReaderPointerDownCapture,
        true,
      );
    });

    syncStickyScrollToStreamState();
  }
});

onBeforeUnmount(() => {
  disposeEbookInternalLinks();
  cancelImageViewZoneScrollRender();
  removeHlGlobalListeners?.();
  removeHlGlobalListeners = null;
  unsubModalStack?.();
  unsubModalStack = null;
  editor.value?.dispose();
  model.value?.dispose();
  for (const d of providersDisposables) d.dispose();
  providersDisposables = [];
});

watch(
  () => props.readerFilePath,
  () => {
    closeHighlightFloatUi();
  },
);

onMounted(() => {
  unsubModalStack = subscribeModalStackChange(() => {
    if (!hlTipVisible.value && !hlPickerVisible.value) return;
    if (hasModalOnStack()) closeHighlightFloatUi();
  });
});
</script>

<template>
  <main class="content">
    <div ref="editorEl" class="editorHost"></div>
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

:deep(.monaco-editor .cursor) {
  display: none !important;
}

:deep(.monaco-editor .wordHighlight),
:deep(.monaco-editor .wordHighlightStrong) {
  background: transparent !important;
}

/* 打开右键菜单时编辑器会失去 .focused，Monaco 会用 inactive 选区色变浅；统一为活动选区背景 */
:deep(.monaco-editor .selected-text) {
  background-color: var(--vscode-editor-selectionBackground) !important;
}

:deep(.monaco-editor .scroll-decoration) {
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
