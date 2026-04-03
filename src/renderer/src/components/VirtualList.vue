<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  watch,
  watchEffect,
} from "vue";

const props = withDefaults(
  defineProps<{
    /** 列表项数量 */
    itemCount: number;
    /** 单行高度（px），与行内内容样式一致 */
    rowStride: number;
    /** 视口外多渲染的行数 */
    overscan?: number;
    /** scrollToIndex(align:auto) 时与视口边缘的留白（px） */
    scrollPadding?: number;
    /** 稳定 :key，默认使用 index */
    itemKey?: (index: number) => string | number;
  }>(),
  { overscan: 10, scrollPadding: 5 },
);

const scrollEl = ref<HTMLDivElement | null>(null);
/** 与 FontPicker 中虚拟列表一致：用 scrollTop 驱动可见区间 */
const virtualScrollTop = ref(0);
const listViewportHeight = ref(240);

/** 取消进行中的 rAF 平滑滚动（原生 scrollTo(smooth) 在部分 Electron/WebView 下几乎无动画） */
let cancelPendingSmoothScroll: (() => void) | null = null;

const totalHeight = computed(() =>
  Math.max(0, props.itemCount * props.rowStride),
);

const virtualWindow = computed(() => {
  const n = props.itemCount;
  const stride = props.rowStride;
  const scrollTop = virtualScrollTop.value;
  const viewport = Math.max(1, listViewportHeight.value);
  const os = props.overscan ?? 10;
  if (n <= 0) {
    return { start: 0, end: 0, offsetY: 0, indices: [] as number[] };
  }
  const start = Math.max(0, Math.floor(scrollTop / stride) - os);
  const end = Math.min(n, Math.ceil((scrollTop + viewport) / stride) + os);
  const indices: number[] = [];
  for (let i = start; i < end; i++) indices.push(i);
  return { start, end, offsetY: start * stride, indices };
});

function onScroll(e: Event) {
  virtualScrollTop.value = (e.target as HTMLElement).scrollTop;
}

function resolveKey(index: number): string | number {
  return props.itemKey?.(index) ?? index;
}

watchEffect((onCleanup) => {
  const el = scrollEl.value;
  if (!el) return;
  let lastClientH = 0;
  const update = () => {
    const h = el.clientHeight;
    // 侧栏被 display:none 时高度为 0，保留上次有效高度供 scrollToIndex(center) 计算
    if (h > 0) listViewportHeight.value = h;
    // 隐藏时 scrollTo 可能未真正写入 el.scrollTop，但 virtualScrollTop 已更新；
    // 可见后视口仍在顶部，而虚拟窗口按较大 scrollTop 渲染中段行 → 视口内无节点呈空白。
    if (h > 0 && lastClientH === 0) {
      el.scrollTop = virtualScrollTop.value;
      virtualScrollTop.value = el.scrollTop;
    }
    lastClientH = h;
  };
  update();
  const ro = new ResizeObserver(() => update());
  ro.observe(el);
  onCleanup(() => ro.disconnect());
});

onBeforeUnmount(() => {
  cancelPendingSmoothScroll?.();
  cancelPendingSmoothScroll = null;
});

watch(
  () => props.itemCount,
  () => {
    void nextTick(() => {
      const el = scrollEl.value;
      if (!el) return;
      const maxScroll = Math.max(
        0,
        props.itemCount * props.rowStride - el.clientHeight,
      );
      if (el.scrollTop > maxScroll) {
        el.scrollTop = maxScroll;
        virtualScrollTop.value = maxScroll;
      }
    });
  },
);

function scrollToTop() {
  const el = scrollEl.value;
  if (!el) return;
  el.scrollTop = 0;
  virtualScrollTop.value = 0;
}

/**
 * 将指定下标滚入视口。
 * - center：垂直居中
 * - auto：仅在必要时滚动（与 FontPicker 中选中项滚入逻辑一致）
 */
