import type { AITxt2ImgConfig } from "@shared/aiTypes";
import {
  errorFromTxt2ImgCatch,
  normalizeTxt2ImgBase,
} from "./aiTxt2ImgShared";

const A1111_TXT2IMG_HTTP_PATH = "/sdapi/v1/txt2img";

export async function fetchA1111ImageBuffer(
  txt2img: AITxt2ImgConfig,
  prompt: string,
  negativePrompt: string,
  signal?: AbortSignal,
): Promise<{ ok: true; buffer: Buffer } | { ok: false; error: string }> {
  const base = normalizeTxt2ImgBase(txt2img.apiBaseUrl.trim());
  if (!base) return { ok: false, error: "txt2img.apiBaseUrl 为空" };

  const url = `${base}${A1111_TXT2IMG_HTTP_PATH}`;

  const body: Record<string, unknown> = {
    prompt: prompt.trim(),
    negative_prompt: negativePrompt.trim(),
    steps: txt2img.steps,
    width: txt2img.width,
    height: txt2img.height,
    cfg_scale: txt2img.cfgScale,
  };

  const seed =
    typeof txt2img.seed === "number" && Number.isFinite(txt2img.seed)
      ? txt2img.seed
      : -1;
  if (seed >= 0) body.seed = seed;

  const sampler = txt2img.samplerName.trim();
  if (sampler) body.sampler_name = sampler;

  const ckpt = txt2img.sdCheckpointTitle.trim();
  if (ckpt) {
    body.override_settings = { sd_model_checkpoint: ckpt };
    body.override_settings_restore_afterwards = false;
  }

  if (txt2img.hiresEnabled) {
    body.enable_hr = true;
    body.hr_scale = txt2img.hiresScale;
    body.hr_upscaler = txt2img.hiresUpscaler.trim() || "Latent";
    body.hr_second_pass_steps = txt2img.hiresSecondPassSteps;
    body.denoising_strength = txt2img.hiresDenoisingStrength;
    body.hr_resize_x = txt2img.hiresResizeX;
    body.hr_resize_y = txt2img.hiresResizeY;
  } else {
    body.enable_hr = false;
  }

  let json: unknown;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    const raw = await res.text().catch(() => "");
    if (!res.ok) {
      return {
        ok: false,
        error: `文生图 HTTP ${res.status}: ${raw.slice(0, 400)}`,
      };
    }
    try {
      json = JSON.parse(raw) as unknown;
    } catch {
      return { ok: false, error: "文生图接口返回非 JSON" };
    }
  } catch (e) {
    return { ok: false, error: errorFromTxt2ImgCatch(e) };
  }

  if (!json || typeof json !== "object") {
    return { ok: false, error: "文生图响应无效" };
  }
  const images = (json as Record<string, unknown>).images;
  if (!Array.isArray(images) || typeof images[0] !== "string") {
    return { ok: false, error: "文生图响应中缺少 images[0] base64" };
  }

  try {
    const buf = Buffer.from(images[0], "base64");
    if (buf.length < 32) return { ok: false, error: "解码后的图片过小" };
    return { ok: true, buffer: buf };
  } catch {
    return { ok: false, error: "无法解码返回的图片 base64" };
  }
}
