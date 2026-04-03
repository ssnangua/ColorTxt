import type * as monaco from "monaco-editor";

/**
 * 阅读器只读模式下：屏蔽左右/Home/End/Delete 与无意义剪贴板快捷键。
 * 上下方向键/PageUp/PageDown 改由应用层快捷键系统统一处理，便于用户自定义。
 */
export function installReaderScrollKeyHandler(
  monacoApi: typeof monaco,
  e: monaco.editor.IStandaloneCodeEditor,
): monaco.IDisposable {
  return e.onKeyDown((ev) => {
    const accelKey = ev.ctrlKey || ev.metaKey;
    const isPasteOrCut =
      accelKey &&
      (ev.keyCode === monacoApi.KeyCode.KeyV ||
        ev.keyCode === monacoApi.KeyCode.KeyX);
    if (isPasteOrCut) {
      // 只读阅读器中粘贴/剪切无意义；拦截以避免 Monaco 弹出空提示。
      ev.preventDefault();
      ev.stopPropagation();
      return;
    }

    const key = ev.keyCode;
    const isBlockedKey =
      key === monacoApi.KeyCode.LeftArrow ||
      key === monacoApi.KeyCode.RightArrow ||
      key === monacoApi.KeyCode.Delete ||
      key === monacoApi.KeyCode.Home ||
      key === monacoApi.KeyCode.End;
    if (!isBlockedKey) {
      return;
    }

    ev.preventDefault();
    ev.stopPropagation();
  });
}
