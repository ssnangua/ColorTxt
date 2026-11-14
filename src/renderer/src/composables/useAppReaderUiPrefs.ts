import { nextTick, type Ref } from "vue";
import type ReaderMain from "../components/ReaderMain.vue";
import {
  clampLetterSpacingPx,
  clampLineSpacingPx,
  clampReaderHorizontalInsetPx,
  letterSpacingPxStep,
  lineHeightMultipleStep,
  lineSpacingPxStep,
  maxFontSize,
  maxLineHeightMultipleForFontSize,
  minFontSize,
  minLineHeightMultiple,
  normalizeLineHeightMultiple,
  readerHorizontalInsetPxStep,
} from "../constants/appUi";
import type { useTxtStreamPipeline } from "./useTxtStreamPipeline";
import type {
  TextConvertWidthMode,
  TextConvertZhMode,
} from "@shared/textConvertTypes";

type Stream = ReturnType<typeof useTxtStreamPipeline>;

export function useAppReaderUiPrefs(deps: {
  readerRef: Ref<InstanceType<typeof ReaderMain> | null>;
  readerFontSize: Ref<number>;
  readerLineHeightMultiple: Ref<number>;
  readerLineSpacingPx: Ref<number>;
  readerLetterSpacingPx: Ref<number>;
  readerHorizontalInsetPx: Ref<number>;
  monacoFontFamily: Ref<string>;
  pinnedOtherFonts: Ref<string[]>;
  monacoCustomHighlight: Ref<boolean>;
  monacoAdvancedWrapping: Ref<boolean>;
  compressBlankLines: Ref<boolean>;
  leadIndentFullWidth: Ref<boolean>;
  textConvertZh: Ref<TextConvertZhMode>;
  textConvertLetter: Ref<TextConvertWidthMode>;
  textConvertDigit: Ref<TextConvertWidthMode>;
  withChapterListScrollSuppressed: <T>(fn: () => Promise<T> | T) => Promise<T>;
  currentFile: Ref<string | null>;
  stream: Stream;
  syncChaptersAfterViewportSettled: () => void | Promise<void>;
  persistSettings: () => void;
  isFullscreenView: Ref<boolean>;
  showFullscreenHeader: Ref<boolean>;
  viewportTopLine: Ref<number>;
  viewportEndLine: Ref<number>;
  viewportVisualProgressPercent: Ref<number>;
  viewportAtBottom: Ref<boolean>;
  /** 全屏过渡中：冻结页脚进度所用的视口行，避免中间态跳动 */
  suppressViewportProgressUpdates?: Ref<boolean>;
  /** 稳态滚动时记录视口锚点（供全屏退出恢复） */
  noteFullscreenViewportStableAnchor?: () => void;
  /** 语音朗读播放中：禁止打开查找栏 */
  isVoiceReadBlocksFind?: Ref<boolean>;
  /** 快捷键调节排版时，阅读区中央胶囊（如「字号：20」「字间距：0.5」） */
  showReaderHudTip?: (text: string) => void;
}) {
  function onViewportTopLineChange(lineNumber: number) {
    if (deps.suppressViewportProgressUpdates?.value) return;
    deps.viewportTopLine.value = lineNumber;
    deps.noteFullscreenViewportStableAnchor?.();
  }

  function onViewportEndLineChange(lineNumber: number) {
    if (deps.suppressViewportProgressUpdates?.value) return;
    deps.viewportEndLine.value = lineNumber;
  }

  function onViewportVisualProgressChange(percent: number, atBottom: boolean) {
    if (deps.suppressViewportProgressUpdates?.value) return;
    deps.viewportVisualProgressPercent.value = percent;
    deps.viewportAtBottom.value = atBottom;
  }

  function formatHudNumber(n: number): string {
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  }

  function hudLayout(label: string, value: string) {
    deps.showReaderHudTip?.(`${label}：${value}`);
  }

  function increaseFontSize() {
    if (deps.readerFontSize.value >= maxFontSize) {
      hudLayout("字号", String(deps.readerFontSize.value));
      return;
    }
    deps.readerFontSize.value += 1;
    deps.readerRef.value?.setFontSize(deps.readerFontSize.value);
    const cap = maxLineHeightMultipleForFontSize(deps.readerFontSize.value);
    if (deps.readerLineHeightMultiple.value > cap + 1e-6) {
      deps.readerLineHeightMultiple.value = cap;
      deps.readerRef.value?.setLineHeightMultiple(cap);
    }
    deps.persistSettings();
    hudLayout("字号", String(deps.readerFontSize.value));
  }

  function decreaseFontSize() {
    if (deps.readerFontSize.value <= minFontSize) {
      hudLayout("字号", String(deps.readerFontSize.value));
      return;
    }
    deps.readerFontSize.value -= 1;
    deps.readerRef.value?.setFontSize(deps.readerFontSize.value);
    deps.persistSettings();
    hudLayout("字号", String(deps.readerFontSize.value));
  }

  function increaseLineHeight() {
    const next = normalizeLineHeightMultiple(
      deps.readerLineHeightMultiple.value + lineHeightMultipleStep,
    );
    if (
      next >
      maxLineHeightMultipleForFontSize(deps.readerFontSize.value) + 1e-6
    ) {
      hudLayout(
        "行间距",
        normalizeLineHeightMultiple(
          deps.readerLineHeightMultiple.value,
        ).toFixed(1),
      );
      return;
    }
    if (next !== deps.readerLineHeightMultiple.value) {
      deps.readerLineHeightMultiple.value = next;
      deps.readerRef.value?.setLineHeightMultiple(next);
      deps.persistSettings();
    }
    hudLayout("行间距", next.toFixed(1));
  }

  function decreaseLineHeight() {
    const next = normalizeLineHeightMultiple(
      deps.readerLineHeightMultiple.value - lineHeightMultipleStep,
    );
    if (next < minLineHeightMultiple - 1e-6) {
      hudLayout(
        "行间距",
        normalizeLineHeightMultiple(
          deps.readerLineHeightMultiple.value,
        ).toFixed(1),
      );
      return;
    }
    if (next !== deps.readerLineHeightMultiple.value) {
      deps.readerLineHeightMultiple.value = next;
      deps.readerRef.value?.setLineHeightMultiple(next);
      deps.persistSettings();
    }
    hudLayout("行间距", next.toFixed(1));
  }

  function increaseLetterSpacing() {
    const next = clampLetterSpacingPx(
      deps.readerLetterSpacingPx.value + letterSpacingPxStep,
    );
    if (next !== deps.readerLetterSpacingPx.value) {
      deps.readerLetterSpacingPx.value = next;
      deps.readerRef.value?.setLetterSpacingPx(next);
      deps.persistSettings();
    }
    hudLayout("字间距", formatHudNumber(next));
  }

  function decreaseLetterSpacing() {
    const next = clampLetterSpacingPx(
      deps.readerLetterSpacingPx.value - letterSpacingPxStep,
    );
    if (next !== deps.readerLetterSpacingPx.value) {
      deps.readerLetterSpacingPx.value = next;
      deps.readerRef.value?.setLetterSpacingPx(next);
      deps.persistSettings();
    }
    hudLayout("字间距", formatHudNumber(next));
  }

  function increaseParagraphSpacing() {
    const next = clampLineSpacingPx(
      deps.readerLineSpacingPx.value + lineSpacingPxStep,
    );
    if (next !== deps.readerLineSpacingPx.value) {
      deps.readerLineSpacingPx.value = next;
      void deps.readerRef.value?.setLineSpacingPx?.(next);
      deps.persistSettings();
    }
    hudLayout("段间距", formatHudNumber(next));
  }

  function decreaseParagraphSpacing() {
    const next = clampLineSpacingPx(
      deps.readerLineSpacingPx.value - lineSpacingPxStep,
    );
    if (next !== deps.readerLineSpacingPx.value) {
      deps.readerLineSpacingPx.value = next;
      void deps.readerRef.value?.setLineSpacingPx?.(next);
      deps.persistSettings();
    }
    hudLayout("段间距", formatHudNumber(next));
  }

  function increaseHorizontalInset() {
    const next = clampReaderHorizontalInsetPx(
      deps.readerHorizontalInsetPx.value + readerHorizontalInsetPxStep,
    );
    if (next !== deps.readerHorizontalInsetPx.value) {
      deps.readerHorizontalInsetPx.value = next;
      deps.persistSettings();
    }
    hudLayout("左右边距", formatHudNumber(next));
  }

  function decreaseHorizontalInset() {
    const next = clampReaderHorizontalInsetPx(
      deps.readerHorizontalInsetPx.value - readerHorizontalInsetPxStep,
    );
    if (next !== deps.readerHorizontalInsetPx.value) {
      deps.readerHorizontalInsetPx.value = next;
      deps.persistSettings();
    }
    hudLayout("左右边距", formatHudNumber(next));
  }

  function setMonacoFontFamily(fontFamily: string) {
    deps.monacoFontFamily.value = fontFamily;
    deps.readerRef.value?.setFontFamily(fontFamily);
    deps.persistSettings();
  }

  function togglePinnedOtherFont(fontName: string) {
    const normalized = fontName.trim();
    if (!normalized) return;
    const list = deps.pinnedOtherFonts.value;
    const idx = list.findIndex((f) => f.trim() === normalized);
    if (idx >= 0) {
      deps.pinnedOtherFonts.value = list.filter((_, i) => i !== idx);
    } else {
      deps.pinnedOtherFonts.value = [...list, normalized];
    }
    deps.persistSettings();
  }

  function toggleMonacoCustomHighlight() {
    deps.monacoCustomHighlight.value = !deps.monacoCustomHighlight.value;
    deps.persistSettings();
  }

  function toggleMonacoAdvancedWrapping() {
    deps.monacoAdvancedWrapping.value = !deps.monacoAdvancedWrapping.value;
    deps.readerRef.value?.setWrappingStrategyAdvanced(
      deps.monacoAdvancedWrapping.value,
    );
    deps.persistSettings();
  }

  async function applyDisplayToggleFromPhysical(
    applyNext: () => void,
    revert: () => void,
  ) {
    if (!deps.currentFile.value) {
      applyNext();
      deps.persistSettings();
      return;
    }
    const anchor =
      deps.readerRef.value?.captureViewportRestoreAnchor?.() ?? {
        physicalLine: deps.stream.viewportDisplayLineToPhysicalLine(
          Math.max(
            1,
            Math.floor(
              deps.readerRef.value?.getViewportEndLine?.() ??
                deps.viewportEndLine.value,
            ),
          ),
        ),
        wrappedLineIndex: 0,
      };
    await deps.withChapterListScrollSuppressed(async () => {
      applyNext();
      deps.persistSettings();
      /** 整文重排前先落地排队的排版改动，避免「换模型 + 未生效排版」叠加两次全书重排 */
      deps.readerRef.value?.flushPendingTypographyForDisplayChange?.();
      const ok = await deps.stream.applyReaderDisplayFromPhysicalLines(anchor);
      if (!ok) {
        revert();
        deps.persistSettings();
        return;
      }
      await nextTick();
      deps.readerRef.value?.emitProbeLine?.();
      await deps.syncChaptersAfterViewportSettled();
    });
  }

  async function toggleCompressBlankLines() {
    const next = !deps.compressBlankLines.value;
    await applyDisplayToggleFromPhysical(
      () => {
        deps.compressBlankLines.value = next;
      },
      () => {
        deps.compressBlankLines.value = !next;
      },
    );
  }

  async function toggleLeadIndentFullWidth() {
    const next = !deps.leadIndentFullWidth.value;
    await applyDisplayToggleFromPhysical(
      () => {
        deps.leadIndentFullWidth.value = next;
      },
      () => {
        deps.leadIndentFullWidth.value = !next;
      },
    );
  }

  async function setTextConvertZhRead(mode: TextConvertZhMode) {
    const prev = deps.textConvertZh.value;
    if (prev === mode) return;
    await applyDisplayToggleFromPhysical(
      () => {
        deps.textConvertZh.value = mode;
      },
      () => {
        deps.textConvertZh.value = prev;
      },
    );
  }

  async function setTextConvertLetterRead(mode: TextConvertWidthMode) {
    const prev = deps.textConvertLetter.value;
    if (prev === mode) return;
    await applyDisplayToggleFromPhysical(
      () => {
        deps.textConvertLetter.value = mode;
      },
      () => {
        deps.textConvertLetter.value = prev;
      },
    );
  }

  async function setTextConvertDigitRead(mode: TextConvertWidthMode) {
    const prev = deps.textConvertDigit.value;
    if (prev === mode) return;
    await applyDisplayToggleFromPhysical(
      () => {
        deps.textConvertDigit.value = mode;
      },
      () => {
        deps.textConvertDigit.value = prev;
      },
    );
  }

  function toggleReaderFind() {
    if (deps.isVoiceReadBlocksFind?.value) return;
    deps.readerRef.value?.toggleFindWidget?.();
  }

  function onToggleFind() {
    toggleReaderFind();
  }

  return {
    onViewportTopLineChange,
    onViewportEndLineChange,
    onViewportVisualProgressChange,
    increaseFontSize,
    decreaseFontSize,
    increaseLineHeight,
    decreaseLineHeight,
    increaseLetterSpacing,
    decreaseLetterSpacing,
    increaseParagraphSpacing,
    decreaseParagraphSpacing,
    increaseHorizontalInset,
    decreaseHorizontalInset,
    setMonacoFontFamily,
    togglePinnedOtherFont,
    toggleMonacoCustomHighlight,
    toggleMonacoAdvancedWrapping,
    toggleCompressBlankLines,
    toggleLeadIndentFullWidth,
    setTextConvertZhRead,
    setTextConvertLetterRead,
    setTextConvertDigitRead,
    toggleReaderFind,
    onToggleFind,
  };
}
