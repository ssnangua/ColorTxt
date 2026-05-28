<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { AIConfig } from "@shared/aiTypes";
import {
  TXT2IMG_BACKEND_PRESETS,
  findTxt2ImgBackendPreset,
} from "@shared/apiEndpointPresets";
import {
  TXT2IMG_DEFAULT_CLOUD_MODEL,
  isTxt2ImgCloudBackend,
  txt2ImgRequiresApiKey,
} from "@shared/txt2ImgBackend";
import {
  applyTxt2ImgSizeForBackendSwitch,
  findClosestTxt2ImgCloudSizePreset,
  formatTxt2ImgSizeLabel,
  getTxt2ImgCloudSizePresets,
  parseTxt2ImgCloudSizePresetId,
  resolveTxt2ImgCloudSizePresetId,
  txt2ImgSupportsCustomSize,
} from "@shared/txt2ImgCloudSizePresets";
import { getTxt2ImgCloudModelSuggestions } from "@shared/txt2ImgCloudModelPresets";
import {
  TXT2IMG_OPENAI_QUALITY_OPTIONS,
  normalizeTxt2ImgCloudQuality,
  txt2ImgOpenAiQualityLabel,
} from "@shared/txt2ImgOpenAiQuality";
import { useSecretStorageHint } from "../composables/useSecretStorageHint";
import ApiEndpointInput from "./ApiEndpointInput.vue";
import AppConnectionTestButton from "./AppConnectionTestButton.vue";
import AppCustomSelect, { type CustomSelectItem } from "./AppCustomSelect.vue";
import type { ConnectionTestResult } from "../composables/useConnectionTest";
import AppPullFlashButton, {
  type AppPullFlashDone,
} from "./AppPullFlashButton.vue";
import NumericInput from "./NumericInput.vue";
import PathPickerInput from "./PathPickerInput.vue";
import SwitchToggle from "./SwitchToggle.vue";
import { icons } from "../icons";
import { appAlert } from "../services/appDialog";
import { resolveDefaultCharacterPortraitCacheDirSync } from "../utils/defaultCacheDirs";

const modelValue = defineModel<AIConfig>({ required: true });
const characterPortraitCacheDir = defineModel<string>(
  "characterPortraitCacheDir",
  { required: true },
);

const { secretStorageHint } = useSecretStorageHint();
const showTxt2ImgKey = ref(false);

const txt2imgConnectionFingerprint = computed(() => {
  const t = modelValue.value.txt2img;
  return `${t.backend}\0${t.apiBaseUrl.trim()}\0${t.apiKey}`;
});

const txt2imgBackend = computed(() => modelValue.value.txt2img.backend);
const txt2imgIsLocalWebUi = computed(
  () =>
    txt2imgBackend.value === "a1111" || txt2imgBackend.value === "comfyui",
);

const txt2imgUsesCloudSizeSelect = computed(
  () => !txt2ImgSupportsCustomSize(txt2imgBackend.value),
);

const txt2imgCloudSizeSelectItems = computed((): CustomSelectItem[] =>
  getTxt2ImgCloudSizePresets(txt2imgBackend.value).map((p) => ({
    kind: "item",
    id: `${p.width}x${p.height}`,
    label: formatTxt2ImgSizeLabel(p.width, p.height),
  })),
);

const txt2imgCloudSizeSelectValue = computed(() =>
  resolveTxt2ImgCloudSizePresetId(
    txt2imgBackend.value,
    modelValue.value.txt2img.width,
    modelValue.value.txt2img.height,
  ),
);

const txt2imgCloudSizeDisplayLabel = computed(() => {
  const parsed = parseTxt2ImgCloudSizePresetId(txt2imgCloudSizeSelectValue.value);
  if (!parsed) return "";
  return formatTxt2ImgSizeLabel(parsed.width, parsed.height);
});

function onTxt2ImgCloudSizeSelect(id: string) {
  const parsed = parseTxt2ImgCloudSizePresetId(id);
  if (!parsed) return;
  modelValue.value.txt2img.width = parsed.width;
  modelValue.value.txt2img.height = parsed.height;
}

/** 云端：载入或切换后把宽高对齐到当前服务商的固定尺寸档 */
watch(
  () => txt2imgBackend.value,
  (backend) => {
    if (txt2ImgSupportsCustomSize(backend)) return;
    const p = findClosestTxt2ImgCloudSizePreset(
      backend,
      modelValue.value.txt2img.width,
      modelValue.value.txt2img.height,
    );
    modelValue.value.txt2img.width = p.width;
    modelValue.value.txt2img.height = p.height;
  },
  { immediate: true },
);

const txt2imgNeedsApiKey = computed(() =>
  txt2ImgRequiresApiKey(txt2imgBackend.value),
);
const txt2imgShowOpenAiQuality = computed(
  () =>
    txt2imgBackend.value === "openai_images" ||
    txt2imgBackend.value === "openai_compat_images",
);

const cloudModelSuggestions = computed(() =>
  getTxt2ImgCloudModelSuggestions(txt2imgBackend.value),
);

