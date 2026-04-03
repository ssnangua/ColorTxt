/** 作为“字数”的近似：去掉空白后按 UTF-16 length 计数 */
export function countCharsForLine(line: string): number {
  return line.replace(/\s+/g, "").length;
}

export function formatCharCount(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1).replace(/\.0$/, "")} 万字`;
  return `${n} 字`;
}

/**
 * 阅读进度（%）：按 当前行/总行 向下保留一位小数，避免四舍五入未到文末即显示 100%。
 * currentLine 至少按 1 计（与既有物理行进度语义一致）。
 */
export function floorReadingProgressPercentByLines(
  currentLine: number,
  totalLines: number,
): number {
  const t = Math.max(0, Math.floor(totalLines));
  if (t <= 0) return 0;
  const c = Math.min(t, Math.max(1, Math.floor(currentLine)));
  return Math.min(100, Math.floor((c * 1000) / t) / 10);
}

/** 将已有 0–100 的进度值向下保留一位小数（用于滚动条比例等） */
export function floorReadingPercentValue(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.floor(value * 10) / 10));
}

/** scrollTop/maxScroll 比例 ∈ [0,1]，转为向下保留一位的百分比 */
export function floorReadingPercentFromScrollRatio(ratio: number): number {
  const r = Math.max(0, Math.min(1, ratio));
  return Math.min(100, Math.floor(r * 1000) / 10);
}

export function formatFileSize(size: number | null): string {
  if (size == null) return "-";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024)
    return `${(size / 1024).toFixed(1).replace(/\.0$/, "")} KB`;
  if (size < 1024 * 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
  }
  return `${(size / (1024 * 1024 * 1024)).toFixed(1).replace(/\.0$/, "")} GB`;
}
