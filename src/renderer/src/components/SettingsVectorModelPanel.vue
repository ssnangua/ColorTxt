<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { AIConfig } from "@shared/aiTypes";
import {
  BUILTIN_EMBEDDING_MODELS,
  BUILTIN_EMBEDDING_SUPPORTS_RAG_TOP_K,
  DEFAULT_BUILTIN_EMBEDDING_MODEL_ID,
  OFFICIAL_HF_REMOTE_HOST,
  getBuiltinEmbeddingModel,
} from "@shared/builtinEmbeddingModels";
import { buildBuiltinEmbeddingIpcPayload } from "@shared/builtinEmbeddingIpc";
import {
  CHAT_API_PROVIDER_CUSTOM_ID,
  CHAT_API_PROVIDER_PRESETS,
  DEFAULT_EMBEDDING_REMOTE_BASE_URL,
  findChatProviderPresetByBaseUrl,
  isChatApiProviderCustomId,
  resolveChatProviderPresetIdFromBaseUrl,
} from "@shared/apiEndpointPresets";
import AppCustomSelect, { type CustomSelectItem } from "./AppCustomSelect.vue";
import ApiEndpointInput from "./ApiEndpointInput.vue";
import AppConnectionTestButton from "./AppConnectionTestButton.vue";
import type { ConnectionTestResult } from "../composables/useConnectionTest";
import AppPullFlashButton, {
  type AppPullFlashDone,
} from "./AppPullFlashButton.vue";
import NumericInput from "./NumericInput.vue";
import PathPickerInput from "./PathPickerInput.vue";
import SwitchToggle from "./SwitchToggle.vue";
import { icons } from "../icons";
import { appAlert } from "../services/appDialog";
import { resolveDefaultBuiltinModelCacheDirSync } from "../utils/defaultCacheDirs";
import { useSecretStorageHint } from "../composables/useSecretStorageHint";

const modelValue = defineModel<AIConfig>({ required: true });

const { secretStorageHint } = useSecretStorageHint();

/** 留空时实际使用的绝对路径，用作输入框 placeholder */
const builtinModelCacheDirPlaceholder = computed(() => {
  const p = resolveDefaultBuiltinModelCacheDirSync().trim();
  return p || "";
});

const selectListsEmpty: CustomSelectItem[] = [];

const isBuiltin = computed(
  () => modelValue.value.embedding.provider === "builtin",
);

/** 用户显式选中「自定义」且尚未填写地址时，仍保持下拉显示 */
const embedProviderExplicitId = ref("");

const embedProviderSelectItems = computed((): CustomSelectItem[] =>
  CHAT_API_PROVIDER_PRESETS.map((p) => ({
    kind: "item",
    id: p.id,
    label: p.label,
    description: p.listDescription?.trim() || p.baseUrl,
  })),
);

const embedProviderPresetId = computed(() => {
  if (embedProviderExplicitId.value) return embedProviderExplicitId.value;
  return resolveChatProviderPresetIdFromBaseUrl(
    modelValue.value.embedding.baseUrl,
  );
});

const embedProviderDisplayLabel = computed(() => {
  const id = embedProviderPresetId.value;
  if (!id) return "";
  return CHAT_API_PROVIDER_PRESETS.find((p) => p.id === id)?.label ?? "";
});

function onEmbedProviderPresetSelect(id: string) {
  embedProviderExplicitId.value = id;
  if (isChatApiProviderCustomId(id)) {
    modelValue.value.embedding.baseUrl = "";
    return;
  }
  const hit = CHAT_API_PROVIDER_PRESETS.find((p) => p.id === id && !p.custom);
  if (hit?.baseUrl.trim()) modelValue.value.embedding.baseUrl = hit.baseUrl;
}

