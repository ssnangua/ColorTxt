<script setup lang="ts">
import { computed, ref, watch } from "vue";
import AppModal from "./AppModal.vue";
import NumericInput from "./NumericInput.vue";
import RangeSlider from "./RangeSlider.vue";
import SwitchToggle from "./SwitchToggle.vue";
import {
  clampLineHeightMultipleForFontSize,
  lineHeightMultipleStep,
  maxFontSize,
  maxFullscreenReaderWidthPercent,
  maxLineHeightMultipleForFontSize,
  maxRecentFilesHistoryLimit,
  minFontSize,
  minFullscreenReaderWidthPercent,
  minLineHeightMultiple,
  persistKey,
  skipUnloadPersistenceSessionKey,
} from "../constants/appUi";

export type SettingsApplyPayload = {
  restoreSessionOnStartup: boolean;
  recentFilesHistoryLimit: number;
  fullscreenReaderWidthPercent: number;
  fontSize: number;
  lineHeightMultiple: number;
  /** 压缩空行时是否在每行正文下方保留一行空行（章节标题行除外） */
  compressBlankKeepOneBlank: boolean;
};

const modelValue = defineModel<boolean>({ default: false });

const props = defineProps<{
  restoreSessionOnStartup: boolean;
  recentFilesHistoryLimit: number;
  fullscreenReaderWidthPercent: number;
  readerFontSize: number;
  readerLineHeightMultiple: number;
  compressBlankKeepOneBlank: boolean;
}>();

const emit = defineEmits<{
  apply: [payload: SettingsApplyPayload];
}>();

const draftRestore = ref(true);
const draftRecentLimit = ref(20);
const draftFullscreenReaderWidthPercent = ref(50);
const draftFontSize = ref(14);
const draftLineHeightMultiple = ref(1.5);
const draftCompressBlankKeepOneBlank = ref(false);

const draftMaxLineHeightMultiple = computed(() =>
  maxLineHeightMultipleForFontSize(draftFontSize.value),
);

watch(modelValue, (open) => {
  if (!open) return;
  draftRestore.value = props.restoreSessionOnStartup;
  draftRecentLimit.value = props.recentFilesHistoryLimit;
  draftFullscreenReaderWidthPercent.value = props.fullscreenReaderWidthPercent;
  draftFontSize.value = props.readerFontSize;
  draftLineHeightMultiple.value = clampLineHeightMultipleForFontSize(
    props.readerFontSize,
    props.readerLineHeightMultiple,
  );
  draftCompressBlankKeepOneBlank.value = props.compressBlankKeepOneBlank;
});

watch(draftFontSize, (fs) => {
  const cap = maxLineHeightMultipleForFontSize(fs);
  if (draftLineHeightMultiple.value > cap + 1e-6) {
    draftLineHeightMultiple.value = cap;
  }
});

function onCancel() {
  modelValue.value = false;
}

function onConfirm() {
  emit("apply", {
    restoreSessionOnStartup: draftRestore.value,
    recentFilesHistoryLimit: draftRecentLimit.value,
    fullscreenReaderWidthPercent: draftFullscreenReaderWidthPercent.value,
    fontSize: draftFontSize.value,
    lineHeightMultiple: draftLineHeightMultiple.value,
    compressBlankKeepOneBlank: draftCompressBlankKeepOneBlank.value,
  });
}

async function onClearCache() {
  const ok = await window.colorTxt.confirmClearAppCache();
  if (!ok) return;
  try {
    sessionStorage.setItem(skipUnloadPersistenceSessionKey, "1");
  } catch {
    // ignore
  }
  const saved = localStorage.getItem(persistKey);
  try {
    localStorage.clear();
    if (saved !== null) localStorage.setItem(persistKey, saved);
  } catch {
    // ignore
  }
  window.location.reload();
}
</script>

