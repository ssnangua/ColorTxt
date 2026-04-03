<script setup lang="ts">
import { nextTick } from "vue";

const modelValue = defineModel<number>({ required: true });

const props = withDefaults(
  defineProps<{
    min?: number;
    max?: number;
    /** 为 true 时仅允许整数（向下取整后再做 min/max 约束） */
    integer?: boolean;
    /** 供屏幕阅读器使用 */
    ariaLabel?: string;
  }>(),
  { integer: false, ariaLabel: "" },
);

function normalize(raw: number): number {
  let v = raw;
  if (!Number.isFinite(v)) {
    v = props.min !== undefined ? props.min : 0;
  }
  if (props.integer) {
    v = Math.floor(v);
  }
  if (props.min !== undefined) {
    v = Math.max(props.min, v);
  }
  if (props.max !== undefined) {
    v = Math.min(props.max, v);
  }
  return v;
}

function commit(e: Event) {
  const el = e.target as HTMLInputElement;
  const raw = el.valueAsNumber;
  const next = normalize(Number.isFinite(raw) ? raw : NaN);
  modelValue.value = next;
  /** 与 model 数值相同但 DOM 仍可能为 `20.` 等，需在下一帧写回规范字符串 */
  void nextTick(() => {
    el.value = String(next);
  });
}
</script>

<template>
  <input
    v-model.number="modelValue"
    class="numericInput"
    type="number"
    :min="min"
    :max="max"
    :step="integer ? 1 : 'any'"
    :aria-label="ariaLabel || undefined"
    @change="commit"
    @blur="commit"
  />
</template>

<style scoped>
.numericInput {
  width: 88px;
  flex-shrink: 0;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--fg);
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}
</style>