watch(
  () => modelValue.value.embedding.baseUrl,
  (url) => {
    if (isBuiltin.value) return;
    const hit = findChatProviderPresetByBaseUrl(url);
    if (hit) {
      embedProviderExplicitId.value = hit.id;
      return;
    }
    if (url.trim()) {
      embedProviderExplicitId.value = CHAT_API_PROVIDER_CUSTOM_ID;
      return;
    }
    if (
      embedProviderExplicitId.value &&
      !isChatApiProviderCustomId(embedProviderExplicitId.value)
    ) {
      embedProviderExplicitId.value = CHAT_API_PROVIDER_CUSTOM_ID;
      return;
    }
    if (embedProviderExplicitId.value !== CHAT_API_PROVIDER_CUSTOM_ID) {
      embedProviderExplicitId.value = "";
    }
  },
  { immediate: true },
);

function buildRemoteEmbeddingIpcDraft() {
  const e = modelValue.value.embedding;
  return {
    provider: "remote" as const,
    baseUrl: e.baseUrl,
    apiKey: e.apiKey,
  };
}

const showEmbedKey = ref(false);
const embedModelsLoading = ref(false);
const embedPullBtnRef = ref<InstanceType<typeof AppPullFlashButton> | null>(
  null,
);
const embedModelOptions = ref<string[]>([]);
type EmbedProbeFlashPhase = "idle" | "loading" | "success" | "fail";
const embedProbeFlashPhase = ref<EmbedProbeFlashPhase>("idle");
let embedProbeFlashTimer: ReturnType<typeof setTimeout> | null = null;
/** 递增序号：仅最新一次探测可更新维度与按钮状态（避免切换模型后旧请求误报成功） */
let embedProbeSeq = 0;

function embedProbeTargetModel(): string {
  const e = modelValue.value.embedding;
  return isBuiltin.value ? e.builtinModel.trim() : e.remoteModel.trim();
}

function isEmbedProbeStale(seq: number, targetModel: string): boolean {
  return seq !== embedProbeSeq || embedProbeTargetModel() !== targetModel;
}

const embeddingProviderOptions: {
  id: "builtin" | "remote";
  label: string;
  description: string;
}[] = [
  {
    id: "builtin",
    label: "内置本地模型",
    description: "下载模型到本地运行，无需 API",
  },
  {
    id: "remote",
    label: "远程 API",
    description: "使用外部嵌入 API 服务",
  },
];

const providerSelectItems = computed((): CustomSelectItem[] =>
  embeddingProviderOptions.map((o) => ({
    kind: "item",
    id: o.id,
    label: o.label,
    description: o.description,
  })),
);

const providerDisplayLabel = computed(() => {
  const hit = embeddingProviderOptions.find(
    (o) => o.id === modelValue.value.embedding.provider,
  );
  return hit?.label ?? modelValue.value.embedding.provider;
});

const builtinModelScrollItems = computed((): CustomSelectItem[] =>
  BUILTIN_EMBEDDING_MODELS.map((m) => ({
    kind: "item",
    id: m.id,
    label: m.uiListLabel,
    description: m.uiListDescription,
  })),
);

const showRagTopKSetting = computed(
  () => !isBuiltin.value || BUILTIN_EMBEDDING_SUPPORTS_RAG_TOP_K,
);

const embedEndpointFingerprint = computed(() => {
  const e = modelValue.value.embedding;
  if (e.provider === "builtin") {
    return `${e.provider}\0${e.builtinModel.trim()}\0${e.dimension}\0${e.builtinModelCacheDir}\0${e.hfRemoteHost}`;
  }
  return `${e.provider}\0${e.baseUrl.trim()}\0${e.apiKey}\0${e.remoteModel.trim()}\0${e.dimension}`;
});

const embedModelDisplayLabel = computed(() => {
  const id = modelValue.value.embedding.builtinModel.trim();
  const m = getBuiltinEmbeddingModel(id);
  return m ? m.uiListLabel : id;
});

const embedProbeIconHtml = computed(() => {
  switch (embedProbeFlashPhase.value) {
    case "success":
      return icons.success;
    case "fail":
      return icons.fail;
    default:
      return icons.refresh;
  }
});

const builtinDownloadProgress = ref(0);
const builtinDownloadBusy = ref(false);
const builtinCurrentModelCached = ref(false);
let offLoadProgress: (() => void) | null = null;

