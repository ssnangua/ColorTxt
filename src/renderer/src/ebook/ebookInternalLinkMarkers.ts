/**
 * 电子书转换正文中的内链标记：`<<ID:…>>`（锚点，加载后删除）、`<<A:文案|目标ID>>`（可点击跳转）。
 * 转义：`\`、`|`、`>`、换行；目标 ID：`parseEpub` 为 `文件名#片段`；FB2 为 `{basename}.fb2#片段`；MOBI 为 `mobi-NNNN#片段`（NNNN 为 spine 片段序号）。
 */

const MARK_ID = "<<ID:";
const MARK_A = "<<A:";

/** 转义后写入 `<<ID:payload>>` / `<<A:label|target>>` 的各段 */
export function escapeEbookMarkerPayload(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\r\n/g, "\n")
    .replace(/\n/g, "\\n")
    .replace(/\|/g, "\\|")
    .replace(/>/g, "\\>");
}

function unescapeEbookMarkerPayload(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c !== "\\" || i + 1 >= s.length) {
      out += c;
      continue;
    }
    const n = s[i + 1]!;
    if (n === "n") {
      out += "\n";
      i++;
      continue;
    }
    if (n === "\\" || n === "|" || n === ">") {
      out += n;
      i++;
      continue;
    }
    out += c;
  }
  return out;
}

/** 从 i 起读取，直到未转义的 `stop`（单字符）或 `>>`（双字符） */
function scanUntilStop(
  s: string,
  i: number,
  stop: "|" | ">>",
): { chunk: string; end: number } | null {
  let out = "";
  let j = i;
  while (j < s.length) {
    if (s[j] === "\\" && j + 1 < s.length) {
      out += s[j]! + s[j + 1]!;
      j += 2;
      continue;
    }
    if (stop === "|" && s[j] === "|") {
      return { chunk: out, end: j };
    }
    if (stop === ">>" && j + 1 < s.length && s[j] === ">" && s[j + 1] === ">") {
      return { chunk: out, end: j };
    }
    out += s[j]!;
    j++;
  }
  return null;
}

/** `label|target` 线格式（无外层 `>>`） */
function parseAWireLabelTarget(wire: string): { label: string; target: string } | null {
  const la = scanUntilStop(wire, 0, "|");
  if (!la) return null;
  const label = unescapeEbookMarkerPayload(la.chunk);
  const rest = wire.slice(la.end + 1);
  const target = unescapeEbookMarkerPayload(rest);
  return { label, target };
}

function tryConsumeIdMarkerAt(str: string, pos: number): number {
  if (!str.startsWith(MARK_ID, pos)) return pos;
  const payloadStart = pos + MARK_ID.length;
  const pl = scanUntilStop(str, payloadStart, ">>");
  if (!pl) return pos;
  return pl.end + 2;
}

function tryConsumeAMarkerAt(
  str: string,
  pos: number,
): { nextPos: number; label: string } | null {
  if (!str.startsWith(MARK_A, pos)) return null;
  const absInnerStart = pos + MARK_A.length;
  const tail = str.slice(absInnerStart);
  const la = scanUntilStop(tail, 0, "|");
  if (!la) return null;
  const afterPipe = tail.slice(la.end + 1);
  const ta = scanUntilStop(afterPipe, 0, ">>");
  if (!ta) return null;
  const wire = tail.slice(0, la.end) + "|" + afterPipe.slice(0, ta.end);
  const parsed = parseAWireLabelTarget(wire);
  if (!parsed) return null;
  const nextPos = absInnerStart + la.end + 1 + ta.end + 2;
  return { nextPos, label: parsed.label || "·" };
}

/**
 * 从行首起解析：先跳过行首空白，再反复「吃掉 `<<ID:…>>` → 吃掉一条 `<<A:…|…>>` → 在余下串中查找下一处 `<<A:`」。
 * 两个 `<<A:…>>` 之间可为任意字符（如 `<<A:第一章|…>> 随便什么 <<A:第二章|…>>`）。
 * 用于重建章节：若 `detectChapterTitle` 结果以其中任一标签为前缀，则视为链内假章节。
 */
export function collectLeadingEbookALabelsFromLine(rawLine: string): string[] {
  const labels: string[] = [];
  const s = rawLine.replace(/\r\n/g, "\n").split("\n")[0] ?? "";
  let pos = 0;

  while (pos < s.length && /\s/.test(s[pos]!)) pos++;

  for (;;) {
    for (;;) {
      const idNext = tryConsumeIdMarkerAt(s, pos);
      if (idNext > pos) pos = idNext;
      else break;
    }

    const am = tryConsumeAMarkerAt(s, pos);
    if (!am) break;

    labels.push(am.label);
    pos = am.nextPos;

    const nextA = s.indexOf(MARK_A, pos);
    if (nextA === -1) break;
    pos = nextA;
  }

  return labels;
}

