import { computed, type Ref } from "vue";
import {
  floorReadingProgressPercentByLines,
  floorReadingPercentValue,
} from "../utils/format";

type PhysicalProgressApi = {
  viewportDisplayLineToPhysicalLine: (displayLine: number) => number;
  calcProgressPercentByPhysicalLine: (
    physicalLine: number,
  ) => number | undefined;
  calcProgressPercentByViewportDisplay: (
    topDisplayLine: number,
    bottomDisplayLine: number,
  ) => number | undefined;
  getPhysicalLineCount: () => number;
};

export function useAppReadingProgress(deps: {
  totalLineCount: Ref<number>;
  viewportTopLine: Ref<number>;
  viewportEndLine: Ref<number>;
  viewportVisualProgressPercent: Ref<number>;
  currentFile: Ref<string | null>;
  loading: Ref<boolean>;
  readingProgressSynced: Ref<boolean>;
  /** 当前路径已持久化的阅读进度（%）：file meta，无则最近打开记录；皆无则为 undefined */
  archivedProgressPercentForCurrentFile: Ref<number | undefined>;
  /** 与 touchRecentFile / meta 一致：按源文件物理行估算 % */
  physicalProgress: PhysicalProgressApi;
}) {
  const readingProgressParts = computed(() => {
    const unsettled =
      Boolean(deps.currentFile.value) &&
      (deps.loading.value || !deps.readingProgressSynced.value);
    const archived = deps.archivedProgressPercentForCurrentFile.value;
    const hasArchived =
      typeof archived === "number" && Number.isFinite(archived);

    if (unsettled && hasArchived) {
      const percentValue = Math.min(100, Math.max(0, archived));
      const complete = percentValue >= 100;
      const percent = percentValue.toFixed(1).replace(/\.0$/, "");
      return {
        percentPart: `${percent}%`,
        detailPart: "",
        placeholder: false,
        complete,
        percentValue,
      };
    }

    const total = deps.totalLineCount.value;
    if (total <= 0) {
      if (unsettled) {
        return {
          percentPart: "0%",
          detailPart: "",
          placeholder: false,
          complete: false,
          percentValue: 0,
        };
      }
      return {
        percentPart: "-",
        detailPart: "",
        placeholder: true,
        complete: false,
        percentValue: undefined as number | undefined,
      };
    }
    const displayCurrent = Math.min(total, Math.max(1, deps.viewportEndLine.value));
    const settled =
      Boolean(deps.currentFile.value) &&
      deps.readingProgressSynced.value &&
      !deps.loading.value;
    if (settled) {
      const physicalTotal = deps.physicalProgress.getPhysicalLineCount();
      const linePct =
        deps.physicalProgress.calcProgressPercentByViewportDisplay(
          deps.viewportTopLine.value,
          deps.viewportEndLine.value,
        );
      if (
        typeof linePct === "number" &&
        physicalTotal > 0
      ) {
        const displayBottom = Math.min(total, Math.max(1, deps.viewportEndLine.value));
        const complete = displayBottom >= total;
        const percentValue = linePct;
        const percent = percentValue.toFixed(1).replace(/\.0$/, "");
        return {
          percentPart: `${percent}%`,
          detailPart: ` (${displayCurrent}/${total})`,
          placeholder: false,
          complete,
          percentValue,
        };
      }
    }

    const displayTop = Math.min(total, Math.max(1, deps.viewportTopLine.value));
    const displayBottom = Math.min(total, Math.max(1, deps.viewportEndLine.value));
    const viewportShowsEnd = displayBottom >= total;
    const viewportShowsStart = displayTop === 1;
    const rawPct = Number.isFinite(deps.viewportVisualProgressPercent.value)
      ? deps.viewportVisualProgressPercent.value
      : floorReadingProgressPercentByLines(displayCurrent, total);
    const percentValue = viewportShowsEnd
      ? 100
      : viewportShowsStart
        ? 0
        : floorReadingPercentValue(rawPct);
    const complete = viewportShowsEnd;
    const percent = percentValue.toFixed(1).replace(/\.0$/, "");
    return {
      percentPart: `${percent}%`,
      detailPart: ` (${displayCurrent}/${total})`,
      placeholder: false,
      complete,
      percentValue,
    };
  });

  return { readingProgressParts };
}