async function refreshBuiltinDownloadStatus() {
  const modelId = modelValue.value.embedding.builtinModel.trim();
  if (!modelId) {
    builtinCurrentModelCached.value = false;
    return;
  }
  try {
    const r = await window.colorTxt.ai.embeddingBuiltinIsCached(
      buildBuiltinEmbeddingIpcPayload(modelId, modelValue.value),
    );
    builtinCurrentModelCached.value = r.ok && r.cached;
  } catch {
    builtinCurrentModelCached.value = false;
  }
}

async function refreshBuiltinPanelState() {
  await refreshBuiltinDownloadStatus();
}

watch(
  () => modelValue.value.embedding.provider,
  (p, prev) => {
    if (p === "builtin") {
      if (!modelValue.value.embedding.builtinModel.trim()) {
        modelValue.value.embedding.builtinModel = DEFAULT_BUILTIN_EMBEDDING_MODEL_ID;
      }
      const m = getBuiltinEmbeddingModel(modelValue.value.embedding.builtinModel);
      if (m) modelValue.value.embedding.dimension = m.dimension;
      void refreshBuiltinPanelState();
      return;
    }
    if (p === "remote" && prev === "builtin") {
      if (!modelValue.value.embedding.baseUrl.trim()) {
        modelValue.value.embedding.baseUrl = DEFAULT_EMBEDDING_REMOTE_BASE_URL;
        embedProviderExplicitId.value = "local-lmstudio";
      }
    }
  },
);

watch(
  () => modelValue.value.embedding.builtinModel,
  (id) => {
    if (!isBuiltin.value) return;
    const m = getBuiltinEmbeddingModel(id);
    if (m) modelValue.value.embedding.dimension = m.dimension;
    void refreshBuiltinDownloadStatus();
  },
);

watch(
  () => modelValue.value.embedding.builtinModelCacheDir,
  () => {
    if (!isBuiltin.value) return;
    void refreshBuiltinDownloadStatus();
  },
);

onMounted(() => {
  offLoadProgress = window.colorTxt.ai.onEmbeddingLoadProgress((p) => {
    if (p.modelId === modelValue.value.embedding.builtinModel.trim()) {
      builtinDownloadProgress.value = p.progress;
    }
  });
  void refreshBuiltinPanelState();
});

onBeforeUnmount(() => {
  offLoadProgress?.();
  offLoadProgress = null;
  if (embedProbeFlashTimer != null) {
    clearTimeout(embedProbeFlashTimer);
    embedProbeFlashTimer = null;
  }
});

async function refreshEmbedModels(opts?: { pullDone?: AppPullFlashDone }) {
  const pullDone = opts?.pullDone;
  embedModelsLoading.value = true;
  let ok = false;
  try {
    if (isBuiltin.value) {
      embedModelOptions.value = BUILTIN_EMBEDDING_MODELS.map((m) => m.id);
      if (!modelValue.value.embedding.builtinModel.trim()) {
        modelValue.value.embedding.builtinModel = DEFAULT_BUILTIN_EMBEDDING_MODEL_ID;
      }
      ok = true;
    } else {
      const r = await window.colorTxt.ai.modelsList({
        ...buildRemoteEmbeddingIpcDraft(),
      });
      ok = r.ok;
      if (r.ok) {
        embedModelOptions.value = r.models;
        if (!modelValue.value.embedding.remoteModel.trim() && r.models.length > 0) {
          modelValue.value.embedding.remoteModel = r.models[0];
        }
      } else embedModelOptions.value = [];
    }
  } finally {
    embedModelsLoading.value = false;
    if (pullDone) pullDone(ok);
    else embedPullBtnRef.value?.clearStaleFailOnSilentSuccess(ok);
  }
}

/** 远程嵌入：聚焦模型输入且尚无建议列表时静默拉取（与原先下拉展开行为一致） */
function onRemoteEmbedModelFocusIn() {
  if (isBuiltin.value || embedModelsLoading.value) return;
  if (embedModelOptions.value.length > 0) return;
  void refreshEmbedModels();
}