const txt2imgQualitySelectItems = computed((): CustomSelectItem[] =>
  TXT2IMG_OPENAI_QUALITY_OPTIONS.map((o) => ({
    kind: "item",
    id: o.id,
    label: o.label,
  })),
);

const txt2imgQualityDisplayLabel = computed(() =>
  txt2ImgOpenAiQualityLabel(modelValue.value.txt2img.cloudQuality),
);

function onTxt2ImgQualitySelect(id: string) {
  modelValue.value.txt2img.cloudQuality = normalizeTxt2ImgCloudQuality(id);
}

const txt2imgBackendSelectEmpty: CustomSelectItem[] = [];
const selectListsEmpty: CustomSelectItem[] = [];

const SAMPLER_DEFAULT_ID = "__txt2img_sampler_default__";
const HIRES_UPSCALER_DEFAULT_ID = "__txt2img_hires_upscaler_default__";
/** 与主进程 `aiTxt2Img` 中 `hiresUpscaler.trim() || "…"` 一致 */
const HIRES_UPSCALER_FALLBACK_NAME = "Latent";
const SD_CHECKPOINT_DEFAULT_ID = "__txt2img_sd_checkpoint_default__";

const txt2imgBackendSelectItems = computed((): CustomSelectItem[] =>
  TXT2IMG_BACKEND_PRESETS.map((p) => ({
    kind: "item",
    id: p.id,
    label: p.label,
    description: p.listDescription?.trim() || p.baseUrl,
  })),
);

const txt2imgBackendDisplayLabel = computed(() => {
  const id = modelValue.value.txt2img.backend;
  return findTxt2ImgBackendPreset(id)?.label ?? "";
});

/** 留空时实际使用的绝对路径，用作输入框 placeholder */
const portraitCacheDirPlaceholder = computed(() => {
  const p = resolveDefaultCharacterPortraitCacheDirSync().trim();
  return p || "";
});

const samplerOptions = ref<string[]>([]);
const samplersLoading = ref(false);
const samplerPullBtnRef = ref<InstanceType<typeof AppPullFlashButton> | null>(
  null,
);

const upscalerOptions = ref<string[]>([]);
const upscalersLoading = ref(false);
const hiresUpscalerPullBtnRef = ref<InstanceType<
  typeof AppPullFlashButton
> | null>(null);

const sdModelOptions = ref<string[]>([]);
const sdModelsLoading = ref(false);
const sdModelPullBtnRef = ref<InstanceType<typeof AppPullFlashButton> | null>(
  null,
);

const samplerScrollItems = computed((): CustomSelectItem[] => {
  const head: CustomSelectItem = {
    kind: "item",
    id: SAMPLER_DEFAULT_ID,
    label: "使用默认采样器",
  };
  const fromApi = samplerOptions.value.map((name) => ({
    kind: "item" as const,
    id: name,
    label: name,
  }));
  return [head, ...fromApi];
});

const samplerSelectModelId = computed(() => {
  const s = modelValue.value.txt2img.samplerName.trim();
  return s || SAMPLER_DEFAULT_ID;
});

const samplerDisplayLabel = computed(() => {
  const s = modelValue.value.txt2img.samplerName.trim();
  if (!s) return "使用默认采样器";
  return s;
});

async function refreshSamplers(opts?: { pullDone?: AppPullFlashDone }) {
  const pullDone = opts?.pullDone;
  if (modelValue.value.txt2img.backend !== "a1111") {
    pullDone?.("abort");
    return;
  }
  if (!modelValue.value.txt2img.apiBaseUrl.trim()) {
    if (pullDone) await appAlert("请先填写文生图接口地址");
    pullDone?.("abort");
    return;
  }
  samplersLoading.value = true;
  let ok = false;
  try {
    const invoke = window.colorTxt?.ai?.txt2imgInvoke;
    if (typeof invoke !== "function") {
      if (pullDone) await appAlert("preload 未就绪，请重启应用。");
      return;
    }
    const r = await invoke({
      op: "listA1111Samplers",
      apiBaseUrl: modelValue.value.txt2img.apiBaseUrl.trim(),
    });
    if (r.ok && r.op === "listA1111Samplers") {
      ok = true;
      samplerOptions.value = r.samplers;
    } else if (!r.ok) {
      samplerOptions.value = [];
      if (pullDone) await appAlert(r.error);
    } else {
      samplerOptions.value = [];
      if (pullDone) await appAlert("文生图接口返回异常");
    }
  } catch (e) {
    samplerOptions.value = [];
    if (pullDone) {
      await appAlert(e instanceof Error ? e.message : String(e));
    }
  } finally {
    samplersLoading.value = false;
    if (pullDone) pullDone(ok);
    else samplerPullBtnRef.value?.clearStaleFailOnSilentSuccess(ok);
  }
}

function onSamplerPanelOpenChange(isOpen: boolean) {
  if (!isOpen || samplersLoading.value) return;
  if (samplerOptions.value.length > 0) return;
  void refreshSamplers();
}

function onSamplerSelect(id: string) {
  if (id === SAMPLER_DEFAULT_ID) {
    modelValue.value.txt2img.samplerName = "";
  } else {
    modelValue.value.txt2img.samplerName = id;
  }
}

