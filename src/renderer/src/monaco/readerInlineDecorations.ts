import type * as monaco from "monaco-editor";
import type { ReaderSurfacePalette } from "../constants/readerPalette";
import {
  CHAPTER_TITLE_LINE_CLASS,
  type ChapterStickyLine,
} from "./chapterStickyScroll";

const EDITOR_BACKGROUND_TRANSPARENT = "#00000000";

function hexForThemeRule(hexWithHash: string): string {
  return hexWithHash.replace(/^#/, "");
}

function readerThemeEditorColors(palette: ReaderSurfacePalette) {
  return {
    "editor.background": EDITOR_BACKGROUND_TRANSPARENT,
    "editor.foreground": palette.bodyText,
  };
}

/** 与 txtrTextMonarch 一致：quoteInner / bracketInner 为兜底；引号内先自定义高亮再括号开符，故高亮词优先于 quoteInner */
function buildTxtrTokenRules(
  palette: ReaderSurfacePalette,
  highlightColors: readonly string[],
) {
  const hlRules = highlightColors.map((c, i) => ({
    token: `txtr.customHighlight.${i}`,
    foreground: hexForThemeRule(c),
  }));
  return [
    {
      token: "txtr.quoteInner",
      foreground: hexForThemeRule(palette.txtrQuoteInner),
    },
    {
      token: "txtr.bracketInner",
      foreground: hexForThemeRule(palette.txtrBracketInner),
    },
    {
      token: "txtr.punctuation",
      foreground: hexForThemeRule(palette.txtrPunctuation),
    },
    {
      token: "txtr.specialMarker",
      foreground: hexForThemeRule(palette.txtrSpecialMarker),
    },
    {
      token: "txtr.number",
      foreground: hexForThemeRule(palette.txtrNumber),
    },
    {
      token: "txtr.english",
      foreground: hexForThemeRule(palette.txtrEnglish),
    },
    ...hlRules,
  ];
}

/**
 * 注入 vs / vs-dark 的 Monarch token 颜色；编辑器背景透明以透出 var(--reader-bg)。
 * 应在注册 Monarch 之后、setTheme 之前调用一次；调色板变更时可再调用。
 */
export function ensureReaderSyntaxThemes(
  monacoApi: typeof import("monaco-editor"),
  lightPalette: ReaderSurfacePalette,
  darkPalette: ReaderSurfacePalette,
  highlightColors: readonly string[],
): void {
  monacoApi.editor.defineTheme("vs-dark", {
    base: "vs-dark",
    inherit: true,
    rules: buildTxtrTokenRules(darkPalette, highlightColors),
    colors: readerThemeEditorColors(darkPalette),
  });
  monacoApi.editor.defineTheme("vs", {
    base: "vs",
    inherit: true,
    rules: buildTxtrTokenRules(lightPalette, highlightColors),
    colors: readerThemeEditorColors(lightPalette),
  });
}

/**
 * 开关 Monaco 中 txtr.* 的语法着色（标点/数字/英文/引号内/括号内等）。
 * 关闭时仅继承 vs / vs-dark 默认前景；背景仍透明以透出阅读区底色。
 */
export function setReaderSyntaxHighlightEnabled(
  monacoApi: typeof import("monaco-editor"),
  enabled: boolean,
  lightPalette: ReaderSurfacePalette,
  darkPalette: ReaderSurfacePalette,
  highlightColors: readonly string[],
): void {
  if (enabled) {
    ensureReaderSyntaxThemes(
      monacoApi,
      lightPalette,
      darkPalette,
      highlightColors,
    );
    return;
  }
  monacoApi.editor.defineTheme("vs-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: readerThemeEditorColors(darkPalette),
  });
  monacoApi.editor.defineTheme("vs", {
    base: "vs",
    inherit: true,
    rules: [],
    colors: readerThemeEditorColors(lightPalette),
  });
}

/**
 * 构建章节标题的 Monaco 模型装饰（仅 `inlineClassName` 着色）。
 * 标题前后留白由阅读器 `changeViewZones` 管理，勿在此处设置 `lineHeight`。
 */
export function buildChapterTitleDecorations(
  monacoApi: typeof import("monaco-editor"),
  model: monaco.editor.ITextModel,
  chapters: ChapterStickyLine[],
): monaco.editor.IModelDeltaDecoration[] {
  const sorted = chapters.slice().sort((a, b) => a.lineNumber - b.lineNumber);
  const maxLine = model.getLineCount();
  return sorted
    .map((ch) => ch.lineNumber)
    .filter((lineNumber) => lineNumber >= 1 && lineNumber <= maxLine)
    .map((lineNumber) => ({
      range: new monacoApi.Range(
        lineNumber,
        1,
        lineNumber,
        model.getLineMaxColumn(lineNumber),
      ),
      options: {
        inlineClassName: CHAPTER_TITLE_LINE_CLASS,
      },
    }));
}
