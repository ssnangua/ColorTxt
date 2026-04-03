<script setup lang="ts">
const modelValue = defineModel<boolean>({ default: false });

withDefaults(
  defineProps<{
    /** 供屏幕阅读器使用；无可见标签时请传入 */
    ariaLabel?: string;
    /** `md` 默认；`sm` 用于侧栏等紧凑区域 */
    size?: "md" | "sm";
  }>(),
  { ariaLabel: "", size: "md" },
);
</script>

<template>
  <label
    class="switchToggle"
    :class="{ 'switchToggle--sm': size === 'sm' }"
  >
    <input
      v-model="modelValue"
      class="switchToggleInput"
      type="checkbox"
      role="switch"
      :aria-checked="modelValue"
      :aria-label="ariaLabel || undefined"
    />
    <span class="switchToggleTrack" aria-hidden="true" />
  </label>
</template>

<style scoped>
.switchToggle {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
  cursor: pointer;
}

.switchToggleInput {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.switchToggleTrack {
  width: 40px;
  height: 22px;
  border-radius: 11px;
  background: var(--switch-track-off-bg);
  transition: background 0.18s ease;
  position: relative;
}

.switchToggleTrack::after {
  content: "";
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
  transition: transform 0.18s ease;
}

.switchToggleInput:checked + .switchToggleTrack {
  background: var(--accent);
}

.switchToggleInput:checked + .switchToggleTrack::after {
  transform: translateX(18px);
}

/* 小一号：轨道与滑块同比缩小 */
.switchToggle--sm .switchToggleTrack {
  width: 32px;
  height: 18px;
  border-radius: 9px;
}

.switchToggle--sm .switchToggleTrack::after {
  top: 3px;
  left: 3px;
  width: 12px;
  height: 12px;
}

.switchToggle--sm .switchToggleInput:checked + .switchToggleTrack::after {
  transform: translateX(14px);
}
</style>
