import type { AITxt2ImgConfig } from "@shared/aiTypes";
import {
  resolveTxt2ImgSize,
  stabilityAspectRatio,
  TXT2IMG_DEFAULT_CLOUD_MODEL,
} from "@shared/txt2ImgBackend";
import {
  errorFromTxt2ImgCatch,
  normalizeTxt2ImgBase,
  requireTxt2ImgApiKey,
} from "./aiTxt2ImgShared";

function resolveStabilityModel(txt2img: AITxt2ImgConfig): string {
  const m = txt2img.cloudModel.trim();
  return m || TXT2IMG_DEFAULT_CLOUD_MODEL.stability;
}

function stabilityGeneratePath(model: string): string {
  const id = model.toLowerCase();
  if (id.includes("ultra")) return "/v2beta/stable-image/generate/ultra";
  if (id.includes("core")) return "/v2beta/stable-image/generate/core";
  return "/v2beta/stable-image/generate/sd3";
}

export async function fetchStabilityImageBuffer(
  txt2img: AITxt2ImgConfig,
  prompt: string,
  negativePrompt: string,
  signal?: AbortSignal,
): Promise<{ ok: true; buffer: Buffer } | { ok: false; error: string }> {
  const keyR = requireTxt2ImgApiKey(txt2img.apiKey, "Stability");
  if (!keyR.ok) return keyR;

  const base = normalizeTxt2ImgBase(txt2img.apiBaseUrl.trim());
  if (!base) {
    return {
      ok: false,
      error: "请填写 Stability 接口地址（如 https://api.stability.ai）",
    };
  }

  const model = resolveStabilityModel(txt2img);
  const size = resolveTxt2ImgSize("stability", txt2img.width, txt2img.height);
  const path = stabilityGeneratePath(model);
  const url = `${base}${path}`;

  const form = new FormData();
  form.append("prompt", prompt.trim());
  form.append("aspect_ratio", stabilityAspectRatio(size));
  form.append("output_format", "png");
  if (model && path.includes("sd3")) {
    form.append("model", model);
  }
  const neg = negativePrompt.trim();
  if (neg && path.includes("sd3")) {
    form.append("negative_prompt", neg);
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${keyR.key}`,
        Accept: "image/*",
      },
      body: form,
      signal,
    });
    if (!res.ok) {
      const raw = await res.text().catch(() => "");
      return {
        ok: false,
        error: `Stability HTTP ${res.status}: ${raw.slice(0, 400)}`,
      };
    }
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      const raw = await res.text().catch(() => "");
      let json: unknown;
      try {
        json = JSON.parse(raw) as unknown;
      } catch {
        return { ok: false, error: "Stability 返回非 JSON" };
      }
      if (json && typeof json === "object") {
        const artifacts = (json as Record<string, unknown>).artifacts;
        if (Array.isArray(artifacts) && artifacts[0] && typeof artifacts[0] === "object") {
          const b64 = (artifacts[0] as Record<string, unknown>).base64;
          if (typeof b64 === "string" && b64.trim()) {
            const buf = Buffer.from(b64, "base64");
            if (buf.length < 32) return { ok: false, error: "Stability 解码图片过小" };
            return { ok: true, buffer: buf };
          }
        }
      }
      return { ok: false, error: "Stability JSON 响应中无图像" };
    }
    const arr = await res.arrayBuffer();
    const buf = Buffer.from(arr);
    if (buf.length < 32) return { ok: false, error: "Stability 输出图过小" };
    return { ok: true, buffer: buf };
  } catch (e) {
    return { ok: false, error: errorFromTxt2ImgCatch(e) };
  }
}
