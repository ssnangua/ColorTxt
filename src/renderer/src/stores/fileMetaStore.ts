export type FileBookmarkItem = {
  line: number;
  note?: string;
  createdAt: number;
  updatedAt: number;
};

/** Monaco `saveViewState()` 的 JSON 形态，按路径持久化在 meta 中 */
export type PersistedEditorViewState = Record<string, unknown>;

/** 自定义高亮词：键为索引字符串 `"0"`,`"1"`…，值为该索引下高亮词（仅存索引不存色值） */
export type HighlightWordsByIndex = Record<string, string[]>;

export type FileMetaRecord = {
  path: string;
  fileName: string;
  /**
   * 电子书原文件路径为 `path` 时，实际阅读的转换结果 txt 绝对路径（如 `…/abc.epub.txt`）。
   * 纯 txt 打开时通常不设置。
   */
  convertedTxtPath?: string;
  /** 写入 `convertedTxtPath` 时源电子书 `mtimeMs`，用于缓存失效 */
  sourceMtimeMsAtConvert?: number;
  progress?: number;
  /** 阅读器滚动/光标视图状态；与 `progress` 同为单文件阅读恢复依据 */
  editorViewState?: PersistedEditorViewState;
  /**
   * 保存视图状态时刻，视口首行对应的源文件物理行号（含空行）。
   * 与 `editorViewState` 一并写入；恢复后校验滤空映射是否一致，不一致则按此行兜底滚动。
   */
  viewportTopPhysicalLine?: number;
  bookmarks: FileBookmarkItem[];
  /** 按高亮色索引分组的高亮词；索引越界时阅读器忽略该桶 */
  highlightWordsByIndex?: HighlightWordsByIndex;
  /**
   * 应用内最后一次打开该文件（阅读器开始加载该会话路径）的时间戳（ms）。
   * 与 `updatedAt` 分离：改分类等操作也会刷新 `updatedAt`，但不应影响「打开时间」排序。
   */
  lastOpenedAt?: number;
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

function normalizeBookmark(
  item: Partial<FileBookmarkItem>,
): FileBookmarkItem | null {
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

const MAX_HIGHLIGHT_TERM_LEN = 100;

function normalizeHighlightWordsByIndex(
  raw: unknown,
): HighlightWordsByIndex | undefined {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }
  const o = raw as Record<string, unknown>;
  const out: HighlightWordsByIndex = {};
  for (const [k, v] of Object.entries(o)) {
    const idx = Number.parseInt(k, 10);
    if (!Number.isFinite(idx) || idx < 0 || String(idx) !== k) continue;
    if (!Array.isArray(v)) continue;
    const words: string[] = [];
    const seen = new Set<string>();
    for (const w of v) {
      if (typeof w !== "string") continue;
      const t = w.trim();
      if (!t || t.length > MAX_HIGHLIGHT_TERM_LEN) continue;
      if (seen.has(t)) continue;
      seen.add(t);
      words.push(t);
    }
    if (words.length) out[k] = words;
  }
  return Object.keys(out).length ? out : undefined;
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
  const bookmarks = Array.from(bookmarkMap.values()).sort(
    (a, b) => a.line - b.line,
  );
  const highlightWordsByIndex = normalizeHighlightWordsByIndex(
    item.highlightWordsByIndex,
  );
  const convertedTxtPath =
    typeof item.convertedTxtPath === "string" && item.convertedTxtPath.trim()
      ? item.convertedTxtPath.trim()
      : undefined;
  const sourceMtimeMsAtConvert =
    typeof item.sourceMtimeMsAtConvert === "number" &&
    Number.isFinite(item.sourceMtimeMsAtConvert)
      ? item.sourceMtimeMsAtConvert
      : undefined;
  const lastOpenedAt =
    typeof item.lastOpenedAt === "number" && Number.isFinite(item.lastOpenedAt)
      ? Math.floor(item.lastOpenedAt)
      : undefined;
  const updatedAt =
    typeof item.updatedAt === "number" && Number.isFinite(item.updatedAt)
      ? Math.floor(item.updatedAt)
      : Date.now();
  return {
    path,
    fileName,
    convertedTxtPath,
    sourceMtimeMsAtConvert,
    progress,
    editorViewState,
    viewportTopPhysicalLine,
    bookmarks,
    highlightWordsByIndex,
    lastOpenedAt,
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
  const exact = items.find(
    (it) => normalizeFileMetaPathKey(it.path) === fullKey,
  );
  if (exact) return exact;
  const nameKey = fileNameKey(path);
  return items.find((it) => it.fileName === nameKey);
}

/** 与 `findFileMetaRecord` 规则一致；构建一次 O(M)，按路径查询 O(1)，避免侧栏对每条列表项线性扫 meta */
export type FileMetaRecordLookup = {
  byNormPath: Map<string, FileMetaRecord>;
  byFileName: Map<string, FileMetaRecord>;
};

export function buildFileMetaRecordLookup(
  items: FileMetaRecord[],
): FileMetaRecordLookup {
  const byNormPath = new Map<string, FileMetaRecord>();
  const byFileName = new Map<string, FileMetaRecord>();
  for (const r of items) {
    byNormPath.set(normalizeFileMetaPathKey(r.path), r);
    const fk = (r.fileName || "").trim().toLowerCase();
    if (fk) byFileName.set(fk, r);
  }
  return { byNormPath, byFileName };
}

export function lookupFileMetaRecord(
  lu: FileMetaRecordLookup,
  path: string,
): FileMetaRecord | undefined {
  const fullKey = normalizeFileMetaPathKey(path);
  const exact = lu.byNormPath.get(fullKey);
  if (exact) return exact;
  return lu.byFileName.get(fileNameKey(path));
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
    highlightWordsByIndex: prev?.highlightWordsByIndex,
    convertedTxtPath: prev?.convertedTxtPath,
    sourceMtimeMsAtConvert: prev?.sourceMtimeMsAtConvert,
    lastOpenedAt: prev?.lastOpenedAt,
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
    const map = new Map<number, FileBookmarkItem>(
      base.map((it) => [it.line, it]),
    );
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

export function appendHighlightTermForFile(
  items: FileMetaRecord[],
  path: string,
  colorIndex: number,
  text: string,
) {
  return assignHighlightTermToColorForFile(items, path, colorIndex, text);
}

/** 将高亮词归到指定高亮色：先从所有索引桶中移除同一词，再写入目标桶（一词仅属一个索引） */
export function assignHighlightTermToColorForFile(
  items: FileMetaRecord[],
  path: string,
  colorIndex: number,
  text: string,
) {
  let term = text.trim();
  if (!term || colorIndex < 0 || !Number.isFinite(colorIndex)) return items;
  if (term.length > MAX_HIGHLIGHT_TERM_LEN) {
    term = term.slice(0, MAX_HIGHLIGHT_TERM_LEN);
  }
  const targetKey = String(Math.floor(colorIndex));
  return upsertFileMetaRecord(items, path, (prev) => {
    const base = { ...(prev?.highlightWordsByIndex ?? {}) };
    for (const k of Object.keys(base)) {
      const next = base[k]!.filter((w) => w !== term);
      if (next.length === 0) delete base[k];
      else base[k] = next;
    }
    const list = [...(base[targetKey] ?? [])];
    if (!list.includes(term)) list.push(term);
    base[targetKey] = list;
    return { highlightWordsByIndex: base };
  });
}

/** 从所有高亮色桶中移除该高亮词（与存储项字符串全等匹配） */
export function removeHighlightTermFromFile(
  items: FileMetaRecord[],
  path: string,
  text: string,
) {
  const term = text.trim();
  if (!term) return items;
  return upsertFileMetaRecord(items, path, (prev) => {
    const base = { ...(prev?.highlightWordsByIndex ?? {}) };
    let changed = false;
    for (const k of Object.keys(base)) {
      const prevList = base[k]!;
      const next = prevList.filter((w) => w !== term);
      if (next.length !== prevList.length) changed = true;
      if (next.length === 0) delete base[k];
      else base[k] = next;
    }
    if (!changed) return {};
    return {
      highlightWordsByIndex: Object.keys(base).length > 0 ? base : undefined,
    };
  });
}
