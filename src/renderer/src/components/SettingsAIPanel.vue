<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { AIConfig } from "@shared/aiTypes";
import {
  CHAT_API_PROVIDER_CUSTOM_ID,
  CHAT_API_PROVIDER_PRESETS,
  findChatProviderPresetByBaseUrl,
  isChatApiProviderCustomId,
  resolveChatProviderPresetIdFromBaseUrl,
} from "@shared/apiEndpointPresets";
import AppCustomSelect, { type CustomSelectItem } from "./AppCustomSelect.vue";
import ApiEndpointInput from "./ApiEndpointInput.vue";
import AppConnectionTestButton from "./AppConnectionTestButton.vue";
import type { ConnectionTestResult } from "../composables/useConnectionTest";
import AppPullFlashButton, { type AppPullFlashDone } from "./AppPullFlashButton.vue";
import NumericInput from "./NumericInput.vue";
import RangeSlider from "./RangeSlider.vue";
import PathPickerInput from "./PathPickerInput.vue";
import SwitchToggle from "./SwitchToggle.vue";
import { icons } from "../icons";
import { resolveDefaultAiDataCacheDirSync } from "../utils/defaultCacheDirs";
import { useSecretStorageHint } from "../composables/useSecretStorageHint";

const modelValue = defineModel<AIConfig>({ required: true });
const { secretStorageHint } = useSecretStorageHint();

/** 留空时实际使用的绝对路径，用作输入框 placeholder */
const aiDataCacheDirPlaceholder = computed(() => {
  const p = resolveDefaultAiDataCacheDirSync().trim();
  return p || "";
});

const selectListsEmpty: CustomSelectItem[] = [];

const showChatKey = ref(false);
const chatModelsLoading = ref(false);
const chatPullBtnRef = ref<InstanceType<typeof AppPullFlashButton> | null>(null);
const chatModelOptions = ref<string[]>([]);

const chatEndpointFingerprint = computed(() => {
  const c = modelValue.value.chat;
  return `${c.baseUrl.trim()}\0${c.apiKey}\0${c.model.trim()}`;
});

/** 用户显式选中「自定义」且尚未填写地址时，仍保持下拉显示 */
const chatProviderExplicitId = ref("");

const chatProviderSelectItems = computed((): CustomSelectItem[] =>
  CHAT_API_PROVIDER_PRESETS.map((p) => ({
    kind: "item",
    id: p.id,
    label: p.label,
    description: p.listDescription?.trim() || p.baseUrl,
  })),
);

const chatProviderPresetId = computed(() => {
  if (chatProviderExplicitId.value) return chatProviderExplicitId.value;
  return resolveChatProviderPresetIdFromBaseUrl(modelValue.value.chat.baseUrl);
});

const chatProviderDisplayLabel = computed(() => {
  const id = chatProviderPresetId.value;
  if (!id) return "";
  return CHAT_API_PROVIDER_PRESETS.find((p) => p.id === id)?.label ?? "";
});

function onChatProviderPresetSelect(id: string) {
  chatProviderExplicitId.value = id;
  if (isChatApiProviderCustomId(id)) {
    modelValue.value.chat.baseUrl = "";
    return;
  }
  const hit = CHAT_API_PROVIDER_PRESETS.find((p) => p.id === id && !p.custom);
  if (hit?.baseUrl.trim()) modelValue.value.chat.baseUrl = hit.baseUrl;
}

watch(
  () => modelValue.value.chat.baseUrl,
  (url) => {
    const hit = findChatProviderPresetByBaseUrl(url);
    if (hit) {
      chatProviderExplicitId.value = hit.id;
      return;
    }
    if (url.trim()) {
      chatProviderExplicitId.value = CHAT_API_PROVIDER_CUSTOM_ID;
      return;
    }
    // 地址被清空：若此前选过固定服务商，视为改为自定义（避免全选删除后下拉变回占位符）
    if (
      chatProviderExplicitId.value &&
      !isChatApiProviderCustomId(chatProviderExplicitId.value)
    ) {
      chatProviderExplicitId.value = CHAT_API_PROVIDER_CUSTOM_ID;
      return;
    }
    if (chatProviderExplicitId.value !== CHAT_API_PROVIDER_CUSTOM_ID) {
      chatProviderExplicitId.value = "";
    }
  },
  { immediate: true },
);

