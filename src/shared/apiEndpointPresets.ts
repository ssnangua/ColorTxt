/** 阿里云百炼 / DashScope 平台统一品牌名（对话、语音朗读等） */
export const DASHSCOPE_PLATFORM_LABEL = "阿里云通义（DashScope）";

/** 通义万相文生图服务商显示名 */
export const DASHSCOPE_WANX_PLATFORM_LABEL = "阿里云通义万相（DashScope）";

/** 百炼控制台 API 密钥页 */
export const DASHSCOPE_API_KEY_CONSOLE_URL =
  "https://bailian.console.aliyun.com/cn-beijing/?tab=model#/api-key";

/** Agnes AI 平台显示名（对话、文生图） */
export const AGNES_PLATFORM_LABEL = "Agnes AI";

/** Agnes OpenAI 兼容 API Base URL */
export const AGNES_API_BASE_URL = "https://apihub.agnes-ai.com/v1";

/** Agnes 控制台 API 密钥页 */
export const AGNES_API_KEY_CONSOLE_URL =
  "https://platform.agnes-ai.com/settings/apiKeys";

/** MiniMax 平台统一品牌名（对话、文生图等；语音朗读 TTS 单独密钥） */
export const MINIMAX_PLATFORM_LABEL = "MiniMax";

/** MiniMax OpenAI 兼容 API Base URL（中国大陆；对话 / 文生图 / models 共用） */
export const MINIMAX_API_BASE_URL = "https://api.minimaxi.com/v1";

/** MiniMax 控制台 API 密钥页 */
export const MINIMAX_API_KEY_CONSOLE_URL =
  "https://platform.minimaxi.com/user-center/basic-information/interface-key";

/** 小米 MiMo 平台统一品牌名（对话、语音朗读 TTS 等） */
export const MIMO_PLATFORM_LABEL = "小米 MiMo";

/** 小米 MiMo 官方 OpenAI 兼容 API Base URL（按量付费 `sk-`） */
export const MIMO_API_BASE_URL = "https://api.xiaomimimo.com/v1";

/**
 * Token Plan OpenAI 兼容 Base URL（中国集群）。
 * `tp-` 密钥需走此网关；新加坡 / 欧洲见官方控制台，语音朗读默认中国集群。
 */
export const MIMO_TOKEN_PLAN_CN_API_BASE_URL =
  "https://token-plan-cn.xiaomimimo.com/v1";

/** 小米 MiMo 官方开放平台控制台 */
export const MIMO_API_KEY_CONSOLE_URL = "https://platform.xiaomimimo.com/";

/** 是否为 Token Plan 专属 API Key（`tp-xxxxx`） */
export function isMimoTokenPlanApiKey(apiKey: string): boolean {
  return apiKey.trim().toLowerCase().startsWith("tp-");
}

/**
 * 按密钥前缀解析 MiMo OpenAI 兼容 Base URL（去尾斜杠前由调用方再处理亦可）。
 * - `tp-` → Token Plan 中国集群
 * - 其余（含 `sk-`）→ 按量付费官方地址
 */
export function resolveMimoApiBaseUrlFromApiKey(apiKey: string): string {
  if (isMimoTokenPlanApiKey(apiKey)) {
    return MIMO_TOKEN_PLAN_CN_API_BASE_URL;
  }
  return MIMO_API_BASE_URL;
}

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
    id: "agnes",
    label: AGNES_PLATFORM_LABEL,
    baseUrl: AGNES_API_BASE_URL,
    deepThinkingAdapted: true,
  },
  {
    id: "minimax",
    label: MINIMAX_PLATFORM_LABEL,
    baseUrl: MINIMAX_API_BASE_URL,
    deepThinkingAdapted: true,
  },
  {
    id: "mimo",
    label: MIMO_PLATFORM_LABEL,
    baseUrl: MIMO_API_BASE_URL,
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
    id: "requesty",
    label: "Requesty",
    baseUrl: "https://router.requesty.ai/v1",
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

/** 接口地址是否为 Agnes AI 网关 */
export function agnesApiLikely(baseUrl: string): boolean {
  const u = normalizeChatPresetBaseUrl(baseUrl).toLowerCase();
  return u.includes("agnes-ai.com") || u.includes("apihub.agnes");
}

/** 接口地址是否为 MiniMax 官方 API */
export function minimaxApiLikely(baseUrl: string): boolean {
  const u = normalizeChatPresetBaseUrl(baseUrl).toLowerCase();
  return u.includes("minimaxi.com") || u.includes("minimax.io");
}

/**
 * MiniMax 文生图 / 测试连接用 Base URL（应含 `/v1`，与对话一致）。
 * 兼容旧配置里仅填主机根（如 `https://api.minimaxi.com`）的情况。
 */
export function resolveMinimaxImageApiBase(apiBaseUrl: string): string {
  const custom = normalizeChatPresetBaseUrl(apiBaseUrl);
  const base = custom || MINIMAX_API_BASE_URL;
  if (/^https?:\/\/[^/]+$/i.test(base) && minimaxApiLikely(base)) {
    return `${base}/v1`;
  }
  return base;
}

/** 接口地址是否为小米 MiMo 官方 API */
export function mimoApiLikely(baseUrl: string): boolean {
  const u = normalizeChatPresetBaseUrl(baseUrl).toLowerCase();
  return u.includes("xiaomimimo.com") || u.includes("mimo.mi.com");
}

/** OpenAI 兼容对话/向量：MiMo 使用 api-key 头，其余默认 Bearer */
export function applyOpenAiCompatAuthHeaders(
  headers: Record<string, string>,
  baseUrl: string,
  apiKey: string,
): void {
  const key = apiKey.trim();
  if (!key) return;
  if (mimoApiLikely(baseUrl)) {
    headers["api-key"] = key;
    return;
  }
  headers.Authorization = `Bearer ${key}`;
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
  | "agnes_images"
  | "dashscope_wanx"
  | "minimax_images"
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
    id: "agnes_images",
    label: AGNES_PLATFORM_LABEL,
    baseUrl: AGNES_API_BASE_URL,
  },
  {
    id: "dashscope_wanx",
    label: DASHSCOPE_WANX_PLATFORM_LABEL,
    baseUrl: "https://dashscope.aliyuncs.com",
  },
  {
    id: "minimax_images",
    label: MINIMAX_PLATFORM_LABEL,
    baseUrl: MINIMAX_API_BASE_URL,
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