async function probeEmbedDimension(opts?: { auto?: boolean }) {
  const auto = opts?.auto ?? false;
  const seq = ++embedProbeSeq;
  const targetModel = embedProbeTargetModel();
  const e = modelValue.value.embedding;

  if (!targetModel) {
    if (!auto) await appAlert("请先选择模型");
    return;
  }
  if (!isBuiltin.value && !e.baseUrl.trim()) {
    if (!auto) await appAlert("请先填写接口地址");
    return;
  }
  if (embedProbeFlashTimer != null) {
    clearTimeout(embedProbeFlashTimer);
    embedProbeFlashTimer = null;
  }
  embedProbeFlashPhase.value = "loading";
  let ok = false;
  try {
    const r = await window.colorTxt.ai.embeddingProbeDimension(
      isBuiltin.value
        ? {
            provider: e.provider,
            builtinModel: e.builtinModel,
            remoteModel: e.remoteModel,
          }
        : {
            ...buildRemoteEmbeddingIpcDraft(),
            provider: e.provider,
            builtinModel: e.builtinModel,
            remoteModel: e.remoteModel,
          },
    );
    if (isEmbedProbeStale(seq, targetModel)) return;
    if (!r.ok) {
      if (!auto) await appAlert(r.error);
    } else {
      modelValue.value.embedding.dimension = r.dimension;
      ok = true;
    }
  } catch (err) {
    if (isEmbedProbeStale(seq, targetModel)) return;
    if (!auto) {
      await appAlert(err instanceof Error ? err.message : String(err));
    }
  } finally {
    if (isEmbedProbeStale(seq, targetModel)) return;
    if (ok) {
      embedProbeFlashPhase.value = "success";
      embedProbeFlashTimer = setTimeout(() => {
        if (!isEmbedProbeStale(seq, targetModel)) {
          embedProbeFlashPhase.value = "idle";
        }
        embedProbeFlashTimer = null;
      }, 1000);
    } else {
      embedProbeFlashPhase.value = "fail";
    }
  }
}

watch(
  () => modelValue.value.embedding.remoteModel,
  (model, prev) => {
    if (isBuiltin.value) return;
    if (prev === undefined) return;
    if (model === prev) return;
    embedProbeSeq++;
    if (embedProbeFlashTimer != null) {
      clearTimeout(embedProbeFlashTimer);
      embedProbeFlashTimer = null;
    }
    embedProbeFlashPhase.value = "idle";
    if (!model.trim()) return;
    void probeEmbedDimension({ auto: true });
  },
);

async function downloadBuiltinModel() {
  if (builtinDownloadBusy.value) return;
  const modelId = modelValue.value.embedding.builtinModel.trim();
  if (!modelId) {
    await appAlert("请先选择内置模型");
    return;
  }
  builtinDownloadBusy.value = true;
  builtinDownloadProgress.value = 0;
  try {
    const r = await window.colorTxt.ai.embeddingBuiltinLoad(
      buildBuiltinEmbeddingIpcPayload(modelId, modelValue.value),
    );
    if (!r.ok) {
      await appAlert(r.error);
    } else {
      await refreshBuiltinDownloadStatus();
    }
  } catch (e) {
    await appAlert(e instanceof Error ? e.message : String(e));
  } finally {
    builtinDownloadBusy.value = false;
  }
}

async function clearBuiltinCache() {
  const modelId = modelValue.value.embedding.builtinModel.trim();
  if (!modelId) return;
  const r = await window.colorTxt.showMessageBox({
    type: "warning",
    title: "清除模型",
    buttons: ["取消", "清除"],
    defaultId: 1,
    cancelId: 0,
    message: "将删除该模型的下载缓存，是否继续？",
    noLink: true,
  });
  if (r.response !== 1) return;
  const res = await window.colorTxt.ai.embeddingBuiltinClearCache(
    buildBuiltinEmbeddingIpcPayload(modelId, modelValue.value),
  );
  if (!res.ok) await appAlert(res.error);
  else await refreshBuiltinDownloadStatus();
}