const sdCheckpointScrollItems = computed((): CustomSelectItem[] => {
  const normCkpt = (s: string) => s.trim();
  const head: CustomSelectItem = {
    kind: "item",
    id: SD_CHECKPOINT_DEFAULT_ID,
    label: "使用 WebUI 当前模型",
  };
  const seenNorm = new Set<string>();
  const fromApi: CustomSelectItem[] = [];
  for (const title of sdModelOptions.value) {
    const k = normCkpt(title);
    if (!k || seenNorm.has(k)) continue;
    seenNorm.add(k);
    fromApi.push({
      kind: "item" as const,
      id: title,
      label: title,
    });
  }
  const cur = normCkpt(modelValue.value.txt2img.sdCheckpointTitle);
  const inList =
    cur !== "" && sdModelOptions.value.some((t) => normCkpt(t) === cur);
  if (cur && !inList) {
    return [head, { kind: "item" as const, id: cur, label: cur }, ...fromApi];
  }
  return [head, ...fromApi];
});

const sdCheckpointSelectModelId = computed(() => {
  const s = modelValue.value.txt2img.sdCheckpointTitle.trim();
  return s || SD_CHECKPOINT_DEFAULT_ID;
});

const sdCheckpointDisplayLabel = computed(() => {
  const s = modelValue.value.txt2img.sdCheckpointTitle.trim();
  if (!s) return "使用 WebUI 当前模型";
  return s;
});

async function refreshSdModels(opts?: { pullDone?: AppPullFlashDone }) {
  const pullDone = opts?.pullDone;
  if (modelValue.value.txt2img.backend !== "a1111") {
    pullDone?.("abort");
    return;
  }
  if (!modelValue.value.txt2img.apiBaseUrl.trim()) {
    if (pullDone) await appAlert("请先填写文生图接口地址");
    pullDone?.("abort");
    return;
  }
  sdModelsLoading.value = true;
  let ok = false;
  try {
    const invoke = window.colorTxt?.ai?.txt2imgInvoke;
    if (typeof invoke !== "function") {
      if (pullDone) await appAlert("preload 未就绪，请重启应用。");
      return;
    }
    const r = await invoke({
      op: "listA1111SdModels",
      apiBaseUrl: modelValue.value.txt2img.apiBaseUrl.trim(),
    });
    if (r.ok && r.op === "listA1111SdModels") {
      ok = true;
      sdModelOptions.value = r.sdModels;
    } else if (!r.ok) {
      sdModelOptions.value = [];
      if (pullDone) await appAlert(r.error);
    } else {
      sdModelOptions.value = [];
      if (pullDone) await appAlert("文生图接口返回异常");
    }
  } catch (e) {
    sdModelOptions.value = [];
    if (pullDone) {
      await appAlert(e instanceof Error ? e.message : String(e));
    }
  } finally {
    sdModelsLoading.value = false;
    if (pullDone) pullDone(ok);
    else sdModelPullBtnRef.value?.clearStaleFailOnSilentSuccess(ok);
  }
}

function onSdCheckpointPanelOpenChange(isOpen: boolean) {
  if (!isOpen || sdModelsLoading.value) return;
  if (sdModelOptions.value.length > 0) return;
  void refreshSdModels();
}

function onSdCheckpointSelect(id: string) {
  if (id === SD_CHECKPOINT_DEFAULT_ID) {
    modelValue.value.txt2img.sdCheckpointTitle = "";
  } else {
    modelValue.value.txt2img.sdCheckpointTitle = id;
  }
}

const hiresUpscalerScrollItems = computed((): CustomSelectItem[] => {
  const fromApi = upscalerOptions.value.map((name) => ({
    kind: "item" as const,
    id: name,
    label: name,
  }));
  const listHasFallback = upscalerOptions.value.some(
    (n) => n.trim() === HIRES_UPSCALER_FALLBACK_NAME,
  );
  const raw = modelValue.value.txt2img.hiresUpscaler.trim();
  const isEffectiveDefault =
    !raw || raw.toLowerCase() === HIRES_UPSCALER_FALLBACK_NAME.toLowerCase();
  const curNonDefault = isEffectiveDefault ? "" : raw;
  const out: CustomSelectItem[] = [];

  if (!listHasFallback) {
    out.push({
      kind: "item",
      id: HIRES_UPSCALER_DEFAULT_ID,
      label: HIRES_UPSCALER_FALLBACK_NAME,
    });
  }

  if (
    curNonDefault &&
    !upscalerOptions.value.some((n) => n === curNonDefault)
  ) {
    out.push({
      kind: "item" as const,
      id: curNonDefault,
      label: curNonDefault,
    });
  }

  out.push(...fromApi);
  return out;
});

const hiresUpscalerSelectModelId = computed(() => {
  const raw = modelValue.value.txt2img.hiresUpscaler.trim();
  const isEffectiveDefault =
    !raw || raw.toLowerCase() === HIRES_UPSCALER_FALLBACK_NAME.toLowerCase();
  const listHasFallback = upscalerOptions.value.some(
    (n) => n.trim() === HIRES_UPSCALER_FALLBACK_NAME,
  );
  if (isEffectiveDefault && listHasFallback) {
    return HIRES_UPSCALER_FALLBACK_NAME;
  }
  if (isEffectiveDefault && !listHasFallback) {
    return HIRES_UPSCALER_DEFAULT_ID;
  }
  return raw;
});

