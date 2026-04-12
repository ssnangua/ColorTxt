<script setup lang="ts">
import { onBeforeUnmount, ref, useId, useSlots, watch } from "vue";
import { registerModal } from "../utils/modalStack";

const props = withDefaults(
  defineProps<{
    /** 标题；为空则不渲染标题行 */
    title?: string;
    maskClosable?: boolean;
    escClosable?: boolean;
    /** 内容区面板最大宽度，如 520px、800px */
    maxWidth?: string;
    bodyScroll?: boolean;
    panelClass?: string;
  }>(),
  {
    title: "",
    maskClosable: true,
    escClosable: true,
    maxWidth: "520px",
    bodyScroll: true,
    panelClass: "",
  },
);

const modelValue = defineModel<boolean>({ default: false });

const slots = useSlots();
const titleId = useId();

const zIndex = ref(6000);

let unregister: (() => void) | null = null;

function close() {
  modelValue.value = false;
}

function onMaskClick() {
  if (props.maskClosable) close();
}

watch(
  modelValue,
  (open) => {
    if (open) {
      const reg = registerModal({
        close,
        getEscClosable: () => props.escClosable,
      });
      zIndex.value = reg.zIndex;
      unregister = reg.unregister;
    } else {
      unregister?.();
      unregister = null;
    }
  },
  { flush: "sync" },
);

onBeforeUnmount(() => {
  unregister?.();
});
</script>

<template>
  <Transition name="appModal">
    <div
      v-if="modelValue"
      class="appModalBackdrop"
      :style="{ zIndex }"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="title ? titleId : undefined"
      @click.self="onMaskClick"
      @drop.stop.prevent
    >
      <div
        class="appModalPanel"
        :style="{ maxWidth }"
        :class="panelClass"
        @click.stop
      >
        <h2 v-if="title" :id="titleId" class="appModalTitle">{{ title }}</h2>
        <div
          class="appModalBody"
          :class="{ 'appModalBody--noScroll': !bodyScroll }"
        >
          <slot />
        </div>
        <div v-if="slots.footer" class="appModalFooter">
          <slot name="footer" />
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.appModalBackdrop {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.45);
}

.appModal-enter-active,
.appModal-leave-active {
  transition: opacity 0.22s ease;
}

.appModal-enter-from,
.appModal-leave-to {
  opacity: 0;
}

.appModal-enter-active .appModalPanel,
.appModal-leave-active .appModalPanel {
  transform-origin: center center;
  transition:
    transform 0.22s ease-out,
    opacity 0.2s ease-out;
}

.appModal-enter-from .appModalPanel {
  transform: scale(0.9);
  opacity: 0;
}

.appModal-leave-to .appModalPanel {
  transform: scale(0.96);
  opacity: 0;
}

.appModalPanel {
  width: 100%;
  display: flex;
  flex-direction: column;
  max-height: min(90vh, 720px);
  padding: 20px 22px;
  border-radius: 10px;
  background: var(--panel);
  border: 1px solid var(--border);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
}

.appModalTitle {
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 600;
  color: var(--fg);
  flex-shrink: 0;
}

.appModalBody {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
}

.appModalBody--noScroll {
  overflow: hidden;
}

.appModalFooter {
  flex-shrink: 0;
  margin-top: 16px;
  width: 100%;
  min-width: 0;
}
</style>
