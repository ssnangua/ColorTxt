/** 主进程与渲染进程共用的电子书扩展名（小写，带点） */
export const EBOOK_DOT_EXTENSIONS = [
  ".epub",
  ".mobi",
  ".azw3",
  ".fb2",
  ".fbz",
  ".pdf",
] as const;

export function isSupportedShellOpenPath(filePath: string): boolean {
  const lower = filePath.trim().toLowerCase();
  if (lower.endsWith(".txt")) return true;
  return EBOOK_DOT_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
