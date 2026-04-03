import type * as monaco from "monaco-editor";
import {
  CHAPTER_TITLE_LINE_CLASS,
  type ChapterStickyLine,
} from "./chapterStickyScroll";

/** 亮色阅读主题 id（与 ReaderMain 一致） */
export const READER_TXTR_LIGHT_THEME = "txtr-light";

/** 暗色主题下章节标题颜色（Monarch 标点/引号内由 theme rules 着色） */
export const readerInlineDecorationColorsDark = {
  chapterTitle: "#569cd6",
  punctuation: "#4ec9b0",
  specialMarker: "#f56c6c",
  quotePairInner: "#ce9178",
  number: "#dcdcaa",
  english: "#c586c0",
  bracketInner: "#9cdcfe",
} as const;

/** 亮色主题下章节标题颜色 */
export const readerInlineDecorationColorsLight = {
  chapterTitle: "#b88230",
  punctuation: "#267f99",
  specialMarker: "#f56c6c",
  quotePairInner: "#a31515",
  number: "#795e26",
  english: "#af00db",
  bracketInner: "#001080",
} as const;

const STYLE_ID = "txtr-reader-inline-decoration-colors";

function isLightMonacoTheme(themeId: string): boolean {
  return themeId === "vs" || themeId === READER_TXTR_LIGHT_THEME;
}

function hexForThemeRule(hexWithHash: string): string {
  return hexWithHash.replace(/^#/, "");
}

/**
 * 注入 vs-dark / txtr-light 的 Monarch token 颜色，并保留自定义浅色背景。
 * 应在注册 Monarch 之后、setTheme 之前调用一次；主题切换时也可调用以同步颜色常量。
 */
export function ensureReaderSyntaxThemes(
  monacoApi: typeof import("monaco-editor"),
): void {
  const dark = readerInlineDecorationColorsDark;
  const light = readerInlineDecorationColorsLight;
  // 与 txtrTextMonarch 一致：quoteInner / bracketInner 为兜底 token；语义优先级由词法规则顺序保证
  const tokenRulesDark = [
    {
      token: "txtr.quoteInner",
      foreground: hexForThemeRule(dark.quotePairInner),
    },
    {
      token: "txtr.bracketInner",
      foreground: hexForThemeRule(dark.bracketInner),
    },
    {
      token: "txtr.punctuation",
      foreground: hexForThemeRule(dark.punctuation),
    },
    {
      token: "txtr.specialMarker",
      foreground: hexForThemeRule(dark.specialMarker),
    },
    {
      token: "txtr.number",
      foreground: hexForThemeRule(dark.number),
    },
    {
      token: "txtr.english",
      foreground: hexForThemeRule(dark.english),
    },
  ];
  const tokenRulesLight = [
    {
      token: "txtr.quoteInner",
      foreground: hexForThemeRule(light.quotePairInner),
    },
    {
      token: "txtr.bracketInner",
      foreground: hexForThemeRule(light.bracketInner),
    },
    {
      token: "txtr.punctuation",
      foreground: hexForThemeRule(light.punctuation),
    },
    {
      token: "txtr.specialMarker",
      foreground: hexForThemeRule(light.specialMarker),
    },
    {
      token: "txtr.number",
      foreground: hexForThemeRule(light.number),
    },
    {
      token: "txtr.english",
      foreground: hexForThemeRule(light.english),
    },
  ];

  monacoApi.editor.defineTheme("vs-dark", {
    base: "vs-dark",
    inherit: true,
    rules: tokenRulesDark,
    colors: {},
  });

  monacoApi.editor.defineTheme(READER_TXTR_LIGHT_THEME, {
    base: "vs",
    inherit: true,
    rules: tokenRulesLight,
    colors: {
      "editor.background": "#f4ead7",
    },
  });
}

/**
 * 开关 Monaco 中 txtr.* 的语法着色（标点/数字/英文/引号内/括号内等）。
 * 关闭时仅继承 vs / vs-dark 默认前景，保留 txtr-light 的阅读背景色。
 */
export function setReaderSyntaxHighlightEnabled(
  monacoApi: typeof import("monaco-editor"),
  enabled: boolean,
): void {
  if (enabled) {
    ensureReaderSyntaxThemes(monacoApi);
    return;
  }
  monacoApi.editor.defineTheme("vs-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {},
  });
  monacoApi.editor.defineTheme(READER_TXTR_LIGHT_THEME, {
    base: "vs",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#f4ead7",
    },
  });
}

/**
 * 按当前 Monaco 主题更新章节标题行颜色（标点/引号由 Monarch + ensureReaderSyntaxThemes 处理）。
 */
export function applyReaderInlineDecorationColors(monacoThemeId: string): void {
  const colors = isLightMonacoTheme(monacoThemeId)
    ? readerInlineDecorationColorsLight
    : readerInlineDecorationColorsDark;
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = `
.monaco-editor .${CHAPTER_TITLE_LINE_CLASS} {
  color: ${colors.chapterTitle} !important;
  font-size: 2em !important;
}
.monaco-editor span:has(>.${CHAPTER_TITLE_LINE_CLASS}) {
  display: inline-block;
  transform-origin: left;
  transform: scale(0.6);
}
`;
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
