<script setup lang="ts">
import { onBeforeUnmount, watch } from "vue";
import type { CharacterRosterEntry } from "@shared/characterTypes";
import type { CharacterCardTextureEffectId } from "@shared/characterCardTextureEffects";
import { DEFAULT_CHARACTER_CARD_TEXTURE_EFFECT } from "@shared/characterCardTextureEffects";
import { pushEscBeforeModal } from "../utils/modalStack";
import CharacterRosterCard from "./CharacterRosterCard.vue";
import IconButton from "./IconButton.vue";
import { icons } from "../icons";

const open = defineModel<boolean>("open", { default: false });

const props = withDefaults(
  defineProps<{
    entry: CharacterRosterEntry | null;
    portraitUrl: string | null;
    flipped: boolean;
    nameZoom?: number;
    textureEffect?: CharacterCardTextureEffectId;
  }>(),
  {
    nameZoom: 1,
    textureEffect: DEFAULT_CHARACTER_CARD_TEXTURE_EFFECT,
  },
);

const emit = defineEmits<{
  "update:flipped": [value: boolean];
}>();

let removeEscBefore: (() => void) | null = null;

watch(
  open,
  (v) => {
    removeEscBefore?.();
    removeEscBefore = null;
    if (!v) return;
    removeEscBefore = pushEscBeforeModal(() => {
      open.value = false;
    });
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  removeEscBefore?.();
  removeEscBefore = null;
});

function close() {
  open.value = false;
}

function onToggleFlip() {
  if (!props.entry) return;
  emit("update:flipped", !props.flipped);
}
</script>

<template>
  <Teleport to="body">
    <Transition name="char-card-zoom">
      <div
        v-if="open && entry"
        class="charCardZoomRoot"
        role="dialog"
        aria-modal="true"
        :aria-label="`${entry.displayName || '角色'} 角色卡`"
      >
        <div class="charCardZoomBackdrop" aria-hidden="true" />
        <IconButton
          class="charCardZoomClose"
          :icon-html="icons.close"
          title="关闭"
          aria-label="关闭角色卡大图"
          @click="close"
        />
        <div class="charCardZoomStage">
          <CharacterRosterCard
            zoom-mode
            :entry="entry"
            :portrait-url="portraitUrl"
            :flipped="flipped"
            :name-zoom="nameZoom"
            :texture-effect="textureEffect"
            @toggle-flip="onToggleFlip"
          />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.charCardZoomRoot {
  position: fixed;
  inset: 0;
  z-index: 12000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px 24px 24px;
  box-sizing: border-box;
  pointer-events: auto;
}

.charCardZoomBackdrop {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, #000 58%, transparent);
  pointer-events: none;
}

.charCardZoomClose {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 2;
  width: 36px;
  height: 36px;
  background: color-mix(in srgb, var(--panel) 88%, transparent);
  border: 1px solid var(--border);
  border-radius: 8px;
}

.charCardZoomClose:hover {
  background: var(--panel);
}

:deep(.charCardZoomClose .icon) {
  color: var(--fg);
}

.charCardZoomStage {
  position: relative;
  z-index: 1;
  width: min(92vw, 420px);
  max-height: min(88vh, 630px);
  aspect-ratio: 2 / 3;
}

.char-card-zoom-enter-active,
.char-card-zoom-leave-active {
  transition: opacity 0.32s cubic-bezier(0.4, 0, 0.2, 1);
}

.char-card-zoom-enter-active .charCardZoomStage,
.char-card-zoom-leave-active .charCardZoomStage {
  transition:
    transform 0.42s cubic-bezier(0.34, 1.12, 0.64, 1),
    opacity 0.32s cubic-bezier(0.4, 0, 0.2, 1);
}

.char-card-zoom-enter-from,
.char-card-zoom-leave-to {
  opacity: 0;
}

.char-card-zoom-enter-from .charCardZoomStage,
.char-card-zoom-leave-to .charCardZoomStage {
  transform: scale(0.82) rotateY(-8deg);
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .char-card-zoom-enter-active,
  .char-card-zoom-leave-active,
  .char-card-zoom-enter-active .charCardZoomStage,
  .char-card-zoom-leave-active .charCardZoomStage {
    transition-duration: 0.01ms !important;
  }
}
</style>