const hiresUpscalerDisplayLabel = computed(() => {
  const raw = modelValue.value.txt2img.hiresUpscaler.trim();
  const isEffectiveDefault =
    !raw || raw.toLowerCase() === HIRES_UPSCALER_FALLBACK_NAME.toLowerCase();
  const listHasFallback = upscalerOptions.value.some(
    (n) => n.trim() === HIRES_UPSCALER_FALLBACK_NAME,
  );
  if (isEffectiveDefault && listHasFallback) {
    return HIRES_UPSCALER_FALLBACK_NAME;
  }
  if (isEffectiveDefault && !listHasFallback) {
    return HIRES_UPSCALER_FALLBACK_NAME;
  }
  return raw;
});

async function refreshUpscalers(opts?: { pullDone?: AppPullFlashDone }) {
  const pullDone = opts?.pullDone;
  if (modelValue.value.txt2img.backend !== "a1111") {
    pullDone?.("abort");
    return;
  }
  if (!modelValue.value.txt2img.apiBaseUrl.trim()) {
    if (pullDone) await appAlert("请先填写文生图接口地址");
    pullDone?.("abort");
    return;
  }
  upscalersLoading.value = true;
  let ok = false;
  try {
    const invoke = window.colorTxt?.ai?.txt2imgInvoke;
    if (typeof invoke !== "function") {
      if (pullDone) await appAlert("preload 未就绪，请重启应用。");
      return;
    }
    const r = await invoke({
      op: "listA1111Upscalers",
      apiBaseUrl: modelValue.value.txt2img.apiBaseUrl.trim(),
    });
    if (r.ok && r.op === "listA1111Upscalers") {
      ok = true;
      upscalerOptions.value = r.upscalers;
    } else if (!r.ok) {
      upscalerOptions.value = [];
      if (pullDone) await appAlert(r.error);
    } else {
      upscalerOptions.value = [];
      if (pullDone) await appAlert("文生图接口返回异常");
    }
  } catch (e) {
    upscalerOptions.value = [];
    if (pullDone) {
      await appAlert(e instanceof Error ? e.message : String(e));
    }
  } finally {
    upscalersLoading.value = false;
    if (pullDone) pullDone(ok);
    else hiresUpscalerPullBtnRef.value?.clearStaleFailOnSilentSuccess(ok);
  }
}

function onHiresUpscalerPanelOpenChange(isOpen: boolean) {
  if (!isOpen || upscalersLoading.value) return;
  if (upscalerOptions.value.length > 0) return;
  void refreshUpscalers();
}

function onHiresUpscalerSelect(id: string) {
  if (id === HIRES_UPSCALER_DEFAULT_ID || id === HIRES_UPSCALER_FALLBACK_NAME) {
    modelValue.value.txt2img.hiresUpscaler = "";
  } else {
    modelValue.value.txt2img.hiresUpscaler = id;
  }
}

watch(
  () =>
    `${modelValue.value.txt2img.backend}\0${modelValue.value.txt2img.apiBaseUrl.trim()}`,
  () => {
    samplerOptions.value = [];
    upscalerOptions.value = [];
    sdModelOptions.value = [];
    samplerPullBtnRef.value?.reset();
    hiresUpscalerPullBtnRef.value?.reset();
    sdModelPullBtnRef.value?.reset();
  },
);

function onTxt2ImgBackendSelect(id: string) {
  const hit = findTxt2ImgBackendPreset(id);
  if (!hit) return;
  modelValue.value.txt2img.backend = hit.id;
  if (hit.custom) {
    modelValue.value.txt2img.apiBaseUrl = "";
  } else if (hit.baseUrl.trim()) {
    modelValue.value.txt2img.apiBaseUrl = hit.baseUrl;
  }
  if (isTxt2ImgCloudBackend(hit.id)) {
    const def =
      TXT2IMG_DEFAULT_CLOUD_MODEL[
        hit.id as keyof typeof TXT2IMG_DEFAULT_CLOUD_MODEL
      ];
    if (def) modelValue.value.txt2img.cloudModel = def;
  }
  const size = applyTxt2ImgSizeForBackendSwitch(hit.id);
  modelValue.value.txt2img.width = size.width;
  modelValue.value.txt2img.height = size.height;
}

