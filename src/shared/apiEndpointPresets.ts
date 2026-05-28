/** 阿里云百炼 / DashScope 平台统一品牌名（对话、语音朗读等） */
export const DASHSCOPE_PLATFORM_LABEL = "阿里云通义（DashScope）";

/** 通义万相文生图服务商显示名 */
export const DASHSCOPE_WANX_PLATFORM_LABEL = "阿里云通义万相（DashScope）";

/** 百炼控制台 API 密钥页 */
export const DASHSCOPE_API_KEY_CONSOLE_URL =
  "https://bailian.console.aliyun.com/cn-beijing/?tab=model#/api-key";

/** 对话 API 推荐服务商（OpenAI 兼容 /chat/completions） */
export type ChatApiProviderPreset = {
  id: string;
  /** 服务商显示名（下拉第一行） */
  label: string;
  /** 官方通用接口 Base URL（选中后写入配置；`custom` 时忽略） */
  baseUrl: string;
  /** 下拉第二行说明（`custom` 等无固定地址时使用） */
  listDescription?: string;
  /** 选中后不覆盖接口地址，由用户手动填写 */
  custom?: boolean;
  /** 应用内「深度思考」有专门请求/流式字段适配 */
  deepThinkingAdapted?: boolean;
};

/** 「自定义 OpenAI 兼容服务」预设项 id */
export const CHAT_API_PROVIDER_CUSTOM_ID = "custom-openai-compat";

export const CHAT_API_PROVIDER_CUSTOM_PRESET: ChatApiProviderPreset = {
  id: CHAT_API_PROVIDER_CUSTOM_ID,
  label: "自定义 OpenAI 兼容服务",
  baseUrl: "",
  listDescription: "手动输入接口地址",
  custom: true,
};

const CHAT_API_PROVIDER_KNOWN_PRESETS: readonly ChatApiProviderPreset[] = [
  {
    id: "local-lmstudio",
    label: "本地 LM Studio",
    baseUrl: "http://127.0.0.1:1234/v1",
    deepThinkingAdapted: true,
  },
  {
    id: "local-ollama",
    label: "本地 Ollama",
    baseUrl: "http://127.0.0.1:11434/v1",
    deepThinkingAdapted: true,
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    deepThinkingAdapted: true,
  },
  {
    id: "dashscope",
    label: DASHSCOPE_PLATFORM_LABEL,
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    deepThinkingAdapted: true,
  },
  {
    id: "zhipu",
    label: "智谱 GLM",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    deepThinkingAdapted: true,
  },
  {
    id: "moonshot",
    label: "Moonshot（Kimi）",
    baseUrl: "https://api.moonshot.cn/v1",
    deepThinkingAdapted: true,
  },
  {
    id: "siliconflow",
    label: "硅基流动",
    baseUrl: "https://api.siliconflow.cn/v1",
    deepThinkingAdapted: true,
  },
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    deepThinkingAdapted: true,
  },
  {
    id: "google-gemini",
    label: "Google Gemini（OpenAI 兼容）",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    deepThinkingAdapted: true,
  },
];

/** 含「自定义 OpenAI 兼容服务」的完整下拉列表 */
export const CHAT_API_PROVIDER_PRESETS: readonly ChatApiProviderPreset[] = [
  ...CHAT_API_PROVIDER_KNOWN_PRESETS,
  CHAT_API_PROVIDER_CUSTOM_PRESET,
];

export function normalizeChatPresetBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export function findChatProviderPresetByBaseUrl(
  baseUrl: string,
): ChatApiProviderPreset | undefined {
  const n = normalizeChatPresetBaseUrl(baseUrl);
  if (!n) return undefined;
  return CHAT_API_PROVIDER_KNOWN_PRESETS.find(
    (p) => normalizeChatPresetBaseUrl(p.baseUrl) === n,
  );
}

export function isChatApiProviderCustomId(id: string): boolean {
  return id === CHAT_API_PROVIDER_CUSTOM_ID;
}

export function resolveChatProviderPresetIdFromBaseUrl(
  baseUrl: string,
): string {
  const hit = findChatProviderPresetByBaseUrl(baseUrl);
  if (hit) return hit.id;
  if (baseUrl.trim()) return CHAT_API_PROVIDER_CUSTOM_ID;
  return "";
}

/** @deprecated 请使用 CHAT_API_PROVIDER_PRESETS；保留供 ApiEndpointInput 默认建议 */
export const OPENAI_COMPAT_API_ENDPOINT_PRESETS =
  CHAT_API_PROVIDER_KNOWN_PRESETS.map((p) => p.baseUrl);

/** 远程向量 API 默认 Base URL（与对话默认服务商 LM Studio 一致） */
export const DEFAULT_EMBEDDING_REMOTE_BASE_URL = "http://127.0.0.1:1234/v1";

/** OpenAI 兼容：`GET {baseUrl}/models` */
export function openAiCompatModelsUrl(baseUrl: string): string {
  const b = normalizeChatPresetBaseUrl(baseUrl);
  return b ? `${b}/models` : "";
}

/** OpenAI 兼容：`POST {baseUrl}/embeddings` */
export function openAiCompatEmbeddingsUrl(baseUrl: string): string {
  const b = normalizeChatPresetBaseUrl(baseUrl);
  return b ? `${b}/embeddings` : "";
}

/** 文生图后端类型（与 `AITxt2ImgConfig.backend` 一致） */
export type Txt2ImgBackendPresetId =
  | "a1111"
  | "comfyui"
  | "openai_images"
  | "dashscope_wanx"
  | "stability"
  | "openai_compat_images";

export type Txt2ImgBackendPreset = {
  id: Txt2ImgBackendPresetId;
  /** 服务商显示名（下拉第一行） */
  label: string;
  /** 默认接口 Base URL（选中后写入配置；不含路径） */
  baseUrl: string;
  /** 下拉第二行说明（`custom` 等无固定地址时使用） */
  listDescription?: string;
  /** 选中后清空接口地址，由用户手动填写 */
  custom?: boolean;
};

export const TXT2IMG_BACKEND_PRESETS: readonly Txt2ImgBackendPreset[] = [
  {
    id: "a1111",
    label: "本地 WebUI",
    baseUrl: "http://127.0.0.1:7860",
  },
  {
    id: "comfyui",
    label: "本地 ComfyUI",
    baseUrl: "http://127.0.0.1:8188",
  },
  {
    id: "openai_images",
    label: "OpenAI Images",
    baseUrl: "https://api.openai.com/v1",
  },
  {
    id: "dashscope_wanx",
    label: DASHSCOPE_WANX_PLATFORM_LABEL,
    baseUrl: "https://dashscope.aliyuncs.com",
  },
  {
    id: "stability",
    label: "Stability AI",
    baseUrl: "https://api.stability.ai",
  },
  {
    id: "openai_compat_images",
    label: "自定义 OpenAI 兼容服务",
    baseUrl: "",
    listDescription: "手动输入接口地址",
    custom: true,
  },
];

export function findTxt2ImgBackendPreset(
  id: string,
): Txt2ImgBackendPreset | undefined {
  return TXT2IMG_BACKEND_PRESETS.find((p) => p.id === id);
}
