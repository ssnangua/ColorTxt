/**
 * 转换时目录标题匹配：从 MD/HTML 混合行提取纯文本标题。
 * 匹配与展示分离：匹配剥内链且不展开 label；展示保留链接语法。
 */

import { chapterTitleForDisplay } from "../chapter";
import { stripMdLinksFromLine } from "../markdown/markdownLinkShared";

const RE_SPAN_ID = /<span\s+id="[^"]*"\s*><\/span>/gi;
const RE_ATX_PREFIX = /^\s{0,3}#{1,6}\s+/;

/**
 * 取首物理行。阅读器传入的行已按换行切分，绝大多数不含 `\n`；
 * 此时 `replace + split` 会为每行多分配一个数组（大文件下是主要热点之一），故走快路径。
 * 无 `\n` 时也不存在 `\r\n` 对，替换为空操作。
 */
function firstPhysicalLine(rawLine: string): string {
  const nl = rawLine.indexOf("\n");
  if (nl < 0) return rawLine;
  if (nl > 0 && rawLine.charCodeAt(nl - 1) === 13) {
    return rawLine.slice(0, nl - 1);
  }
  return rawLine.slice(0, nl);
}

/** 该行是否可能含 MD 标记（span 锚点 / 链接 / ATX 前缀）；不含则可跳过整条剥离管线 */
function mayContainMarkup(line: string): boolean {
  return line.indexOf("<") >= 0 || line.indexOf("[") >= 0 || line.indexOf("#") >= 0;
}

/** 去掉任意位置 MD 内链 / 外链语法（不展开 label） */
export function stripAllMdInternalLinksFromLine(line: string): string {
  return stripMdLinksFromLine(line);
}

/**
 * 目录标题匹配用纯文本：去 span / ATX / 任意位置内链。
 * 不把 link label 并入标题（避免「标题<a>注</a>）」误匹配）。
 */
export function plainTextForEbookTitleMatch(rawLine: string): string {
  const first = firstPhysicalLine(rawLine);
  // 无 `<`、`[`、`#` 的常见正文行：三步正则剥离均为空操作，只做展示裁剪
  if (!mayContainMarkup(first)) return chapterTitleForDisplay(first);
  let s = first;
  s = s.replace(RE_SPAN_ID, "");
  s = s.replace(RE_ATX_PREFIX, "");
  s = stripAllMdInternalLinksFromLine(s);
  return chapterTitleForDisplay(s);
}

/**
 * 阅读器行映射用：仅去 span 锚点，保留内链 MD 语法与 label。
 * 目录匹配请用 {@link plainTextForEbookTitleMatch}。
 */
export function visibleReaderLineFromPhysicalRaw(rawLine: string): string {
  const first = firstPhysicalLine(rawLine);
  if (first.indexOf("<") < 0) return first;
  return first.replace(RE_SPAN_ID, "");
}
