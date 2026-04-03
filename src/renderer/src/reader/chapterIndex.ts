import type { Chapter } from "../chapter";

/** 根据当前视口行号，二分查找所属章节下标（最后一节 lineNumber ≤ lineNumber） */
export function pickActiveChapterIdx(
  list: readonly Chapter[],
  lineNumber: number,
): number {
  if (list.length === 0) return -1;

  let lo = 0;
  let hi = list.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid]!.lineNumber <= lineNumber) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}
