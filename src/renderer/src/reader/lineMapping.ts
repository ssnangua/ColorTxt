/** 源文件物理行号 → 滤空后的显示行号（map[i] = 第 i+1 显示行对应的物理行号） */
export function physicalLineToFilteredDisplayLine(
  physicalP: number,
  map: readonly number[],
): number {
  if (map.length === 0) return 1;
  const p = Math.max(1, Math.floor(physicalP));
  for (let i = 0; i < map.length; i++) {
    if (map[i]! >= p) return i + 1;
  }
  return map.length;
}

/** 物理行内容是否为空行（无可见字符，含仅空格/缩进） */
export function isBlankPhysicalLineContent(line: string): boolean {
  return line.trim().length === 0;
}
