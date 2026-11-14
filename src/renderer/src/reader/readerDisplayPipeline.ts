import {
  chapterTitleBlankCounts,
  defaultChapterTitleBlankMode,
  type ChapterTitleBlankMode,
} from "../constants/appUi";
import {
  applyLeadIndentFullWidth,
  detectChapterTitle,
  filterChaptersByMinCharCount,
  getChapterTitlePrefilter,
  physicalOffsetToDisplayOffset,
  type Chapter,
} from "../chapter";
import { lineMayMatchChapterPrefilter } from "./chapterTitlePrefilter";
import { plainTextForEbookTitleMatch, visibleReaderLineFromPhysicalRaw } from "../ebook/ebookTitleMatch";
import {
  isMdAnchorMetadataOnlyPhysicalLine,
  stripMdInternalLinksFromPhysicalLines,
  type StripMdInternalLinksResult,
} from "../markdown/markdownInternalLinks";
import { lineContainsMdStripMarkup } from "../markdown/markdownLinkShared";
import {
  createMdInternalLinkSidecar,
  type MdCompactLinkHit,
  type MdInternalLinkOccurrence,
  type MdInternalLinkSidecar,
} from "../markdown/markdownLinkShared";
import { yieldToUi } from "../ebook/yieldToUi";
import {
  atxHeadingPrefixLength,
  collectQualifiedMarkdownChapterTitlePhysicalLines,
  detectMarkdownHeading,
  formatMarkdownHeadingLineForDisplay,
} from "../markdown/markdownChapter";
import { createMarkdownBlockContextTracker } from "../markdown/markdownBlockContext";
import { isBlankPhysicalLineContent } from "./lineMapping";
import { countCharsForLine } from "../utils/format";

export type ReaderDisplayFormatOptions = {
  compressBlankLines: boolean;
  compressBlankKeepOneBlank: boolean;
  /**
   * 压缩空行时章节标题留白（`before1` / `before1After1` / `before2After1`）。
   * 与「每行下方保留一个空行」独立：后者只作用于非标题正文行。
   */
  chapterTitleBlankMode: ChapterTitleBlankMode;
  leadIndentFullWidth: boolean;
  /** 与侧栏章节列表一致：不足最少字数的标题行不插入章节上下空行 */
  minCharCount?: number;
  /** Markdown：用 ATX `#` 标题（物理行扫描，跳过代码块） */
  isMarkdown?: boolean;
  /**
   * Markdown 编辑态格式化：保留行内 `##` 等原文，仅豁免标题行缩进/留白规则；
   * 只读展示仍为去掉 `#` 的标题正文。
   */
  preserveMarkdownSourceLines?: boolean;
  /**
   * 编辑态写回磁盘：按物理行原文处理（保留 `<span id>` 等），
   * 不走只读展示用的 span 剥离与 MD 侧车。
   */
  preservePhysicalSourceLines?: boolean;
  /**
   * 压缩空行时，首个合格章节标题前不插入预留空行（找书单章阅读等场景）。
   */
  skipBlanksBeforeFirstChapterTitle?: boolean;
};

export type ReaderDisplayFormatResult = {
  text: string;
  /** 展示行号 i（1-based）→ 源物理行号 */
  displayLineToPhysicalLine: number[];
  lineCount: number;
  /**
   * 章节标题源物理行 → 标题所在展示行（压缩空行插入留白时与 format 同次写出，供章节表精确映射）。
   */
  chapterTitleDisplayLineByPhysical: ReadonlyMap<number, number>;
  /** 已剥离 MD 内链且映射好展示行号的侧车数据（插图删行后须再 shift） */
  ebookSidecar?: MdInternalLinkSidecar;
};

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function firstQualifiedChapterTitlePhysicalLine(
  qualifiedChapterTitles: ReadonlySet<number>,
): number | null {
  let first = Infinity;
  for (const physicalLine of qualifiedChapterTitles) {
    if (physicalLine < first) first = physicalLine;
  }
  return first === Infinity ? null : first;
}

function shouldInsertBlanksBeforeChapterTitle(
  physicalLine: number,
  qualifiedChapterTitles: ReadonlySet<number>,
  options: ReaderDisplayFormatOptions,
): boolean {
  if (!options.skipBlanksBeforeFirstChapterTitle) return true;
  const first = firstQualifiedChapterTitlePhysicalLine(qualifiedChapterTitles);
  return first == null || physicalLine !== first;
}

