<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import AppCustomSelect, { type CustomSelectItem } from "./AppCustomSelect.vue";
import IconButton from "./IconButton.vue";
import RangeSlider from "./RangeSlider.vue";
import { icons } from "../icons";
import {
  DASHSCOPE_TTS_VOICES,
  defaultVoiceReadSettings,
  voiceReadDashScopeRequiresApiKey,
  voiceReadEngineSupportsPitch,
  voiceReadEngineSupportsRate,
  type VoiceReadEngineId,
  type VoiceReadSettings,
} from "../constants/voiceRead";
import {
  DASHSCOPE_API_KEY_CONSOLE_URL,
  DASHSCOPE_PLATFORM_LABEL,
} from "@shared/apiEndpointPresets";
import { useSecretStorageHint } from "../composables/useSecretStorageHint";
import {
  VoiceReadLinePlayer,
  type VoiceReadPreviewDownload,
} from "../services/voiceRead/voiceReadLinePlayer";
import {
  flatVoiceOptionsToSelectItems,
  groupEdgeTtsVoices,
  groupSystemVoices,
  resolveVoiceReadDisplayLabel,
  voiceGroupsToSelectItems,
} from "../utils/voiceReadVoiceGroups";

const props = defineProps<{
  modelValue: VoiceReadSettings;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: VoiceReadSettings];
}>();

const draft = computed({
  get: () => props.modelValue,
  set: (v: VoiceReadSettings) => emit("update:modelValue", v),
});

const { secretStorageHint } = useSecretStorageHint();

const selectListsEmpty: CustomSelectItem[] = [];

const engineOptions: {
  id: VoiceReadEngineId;
  label: string;
  description: string;
}[] = [
  {
    id: "edge",
    label: "Edge TTS",
    description: "免费高质量微软 Neural 语音",
  },
  {
    id: "system",
    label: "系统语音",
    description: "免费离线，使用设备系统语音",
  },
  {
    id: "dashscope",
    label: DASHSCOPE_PLATFORM_LABEL,
    description: "高质量云端语音，需要 API 密钥",
  },
];

const engineScrollItems: CustomSelectItem[] = engineOptions.map((o) => ({
  kind: "item",
  id: o.id,
  label: o.label,
  description: o.description,
}));

const engineDisplayLabel = computed(() => {
  const hit = engineOptions.find((o) => o.id === draft.value.engine);
  return hit?.label ?? draft.value.engine;
});

function openDashScopeApiKeyPage() {
  void window.colorTxt.openExternal(DASHSCOPE_API_KEY_CONSOLE_URL);
}

const previewText = ref("欢迎使用彩读语音朗读试听。");
const previewBusy = ref(false);
const previewError = ref("");
const previewDownload = ref<VoiceReadPreviewDownload | null>(null);
const showDashScopeKey = ref(false);
const previewPlayer = new VoiceReadLinePlayer();
/** 递增以作废进行中的试听（含 speakLine 之后的 buildLineDownloadable） */
let previewRunId = 0;

const systemVoices = ref<SpeechSynthesisVoice[]>([]);

function refreshSystemVoices() {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  systemVoices.value = window.speechSynthesis.getVoices();
}

onMounted(() => {
  refreshSystemVoices();
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = () => refreshSystemVoices();
  }
});

const voiceScrollItems = computed((): CustomSelectItem[] => {
  if (draft.value.engine === "system") {
    return voiceGroupsToSelectItems(groupSystemVoices(systemVoices.value));
  }
  if (draft.value.engine === "edge") {
    return voiceGroupsToSelectItems(groupEdgeTtsVoices());
  }
  return flatVoiceOptionsToSelectItems(DASHSCOPE_TTS_VOICES);
});

const voiceScrollHasOptions = computed(() =>
  voiceScrollItems.value.some((i) => i.kind === "item"),
);

const voiceScrollMaxHeight = computed(() =>
  draft.value.engine === "dashscope" ? 280 : 360,
);

const voiceDisplayLabel = computed(() =>
  resolveVoiceReadDisplayLabel(
    draft.value.engine,
    draft.value.voiceId,
    systemVoices.value,
  ),
);

watch(
  () => draft.value.engine,
  (eng, prev) => {
    if (eng === prev) return;
    if (eng === "system") {
      refreshSystemVoices();
      const first = systemVoices.value[0];
      patchDraft({ voiceId: first?.voiceURI ?? "" });
    } else if (eng === "edge") {
      patchDraft({ voiceId: defaultVoiceReadSettings.voiceId });
    } else {
      patchDraft({ voiceId: DASHSCOPE_TTS_VOICES[0]?.id ?? "Cherry" });
    }
  },
);

