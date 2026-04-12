/** 与 Node path.dirname 行为接近（无盘符的边界按常见路径处理） */
export function dirnameFs(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");
  if (lastSlash <= 0) {
    if (normalized.length >= 2 && normalized[1] === ":") {
      return normalized.slice(0, 2);
    }
    return ".";
  }
  return filePath.slice(0, filePath.length - (normalized.length - lastSlash));
}

export function joinFs(dir: string, ...parts: string[]): string {
  let out = dir.replace(/[/\\]+$/, "");
  const useBackslash = out.includes("\\");
  const sep = useBackslash ? "\\" : "/";
  for (const p of parts) {
    const seg = p.replace(/^[/\\]+|[/\\]+$/g, "");
    if (!seg) continue;
    const segNorm = useBackslash ? seg.replace(/\//g, "\\") : seg.replace(/\\/g, "/");
    out = `${out}${sep}${segNorm}`;
  }
  return out;
}

/** 将 `foo/bar` 转为当前路径风格下的相对段 */
export function normalizeRelativeToFsStyle(baseDir: string, posixRel: string): string {
  const useBackslash = baseDir.includes("\\");
  const segs = posixRel.split("/").filter(Boolean);
  return useBackslash ? segs.join("\\") : segs.join("/");
}