/** 剥离后为空且原文仅 span 锚点：不占阅读器展示行（跳转仍按物理行号解析） */
function shouldOmitMdAnchorMetadataDisplayLine(
  mdStrip: StripMdInternalLinksResult | null | undefined,
  rawLine: string,
  strippedLine: string,
): boolean {
  if (!mdStrip) return false;
  return (
    isBlankPhysicalLineContent(strippedLine) &&
    isMdAnchorMetadataOnlyPhysicalLine(rawLine)
  );
}

/** 编辑态写回：保留物理行原文，不调用 {@link visibleReaderLineFromPhysicalRaw} */
function lineContentForPhysicalWriteBack(
  rawLine: string,
  strippedLine: string,
  mdStrip: StripMdInternalLinksResult | null | undefined,
  preservePhysicalSource: boolean,
): string {
  if (preservePhysicalSource) return rawLine;
  return mdStrip ? strippedLine : visibleReaderLineFromPhysicalRaw(rawLine);
}

function blankCheckLineForFormat(
  rawLine: string,
  strippedLine: string,
  preservePhysicalSource: boolean,
): string {
  return preservePhysicalSource ? rawLine : strippedLine;
}

function isEbookFalseChapterTitleFromLeadingLink(
  title: string,
  leadingLabels: readonly string[],
): boolean {
  const t = title.trim();
  return leadingLabels.some((lab) => {
    const L = lab.trim();
    return L.length > 0 && t.startsWith(L);
  });
}

/** 物理行章节匹配：按标记结构归一化后匹配，并排除链内假章节 */
function detectChapterTitleFromPhysicalLine(
  rawPhysicalLine: string,
  ebookHints?: {
    leadingLabels: readonly string[];
  },
): string | null {
  const title = detectChapterTitle(
    plainTextForEbookTitleMatch(rawPhysicalLine),
  );
  if (!title) return null;
  const leadingLabels = ebookHints?.leadingLabels;
  if (leadingLabels && leadingLabels.length > 0) {
    if (isEbookFalseChapterTitleFromLeadingLink(title, leadingLabels)) {
      return null;
    }
  }
  return title;
}

function lineForReaderDisplay(
  rawLine: string,
  leadIndentFullWidth: boolean,
  qualifiedChapterTitles: ReadonlySet<number>,
  physicalLine: number,
  exemptAsChapterTitle = false,
): string {
  if (!leadIndentFullWidth) return rawLine;
  return applyLeadIndentFullWidth(rawLine, {
    exemptChapterTitle:
      exemptAsChapterTitle || qualifiedChapterTitles.has(physicalLine),
  });
}

function resolvePhysicalLineDisplay(
  contentLine: string,
  physicalLine: number,
  options: ReaderDisplayFormatOptions,
  qualifiedChapterTitles: ReadonlySet<number>,
  mdTracker: ReturnType<typeof createMarkdownBlockContextTracker> | null,
  physicalRawForDetect?: string,
): { shown: string; isChapterTitleLine: boolean } {
  let content = contentLine;
  let isChapterTitleLine = false;
  const detectSource = physicalRawForDetect ?? contentLine;
  if (options.isMarkdown && mdTracker) {
    mdTracker.feedLine(detectSource);
    if (!mdTracker.isInCodeBlock()) {
      const h = detectMarkdownHeading(detectSource);
      if (h) {
        isChapterTitleLine = true;
        if (!options.preserveMarkdownSourceLines) {
          // contentLine 为 strip 后文本（内链已换成占位）；勿用 raw titleSource
          content = formatMarkdownHeadingLineForDisplay(contentLine);
        }
      }
    }
  } else {
    isChapterTitleLine =
      detectChapterTitleFromPhysicalLine(detectSource) != null;
  }
  const shown = lineForReaderDisplay(
    content,
    options.leadIndentFullWidth,
    qualifiedChapterTitles,
    physicalLine,
    isChapterTitleLine,
  );
  return { shown, isChapterTitleLine };
}

/**
 * 在物理行上按章节规则扫描，返回「计入侧栏章节表」的标题行物理行号（1-based）。
 * 字数统计与 {@link buildChaptersFromReaderDisplayText} 一致：不含标题行本身，不含格式化插入的空行。
 */
