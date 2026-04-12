import * as monaco from "monaco-editor";
import { charPixelWidthForHighlightAnchor } from "./readerHighlightGeometry";

/** `getTargetAtClientPoint` → 正文坐标；装饰/内链需在 Monaco 默认处理之前用捕获阶段命中 */
export function positionFromClientPoint(
  ed: monaco.editor.IStandaloneCodeEditor,
  clientX: number,
  clientY: number,
): monaco.Position | null {
  const t = ed.getTargetAtClientPoint(clientX, clientY);
  if (t?.type === monaco.editor.MouseTargetType.CONTENT_TEXT) {
    return t.position;
  }
  if (t?.type === monaco.editor.MouseTargetType.CONTENT_EMPTY) {
    return t.position;
  }
  return null;
}

/**
 * 行尾空白处点击时 Monaco 常把列吸附到行末字符，`Range.containsPosition` 仍为 true。
 * 用 `getOffsetForColumn` 得到的水平像素区间约束，使仅链接 glyph 宽度内可触发跳转。
 */
export function clientXWithinSingleLineModelRange(
  ed: monaco.editor.IStandaloneCodeEditor,
  m: monaco.editor.ITextModel,
  r: monaco.Range,
  clientX: number,
): boolean {
  if (r.startLineNumber !== r.endLineNumber) return true;
  const line = r.startLineNumber;
  const layout = ed.getLayoutInfo();
  const scrollLeft = ed.getScrollLeft();
  const dom = ed.getDomNode();
  if (!dom) return true;
  const rect = dom.getBoundingClientRect();
  const baseX = rect.left + layout.contentLeft - scrollLeft;
  const c1 = r.startColumn;
  const c2 = r.endColumn;
  const offLo = ed.getOffsetForColumn(line, c1);
  let offHi = ed.getOffsetForColumn(line, c2);
  const fi = ed.getOption(monaco.editor.EditorOption.fontInfo);
  if (offLo < 0 || offHi < 0) return true;
  if (offHi <= offLo && c2 > c1) {
    offHi = offLo;
    for (let col = c1; col < c2; col++) {
      const ch = m.getValueInRange(
        new monaco.Range(line, col, line, col + 1),
      );
      offHi += charPixelWidthForHighlightAnchor(fi, ch);
    }
  }
  const left = baseX + offLo;
  const right = baseX + offHi;
  return clientX >= left && clientX < right;
}