const chatModelScrollItems = computed((): CustomSelectItem[] =>
  chatModelOptions.value.map((m) => ({
    kind: "item",
    id: m,
    label: m,
  })),
);

const chatModelDisplayLabel = computed(() =>
  modelValue.value.chat.model.trim(),
);

async function refreshChatModels(opts?: { pullDone?: AppPullFlashDone }) {
  const pullDone = opts?.pullDone;
  chatModelsLoading.value = true;
  let ok = false;
  try {
    const r = await window.colorTxt.ai.modelsList({
      baseUrl: modelValue.value.chat.baseUrl,
      apiKey: modelValue.value.chat.apiKey,
    });
    ok = r.ok;
    if (r.ok) {
      chatModelOptions.value = r.models;
      if (r.models.length > 0) {
        const cur = modelValue.value.chat.model.trim();
        if (!cur || !r.models.includes(cur)) {
          modelValue.value.chat.model = r.models[0]!;
        }
      }
    } else chatModelOptions.value = [];
  } finally {
    chatModelsLoading.value = false;
    if (pullDone) pullDone(ok);
    else chatPullBtnRef.value?.clearStaleFailOnSilentSuccess(ok);
  }
}

function onChatModelPanelOpenChange(isOpen: boolean) {
  if (!isOpen || chatModelsLoading.value) return;
  if (chatModelOptions.value.length > 0) return;
  void refreshChatModels();
}

function addQuickQuestion() {
  modelValue.value.quickQuestions.push("");
}

function removeQuickQuestion(i: number) {
  const q = modelValue.value.quickQuestions;
  if (q.length <= 1) return;
  q.splice(i, 1);
}

function canMoveQuickQuestionUp(i: number): boolean {
  return i > 0;
}

function canMoveQuickQuestionDown(i: number): boolean {
  const q = modelValue.value.quickQuestions;
  return q.length > 1 && i < q.length - 1;
}

function moveQuickQuestionUp(i: number) {
  if (!canMoveQuickQuestionUp(i)) return;
  const q = modelValue.value.quickQuestions;
  const [row] = q.splice(i, 1);
  q.splice(i - 1, 0, row);
}

function moveQuickQuestionDown(i: number) {
  if (!canMoveQuickQuestionDown(i)) return;
  const q = modelValue.value.quickQuestions;
  const [row] = q.splice(i, 1);
  q.splice(i + 1, 0, row);
}

async function runChatConnectionTest(): Promise<ConnectionTestResult> {
  const r = await window.colorTxt.ai.testChat({
    baseUrl: modelValue.value.chat.baseUrl,
    apiKey: modelValue.value.chat.apiKey,
    model: modelValue.value.chat.model,
  });
  if (r.ok) return { ok: true };
  return { ok: false, error: r.error };
}

</script>

