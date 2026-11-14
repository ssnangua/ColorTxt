/**
 * 章节标题匹配的「必要字符」预筛（纯函数，无副作用）。
 *
 * 阅读器打开大文件时会对每个物理行跑章节正则；网文正文行绝大多数不含任何
 * 章节关键字，逐行跑正则（每个已启用规则一条）是一笔可观的开销。
 * 本模块从正则源码推导一组字符，使 **任何能匹配该正则的行都至少包含其中一个字符**，
 * 从而可以先用一次廉价的字符类正则整行跳过；推导不出（约束为空）时返回 `null`，
 * 调用方必须退化为逐行正则，保证自定义规则不被漏匹配。
 *
 * 推导规则（`S(r)` = 「匹配 r 的字符串必含 S(r) 中至少一个字符」）：
 * - 字面量 c → `{c}`
 * - 字符类 `[abc]` → 其中的字面量字符（含预设类 `\d` 等时无法枚举 → 空集）
 * - 转义预设（`\d` `\s` `\w`）、`\b`、任意字符 `.`、锚点 → 空集
 * - 量词 `*` `?` `{0,n}` → 空集；`+` `{1,n}` → 与原子相同
 * - 拼接 AB → 取第一个非空者（匹配串必含其中字符）
 * - 或 `A|B` → `S(A) ∪ S(B)`；任一分支为空集则整体空集
 * - 分组 `(…)` / `(?:…)` → 同其内部
 */

type Analysis = {
  /** 匹配该表达式必含的字符之一；空集表示无法得出约束 */
  chars: Set<string>;
};

class Parser {
  private i = 0;
  private readonly src: string;

  constructor(src: string) {
    this.src = src;
  }

  parseExpression(): Analysis {
    const parts: Analysis[] = [this.parseSequence()];
    while (this.peek() === "|") {
      this.i += 1;
      parts.push(this.parseSequence());
    }
    if (parts.length === 1) return parts[0]!;
    /**
     * 或：各分支字符取并集（命中任一分支持必含其集内某字符，故并集仍成立）。
     * 但任一分支持为空（如 `(a|)`、`(a|.*)`）时整体无约束——该分支可匹配任意串。
     */
    const chars = new Set<string>();
    for (const p of parts) {
      if (p.chars.size === 0) return { chars: new Set() };
      for (const c of p.chars) chars.add(c);
    }
    return { chars };
  }

  /** 拼接：首个能提供约束的原子即可（匹配串必含其中字符） */
  private parseSequence(): Analysis {
    let found: Set<string> | null = null;
    while (this.i < this.src.length) {
      const ch = this.src[this.i]!;
      if (ch === "|" || ch === ")") break;
      const atom = this.parseAtomWithQuantifier();
      if (found == null && atom.chars.size > 0) found = atom.chars;
      if (this.peek() === "|" || this.peek() === ")") break;
    }
    return { chars: found ?? new Set() };
  }

  private parseAtomWithQuantifier(): Analysis {
    const atom = this.parseAtom();
    const quant = this.parseQuantifier();
    if (!quant.guaranteed) return { chars: new Set() };
    return atom;
  }

  private parseQuantifier(): { guaranteed: boolean } {
    const ch = this.peek();
    if (ch === "*" || ch === "?") {
      this.i += 1;
      this.skipLazy();
      return { guaranteed: false };
    }
    if (ch === "+") {
      this.i += 1;
      this.skipLazy();
      return { guaranteed: true };
    }
    if (ch === "{") {
      const close = this.src.indexOf("}", this.i);
      if (close < 0) {
        this.i += 1;
        return { guaranteed: true };
      }
      const body = this.src.slice(this.i + 1, close);
      this.i = close + 1;
      this.skipLazy();
      const m = /^\s*(\d*)\s*(?:,\s*(\d*)\s*)?$/.exec(body);
      if (!m) return { guaranteed: true };
      const min = m[1] === "" ? 0 : Number(m[1]);
      return { guaranteed: Number.isFinite(min) && min >= 1 };
    }
    return { guaranteed: true };
  }

