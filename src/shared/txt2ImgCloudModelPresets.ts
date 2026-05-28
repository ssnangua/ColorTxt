import type { AITxt2ImgBackend } from "./aiTypes";

export type Txt2ImgCloudBackendId = Exclude<
  AITxt2ImgBackend,
  "a1111" | "comfyui"
>;

/**
 * 各云端服务商常见文生图模型 id（设置页建议列表，按官方主推 / 新→旧排序）。
 * 用户仍可手动输入未收录的模型；留空 `cloudModel` 时使用 {@link TXT2IMG_DEFAULT_CLOUD_MODEL}。
 */
export const TXT2IMG_CLOUD_MODEL_SUGGESTIONS: Record<
  Txt2ImgCloudBackendId,
  readonly string[]
> = {
  openai_images: [
    "gpt-image-2",
    "gpt-image-1.5",
    "gpt-image-1",
    "gpt-image-1-mini",
    "dall-e-3",
    "dall-e-2",
  ],
  dashscope_wanx: [
    "wan2.6-t2i",
    "wan2.5-t2i-preview",
    "wan2.2-t2i-plus",
    "wan2.2-t2i-flash",
    "wanx2.1-t2i-plus",
    "wanx2.1-t2i-turbo",
    "wanx2.0-t2i-turbo",
    "wanx-v1",
  ],
  stability: [
    "ultra",
    "sd3.5-large",
    "sd3.5-large-turbo",
    "sd3.5-medium",
    "core",
    "sd3-large",
    "sd3-medium",
  ],
  openai_compat_images: [
    "gpt-image-2",
    "gpt-image-1.5",
    "gpt-image-1",
    "gpt-image-1-mini",
    "dall-e-3",
    "dall-e-2",
  ],
};

export function getTxt2ImgCloudModelSuggestions(
  backend: AITxt2ImgBackend,
): readonly string[] {
  if (backend === "a1111" || backend === "comfyui") return [];
  return TXT2IMG_CLOUD_MODEL_SUGGESTIONS[backend as Txt2ImgCloudBackendId] ?? [];
}

/** wan2.6+ 走 image-generation 新协议（messages 输入） */
export function usesDashScopeWan26ImageApi(model: string): boolean {
  const id = model.trim().toLowerCase();
  const m = /^wan2\.(\d+)/.exec(id);
  if (!m) return false;
  return parseInt(m[1]!, 10) >= 6;
}

/** wan2.5+ 推荐 1280 档分辨率（含 wan2.6） */
export function usesDashScopeWanHighResSize(model: string): boolean {
  const id = model.trim().toLowerCase();
  if (usesDashScopeWan26ImageApi(id)) return true;
  return id.startsWith("wan2.5");
}