<template>
  <AppModal
    v-model="modelValue"
    title="设置"
    max-width="500px"
    :mask-closable="true"
    :esc-closable="true"
  >
    <div class="settingsBody">
      <div class="settingsRow">
        <div class="settingsRowMain">
          <span class="settingsLabel">启动时恢复上次关闭的文件</span>
          <SwitchToggle
            v-model="draftRestore"
            aria-label="启动时恢复上次关闭的文件"
          />
        </div>
        <p class="settingsHint">
          关闭后，退出应用时不再保存当前阅读会话（打开的文件及阅读位置）。
        </p>
      </div>

      <div class="settingsRow">
        <div class="settingsRowMain settingsRowMain--baseline">
          <span class="settingsLabel">历史记录数量</span>
          <NumericInput
            v-model="draftRecentLimit"
            :min="0"
            :max="maxRecentFilesHistoryLimit"
            integer
            aria-label="历史记录数量"
          />
        </div>
        <p class="settingsHint">
          最近打开文件的保留条数；设置为 0 时不记录最近打开的文件。
        </p>
      </div>

      <div class="settingsRow">
        <div class="settingsRowMain">
          <span class="settingsLabel">字号（{{ draftFontSize }} px）</span>
          <RangeSlider
            v-model="draftFontSize"
            :min="minFontSize"
            :max="maxFontSize"
            :step="1"
            :show-percent="false"
            aria-label="阅读字号"
          />
        </div>
      </div>

      <div class="settingsRow">
        <div class="settingsRowMain">
          <span class="settingsLabel"
            >行高（×{{ draftLineHeightMultiple.toFixed(1) }}）</span
          >
          <RangeSlider
            v-model="draftLineHeightMultiple"
            :min="minLineHeightMultiple"
            :max="draftMaxLineHeightMultiple"
            :step="lineHeightMultipleStep"
            :show-percent="false"
            aria-label="行高倍数"
          />
        </div>
      </div>

      <div class="settingsRow">
        <div class="settingsRowMain">
          <span class="settingsLabel">压缩空行时保留一个空行</span>
          <SwitchToggle
            v-model="draftCompressBlankKeepOneBlank"
            aria-label="压缩空行时保留一个空行"
          />
        </div>
        <p class="settingsHint">
          仅在开启「压缩空行」时生效，在每行下方保留一个空行。
        </p>
      </div>

      <div class="settingsRow">
        <div class="settingsRowMain">
          <span class="settingsLabel"
            >全屏阅读区域宽度（{{ draftFullscreenReaderWidthPercent }}%）</span
          >
          <RangeSlider
            v-model="draftFullscreenReaderWidthPercent"
            :min="minFullscreenReaderWidthPercent"
            :max="maxFullscreenReaderWidthPercent"
            :step="1"
            :show-percent="false"
            aria-label="全屏阅读区域宽度百分比"
          />
        </div>
        <p class="settingsHint">仅在全屏模式生效，用于控制阅读区域宽度。</p>
      </div>
    </div>

    <template #footer>
      <div class="settingsFooter">
        <button
          class="btn warning"
          type="button"
          size="large"
          @click="onClearCache"
        >
          清除缓存
        </button>
        <div class="settingsFooterActions">
          <button class="btn" type="button" size="large" @click="onCancel">
            取消
          </button>
          <button
            class="btn primary"
            type="button"
            size="large"
            @click="onConfirm"
          >
            确定
          </button>
        </div>
      </div>
    </template>
  </AppModal>
</template>

<style scoped>
.settingsBody {
  padding: 0 4px 4px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.settingsRow {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.settingsRowMain {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-width: 0;
}

.settingsRowMain--baseline {
  align-items: baseline;
}

.settingsLabel {
  font-size: 14px;
  color: var(--fg);
  flex: 1 1 60%;
  min-width: 60%;
}

.settingsHint {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--muted);
}

.settingsFooter {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}

.settingsFooterActions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
</style>