export function collectQualifiedChapterTitlePhysicalLines(
  physicalLines: readonly string[],
  options: {
    minCharCount: number;
    leadIndentFullWidth: boolean;
    isMarkdown?: boolean;
  },
  ebookHints?: {
    strippedLines: readonly string[];
    leadingByPhysicalLine: ReadonlyMap<number, readonly string[]>;
  },
): Set<number> {
  if (options.isMarkdown) {
    return collectQualifiedMarkdownChapterTitlePhysicalLines(physicalLines, {
      minCharCount: options.minCharCount,
    });
  }
  const floor = Math.max(0, Math.floor(options.minCharCount));
  const qualified = new Set<number>();
  const sectionTitleLines: number[] = [];
  const sectionCharCounts: number[] = [];
  let currentIdx = -1;
  let physicalLine = 0;
  const strippedLines = ebookHints?.strippedLines;
  const leadingByPhysicalLine = ebookHints?.leadingByPhysicalLine;
  const chapterTitlePrefilter = getChapterTitlePrefilter();

  for (const rawLine of physicalLines) {
    physicalLine += 1;
    // 本章标扫描与格式化主循环共用：不含任一规则必要字符的常见正文行一定
    // 匹配不到任何规则，可整段跳过 blank probe / 章节正则匹配。
    if (
      chapterTitlePrefilter != null &&
      !lineMayMatchChapterPrefilter(rawLine, chapterTitlePrefilter)
    ) {
      if (currentIdx >= 0) {
        const shown = options.leadIndentFullWidth
          ? applyLeadIndentFullWidth(rawLine, { exemptChapterTitle: false })
          : rawLine;
        sectionCharCounts[currentIdx]! += countCharsForLine(shown);
      }
      continue;
    }
    const blankProbe = strippedLines
      ? (strippedLines[physicalLine - 1] ?? rawLine)
      : rawLine;
    if (isBlankPhysicalLineContent(blankProbe)) continue;
    let title: string | null;
    if (leadingByPhysicalLine) {
      const leadingLabels = leadingByPhysicalLine.get(physicalLine);
      title = detectChapterTitleFromPhysicalLine(
        rawLine,
        leadingLabels && leadingLabels.length > 0
          ? { leadingLabels }
          : undefined,
      );
    } else {
      title = detectChapterTitleFromPhysicalLine(rawLine);
    }
    if (title) {
      sectionTitleLines.push(physicalLine);
      sectionCharCounts.push(0);
      currentIdx = sectionTitleLines.length - 1;
      if (floor <= 0) qualified.add(physicalLine);
      continue;
    }
    if (currentIdx >= 0) {
      const shown = options.leadIndentFullWidth
        ? applyLeadIndentFullWidth(rawLine, { exemptChapterTitle: false })
        : rawLine;
      sectionCharCounts[currentIdx]! += countCharsForLine(shown);
    }
  }

  if (floor <= 0) return qualified;
  for (let i = 0; i < sectionTitleLines.length; i += 1) {
    if (sectionCharCounts[i]! >= floor) qualified.add(sectionTitleLines[i]!);
  }
  return qualified;
}

function adjustLinkOccurrenceColumnsForShownLine(
  occ: MdInternalLinkOccurrence,
  strippedLine: string,
  shownLine: string,
): void {
  if (strippedLine === shownLine) return;
  const headingBody = formatMarkdownHeadingLineForDisplay(strippedLine);
  if (headingBody === shownLine) {
    const atxCols = atxHeadingPrefixLength(strippedLine);
    if (atxCols > 0 && strippedLine.slice(atxCols) === shownLine) {
      occ.startColumn = Math.max(1, occ.startColumn - atxCols);
      occ.endColumnExclusive = Math.max(
        occ.startColumn + 1,
        occ.endColumnExclusive - atxCols,
      );
      return;
    }
  }
  /**
   * 行首缩进：展示行对正文加了「　　」，但列映射若走 detectChapterTitle 豁免会与
   * resolvePhysicalLineDisplay 不一致（如目录行「第一章 …」内链左偏、右端缺字）。
   */
  if (strippedLine.length > 0) {
    const pos = shownLine.indexOf(strippedLine);
    if (pos >= 0) {
      occ.startColumn += pos;
      occ.endColumnExclusive += pos;
      return;
    }
  }
  const start0 = occ.startColumn - 1;
  const end0 = occ.endColumnExclusive - 1;
  occ.startColumn =
    physicalOffsetToDisplayOffset(strippedLine, start0, {
      exemptChapterTitle: false,
    }) + 1;
  occ.endColumnExclusive = Math.max(
    occ.startColumn + 1,
    physicalOffsetToDisplayOffset(strippedLine, end0, {
      exemptChapterTitle: false,
    }) + 1,
  );
}

