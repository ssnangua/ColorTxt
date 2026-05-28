import type { AITxt2ImgConfig } from "@shared/aiTypes";
import {
  openAiImagesSizeString,
  resolveTxt2ImgSize,
  TXT2IMG_DEFAULT_CLOUD_MODEL,
} from "@shared/txt2ImgBackend";
import { resolveOpenAiImagesApiQuality } from "@shared/txt2ImgOpenAiQuality";
import {
  bufferFromImageUrl,
  errorFromTxt2ImgCatch,
  normalizeTxt2ImgBase,
  requireTxt2ImgApiKey,
} from "./aiTxt2ImgShared";

function resolveOpenAiModel(txt2img: AITxt2ImgConfig): string {
  const m = txt2img.cloudModel.trim();
  return m || TXT2IMG_DEFAULT_CLOUD_MODEL.openai_images;
}

export async function fetchOpenAiImagesBuffer(
  txt2img: AITxt2ImgConfig,
  prompt: string,
  signal?: AbortSignal,
): Promise<{ ok: true; buffer: Buffer } | { ok: false; error: string }> {
  const keyR = requireTxt2ImgApiKey(txt2img.apiKey, "文生图");
  if (!keyR.ok) return keyR;

  const base = normalizeTxt2ImgBase(txt2img.apiBaseUrl.trim());
  if (!base) {
    return { ok: false, error: "请填写 OpenAI 接口地址（如 https://api.openai.com/v1）" };
  }

  const size = resolveTxt2ImgSize(
    txt2img.backend === "openai_compat_images"
      ? "openai_compat_images"
      : "openai_images",
    txt2img.width,
    txt2img.height,
  );
  const model = resolveOpenAiModel(txt2img);
  const quality = resolveOpenAiImagesApiQuality(txt2img.cloudQuality, model);

  const body: Record<string, unknown> = {
    model,
    prompt: prompt.trim(),
    n: 1,
    size: openAiImagesSizeString(size),
    response_format: "b64_json",
  };
  if (quality) body.quality = quality;

  const url = `${base}/images/generations`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${keyR.key}`,
      },
      body: JSON.stringify(body),
      signal,
    });
    const raw = await res.text().catch(() => "");
    if (!res.ok) {
      return {
        ok: false,
        error: `OpenAI Images HTTP ${res.status}: ${raw.slice(0, 400)}`,
      };
    }
    let json: unknown;
    try {
      json = JSON.parse(raw) as unknown;
    } catch {
      return { ok: false, error: "OpenAI Images 返回非 JSON" };
    }
    if (!json || typeof json !== "object") {
      return { ok: false, error: "OpenAI Images 响应无效" };
    }
    const data = (json as Record<string, unknown>).data;
    if (!Array.isArray(data) || !data[0] || typeof data[0] !== "object") {
      return { ok: false, error: "OpenAI Images 响应中缺少 data[0]" };
    }
    const item = data[0] as Record<string, unknown>;
    const b64 = item.b64_json;
    if (typeof b64 === "string" && b64.trim()) {
      try {
        const buf = Buffer.from(b64, "base64");
        if (buf.length < 32) return { ok: false, error: "OpenAI 解码图片过小" };
        return { ok: true, buffer: buf };
      } catch {
        return { ok: false, error: "无法解码 OpenAI 返回的 base64" };
      }
    }
    const imgUrl = item.url;
    if (typeof imgUrl === "string" && imgUrl.trim()) {
      const dl = await bufferFromImageUrl(imgUrl.trim(), signal);
      if (!dl.ok) {
        return { ok: false, error: `OpenAI Images：${dl.error}` };
      }
      return dl;
    }
    return { ok: false, error: "OpenAI Images 响应中无 b64_json 或 url" };
  } catch (e) {
    return { ok: false, error: errorFromTxt2ImgCatch(e) };
  }
}
