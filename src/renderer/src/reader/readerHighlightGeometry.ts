import * as monaco from "monaco-editor";

/** 用于行尾列 `col+1` 映射到下一折行时 `getOffsetForColumn` 返回异常（offHi ≤ offLo）的宽度回退 */
export function charPixelWidthForHighlightAnchor(
  fi: monaco.editor.FontInfo,
  char: string,
): number {
  if (!char) return fi.typicalHalfwidthCharacterWidth;
  const cp = char.codePointAt(0)!;
  if (
    (cp >= 0x1100 && cp <= 0x11ff) ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe10 && cp <= 0xfe19) ||
    (cp >= 0xfe30 && cp <= 0xfe6f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x3040 && cp <= 0x309f) ||
    (cp >= 0x30a0 && cp <= 0x30ff) ||
    (cp >= 0x3130 && cp <= 0x318f) ||
    (cp >= 0xac00 && cp <= 0xd7af)
  ) {
    return fi.typicalFullwidthCharacterWidth;
  }
  return fi.typicalHalfwidthCharacterWidth;
}

/**
 * 选区在视口中的锚点（几何最右侧一列字符的右缘）。
 * 不用 `getScrolledVisiblePosition(选区 end)`：终点常在行尾 maxColumn，换行时 Monaco 会映射到错误的视觉行。
 */
export function getSelectionEndViewportAnchor(
  e: monaco.editor.IStandaloneCodeEditor,
  m: monaco.editor.ITextModel,
): {
  selectionRightX: number;
  anchorTop: number;
  lineBottom: number;
} | null {
  const sel = e.getSelection();
  if (!sel || sel.isEmpty()) return null;
  const dom = e.getDomNode();
  if (!dom) return null;
  const rect = dom.getBoundingClientRect();

  const end = sel.getEndPosition();
  let line = end.lineNumber;
  let colBefore = end.column - 1;
  if (colBefore < 1) {
    if (line <= 1) return null;
    line -= 1;
    const maxCol = m.getLineMaxColumn(line);
    colBefore = Math.max(1, maxCol - 1);
  }

  const vp = e.getScrolledVisiblePosition({
    lineNumber: line,
    column: colBefore,
  });
  if (vp == null) return null;

  const layout = e.getLayoutInfo();
  const scrollLeft = e.getScrollLeft();
  const baseX = rect.left + layout.contentLeft - scrollLeft;

  const offLo = e.getOffsetForColumn(line, colBefore);
  const offHi = e.getOffsetForColumn(line, colBefore + 1);
  const fi = e.getOption(monaco.editor.EditorOption.fontInfo);
  const lastChar = m.getValueInRange(
    new monaco.Range(line, colBefore, line, colBefore + 1),
  );

  let rightInContent: number;
  if (offLo >= 0 && offHi > offLo) {
    rightInContent = offHi;
  } else if (offLo >= 0) {
    rightInContent = offLo + charPixelWidthForHighlightAnchor(fi, lastChar);
  } else {
    return null;
  }

  const selectionRightX = baseX + rightInContent;

  const top = rect.top + vp.top;
  const h = Math.max(1, vp.height);
  return {
    selectionRightX,
    anchorTop: top,
    lineBottom: top + h,
  };
}
