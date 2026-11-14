import { nextTick, type Ref } from "vue";
import {
  applyLeadIndentFullWidth,
  chapterTitleForDisplay,
} from "../chapter";
import type ReaderMain from "../components/ReaderMain.vue";
import {
  annotationColumnMapOptions,
  physicalColumnToDisplayColumn,
  replaceTextInPhysicalLines,
  type AnnotationRange,
} from "../utils/readerAnnotations";
import {
  physicalLineToChapterTitleDisplayLine,
  physicalLineToLastFilteredDisplayLine,
  shiftChapterTitleDisplayLineMap,
} from "../reader/lineMapping";
import {
  formatPhysicalLinesForReaderAsync,
  resolveChapterAlignedFocusWindow,
  type ReaderDisplayFormatOptions,
  type ReaderDisplayFormatResult,
} from "../reader/readerDisplayPipeline";
import type { ChapterTitleBlankMode } from "../constants/appUi";
import { visibleReaderLineFromPhysicalRaw } from "../ebook/ebookTitleMatch";
import { stripMdInternalLinksFromPhysicalLinesAsync } from "../markdown/markdownInternalLinks";
import { yieldToUi } from "../ebook/yieldToUi";
import type { ReaderViewportRestoreAnchor } from "../reader/readerViewportAnchor";
import { floorReadingProgressPercentByLines } from "../utils/format";
import { createPhysicalLineSplitter } from "../services/physicalLineStream";
import { applyTextDisplayConverts } from "../services/textConvertApply";
import type {
  TextConvertWidthMode,
  TextConvertZhMode,
} from "@shared/textConvertTypes";
import {
  applyReplaceRulesToDisplayText,
  filterEnabledReplaceRules,
} from "@shared/bookSource/replaceRuleApply";
import type { ReplaceRule } from "@shared/bookSource/replaceRule";

type ReaderRef = Ref<InstanceType<typeof ReaderMain> | null>;

/**
 * txt 流式读盘：仅累积物理行与加载进度；展示格式化与章节匹配在加载完成后统一处理。
 */