function attachPendingMdLinksToDisplayLine(
  sidecar: MdInternalLinkSidecar,
  strippedLine: string,
  shownLine: string,
  displayLine: number,
  pending: readonly MdInternalLinkOccurrence[] | undefined,
  leadingLabels: readonly string[] | undefined,
): void {
  if (leadingLabels && leadingLabels.length > 0) {
    sidecar.leadingMdLinkLabelsByDisplayLine.set(displayLine, [
      ...leadingLabels,
    ]);
  }
  if (!pending || pending.length === 0) return;
  const hits: MdCompactLinkHit[] = [];
  for (const src of pending) {
    const occ: MdInternalLinkOccurrence = {
      ...src,
      physicalLine: displayLine,
    };
    adjustLinkOccurrenceColumnsForShownLine(occ, strippedLine, shownLine);
    hits.push({
      startColumn: occ.startColumn,
      endColumnExclusive: occ.endColumnExclusive,
      targetId: occ.targetId,
      iconRel: occ.iconRel,
      label: occ.label,
      hoverTip: occ.hoverTip,
      builtinLinkIcon: occ.builtinLinkIcon,
      externalUrl: occ.externalUrl,
      inlineImage: occ.inlineImage,
    });
  }
  sidecar.hitsByDisplayLine.set(displayLine, hits);
}

/**
 * 由源文件物理行生成阅读器展示正文（压缩空行 / 行首缩进可组合）。
 * 只读加载完成、顶栏切换展示选项、编辑模式「格式化」均走此函数。
 */
export function formatPhysicalLinesForReader(
  physicalLines: readonly string[],
  options: ReaderDisplayFormatOptions,
  preStrip?: StripMdInternalLinksResult,
): ReaderDisplayFormatResult {
  const minCharCount = options.minCharCount ?? 0;
  /** 编辑态写回：按物理行原文压缩/缩进，不走只读 MD 侧车剥离（避免 `<span id>` 等被删） */
  const preservePhysicalSource = options.preservePhysicalSourceLines === true;
  const hasMdLinks =
    options.isMarkdown &&
    !preservePhysicalSource &&
    (preStrip != null ||
      physicalLines.some(
        (line) =>
          lineContainsMdStripMarkup(line) || /<span\s+id=/i.test(line),
      ));
  const mdStrip =
    preStrip ??
    (hasMdLinks ? stripMdInternalLinksFromPhysicalLines(physicalLines) : null);
  const ebookSidecar = hasMdLinks ? createMdInternalLinkSidecar() : undefined;
  if (mdStrip && ebookSidecar) {
    for (const [id, line] of mdStrip.idToPhysicalLine) {
      ebookSidecar.idToPhysicalLine.set(id, line);
    }
  }
  const contentLines = mdStrip?.strippedLines ?? physicalLines;
  const mdHints = mdStrip
    ? {
        strippedLines: mdStrip.strippedLines,
        leadingByPhysicalLine: mdStrip.leadingByPhysicalLine,
      }
    : undefined;

  const qualifiedChapterTitles = collectQualifiedChapterTitlePhysicalLines(
    physicalLines,
    {
      minCharCount,
      leadIndentFullWidth: options.leadIndentFullWidth,
      isMarkdown: options.isMarkdown,
    },
    mdHints,
  );

  const mdTracker = options.isMarkdown
    ? createMarkdownBlockContextTracker()
    : null;

  const chapterTitleDisplayLineByPhysical = new Map<number, number>();

  if (!options.compressBlankLines) {
    const out: string[] = [];
    const displayLineToPhysicalLine: number[] = [];
    let physicalLine = 0;
    for (const rawLine of physicalLines) {
      physicalLine += 1;
      const strippedLine = contentLines[physicalLine - 1] ?? rawLine;
      if (
        !preservePhysicalSource &&
        shouldOmitMdAnchorMetadataDisplayLine(mdStrip, rawLine, strippedLine)
      ) {
        continue;
      }
      const visibleLine = lineContentForPhysicalWriteBack(
        rawLine,
        strippedLine,
        mdStrip,
        preservePhysicalSource,
      );
      const { shown } = resolvePhysicalLineDisplay(
        visibleLine,
        physicalLine,
        options,
        qualifiedChapterTitles,
        mdTracker,
        rawLine,
      );
      const displayLine = out.length + 1;
      out.push(shown);
      displayLineToPhysicalLine.push(physicalLine);
      if (
        qualifiedChapterTitles.has(physicalLine) &&
        shown.trim().length > 0
      ) {
        chapterTitleDisplayLineByPhysical.set(physicalLine, displayLine);
      }
      if (ebookSidecar && mdStrip) {
        attachPendingMdLinksToDisplayLine(
          ebookSidecar,
          strippedLine,
          shown,
          displayLine,
          mdStrip.pendingLinksByPhysicalLine.get(physicalLine),
          mdStrip.leadingByPhysicalLine.get(physicalLine),
        );
      }
    }
    return {
      text: out.join("\n"),
      displayLineToPhysicalLine,
      lineCount: out.length,
      chapterTitleDisplayLineByPhysical,
      ebookSidecar,
    };
  }

  const keepOneBlank = options.compressBlankKeepOneBlank;
  const titleBlanks = chapterTitleBlankCounts(
    options.chapterTitleBlankMode ?? defaultChapterTitleBlankMode,
  );
  const blanksAbove = titleBlanks.before;
  const blanksBelow = titleBlanks.after;
  const out: string[] = [];
  const displayLineToPhysicalLine: number[] = [];

  const pushDisplay = (
    lineText: string,
    physicalLine: number,
    linkContext?: {
      strippedLine: string;
      shownLine: string;
    },
  ) => {
    const displayLine = out.length + 1;
    displayLineToPhysicalLine.push(physicalLine);
    out.push(lineText);
    if (
      ebookSidecar &&
      mdStrip &&
      linkContext &&
      lineText === linkContext.shownLine
    ) {
      attachPendingMdLinksToDisplayLine(
        ebookSidecar,
        linkContext.strippedLine,
        linkContext.shownLine,
        displayLine,
        mdStrip.pendingLinksByPhysicalLine.get(physicalLine),
        mdStrip.leadingByPhysicalLine.get(physicalLine),
      );
    }
    return displayLine;
  };

  let physicalLine = 0;
  for (const rawLine of physicalLines) {
    physicalLine += 1;
    const strippedLine = contentLines[physicalLine - 1] ?? rawLine;
    if (
      !preservePhysicalSource &&
      shouldOmitMdAnchorMetadataDisplayLine(mdStrip, rawLine, strippedLine)
    ) {
      continue;
    }
    if (
      isBlankPhysicalLineContent(
        blankCheckLineForFormat(rawLine, strippedLine, preservePhysicalSource),
      )
    ) {
      continue;
    }
    const visibleLine = lineContentForPhysicalWriteBack(
      rawLine,
      strippedLine,
      mdStrip,
      preservePhysicalSource,
    );
    const { shown } = resolvePhysicalLineDisplay(
      visibleLine,
      physicalLine,
      options,
      qualifiedChapterTitles,
      mdTracker,
      rawLine,
    );
    const linkContext = { strippedLine, shownLine: shown };
    const isQualifiedChapterTitle = qualifiedChapterTitles.has(physicalLine);
    const hasVisibleTitle = shown.trim().length > 0;
    if (isQualifiedChapterTitle && hasVisibleTitle) {
      if (
        shouldInsertBlanksBeforeChapterTitle(
          physicalLine,
          qualifiedChapterTitles,
          options,
        )
      ) {
        for (let i = 0; i < blanksAbove; i += 1) {
          pushDisplay("", physicalLine);
        }
      }
      const titleDisplayLine = pushDisplay(shown, physicalLine, linkContext);
      chapterTitleDisplayLineByPhysical.set(physicalLine, titleDisplayLine);
      for (let i = 0; i < blanksBelow; i += 1) {
        pushDisplay("", physicalLine);
      }
    } else {
      pushDisplay(shown, physicalLine, linkContext);
      if (keepOneBlank) pushDisplay("", physicalLine);
    }
  }

  return {
    text: out.join("\n"),
    displayLineToPhysicalLine,
    lineCount: out.length,
    chapterTitleDisplayLineByPhysical,
    ebookSidecar,
  };
}

