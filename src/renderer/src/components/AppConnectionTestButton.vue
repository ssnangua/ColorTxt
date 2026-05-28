<script setup lang="ts">
import { toValue, type MaybeRefOrGetter } from "vue";
import {
  useConnectionTest,
  type ConnectionTestResult,
} from "../composables/useConnectionTest";

const props = withDefaults(
  defineProps<{
    /** 测试成功后若变更则重置按钮状态（如 baseUrl + apiKey + model） */
    fingerprint: MaybeRefOrGetter<string>;
    onTest: () => Promise<ConnectionTestResult | null>;
    label?: string;
    title?: string;
    disabled?: boolean;
    ariaLabel?: string;
    /** 失败时是否 appAlert（默认 true） */
    alertOnError?: boolean;
  }>(),
  {
    label: "测试连接",
    disabled: false,
    alertOnError: true,
  },
);

const { phase, iconHtml, runTest } = useConnectionTest(() =>
  toValue(props.fingerprint),
);

async function onClick() {
  if (props.disabled || phase.value === "pending") return;
  await runTest(props.onTest, { alertOnError: props.alertOnError });
}
</script>

<template>
  <button
    type="button"
    class="btn appConnectionTestBtn"
    :class="{
      success: phase === 'ok',
      danger: phase === 'fail',
    }"
    :disabled="disabled || phase === 'pending'"
    :title="title"
    :aria-label="ariaLabel ?? label"
    @click="onClick"
  >
    <span
      class="iconSvg appConnectionTestBtn__icon"
      :class="{ 'iconSvg--spinning': phase === 'pending' }"
      v-html="iconHtml"
    />
    {{ label }}
  </button>
</template>

<style scoped>
.appConnectionTestBtn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  white-space: nowrap;
}

.appConnectionTestBtn__icon :deep(svg) {
  width: 16px;
  height: 16px;
  display: block;
}

.appConnectionTestBtn__icon :deep(svg path) {
  fill: currentColor;
}

.appConnectionTestBtn__icon.iconSvg--spinning :deep(svg) {
  animation: appConnectionTestBtnIconSpin 0.65s linear infinite;
}

@keyframes appConnectionTestBtnIconSpin {
  to {
    transform: rotate(360deg);
  }
}
</style>
