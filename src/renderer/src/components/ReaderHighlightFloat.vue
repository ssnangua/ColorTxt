<script setup lang="ts">
import { icons } from "../icons";

defineProps<{
  tipVisible: boolean;
  pickerVisible: boolean;
  tipTop: number;
  tipLeft: number;
  pickerTop: number;
  pickerLeft: number;
  openDownward: boolean;
  highlightColors: readonly string[];
  /** 当前选中文案是否已是关键词（显示移除行） */
  showRemoveRow: boolean;
  /** 已有关键词时对应色索引；否则 null */
  existingColorIndex: number | null;
}>();

const emit = defineEmits<{
  pickOpen: [ev: PointerEvent];
  pickConfirm: [colorIndex: number];
  pickRemove: [];
}>();
</script>

<template>
  <div
    v-show="tipVisible"
    class="hlTip"
    :style="{ top: `${tipTop}px`, left: `${tipLeft}px` }"
  >
    <button
      type="button"
      class="hlTipBtn"
      aria-label="设置高亮词"
      title="设置高亮词"
      @pointerdown="emit('pickOpen', $event)"
    >
      <span class="hlTipIcon" aria-hidden="true" v-html="icons.highlightMark"></span>
    </button>
  </div>
  <div
    v-show="pickerVisible"
    class="hlPicker"
    :class="{ hlPickerFlipDown: openDownward }"
    :style="{ top: `${pickerTop}px`, left: `${pickerLeft}px` }"
  >
    <div v-if="showRemoveRow" class="hlSwatchRow hlPickerRemoveRow">
      <button
        type="button"
        class="hlSwatch hlRemoveKeyword"
        aria-label="移除该高亮词"
        title="移除该高亮词"
        @click="emit('pickRemove')"
      >
        <span class="hlRemoveKeywordInner" aria-hidden="true" v-html="icons.clear"></span>
      </button>
    </div>
    <div class="hlSwatchRow">
      <button
        v-for="(c, i) in highlightColors"
        :key="i"
        type="button"
        class="hlSwatch"
        :class="{
          hlSwatchSelected:
            existingColorIndex === i && existingColorIndex < highlightColors.length,
        }"
        :style="{ backgroundColor: c }"
        :aria-label="`使用高亮色 ${i + 1}`"
        :title="`高亮色 ${i + 1}`"
        :aria-pressed="
          existingColorIndex === i && existingColorIndex < highlightColors.length
            ? 'true'
            : 'false'
        "
        @click="emit('pickConfirm', i)"
      ></button>
    </div>
  </div>
</template>

<style scoped>
.hlTip,
.hlPicker {
  position: fixed;
  pointer-events: auto;
}

.hlTipBtn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  box-shadow: 0 2px 8px color-mix(in srgb, #000 12%, transparent);
  cursor: pointer;
}

.hlTipBtn:hover {
  filter: brightness(1.05);
}

.hlTipIcon {
  display: inline-flex;
  width: 22px;
  height: 22px;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.hlTipIcon :deep(svg) {
  width: 22px;
  height: 22px;
  display: block;
}

.hlPicker {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 200px;
  max-height: 40vh;
  overflow-y: auto;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
  box-shadow: 0 4px 16px color-mix(in srgb, #000 18%, transparent);
  transform: translateY(calc(-100%));
}

.hlPicker.hlPickerFlipDown {
  transform: translateY(0);
}

.hlSwatchRow {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.hlSwatch {
  width: 26px;
  height: 26px;
  padding: 0;
  border: 2px solid color-mix(in srgb, var(--border) 80%, transparent);
  border-radius: 50%;
  cursor: pointer;
  flex-shrink: 0;
}

.hlSwatch:hover {
  transform: scale(1.08);
}

.hlSwatch.hlSwatchSelected {
  border-color: var(--bg);
  box-shadow: 0 0 0 2px var(--accent);
}

.hlSwatch.hlRemoveKeyword {
  border: none;
  padding: 0;
  overflow: hidden;
  background: var(--bg);
}

.hlSwatch.hlRemoveKeyword .hlRemoveKeywordInner {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  overflow: hidden;
  pointer-events: none;
}

.hlSwatch.hlRemoveKeyword .hlRemoveKeywordInner :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
}

.hlSwatch.hlRemoveKeyword .hlRemoveKeywordInner :deep(svg path) {
  fill: var(--danger);
}
</style>