export function formatPhysicalPlainTextForReader(
  physicalPlainText: string,
  options: ReaderDisplayFormatOptions,
): ReaderDisplayFormatResult {
  const normalized = normalizeNewlines(physicalPlainText);
  const lines = normalized.length > 0 ? normalized.split("\n") : [];
  return formatPhysicalLinesForReader(lines, options);
}

/** 焦点窗口（按物理行计）在两端的留白，用于首屏渲染时给上/下滚动留出余量 */
export const READER_FOCUS_WINDOW_SIZE = 4_000;
/** 首屏窗口按「章节」扩展时，最多向后找几章 */
export const READER_FOCUS_WINDOW_CHAPTERS_AHEAD = 5;
/** 向前回溯找章节标题的最大行数（防止无章节书退化为全量扫描） */
const READER_FOCUS_WINDOW_CHAPTER_SCAN_BACK = 30_000;
/** 按章节扩展后的窗口上限（行）；超出后回落到按行数取窗口 */
const READER_FOCUS_WINDOW_MAX_LINES = 60_000;

export type ReaderFocusWindow = {
  /** 焦点窗口首个物理行（1-based，含） */
  startPhysicalLine: number;
  /** 焦点窗口末个物理行（1-based，含） */
  endPhysicalLine: number;
};

