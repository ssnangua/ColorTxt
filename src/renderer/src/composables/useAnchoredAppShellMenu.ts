import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type Ref,
} from "vue";
import {
  computeAnchoredMenuPosition,
  type AnchoredMenuPlacement,
} from "../utils/appShellMenuPosition";

export type UseAnchoredAppShellMenuOptions = {
  /** 未传则 composable 内部管理 */
  open?: Ref<boolean>;
  anchor: Ref<HTMLElement | null>;
  placement: AnchoredMenuPlacement;
  /** 首次布局前用于 below-end 的宽度估算 */
  widthPx?: number;
  gap?: number;
  margin?: number;
  zIndex?: number;
  panelMaxHeight?: number;
  disabled?: Ref<boolean>;
  /** 为 false 时不注册外部点击 / Esc 关闭（悬停子菜单由父级关） */
  enableDismiss?: boolean;
  /** 点击这些根节点内部时不关闭 */
  excludeCloseWithin?: Ref<readonly (HTMLElement | null | undefined)[]>;
  onClose?: () => void;
};

/**
 * 锚定按钮/元素的 App Shell 弹出菜单：定位、视口夹取、外点关闭、Esc、resize 重算。
 */
export function useAnchoredAppShellMenu(opts: UseAnchoredAppShellMenuOptions) {
  const internalOpen = ref(false);
  const open = opts.open ?? internalOpen;
  const panelRef = ref<HTMLElement | null>(null);
  const left = ref(0);
  const top = ref(0);

  async function reposition() {
    const anchor = opts.anchor.value;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    await nextTick();
    const panel = panelRef.value;
    const w = panel?.offsetWidth ?? opts.widthPx ?? 160;
    const h = panel?.offsetHeight ?? 0;
    const pos = computeAnchoredMenuPosition(
      rect,
      { width: w, height: h },
      opts.placement,
      { gap: opts.gap, margin: opts.margin },
    );
    left.value = pos.left;
    top.value = pos.top;
  }

  async function openMenu() {
    if (opts.disabled?.value) return;
    open.value = true;
    await reposition();
  }

  function closeMenu() {
    if (!open.value) return;
    open.value = false;
    opts.onClose?.();
  }

  async function toggleMenu() {
    if (opts.disabled?.value) return;
    if (open.value) {
      closeMenu();
      return;
    }
    await openMenu();
  }

  function isExcludedTarget(target: Node | null): boolean {
    if (!target) return false;
    if (opts.anchor.value?.contains(target)) return true;
    if (panelRef.value?.contains(target)) return true;
    const extra = opts.excludeCloseWithin?.value ?? [];
    for (const el of extra) {
      if (el?.contains(target)) return true;
    }
    return false;
  }

  function onDocPointerDown(ev: PointerEvent) {
    if (!open.value || opts.enableDismiss === false) return;
    if (isExcludedTarget(ev.target as Node | null)) return;
    closeMenu();
  }

  function onDocKeydown(ev: KeyboardEvent) {
    if (opts.enableDismiss === false) return;
    if (ev.key !== "Escape" || !open.value) return;
    ev.preventDefault();
    closeMenu();
  }

  function onWindowResize() {
    if (!open.value) return;
    void reposition();
  }

  if (opts.enableDismiss !== false) {
    onMounted(() => {
      document.addEventListener("pointerdown", onDocPointerDown);
      document.addEventListener("keydown", onDocKeydown, true);
      window.addEventListener("resize", onWindowResize);
    });

    onBeforeUnmount(() => {
      document.removeEventListener("pointerdown", onDocPointerDown);
      document.removeEventListener("keydown", onDocKeydown, true);
      window.removeEventListener("resize", onWindowResize);
    });
  } else {
    onMounted(() => {
      window.addEventListener("resize", onWindowResize);
    });
    onBeforeUnmount(() => {
      window.removeEventListener("resize", onWindowResize);
    });
  }

  watch(open, (isOpen) => {
    if (isOpen) void reposition();
  });

  const panelStyle = computed(() => ({
    left: `${left.value}px`,
    top: `${top.value}px`,
    zIndex: opts.zIndex ?? 7200,
    ...(opts.widthPx != null ? { width: `${opts.widthPx}px` } : {}),
    ...(opts.panelMaxHeight != null
      ? { maxHeight: `${opts.panelMaxHeight}px` }
      : {}),
  }));

  return {
    open,
    panelRef,
    left,
    top,
    panelStyle,
    openMenu,
    closeMenu,
    toggleMenu,
    reposition,
  };
}