  private skipLazy(): void {
    if (this.peek() === "?") this.i += 1;
  }

  private parseAtom(): Analysis {
    const ch = this.src[this.i];
    if (ch === undefined) return { chars: new Set() };
    if (ch === "(") {
      this.i += 1;
      // 跳过 (?: (?= (?! (?<= (?<! (?<name> 等前缀
      if (this.src[this.i] === "?") {
        const next = this.src[this.i + 1];
        if (next === ":") {
          this.i += 2;
        } else if (next === "=" || next === "!") {
          this.i += 2;
          this.parseExpression();
          this.expect(")");
          // 前瞻为断言，不消费字符：无约束
          return { chars: new Set() };
        } else if (next === "<") {
          const after = this.src[this.i + 2];
          if (after === "=" || after === "!") {
            this.i += 3;
            this.parseExpression();
            this.expect(")");
            return { chars: new Set() };
          }
          // 具名分组 (?<name>…)
          const close = this.src.indexOf(">", this.i);
          this.i = close < 0 ? this.src.length : close + 1;
        } else {
          this.i += 1;
        }
      }
      const inner = this.parseExpression();
      this.expect(")");
      return inner;
    }
    if (ch === "[") {
      this.i += 1;
      return { chars: this.parseCharClass() ?? new Set() };
    }
    if (ch === "^" || ch === "$") {
      this.i += 1;
      return { chars: new Set() };
    }
    if (ch === "\\") {
      return this.parseEscape();
    }
    if (ch === ".") {
      this.i += 1;
      return { chars: new Set() };
    }
    this.i += 1;
    return { chars: new Set([ch]) };
  }

  /**
   * 字符类：匹配时必含类中**某一个**字符。
   * 含预设类（d 等）、反向类或超出展开上限的区间时，候选集不可枚举 → 返回 null
   * 并把游标移到类结尾（否则字符串类剩余字符会被当成普通正则字面量解析）。
   */
  private parseCharClass(): Set<string> | null {
    const chars = new Set<string>();
    let first = true;
    let pendingRangeLo: string | null = null;
    while (this.i < this.src.length) {
      const ch = this.src[this.i]!;
      if (ch === "]" && !first) {
        this.i += 1;
        return chars;
      }
      first = false;
      if (ch === "\\") {
        this.i += 1;
        const esc = this.src[this.i];
        if (esc === undefined) {
          this.i = this.src.length;
          return null;
        }
        this.i += 1;
        // 预设类 / 词边界：候选集不可枚举 → 放弃该字符类的约束
        if ("dDwWsSbB".includes(esc)) {
          this.skipToCharClassEnd();
          return null;
        }
        if (esc === "u" || esc === "x") {
          const len = esc === "u" ? 4 : 2;
          const code = Number.parseInt(this.src.slice(this.i, this.i + len), 16);
          this.i += len;
          if (Number.isFinite(code)) chars.add(String.fromCharCode(code));
          pendingRangeLo = null;
          continue;
        }
        if (esc === "p" || esc === "P") {
          if (this.src[this.i] === "{") {
            const close = this.src.indexOf("}", this.i);
            this.i = close < 0 ? this.src.length : close + 1;
          }
          this.skipToCharClassEnd();
          return null;
        }
        // 其它转义（. - 等）为字面量
        chars.add(esc);
        pendingRangeLo = esc;
        continue;
      }
      // 区间 a-z：展开其中的字符（有上限，避免超大区间撑爆）
      if (ch === "-" && pendingRangeLo != null && this.i + 1 < this.src.length) {
        const hi = this.src[this.i + 1]!;
        if (hi !== "]") {
          const loCode = pendingRangeLo.charCodeAt(0);
          const hiCode = hi.charCodeAt(0);
          chars.delete(pendingRangeLo);
          if (hiCode >= loCode && hiCode - loCode <= 256) {
            for (let c = loCode; c <= hiCode; c += 1) {
              chars.add(String.fromCharCode(c));
            }
          }
          this.i += 2;
          pendingRangeLo = null;
          continue;
        }
      }
      this.i += 1;
      chars.add(ch);
      pendingRangeLo = ch;
    }
    // 未闭合的字符类：正则本身无效，交由上层报错
    return chars;
  }