export function useTxtStreamPipeline(deps: {
  readerRef: ReaderRef;
  totalCharCount: Ref<number>;
  totalLineCount: Ref<number>;
  readerEditMode: Ref<boolean>;
  compressBlankLines: Ref<boolean>;
  compressBlankKeepOneBlank: Ref<boolean>;
  chapterTitleBlankMode: Ref<ChapterTitleBlankMode>;
  leadIndentFullWidth: Ref<boolean>;
  textConvertZh: Ref<TextConvertZhMode>;
  textConvertLetter: Ref<TextConvertWidthMode>;
  textConvertDigit: Ref<TextConvertWidthMode>;
  /** 文本替换（阅读展示在转换前套用） */
  replaceRules: Ref<ReplaceRule[]>;
  /** 替换范围 / 排除范围匹配用书名（主窗口为当前文件名） */
  replaceRuleBookName: Ref<string>;
  chapterMinCharCount: Ref<number>;
  currentFileIsMarkdown: Ref<boolean>;
  /** 展示正文写入 Monaco 且插图/内链处理完成后 */
  afterFullTextInstalled: () => void | Promise<void>;
  /** 正文已写入 Monaco、可解除加载遮罩（插图/内链等在后台继续） */
  onReaderDisplayReady?: () => void;
  /**
   * 本次加载结束后要恢复的阅读位置（物理行）。首屏分阶段渲染据此决定
   * 「先渲染哪一段」——必须覆盖恢复位置，否则恢复时会落到尚未渲染的区间。
   */
  getPendingRestorePhysicalLine?: () => number | null;
}) {
  const lineSplitter = createPhysicalLineSplitter();
  /** 展示安装代次：切换文件 / 重新格式化会让旧的窗口与后台补齐任务作废 */
  let displayGeneration = 0;

  /** Monaco 展示行数（滤空后与物理行数可能不同） */
  let lineCount = 0;
  /** 源文件物理行（含空行）；加载阶段只 push */
  let physicalLineContents: string[] = [];
  /** 展示行号 i（1-based）→ 物理行号 */
  let filteredDisplayToPhysicalLine: number[] = [];
  /**
   * 最近一次 `formatPhysicalLinesForReader` 的展示行（与 Monaco 一致）。
   * 章节/内链映展示行时优先用此缓存，避免 `setChapters` 剥标题缩进或侧车未装完时读 Monaco 错位。
   */
  let lastFormattedDisplayLines: string[] = [];
  /** 最近一次 format 写出的章节标题物理行 → 展示行（压缩空行时含留白偏移） */
  let chapterTitleDisplayLineByPhysical = new Map<number, number>();

  function lineForReaderDisplay(rawLine: string): string {
    return deps.leadIndentFullWidth.value
      ? applyLeadIndentFullWidth(rawLine)
      : rawLine;
  }

  function viewportDisplayLineToPhysicalLine(displayLine: number): number {
    const v = Math.max(1, Math.floor(displayLine));
    const map = filteredDisplayToPhysicalLine;
    if (map.length === 0) return v;
    const idx = v - 1;
    if (idx < 0) return 1;
    if (idx >= map.length) {
      return map[map.length - 1] ?? v;
    }
    return map[idx]!;
  }

  /** 空锚点行 → 向后找首行可见正文，避免展示行落到下一段正文 */
  function resolvePhysicalLineForDisplayAnchor(physicalLine: number): number {
    const p0 = Math.max(1, Math.floor(physicalLine));
    const total = physicalLineContents.length;
    const stripped0 = (physicalLineContents[p0 - 1] ?? "").trim();
    if (stripped0.length > 0) return p0;
    for (let p = p0 + 1; p <= Math.min(total, p0 + 10); p++) {
      if ((physicalLineContents[p - 1] ?? "").trim().length > 0) return p;
    }
    return p0;
  }

  function physicalLineToDisplayForReader(
    physicalLine: number,
    tocTitle?: string,
  ): number {
    const map = filteredDisplayToPhysicalLine;
    const preferTitle = chapterTitleForDisplay(tocTitle ?? "");
    // 嵌入目录已解析到标题物理行：勿将空锚点行转发到邻行（会误命中邻章缓存行号）
    const p =
      preferTitle.length > 0
        ? Math.max(1, Math.floor(physicalLine))
        : resolvePhysicalLineForDisplayAnchor(physicalLine);
    if (map.length === 0) return p;

    const reader = deps.readerRef.value;
    const getEditorLineContent = reader?.getEditorLineContent;
    const getDisplayLineContent =
      reader && typeof getEditorLineContent === "function"
        ? (displayLine: number) =>
            chapterTitleForDisplay(
              getEditorLineContent.call(reader, displayLine) ?? "",
            )
        : lastFormattedDisplayLines.length > 0
          ? (displayLine: number) =>
              chapterTitleForDisplay(
                lastFormattedDisplayLines[displayLine - 1] ?? "",
              )
          : undefined;

    // 压缩空行：同一物理行对应多行展示，format 写出的标题行须校验标题后再采用
    if (deps.compressBlankLines.value && getDisplayLineContent) {
      const cachedDl = chapterTitleDisplayLineByPhysical.get(p);
      if (cachedDl != null && cachedDl >= 1) {
        if (!preferTitle.length) {
          return cachedDl;
        }
        if (
          chapterTitleForDisplay(getDisplayLineContent(cachedDl)) === preferTitle
        ) {
          return cachedDl;
        }
      }
    }

    const raw = physicalLineContents[p - 1] ?? "";
    const visible = visibleReaderLineFromPhysicalRaw(raw);
    const basis = visible.trim().length > 0 ? visible : raw;
    const exemptLeadIndent = preferTitle.length > 0;
    const wantShown = preferTitle
      ? preferTitle
      : exemptLeadIndent
        ? chapterTitleForDisplay(basis)
        : lineForReaderDisplay(basis);

    return physicalLineToChapterTitleDisplayLine(p, map, {
      wantShown,
      getDisplayLineContent,
    });
  }

  function physicalLineToBottomDisplayForReader(physicalLine: number): number {
    const p = Math.max(1, Math.floor(physicalLine));
    const map = filteredDisplayToPhysicalLine;
    if (map.length === 0) return p;
    return physicalLineToLastFilteredDisplayLine(p, map);
  }

  function calcProgressPercentByPhysicalLine(
    physicalLine: number,
  ): number | undefined {
    const total = physicalLineContents.length;
    if (total <= 0) return undefined;
    const current = Math.min(total, Math.max(1, Math.floor(physicalLine)));
    return floorReadingProgressPercentByLines(current, total);
  }

  function calcProgressPercentByViewportDisplay(
    topDisplayLine: number,
    bottomDisplayLine: number,
  ): number | undefined {
    const totalDisplay = deps.totalLineCount.value;
    if (totalDisplay <= 0) return undefined;
    const top = Math.min(totalDisplay, Math.max(1, Math.floor(topDisplayLine)));
    const bottom = Math.min(
      totalDisplay,
      Math.max(1, Math.floor(bottomDisplayLine)),
    );
    if (bottom >= totalDisplay) return 100;
    if (top === 1) return 0;
    const physical = viewportDisplayLineToPhysicalLine(bottomDisplayLine);
    return calcProgressPercentByPhysicalLine(physical);
  }

  function resetStreamInternals() {
    // 切换文件：作废尚未完成的首屏窗口/后台补齐任务
    displayGeneration += 1;
    lineCount = 0;
    physicalLineContents = [];
    filteredDisplayToPhysicalLine = [];
    lastFormattedDisplayLines = [];
    chapterTitleDisplayLineByPhysical = new Map();
    lineSplitter.reset();
  }

  /**
   * 从阅读器模型同步镜像（编辑态输入时；只读仅更新字数/行数统计）。
   * 只读时 **不得** 用 Monaco 展示文覆盖 `physicalLineContents`（含行首缩进、滤空后的展示层），
   * 否则关闭「行首缩进」无法从源物理行重新生成原文。
   */
  function syncMirrorFromReaderModel() {
    const reader = deps.readerRef.value;
    const text = reader?.getAllText() ?? "";
    deps.totalCharCount.value = text.length;

    if (!deps.readerEditMode.value) {
      if (text.length === 0) {
        lineCount = 0;
        deps.totalLineCount.value = 0;
        return;
      }
      if (deps.compressBlankLines.value) {
        lineCount = filteredDisplayToPhysicalLine.length;
      } else {
        lineCount =
          filteredDisplayToPhysicalLine.length > 0
            ? filteredDisplayToPhysicalLine.length
            : physicalLineContents.length;
      }
      deps.totalLineCount.value = lineCount;
      return;
    }

    const lines = text.length > 0 ? text.split("\n") : [""];
    physicalLineContents = lines;
    lineCount = reader?.getModelLineCount?.() ?? lines.length;
    deps.totalLineCount.value = lineCount;
    filteredDisplayToPhysicalLine = lines.map((_, i) => i + 1);
  }

  function processChunk(chunk: string) {
    const parts = lineSplitter.push(chunk);
    for (const rawLine of parts) {
      physicalLineContents.push(rawLine);
    }
  }

  function restoreViewportAfterDisplayChange(
    restorePhysicalLine: number | undefined,
  ): Promise<void> {
    const r = deps.readerRef.value;
    if (!r || restorePhysicalLine == null) return Promise.resolve();
    const totalPhysical = physicalLineContents.length;
    const phys = Math.min(
      totalPhysical,
      Math.max(1, Math.floor(restorePhysicalLine)),
    );
    return new Promise((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (phys >= totalPhysical) {
            r.scrollToBottom?.(false);
          } else if (phys <= 1) {
            r.jumpToLine?.(1, false);
          } else {
            const jumpLine = physicalLineToBottomDisplayForReader(phys);
            if (jumpLine <= 1) {
              r.jumpToLine?.(1, false);
            } else {
              r.scrollLineToBottom?.(jumpLine, false);
            }
          }
          void nextTick(() => {
            r.normalizeScrollAfterEmbeddedViewZones?.();
            r.emitProbeLine?.();
            resolve();
          });
        });
      });
    });
  }

  /**
   * 由已缓存的物理行生成展示正文并写入 Monaco（加载完成 / 切换压缩或缩进 / 保留一空行设置）。
   *
   * 大文件（只读纯文本）先只渲染「当前阅读位置附近若干章」，让正文尽快出现，
   * 随后在后台格式化全文并整文替换（同一视口锚点）。小文件/编辑态仍走整文路径。
   */
  async function applyReaderDisplayFromPhysicalLines(
    restore?: ReaderViewportRestoreAnchor | number,
  ): Promise<boolean> {
    const r = deps.readerRef.value;
    if (!r) return false;

    const totalPhysical = physicalLineContents.length;
    const canStage =
      !deps.readerEditMode.value &&
      !deps.currentFileIsMarkdown.value &&
      totalPhysical > READER_STAGED_DISPLAY_MIN_LINES;
    const generation = ++displayGeneration;

    if (canStage) {
      const focusPhysicalLine = resolveFocusPhysicalLine(restore, totalPhysical);
      const window = resolveChapterAlignedFocusWindow(
        physicalLineContents,
        focusPhysicalLine,
        totalPhysical,
      );
      if (window && window.endPhysicalLine - window.startPhysicalLine + 1 < totalPhysical) {
        const stagedOk = await installDisplayWindow(window, restore, generation);
        if (stagedOk) {
          // 首屏已可见；其余部分不阻塞交互
          void completeStagedDisplay(generation);
          return true;
        }
        if (generation !== displayGeneration) return false;
      }
    }

    const display = await formatCurrentPhysicalLinesForDisplay();
    if (!display || generation !== displayGeneration) return false;
    return installFormattedDisplay(display, restore);
  }

  /** 最小分阶段渲染行数：更小的文件整文格式化已足够快 */
  const READER_STAGED_DISPLAY_MIN_LINES = 40_000;

  function resolveFocusPhysicalLine(
    restore: ReaderViewportRestoreAnchor | number | undefined,
    total: number,
  ): number {
    if (restore != null && typeof restore === "object") {
      return Math.max(1, Math.min(total, Math.floor(restore.physicalLine)));
    }
    if (typeof restore === "number") {
      return Math.max(1, Math.min(total, Math.floor(restore)));
    }
    /**
     * 流结束路径（`flushCarry`）不传 restore：恢复锚点由外层在之后单独应用。
     * 首屏窗口必须覆盖该位置，否则恢复时视口会落到未渲染的区间。
     */
    const pending = deps.getPendingRestorePhysicalLine?.() ?? null;
    if (pending != null && Number.isFinite(pending)) {
      return Math.max(1, Math.min(total, Math.floor(pending)));
    }
    return 1;
  }

  /** 格式化物理行的一个子区间，并把行号映射偏移回全局物理行号 */
  async function formatPhysicalLineWindow(
    window: { startPhysicalLine: number; endPhysicalLine: number },
  ): Promise<{ displayText: string; formatted: ReaderDisplayFormatResult } | null> {
    const startIdx = window.startPhysicalLine - 1;
    const slice = physicalLineContents.slice(
      startIdx,
      window.endPhysicalLine,
    );
    if (slice.length === 0) return null;
    const formatted = await formatPhysicalLinesForReaderAsync(
      slice,
      readerDisplayFormatOptions(),
    );
    const displayText = await applyWindowDisplayTransforms({
      text: formatted.text,
      titleDisplayLines: formatted.chapterTitleDisplayLineByPhysical,
    });
    const offset = startIdx;
    const shifted = {
      ...formatted,
      displayLineToPhysicalLine: formatted.displayLineToPhysicalLine.map(
        (p) => p + offset,
      ),
      chapterTitleDisplayLineByPhysical: new Map(
        [...formatted.chapterTitleDisplayLineByPhysical].map(([p, d]) => [
          p + offset,
          d,
        ]),
      ),
      ebookSidecar: undefined,
    };
    return { displayText, formatted: shifted };
  }

  /** 窗口阶段同样套用「文本替换」与「转换」，保证首屏与最终全文一致 */
  async function applyWindowDisplayTransforms(input: {
    text: string;
    titleDisplayLines: ReadonlyMap<number, number>;
  }): Promise<string> {
    let text = input.text;
    if (!deps.readerEditMode.value) {
      const bookName = deps.replaceRuleBookName.value;
      const contentRules = filterEnabledReplaceRules(
        deps.replaceRules.value,
        bookName,
        "",
        "content",
      );
      const titleRules = filterEnabledReplaceRules(
        deps.replaceRules.value,
        bookName,
        "",
        "title",
      );
      if (contentRules.length > 0 || titleRules.length > 0) {
        text = applyReplaceRulesToDisplayText(
          text,
          contentRules,
          titleRules,
          new Set(input.titleDisplayLines.values()),
        );
      }
    }
    return applyTextDisplayConverts(text, {
      zh: deps.textConvertZh.value,
      letter: deps.textConvertLetter.value,
      digit: deps.textConvertDigit.value,
    });
  }

  /** 首屏：写入窗口正文、恢复视口、解除加载遮罩 */
  async function installDisplayWindow(
    window: { startPhysicalLine: number; endPhysicalLine: number },
    restore: ReaderViewportRestoreAnchor | number | undefined,
    generation: number,
  ): Promise<boolean> {
    const r = deps.readerRef.value;
    if (!r) return false;
    const display = await formatPhysicalLineWindow(window);
    if (!display || generation !== displayGeneration) return false;
    /**
     * 恢复目标不在本窗口内时不得分阶段：视口会落到未渲染区间，
     * 用户看到一大片空白（下一次滚动才补齐）。整文路径虽慢但结果正确。
     *
     * 流结束路径不传 `restore`（恢复由外层之后单独执行），此时用 pending 位置校验。
     */
    const restorePhysical =
      restore == null
        ? (deps.getPendingRestorePhysicalLine?.() ?? null)
        : typeof restore === "object"
          ? restore.physicalLine
          : restore;
    if (
      restorePhysical != null &&
      (restorePhysical < window.startPhysicalLine ||
        restorePhysical > window.endPhysicalLine)
    ) {
      return false;
    }
    // 首屏只装窗口：插图/内链收尾须按整本展示行计算，留给后台补齐后的整文安装
    return installFormattedDisplay(display, restore, false);
  }

  /** 后台补齐：全文格式化后整文替换（锚点取当前视口的物理行，避免读者被跳走） */
  async function completeStagedDisplay(generation: number): Promise<void> {
    await yieldToUi();
    if (generation !== displayGeneration) return;
    const r = deps.readerRef.value;
    if (!r) return;
    /**
     * 读者可能在窗口内继续滚动：先按当前视口取物理行锚点，
     * 全文安装后回到「同一物理行」——窗口内行号与全文行号此时已经不同，
     * 只依赖 Monaco 原生行号会跳位。
     */
    const viewportTopDisplayLine = Math.max(
      1,
      Math.floor(r.getViewportTopLine?.() ?? 1),
    );
    const map = filteredDisplayToPhysicalLine;
    const anchorPhysicalLine =
      map[Math.min(map.length - 1, viewportTopDisplayLine - 1)] ?? 1;
    const anchor = {
      physicalLine: anchorPhysicalLine,
      wrappedLineIndex: 0,
    };
    const display = await formatCurrentPhysicalLinesForDisplay();
    if (!display || generation !== displayGeneration) return;
    await installFormattedDisplay(display, anchor);
  }

  /** 整文格式化（物理行 → 展示行，含替换/转换）；失败返回 null */
  async function formatCurrentPhysicalLinesForDisplay(): Promise<
    | {
      displayText: string;
      formatted: ReaderDisplayFormatResult;
    }
    | null
  > {
    const preStrip = deps.currentFileIsMarkdown.value
      ? await stripMdInternalLinksFromPhysicalLinesAsync(physicalLineContents)
      : undefined;
    if (preStrip) await yieldToUi();

    const formatted = await formatPhysicalLinesForReaderAsync(
      physicalLineContents,
      readerDisplayFormatOptions(),
      preStrip,
    );
    await yieldToUi();

    let displayText = formatted.text;
    if (!deps.readerEditMode.value) {
      const bookName = deps.replaceRuleBookName.value;
      const contentRules = filterEnabledReplaceRules(
        deps.replaceRules.value,
        bookName,
        "",
        "content",
      );
      const titleRules = filterEnabledReplaceRules(
        deps.replaceRules.value,
        bookName,
        "",
        "title",
      );
      if (contentRules.length > 0 || titleRules.length > 0) {
        // 正文规则套全文；标题行只套「作用于标题」（不走按行 trim，以免抵消行首缩进）
        const titleDisplayLines = new Set(
          formatted.chapterTitleDisplayLineByPhysical.values(),
        );
        displayText = applyReplaceRulesToDisplayText(
          displayText,
          contentRules,
          titleRules,
          titleDisplayLines,
        );
      }
    }
    displayText = await applyTextDisplayConverts(displayText, {
      zh: deps.textConvertZh.value,
      letter: deps.textConvertLetter.value,
      digit: deps.textConvertDigit.value,
    });
    await yieldToUi();
    return { displayText, formatted };
  }

  function readerDisplayFormatOptions(): ReaderDisplayFormatOptions {
    return {
      compressBlankLines: deps.compressBlankLines.value,
      compressBlankKeepOneBlank: deps.compressBlankKeepOneBlank.value,
      chapterTitleBlankMode: deps.chapterTitleBlankMode.value,
      leadIndentFullWidth: deps.leadIndentFullWidth.value,
      minCharCount: deps.chapterMinCharCount.value,
      isMarkdown: deps.currentFileIsMarkdown.value,
    };
  }

  /**
   * 把格式化结果写入阅读器并恢复视口。
   * `finishAfterInstall` 为 false 时（首屏分阶段只装了窗口内容），跳过插图/内链等
   * 收尾——它们要按**整本**展示行计算，须等后台补齐后再跑。
   */
  async function installFormattedDisplay(
    display: { displayText: string; formatted: ReaderDisplayFormatResult },
    restore: ReaderViewportRestoreAnchor | number | undefined,
    finishAfterInstall = true,
  ): Promise<boolean> {
    const r = deps.readerRef.value;
    if (!r) return false;
    const { displayText, formatted } = display;
    filteredDisplayToPhysicalLine = formatted.displayLineToPhysicalLine;
    lastFormattedDisplayLines =
      displayText.length > 0 ? displayText.split("\n") : [];
    chapterTitleDisplayLineByPhysical = new Map(
      formatted.chapterTitleDisplayLineByPhysical,
    );
    lineCount = formatted.lineCount;
    deps.totalCharCount.value = displayText.length;
    deps.totalLineCount.value = formatted.lineCount;

    const isHeavyDocument =
      formatted.lineCount > 80_000 || displayText.length > 25_000_000;

    r.setPendingEbookInternalLinkSidecar?.(formatted.ebookSidecar ?? null);
    await r.setFullText(displayText, { heavy: isHeavyDocument });
    if (deps.leadIndentFullWidth.value) {
      r.normalizeLastLineLeadIndent?.();
    }
    await yieldToUi();
    deps.onReaderDisplayReady?.();
    if (restore != null && typeof restore === "object") {
      await deps.readerRef.value?.restoreViewportToRestoreAnchor?.(restore, [
        ...filteredDisplayToPhysicalLine,
      ]);
    } else if (typeof restore === "number") {
      await restoreViewportAfterDisplayChange(restore);
    }
    if (!finishAfterInstall) return true;
    await Promise.resolve(deps.afterFullTextInstalled());
    return true;
  }

  async function finalizeReaderMonaco(restorePhysicalLine?: number) {
    await applyReaderDisplayFromPhysicalLines(restorePhysicalLine);
  }

  async function flushCarry() {
    try {
      const tail = lineSplitter.flushEof();
      if (tail != null) {
        physicalLineContents.push(tail);
      }
    } finally {
      await finalizeReaderMonaco();
    }
  }

  function getPhysicalLineCount(): number {
    return physicalLineContents.length;
  }

  function getLineCount(): number {
    return lineCount;
  }

  function getDisplayLineToPhysicalLine(): readonly number[] {
    return filteredDisplayToPhysicalLine;
  }

  function getPhysicalLineContent(physicalLine: number) {
    const idx = Math.max(0, Math.floor(physicalLine) - 1);
    return physicalLineContents[idx] ?? "";
  }

  /** 当前展示层单行文本（优先 Monaco，与装饰/选区一致；回退 `lastFormattedDisplayLines`） */
  function getDisplayLineContent(displayLine: number): string {
    const reader = deps.readerRef.value;
    const ln = Math.max(1, Math.floor(displayLine));
    if (reader && typeof reader.getEditorLineContent === "function") {
      const lineCount =
        typeof reader.getModelLineCount === "function"
          ? reader.getModelLineCount()
          : 0;
      if (lineCount > 0 && ln <= lineCount) {
        return reader.getEditorLineContent(ln);
      }
    }
    if (deps.readerEditMode.value) return "";
    const idx = ln - 1;
    return lastFormattedDisplayLines[idx] ?? "";
  }

  /** 侧栏搜索等在物理行上的匹配 → Monaco 展示行列号 */
  function physicalSearchRangeToDisplayColumns(
    physicalLine: number,
    range: { start: number; end: number },
  ): { startColumn: number; endColumn: number } {
    const raw = getPhysicalLineContent(physicalLine);
    const columnMap = annotationColumnMapOptions({
      readerEditMode: deps.readerEditMode.value,
      leadIndentFullWidth: deps.leadIndentFullWidth.value,
    });
    const startColumn = physicalColumnToDisplayColumn(
      raw,
      range.start + 1,
      columnMap,
    );
    const endColumn = Math.max(
      physicalColumnToDisplayColumn(raw, range.start + 2, columnMap),
      physicalColumnToDisplayColumn(raw, range.end + 1, columnMap),
    );
    return { startColumn, endColumn };
  }

  function getPhysicalFilePlainText(): string {
    if (physicalLineContents.length === 0) return "";
    return physicalLineContents.join("\n");
  }

  /** 预览物理区间替换后的全文；失败返回 null（不改内存） */
  function buildPlainTextAfterPhysicalReplace(
    range: AnnotationRange,
    newText: string,
  ): string | null {
    const next = replaceTextInPhysicalLines(
      physicalLineContents,
      range,
      newText,
    );
    if (!next) return null;
    return next.join("\n");
  }

  /** 用纯文本覆盖物理行镜像（局部编辑写盘成功后提交） */
  function commitPhysicalLinesFromPlainText(text: string) {
    physicalLineContents = text.length > 0 ? text.split("\n") : [""];
    deps.totalCharCount.value = text.length;
    deps.totalLineCount.value = physicalLineContents.length;
  }

  function resyncMirrorFromReader() {
    syncMirrorFromReaderModel();
  }

  /** 插图删行后：用当前 Monaco 展示文刷新行缓存（format 结果在删行前） */
  function resyncFormattedDisplayLinesFromReader() {
    const text = deps.readerRef.value?.getAllText() ?? "";
    lastFormattedDisplayLines = text.length > 0 ? text.split("\n") : [];
  }

  function removeFilteredDisplayLinesAtOriginalIndices(
    deletedOriginalLineNumbersDesc: readonly number[],
  ) {
    if (deletedOriginalLineNumbersDesc.length === 0) {
      return;
    }
    for (const lineNum of deletedOriginalLineNumbersDesc) {
      const idx = Math.floor(lineNum) - 1;
      if (idx >= 0 && idx < filteredDisplayToPhysicalLine.length) {
        filteredDisplayToPhysicalLine.splice(idx, 1);
      }
    }
    shiftChapterTitleDisplayLineMap(
      chapterTitleDisplayLineByPhysical,
      deletedOriginalLineNumbersDesc,
    );
    lineCount = filteredDisplayToPhysicalLine.length;
    deps.totalLineCount.value = lineCount;
  }

  return {
    processChunk,
    flushCarry,
    resetStreamInternals,
    viewportDisplayLineToPhysicalLine,
    physicalLineToDisplayForReader,
    physicalLineToBottomDisplayForReader,
    calcProgressPercentByPhysicalLine,
    calcProgressPercentByViewportDisplay,
    getPhysicalLineCount,
    getLineCount,
    getDisplayLineToPhysicalLine,
    getPhysicalLineContent,
    getDisplayLineContent,
    physicalSearchRangeToDisplayColumns,
    getPhysicalFilePlainText,
    buildPlainTextAfterPhysicalReplace,
    commitPhysicalLinesFromPlainText,
    resyncMirrorFromReader,
    resyncFormattedDisplayLinesFromReader,
    removeFilteredDisplayLinesAtOriginalIndices,
    applyReaderDisplayFromPhysicalLines,
  };
}