async function runTxt2imgConnectionTest(): Promise<ConnectionTestResult | null> {
  if (txt2imgNeedsApiKey.value && !modelValue.value.txt2img.apiKey.trim()) {
    await appAlert("请先填写文生图 API 密钥");
    return null;
  }
  if (
    txt2imgIsLocalWebUi.value &&
    !modelValue.value.txt2img.apiBaseUrl.trim()
  ) {
    await appAlert("请先填写文生图接口地址");
    return null;
  }
  if (
    txt2imgBackend.value === "openai_compat_images" &&
    !modelValue.value.txt2img.apiBaseUrl.trim()
  ) {
    await appAlert("请先填写 OpenAI 兼容接口地址");
    return null;
  }
  const invoke = window.colorTxt?.ai?.txt2imgInvoke;
  if (typeof invoke !== "function") {
    await appAlert("preload 未就绪，请重启应用。");
    return null;
  }
  const r = await invoke({
    op: "testConnection",
    backend: modelValue.value.txt2img.backend,
    apiBaseUrl: modelValue.value.txt2img.apiBaseUrl.trim(),
    apiKey: modelValue.value.txt2img.apiKey,
  });
  if (r.ok && r.op === "testConnection") return { ok: true };
  return { ok: false, error: r.ok ? "连接失败" : r.error || "连接失败" };
}
</script>

