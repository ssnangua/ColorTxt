import type { Ref } from "vue";
import type ReaderMain from "../components/ReaderMain.vue";
import {
  lineHeightMultipleStep,
  maxFontSize,
  maxLineHeightMultipleForFontSize,
  minFontSize,
  minLineHeightMultiple,
  normalizeLineHeightMultiple,
} from "../constants/appUi";
import type { useTxtStreamPipeline } from "./useTxtStreamPipeline";

type Stream = ReturnType<typeof useTxtStreamPipeline>;

export function useAppReaderUiPrefs(deps: {
  readerRef: Ref<InstanceType<typeof ReaderMain> | null>;
  readerFontSize: Ref<number>;
  readerLineHeightMultiple: Ref<number>;
  monacoFontFamily: Ref<string>;
  monacoCustomHighlight: Ref<boolean>;
  monacoAdvancedWrapping: Ref<boolean>;
  compressBlankLines: Ref<boolean>;
  leadIndentFullWidth: Ref<boolean>;
  currentFile: Ref<string | null>;
  stream: Stream;
  persistSettings: () => void;
  openFilePath: (
    filePath: string,
    options?: {
      restorePhysicalLine?: number;
      skipRememberCurrent?: boolean;
      keepSidebarTab?: boolean;
    },
  ) => Promise<boolean>;
  isFullscreenView: Ref<boolean>;
  showFullscreenHeader: Ref<boolean>;
  viewportTopLine: Ref<number>;
  viewportEndLine: Ref<number>;
  viewportVisualProgressPercent: Ref<number>;
  viewportAtBottom: Ref<boolean>;
}) {
  function onViewportTopLineChange(lineNumber: number) {
    deps.viewportTopLine.value = lineNumber;
  }

  function onViewportEndLineChange(lineNumber: number) {
    deps.viewportEndLine.value = lineNumber;
  }

  function onViewportVisualProgressChange(percent: number, atBottom: boolean) {
    deps.viewportVisualProgressPercent.value = percent;
    deps.viewportAtBottom.value = atBottom;
  }

  function increaseFontSize() {
    if (deps.readerFontSize.value >= maxFontSize) return;
    deps.readerFontSize.value += 1;
    deps.readerRef.value?.setFontSize(deps.readerFontSize.value);
    const cap = maxLineHeightMultipleForFontSize(deps.readerFontSize.value);
    if (deps.readerLineHeightMultiple.value > cap + 1e-6) {
      deps.readerLineHeightMultiple.value = cap;
      deps.readerRef.value?.setLineHeightMultiple(cap);
    }
    deps.persistSettings();
  }

  function decreaseFontSize() {
    if (deps.readerFontSize.value <= minFontSize) return;
    deps.readerFontSize.value -= 1;
    deps.readerRef.value?.setFontSize(deps.readerFontSize.value);
    deps.persistSettings();
  }

  function increaseLineHeight() {
    const next = normalizeLineHeightMultiple(
      deps.readerLineHeightMultiple.value + lineHeightMultipleStep,
    );
    if (
      next >
      maxLineHeightMultipleForFontSize(deps.readerFontSize.value) + 1e-6
    )
      return;
    if (next === deps.readerLineHeightMultiple.value) return;
    deps.readerLineHeightMultiple.value = next;
    deps.readerRef.value?.setLineHeightMultiple(next);
    deps.persistSettings();
  }

  function decreaseLineHeight() {
    const next = normalizeLineHeightMultiple(
      deps.readerLineHeightMultiple.value - lineHeightMultipleStep,
    );
    if (next < minLineHeightMultiple - 1e-6) return;
    if (next === deps.readerLineHeightMultiple.value) return;
    deps.readerLineHeightMultiple.value = next;
    deps.readerRef.value?.setLineHeightMultiple(next);
    deps.persistSettings();
  }

  function setMonacoFontFamily(fontFamily: string) {
    deps.monacoFontFamily.value = fontFamily;
    deps.readerRef.value?.setFontFamily(fontFamily);
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

  async function toggleCompressBlankLines() {
    const next = !deps.compressBlankLines.value;
    const path = deps.currentFile.value;
    if (!path) {
      deps.compressBlankLines.value = next;
      deps.persistSettings();
      return;
    }
    const endLine =
      deps.readerRef.value?.getViewportEndLine?.() ?? deps.viewportEndLine.value;
    const physicalP = deps.stream.viewportDisplayLineToPhysicalLine(
      Math.max(1, Math.floor(endLine)),
    );
    deps.compressBlankLines.value = next;
    deps.persistSettings();
    const ok = await deps.openFilePath(path, {
      restorePhysicalLine: physicalP,
      skipRememberCurrent: true,
      keepSidebarTab: true,
    });
    if (!ok) {
      deps.compressBlankLines.value = !next;
      deps.persistSettings();
    }
  }

  async function toggleLeadIndentFullWidth() {
    const next = !deps.leadIndentFullWidth.value;
    const path = deps.currentFile.value;
    if (!path) {
      deps.leadIndentFullWidth.value = next;
      deps.persistSettings();
      return;
    }
    const endLine =
      deps.readerRef.value?.getViewportEndLine?.() ?? deps.viewportEndLine.value;
    const physicalP = deps.stream.viewportDisplayLineToPhysicalLine(
      Math.max(1, Math.floor(endLine)),
    );
    deps.leadIndentFullWidth.value = next;
    deps.persistSettings();
    const ok = await deps.openFilePath(path, {
      restorePhysicalLine: physicalP,
      skipRememberCurrent: true,
      keepSidebarTab: true,
    });
    if (!ok) {
      deps.leadIndentFullWidth.value = !next;
      deps.persistSettings();
    }
  }

  function toggleReaderFind() {
    deps.readerRef.value?.toggleFindWidget?.();
  }

  function onToggleFind() {
    toggleReaderFind();
    if (deps.isFullscreenView.value) deps.showFullscreenHeader.value = false;
  }

  return {
    onViewportTopLineChange,
    onViewportEndLineChange,
    onViewportVisualProgressChange,
    increaseFontSize,
    decreaseFontSize,
    increaseLineHeight,
    decreaseLineHeight,
    setMonacoFontFamily,
    toggleMonacoCustomHighlight,
    toggleMonacoAdvancedWrapping,
    toggleCompressBlankLines,
    toggleLeadIndentFullWidth,
    toggleReaderFind,
    onToggleFind,
  };
}
