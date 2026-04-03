<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

type ContextMenuItem = {
  id: string;
  label: string;
  type?: "primary" | "success" | "warning" | "danger";
};

const props = defineProps<{
  open: boolean;
  x: number;
  y: number;
  items: readonly ContextMenuItem[];
  minWidth?: number;
}>();

const emit = defineEmits<{
  close: [];
  select: [id: string];
}>();

const menuRef = ref<HTMLElement | null>(null);
const posX = ref(0);
const posY = ref(0);

function itemClassType(item: ContextMenuItem) {
  return item.type ? `type-${item.type}` : "";
}

function clampPosition() {
  const menu = menuRef.value;
  if (!menu) return;
  const margin = 8;
  const maxX = Math.max(margin, window.innerWidth - menu.offsetWidth - margin);
  const maxY = Math.max(
    margin,
    window.innerHeight - menu.offsetHeight - margin,
  );
  posX.value = Math.min(Math.max(margin, props.x), maxX);
  posY.value = Math.min(Math.max(margin, props.y), maxY);
}

watch(
  () => props.open,
  async (open) => {
    if (!open) return;
    posX.value = props.x;
    posY.value = props.y;
    await nextTick();
    clampPosition();
  },
);

watch(
  () => [props.x, props.y] as const,
  () => {
    if (!props.open) return;
    posX.value = props.x;
    posY.value = props.y;
    void nextTick().then(clampPosition);
  },
);

function onDocPointerDown(ev: PointerEvent) {
  if (!props.open) return;
  const t = ev.target as Node | null;
  if (t && menuRef.value?.contains(t)) return;
  emit("close");
}

function onWindowInvalidate() {
  if (!props.open) return;
  emit("close");
}

onMounted(() => {
  document.addEventListener("pointerdown", onDocPointerDown);
  window.addEventListener("resize", onWindowInvalidate);
  window.addEventListener("blur", onWindowInvalidate);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onDocPointerDown);
  window.removeEventListener("resize", onWindowInvalidate);
  window.removeEventListener("blur", onWindowInvalidate);
});
</script>

<template>
  <div
    v-if="open"
    ref="menuRef"
    class="contextMenu"
    role="menu"
    :style="{
      left: `${posX}px`,
      top: `${posY}px`,
      minWidth: `${minWidth ?? 140}px`,
    }"
    @click.stop
  >
    <button
      v-for="item in items"
      :key="item.id"
      type="button"
      class="contextMenuItem"
      :class="itemClassType(item)"
      role="menuitem"
      @click="emit('select', item.id)"
    >
      {{ item.label }}
    </button>
  </div>
</template>

<style scoped>
.contextMenu {
  position: fixed;
  z-index: 7000;
  padding: 6px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.35);
}

.contextMenuItem {
  width: 100%;
  display: flex;
  align-items: center;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--list-item-fg);
  text-align: left;
  font-size: 13px;
  line-height: 1.2;
  padding: 8px 10px;
  cursor: pointer;
  transition: background-color 0.12s ease;
}

.contextMenuItem:hover {
  background: var(--list-item-bg-hover);
}

.contextMenuItem.type-primary {
  color: var(--primary);
}

.contextMenuItem.type-primary:hover {
  background: var(--primary-bg);
}

.contextMenuItem.type-success {
  color: var(--success);
}

.contextMenuItem.type-success:hover {
  background: var(--success-bg);
}

.contextMenuItem.type-warning {
  color: var(--warning);
}

.contextMenuItem.type-warning:hover {
  background: var(--warning-bg);
}

.contextMenuItem.type-danger {
  color: var(--danger);
}

.contextMenuItem.type-danger:hover {
  background: var(--danger-bg);
}
</style>