<template>
  <div class="settingsBody">
    <section class="aiSection aiSection--compact">
      <div class="aiMasterToggleRow">
        <span class="settingsLabel aiMasterToggleLabel"
          >启用「角色卡」功能</span
        >
        <SwitchToggle
          v-model="modelValue.txt2img.enabled"
          aria-label="启用角色卡功能"
        />
      </div>
      <p class="aiMasterHint">启用后，会在侧栏显示「角色卡」入口。</p>
    </section>

    <template v-if="modelValue.txt2img.enabled">
      <section class="aiSection">
        <h3 class="aiSectionTitle">文生图 API 设置</h3>
        <div class="settingsRow">
          <div class="settingsRowMain settingsRowMain--baseline">
            <span class="settingsLabel short">服务商</span>
            <AppCustomSelect
              class="txt2imgBackendSelect"
              :model-value="modelValue.txt2img.backend"
              :display-label="txt2imgBackendDisplayLabel"
              placeholder="选择服务商…"
              :fixed-top-items="txt2imgBackendSelectEmpty"
              :scroll-items="txt2imgBackendSelectItems"
              :fixed-bottom-items="txt2imgBackendSelectEmpty"
              :scroll-max-height="220"
              ariaLabel="文生图服务商"
              @update:model-value="onTxt2ImgBackendSelect"
            />
          </div>
        </div>
        <div class="settingsRow">
          <div class="settingsRowMain settingsRowMain--baseline">
            <span class="settingsLabel short">接口地址</span>
            <input
              v-model="modelValue.txt2img.apiBaseUrl"
              type="text"
              autocomplete="off"
              spellcheck="false"
              class="settingsStretchInput txt2imgRowStretchInput"
              aria-label="文生图接口地址"
            />
          </div>
        </div>
        <template v-if="txt2imgNeedsApiKey">
          <div class="settingsRow">
            <div class="settingsRowMain settingsRowMain--baseline">
              <span class="settingsLabel short">API 密钥</span>
              <div class="aiRowField">
                <div class="settingsPasswordRow aiPasswordRow">
                  <input
                    v-model="modelValue.txt2img.apiKey"
                    class="settingsStretchInput settingsPasswordRow__input"
                    :type="showTxt2ImgKey ? 'text' : 'password'"
                    autocomplete="off"
                    spellcheck="false"
                    aria-label="文生图 API 密钥"
                  />
                  <button
                    type="button"
                    class="btn iconOnly"
                    :title="showTxt2ImgKey ? '隐藏' : '显示'"
                    :aria-label="showTxt2ImgKey ? '隐藏 API 密钥' : '显示 API 密钥'"
                    @click="showTxt2ImgKey = !showTxt2ImgKey"
                  >
                    <span
                      class="iconSvg"
                      v-html="showTxt2ImgKey ? icons.view : icons.viewOff"
                    />
                  </button>
                  <AppConnectionTestButton
                    class="txt2imgKeyTestBtn"
                    :fingerprint="txt2imgConnectionFingerprint"
                    :on-test="runTxt2imgConnectionTest"
                    title="仅校验接口地址和 API 密钥的有效性，不出图"
                  />
                </div>
              </div>
            </div>
            <p class="settingsHint">{{ secretStorageHint }}</p>
          </div>
          <div class="settingsRow">
            <div class="settingsRowMain settingsRowMain--baseline">
              <span class="settingsLabel short">模型</span>
              <div class="txt2imgCloudModelRow">
                <ApiEndpointInput
                  v-model="modelValue.txt2img.cloudModel"
                  :suggestions="cloudModelSuggestions"
                  placeholder="输入模型 ID…"
                  input-class="txt2imgRowStretchInput txt2imgCloudModelInput"
                  aria-label="文生图模型"
                  :scroll-max-height="260"
                />
              </div>
            </div>
            <p class="aiMasterHint">
              服务商新增的模型没有出现在列表里时，可手动输入；留空则使用默认模型。
            </p>
          </div>
          <div v-if="txt2imgShowOpenAiQuality" class="settingsRow">
            <div class="settingsRowMain settingsRowMain--baseline">
              <span class="settingsLabel short">画质</span>
              <AppCustomSelect
                class="txt2imgQualitySelect"
                :model-value="
                  normalizeTxt2ImgCloudQuality(modelValue.txt2img.cloudQuality)
                "
                :display-label="txt2imgQualityDisplayLabel"
                placeholder="选择画质…"
                :fixed-top-items="selectListsEmpty"
                :scroll-items="txt2imgQualitySelectItems"
                :fixed-bottom-items="selectListsEmpty"
                :scroll-max-height="200"
                ariaLabel="OpenAI 图像画质"
                @update:model-value="onTxt2ImgQualitySelect"
              />
            </div>
          </div>
        </template>
        <div v-if="modelValue.txt2img.backend === 'a1111'" class="settingsRow">
          <div class="settingsRowMain settingsRowMain--samplerRow">
            <span class="settingsLabel short">SD 模型</span>
            <div class="aiModelToolbar txt2imgSamplerToolbar">
              <AppCustomSelect
                class="aiModelSelect"
                :model-value="sdCheckpointSelectModelId"
                :display-label="sdCheckpointDisplayLabel"
                placeholder="选择 SD 模型…"
                :fixed-top-items="selectListsEmpty"
                :scroll-items="sdCheckpointScrollItems"
                :fixed-bottom-items="selectListsEmpty"
                :scroll-max-height="260"
                ariaLabel="文生图 SD 模型"
                @panel-open-change="onSdCheckpointPanelOpenChange"
                @update:model-value="onSdCheckpointSelect"
              />
              <AppPullFlashButton
                ref="sdModelPullBtnRef"
                label="拉取 SD 模型"
                :busy="sdModelsLoading"
                @pull="(done) => void refreshSdModels({ pullDone: done })"
              />
            </div>
          </div>
          <p class="aiMasterHint">
            修改模型后，首次生成需要加载新模型，可能会比较慢；之后再生成不需要加载模型，会快一些。
          </p>
        </div>
      </section>

      <section
        v-if="modelValue.txt2img.backend === 'comfyui'"
        class="aiSection aiSection--compact"
      >
        <h3 class="aiSectionTitle">ComfyUI 工作流 JSON</h3>
        <p class="aiMasterHint">
          须包含可产出图像的输出节点；提交队列为
          <code>POST /prompt</code>，生成结果通过 <code>/history</code> 与
          <code>/view</code> 拉取。
        </p>
        <p class="aiMasterHint">
          在下方文本框粘贴 ComfyUI「导出（API）」得到的工作流 JSON：
        </p>
        <textarea
          v-model="modelValue.txt2img.comfyWorkflowJson"
          class="settingsStretchTextarea settingsStretchTextarea--multiline settingsStretchTextarea--workflow"
          spellcheck="false"
          placeholder="{ ... }"
        />
        <p class="aiMasterHint">
          在 CLIP 等节点的文本字段中用占位符
          <code>__PROMPT__</code>、<code>__NEGATIVE__</code>，数值可用
          <code>__SEED__</code
          >、<code>__WIDTH__</code>、<code>__HEIGHT__</code>、<code>__STEPS__</code>、<code>__CFG__</code>。
        </p>
      </section>

      <section class="aiSection">
        <h3 class="aiSectionTitle">默认生成参数</h3>
        <div v-if="txt2imgUsesCloudSizeSelect" class="settingsRow">
          <div class="settingsRowMain settingsRowMain--baseline">
            <span class="settingsLabel short">尺寸</span>
            <AppCustomSelect
              class="txt2imgCloudSizeSelect"
              :model-value="txt2imgCloudSizeSelectValue"
              :display-label="txt2imgCloudSizeDisplayLabel"
              placeholder="选择尺寸…"
              :fixed-top-items="selectListsEmpty"
              :scroll-items="txt2imgCloudSizeSelectItems"
              :fixed-bottom-items="selectListsEmpty"
              :scroll-max-height="240"
              ariaLabel="文生图尺寸"
              @update:model-value="onTxt2ImgCloudSizeSelect"
            />
          </div>
        </div>
        <template v-else>
          <div class="settingsRow">
            <div class="settingsRowMain settingsRowMain--baseline">
              <span class="settingsLabel"
                >宽度（{{ modelValue.txt2img.width }} px）</span
              >
              <NumericInput
                v-model="modelValue.txt2img.width"
                :min="64"
                :max="2048"
                integer
                class="numCompact"
                aria-label="文生图宽度"
              />
            </div>
          </div>
          <div class="settingsRow">
            <div class="settingsRowMain settingsRowMain--baseline">
              <span class="settingsLabel"
                >高度（{{ modelValue.txt2img.height }} px）</span
              >
              <NumericInput
                v-model="modelValue.txt2img.height"
                :min="64"
                :max="2048"
                integer
                class="numCompact"
                aria-label="文生图高度"
              />
            </div>
          </div>
        </template>
        <div v-if="txt2imgIsLocalWebUi" class="settingsRow">
          <div class="settingsRowMain settingsRowMain--baseline">
            <span class="settingsLabel"
              >采样步数（{{ modelValue.txt2img.steps }}）</span
            >
            <NumericInput
              v-model="modelValue.txt2img.steps"
              :min="1"
              :max="150"
              integer
              class="numCompact"
              aria-label="采样步数"
            />
          </div>
        </div>
        <div v-if="txt2imgIsLocalWebUi" class="settingsRow">
          <div class="settingsRowMain settingsRowMain--baseline">
            <span class="settingsLabel"
              >提示词相关性（{{ modelValue.txt2img.cfgScale }}）</span
            >
            <NumericInput
              v-model="modelValue.txt2img.cfgScale"
              :min="1"
              :max="30"
              class="numCompact"
              aria-label="提示词相关性"
            />
          </div>
        </div>
        <div v-if="modelValue.txt2img.backend === 'a1111'" class="settingsRow">
          <div class="settingsRowMain settingsRowMain--samplerRow">
            <span class="settingsLabel short">采样器</span>
            <div class="aiModelToolbar txt2imgSamplerToolbar">
              <AppCustomSelect
                class="aiModelSelect"
                :model-value="samplerSelectModelId"
                :display-label="samplerDisplayLabel"
                placeholder="选择采样器…"
                :fixed-top-items="selectListsEmpty"
                :scroll-items="samplerScrollItems"
                :fixed-bottom-items="selectListsEmpty"
                :scroll-max-height="260"
                ariaLabel="文生图采样器"
                @panel-open-change="onSamplerPanelOpenChange"
                @update:model-value="onSamplerSelect"
              />
              <AppPullFlashButton
                ref="samplerPullBtnRef"
                label="拉取采样器"
                :busy="samplersLoading"
                @pull="(done) => void refreshSamplers({ pullDone: done })"
              />
            </div>
          </div>
        </div>
        <div v-if="txt2imgIsLocalWebUi" class="settingsRow">
          <div class="settingsRowMain settingsRowMain--baseline">
            <span class="settingsLabel"
              >种子（{{ modelValue.txt2img.seed }}）</span
            >
            <NumericInput
              v-model="modelValue.txt2img.seed"
              :min="-1"
              :max="2_147_483_647"
              integer
              class="numCompact"
              aria-label="随机种子"
            />
          </div>
          <p class="aiMasterHint">-1 为随机</p>
        </div>
      </section>

      <section v-if="modelValue.txt2img.backend === 'a1111'" class="aiSection">
        <div class="aiMasterToggleRow">
          <h3 class="aiSectionTitle aiMasterToggleLabel">
            高分辨率修复 (Hires. fix)
          </h3>
          <SwitchToggle
            v-model="modelValue.txt2img.hiresEnabled"
            aria-label="启用高分辨率修复"
          />
        </div>
        <template v-if="modelValue.txt2img.hiresEnabled">
          <div class="settingsRow">
            <div class="settingsRowMain settingsRowMain--samplerRow">
              <span class="settingsLabel short">放大算法</span>
              <div class="aiModelToolbar txt2imgHiresUpscalerToolbar">
                <AppCustomSelect
                  class="aiModelSelect"
                  :model-value="hiresUpscalerSelectModelId"
                  :display-label="hiresUpscalerDisplayLabel"
                  placeholder="选择放大算法…"
                  :fixed-top-items="selectListsEmpty"
                  :scroll-items="hiresUpscalerScrollItems"
                  :fixed-bottom-items="selectListsEmpty"
                  :scroll-max-height="260"
                  ariaLabel="高分辨率放大算法"
                  @panel-open-change="onHiresUpscalerPanelOpenChange"
                  @update:model-value="onHiresUpscalerSelect"
                />
                <AppPullFlashButton
                  ref="hiresUpscalerPullBtnRef"
                  label="拉取放大算法"
                  :busy="upscalersLoading"
                  @pull="(done) => void refreshUpscalers({ pullDone: done })"
                />
              </div>
            </div>
          </div>
          <div class="settingsRow">
            <div class="settingsRowMain settingsRowMain--baseline">
              <span class="settingsLabel"
                >放大倍数（{{ modelValue.txt2img.hiresScale }}）</span
              >
              <NumericInput
                v-model="modelValue.txt2img.hiresScale"
                :min="1"
                :max="8"
                class="numCompact"
                aria-label="高分辨率放大倍数"
              />
            </div>
          </div>
          <div class="settingsRow">
            <div class="settingsRowMain settingsRowMain--baseline">
              <span class="settingsLabel"
                >高分迭代步数（{{
                  modelValue.txt2img.hiresSecondPassSteps
                }}）</span
              >
              <NumericInput
                v-model="modelValue.txt2img.hiresSecondPassSteps"
                :min="0"
                :max="150"
                integer
                class="numCompact"
                aria-label="高分迭代步数"
              />
            </div>
            <p class="aiMasterHint">0 表示使用默认值</p>
          </div>
          <div class="settingsRow">
            <div class="settingsRowMain settingsRowMain--baseline">
              <span class="settingsLabel"
                >重绘幅度（{{
                  modelValue.txt2img.hiresDenoisingStrength
                }}）</span
              >
              <NumericInput
                v-model="modelValue.txt2img.hiresDenoisingStrength"
                :min="0"
                :max="1"
                :step="0.01"
                class="numCompact"
                aria-label="高分辨率重绘幅度"
              />
            </div>
          </div>
          <div class="settingsRow">
            <div class="settingsRowMain settingsRowMain--baseline">
              <span class="settingsLabel"
                >将宽度调整为（{{ modelValue.txt2img.hiresResizeX }} px）</span
              >
              <NumericInput
                v-model="modelValue.txt2img.hiresResizeX"
                :min="0"
                :max="8192"
                integer
                class="numCompact"
                aria-label="高分辨率目标宽度"
              />
            </div>
            <p class="aiMasterHint">0 表示按放大倍数由宽度推导</p>
          </div>
          <div class="settingsRow">
            <div class="settingsRowMain settingsRowMain--baseline">
              <span class="settingsLabel"
                >将高度调整为（{{ modelValue.txt2img.hiresResizeY }} px）</span
              >
              <NumericInput
                v-model="modelValue.txt2img.hiresResizeY"
                :min="0"
                :max="8192"
                integer
                class="numCompact"
                aria-label="高分辨率目标高度"
              />
            </div>
            <p class="aiMasterHint">0 表示按放大倍数由高度推导</p>
          </div>
        </template>
      </section>

      <section class="aiSection">
        <h3 class="aiSectionTitle">通用描述</h3>
        <p class="aiMasterHint">
          侧栏「生成立绘」时与角色形象拼接。本地 SD 会译成英文 tag；云端接口会整理为自然语言 prompt。
        </p>
        <div class="settingsRow">
          <span class="settingsLabel">通用正面描述</span>
          <textarea
            v-model="modelValue.txt2img.defaultPositivePrompt"
            class="settingsStretchTextarea settingsStretchTextarea--multiline"
            rows="3"
            spellcheck="false"
            placeholder="可用中文，逗号或顿号分隔；文生图提交前会自动译为英文"
          />
        </div>
        <div class="settingsRow">
          <span class="settingsLabel">通用负面描述（SD 系）</span>
          <textarea
            v-model="modelValue.txt2img.defaultNegativePrompt"
            class="settingsStretchTextarea settingsStretchTextarea--multiline"
            rows="3"
            spellcheck="false"
            placeholder="可用中文，逗号或顿号分隔；文生图提交前会自动译为英文"
          />
        </div>
      </section>

      <section class="aiSection aiSection--compact">
        <div class="settingsRow">
          <div class="settingsRowMain settingsRowMain--baseline">
            <span class="settingsLabel short">角色立绘缓存目录</span>
            <div class="txt2imgPortraitCacheActions">
              <PathPickerInput
                v-model="characterPortraitCacheDir"
                is-directory
                :placeholder="portraitCacheDirPlaceholder"
                aria-label="角色立绘缓存根目录"
                class="txt2imgPortraitCachePicker"
              />
            </div>
          </div>
        </div>
        <p class="aiMasterHint">
          侧栏「角色卡」上传或生成的立绘将保存到：<code
            >该目录 / 书名文件夹 / 角色名.png</code
          >；<br />修改目录后，旧目录的内容将自动迁移到新目录。
        </p>
      </section>
    </template>
  </div>
