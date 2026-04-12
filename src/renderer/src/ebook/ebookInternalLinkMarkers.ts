/**
 * 电子书转换正文中的内链标记：`<<ID:…>>`（锚点，加载后删除）、`<<A:文案|目标ID>>`（可点击跳转）。
 * 转义：`\`、`|`、`>`、换行；目标 ID 与 `parseEpub` 中产出的 `zipPath#frag` 形式一致。
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
  idToPhysicalLine: Map<string, number>;
  linkOccurrences: EbookInternalLinkOccurrence[];
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

  for (let i = 0; i < rawLines.length; i++) {
    const physicalLine = i + 1;
    let line = rawLines[i] ?? "";
    line = stripIdMarkersFromLine(line, physicalLine, idToPhysicalLine);
    line = replaceAMarkersWithVisibleLabel(line, physicalLine, linkOccurrences);
    outLines.push(line);
  }

  return {
    text: outLines.join("\n"),
    idToPhysicalLine,
    linkOccurrences,
  };
}
