/**
 * 阅读器表面色（背景、章节标题、Monaco txtr.* token）。
 * 默认值与历史 readerInlineDecorations / style.css 一致；用户自定义通过 Partial 合并。
 */
export type ReaderSurfacePalette = {
  readerBg: string;
  chapterTitle: string;
  txtrQuoteInner: string;
  txtrBracketInner: string;
  txtrPunctuation: string;
  txtrSpecialMarker: string;
  txtrNumber: string;
  txtrEnglish: string;
};

export const READER_SURFACE_KEYS = [
  "readerBg",
  "chapterTitle",
  "txtrQuoteInner",
  "txtrBracketInner",
  "txtrPunctuation",
  "txtrSpecialMarker",
  "txtrNumber",
  "txtrEnglish",
] as const satisfies readonly (keyof ReaderSurfacePalette)[];

/** 配色表每行两个字段，顺序与 `READER_SURFACE_KEYS` 一致 */
export const READER_SURFACE_ROW_PAIRS: readonly [
  keyof ReaderSurfacePalette,
  keyof ReaderSurfacePalette,
][] = [
  ["readerBg", "chapterTitle"],
  ["txtrQuoteInner", "txtrBracketInner"],
  ["txtrPunctuation", "txtrSpecialMarker"],
  ["txtrNumber", "txtrEnglish"],
];

export const READER_SURFACE_LABELS: Record<keyof ReaderSurfacePalette, string> =
  {
    readerBg: "背景色",
    chapterTitle: "章节标题",
    txtrQuoteInner: "引号内文字",
    txtrBracketInner: "括号内文字",
    txtrPunctuation: "标点",
    txtrSpecialMarker: "特殊标记",
    txtrNumber: "数字",
    txtrEnglish: "字母",
  };

export const defaultReaderPaletteLight: ReaderSurfacePalette = {
  readerBg: "#f4ead7",
  chapterTitle: "#b88230",
  txtrQuoteInner: "#a31515",
  txtrBracketInner: "#001080",
  txtrPunctuation: "#267f99",
  txtrSpecialMarker: "#f56c6c",
  txtrNumber: "#795e26",
  txtrEnglish: "#af00db",
};

export const defaultReaderPaletteDark: ReaderSurfacePalette = {
  readerBg: "#1e1e1e",
  chapterTitle: "#569cd6",
  txtrQuoteInner: "#ce9178",
  txtrBracketInner: "#9cdcfe",
  txtrPunctuation: "#4ec9b0",
  txtrSpecialMarker: "#f56c6c",
  txtrNumber: "#dcdcaa",
  txtrEnglish: "#c586c0",
};

const HEX6 = /^#[0-9a-fA-F]{6}$/;

export function isValidReaderSurfaceHex(s: string): boolean {
  return typeof s === "string" && HEX6.test(s);
}

/** 从持久化 JSON 解析用户覆盖片段，非法键或色值丢弃 */
export function parseReaderPaletteOverrides(
  raw: unknown,
): Partial<ReaderSurfacePalette> {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const out: Partial<ReaderSurfacePalette> = {};
  for (const key of READER_SURFACE_KEYS) {
    const v = o[key];
    if (typeof v === "string" && isValidReaderSurfaceHex(v)) {
      (out as Record<string, string>)[key] = v;
    }
  }
  return out;
}

export function mergeReaderSurfacePalette(
  base: ReaderSurfacePalette,
  partial?: Partial<ReaderSurfacePalette> | null,
): ReaderSurfacePalette {
  if (!partial) return { ...base };
  return { ...base, ...partial };
}

/** 与默认比较，得到应持久化的覆盖片段（与默认相同则不写入） */
export function overridesFromFullPalette(
  draft: ReaderSurfacePalette,
  defaults: ReaderSurfacePalette,
): Partial<ReaderSurfacePalette> {
  const out: Partial<ReaderSurfacePalette> = {};
  for (const key of READER_SURFACE_KEYS) {
    if (draft[key].toLowerCase() !== defaults[key].toLowerCase()) {
      (out as Record<string, string>)[key] = draft[key];
    }
  }
  return out;
}

/**
 * 将当前 App 主题对应的阅读器变量写入 `document.documentElement`，供 `var(--reader-bg)` 等使用。
 * 仅处理 `vs` / `vs-dark`。
 */
export function applyReaderSurfaceToDocument(
  theme: string,
  lightPalette: ReaderSurfacePalette = defaultReaderPaletteLight,
  darkPalette: ReaderSurfacePalette = defaultReaderPaletteDark,
): void {
  if (theme !== "vs" && theme !== "vs-dark") return;
  const p = theme === "vs" ? lightPalette : darkPalette;
  const root = document.documentElement;
  root.style.setProperty("--reader-bg", p.readerBg);
  root.style.setProperty("--reader-chapter-title", p.chapterTitle);
}
