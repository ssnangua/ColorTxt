import type { AITxt2ImgBackend } from "./aiTypes";

export type Txt2ImgCloudSizePreset = { width: number; height: number };

/** 本地 WebUI / ComfyUI 切换服务商时的默认宽高 */
export const TXT2IMG_DEFAULT_LOCAL_WIDTH = 512;
export const TXT2IMG_DEFAULT_LOCAL_HEIGHT = 768;

/** 切换云端服务商时，用此参考比例选取最近固定尺寸档（同比例优先像素更少，利于立绘省额度） */
export const TXT2IMG_CLOUD_SIZE_REFERENCE = {
  width: TXT2IMG_DEFAULT_LOCAL_WIDTH,
  height: TXT2IMG_DEFAULT_LOCAL_HEIGHT,
} as const;

export function txt2ImgSupportsCustomSize(backend: AITxt2ImgBackend): boolean {
  return backend === "a1111" || backend === "comfyui";
}

export function formatTxt2ImgSizeLabel(width: number, height: number): string {
  return `${width}×${height}`;
}

export function txt2ImgCloudSizePresetId(width: number, height: number): string {
  return `${width}x${height}`;
}

export function parseTxt2ImgCloudSizePresetId(
  id: string,
): Txt2ImgCloudSizePreset | null {
  const m = /^(\d+)x(\d+)$/i.exec(id.trim());
  if (!m) return null;
  const width = Number(m[1]);
  const height = Number(m[2]);
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 64 ||
    height < 64
  ) {
    return null;
  }
  return { width: Math.floor(width), height: Math.floor(height) };
}

const OPENAI_IMAGE_SIZE_PRESETS: readonly Txt2ImgCloudSizePreset[] = [
  { width: 1024, height: 1024 },
  { width: 1536, height: 1024 },
  { width: 1024, height: 1536 },
];

/** 万相 2.5+ / 2.6 常用固定分辨率（与主进程 high-res 映射一致） */
const DASHSCOPE_WANX_SIZE_PRESETS: readonly Txt2ImgCloudSizePreset[] = [
  { width: 1280, height: 1280 },
  { width: 1696, height: 960 },
  { width: 960, height: 1696 },
  { width: 1472, height: 1104 },
  { width: 1104, height: 1472 },
  { width: 1024, height: 1024 },
  { width: 1280, height: 720 },
  { width: 720, height: 1280 },
];

/** Stability：配置宽高用于推导 aspect_ratio，取常用代表像素展示 */
const STABILITY_SIZE_PRESETS: readonly Txt2ImgCloudSizePreset[] = [
  { width: 1024, height: 1024 },
  { width: 1536, height: 1024 },
  { width: 1472, height: 1104 },
  { width: 1024, height: 1536 },
  { width: 1104, height: 1472 },
  { width: 960, height: 1696 },
];

const CLOUD_SIZE_PRESETS: Record<
  Exclude<AITxt2ImgBackend, "a1111" | "comfyui">,
  readonly Txt2ImgCloudSizePreset[]
> = {
  openai_images: OPENAI_IMAGE_SIZE_PRESETS,
  openai_compat_images: OPENAI_IMAGE_SIZE_PRESETS,
  dashscope_wanx: DASHSCOPE_WANX_SIZE_PRESETS,
  stability: STABILITY_SIZE_PRESETS,
};

export function getTxt2ImgCloudSizePresets(
  backend: AITxt2ImgBackend,
): readonly Txt2ImgCloudSizePreset[] {
  if (txt2ImgSupportsCustomSize(backend)) return [];
  return CLOUD_SIZE_PRESETS[backend as keyof typeof CLOUD_SIZE_PRESETS] ?? [];
}

function sizePresetRatioScore(
  preset: Txt2ImgCloudSizePreset,
  targetWidth: number,
  targetHeight: number,
): number {
  const tw = Math.max(1, targetWidth);
  const th = Math.max(1, targetHeight);
  const targetRatio = tw / th;
  const presetRatio = preset.width / preset.height;
  return Math.abs(Math.log(presetRatio / targetRatio));
}

function sizePresetPixelArea(preset: Txt2ImgCloudSizePreset): number {
  return preset.width * preset.height;
}

/**
 * 相对「最佳宽高比差」允许的余量：在此范围内的档位视为比例足够接近，
 * 再从中选像素最少，避免为略贴近 3:4 等比例默认选中过大分辨率（立绘省额度）。
 */
const TXT2IMG_CLOUD_SIZE_RATIO_NEAR_BEST = 0.06;

/**
 * 在指定服务商的固定尺寸列表中：
 * 1. 先找宽高比最接近目标的一项（best ratio score）；
 * 2. 在 score ≤ best + {@link TXT2IMG_CLOUD_SIZE_RATIO_NEAR_BEST} 的档位里选像素面积最小。
 */
export function findClosestTxt2ImgCloudSizePreset(
  backend: AITxt2ImgBackend,
  width: number,
  height: number,
): Txt2ImgCloudSizePreset {
  const presets = getTxt2ImgCloudSizePresets(backend);
  if (presets.length === 0) {
    return { width: 1024, height: 1024 };
  }

  let minScore = Infinity;
  for (const p of presets) {
    const score = sizePresetRatioScore(p, width, height);
    if (score < minScore) minScore = score;
  }

  const scoreCutoff = minScore + TXT2IMG_CLOUD_SIZE_RATIO_NEAR_BEST;
  let best: Txt2ImgCloudSizePreset | null = null;
  let bestArea = Infinity;
  for (const p of presets) {
    const score = sizePresetRatioScore(p, width, height);
    if (score > scoreCutoff) continue;
    const area = sizePresetPixelArea(p);
    if (area < bestArea) {
      bestArea = area;
      best = p;
    }
  }

  return best ?? presets[0]!;
}

export function resolveTxt2ImgCloudSizePresetId(
  backend: AITxt2ImgBackend,
  width: number,
  height: number,
): string {
  const presets = getTxt2ImgCloudSizePresets(backend);
  const w = Math.floor(width);
  const h = Math.floor(height);
  const exact = presets.find((p) => p.width === w && p.height === h);
  if (exact) return txt2ImgCloudSizePresetId(exact.width, exact.height);
  const closest = findClosestTxt2ImgCloudSizePreset(backend, width, height);
  return txt2ImgCloudSizePresetId(closest.width, closest.height);
}

export function applyTxt2ImgSizeForBackendSwitch(
  backend: AITxt2ImgBackend,
): Txt2ImgCloudSizePreset {
  if (txt2ImgSupportsCustomSize(backend)) {
    return {
      width: TXT2IMG_DEFAULT_LOCAL_WIDTH,
      height: TXT2IMG_DEFAULT_LOCAL_HEIGHT,
    };
  }
  return findClosestTxt2ImgCloudSizePreset(
    backend,
    TXT2IMG_CLOUD_SIZE_REFERENCE.width,
    TXT2IMG_CLOUD_SIZE_REFERENCE.height,
  );
}