/**
 * 以当前阅读位置为中心，计算首屏渲染窗口（按行）。
 * 窗口起点会向前对齐到最近的章节标题，避免首屏从段落中间开始。
 */
export function resolveReaderFocusWindow(
  focusPhysicalLine: number,
  totalPhysicalLines: number,
  options?: {
    size?: number;
    /** 找出 ≤ physicalLine 的最近章节标题行；没有则返回 null */
    findChapterTitleAtOrBefore?: (physicalLine: number) => number | null;
  },
): ReaderFocusWindow | null {
  const total = Math.max(0, Math.floor(totalPhysicalLines));
  if (total <= 0) return null;
  const size = Math.max(
    400,
    Math.floor(options?.size ?? READER_FOCUS_WINDOW_SIZE),
  );
  let focus = Math.max(1, Math.min(total, Math.floor(focusPhysicalLine)));
  const titleLine = options?.findChapterTitleAtOrBefore?.(focus) ?? null;
  if (titleLine != null && titleLine >= 1 && titleLine <= focus) {
    focus = titleLine;
  }
  // 章节标题放在窗口前部，留出「向上翻」的空间
  const before = Math.floor(size * 0.15);
  let start = Math.max(1, focus - before);
  let end = Math.min(total, start + size - 1);
  if (end >= total) start = Math.max(1, total - size + 1);
  return { startPhysicalLine: start, endPhysicalLine: end };
}

/**
 * 首屏窗口（按章节）：从当前阅读位置向前找到本章标题，再向后最多
 * {@link READER_FOCUS_WINDOW_CHAPTERS_AHEAD} 章，其余部分留给后台补齐。
 *
 * 只扫描 `available` 行内已有内容：流式读盘尚未到头时，窗口终点就是已读到的位置；
 * 没有任何章节标题（或可用行太少）时回落到按行数的 {@link resolveReaderFocusWindow}。
 */
export function resolveChapterAlignedFocusWindow(
  physicalLines: readonly string[],
  focusPhysicalLine: number,
  availableLines = physicalLines.length,
  options?: { chaptersAhead?: number },
): ReaderFocusWindow | null {
  const available = Math.max(
    0,
    Math.min(Math.floor(availableLines), physicalLines.length),
  );
  if (available <= 0) return null;
  const focus = Math.max(1, Math.min(available, Math.floor(focusPhysicalLine)));
  const chaptersAhead = Math.max(
    1,
    Math.floor(options?.chaptersAhead ?? READER_FOCUS_WINDOW_CHAPTERS_AHEAD),
  );

  // 向前回溯本章标题（有界）
  const backScanFrom = Math.max(1, focus - READER_FOCUS_WINDOW_CHAPTER_SCAN_BACK);
  let chapterStart = focus;
  for (let p = focus; p >= backScanFrom; p -= 1) {
    if (detectChapterTitle(physicalLines[p - 1] ?? "") != null) {
      chapterStart = p;
      break;
    }
  }

  // 从本章标题起向后数章节，决定窗口终点
  let end = Math.min(available, chapterStart + READER_FOCUS_WINDOW_MAX_LINES - 1);
  let found = 0;
  let lastTitleLine = chapterStart;
  for (let p = chapterStart; p <= end; p += 1) {
    if (detectChapterTitle(physicalLines[p - 1] ?? "") == null) continue;
    found += 1;
    lastTitleLine = p;
    if (found > chaptersAhead) {
      // 第 N+1 个标题已到：窗口收在其前几行，避免把下一章截断在开头
      end = Math.min(available, p - 1);
      break;
    }
  }
  if (found === 0) {
    // 没有章节：至少给出以当前位置为中心的固定窗口
    return resolveReaderFocusWindow(focus, available);
  }
  // 窗口末尾补几行，避免末章正好贴在视口底边
  end = Math.min(available, Math.max(end, lastTitleLine + 3));
  const start = chapterStart;
  if (end - start + 1 < 200) {
    // 章节极短：补足到 200 行，保证首屏与上下翻页都有内容
    end = Math.min(available, start + 199);
  }
  return { startPhysicalLine: start, endPhysicalLine: end };
}