async function runEmbedConnectionTest(): Promise<ConnectionTestResult> {
  const payload: Record<string, unknown> = {
    provider: modelValue.value.embedding.provider,
    remoteModel: modelValue.value.embedding.remoteModel,
    builtinModel: modelValue.value.embedding.builtinModel,
    dimension: modelValue.value.embedding.dimension,
  };
  if (isBuiltin.value) {
    payload.config = modelValue.value;
  } else {
    Object.assign(payload, buildRemoteEmbeddingIpcDraft());
  }
  const r = await window.colorTxt.ai.testEmbedding(payload);
  if (r.ok) return { ok: true };
  return { ok: false, error: r.error };
}

</script>

<template>
<div class="settingsBody">
    <section class="aiSection aiSection--compact">
      <div class="aiMasterToggleRow">
        <span class="settingsLabel aiMasterToggleLabel">启用向量模型</span>
        <SwitchToggle
          v-model="modelValue.embeddingEnabled"
          aria-label="启用向量模型"
        />
      </div>
      <p class="aiMasterHint">
        启用后，可建立书籍语义索引，供「AI 阅读助手」与「角色卡」检索与引用。
      </p>
    </section>
    <template v-if="modelValue.embeddingEnabled">
      <section class="aiSection">
        <h3 class="aiSectionTitle">嵌入模型（RAG）</h3>
        <div class="settingsRow">
          <div class="settingsRowMain settingsRowMain--baseline">
            <span class="settingsLabel short">模型来源</span>
            <AppCustomSelect
              class="vecProviderSelect"
              :model-value="modelValue.embedding.provider"
              :display-label="providerDisplayLabel"
              placeholder="选择模型来源…"
              :fixed-top-items="selectListsEmpty"
              :scroll-items="providerSelectItems"
              :fixed-bottom-items="selectListsEmpty"
              :scroll-max-height="280"
              ariaLabel="模型来源"
              @update:model-value="
                modelValue.embedding.provider = $event as 'remote' | 'builtin'
              "
            />
          </div>
        </div>

        <template v-if="isBuiltin">
          <div class="settingsRow">
            <div class="settingsRowMain settingsRowMain--baseline">
              <span class="settingsLabel short">模型缓存目录</span>
              <div class="vecModelCacheActions">
                <PathPickerInput
                  v-model="modelValue.embedding.builtinModelCacheDir"
                  is-directory
                  :placeholder="builtinModelCacheDirPlaceholder"
                  aria-label="模型缓存目录"
                  class="vecModelCachePicker"
                />
              </div>
            </div>
          </div>
          <div class="settingsRow">
            <div class="settingsRowMain settingsRowMain--baseline">
              <span class="settingsLabel short">HF 镜像地址</span>
              <input
                v-model="modelValue.embedding.hfRemoteHost"
                type="text"
                autocomplete="off"
                :placeholder="OFFICIAL_HF_REMOTE_HOST"
                class="vecRowStretchInput"
              />
            </div>
          </div>
          <div class="settingsRow">
            <div class="settingsRowMain settingsRowMain--baseline">
              <span class="settingsLabel short">内置模型</span>
              <div class="vecBuiltinModelRow">
                <AppCustomSelect
                  class="vecBuiltinModelSelect"
                  :model-value="modelValue.embedding.builtinModel"
                  :display-label="embedModelDisplayLabel"
                  placeholder="选择内置模型…"
                  :fixed-top-items="selectListsEmpty"
                  :scroll-items="builtinModelScrollItems"
                  :fixed-bottom-items="selectListsEmpty"
                  :scroll-max-height="280"
                  ariaLabel="内置嵌入模型"
                  @update:model-value="modelValue.embedding.builtinModel = $event"
                />
                <div class="vecBuiltinModelActions">
                  <button
                    v-if="!builtinCurrentModelCached"
                    type="button"
                    class="btn primary"
                    :disabled="builtinDownloadBusy"
                    @click="downloadBuiltinModel"
                  >
                    <span
                      class="iconSvg"
                      :class="{ 'iconSvg--spinning': builtinDownloadBusy }"
                      v-html="
                        builtinDownloadBusy ? icons.refresh : icons.download
                      "
                    />
                    {{
                      builtinDownloadBusy
                        ? `下载中 ${builtinDownloadProgress}%`
                        : "下载"
                    }}
                  </button>
                  <button
                    v-else
                    type="button"
                    class="btn danger"
                    :disabled="builtinDownloadBusy"
                    @click="clearBuiltinCache"
                  >
                    <span class="iconSvg" v-html="icons.remove" />
                    清除
                  </button>
                </div>
              </div>
            </div>
          </div>
        </template>

        <template v-else>
          <div class="settingsRow">
            <div class="settingsRowMain settingsRowMain--baseline">
              <span class="settingsLabel short">服务商</span>
              <AppCustomSelect
                class="vecEmbedProviderSelect"
                :model-value="embedProviderPresetId"
                :display-label="embedProviderDisplayLabel"
                placeholder="选择服务商…"
                :fixed-top-items="selectListsEmpty"
                :scroll-items="embedProviderSelectItems"
                :fixed-bottom-items="selectListsEmpty"
                :scroll-max-height="320"
                ariaLabel="向量模型服务商"
                @update:model-value="onEmbedProviderPresetSelect"
              />
            </div>
          </div>
          <div class="settingsRow">
            <div class="settingsRowMain settingsRowMain--baseline">
              <span class="settingsLabel short">接口地址</span>
              <ApiEndpointInput
                v-model="modelValue.embedding.baseUrl"
                :suggestions="[]"
                input-class="vecRowStretchInput"
                aria-label="向量模型接口地址"
              />
            </div>
          </div>
          <div class="settingsRow">
            <div class="settingsRowMain settingsRowMain--baseline">
              <span class="settingsLabel short">API 密钥</span>
              <div class="vecRowField">
                <div class="settingsPasswordRow vecPasswordRow">
                  <input
                    v-model="modelValue.embedding.apiKey"
                    class="settingsStretchInput settingsPasswordRow__input"
                    :type="showEmbedKey ? 'text' : 'password'"
                    autocomplete="off"
                    spellcheck="false"
                  />
                  <button
                    type="button"
                    class="btn iconOnly"
                    :title="showEmbedKey ? '隐藏' : '显示'"
                    @click="showEmbedKey = !showEmbedKey"
                  >
                    <span
                      class="iconSvg"
                      v-html="showEmbedKey ? icons.view : icons.viewOff"
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
              <div class="vecRemoteModelRow">
                <div
                  class="aiModelToolbar vecRemoteModelToolbar"
                  @focusin="onRemoteEmbedModelFocusIn"
                >
                  <ApiEndpointInput
                    v-model="modelValue.embedding.remoteModel"
                    :suggestions="embedModelOptions"
                    placeholder="输入模型 ID…"
                    input-class="vecRowStretchInput vecRemoteModelInput"
                    aria-label="嵌入模型"
                    :scroll-max-height="260"
                  />
                  <AppPullFlashButton
                    ref="embedPullBtnRef"
                    label="拉取模型"
                    :busy="embedModelsLoading"
                    @pull="(done) => void refreshEmbedModels({ pullDone: done })"
                  />
                  <AppConnectionTestButton
                    :fingerprint="embedEndpointFingerprint"
                    :on-test="runEmbedConnectionTest"
                  />
                </div>
              </div>
            </div>
            <p class="aiMasterHint">
              建议使用 <code>BGE Small ZH v1.5</code
              ><code>Multilingual E5 Small</code> 等支持 <b>中文</b> 的嵌入模型。
            </p>
            <p class="aiMasterHint">
              向量模型通常带有 <code>embedding</code><code>embed</code><code>bge</code> 等关键词；<br />如果向量模型没有出现在模型列表里，可能是服务商暂时还不支持嵌入模型，或者需要手动输入 <code>模型 ID</code>。
            </p>
          </div>
        </template>

        <div v-if="!isBuiltin" class="settingsRow">
          <div class="settingsRowMain settingsRowMain--baseline">
            <span class="settingsLabel"
              >向量维度（{{ modelValue.embedding.dimension }}）</span
            >
            <div class="embedDimRow">
              <NumericInput
                v-model="modelValue.embedding.dimension"
                :min="64"
                :max="8192"
                integer
                class="numCompact"
              />
              <button
                type="button"
                class="btn"
                :class="{
                  success: embedProbeFlashPhase === 'success',
                  danger: embedProbeFlashPhase === 'fail',
                }"
                :disabled="embedProbeFlashPhase === 'loading'"
                title="向服务端请求一次最短嵌入，按返回向量长度填入"
                @click="probeEmbedDimension()"
              >
                <span
                  class="iconSvg"
                  :class="{
                    'iconSvg--spinning': embedProbeFlashPhase === 'loading',
                  }"
                  v-html="embedProbeIconHtml"
                />
                自动检测
              </button>
            </div>
          </div>
          <p class="settingsHint">
            多数 OpenAI 兼容接口会返回完整向量，可通过「自动检测」填入维度。<br />修改「向量维度」将清空已建索引。
          </p>
        </div>

        <div v-if="showRagTopKSetting" class="settingsRow">
          <div class="settingsRowMain settingsRowMain--baseline">
            <span class="settingsLabel"
              >检索原文条数（{{ modelValue.ragTopK }}）</span
            >
            <NumericInput
              v-model="modelValue.ragTopK"
              :min="1"
              :max="20"
              integer
              class="numCompact"
            />
          </div>
          <p class="settingsHint">
            检索原文时，从全书语义索引中取回的相关性最高的片段数量。<br />数值越大，参考内容越多，但回答也可能越慢；一般
            3～8 条即可。
          </p>
        </div>
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

