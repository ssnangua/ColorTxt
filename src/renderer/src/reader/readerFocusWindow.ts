/**
 * 首屏分阶段渲染的「焦点窗口」计算（纯函数，无渲染依赖）。
 *
 * 阅读器打开大文件时先只渲染当前阅读位置附近的若干章，其余部分后台补齐。
 * 窗口必须满足：
 * - 起点落在章节标题行（否则首屏从段落中间开始）；
 * - 终点落在「下一章标题之前」（否则首屏会含一个被截断的下一章，
 *   章节表也会多出该章、字数不对）；
 * - 无章节书退化为固定行数窗口。
 */

/**
 * 章节标题判定由调用方注入：本模块对 Vite 别名与渲染层依赖零耦合，
 * 可直接在 node 下跑单测；阅读器传入 `chapter.detectChapterTitle`。
 */
export type ChapterTitleDetector = (line: string) => string | null;

/** 默认不识别任何标题：仅按固定行数取窗口（单测与无章节场景使用） */
const defaultIsChapterTitle: ChapterTitleDetector = () => null;

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
  options?: {
    chaptersAhead?: number;
    /** 章节标题判定（默认不识别，见 {@link ChapterTitleDetector}） */
    isChapterTitle?: ChapterTitleDetector;
  },
): ReaderFocusWindow | null {
  const isChapterTitle = options?.isChapterTitle ?? defaultIsChapterTitle;
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
    if (isChapterTitle(physicalLines[p - 1] ?? "") != null) {
      chapterStart = p;
      break;
    }
  }

  // 从本章标题起向后数章节，决定窗口终点
  let end = Math.min(available, chapterStart + READER_FOCUS_WINDOW_MAX_LINES - 1);
  let found = 0;
  let lastTitleLine = chapterStart;
  /** 窗口终点是否已收在「下一章标题之前」——此时不得再向后补行 */
  let endedAtChapterBoundary = false;
  for (let p = chapterStart; p <= end; p += 1) {
    if (isChapterTitle(physicalLines[p - 1] ?? "") == null) continue;
    found += 1;
    lastTitleLine = p;
    if (found > chaptersAhead) {
      /**
       * 第 N+1 个标题已到：窗口收在其前一行。
       * 不能包含下一章的任何正文——否则首屏装的段落里会多出一个被截断的「下一章」，
       * 章节表随之多出该章且字数不对（正文与目录对不上）。
       */
      end = Math.min(available, p - 1);
      endedAtChapterBoundary = true;
      break;
    }
  }
  if (found === 0) {
    // 没有章节：至少给出以当前位置为中心的固定窗口
    return resolveReaderFocusWindow(focus, available);
  }
  if (!endedAtChapterBoundary) {
    // 没撞到下一章（窗口被行数上限截断）：末尾补几行，避免末章正好贴在视口底边
    end = Math.min(available, Math.max(end, lastTitleLine + 3));
  }
  const start = chapterStart;
  if (!endedAtChapterBoundary && end - start + 1 < 200) {
    // 章节极短：补足到 200 行，保证首屏与上下翻页都有内容
    end = Math.min(available, start + 199);
  }
  return { startPhysicalLine: start, endPhysicalLine: end };
}
