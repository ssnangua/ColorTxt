export type Chapter = {
  title: string;
  lineNumber: number;
  charCount: number;
};

export type ChapterMatchRule = {
  id: string;
  pattern: string;
  enabled: boolean;
  examples: string[];
  builtIn: boolean;
};

const cnNum = "零一二三四五六七八九十百千万两0-9０-９";
const unit = "章回卷节集部篇";

const DEFAULT_CHAPTER_PATTERN = `^\\s*(第[${cnNum}]{1,12}[${unit}])\\s*(.{0,40})\\s*$`;
const DEFAULT_ALT_CHAPTER_PATTERN =
  "^\\s*(序章|楔子|引子|尾声|后记|番外|完结感言)\\s*(.{0,40})\\s*$";
/** 数字顿号序号章节，如「1、章节名」 */
const DEFAULT_NUM_ORDERED_PATTERN = "^\\s*(\\d+、)\\s*(.{0,40})\\s*$";

const BUILTIN_RULE_MAIN_ID = "builtin-main";
const BUILTIN_RULE_ALT_ID = "builtin-alt";
const BUILTIN_RULE_NUM_ORDERED_ID = "builtin-num-ordered";

const DEFAULT_EXAMPLES_MAIN = [
  "第一章 标题",
  "第1章",
  "第十回 标题",
  "第二卷 标题",
];
const DEFAULT_EXAMPLES_ALT = ["序章", "番外 标题", "后记"];
const DEFAULT_EXAMPLES_NUM_ORDERED = ["1、标题", "0001、标题", "1、"];

let rulesState: ChapterMatchRule[] = createDefaultChapterRulesInternal();
let enabledRegexList: RegExp[] = [];

function createDefaultChapterRulesInternal(): ChapterMatchRule[] {
  return [
    {
      id: BUILTIN_RULE_MAIN_ID,
      pattern: DEFAULT_CHAPTER_PATTERN,
      enabled: true,
      examples: [...DEFAULT_EXAMPLES_MAIN],
      builtIn: true,
    },
    {
      id: BUILTIN_RULE_ALT_ID,
      pattern: DEFAULT_ALT_CHAPTER_PATTERN,
      enabled: true,
      examples: [...DEFAULT_EXAMPLES_ALT],
      builtIn: true,
    },
    {
      id: BUILTIN_RULE_NUM_ORDERED_ID,
      pattern: DEFAULT_NUM_ORDERED_PATTERN,
      enabled: false,
      examples: [...DEFAULT_EXAMPLES_NUM_ORDERED],
      builtIn: true,
    },
  ];
}

export function createDefaultChapterRules(): ChapterMatchRule[] {
  return createDefaultChapterRulesInternal().map(cloneChapterMatchRule);
}

/** 内置规则在「编辑」对话框中恢复默认时使用的正则与示例 */
export function getBuiltinRuleDefaults(
  ruleId: string,
): { pattern: string; examples: string[] } | null {
  if (ruleId === BUILTIN_RULE_MAIN_ID) {
    return {
      pattern: DEFAULT_CHAPTER_PATTERN,
      examples: [...DEFAULT_EXAMPLES_MAIN],
    };
  }
  if (ruleId === BUILTIN_RULE_ALT_ID) {
    return {
      pattern: DEFAULT_ALT_CHAPTER_PATTERN,
      examples: [...DEFAULT_EXAMPLES_ALT],
    };
  }
  if (ruleId === BUILTIN_RULE_NUM_ORDERED_ID) {
    return {
      pattern: DEFAULT_NUM_ORDERED_PATTERN,
      examples: [...DEFAULT_EXAMPLES_NUM_ORDERED],
    };
  }
  return null;
}

function cloneChapterMatchRule(r: ChapterMatchRule): ChapterMatchRule {
  return {
    id: r.id,
    pattern: r.pattern,
    enabled: r.enabled,
    examples: [...r.examples],
    builtIn: r.builtIn,
  };
}

function rebuildEnabledRegexes(rules: ChapterMatchRule[]) {
  const next: RegExp[] = [];
  for (const r of rules) {
    if (!r.enabled) continue;
    const p = r.pattern?.trim();
    if (!p) continue;
    try {
      next.push(new RegExp(p));
    } catch {
      throw new Error(
        `规则无效（${r.builtIn ? "内置" : "自定义"}）：正则表达式无法编译`,
      );
    }
  }
  if (next.length === 0) {
    throw new Error("至少需要启用一条非空的匹配规则");
  }
  enabledRegexList = next;
}

try {
  rebuildEnabledRegexes(rulesState);
} catch {
  rulesState = createDefaultChapterRulesInternal();
  rebuildEnabledRegexes(rulesState);
}

/** 章节标题展示用：去除首尾空白（含全角空格 U+3000 等 Unicode 空白） */
export function trimChapterTitle(s: string): string {
  return s.trim();
}