.aiMasterHint code,
.settingsHint code {
  font-size: 11px;
  padding: 2px 4px;
  border-radius: 4px;
  background: var(--panel-elevated, rgba(127, 127, 127, 0.12));
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

.vecModelCacheActions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex: 1 1 65%;
  min-width: 0;
}

.vecModelCachePicker {
  flex: 1;
  min-width: 0;
  max-width: 100%;
}

.vecProviderSelect {
  flex: 1 1 65%;
  min-width: 0;
  max-width: 100%;
}

.vecEmbedProviderSelect {
  flex: 1 1 65%;
  min-width: 0;
  max-width: 100%;
}


.vecRowField {
  flex: 1 1 65%;
  min-width: 0;
  max-width: 100%;
}

.vecPasswordRow {
  width: 100%;
}

.vecRemoteModelRow {
  flex: 1 1 65%;
  min-width: 0;
  max-width: 100%;
}

.vecRemoteModelToolbar {
  flex-wrap: nowrap;
  align-items: center;
  justify-content: flex-end;
  width: 100%;
  min-width: 0;
}

.vecRemoteModelToolbar :deep(.apiEndpointInput) {
  flex: 1 1 0;
  min-width: 0;
  max-width: 100%;
}

.vecRemoteModelToolbar > .btn {
  flex-shrink: 0;
}

.vecRemoteModelInput {
  width: 100%;
  box-sizing: border-box;
}

.vecRowStretchInput {
  flex: 1 1 65%;
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
}

.vecBuiltinModelRow {
  display: flex;
  flex: 1 1 65%;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.vecBuiltinModelSelect {
  flex: 1;
  min-width: 0;
}

.vecBuiltinModelActions {
  display: flex;
  flex-shrink: 0;
  justify-content: flex-end;
}

.settingsHint {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--muted);
}

.settingsStretchInput {
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

.iconSvg.iconSvg--spinning :deep(svg) {
  animation: vecSettingsIconSpin 0.65s linear infinite;
}

@keyframes vecSettingsIconSpin {
  to {
    transform: rotate(360deg);
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

.aiModelSelect--full {
  flex: 1 1 100%;
}

.numCompact {
  width: 120px;
}

.embedDimRow {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
</style>
