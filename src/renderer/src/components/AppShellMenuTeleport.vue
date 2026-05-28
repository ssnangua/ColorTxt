<script setup lang="ts">
defineOptions({ inheritAttrs: false });

const open = defineModel<boolean>("open", { required: true });

const props = withDefaults(
  defineProps<{
    left: number;
    top: number;
    zIndex?: number;
    width?: number | string;
    minWidth?: number | string;
    maxHeight?: number | string;
    ariaLabel?: string;
    panelClass?: string;
    fullscreenFloat?: boolean;
    /** 由 useAnchoredAppShellMenu 传入，用于测量与夹取定位（避免模板对 Ref prop 自动解包） */
    onPanelMount?: (el: HTMLElement | null) => void;
  }>(),
  {
    zIndex: 7200,
    fullscreenFloat: true,
  },
);

function setPanelEl(el: Element | null | { $el?: unknown }) {
  const node =
    el instanceof HTMLElement
      ? el
      : el && typeof el === "object" && "$el" in el && el.$el instanceof HTMLElement
        ? el.$el
        : null;
  props.onPanelMount?.(node);
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      v-bind="$attrs"
      :ref="setPanelEl"
      class="appShellMenuTeleport appShellMenuPanel"
      :class="panelClass"
      :data-fullscreen-sidebar-float="fullscreenFloat || undefined"
      role="menu"
      :aria-label="ariaLabel"
      :style="{
        position: 'fixed',
        left: `${left}px`,
        top: `${top}px`,
        zIndex,
        width: width != null ? (typeof width === 'number' ? `${width}px` : width) : undefined,
        minWidth:
          minWidth != null
            ? typeof minWidth === 'number'
              ? `${minWidth}px`
              : minWidth
            : undefined,
        maxHeight:
          maxHeight != null
            ? typeof maxHeight === 'number'
              ? `${maxHeight}px`
              : maxHeight
            : undefined,
      }"
      @click.stop
    >
      <slot />
    </div>
  </Teleport>
</template>

<style scoped>
.appShellMenuTeleport {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  overflow: hidden;
}
</style>