/** 侧栏、粘性条等 UI：在 trim 基础上去掉零宽字符，避免符号名为空但数据侧有字的情况 */
export function chapterTitleForDisplay(s: string): string {
  return s.replace(/[\u200b-\u200d\ufeff]/g, "").trim();
}

/** 行首连续空白所占列数（含全角空格等 `\p{White_Space}`），用于阅读器压缩章节行缩进 */
const RE_LEADING_WHITE_SPACE = /^[\p{White_Space}]+/u;

export function leadingWhitespaceColumnCount(line: string): number {
  const m = line.match(RE_LEADING_WHITE_SPACE);
  return m ? m[0].length : 0;
}

export function getChapterMatchRules(): { rules: ChapterMatchRule[] } {
  return { rules: rulesState.map(cloneChapterMatchRule) };
}

export function setChapterMatchRules(rules: ChapterMatchRule[]) {
  if (!Array.isArray(rules) || rules.length === 0) {
    throw new Error("至少保留一条匹配规则");
  }
  const seen = new Set<string>();
  for (const r of rules) {
    if (!r.id || seen.has(r.id)) throw new Error("规则 id 重复或无效");
    seen.add(r.id);
  }
  const next = rules.map(cloneChapterMatchRule);
  rebuildEnabledRegexes(next);
  rulesState = next;
}

export function generateChapterRuleId(): string {
  return `rule-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function matchToTitle(match: RegExpMatchArray): string | null {
  const g1 = (match[1] ?? "").trim();
  const g2 = (match[2] ?? "").trim();
  if (g1 && g2) return trimChapterTitle(`${g1} ${g2}`);
  if (g1) return trimChapterTitle(g1);
  return trimChapterTitle((match[0] ?? "").trim()) || null;
}

/**
 * 单条规则编辑预览：用当前正则试匹配一行，标题解析与 detectChapterTitle 一致。
 * 正则无效时返回 { error }。
 */
export function previewChapterLineMatch(
  line: string,
  pattern: string,
): { error: string } | { hit: boolean; title: string } {
  const p = pattern.trim();
  if (!p) return { hit: false, title: "" };
  let re: RegExp;
  try {
    re = new RegExp(p);
  } catch {
    return { error: "正则表达式无效" };
  }
  const s = line.replace(/\r?\n$/, "");
  const m = s.match(re);
  if (!m) return { hit: false, title: "" };
  const title = matchToTitle(m);
  if (!title) return { hit: false, title: "" };
  return { hit: true, title };
}

export type ChapterExamplesPreview =
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "ok"; items: { hit: boolean; text: string }[] };

/** 多条示例的匹配预览（与编辑面板列表展示一致） */
export function previewChapterExamples(
  pattern: string,
  examples: string[],
): ChapterExamplesPreview {
  const lines = examples.map((s) => s.trim()).filter(Boolean);
  if (lines.length === 0) return { kind: "empty" };
  const first = previewChapterLineMatch(lines[0]!, pattern);
  if ("error" in first) return { kind: "error", message: first.error };
  const items = lines.map((line) => {
    const r = previewChapterLineMatch(line, pattern);
    if ("error" in r) return { hit: false, text: line };
    return { hit: r.hit, text: r.hit ? r.title : line };
  });
  return { kind: "ok", items };
}

export function detectChapterTitle(line: string): string | null {
  const s = line.replace(/\r?\n$/, "");
  for (const re of enabledRegexList) {
    const m = s.match(re);
    if (m) return matchToTitle(m);
  }
  return null;
}

/** 行首缩进：非空行且非章节标题时，去掉行首空白后统一为两个全角空格「　　」 */
const RE_LEADING_WHITE_FOR_INDENT = /^[\p{White_Space}]+/u;
const FULL_WIDTH_INDENT_TWO = "　　";

export function applyLeadIndentFullWidth(line: string): string {
  if (line.trim().length === 0) return line;
  if (detectChapterTitle(line) != null) return line;
  return FULL_WIDTH_INDENT_TWO + line.replace(RE_LEADING_WHITE_FOR_INDENT, "");
}

export function normalizeLoadedChapterRules(
  raw: unknown,
): ChapterMatchRule[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: ChapterMatchRule[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const o = item as Record<string, unknown>;
    if (typeof o.id !== "string" || !o.id.trim()) return null;
    if (typeof o.pattern !== "string") return null;
    if (typeof o.enabled !== "boolean") return null;
    if (typeof o.builtIn !== "boolean") return null;
    if (!Array.isArray(o.examples)) return null;
    const examples = o.examples.filter(
      (x) => typeof x === "string",
    ) as string[];
    out.push({
      id: o.id,
      pattern: o.pattern,
      enabled: o.enabled,
      examples,
      builtIn: o.builtIn,
    });
  }
  return out;
}