/** 大文件格式化主循环分块让出 UI（strip 已异步完成） */
export async function formatPhysicalLinesForReaderAsync(
  physicalLines: readonly string[],
  options: ReaderDisplayFormatOptions,
  preStrip?: StripMdInternalLinksResult,
  yieldEvery = 8_000,
): Promise<ReaderDisplayFormatResult> {
  if (physicalLines.length <= yieldEvery) {
    return formatPhysicalLinesForReader(physicalLines, options, preStrip);
  }
  const minCharCount = options.minCharCount ?? 0;
  /** 编辑态写回：按物理行原文压缩/缩进，不走只读 MD 侧车剥离（避免 `<span id>` 等被删） */
  const preservePhysicalSource = options.preservePhysicalSourceLines === true;
  const hasMdLinks =
    options.isMarkdown &&
    !preservePhysicalSource &&
    (preStrip != null ||
      physicalLines.some(
        (line) =>
          lineContainsMdStripMarkup(line) || /<span\s+id=/i.test(line),
      ));
  const mdStrip =
    preStrip ??
    (hasMdLinks ? stripMdInternalLinksFromPhysicalLines(physicalLines) : null);
  const ebookSidecar = hasMdLinks ? createMdInternalLinkSidecar() : undefined;
  if (mdStrip && ebookSidecar) {
    for (const [id, line] of mdStrip.idToPhysicalLine) {
      ebookSidecar.idToPhysicalLine.set(id, line);
    }
  }
  const contentLines = mdStrip?.strippedLines ?? physicalLines;
  const mdHints = mdStrip
    ? {
        strippedLines: mdStrip.strippedLines,
        leadingByPhysicalLine: mdStrip.leadingByPhysicalLine,
      }
    : undefined;

  const qualifiedChapterTitles = collectQualifiedChapterTitlePhysicalLines(
    physicalLines,
    {
      minCharCount,
      leadIndentFullWidth: options.leadIndentFullWidth,
      isMarkdown: options.isMarkdown,
    },
    mdHints,
  );

  const mdTracker = options.isMarkdown
    ? createMarkdownBlockContextTracker()
    : null;

  const chapterTitleDisplayLineByPhysical = new Map<number, number>();

  if (!options.compressBlankLines) {
    const out: string[] = [];
    const displayLineToPhysicalLine: number[] = [];
    let physicalLine = 0;
    for (let i = 0; i < physicalLines.length; i++) {
      if (i > 0 && i % yieldEvery === 0) {
        await yieldToUi();
      }
      physicalLine += 1;
      const rawLine = physicalLines[i] ?? "";
      const strippedLine = contentLines[physicalLine - 1] ?? rawLine;
      if (
        !preservePhysicalSource &&
        shouldOmitMdAnchorMetadataDisplayLine(mdStrip, rawLine, strippedLine)
      ) {
        continue;
      }
      const visibleLine = lineContentForPhysicalWriteBack(
        rawLine,
        strippedLine,
        mdStrip,
        preservePhysicalSource,
      );
      const { shown } = resolvePhysicalLineDisplay(
        visibleLine,
        physicalLine,
        options,
        qualifiedChapterTitles,
        mdTracker,
        rawLine,
      );
      const displayLine = out.length + 1;
      out.push(shown);
      displayLineToPhysicalLine.push(physicalLine);
      if (
        qualifiedChapterTitles.has(physicalLine) &&
        shown.trim().length > 0
      ) {
        chapterTitleDisplayLineByPhysical.set(physicalLine, displayLine);
      }
      if (ebookSidecar && mdStrip) {
        attachPendingMdLinksToDisplayLine(
          ebookSidecar,
          strippedLine,
          shown,
          displayLine,
          mdStrip.pendingLinksByPhysicalLine.get(physicalLine),
          mdStrip.leadingByPhysicalLine.get(physicalLine),
        );
      }
    }
    return {
      text: out.join("\n"),
      displayLineToPhysicalLine,
      lineCount: out.length,
      chapterTitleDisplayLineByPhysical,
      ebookSidecar,
    };
  }

  const keepOneBlank = options.compressBlankKeepOneBlank;
  const titleBlanks = chapterTitleBlankCounts(
    options.chapterTitleBlankMode ?? defaultChapterTitleBlankMode,
  );
  const blanksAbove = titleBlanks.before;
  const blanksBelow = titleBlanks.after;
  const out: string[] = [];
  const displayLineToPhysicalLine: number[] = [];

  const pushDisplay = (
    lineText: string,
    physicalLine: number,
    linkContext?: {
      strippedLine: string;
      shownLine: string;
    },
  ) => {
    const displayLine = out.length + 1;
    displayLineToPhysicalLine.push(physicalLine);
    out.push(lineText);
    if (
      ebookSidecar &&
      mdStrip &&
      linkContext &&
      lineText === linkContext.shownLine
    ) {
      attachPendingMdLinksToDisplayLine(
        ebookSidecar,
        linkContext.strippedLine,
        linkContext.shownLine,
        displayLine,
        mdStrip.pendingLinksByPhysicalLine.get(physicalLine),
        mdStrip.leadingByPhysicalLine.get(physicalLine),
      );
    }
    return displayLine;
  };

  let physicalLine = 0;
  let scanned = 0;
  for (const rawLine of physicalLines) {
    scanned += 1;
    if (scanned > 0 && scanned % yieldEvery === 0) {
      await yieldToUi();
    }
    physicalLine += 1;
    const strippedLine = contentLines[physicalLine - 1] ?? rawLine;
    if (
      !preservePhysicalSource &&
      shouldOmitMdAnchorMetadataDisplayLine(mdStrip, rawLine, strippedLine)
    ) {
      continue;
    }
    if (
      isBlankPhysicalLineContent(
        blankCheckLineForFormat(rawLine, strippedLine, preservePhysicalSource),
      )
    ) {
      continue;
    }
    const visibleLine = lineContentForPhysicalWriteBack(
      rawLine,
      strippedLine,
      mdStrip,
      preservePhysicalSource,
    );
    const { shown } = resolvePhysicalLineDisplay(
      visibleLine,
      physicalLine,
      options,
      qualifiedChapterTitles,
      mdTracker,
      rawLine,
    );
    const linkContext = { strippedLine, shownLine: shown };
    const isQualifiedChapterTitle = qualifiedChapterTitles.has(physicalLine);
    const hasVisibleTitle = shown.trim().length > 0;
    if (isQualifiedChapterTitle && hasVisibleTitle) {
      if (
        shouldInsertBlanksBeforeChapterTitle(
          physicalLine,
          qualifiedChapterTitles,
          options,
        )
      ) {
        for (let j = 0; j < blanksAbove; j += 1) {
          pushDisplay("", physicalLine);
        }
      }
      const titleDisplayLine = pushDisplay(shown, physicalLine, linkContext);
      chapterTitleDisplayLineByPhysical.set(physicalLine, titleDisplayLine);
      for (let j = 0; j < blanksBelow; j += 1) {
        pushDisplay("", physicalLine);
      }
    } else {
      pushDisplay(shown, physicalLine, linkContext);
      if (keepOneBlank) pushDisplay("", physicalLine);
    }
  }

  return {
    text: out.join("\n"),
    displayLineToPhysicalLine,
    lineCount: out.length,
    chapterTitleDisplayLineByPhysical,
    ebookSidecar,
  };
}

