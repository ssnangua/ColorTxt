<script setup lang="ts">
import { computed } from "vue";

const modelValue = defineModel<number>({ required: true });

const props = withDefaults(
  defineProps<{
    min?: number;
    max?: number;
    step?: number;
    ariaLabel?: string;
    /** 是否在滑动条右侧显示当前百分比 */
    showPercent?: boolean;
  }>(),
  {
    min: 0,
    max: 100,
    step: 1,
    ariaLabel: "",
    showPercent: true,
  },
);

const safeRange = computed(() => Math.max(1e-9, props.max - props.min));

const progressPercent = computed(() => {
  const ratio = (modelValue.value - props.min) / safeRange.value;
  return Math.max(0, Math.min(100, ratio * 100));
});

function normalize(raw: number): number {
  let v = Number.isFinite(raw) ? raw : props.min;
  if (props.step > 0) {
    v = Math.round((v - props.min) / props.step) * props.step + props.min;
  }
  v = Math.max(props.min, Math.min(props.max, v));
  return Number(v.toFixed(4));
}

function onInput(ev: Event) {
  const el = ev.target as HTMLInputElement;
  modelValue.value = normalize(el.valueAsNumber);
}

function onChange(ev: Event) {
  const el = ev.target as HTMLInputElement;
  const next = normalize(el.valueAsNumber);
  modelValue.value = next;
  el.value = String(next);
}
</script>

<template>
  <div class="rangeSlider">
    <input
      class="rangeSliderInput"
      type="range"
      :value="modelValue"
      :min="min"
      :max="max"
      :step="step"
      :aria-label="ariaLabel || undefined"
      :style="{ '--range-progress': `${progressPercent}%` }"
      @input="onInput"
      @change="onChange"
    />
    <span v-if="showPercent" class="rangeSliderValue">{{ modelValue }}%</span>
  </div>
</template>

<style scoped>
.rangeSlider {
  width: 100%;
  min-width: 80px;
  max-width: 220px;
  flex: 1 1 140px;
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.rangeSliderInput {
  width: 100%;
  flex: 1 1 auto;
  height: 20px;
  margin: 0;
  appearance: none;
  background: transparent;
  cursor: pointer;
}

.rangeSliderInput::-webkit-slider-runnable-track {
  height: 6px;
  border-radius: 999px;
  background: linear-gradient(
    to right,
    var(--accent) 0%,
    var(--accent) var(--range-progress),
    var(--border) var(--range-progress),
    var(--border) 100%
  );
}

.rangeSliderInput::-webkit-slider-thumb {
  appearance: none;
  margin-top: -5px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid var(--accent);
  background: #ffffff;
}

.rangeSliderInput::-moz-range-track {
  height: 6px;
  border-radius: 999px;
  background: var(--border);
}

.rangeSliderInput::-moz-range-progress {
  height: 6px;
  border-radius: 999px;
  background: var(--accent);
}

.rangeSliderInput::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1px solid var(--accent);
  background: var(--btn-bg);
}

.rangeSliderValue {
  width: 48px;
  text-align: right;
  font-size: 13px;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
</style>