/** 从行内提取 `<<ID:…>>` */
function stripIdMarkersFromLine(
  line: string,
  physicalLine: number,
  idToPhysicalLine: Map<string, number>,
): string {
  let s = line;
  for (;;) {
    const start = s.indexOf(MARK_ID);
    if (start === -1) break;
    const payloadStart = start + MARK_ID.length;
    const pl = scanUntilStop(s, payloadStart, ">>");
    if (!pl) break;
    const rawPayload = s.slice(payloadStart, pl.end);
    const rawId = unescapeEbookMarkerPayload(rawPayload);
    if (rawId && !idToPhysicalLine.has(rawId)) {
      idToPhysicalLine.set(rawId, physicalLine);
    }
    const end = pl.end + 2;
    s = s.slice(0, start) + s.slice(end);
  }
  return s;
}

export type EbookInternalLinkOccurrence = {
  physicalLine: number;
  /** Monaco 1-based 列（含） */
  startColumn: number;
  /** Monaco `Range` 的 endColumn（不含） */
  endColumnExclusive: number;
  targetId: string;
  label: string;
};

/** 将 `<<A:…|…>>` 替换为可见文案，并记录文案列区间（1-based，与 Monaco 一致） */
function replaceAMarkersWithVisibleLabel(
  line: string,
  physicalLine: number,
  out: EbookInternalLinkOccurrence[],
): string {
  let s = line;
  for (;;) {
    const start = s.indexOf(MARK_A);
    if (start === -1) break;
    const innerStart = start + MARK_A.length;
    const tail = s.slice(innerStart);
    const la = scanUntilStop(tail, 0, "|");
    if (!la) break;
    const afterPipe = tail.slice(la.end + 1);
    const ta = scanUntilStop(afterPipe, 0, ">>");
    if (!ta) break;
    const wire = tail.slice(0, la.end) + "|" + afterPipe.slice(0, ta.end);
    const parsed = parseAWireLabelTarget(wire);
    if (!parsed) break;
    const endMarker = innerStart + la.end + 1 + ta.end + 2;
    const visible = parsed.label || "·";
    const colStart = start + 1;
    const endExclusive = start + visible.length + 1;
    out.push({
      physicalLine,
      startColumn: colStart,
      endColumnExclusive: endExclusive,
      targetId: parsed.target,
      label: parsed.label,
    });
    s = s.slice(0, start) + visible + s.slice(endMarker);
  }
  return s;
}

export type StripEbookMarkersResult = {
  text: string;
  /** 与输入按 `\n` 分行后逐行对应，供阅读器用 `applyEdits` 替换行内标记而不 `setValue` 整文 */
  outLines: string[];
  idToPhysicalLine: Map<string, number>;
  linkOccurrences: EbookInternalLinkOccurrence[];
  /**
   * 自行首经「空白 → ID → A → 余下串中下一 `<<A:` …」收集的链内文案列表，键为处理前 Monaco 1-based 行号。
   * 重建章节：若匹配到的标题以其中任一标签为前缀则跳过（假章节）。
   */
  leadingEbookLinkLabelsByLine: ReadonlyMap<number, readonly string[]>;
};

/**
 * 在**已去掉插图独占行之后**的正文上调用：去掉 `<<ID:…>>`、去掉 `<<A:…|…>>`，
 * 并建立 id→行号、内链在各行上的列区间（Monaco 1-based 列）。
 * 行号按正文**当前**行序（与 Monaco 一致）；未压缩空行时即源文件物理行号；
 * 压缩空行时 Reader 侧需再映为源物理行（见 `ebookDisplayLineToPhysical`）。
 */
export function stripEbookIdAndAMarkersFromText(
  utf8: string,
): StripEbookMarkersResult {
  const idToPhysicalLine = new Map<string, number>();
  const linkOccurrences: EbookInternalLinkOccurrence[] = [];
  const rawLines = utf8.replace(/\r\n/g, "\n").split("\n");
  const outLines: string[] = [];
  const leadingEbookLinkLabelsByLine = new Map<number, string[]>();

  for (let i = 0; i < rawLines.length; i++) {
    const physicalLine = i + 1;
    const raw = rawLines[i] ?? "";
    const leadingLabels = collectLeadingEbookALabelsFromLine(raw);
    if (leadingLabels.length > 0) {
      leadingEbookLinkLabelsByLine.set(physicalLine, leadingLabels);
    }
    let line = raw;
    line = stripIdMarkersFromLine(line, physicalLine, idToPhysicalLine);
    line = replaceAMarkersWithVisibleLabel(line, physicalLine, linkOccurrences);
    outLines.push(line);
  }

  return {
    text: outLines.join("\n"),
    outLines,
    idToPhysicalLine,
    linkOccurrences,
    leadingEbookLinkLabelsByLine,
  };
}