<template>
  <div class="settingsBody">
    <section class="aiSection aiSection--compact">
      <div class="aiMasterToggleRow">
        <span class="settingsLabel aiMasterToggleLabel"
          >启用「AI 阅读助手」功能</span
        >
        <SwitchToggle
          v-model="modelValue.aiEnabled"
          aria-label="启用AI阅读助手功能"
        />
      </div>
      <p class="aiMasterHint">启用后，会在侧栏显示「AI 阅读助手」入口。</p>
    </section>
    <template v-if="modelValue.aiEnabled">
      <section class="aiSection">
        <h3 class="aiSectionTitle">对话模型</h3>
        <div class="settingsRow">
          <div class="settingsRowMain settingsRowMain--baseline">
            <span class="settingsLabel short">服务商</span>
            <AppCustomSelect
              class="aiChatProviderSelect"
              :model-value="chatProviderPresetId"
              :display-label="chatProviderDisplayLabel"
              placeholder="选择服务商…"
              :fixed-top-items="selectListsEmpty"
              :scroll-items="chatProviderSelectItems"
              :fixed-bottom-items="selectListsEmpty"
              :scroll-max-height="320"
              ariaLabel="对话模型服务商"
              @update:model-value="onChatProviderPresetSelect"
            />
          </div>
        </div>
        <div class="settingsRow">
          <div class="settingsRowMain settingsRowMain--baseline">
            <span class="settingsLabel short">接口地址</span>
            <ApiEndpointInput
              v-model="modelValue.chat.baseUrl"
              :suggestions="[]"
              input-class="aiRowStretchInput"
              aria-label="对话模型接口地址"
            />
          </div>
        </div>
        <div class="settingsRow">
          <div class="settingsRowMain settingsRowMain--baseline">
            <span class="settingsLabel short">API 密钥</span>
            <div class="aiRowField">
              <div class="settingsPasswordRow aiPasswordRow">
                <input
                  v-model="modelValue.chat.apiKey"
                  class="settingsStretchInput settingsPasswordRow__input"
                  :type="showChatKey ? 'text' : 'password'"
                  autocomplete="off"
                  spellcheck="false"
                />
                <button
                  type="button"
                  class="btn iconOnly"
                  :title="showChatKey ? '隐藏' : '显示'"
                  @click="showChatKey = !showChatKey"
                >
                  <span
                    class="iconSvg"
                    v-html="showChatKey ? icons.view : icons.viewOff"
                  />
                </button>
              </div>
            </div>
          </div>
          <p class="settingsHint">{{ secretStorageHint }}</p>
        </div>
        <div class="settingsRow">
          <div class="settingsRowMain settingsRowMain--baseline">
            <span class="settingsLabel short">模型</span>
            <div class="aiChatModelRow">
              <div class="aiModelToolbar aiChatModelToolbar">
                <AppCustomSelect
                  class="aiModelSelect aiChatModelSelect"
                  :model-value="modelValue.chat.model"
                  :display-label="chatModelDisplayLabel"
                  placeholder="选择模型…"
                  :fixed-top-items="selectListsEmpty"
                  :scroll-items="chatModelScrollItems"
                  :fixed-bottom-items="selectListsEmpty"
                  :scroll-max-height="260"
                  ariaLabel="对话模型"
                  @panel-open-change="onChatModelPanelOpenChange"
                  @update:model-value="modelValue.chat.model = $event"
                />
                <AppPullFlashButton
                  ref="chatPullBtnRef"
                  label="拉取模型"
                  :busy="chatModelsLoading"
                  @pull="(done) => void refreshChatModels({ pullDone: done })"
                />
                <AppConnectionTestButton
                  :fingerprint="chatEndpointFingerprint"
                  :on-test="runChatConnectionTest"
                />
              </div>
            </div>
          </div>
        </div>
        <div class="settingsRow">
          <div class="settingsRowMain">
            <span class="settingsLabel"
              >温度（{{ modelValue.chat.temperature }}）</span
            >
            <RangeSlider
              v-model="modelValue.chat.temperature"
              :min="0"
              :max="1"
              :step="0.1"
              :show-percent="false"
              class="temperatureSlider"
            />
          </div>
        </div>
        <div class="settingsRow">
          <div class="settingsRowMain settingsRowMain--baseline">
            <span class="settingsLabel"
              >最大 Token 数（{{ modelValue.chat.maxTokens }}）</span
            >
            <NumericInput
              v-model="modelValue.chat.maxTokens"
              :min="256"
              :max="128000"
              integer
              class="numCompact"
            />
          </div>
        </div>
        <div class="settingsRow">
          <div class="settingsRowMain settingsRowMain--baseline">
            <span class="settingsLabel"
              >上下文长度（{{ modelValue.chat.slidingWindowSize }} 轮）</span
            >
            <NumericInput
              v-model="modelValue.chat.slidingWindowSize"
              :min="1"
              :max="64"
              integer
              class="numCompact"
            />
          </div>
        </div>
      </section>

      <section class="aiSection aiSection--compact">
        <div class="aiMasterToggleRow">
          <span class="settingsLabel aiMasterToggleLabel"
            >显示 Token 消耗量</span
          >
          <SwitchToggle
            v-model="modelValue.showTokenUsage"
            aria-label="显示 Token 消耗量"
          />
        </div>
        <template v-if="modelValue.showTokenUsage">
          <h3 class="aiSectionTitle aiTokenPriceTitle">每百万 Token 价格</h3>
          <p class="settingsHint aiTokenPriceHint">
            如果设置了输入和输出价格，在显示 Token 消耗量时会自动计算并显示总花费；<br />只设置一个输入价格时，全部输入 Token 会按该价格计算。
          </p>
          <div class="settingsRow">
            <div class="settingsRowMain settingsRowMain--baseline">
              <span class="settingsLabel">输入（缓存命中）</span>
              <NumericInput
                v-model="modelValue.chat.tokenPricePerMillion.inputCacheHit"
                :min="0"
                :step="0.01"
                class="aiTokenPriceInput"
                aria-label="输入缓存命中每百万 Token 价格"
              />
            </div>
          </div>
          <div class="settingsRow">
            <div class="settingsRowMain settingsRowMain--baseline">
              <span class="settingsLabel">输入（缓存未命中）</span>
              <NumericInput
                v-model="modelValue.chat.tokenPricePerMillion.inputCacheMiss"
                :min="0"
                :step="0.01"
                class="aiTokenPriceInput"
                aria-label="输入缓存未命中每百万 Token 价格"
              />
            </div>
          </div>
          <div class="settingsRow">
            <div class="settingsRowMain settingsRowMain--baseline">
              <span class="settingsLabel">输出</span>
              <NumericInput
                v-model="modelValue.chat.tokenPricePerMillion.output"
                :min="0"
                :step="0.01"
                class="aiTokenPriceInput"
                aria-label="输出每百万 Token 价格"
              />
            </div>
          </div>
        </template>
      </section>

      <section class="aiSection aiSection--compact">
        <div class="settingsRow">
          <div class="settingsRowMain settingsRowMain--baseline">
            <span class="settingsLabel short">数据缓存目录</span>
            <div class="aiDataCacheActions">
              <PathPickerInput
                v-model="modelValue.aiDataCacheDir"
                is-directory
                :placeholder="aiDataCacheDirPlaceholder"
                aria-label="AI 数据缓存目录"
                class="aiDataCachePicker"
              />
            </div>
          </div>
        </div>
        <p class="aiMasterHint">
          存放 AI 配置与向量库/对话记录。
        </p>
      </section>

      <section class="aiSection quickQSection">
        <h3 class="aiSectionTitle">快速提问</h3>
        <div
          v-for="(_q, i) in modelValue.quickQuestions"
          :key="i"
          class="quickQRow"
        >
          <input
            v-model="modelValue.quickQuestions[i]"
            type="text"
            class="settingsStretchInput quickQInput"
            autocomplete="off"
            spellcheck="false"
            placeholder="提问内容…"
          />
          <div class="quickQRowActions">
            <button
              type="button"
              class="btn iconOnly quickQReorder"
              title="上移"
              :disabled="!canMoveQuickQuestionUp(i)"
              @click="moveQuickQuestionUp(i)"
            >
              <span class="iconSvg" v-html="icons.up" />
            </button>
            <button
              type="button"
              class="btn iconOnly quickQReorder"
              title="下移"
              :disabled="!canMoveQuickQuestionDown(i)"
              @click="moveQuickQuestionDown(i)"
            >
              <span class="iconSvg" v-html="icons.down" />
            </button>
            <button
              type="button"
              class="btn iconOnly quickQRemove"
              title="删除"
              :disabled="modelValue.quickQuestions.length <= 1"
              @click="removeQuickQuestion(i)"
            >
              <span class="iconSvg" v-html="icons.remove" />
            </button>
          </div>
        </div>
        <button type="button" class="btn quickQAdd" @click="addQuickQuestion">
          <span class="iconSvg" v-html="icons.add" />
          添加一项
        </button>
      </section>
    </template>
  </div>