function scrollToIndex(
  index: number,
  options?: {
    align?: "center" | "auto";
    behavior?: ScrollBehavior;
  },
) {
  const el = scrollEl.value;
  if (!el || props.itemCount <= 0) return;
  const stride = props.rowStride;
  const n = props.itemCount;
  const idx = Math.max(0, Math.min(Math.floor(index), n - 1));
  const itemTop = idx * stride;
  const itemBottom = itemTop + stride;
  const padding = props.scrollPadding ?? 5;
  const align = options?.align ?? "auto";
  const behavior = options?.behavior ?? "auto";

  let nextScrollTop = el.scrollTop;

  if (align === "center") {
    let viewH = el.clientHeight;
    if (viewH <= 0) {
      viewH = Math.max(1, listViewportHeight.value);
    }
    const maxScroll = Math.max(0, n * stride - viewH);
    nextScrollTop = itemTop - viewH / 2 + stride / 2;
    nextScrollTop = Math.max(0, Math.min(nextScrollTop, maxScroll));
  } else {
    const viewTop = el.scrollTop + padding;
    const viewBottom = el.scrollTop + el.clientHeight - padding;
    if (itemTop < viewTop) {
      nextScrollTop = itemTop - padding;
    } else if (itemBottom > viewBottom) {
      nextScrollTop = itemBottom - (el.clientHeight - padding);
    }
    nextScrollTop = Math.max(
      0,
      Math.min(nextScrollTop, Math.max(0, n * stride - el.clientHeight)),
    );
  }

  if (Math.abs(nextScrollTop - el.scrollTop) < 0.5) {
    return;
  }

  if (behavior === "smooth") {
    cancelPendingSmoothScroll?.();

    const reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      el.scrollTop = nextScrollTop;
      virtualScrollTop.value = nextScrollTop;
      cancelPendingSmoothScroll = null;
      return;
    }

    const targetTop = nextScrollTop;
    const startTop = el.scrollTop;
    const dist = targetTop - startTop;
    const durationMs = Math.min(
      480,
      Math.max(160, Math.sqrt(Math.abs(dist)) * 14),
    );

    let cancelled = false;
    let rafId = 0;
    const t0 = performance.now();

    const finish = (root: HTMLElement) => {
      root.scrollTop = targetTop;
      virtualScrollTop.value = targetTop;
      cancelPendingSmoothScroll = null;
    };

    const tick = (now: number) => {
      if (cancelled) return;
      const root = scrollEl.value;
      if (!root) {
        cancelPendingSmoothScroll = null;
        return;
      }
      const t = Math.min(1, (now - t0) / durationMs);
      const eased = 1 - (1 - t) * (1 - t);
      root.scrollTop = startTop + dist * eased;
      virtualScrollTop.value = root.scrollTop;
      if (t < 1 - 1e-6) {
        rafId = requestAnimationFrame(tick);
      } else {
        finish(root);
      }
    };

    cancelPendingSmoothScroll = () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };

    rafId = requestAnimationFrame(tick);
    return;
  }

  el.scrollTo({ top: nextScrollTop, behavior });
  virtualScrollTop.value = nextScrollTop;
}

defineExpose({
  scrollToIndex,
  scrollToTop,
  scrollEl,
});
</script>

<template>
  <div ref="scrollEl" class="virtualList-scroll" @scroll="onScroll">
    <div
      class="virtualList-root"
      :style="{ height: `${totalHeight}px` }"
    >
      <div
        class="virtualList-run"
        :style="{ transform: `translateY(${virtualWindow.offsetY}px)` }"
      >
        <div
          v-for="index in virtualWindow.indices"
          :key="resolveKey(index)"
          class="virtualList-row"
          :style="{ height: `${rowStride}px` }"
        >
          <slot :index="index" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.virtualList-scroll {
  overflow: auto;
  min-height: 0;
  flex: 1;
  width: 100%;
}

.virtualList-root {
  position: relative;
  width: 100%;
}

.virtualList-run {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  display: flex;
  flex-direction: column;
  will-change: transform;
}

.virtualList-row {
  flex-shrink: 0;
  box-sizing: border-box;
}

.virtualList-row > :deep(*) {
  height: 100%;
  width: 100%;
  box-sizing: border-box;
}
</style>