export type BuildChaptersFromDisplayOptions = {
  minCharCount: number;
  /** 电子书行首内链标签：展示行号 → 标签文案列表 */
  leadingLinkLabelsByDisplayLine?: ReadonlyMap<
    number,
    readonly string[]
  >;
};

/**
 * 对 Monaco **展示**行数组匹配章节（避免超大书 `getAllText` + `split` 双倍内存）。
 */
export function buildChaptersFromReaderDisplayLines(
  lines: readonly string[],
  options: BuildChaptersFromDisplayOptions,
): Chapter[] {
  const leadingLinkLabels =
    options.leadingLinkLabelsByDisplayLine ??
    new Map<number, readonly string[]>();

  const next: Chapter[] = [];
  let lineNo = 0;
  let currentIdx = -1;

  for (const rawLine of lines) {
    lineNo += 1;
    const title = detectChapterTitle(rawLine);
    if (title) {
      const labels = leadingLinkLabels.get(lineNo);
      if (labels && labels.length > 0) {
        const t = title.trim();
        const fromLeadingLink = labels.some((lab) => {
          const L = lab.trim();
          return L.length > 0 && t.startsWith(L);
        });
        if (fromLeadingLink) {
          if (currentIdx >= 0) {
            next[currentIdx]!.charCount += countCharsForLine(rawLine);
          }
          continue;
        }
      }
      next.push({ title, lineNumber: lineNo, charCount: 0 });
      currentIdx = next.length - 1;
      continue;
    }
    if (currentIdx >= 0) {
      next[currentIdx]!.charCount += countCharsForLine(rawLine);
    }
  }

  return filterChaptersByMinCharCount(next, options.minCharCount);
}

/**
 * 对当前 Monaco **展示**全文匹配章节并统计字数（加载后 / 规则变更 / 刷新章节共用）。
 */
export function buildChaptersFromReaderDisplayText(
  displayText: string,
  options: BuildChaptersFromDisplayOptions,
): Chapter[] {
  const normalized = normalizeNewlines(displayText);
  const lines = normalized.length > 0 ? normalized.split("\n") : [];
  return buildChaptersFromReaderDisplayLines(lines, options);
}
