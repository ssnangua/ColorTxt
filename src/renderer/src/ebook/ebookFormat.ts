import { EBOOK_DOT_EXTENSIONS } from "@shared/ebookExtensions";

/** 与主进程 `isTxtOrEbookFileName` 使用的扩展名列表一致 */
export const EBOOK_EXTENSIONS = [...EBOOK_DOT_EXTENSIONS] as readonly string[];

export function isEbookFilePath(filePath: string): boolean {
  const lower = filePath.replace(/\\/g, "/").trim().toLowerCase();
  return EBOOK_DOT_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** 拖放 / 关联打开等：TXT 或支持的电子书扩展名 */
export function isSupportedBookPath(filePath: string): boolean {
  const lower = filePath.replace(/\\/g, "/").trim().toLowerCase();
  if (lower.endsWith(".txt")) return true;
  return isEbookFilePath(filePath);
}

export function fileStemFromPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/").trim();
  const base = normalized.includes("/")
    ? normalized.slice(normalized.lastIndexOf("/") + 1)
    : normalized;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return base;
  return base.slice(0, dot);
}

/**
 * 电子书源文件名（含扩展名），用于输出 `{basename}.txt`；有插图时另有 `{basename}.Images/`。
 * 例：`C:/b/abc.epub` → 规范化后的 `abc.epub`。
 */
export function ebookSourceFileBaseForOutput(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/").trim();
  const base = normalized.includes("/")
    ? normalized.slice(normalized.lastIndexOf("/") + 1)
    : normalized;
  return sanitizeWindowsFilenameSegment(base);
}

/** Windows / NTFS 文件名段不允许的字符及控制符 */
const WIN_FILENAME_FORBIDDEN = /[<>:"/\\|?*\u0000-\u001f]/g;

const WIN_RESERVED_STEM = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/**
 * 将文件名段规范为可安全用于 `{basename}.txt` 的段（避免非法字符导致写入成功但路径无法 stat）。
 */
export function sanitizeWindowsFilenameSegment(name: string, maxLen = 180): string {
  let s = name
    .replace(WIN_FILENAME_FORBIDDEN, " ")
    .replace(/\s+/g, " ")
    .trim();
  s = s.replace(/^[\s.]+/g, "").replace(/[\s.]+$/g, "").trim();
  if (!s) return "book";
  if (s.length > maxLen) {
    s = s.slice(0, maxLen).replace(/[\s.]+$/g, "").trim();
  }
  if (!s) return "book";
  if (WIN_RESERVED_STEM.test(s)) s = `${s}_book`;
  return s;
}
