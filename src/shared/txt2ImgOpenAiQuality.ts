/** OpenAI Images API `quality` 参数（gpt-image 系列：low / medium / high / auto） */
export type Txt2ImgOpenAiQualityId = "auto" | "high" | "medium" | "low";

export type Txt2ImgOpenAiQualityOption = {
  id: Txt2ImgOpenAiQualityId;
  /** 设置页下拉展示（中文） */
  label: string;
};

/** 文生图 OpenAI 画质固定选项（新→旧：自动优先） */
export const TXT2IMG_OPENAI_QUALITY_OPTIONS: readonly Txt2ImgOpenAiQualityOption[] =
  [
    { id: "auto", label: "自动" },
    { id: "high", label: "高" },
    { id: "medium", label: "中" },
    { id: "low", label: "低" },
  ];

const QUALITY_IDS = new Set<string>(
  TXT2IMG_OPENAI_QUALITY_OPTIONS.map((o) => o.id),
);

/** 载入配置或手输非法值时归一化为合法画质 id */
export function normalizeTxt2ImgCloudQuality(raw: string): Txt2ImgOpenAiQualityId {
  const q = raw.trim().toLowerCase();
  if (q === "hd") return "high";
  if (q === "standard") return "medium";
  if (QUALITY_IDS.has(q)) return q as Txt2ImgOpenAiQualityId;
  return "medium";
}

export function txt2ImgOpenAiQualityLabel(
  quality: string | undefined,
): string {
  const id = normalizeTxt2ImgCloudQuality(quality ?? "");
  return (
    TXT2IMG_OPENAI_QUALITY_OPTIONS.find((o) => o.id === id)?.label ?? "中"
  );
}

/** 按模型将 UI 画质映射为 API `quality`；`undefined` 表示不传该字段 */
export function resolveOpenAiImagesApiQuality(
  cloudQuality: string,
  modelId: string,
): string | undefined {
  const q = normalizeTxt2ImgCloudQuality(cloudQuality);
  const model = modelId.trim().toLowerCase();
  const isDalle = model.includes("dall-e");
  if (isDalle) {
    if (q === "auto") return undefined;
    if (q === "high") return "hd";
    return "standard";
  }
  if (q === "auto") return "auto";
  return q;
}