  /** 跳过当前字符类余下内容（用于「类里含无法枚举的预设类」时放弃约束） */
  private skipToCharClassEnd(): void {
    let first = true;
    while (this.i < this.src.length) {
      const ch = this.src[this.i]!;
      if (ch === "]" && !first) {
        this.i += 1;
        return;
      }
      first = false;
      this.i += 1;
      if (ch === "\\") this.i += 1;
    }
  }

  private parseEscape(): Analysis {
    this.i += 1; // backslash
    const esc = this.src[this.i];
    if (esc === undefined) return { chars: new Set() };
    this.i += 1;
    if ("dDwWsSbB".includes(esc)) return { chars: new Set() };
    if ("nrtf".includes(esc)) return { chars: new Set() };
    if (",;<>{}[]()|*$/?#!%^".includes(esc)) {
      // 控制类转义不构成字面量约束（保守起见按无约束处理）
      return { chars: new Set() };
    }
    if (esc === "u") {
      const hex = this.src.slice(this.i, this.i + 4);
      this.i += 4;
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code)
        ? { chars: new Set([String.fromCharCode(code)]) }
        : { chars: new Set() };
    }
    if (esc === "x") {
      const hex = this.src.slice(this.i, this.i + 2);
      this.i += 2;
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code)
        ? { chars: new Set([String.fromCharCode(code)]) }
        : { chars: new Set() };
    }
    if (esc === "p" || esc === "P") {
      if (this.src[this.i] === "{") {
        const close = this.src.indexOf("}", this.i);
        this.i = close < 0 ? this.src.length : close + 1;
      }
      return { chars: new Set() };
    }
    // 其它转义（`\.` `\*` `\\` 等）为字面量
    return { chars: new Set([esc]) };
  }

  private expect(ch: string): void {
    if (this.src[this.i] === ch) this.i += 1;
  }

  private peek(): string | undefined {
    return this.src[this.i];
  }
}

/** 单条正则的「必要字符」集合；无法推导时返回 null */
export function mandatoryCharsForPattern(pattern: string): Set<string> | null {
  const src = pattern.trim();
  if (!src) return null;
  let parsed: Analysis;
  try {
    new RegExp(src); // 语法无效的规则交给上层报错，这里不参与预筛
    parsed = new Parser(src).parseExpression();
  } catch {
    return null;
  }
  return parsed.chars.size > 0 ? parsed.chars : null;
}

/**
 * 由全部已启用规则推导预筛字符表。
 * 任一规则推导不出必要字符时返回 `null`（调用方禁用预筛，保持逐行正则）。
 */
export function buildChapterTitlePrefilter(
  patterns: readonly string[],
): string | null {
  const all = new Set<string>();
  for (const p of patterns) {
    const chars = mandatoryCharsForPattern(p);
    if (chars == null) return null;
    for (const c of chars) all.add(c);
  }
  return all.size > 0 ? [...all].join("") : null;
}

const prefilterRegexCache = new Map<string, RegExp>();

/**
 * 行内是否含预筛字符之一。
 * 实现为单次字符类正则：在 Chrome/V8 下比逐字 `indexOf` 循环快数倍，
 * 且可被 JIT 内联（这是打开大文件时的逐行热路径）。
 */
export function lineMayMatchChapterPrefilter(
  line: string,
  prefilter: string,
): boolean {
  let re = prefilterRegexCache.get(prefilter);
  if (!re) {
    const escaped = prefilter.replace(/[\\\]^[-]/g, (m) => `\\${m}`);
    re = new RegExp(`[${escaped}]`);
    prefilterRegexCache.set(prefilter, re);
  }
  return re.test(line);
}
