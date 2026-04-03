export type FileBookmarkItem = {
  line: number;
  note?: string;
  createdAt: number;
  updatedAt: number;
};

/** Monaco `saveViewState()` 的 JSON 形态，按路径持久化在 meta 中 */
export type PersistedEditorViewState = Record<string, unknown>;

export type FileMetaRecord = {
  path: string;
  fileName: string;
  progress?: number;
  /** 阅读器滚动/光标视图状态；与 `progress` 同为单文件阅读恢复依据 */
  editorViewState?: PersistedEditorViewState;
  /**
   * 保存视图状态时刻，视口首行对应的源文件物理行号（含空行）。
   * 与 `editorViewState` 一并写入；恢复后校验滤空映射是否一致，不一致则按此行兜底滚动。
   */
  viewportTopPhysicalLine?: number;
  bookmarks: FileBookmarkItem[];
  updatedAt: number;
};

type FileMetaPayload = {
  items: FileMetaRecord[];
};

function safeJsonParse(value: string | null | undefined) {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

export function normalizeFileMetaPathKey(filePath: string) {
  return filePath.replace(/\\/g, "/").trim().toLowerCase();
}

export function fileNameKey(filePath: string) {
  const normalized = filePath.replace(/\\/g, "/").trim();
  const idx = normalized.lastIndexOf("/");
  const fileName = idx >= 0 ? normalized.slice(idx + 1) : normalized;
  return fileName.toLowerCase();
}

function normalizeBookmark(item: Partial<FileBookmarkItem>): FileBookmarkItem | null {
  if (typeof item.line !== "number" || !Number.isFinite(item.line)) return null;
  const line = Math.max(1, Math.floor(item.line));
  const note = typeof item.note === "string" ? item.note.trim() : "";
  const now = Date.now();
  const createdAt =
    typeof item.createdAt === "number" && Number.isFinite(item.createdAt)
      ? Math.floor(item.createdAt)
      : now;
  const updatedAt =
    typeof item.updatedAt === "number" && Number.isFinite(item.updatedAt)
      ? Math.floor(item.updatedAt)
      : now;
  return { line, note: note || undefined, createdAt, updatedAt };
}

function normalizeEditorViewState(
  raw: unknown,
): PersistedEditorViewState | undefined {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }
  return raw as PersistedEditorViewState;
}

function normalizeRecord(item: Partial<FileMetaRecord>): FileMetaRecord | null {
  if (typeof item.path !== "string" || !item.path.trim()) return null;
  const path = item.path.trim();
  const fileName = fileNameKey(path);
  const progress =
    typeof item.progress === "number" && Number.isFinite(item.progress)
      ? Math.max(0, Math.min(100, item.progress))
      : undefined;
  let editorViewState = normalizeEditorViewState(item.editorViewState);
  const viewportTopPhysicalLine =
    typeof item.viewportTopPhysicalLine === "number" &&
    Number.isFinite(item.viewportTopPhysicalLine)
      ? Math.max(1, Math.floor(item.viewportTopPhysicalLine))
      : undefined;
  if (editorViewState !== undefined && viewportTopPhysicalLine === undefined) {
    editorViewState = undefined;
  }
  const bookmarkMap = new Map<number, FileBookmarkItem>();
  if (Array.isArray(item.bookmarks)) {
    for (const it of item.bookmarks) {
      const normalized = normalizeBookmark(it ?? {});
      if (!normalized) continue;
      bookmarkMap.set(normalized.line, normalized);
    }
  }
  const bookmarks = Array.from(bookmarkMap.values()).sort((a, b) => a.line - b.line);
  const updatedAt =
    typeof item.updatedAt === "number" && Number.isFinite(item.updatedAt)
      ? Math.floor(item.updatedAt)
      : Date.now();
  return {
    path,
    fileName,
    progress,
    editorViewState,
    viewportTopPhysicalLine,
    bookmarks,
    updatedAt,
  };
}

export function loadFileMetaRecords(storage: Storage | undefined, key: string) {
  const parsed = safeJsonParse(storage?.getItem(key));
  const source =
    parsed &&
    typeof parsed === "object" &&
    !Array.isArray(parsed) &&
    Array.isArray((parsed as FileMetaPayload).items)
      ? (parsed as FileMetaPayload).items
      : [];
  const dedup = new Map<string, FileMetaRecord>();
  for (const it of source) {
    const normalized = normalizeRecord((it ?? {}) as Partial<FileMetaRecord>);
    if (!normalized) continue;
    dedup.set(normalizeFileMetaPathKey(normalized.path), normalized);
  }
  return Array.from(dedup.values());
}

export function persistFileMetaRecords(
  storage: Storage | undefined,
  key: string,
  items: FileMetaRecord[],
) {
  try {
    const payload: FileMetaPayload = { items };
    storage?.setItem(key, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

export function findFileMetaRecord(items: FileMetaRecord[], path: string) {
  const fullKey = normalizeFileMetaPathKey(path);
  const exact = items.find((it) => normalizeFileMetaPathKey(it.path) === fullKey);
  if (exact) return exact;
  const nameKey = fileNameKey(path);
  return items.find((it) => it.fileName === nameKey);
}

export function upsertFileMetaRecord(
  items: FileMetaRecord[],
  path: string,
  updater: (prev: FileMetaRecord | null) => Partial<FileMetaRecord>,
) {
  const prev = findFileMetaRecord(items, path) ?? null;
  const nextPartial = updater(prev);
  const now = Date.now();
  const merged: Partial<FileMetaRecord> = {
    progress: prev?.progress,
    editorViewState: prev?.editorViewState,
    viewportTopPhysicalLine: prev?.viewportTopPhysicalLine,
    bookmarks: prev?.bookmarks ?? [],
    ...nextPartial,
    path,
    fileName: fileNameKey(path),
    updatedAt: now,
  };
  const normalized = normalizeRecord(merged);
  if (!normalized) return items;
  const next = items.filter((it) => it !== prev);
  next.unshift(normalized);
  return next;
}

export function upsertBookmarkForFile(
  items: FileMetaRecord[],
  path: string,
  line: number,
  note: string,
) {
  const now = Date.now();
  return upsertFileMetaRecord(items, path, (prev) => {
    const base = prev?.bookmarks ?? [];
    const map = new Map<number, FileBookmarkItem>(base.map((it) => [it.line, it]));
    const prevBookmark = map.get(line);
    map.set(line, {
      line,
      note: note.trim() || undefined,
      createdAt: prevBookmark?.createdAt ?? now,
      updatedAt: now,
    });
    return {
      bookmarks: Array.from(map.values()).sort((a, b) => a.line - b.line),
    };
  });
}

export function removeBookmarkForFile(
  items: FileMetaRecord[],
  path: string,
  line: number,
) {
  return upsertFileMetaRecord(items, path, (prev) => ({
    bookmarks: (prev?.bookmarks ?? []).filter((it) => it.line !== line),
  }));
}

export function clearBookmarksForFile(items: FileMetaRecord[], path: string) {
  return upsertFileMetaRecord(items, path, () => ({ bookmarks: [] }));
}
