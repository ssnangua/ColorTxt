<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";

const src = defineModel<string>({ default: "" });

function onDocKeydown(ev: KeyboardEvent) {
  if (ev.key !== "Escape" || !src.value) return;
  ev.preventDefault();
  src.value = "";
}

onMounted(() => {
  document.addEventListener("keydown", onDocKeydown);
});
onBeforeUnmount(() => {
  document.removeEventListener("keydown", onDocKeydown);
});
</script>

<template>
  <Teleport to="body">
    <Transition name="reader-lightbox">
      <div
        v-if="src"
        class="readerImageLightboxBackdrop"
        role="dialog"
        aria-modal="true"
        aria-label="图片预览"
        @click="src = ''"
      >
        <img class="readerImageLightboxImg" :src="src" alt="" />
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.readerImageLightboxBackdrop {
  position: fixed;
  inset: 0;
  z-index: 12000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, #000 55%, transparent);
  padding: 24px;
  box-sizing: border-box;
  cursor: zoom-out;
}

.readerImageLightboxImg {
  max-width: min(96vw, 1600px);
  max-height: 92vh;
  object-fit: contain;
  border-radius: 4px;
  transform-origin: center center;
  cursor: zoom-out;
  background-color: var(--panel);
  box-shadow: 0 8px 32px color-mix(in srgb, #000 40%, transparent);
}

.reader-lightbox-enter-active,
.reader-lightbox-leave-active {
  transition: opacity 0.32s cubic-bezier(0.4, 0, 0.2, 1);
}

.reader-lightbox-enter-active .readerImageLightboxImg,
.reader-lightbox-leave-active .readerImageLightboxImg {
  transition:
    transform 0.38s cubic-bezier(0.34, 1.15, 0.64, 1),
    opacity 0.32s cubic-bezier(0.4, 0, 0.2, 1);
}

.reader-lightbox-enter-from,
.reader-lightbox-leave-to {
  opacity: 0;
}

.reader-lightbox-enter-from .readerImageLightboxImg,
.reader-lightbox-leave-to .readerImageLightboxImg {
  transform: scale(0.9);
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .reader-lightbox-enter-active,
  .reader-lightbox-leave-active,
  .reader-lightbox-enter-active .readerImageLightboxImg,
  .reader-lightbox-leave-active .readerImageLightboxImg {
    transition-duration: 0.01ms !important;
  }
}
</style>
