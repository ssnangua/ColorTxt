import type { editor } from "monaco-editor";
import { getPresetCssStack } from "../utils/presetFontDefinitions";
import { READER_TXTR_LIGHT_THEME } from "./readerInlineDecorations";

/** 阅读器 Monaco 初始字号（与 App 持久化同步前） */
export const READER_EDITOR_DEFAULT_FONT_SIZE = 14;

/** 阅读器 Monaco 初始字体栈（与 FontPicker「京華老宋体」预设一致） */
export const READER_EDITOR_DEFAULT_FONT_FAMILY = getPresetCssStack("kinghwa");

export const READER_EDITOR_PADDING = { top: 10, bottom: 10 } as const;

export function readerEditorLineHeight(
  fontSize: number,
  lineHeightMultiple: number,
): number {
  return Math.max(1, Math.round(fontSize * lineHeightMultiple));
}

export type ReaderEditorCreateOptionsInput = {
  fontSize: number;
  lineHeightMultiple: number;
  fontFamily: string;
  /** 默认 {@link READER_TXTR_LIGHT_THEME} */
  theme?: string;
  /** Monaco `wrappingStrategy`：advanced 换行更优但更重 */
  wrappingStrategyAdvanced?: boolean;
};

/**
 * `monaco.editor.create` 的阅读器专用选项（不含 `model`，由调用方传入）。
 * 修改阅读器行为/外观时优先改此模块。
 */
export function buildReaderEditorCreateOptions(
  input: ReaderEditorCreateOptionsInput,
): editor.IStandaloneEditorConstructionOptions {
  const {
    fontSize,
    lineHeightMultiple,
    fontFamily,
    theme = READER_TXTR_LIGHT_THEME,
    wrappingStrategyAdvanced = false,
  } = input;

  return {
    readOnly: true,
    domReadOnly: true,
    readOnlyMessage: { value: "" },
    theme,
    fontSize,
    lineHeight: readerEditorLineHeight(fontSize, lineHeightMultiple),
    fontFamily,
    padding: {
      top: READER_EDITOR_PADDING.top,
      bottom: READER_EDITOR_PADDING.bottom,
    },
    lineNumbers: "off",
    lineNumbersMinChars: 0,
    glyphMargin: false,
    folding: true,
    showFoldingControls: "never",
    minimap: { enabled: false },
    scrollbar: {
      horizontal: "hidden",
    },
    guides: {
      indentation: false,
      highlightActiveIndentation: false,
    },
    hideCursorInOverviewRuler: true,
    scrollBeyondLastLine: false,
    occurrencesHighlight: "off",
    selectionHighlight: false,
    cursorBlinking: "solid",
    cursorWidth: 0,
    renderLineHighlight: "none",
    unicodeHighlight: {
      invisibleCharacters: false,
      ambiguousCharacters: false,
    },
    find: {
      seedSearchStringFromSelection: "selection",
    },
    quickSuggestions: false,
    suggestOnTriggerCharacters: false,
    parameterHints: { enabled: false },
    wordBasedSuggestions: "off",
    wordWrap: "on",
    wrappingStrategy: wrappingStrategyAdvanced ? "advanced" : "simple",
    smoothScrolling: true,
    automaticLayout: true,
    stickyScroll: { enabled: true },
    contextmenu: false,
    links: false,
  };
}

/** 与 `setFontSize` 同步：更新字号与派生行高 */
export function buildReaderEditorFontSizeUpdate(input: {
  fontSize: number;
  lineHeightMultiple: number;
}): Pick<editor.IEditorOptions, "fontSize" | "lineHeight"> {
  return {
    fontSize: input.fontSize,
    lineHeight: readerEditorLineHeight(
      input.fontSize,
      input.lineHeightMultiple,
    ),
  };
}

/** 与 `setLineHeightMultiple` 同步：仅更新行高 */
export function buildReaderEditorLineHeightUpdate(input: {
  fontSize: number;
  lineHeightMultiple: number;
}): Pick<editor.IEditorOptions, "lineHeight"> {
  return {
    lineHeight: readerEditorLineHeight(
      input.fontSize,
      input.lineHeightMultiple,
    ),
  };
}
