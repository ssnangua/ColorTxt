import { protocol } from "electron";
import { randomUUID } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const IMAGE_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
};

/** ref → 绝对路径 */
const pathByRef = new Map<string, string>();
/** 规范化绝对路径键 → ref，同一路径复用同一短 URL，避免重复占表 */
const refByPathKey = new Map<string, string>();

function pathKey(resolved: string): string {
  return path.resolve(resolved).replace(/\\/g, "/").toLowerCase();
}

/**
 * 为本地文件注册短 `colortxt-local://resource/{uuid}`，避免把整段路径放进 URL
 *（超长 + 中文经 encode 后极易超过 Chromium 实际限制，导致 `<img>` 根本不发起请求）。
 */
export async function registerLocalFileForColortxtUrl(
  filePath: string,
): Promise<string | null> {
  const resolved = path.resolve(filePath.trim());
  try {
    const st = await stat(resolved);
    if (!st.isFile()) return null;
  } catch {
    return null;
  }
  const key = pathKey(resolved);
  let ref = refByPathKey.get(key);
  if (!ref) {
    ref = randomUUID();
    refByPathKey.set(key, ref);
    pathByRef.set(ref, resolved);
  }
  return `colortxt-local://resource/${ref}`;
}

function resolveFsPathFromColortxtUrl(requestUrl: string): string | null {
  const m = requestUrl.match(/^colortxt-local:\/+resource\/([^/?#]+)/i);
  if (!m?.[1]) return null;
  return pathByRef.get(m[1]) ?? null;
}

export function registerColortxtLocalProtocol(): void {
  protocol.handle("colortxt-local", async (request) => {
    const fsPath = resolveFsPathFromColortxtUrl(request.url);
    if (!fsPath) {
      return new Response(null, { status: 404 });
    }
    try {
      const buf = await readFile(fsPath);
      const ext = path.extname(fsPath).toLowerCase();
      const ct = IMAGE_MIME[ext] ?? "application/octet-stream";
      return new Response(buf, {
        status: 200,
        headers: {
          "Content-Type": ct,
          "Cache-Control": "private, max-age=86400",
        },
      });
    } catch {
      return new Response(null, { status: 404 });
    }
  });
}
