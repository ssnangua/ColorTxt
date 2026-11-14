import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildChapterTitlePrefilter,
  lineMayMatchChapterPrefilter,
  mandatoryCharsForPattern,
} from "./chapterTitlePrefilter.ts";
import { resolveChapterAlignedFocusWindow } from "./readerFocusWindow.ts";

/** 测试用章节标题判定：与内置主规则同形 */
const isChapterTitle = (line: string): string | null =>
  /^第[0-9一二三四五六七八九十百千]+章/.test(line) ? line : null;
import {
  CHAPTER_MATCH_BUILTIN_ALT_PATTERN,
  CHAPTER_MATCH_BUILTIN_MAIN_PATTERN,
  CHAPTER_MATCH_BUILTIN_NUM_ORDERED_PATTERN,
} from "../../../shared/chapterMatchBuiltinPatterns.ts";

const builtinPatterns = [
  CHAPTER_MATCH_BUILTIN_MAIN_PATTERN,
  CHAPTER_MATCH_BUILTIN_ALT_PATTERN,
];

describe("mandatoryCharsForPattern", () => {
  it("derives the literal chars the built-in rules require", () => {
    assert.deepEqual(
      [...(mandatoryCharsForPattern(CHAPTER_MATCH_BUILTIN_MAIN_PATTERN) ?? [])],
      ["第"],
    );
    assert.deepEqual(
      [...(mandatoryCharsForPattern(CHAPTER_MATCH_BUILTIN_ALT_PATTERN) ?? [])],
      ["目", "序", "楔", "引", "尾", "后", "番", "完"],
    );
    assert.deepEqual(
      [...(mandatoryCharsForPattern(CHAPTER_MATCH_BUILTIN_NUM_ORDERED_PATTERN) ?? [])],
      ["、"],
    );
  });

  it("returns null when no constraint can be derived", () => {
    // 纯预设类 / 通配 / 锚点：无法缩小候选行
    assert.equal(mandatoryCharsForPattern(String.raw`^\s*\d+\s*$`), null);
    assert.equal(mandatoryCharsForPattern("^.*$"), null);
    assert.equal(mandatoryCharsForPattern(".+"), null);
    assert.equal(mandatoryCharsForPattern(""), null);
    // 任一分支无约束 → 整体无约束
    assert.equal(mandatoryCharsForPattern("第.+|.+"), null);
  });

  it("unions alternative branches", () => {
    assert.deepEqual(
      [...(mandatoryCharsForPattern("第.+|foo") ?? [])].sort(),
      ["f", "第"].sort(),
    );
  });

  it("handles groups, escapes and char classes", () => {
    // 拼接：首个能提供约束的原子即可（匹配串必含其中字符），无需取并集
    assert.deepEqual([...(mandatoryCharsForPattern("(A|B)第") ?? [])].sort(), [
      "A",
      "B",
    ]);
    assert.deepEqual([...(mandatoryCharsForPattern("第(A|B)") ?? [])], ["第"]);
    assert.deepEqual([...(mandatoryCharsForPattern("(?:第|第)") ?? [])], ["第"]);
    assert.deepEqual([...(mandatoryCharsForPattern(String.raw`\x41`) ?? [])], ["A"]);
    assert.deepEqual([...(mandatoryCharsForPattern(String.raw`第`) ?? [])], ["第"]);
    // 字符类含预设类（无法枚举）→ 不提供约束
    assert.equal(mandatoryCharsForPattern(String.raw`[\d第]`), null);
  });

  it("returns null for invalid patterns", () => {
    assert.equal(mandatoryCharsForPattern("(第"), null);
  });
});

describe("chapter title prefilter", () => {
  const prefilter = buildChapterTitlePrefilter(builtinPatterns);

  it("covers every built-in example line", () => {
    assert.ok(prefilter);
    const examples = [
      "第一回 风月无情",
      "第1章",
      "第二章 标题",
      "序章",
      "番外 标题",
      "后记",
      "楔子",
      "引子",
      "尾声",
      "完结感言",
      "目录",
    ];
    for (const line of examples) {
      assert.ok(
        lineMayMatchChapterPrefilter(line, prefilter),
        `prefilter rejected a chapter line: ${line}`,
      );
    }
  });

  it("rejects ordinary prose lines", () => {
    assert.ok(prefilter);
    const prose = [
      "　　这是一段普通正文，没有任何章节关键字。",
      "他转过身，看向远处的山。",
      "Chapter 3",
    ];
    for (const line of prose) {
      assert.equal(lineMayMatchChapterPrefilter(line, prefilter), false, line);
    }
  });

  it("is disabled when any rule has no derivable constraint", () => {
    assert.equal(
      buildChapterTitlePrefilter([
        CHAPTER_MATCH_BUILTIN_MAIN_PATTERN,
        String.raw`^\s*\d+\s*$`,
      ]),
      null,
    );
  });
});

describe("focus window boundaries", () => {
  /** 每章 12 行正文、1 行标题 */
  function makeChapteredBook(chapters: number, bodyLines = 12): string[] {
    const out: string[] = [];
    for (let c = 1; c <= chapters; c += 1) {
      out.push(`第${c}章 标题`);
      for (let i = 0; i < bodyLines; i += 1) out.push(`　　第${c}章正文第${i}行。`);
    }
    return out;
  }

  it("never includes a truncated chapter", () => {
    const lines = makeChapteredBook(40);
    const w = resolveChapterAlignedFocusWindow(lines, 60, lines.length, { isChapterTitle });
    assert.ok(w);
    // 起点必须是章节标题
    assert.match(lines[w!.startPhysicalLine - 1]!, /^第\d+章 标题$/);
    // 窗口内出现的每个章节标题，其正文必须完整落在窗口内
    for (let p = w!.startPhysicalLine; p <= w!.endPhysicalLine; p += 1) {
      const title = isChapterTitle(lines[p - 1] ?? "");
      if (!title) continue;
      let next = p + 1;
      while (next <= lines.length && !isChapterTitle(lines[next - 1] ?? "")) {
        next += 1;
      }
      const chapterEnd = next - 1;
      if (chapterEnd > w!.endPhysicalLine && chapterEnd < lines.length) {
        assert.fail(
          `window includes a truncated chapter at line ${p} (${title}); window ends at ${w!.endPhysicalLine}`,
        );
      }
    }
  });

  it("never truncates a chapter in the middle", () => {
    const lines = makeChapteredBook(40);
    for (const focus of [1, 5, 60, 200, lines.length]) {
      const w = resolveChapterAlignedFocusWindow(lines, focus, lines.length, { isChapterTitle });
      assert.ok(w);
      // 窗口终点之后若是正文行，说明包含了不完整的下一章
      const nextLine = lines[w!.endPhysicalLine];
      if (nextLine != null) {
        assert.match(
          nextLine,
          /^第\d+章 标题$/,
          `focus ${focus}: window ended mid-chapter at ${JSON.stringify(lines[w!.endPhysicalLine - 1])}`,
        );
      }
    }
  });

  it("window is empty-safe at file boundaries", () => {
    assert.equal(resolveChapterAlignedFocusWindow([], 1, 0, { isChapterTitle }), null);
    const lines = makeChapteredBook(2);
    const w = resolveChapterAlignedFocusWindow(lines, 1, lines.length, { isChapterTitle });
    assert.deepEqual(w, { startPhysicalLine: 1, endPhysicalLine: lines.length });
  });
});
