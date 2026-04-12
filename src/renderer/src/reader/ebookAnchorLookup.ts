/** 与 `href` / `<<ID:…>>` 对齐：`文件名#片段`；兼容完整 ZIP 路径键 */
export function normalizeEbookLinkKey(s: string): string {
  const t = s.trim();
  const hash = t.lastIndexOf("#");
  const frag = hash >= 0 ? t.slice(hash + 1) : "";
  const pathPart = hash >= 0 ? t.slice(0, hash) : t;
  const base =
    pathPart.replace(/\\/g, "/").split("/").pop() ?? pathPart;
  return hash >= 0 ? `${base}#${frag}` : base;
}

/** 与 `<<ID:…>>` 写入的键一致；大小写、路径形式（仅文件名 vs 含目录）均尝试 */
export function lookupEbookAnchorPhysicalLine(
  idToPhysicalLine: ReadonlyMap<string, number>,
  targetId: string,
): number | undefined {
  if (idToPhysicalLine.has(targetId)) return idToPhysicalLine.get(targetId);
  const low = targetId.toLowerCase();
  for (const [k, v] of idToPhysicalLine) {
    if (k.toLowerCase() === low) return v;
  }
  const norm = normalizeEbookLinkKey(targetId).toLowerCase();
  for (const [k, v] of idToPhysicalLine) {
    if (normalizeEbookLinkKey(k).toLowerCase() === norm) return v;
  }
  return undefined;
}
