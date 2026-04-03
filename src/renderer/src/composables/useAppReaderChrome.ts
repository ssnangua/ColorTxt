import { computed, onBeforeUnmount, ref, watch, type Ref } from "vue";
import type ReaderMain from "../components/ReaderMain.vue";
import {
  FULLSCREEN_BOTTOM_EDGE_PX,
  FULLSCREEN_LEFT_EDGE_PX,
  FULLSCREEN_RIGHT_SCROLLBAR_GUTTER_PX,
  FULLSCREEN_TOP_EDGE_PX,
  SIDEBAR_MIN_READER_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from "../constants/appUi";

/** 全屏下鼠标静止超过该时间后隐藏光标 */
const FULLSCREEN_CURSOR_HIDE_IDLE_MS = 2000;

type ReaderRef = Ref<InstanceType<typeof ReaderMain> | null>;

/** 从 `start` 沿 DOM / ShadowRoot.host 向上，判断是否落在 `panel` 子树内（与 `useAppFullscreenReaderLayout` 侧栏判定一致）。 */
function nodeIsUnderFullscreenPanel(panel: HTMLElement, start: Node | null) {
  let cur: Node | null = start;
  while (cur) {
    if (cur === panel) return true;
    if (cur instanceof Element && panel.contains(cur)) return true;
    const root = cur.getRootNode();
    if (root instanceof ShadowRoot) cur = root.host;
    else cur = cur.parentNode;
  }
  return false;
}

/**
 * 全屏浮动 UI 统一模型：
 * - `document` mousemove：仅在对应边缘「感应区」且面板未显示时唤起；
 * - 面板根节点 `@mouseleave`：全屏且已显示时收起（与真实命中区域一致）；
 * - `.layout` `mousedown`：全屏时收起顶栏/底栏/侧栏（点击落在已展开侧栏内除外）。
 */
export function useAppReaderChrome(deps: { readerRef: ReaderRef }) {
  const isFullscreenView = ref(false);
  const showFullscreenTip = ref(false);
  const fullscreenTipFading = ref(false);
  let tipFadeTimer: ReturnType<typeof setTimeout> | null = null;
  let tipHideTimer: ReturnType<typeof setTimeout> | null = null;
  const showFullscreenHeader = ref(false);
  const fullscreenHeaderOverlayRef = ref<HTMLElement | null>(null);
  const showFullscreenFooter = ref(false);
  const fullscreenFooterOverlayRef = ref<HTMLElement | null>(null);
  /** 全屏时鼠标靠近左边缘显示的浮动章节侧栏 */
  const showFullscreenSidebar = ref(false);
  const fullscreenSidebarOverlayRef = ref<HTMLElement | null>(null);

  const sidebarWidth = ref(250);
  /** 全屏专用侧栏宽度；非全屏为 null（退出全屏时销毁，窗口态仍用 sidebarWidth） */
  const fullscreenSidebarWidth = ref<number | null>(null);
  const resizingSidebar = ref(false);

  const sidebarWidthForLayout = computed(() => {
    if (isFullscreenView.value && fullscreenSidebarWidth.value != null) {
      return fullscreenSidebarWidth.value;
    }
    return sidebarWidth.value;
  });

  const fullscreenCursorHidden = ref(false);
  let fullscreenCursorHideTimer: ReturnType<typeof setTimeout> | null = null;

  /** 顶栏 / 侧栏 / 底栏任一展开时不自动隐藏光标 */
  function anyFullscreenBarVisible(): boolean {
    return (
      showFullscreenHeader.value ||
      showFullscreenFooter.value ||
      showFullscreenSidebar.value
    );
  }

  function clearFullscreenCursorHideTimer() {
    if (fullscreenCursorHideTimer) {
      clearTimeout(fullscreenCursorHideTimer);
      fullscreenCursorHideTimer = null;
    }
  }

  function armFullscreenCursorHideTimer() {
    clearFullscreenCursorHideTimer();
    if (
      !isFullscreenView.value ||
      resizingSidebar.value ||
      anyFullscreenBarVisible()
    ) {
      return;
    }
    fullscreenCursorHideTimer = setTimeout(() => {
      fullscreenCursorHideTimer = null;
      fullscreenCursorHidden.value = true;
    }, FULLSCREEN_CURSOR_HIDE_IDLE_MS);
  }

  /** 全屏下指针移动时调用：显示光标并重新开始空闲计时 */
  function bumpFullscreenCursorIdle() {
    if (!isFullscreenView.value || resizingSidebar.value) return;
    fullscreenCursorHidden.value = false;
    armFullscreenCursorHideTimer();
  }

  watch(
    () =>
      [
        isFullscreenView.value,
        resizingSidebar.value,
        showFullscreenHeader.value,
        showFullscreenFooter.value,
        showFullscreenSidebar.value,
      ] as const,
    ([fs, rs, header, footer, sidebar]) => {
      if (!fs) {
        clearFullscreenCursorHideTimer();
        fullscreenCursorHidden.value = false;
        return;
      }
      if (rs || header || footer || sidebar) {
        clearFullscreenCursorHideTimer();
        fullscreenCursorHidden.value = false;
        return;
      }
      armFullscreenCursorHideTimer();
    },
  );

  async function enterOrExitFullscreenView() {
    if (!isFullscreenView.value) {
      isFullscreenView.value = true;
      showFullscreenTip.value = true;
      fullscreenTipFading.value = false;

      if (tipFadeTimer) clearTimeout(tipFadeTimer);
      if (tipHideTimer) clearTimeout(tipHideTimer);

      tipFadeTimer = setTimeout(() => {
        fullscreenTipFading.value = true;
      }, 1000);
      tipHideTimer = setTimeout(() => {
        showFullscreenTip.value = false;
        fullscreenTipFading.value = false;
      }, 1250);

      try {
        await window.colorTxt.setFullscreen(true);
      } catch {
        isFullscreenView.value = false;
        showFullscreenTip.value = false;
        fullscreenTipFading.value = false;
      }
      return;
    }

    try {
      await window.colorTxt.setFullscreen(false);
    } catch {
      // ignore; main-process fullscreen event will handle UI sync if possible
    }
  }

  function getSidebarMaxWidth(): number {
    return Math.max(0, window.innerWidth - SIDEBAR_MIN_READER_WIDTH);
  }

  function getSidebarMinWidth(): number {
    return Math.min(SIDEBAR_MIN_WIDTH, getSidebarMaxWidth());
  }

  function clampSidebarWidthToViewport(): void {
    const minW = getSidebarMinWidth();
    const maxW = getSidebarMaxWidth();
    const clamp = (w: number) => Math.min(maxW, Math.max(minW, w));
    sidebarWidth.value = clamp(sidebarWidth.value);
    if (isFullscreenView.value && fullscreenSidebarWidth.value != null) {
      fullscreenSidebarWidth.value = clamp(fullscreenSidebarWidth.value);
    }
  }

  watch(isFullscreenView, (fs) => {
    if (fs) {
      const minW = getSidebarMinWidth();
      const maxW = getSidebarMaxWidth();
      fullscreenSidebarWidth.value = Math.min(
        maxW,
        Math.max(minW, sidebarWidth.value),
      );
    } else {
      fullscreenSidebarWidth.value = null;
    }
  });

  function startResizeSidebar(ev: MouseEvent) {
    ev.preventDefault();
    ev.stopPropagation();
    resizingSidebar.value = true;
  }

  function endSidebarResize() {
    resizingSidebar.value = false;
  }

  /** 另外两个浮动层未显示时，才允许通过边缘悬停打开当前层 */
  function canShowFullscreenPanel(
    which: "header" | "sidebar" | "footer",
  ): boolean {
    if (which === "header") {
      return !showFullscreenSidebar.value && !showFullscreenFooter.value;
    }
    if (which === "sidebar") {
      return !showFullscreenHeader.value && !showFullscreenFooter.value;
    }
    return !showFullscreenHeader.value && !showFullscreenSidebar.value;
  }

  /** 全屏左缘感应：仅负责唤起。收起由侧栏容器 @mouseleave 处理。 */
  function updateFullscreenSidebarHover(ev: MouseEvent) {
    if (!isFullscreenView.value) return;
    if (showFullscreenSidebar.value) return;
    const x = ev.clientX;
    if (x <= FULLSCREEN_LEFT_EDGE_PX && canShowFullscreenPanel("sidebar")) {
      showFullscreenSidebar.value = true;
    }
  }

  function onFullscreenSidebarMouseLeave() {
    if (!isFullscreenView.value) return;
    if (resizingSidebar.value) return;
    showFullscreenSidebar.value = false;
  }

  /** 全屏顶缘感应区：仅负责唤起。收起由顶栏容器 @mouseleave 处理（与真实命中区域一致）。 */
  function updateFullscreenHeaderHover(ev: MouseEvent) {
    if (!isFullscreenView.value) return;
    if (deps.readerRef.value?.isFindWidgetRevealed?.()) {
      showFullscreenHeader.value = false;
      return;
    }
    if (showFullscreenHeader.value) return;

    const x = ev.clientX;
    const y = ev.clientY;
    const inRightScrollbarGutter =
      x >= window.innerWidth - FULLSCREEN_RIGHT_SCROLLBAR_GUTTER_PX;
    if (inRightScrollbarGutter) return;
    if (y <= FULLSCREEN_TOP_EDGE_PX && canShowFullscreenPanel("header")) {
      showFullscreenHeader.value = true;
    }
  }

  function onFullscreenHeaderMouseLeave() {
    if (!isFullscreenView.value) return;
    showFullscreenHeader.value = false;
  }

  /** 全屏底缘感应：仅负责唤起。收起由底栏容器 @mouseleave 处理。 */
  function updateFullscreenFooterHover(ev: MouseEvent) {
    if (!isFullscreenView.value) return;
    if (showFullscreenFooter.value) return;
    const vh = window.innerHeight;
    const y = ev.clientY;
    const inRightScrollbarGutter =
      ev.clientX >= window.innerWidth - FULLSCREEN_RIGHT_SCROLLBAR_GUTTER_PX;
    if (inRightScrollbarGutter) return;
    if (y >= vh - FULLSCREEN_BOTTOM_EDGE_PX && canShowFullscreenPanel("footer")) {
      showFullscreenFooter.value = true;
    }
  }

  function onFullscreenFooterMouseLeave() {
    if (!isFullscreenView.value) return;
    showFullscreenFooter.value = false;
  }

  /**
   * 全屏下在 `.layout` 上按下指针时收起浮动顶栏/底栏/侧栏。
   * 顶栏、底栏不在 layout 子树内，能收到该事件即表示未点在栏上；
   * 侧栏在 layout 内，若当前侧栏展开且点在侧栏面板上则不收起（避免误关）。
   */
  function dismissFullscreenPanelsOnLayoutPointerDown(ev: MouseEvent) {
    if (!isFullscreenView.value) return;
    const raw = ev.target;
    if (!(raw instanceof Node)) return;
    const sidebar = fullscreenSidebarOverlayRef.value;
    if (
      showFullscreenSidebar.value &&
      sidebar &&
      nodeIsUnderFullscreenPanel(sidebar, raw)
    ) {
      return;
    }
    showFullscreenHeader.value = false;
    showFullscreenFooter.value = false;
    showFullscreenSidebar.value = false;
  }

  /** 主进程通知退出全屏时，与 enterOrExitFullscreenView 的提示计时器对齐清理 */
  function dismissFullscreenChromeForNativeExit() {
    showFullscreenTip.value = false;
    fullscreenTipFading.value = false;
    showFullscreenHeader.value = false;
    showFullscreenFooter.value = false;
    showFullscreenSidebar.value = false;
    if (tipFadeTimer) clearTimeout(tipFadeTimer);
    if (tipHideTimer) clearTimeout(tipHideTimer);
    tipFadeTimer = null;
    tipHideTimer = null;
  }

  onBeforeUnmount(() => {
    if (tipFadeTimer) clearTimeout(tipFadeTimer);
    if (tipHideTimer) clearTimeout(tipHideTimer);
    clearFullscreenCursorHideTimer();
  });

  return {
    isFullscreenView,
    showFullscreenTip,
    fullscreenTipFading,
    showFullscreenHeader,
    fullscreenHeaderOverlayRef,
    showFullscreenFooter,
    fullscreenFooterOverlayRef,
    showFullscreenSidebar,
    fullscreenSidebarOverlayRef,
    sidebarWidth,
    fullscreenSidebarWidth,
    sidebarWidthForLayout,
    resizingSidebar,
    endSidebarResize,
    enterOrExitFullscreenView,
    getSidebarMaxWidth,
    getSidebarMinWidth,
    clampSidebarWidthToViewport,
    startResizeSidebar,
    updateFullscreenSidebarHover,
    onFullscreenSidebarMouseLeave,
    updateFullscreenHeaderHover,
    onFullscreenHeaderMouseLeave,
    updateFullscreenFooterHover,
    onFullscreenFooterMouseLeave,
    dismissFullscreenPanelsOnLayoutPointerDown,
    dismissFullscreenChromeForNativeExit,
    fullscreenCursorHidden,
    bumpFullscreenCursorIdle,
  };
}
