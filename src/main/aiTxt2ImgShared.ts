export function normalizeTxt2ImgBase(u: string): string {
  return u.replace(/\/+$/, "");
}

export function escapeJsonStrInner(s: string): string {
  return JSON.stringify(s).slice(1, -1);
}

export function isFetchAborted(e: unknown): boolean {
  return (
    (e instanceof DOMException && e.name === "AbortError") ||
    (e instanceof Error && e.name === "AbortError")
  );
}

export function errorFromTxt2ImgCatch(e: unknown): string {
  if (isFetchAborted(e)) return "已停止";
  return e instanceof Error ? e.message : String(e);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function sleepAbortable(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) return sleep(ms);
  if (signal.aborted) {
    return Promise.reject(new DOMException("Aborted", "AbortError"));
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const t = setTimeout(() => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export async function bufferFromImageUrl(
  url: string,
  signal?: AbortSignal,
): Promise<{ ok: true; buffer: Buffer } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return {
        ok: false,
        error: `下载图片 HTTP ${res.status}: ${t.slice(0, 200)}`,
      };
    }
    const arr = await res.arrayBuffer();
    const buf = Buffer.from(arr);
    if (buf.length < 32) return { ok: false, error: "下载的图片过小" };
    return { ok: true, buffer: buf };
  } catch (e) {
    return { ok: false, error: errorFromTxt2ImgCatch(e) };
  }
}

export function requireTxt2ImgApiKey(
  apiKey: string,
  label: string,
): { ok: true; key: string } | { ok: false; error: string } {
  const key = apiKey.trim();
  if (!key) {
    return {
      ok: false,
      error: `请先在设置 → 角色卡中填写${label} API 密钥`,
    };
  }
  return { ok: true, key };
}