</template>

<style scoped>
/* 与 SettingsAIPanel 对齐的布局与层级样式 */
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

.aiMasterHint :deep(strong) {
  color: var(--fg);
  font-weight: 600;
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

.settingsRowMain--samplerRow {
  align-items: center;
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

.settingsStretchInput,
.settingsStretchTextarea {
  width: 100%;
  box-sizing: border-box;
  min-width: 0;
}

.settingsStretchTextarea--multiline {
  font-family: inherit;
  line-height: 1.45;
}

.numCompact {
  width: 120px;
}

.txt2imgBackendSelect,
.txt2imgQualitySelect,
.txt2imgCloudSizeSelect {
  flex: 1 1 65%;
  min-width: 0;
  max-width: 100%;
}
.txt2imgRowStretchInput {
  flex: 1 1 65%;
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
}

.txt2imgCloudModelRow {
  flex: 1 1 65%;
  min-width: 0;
  max-width: 100%;
}

.txt2imgCloudModelRow :deep(.apiEndpointInput) {
  flex: 1 1 0;
  min-width: 0;
  max-width: 100%;
}

.txt2imgCloudModelInput {
  width: 100%;
  box-sizing: border-box;
}


.txt2imgPortraitCacheActions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex: 1 1 65%;
  min-width: 0;
}

.txt2imgPortraitCachePicker {
  flex: 1;
  min-width: 0;
  max-width: 100%;
}

.aiMasterHint code {
  font-size: 11px;
  padding: 2px 4px;
  border-radius: 4px;
  background: var(--panel-elevated, rgba(127, 127, 127, 0.12));
}

.settingsStretchTextarea--workflow {
  min-height: 100px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.4;
}

.aiModelToolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.aiRowField {
  flex: 1 1 65%;
  min-width: 0;
  max-width: 100%;
}

.aiPasswordRow {
  width: 100%;
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

.settingsHint {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--muted);
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

.txt2imgSamplerToolbar,
.txt2imgHiresUpscalerToolbar {
  flex: 1 1 65%;
  min-width: 0;
}

.aiModelSelect {
  flex: 1 1 160px;
  min-width: 0;
}
</style>