</template>

<style scoped>
.settingsBody {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.aiSection {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 16px;
  background-color: var(--bg);
  border-radius: 8px;
}

.aiSection--compact {
  gap: 12px;
}

.aiMasterToggleRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-width: 0;
}

.aiMasterToggleLabel {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
}

.aiMasterHint {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--muted);
}

.aiSectionTitle {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--fg);
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
  white-space: nowrap;
  flex: 1 1 60%;
}

.settingsLabel.short {
  flex: 1 1 30%;
  min-width: 30%;
}

.aiDataCacheActions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex: 1 1 65%;
  min-width: 0;
}


.aiChatProviderSelect {
  flex: 1 1 65%;
  min-width: 0;
  max-width: 100%;
}

.aiRowStretchInput {
  flex: 1 1 65%;
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
}

.aiRowField {
  flex: 1 1 65%;
  min-width: 0;
  max-width: 100%;
}

.aiPasswordRow {
  width: 100%;
}

.aiChatModelRow {
  flex: 1 1 65%;
  min-width: 0;
  max-width: 100%;
}

.aiChatModelToolbar {
  flex-wrap: wrap;
  justify-content: flex-end;
  width: 100%;
}

.aiChatModelSelect {
  flex: 1 1 160px;
  min-width: 0;
}

