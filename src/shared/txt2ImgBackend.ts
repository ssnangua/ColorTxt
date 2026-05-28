import type { AITxt2ImgBackend } from "./aiTypes";
import {
  findClosestTxt2ImgCloudSizePreset,
  txt2ImgSupportsCustomSize,
} from "./txt2ImgCloudSizePresets";

/** 出图前 prompt 适配方式 */
export type Txt2ImgPromptFamily = "sd" | "natural";

const SD_BACKENDS: readonly AITxt2ImgBackend[] = [
  "a1111",
  "comfyui",
  "stability",
];

const NATURAL_BACKENDS: readonly AITxt2ImgBackend[] = [
  "openai_images",
  "dashscope_wanx",
  "openai_compat_images",
];

const ALL_BACKENDS: readonly AITxt2ImgBackend[] = [
  ...SD_BACKENDS,
  ...NATURAL_BACKENDS,
];

export function isTxt2ImgBackend(v: string): v is AITxt2ImgBackend {
  return (ALL_BACKENDS as readonly string[]).includes(v);
}

export function getTxt2ImgPromptFamily(
  backend: AITxt2ImgBackend,
): Txt2ImgPromptFamily {
  if ((NATURAL_BACKENDS as readonly string[]).includes(backend)) {
    return "natural";
  }
  return "sd";
}

export function isTxt2ImgCloudBackend(backend: AITxt2ImgBackend): boolean {
  return (NATURAL_BACKENDS as readonly string[]).includes(backend) ||
    backend === "stability";
}

export function txt2ImgRequiresApiKey(backend: AITxt2ImgBackend): boolean {
  return (
    isTxt2ImgCloudBackend(backend) || backend === "stability"
  );
}

/** 各云端默认模型 id（用户可在设置中覆盖） */
export const TXT2IMG_DEFAULT_CLOUD_MODEL: Record<
  Exclude<AITxt2ImgBackend, "a1111" | "comfyui">,
  string
> = {
  openai_images: "gpt-image-2",
  dashscope_wanx: "wan2.6-t2i",
  stability: "ultra",
  openai_compat_images: "gpt-image-2",
};

export type Txt2ImgResolvedSize = { width: number; height: number };

/** 将配置宽高映射为各后端可用尺寸 */
export function resolveTxt2ImgSize(
  backend: AITxt2ImgBackend,
  width: number,
  height: number,
): Txt2ImgResolvedSize {
  const w = Math.max(64, Math.min(2048, Math.floor(width) || 512));
  const h = Math.max(64, Math.min(2048, Math.floor(height) || 768));

  if (txt2ImgSupportsCustomSize(backend)) {
    return { width: w, height: h };
  }
  if (isTxt2ImgCloudBackend(backend)) {
    const preset = findClosestTxt2ImgCloudSizePreset(backend, w, h);
    if (backend === "stability") {
      return {
        width: snapStabilityDimension(preset.width),
        height: snapStabilityDimension(preset.height),
      };
    }
    return preset;
  }
  return { width: w, height: h };
}

/** OpenAI Images API `size` 字符串 */
export function openAiImagesSizeString(size: Txt2ImgResolvedSize): string {
  return `${size.width}x${size.height}`;
}

/** 万相 API `size` 如 `1024*1024` */
export function dashScopeWanxSizeString(size: Txt2ImgResolvedSize): string {
  return `${size.width}*${size.height}`;
}

function snapStabilityDimension(n: number): number {
  const steps = [640, 768, 896, 1024, 1152, 1280, 1536];
  let best = steps[0]!;
  let bestDiff = Math.abs(n - best);
  for (const s of steps) {
    const d = Math.abs(n - s);
    if (d < bestDiff) {
      best = s;
      bestDiff = d;
    }
  }
  return best;
}

/** Stability SD3 `aspect_ratio` */
export function stabilityAspectRatio(size: Txt2ImgResolvedSize): string {
  const ratio = size.width / size.height;
  if (ratio > 1.25) return "16:9";
  if (ratio > 1.05) return "3:2";
  if (ratio < 0.8) return "9:16";
  if (ratio < 0.95) return "2:3";
  return "1:1";
}
