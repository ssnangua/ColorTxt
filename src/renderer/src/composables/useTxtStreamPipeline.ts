import type { Ref } from "vue";
import {
  applyLeadIndentFullWidth,
  detectChapterTitle,
  type Chapter,
} from "../chapter";
import type ReaderMain from "../components/ReaderMain.vue";
import {
  isBlankPhysicalLineContent,
  physicalLineToFilteredDisplayLine,
} from "../reader/lineMapping";
import {
  countCharsForLine,
  floorReadingProgressPercentByLines,
} from "../utils/format";
import { createPhysicalLineSplitter } from "../services/physicalLineStream";

type ReaderRef = Ref<InstanceType<typeof ReaderMain> | null>;

/**
 * txt 流式解析：物理行计数、滤空映射、章节检测与写入 Monaco。
 * 状态与 App 内原实现一致，供 App.vue 集中管理阅读器数据流。
 */
export function useTxtStreamPipeline(deps: {
  readerRef: ReaderRef;
  chapters: Ref<Chapter[]>;
  totalCharCount: Ref<number>;
  totalLineCount: Ref<number>;
  compressBlankLines: Ref<boolean>;
  /** 压缩空行时是否在每行正文下方保留一行空行（章节标题行除外） */
  compressBlankKeepOneBlank: Ref<boolean>;
  leadIndentFullWidth: Ref<boolean>;
}) {
  const lineSplitter = createPhysicalLineSplitter();

  let lineCount = 0;
  /** 源文件物理行号（含空行），与 Monaco 未滤空时的行号一致 */
  let physicalLineCount = 0;
  let physicalLineContents: string[] = [];
  /**
   * 滤空行时：显示行号 i（1-based）对应源文件中的物理行号
   * 下标 i-1 为第 i 个显示行
   */
  let filteredDisplayToPhysicalLine: number[] = [];
  let currentChapterIdx = -1;
  /** 主进程分块读盘时先累积于此，流结束再一次性 `setFullText` 写入 Monaco */
  let monacoBuffer = "";

  function lineForReaderDisplay(rawLine: string): string {
    return deps.leadIndentFullWidth.value
      ? applyLeadIndentFullWidth(rawLine)
      : rawLine;
  }

  /** 当前阅读器「显示行号」→ 源文件物理行号（未滤空时二者相同） */
  function viewportDisplayLineToPhysicalLine(displayLine: number): number {
    const v = Math.max(1, Math.floor(displayLine));
    if (!deps.compressBlankLines.value) return v;
    const idx = v - 1;
    if (idx < 0) return 1;
    if (idx >= filteredDisplayToPhysicalLine.length) {
      return (
        filteredDisplayToPhysicalLine[
          filteredDisplayToPhysicalLine.length - 1
        ] ?? 1
      );
    }
    return filteredDisplayToPhysicalLine[idx]!;
  }

  /** 滤空模式下将物理行映射为 Monaco 显示行 */
  function physicalLineToDisplayForReader(physicalLine: number): number {
    if (!deps.compressBlankLines.value) {
      return Math.max(1, Math.floor(physicalLine));
    }
    return physicalLineToFilteredDisplayLine(
      physicalLine,
      filteredDisplayToPhysicalLine,
    );
  }

  /** 按源文件物理行号与当前已解析的物理总行数估算阅读进度（%） */
  function calcProgressPercentByPhysicalLine(
    physicalLine: number,
  ): number | undefined {
    const total = physicalLineCount;
    if (total <= 0) return undefined;
    const current = Math.min(total, Math.max(1, Math.floor(physicalLine)));
    return floorReadingProgressPercentByLines(current, total);
  }

  /**
   * 与底栏/持久化一致：按视口在正文中的位置估算 %。
   * 视口顶行为文档首行时强制 0%；视口末行为文档末行时强制 100%（整篇可见时后者优先）。
   */
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
    lineCount = 0;
    physicalLineCount = 0;
    physicalLineContents = [];
    filteredDisplayToPhysicalLine = [];
    currentChapterIdx = -1;
    monacoBuffer = "";
    lineSplitter.reset();
  }

  function finalizeReaderMonaco() {
    const r = deps.readerRef.value;
    if (!r) return;
    r.setFullText(monacoBuffer);
    r.setChapters(
      deps.chapters.value.map((ch) => ({
        title: ch.title,
        lineNumber: ch.lineNumber,
      })),
    );
    if (deps.leadIndentFullWidth.value) {
      r.normalizeLastLineLeadIndent();
    }
  }

  function rememberPhysicalLineContent(content: string) {
    physicalLineContents.push(content);
  }

  function pushDisplayLine(
    out: string[],
    text: string,
    physicalLine: number,
    withTrailingNewline: boolean,
  ) {
    lineCount += 1;
    deps.totalLineCount.value = lineCount;
    filteredDisplayToPhysicalLine.push(physicalLine);
    out.push(withTrailingNewline ? `${text}\n` : text);
  }

  function flushBlankNormalizationForChapter(
    out: string[],
    chapterPhysicalLine: number,
    withTrailingNewline: boolean,
    /** 与当前 chunk 开始时「保留一个空行」一致，由调用方每 chunk / EOF 读一次 deps，避免每行读 ref */
    keepOneBlank: boolean,
  ) {
    // 标题上方：启用「压缩空行时保留一个空行」时为 1 行，否则为 2 行；源文本原有空白全部吸收。
    const blanksAbove = keepOneBlank ? 1 : 2;
    for (let i = 0; i < blanksAbove; i += 1) {
      pushDisplayLine(out, "", chapterPhysicalLine, withTrailingNewline);
    }
  }

  function processChunk(chunk: string) {
    const parts = lineSplitter.push(chunk);

    if (!deps.compressBlankLines.value && !deps.leadIndentFullWidth.value) {
      for (const rawLine of parts) {
        physicalLineCount += 1;
        rememberPhysicalLineContent(rawLine);
        deps.totalCharCount.value += countCharsForLine(rawLine);
        lineCount += 1;
        deps.totalLineCount.value = lineCount;
        const title = detectChapterTitle(rawLine);
        if (title) {
          deps.chapters.value.push({
            title,
            lineNumber: lineCount,
            charCount: 0,
          });
          currentChapterIdx = deps.chapters.value.length - 1;
        } else if (currentChapterIdx >= 0) {
          deps.chapters.value[currentChapterIdx].charCount +=
            countCharsForLine(rawLine);
        }
      }
      monacoBuffer += chunk;
      return;
    }

    if (!deps.compressBlankLines.value && deps.leadIndentFullWidth.value) {
      // 不把 splitter 的 pending 写入阅读器：pending 是未闭合行的后缀，下一 chunk 会在 parts[0]
      // 里再次输出整行；若这里追加 pending 会与下一 chunk 重复（常见于换行符落在新 chunk 开头时）。
      for (const rawLine of parts) {
        physicalLineCount += 1;
        rememberPhysicalLineContent(rawLine);
        const shown = applyLeadIndentFullWidth(rawLine);
        deps.totalCharCount.value += countCharsForLine(shown);
        lineCount += 1;
        deps.totalLineCount.value = lineCount;
        const title = detectChapterTitle(rawLine);
        if (title) {
          deps.chapters.value.push({
            title,
            lineNumber: lineCount,
            charCount: 0,
          });
          currentChapterIdx = deps.chapters.value.length - 1;
        } else if (currentChapterIdx >= 0) {
          deps.chapters.value[currentChapterIdx].charCount +=
            countCharsForLine(shown);
        }
      }
      let toAppend = "";
      for (const rawLine of parts) {
        toAppend += `${applyLeadIndentFullWidth(rawLine)}\n`;
      }
      if (toAppend) monacoBuffer += toAppend;
      return;
    }

    const toAppendParts: string[] = [];
    const keepOneBlank = deps.compressBlankKeepOneBlank.value;
    for (const rawLine of parts) {
      physicalLineCount += 1;
      rememberPhysicalLineContent(rawLine);
      if (isBlankPhysicalLineContent(rawLine)) {
        continue;
      }
      const shown = lineForReaderDisplay(rawLine);
      deps.totalCharCount.value += countCharsForLine(shown);
      const title = detectChapterTitle(rawLine);
      if (title) {
        flushBlankNormalizationForChapter(
          toAppendParts,
          physicalLineCount,
          true,
          keepOneBlank,
        );
        pushDisplayLine(toAppendParts, shown, physicalLineCount, true);
        deps.chapters.value.push({
          title,
          lineNumber: lineCount,
          charCount: 0,
        });
        currentChapterIdx = deps.chapters.value.length - 1;
        // 标题下方固定 1 行空白。
        pushDisplayLine(toAppendParts, "", physicalLineCount, true);
      } else if (currentChapterIdx >= 0) {
        pushDisplayLine(toAppendParts, shown, physicalLineCount, true);
        if (keepOneBlank) {
          pushDisplayLine(toAppendParts, "", physicalLineCount, true);
        }
        deps.chapters.value[currentChapterIdx].charCount +=
          countCharsForLine(shown);
      } else {
        pushDisplayLine(toAppendParts, shown, physicalLineCount, true);
        if (keepOneBlank) {
          pushDisplayLine(toAppendParts, "", physicalLineCount, true);
        }
      }
    }
    if (toAppendParts.length > 0) {
      monacoBuffer += toAppendParts.join("");
    }
  }

  function flushCarry() {
    try {
      const tail = lineSplitter.flushEof();
      if (tail == null) {
        return;
      }

      if (!deps.compressBlankLines.value) {
        const tailShown = deps.leadIndentFullWidth.value
          ? applyLeadIndentFullWidth(tail)
          : tail;
        physicalLineCount += 1;
        rememberPhysicalLineContent(tail);
        deps.totalCharCount.value += countCharsForLine(tailShown);
        lineCount += 1;
        deps.totalLineCount.value = lineCount;
        const title = detectChapterTitle(tail);
        if (title) {
          deps.chapters.value.push({
            title,
            lineNumber: lineCount,
            charCount: 0,
          });
          currentChapterIdx = deps.chapters.value.length - 1;
        } else if (currentChapterIdx >= 0) {
          deps.chapters.value[currentChapterIdx].charCount +=
            countCharsForLine(tailShown);
        }
        // 未开「全角缩进」时正文已随各 chunk 写入 buffer；尾行无换行符时已在最后一块中。
        if (deps.leadIndentFullWidth.value) {
          monacoBuffer += tailShown;
        }
        return;
      }

      physicalLineCount += 1;
      rememberPhysicalLineContent(tail);
      if (isBlankPhysicalLineContent(tail)) {
        return;
      }

      const tailShown = lineForReaderDisplay(tail);
      deps.totalCharCount.value += countCharsForLine(tailShown);
      const toAppendParts: string[] = [];
      const title = detectChapterTitle(tail);
      const keepOneBlank = deps.compressBlankKeepOneBlank.value;
      if (title) {
        flushBlankNormalizationForChapter(
          toAppendParts,
          physicalLineCount,
          true,
          keepOneBlank,
        );
        pushDisplayLine(toAppendParts, tailShown, physicalLineCount, true);
        deps.chapters.value.push({ title, lineNumber: lineCount, charCount: 0 });
        currentChapterIdx = deps.chapters.value.length - 1;
        pushDisplayLine(toAppendParts, "", physicalLineCount, true);
      } else if (currentChapterIdx >= 0) {
        if (keepOneBlank) {
          pushDisplayLine(toAppendParts, tailShown, physicalLineCount, true);
          pushDisplayLine(toAppendParts, "", physicalLineCount, true);
        } else {
          pushDisplayLine(toAppendParts, tailShown, physicalLineCount, false);
        }
        deps.chapters.value[currentChapterIdx].charCount +=
          countCharsForLine(tailShown);
      } else {
        if (keepOneBlank) {
          pushDisplayLine(toAppendParts, tailShown, physicalLineCount, true);
          pushDisplayLine(toAppendParts, "", physicalLineCount, true);
        } else {
          pushDisplayLine(toAppendParts, tailShown, physicalLineCount, false);
        }
      }
      if (toAppendParts.length > 0) {
        monacoBuffer += toAppendParts.join("");
      }
    } finally {
      finalizeReaderMonaco();
    }
  }

  function getPhysicalLineCount(): number {
    return physicalLineCount;
  }

  function getLineCount(): number {
    return lineCount;
  }

  function getPhysicalLineContent(physicalLine: number) {
    const idx = Math.max(0, Math.floor(physicalLine) - 1);
    return physicalLineContents[idx] ?? "";
  }

  /** 从当前正文重算章节列表后，同步流式解析用的章节字数累计游标 */
  function setChapterWriteIndex(idx: number) {
    currentChapterIdx = idx;
  }

  return {
    processChunk,
    flushCarry,
    resetStreamInternals,
    viewportDisplayLineToPhysicalLine,
    physicalLineToDisplayForReader,
    calcProgressPercentByPhysicalLine,
    calcProgressPercentByViewportDisplay,
    getPhysicalLineCount,
    getLineCount,
    getPhysicalLineContent,
    setChapterWriteIndex,
  };
}
