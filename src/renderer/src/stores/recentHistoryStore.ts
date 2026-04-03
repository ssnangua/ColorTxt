export type RecentFileRecord = { path: string };

function safeJsonParse(value: string | null | undefined) {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

export function fileHistoryKey(filePath: string) {
  return filePath.replace(/\\/g, "/").trim().toLowerCase();
}

function normalizeRecentPathOnly(item: unknown): RecentFileRecord | null {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const o = item as Record<string, unknown>;
  const keys = Object.keys(o);
  if (keys.length !== 1 || keys[0] !== "path") return null;
  const path = typeof o.path === "string" ? o.path.trim() : "";
  if (!path) return null;
  return { path };
}

export function loadRecentFileRecords(
  storage: Storage | undefined,
  key: string,
  limit: number,
): RecentFileRecord[] {
  const parsed = safeJsonParse(storage?.getItem(key));
  if (!Array.isArray(parsed)) return [];
  const out: RecentFileRecord[] = [];
  for (const raw of parsed) {
    const rec = normalizeRecentPathOnly(raw);
    if (rec) out.push(rec);
  }
  return out.slice(0, limit);
}

export function persistRecentFileRecords(
  storage: Storage | undefined,
  key: string,
  items: RecentFileRecord[],
) {
  try {
    storage?.setItem(key, JSON.stringify(items));
  } catch {
    // ignore
  }
}

export function upsertRecentFileRecord(
  items: RecentFileRecord[],
  path: string,
  limit: number,
  moveToTop: boolean,
): RecentFileRecord[] {
  const key = fileHistoryKey(path);
  const next = items.filter((item) => fileHistoryKey(item.path) !== key);
  const item: RecentFileRecord = { path };

  if (moveToTop) {
    return [item, ...next].slice(0, limit);
  }

  const idx = items.findIndex((x) => fileHistoryKey(x.path) === key);
  if (idx >= 0) {
    const clone = [...items];
    clone[idx] = item;
    return clone;
  }
  return [item, ...next].slice(0, limit);
}

export function removeRecentFileRecord(
  items: RecentFileRecord[],
  path: string,
): RecentFileRecord[] {
  const key = fileHistoryKey(path);
  return items.filter((item) => fileHistoryKey(item.path) !== key);
}