.aiDataCachePicker {
  flex: 1;
  min-width: 0;
  max-width: 100%;
}

.settingsStretchInput,
.settingsStretchTextarea {
  width: 100%;
  box-sizing: border-box;
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

.aiMasterHint code {
  font-size: 11px;
  padding: 2px 4px;
  border-radius: 4px;
  background: var(--panel-elevated, rgba(127, 127, 127, 0.12));
}

.aiTokenPriceTitle {
  margin-top: 4px;
}

.aiTokenPriceHint {
  margin: 0;
}

.aiTokenPriceInput {
  flex: 1 1 65%;
  min-width: 0;
  max-width: 160px;
}

.settingsHint {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--muted);
}

.quickQSection {
  gap: 5px;
}

.quickQSection .aiSectionTitle {
  margin-bottom: 15px;
}

.iconOnly {
  padding: 6px;
  flex-shrink: 0;
}

.iconSvg :deep(svg) {
  width: 16px;
  height: 16px;
  display: block;

  path {
    fill: currentColor;
  }
}

.aiModelToolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.aiModelSelect {
  flex: 1 1 160px;
  min-width: 0;
}

.temperatureSlider {
  width: 150px;
}

.numCompact {
  width: 120px;
}

.quickQRow {
  display: flex;
  align-items: stretch;
  gap: 8px;
  min-width: 0;
}

.quickQInput {
  flex: 1;
  min-width: 0;
}

.quickQRowActions {
  display: flex;
  align-items: stretch;
  gap: 4px;
  flex-shrink: 0;
}

.quickQReorder,
.quickQRemove {
  flex-shrink: 0;
}

.quickQRemove:hover:not(:disabled) {
  color: var(--danger);
  border-color: var(--danger);
}

.quickQAdd {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 10px;
}

.quickQAdd .iconSvg :deep(svg) {
  width: 16px;
  height: 16px;
}
</style>
