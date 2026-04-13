<script setup lang="ts">
import { computed, ref, watch } from "vue";
import AppModal from "./AppModal.vue";
import NumericInput from "./NumericInput.vue";
import RangeSlider from "./RangeSlider.vue";
import SwitchToggle from "./SwitchToggle.vue";
import PathPickerInput from "./PathPickerInput.vue";
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
  skipSettingsPersistenceSessionKey,
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
  /** 与「内容上色」同时生效：成对引号/括号是否跨行 */
  txtrDelimitedMatchCrossLine: boolean;
  /** 电子书转换缓存目录；清空后与源文件同目录；默认 userData/ConvertedTxt */
  ebookConvertOutputDir: string;
};

const modelValue = defineModel<boolean>({ default: false });

const props = defineProps<{
  restoreSessionOnStartup: boolean;
  recentFilesHistoryLimit: number;
  fullscreenReaderWidthPercent: number;
  readerFontSize: number;
  readerLineHeightMultiple: number;
  compressBlankKeepOneBlank: boolean;
  monacoCustomHighlight: boolean;
  txtrDelimitedMatchCrossLine: boolean;
  ebookConvertOutputDir: string;
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
const draftTxtrDelimitedMatchCrossLine = ref(false);
const draftEbookConvertOutputDir = ref("");

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
  draftTxtrDelimitedMatchCrossLine.value = props.txtrDelimitedMatchCrossLine;
  draftEbookConvertOutputDir.value = props.ebookConvertOutputDir;
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
    txtrDelimitedMatchCrossLine: draftTxtrDelimitedMatchCrossLine.value,
    ebookConvertOutputDir: draftEbookConvertOutputDir.value.trim(),
  });
}

async function onRestoreDefaults() {
  const ok = await window.colorTxt.confirmResetUiSettings();
  if (!ok) return;
  try {
    sessionStorage.setItem(skipSettingsPersistenceSessionKey, "1");
  } catch {
    // ignore
  }
  try {
    localStorage.removeItem(persistKey);
  } catch {
    // ignore
  }
  window.location.reload();
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
        <div class="settingsRowMain settingsRowMain--baseline">
          <span class="settingsLabel small">电子书转换缓存目录</span>
          <div class="settingsEbookDirActions">
            <PathPickerInput
              v-model="draftEbookConvertOutputDir"
              is-directory
              aria-label="电子书转换缓存目录"
              class="settingsEbookPathPicker"
            />
          </div>
        </div>
        <p class="settingsHint">
          打开其他格式的电子书时，会自动转换为 txt 格式并缓存到该目录下；<br />如果放空，将缓存到源文件同目录下。
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
          <span class="settingsLabel">引号/括号匹配支持跨行</span>
          <SwitchToggle
            v-model="draftTxtrDelimitedMatchCrossLine"
            :disabled="!monacoCustomHighlight"
            aria-label="引号/括号匹配支持跨行"
          />
        </div>
        <p class="settingsHint">
          仅在开启「内容上色」时生效，开启后引号和括号会跨行匹配；<br />如果出现大段非引号/括号内的文本被误上色，是因为原文没有正确关闭引号/括号，可禁用该选项以降低影响范围。
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
        <div class="settingsFooterLeft">
          <button
            class="btn"
            type="button"
            size="large"
            @click="onRestoreDefaults"
          >
            恢复默认
          </button>
          <button
            class="btn warning"
            type="button"
            size="large"
            @click="onClearCache"
          >
            清除缓存
          </button>
        </div>
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

.settingsEbookDirActions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex: 1 1 65%;
  min-width: 0;
}

.settingsEbookPathPicker {
  flex: 1;
  min-width: 0;
  max-width: 100%;
}

.settingsLabel {
  font-size: 14px;
  color: var(--fg);
  flex: 1 1 60%;
  min-width: 60%;
}
.settingsLabel.small {
  flex: 1 1 35%;
  min-width: 35%;
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

.settingsFooterLeft {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

.settingsFooterActions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
</style>
