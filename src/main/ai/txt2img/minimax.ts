import { request } from "undici";
import type { AITxt2ImgConfig } from "@shared/aiTypes";
import { resolveMinimaxImageApiBase } from "@shared/apiEndpointPresets";
import {
  minimaxAspectRatio,
  resolveTxt2ImgSize,
  TXT2IMG_DEFAULT_CLOUD_MODEL,
} from "@shared/txt2ImgBackend";
import { isMinimaxH3ImageModel } from "@shared/txt2ImgCloudModelPresets";
import {
  bufferFromImageUrl,
  errorFromTxt2ImgCatch,
  requireTxt2ImgApiKey,
} from "./shared";

function resolveMinimaxModel(txt2img: AITxt2ImgConfig): string {
  const m = txt2img.cloudModel.trim();
  return m || TXT2IMG_DEFAULT_CLOUD_MODEL.minimax_images;
}

function parseMiniMaxBaseResp(body: Record<string, unknown>): void {
  const baseResp = body.base_resp as Record<string, unknown> | undefined;
  if (
    baseResp &&
    baseResp.status_code !== 0 &&
    baseResp.status_code !== undefined
  ) {
    const msg =
      typeof baseResp.status_msg === "string"
        ? baseResp.status_msg
        : `MiniMax 错误 ${String(baseResp.status_code)}`;
    throw new Error(msg);
  }
}

function decodeMinimaxBase64Image(
  value: string,
): { ok: true; buffer: Buffer } | null {
  try {
    const buf = Buffer.from(value.trim(), "base64");
    if (buf.length >= 32) return { ok: true, buffer: buf };
  } catch {
    /* ignore */
  }
  return null;
}

function firstMinimaxImageUrl(data: Record<string, unknown>): string {
  const urls = data.image_urls ?? data.images;
  if (!Array.isArray(urls)) return "";
  for (const item of urls) {
    if (typeof item === "string" && item.trim()) return item.trim();
    if (item && typeof item === "object") {
      const url = (item as Record<string, unknown>).url;
      if (typeof url === "string" && url.trim()) return url.trim();
    }
  }
  return "";
}

type H3Response = {
  data?: { b64_json?: string; error?: { message?: string } }[];
  error?: { message?: string };
};

async function fetchH3Image(
  base: string,
  key: string,
  model: string,
  prompt: string,
  size: { width: number; height: number },
  signal?: AbortSignal,
): Promise<{ ok: true; buffer: Buffer } | { ok: false; error: string }> {
  // Generation can take ten minutes. Replaying a POST can charge twice.
  const timeout = 610_000;
  const { body, statusCode } = await request(`${base}/images/generations`, {
    method: "POST",
    idempotent: false,
    maxRedirections: 0,
    headersTimeout: timeout,
    bodyTimeout: timeout,
    signal,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt: prompt.trim(),
      size: `${size.width}x${size.height}`,
      output_format: "png",
      response_format: "b64_json",
    }),
  });

  const raw = await body.text();
  let result: H3Response | null;
  try {
    result = JSON.parse(raw) as H3Response | null;
  } catch {
    return { ok: false, error: `MiniMax HTTP ${statusCode}: invalid JSON` };
  }
  if (statusCode !== 200 || result?.error) {
    return {
      ok: false,
      error: result?.error?.message || `MiniMax HTTP ${statusCode}`,
    };
  }

  let message = "MiniMax returned no image.";
  if (Array.isArray(result?.data)) {
    for (const image of result.data) {
      if (image?.error) {
        if (image.error.message) message = image.error.message;
      } else if (typeof image?.b64_json === "string") {
        const decoded = decodeMinimaxBase64Image(image.b64_json);
        if (decoded) return decoded;
      }
    }
  }
  return { ok: false, error: message };
}

export async function fetchMinimaxImagesBuffer(
  txt2img: AITxt2ImgConfig,
  prompt: string,
  signal?: AbortSignal,
): Promise<{ ok: true; buffer: Buffer } | { ok: false; error: string }> {
  const keyR = requireTxt2ImgApiKey(txt2img.apiKey, "MiniMax");
  if (!keyR.ok) return keyR;

  const model = resolveMinimaxModel(txt2img);
  const base = resolveMinimaxImageApiBase(txt2img.apiBaseUrl, model);
  if (isMinimaxH3ImageModel(model)) {
    const size = resolveTxt2ImgSize("minimax_images", txt2img.width, txt2img.height);
    try {
      return await fetchH3Image(base, keyR.key, model, prompt, size, signal);
    } catch (e) {
      return { ok: false, error: errorFromTxt2ImgCatch(e) };
    }
  }
  const aspectRatio = minimaxAspectRatio({
    width: txt2img.width,
    height: txt2img.height,
  });

  const url = `${base}/image_generation`;
  const body = {
    model,
    prompt: prompt.trim(),
    aspect_ratio: aspectRatio,
    response_format: "base64",
  };

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
        error: `MiniMax 文生图 HTTP ${res.status}: ${raw.slice(0, 400)}`,
      };
    }
    let json: unknown;
    try {
      json = JSON.parse(raw) as unknown;
    } catch {
      return { ok: false, error: "MiniMax 文生图返回非 JSON" };
    }
    if (!json || typeof json !== "object") {
      return { ok: false, error: "MiniMax 文生图响应无效" };
    }
    const rootObj = json as Record<string, unknown>;
    parseMiniMaxBaseResp(rootObj);

    const data = rootObj.data;
    if (!data || typeof data !== "object") {
      return { ok: false, error: "MiniMax 文生图响应中缺少 data" };
    }
    const dataRec = data as Record<string, unknown>;

    const images = dataRec.image_base64;
    if (Array.isArray(images)) {
      for (const item of images) {
        if (typeof item !== "string") continue;
        const decoded = decodeMinimaxBase64Image(item);
        if (decoded) return decoded;
      }
    }

    const imgUrl = firstMinimaxImageUrl(dataRec);
    if (imgUrl) {
      const dl = await bufferFromImageUrl(imgUrl, signal);
      if (!dl.ok) return { ok: false, error: `MiniMax 文生图：${dl.error}` };
      return dl;
    }

    return {
      ok: false,
      error: "MiniMax 文生图响应中无 image_base64 或 url",
    };
  } catch (e) {
    return { ok: false, error: errorFromTxt2ImgCatch(e) };
  }
}