function patchDraft(p: Partial<VoiceReadSettings>) {
  emit("update:modelValue", { ...draft.value, ...p });
}

function clearPreviewDownload() {
  previewDownload.value = null;
}

function cancelPreview() {
  previewRunId += 1;
  previewPlayer.stop();
  previewBusy.value = false;
  previewError.value = "";
  clearPreviewDownload();
}

async function onPreview() {
  if (previewBusy.value) return;
  const runId = ++previewRunId;
  const settings = { ...draft.value };
  previewBusy.value = true;
  previewError.value = "";
  clearPreviewDownload();
  previewPlayer.stop();
  const text = previewText.value.trim() || "试听";
  try {
    await previewPlayer.speakLine(settings, text);
    if (runId !== previewRunId) return;
    if (settings.engine !== "system") {
      const item = await previewPlayer.buildLineDownloadable(settings, text);
      if (runId !== previewRunId) return;
      previewDownload.value = item;
    }
  } catch (e) {
    if (runId !== previewRunId) return;
    previewError.value = e instanceof Error ? e.message : String(e);
  } finally {
    if (runId === previewRunId) previewBusy.value = false;
  }
}

function onPreviewDownload() {
  const item = previewDownload.value;
  if (!item) return;
  const url = URL.createObjectURL(item.blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = item.filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

watch(
  () =>
    [
      draft.value.engine,
      draft.value.voiceId,
      draft.value.dashscopeApiKey,
      draft.value.rate,
      draft.value.pitch,
      previewText.value,
    ] as const,
  () => {
    if (previewBusy.value) cancelPreview();
    else {
      previewError.value = "";
      clearPreviewDownload();
    }
  },
);

const previewDisabled = computed(
  () => previewBusy.value || voiceReadDashScopeRequiresApiKey(draft.value),
);

const rateDisabled = computed(
  () => !voiceReadEngineSupportsRate(draft.value.engine),
);
const pitchDisabled = computed(
  () => !voiceReadEngineSupportsPitch(draft.value.engine),
);
</script>

<template>
  <div class="settingsBody">
    <section class="voiceReadSection">
      <div class="settingsRow">
        <div class="settingsRowMain settingsRowMain--baseline">
          <span class="settingsLabel short">引擎</span>
          <AppCustomSelect
            class="voiceReadSelect"
            :model-value="draft.engine"
            :display-label="engineDisplayLabel"
            :fixed-top-items="selectListsEmpty"
            :scroll-items="engineScrollItems"
            :fixed-bottom-items="selectListsEmpty"
            :scroll-max-height="280"
            ariaLabel="引擎"
            @update:model-value="
              patchDraft({ engine: $event as VoiceReadEngineId })
            "
          />
        </div>
      </div>

      <div class="settingsRow">
        <div class="settingsRowMain settingsRowMain--baseline">
          <span class="settingsLabel short">语音</span>
          <AppCustomSelect
            class="voiceReadSelect"
            :model-value="draft.voiceId"
            :display-label="voiceDisplayLabel"
            :placeholder="voiceScrollHasOptions ? '' : '暂无可用语音'"
            :fixed-top-items="selectListsEmpty"
            :scroll-items="voiceScrollItems"
            :fixed-bottom-items="selectListsEmpty"
            :scroll-max-height="voiceScrollMaxHeight"
            ariaLabel="语音"
            @update:model-value="patchDraft({ voiceId: $event })"
          />
        </div>
      </div>

      <div v-if="draft.engine === 'dashscope'" class="settingsRow">
        <div class="settingsRowMain settingsRowMain--baseline">
          <span class="settingsLabel short">API 密钥</span>
          <div class="voiceReadRowField">
            <div class="settingsPasswordRow voiceReadPasswordRow">
              <input
                class="settingsStretchInput settingsPasswordRow__input"
                :type="showDashScopeKey ? 'text' : 'password'"
                autocomplete="off"
                spellcheck="false"
                :value="draft.dashscopeApiKey"
                @input="
                  patchDraft({
                    dashscopeApiKey: ($event.target as HTMLInputElement).value,
                  })
                "
              />
              <button
                type="button"
                class="btn iconOnly"
                :title="showDashScopeKey ? '隐藏' : '显示'"
                :aria-label="
                  showDashScopeKey ? '隐藏 API 密钥' : '显示 API 密钥'
                "
                @click="showDashScopeKey = !showDashScopeKey"
              >
                <span
                  class="iconSvg"
                  v-html="showDashScopeKey ? icons.view : icons.viewOff"
                />
              </button>
            </div>
          </div>
        </div>
        <p class="settingsHint">
          从阿里百炼平台
          <a href="#" @click.prevent="openDashScopeApiKeyPage">获取 API 密钥</a
          >，使用 qwen3-tts-flash 模型。
        </p>
        <p class="settingsHint">{{ secretStorageHint }}</p>
      </div>

      <div class="settingsRow">
        <div class="settingsRowMain">
          <span class="settingsLabel short"
            >语速（{{ draft.rate.toFixed(2) }}）</span
          >
          <RangeSlider
            :model-value="draft.rate"
            :min="0.5"
            :max="2"
            :step="0.05"
            :disabled="rateDisabled"
            :show-percent="false"
            aria-label="语速"
            @update:model-value="patchDraft({ rate: $event })"
          />
        </div>
        <p v-if="rateDisabled" class="settingsHint">当前引擎不支持调节语速。</p>
      </div>

      <div class="settingsRow">
        <div class="settingsRowMain">
          <span class="settingsLabel short"
            >音调（{{ draft.pitch.toFixed(2) }}）</span
          >
          <RangeSlider
            :model-value="draft.pitch"
            :min="0.5"
            :max="2"
            :step="0.05"
            :disabled="pitchDisabled"
            :show-percent="false"
            aria-label="音调"
            @update:model-value="patchDraft({ pitch: $event })"
          />
        </div>
      </div>
    </section>

    <section class="voiceReadSection voiceReadSection--preview">
      <div class="settingsRow">
        <textarea
          v-model="previewText"
          class="settingsStretchTextarea settingsStretchTextarea--multiline"
          rows="3"
          aria-label="试听文本"
        />
      </div>
      <div class="settingsRow">
        <div class="settingsRowMain voiceReadPreviewActions">
          <div class="voiceReadPreviewActionsGroup">
            <p v-if="previewError" class="voiceReadPreviewError" role="alert">
              {{ previewError }}
            </p>
            <IconButton
              v-if="previewDownload"
              class="voiceReadPreviewDownloadBtn"
              :icon-html="icons.download"
              title="保存试听音频"
              aria-label="保存试听音频"
              large
              @click="onPreviewDownload"
            />
            <button
              type="button"
              class="btn voiceReadPreviewBtn"
              :class="[previewBusy ? 'warning' : 'primary']"
              size="large"
              :disabled="previewDisabled"
              @click="onPreview"
            >
              {{ previewBusy ? "播放中…" : "试听" }}
            </button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.settingsBody {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 16px;
  background-color: var(--bg);
  border-radius: 8px;
}

.voiceReadSection {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.voiceReadSection--preview {
  gap: 10px;
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
  gap: 10px;
  min-width: 0;
}

.settingsRowMain--baseline {
  align-items: baseline;
}

.settingsRowMain--right {
  justify-content: flex-end;
}

.voiceReadPreviewActions {
  justify-content: flex-end;
}

.voiceReadPreviewActionsGroup {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  max-width: 100%;
  min-width: 0;
}

.voiceReadPreviewError {
  flex: 0 1 auto;
  min-width: 0;
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--danger);
  text-align: right;
}

.voiceReadPreviewDownloadBtn {
  flex-shrink: 0;
}

.voiceReadPreviewBtn {
  flex-shrink: 0;
}

.settingsLabel {
  font-size: 14px;
  color: var(--fg);
  flex: 1 1 60%;
  min-width: 60%;
}

.settingsLabel.short {
  flex: 1 1 30%;
  min-width: 30%;
}

.settingsHint {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--muted);
}

.voiceReadSelect {
  flex: 1 1 65%;
  min-width: 0;
  max-width: 100%;
}

.voiceReadRowField {
  flex: 1 1 65%;
  min-width: 0;
  max-width: 100%;
}

.voiceReadPasswordRow {
  width: 100%;
}

.settingsStretchInput,
.settingsStretchTextarea {
  width: 100%;
  min-width: 0;
}

.settingsPasswordRow {
  display: flex;
  align-items: stretch;
  gap: 8px;
  min-width: 0;
}

.settingsPasswordRow__input {
  flex: 1;
  min-width: 0;
}

.iconOnly {
  padding: 6px;
  flex-shrink: 0;
}

.iconSvg :deep(svg) {
  width: 16px;
  height: 16px;
  display: block;
}

.iconSvg :deep(svg path) {
  fill: currentColor;
}

.settingsStretchTextarea--multiline {
  resize: none;
  min-height: 72px;
}

.settingsHint a {
  color: var(--primary);
  text-decoration: none;
}

.settingsHint a:hover {
  color: var(--primary-hover);
  text-decoration: underline;
}
</style>
