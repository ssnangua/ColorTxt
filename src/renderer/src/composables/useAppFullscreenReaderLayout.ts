import { computed, ref, type Ref } from "vue";
import type ReaderMain from "../components/ReaderMain.vue";
import {
  maxFullscreenReaderWidthPercent,
  minFullscreenReaderWidthPercent,
} from "../constants/appUi";

type ReaderRef = Ref<InstanceType<typeof ReaderMain> | null>;

/**
 * 全屏时正文区域宽度样式，以及 layout 上滚轮/点击转发给阅读器（侧栏内除外）。
 * Mac 触屏/触控板合成 wheel 时 `target` 可能不在侧栏子树内，故结合 `composedPath`、
 * `elementFromPoint` 与沿 ShadowRoot 向上的遍历，避免误劫持侧栏滚动。
 */
export function useAppFullscreenReaderLayout(deps: {
  isFullscreenView: Ref<boolean>;
  readerRef: ReaderRef;
  fullscreenSidebarOverlayRef: Ref<HTMLElement | null>;
  fullscreenReaderWidthPercent: Ref<number>;
}) {
  const readerPaneWrapRef = ref<HTMLElement | null>(null);

  const fullscreenReaderPaneStyle = computed(() => {
    if (!deps.isFullscreenView.value) return undefined;
    const width = Math.max(
      minFullscreenReaderWidthPercent,
      Math.min(
        maxFullscreenReaderWidthPercent,
        deps.fullscreenReaderWidthPercent.value,
      ),
    );
    return {
      width: `${width}%`,
      maxWidth: `${width}%`,
      marginLeft: "auto",
      marginRight: "auto",
      flex: "0 0 auto",
    } as const;
  });

  /**
   * 判断节点是否在侧栏容器内；会沿 DOM / ShadowRoot.host 向上查找，避免 Shadow DOM 内子节点
   * `sidebar.contains(node)` 为 false 时仍误判。
   */
  function nodeIsUnderSidebar(sidebar: HTMLElement, node: Node | null) {
    let cur: Node | null = node;
    while (cur) {
      if (cur === sidebar) return true;
      if (cur instanceof Element && sidebar.contains(cur)) return true;
      const root = cur.getRootNode();
      if (root instanceof ShadowRoot) {
        cur = root.host;
      } else {
        cur = cur.parentNode;
      }
    }
    return false;
  }

  /** 触屏 / 触控板合成事件时 `target` 可能不准，需结合事件路径与坐标判断。 */
  function eventInvolvesFullscreenSidebar(ev: Event) {
    const sidebar = deps.fullscreenSidebarOverlayRef.value;
    if (!sidebar) return false;

    if (typeof ev.composedPath === "function") {
      for (const node of ev.composedPath()) {
        if (node instanceof Node && nodeIsUnderSidebar(sidebar, node))
          return true;
      }
    }

    const t = ev.target;
    if (t instanceof Node && nodeIsUnderSidebar(sidebar, t)) return true;

    if (ev instanceof WheelEvent || ev instanceof MouseEvent) {
      const { clientX, clientY } = ev;
      if (Number.isFinite(clientX) && Number.isFinite(clientY)) {
        const top = document.elementFromPoint(clientX, clientY);
        if (top && nodeIsUnderSidebar(sidebar, top)) return true;
      }
    }

    return false;
  }

  function onLayoutMouseDown(ev: MouseEvent) {
    if (!deps.isFullscreenView.value) return;
    if (eventInvolvesFullscreenSidebar(ev)) return;
    const readerPaneEl = readerPaneWrapRef.value;
    if (!readerPaneEl) return;
    const rect = readerPaneEl.getBoundingClientRect();
    const clickedBlankSide = ev.clientX < rect.left || ev.clientX > rect.right;
    if (!clickedBlankSide) return;
    ev.preventDefault();
    deps.readerRef.value?.focusEditor?.();
  }

  function onLayoutWheel(ev: WheelEvent) {
    if (!deps.isFullscreenView.value) return;
    if (eventInvolvesFullscreenSidebar(ev)) return;
    const readerPaneEl = readerPaneWrapRef.value;
    if (!readerPaneEl) return;
    const rect = readerPaneEl.getBoundingClientRect();
    const wheelingBlankSide = ev.clientX < rect.left || ev.clientX > rect.right;
    if (!wheelingBlankSide) return;
    // 必须先委托：Monaco 的 scrollable 在 `_onMouseWheel` 开头若发现 `defaultPrevented` 会直接 return。
    deps.readerRef.value?.delegateEditorWheelFromBrowserEvent?.(ev);
    ev.preventDefault();
  }

  return {
    readerPaneWrapRef,
    fullscreenReaderPaneStyle,
    onLayoutMouseDown,
    onLayoutWheel,
  };
}
