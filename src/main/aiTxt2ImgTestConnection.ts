import type { AITxt2ImgConfig } from "@shared/aiTypes";
import { fetchOpenAiCompatModelIds } from "./openAiCompatModelList";
import {
  errorFromTxt2ImgCatch,
  normalizeTxt2ImgBase,
  requireTxt2ImgApiKey,
} from "./aiTxt2ImgShared";

type TestResult = { ok: true } | { ok: false; error: string };

function dashScopeApiRoot(txt2img: AITxt2ImgConfig): string {
  const custom = normalizeTxt2ImgBase(txt2img.apiBaseUrl.trim());
  if (custom) return custom;
  return "https://dashscope.aliyuncs.com";
}

async function testA1111(txt2img: AITxt2ImgConfig): Promise<TestResult> {
  const base = normalizeTxt2ImgBase(txt2img.apiBaseUrl.trim());
  if (!base) return { ok: false, error: "缺少文生图接口地址" };
  try {
    const res = await fetch(`${base}/sdapi/v1/sd-models`);
    const raw = await res.text().catch(() => "");
    if (!res.ok) {
      return { ok: false, error: `WebUI HTTP ${res.status}: ${raw.slice(0, 300)}` };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ok: false, error: "WebUI 返回非 JSON" };
    }
    if (!Array.isArray(parsed)) {
      return { ok: false, error: "WebUI 模型列表格式无效" };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorFromTxt2ImgCatch(e) };
  }
}

async function testComfyUI(txt2img: AITxt2ImgConfig): Promise<TestResult> {
  const base = normalizeTxt2ImgBase(txt2img.apiBaseUrl.trim());
  if (!base) return { ok: false, error: "缺少文生图接口地址" };
  try {
    const res = await fetch(`${base}/system_stats`);
    const raw = await res.text().catch(() => "");
    if (!res.ok) {
      return {
        ok: false,
        error: `ComfyUI HTTP ${res.status}: ${raw.slice(0, 300)}`,
      };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorFromTxt2ImgCatch(e) };
  }
}

async function testOpenAiModels(
  txt2img: AITxt2ImgConfig,
  label: string,
): Promise<TestResult> {
  const keyR = requireTxt2ImgApiKey(txt2img.apiKey, label);
  if (!keyR.ok) return keyR;
  const base = normalizeTxt2ImgBase(txt2img.apiBaseUrl.trim());
  if (!base) return { ok: false, error: "缺少接口地址" };
  const r = await fetchOpenAiCompatModelIds({
    baseUrl: base,
    apiKey: keyR.key,
  });
  if (!r.ok) return r;
  return { ok: true };
}

async function testDashScope(txt2img: AITxt2ImgConfig): Promise<TestResult> {
  const keyR = requireTxt2ImgApiKey(txt2img.apiKey, "通义万相");
  if (!keyR.ok) return keyR;
  const root = dashScopeApiRoot(txt2img);
  const urls = [
    `${root}/api/v1/models`,
    `${root}/compatible-mode/v1/models`,
  ];
  let lastErr = "";
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${keyR.key}` },
      });
      const raw = await res.text().catch(() => "");
      if (res.ok) return { ok: true };
      lastErr = `HTTP ${res.status}: ${raw.slice(0, 300)}`;
      if (res.status === 404) continue;
      return { ok: false, error: `通义万相 ${lastErr}` };
    } catch (e) {
      lastErr = errorFromTxt2ImgCatch(e);
    }
  }
  return {
    ok: false,
    error: lastErr ? `通义万相：${lastErr}` : "通义万相连接失败",
  };
}

async function testStability(txt2img: AITxt2ImgConfig): Promise<TestResult> {
  const keyR = requireTxt2ImgApiKey(txt2img.apiKey, "Stability");
  if (!keyR.ok) return keyR;
  const base = normalizeTxt2ImgBase(txt2img.apiBaseUrl.trim());
  if (!base) {
    return {
      ok: false,
      error: "请填写 Stability 接口地址（如 https://api.stability.ai）",
    };
  }
  try {
    const res = await fetch(`${base}/v1/user/account`, {
      headers: {
        Authorization: `Bearer ${keyR.key}`,
        Accept: "application/json",
      },
    });
    const raw = await res.text().catch(() => "");
    if (!res.ok) {
      return {
        ok: false,
        error: `Stability HTTP ${res.status}: ${raw.slice(0, 300)}`,
      };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errorFromTxt2ImgCatch(e) };
  }
}

/**
 * 探测文生图连接（不发起真实出图，云端一般不消耗按张计费额度）。
 */
export async function testTxt2ImgConnection(
  txt2img: AITxt2ImgConfig,
): Promise<TestResult> {
  const backend = txt2img.backend ?? "a1111";
  switch (backend) {
    case "a1111":
      return testA1111(txt2img);
    case "comfyui":
      return testComfyUI(txt2img);
    case "openai_images":
      return testOpenAiModels(txt2img, "OpenAI");
    case "openai_compat_images":
      return testOpenAiModels(txt2img, "文生图");
    case "dashscope_wanx":
      return testDashScope(txt2img);
    case "stability":
      return testStability(txt2img);
    default:
      return { ok: false, error: `不支持的文生图 backend: ${backend}` };
  }
}
