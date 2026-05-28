import type { AIConfig, AITxt2ImgBackend, AITxt2ImgConfig } from "@shared/aiTypes";
import { getTxt2ImgPromptFamily } from "@shared/txt2ImgBackend";
import { chatCompletionOnce } from "./aiChat";
import {
  formatPortraitTranslateError,
  runPortraitPromptZhToEn,
} from "./aiCharacterPortrait";
import { mergeTxt2ImgZhGeneralBeforeSpecific } from "./txt2imgMergeZh";

function stripJsonFence(raw: string): string {
  const t = raw.trim();
  if (t.startsWith("```")) {
    const lines = t.split("\n");
    if (lines.length >= 2) {
      lines.shift();
      if (lines[lines.length - 1]?.trim() === "```") lines.pop();
      return lines.join("\n").trim();
    }
  }
  return t;
}

export type AdaptPortraitPromptArgs = {
  backend: AITxt2ImgBackend;
  styleZh: string;
  appearanceZh: string;
  negativeZh?: string;
  defaultPositivePrompt: string;
  defaultNegativePrompt: string;
  signal?: AbortSignal;
};

export type AdaptedPortraitPrompt =
  | { family: "sd"; prompt: string; negativePrompt: string }
  | { family: "natural"; prompt: string };

export async function runPortraitPromptZhToNatural(
  cfg: AIConfig,
  args: {
    styleZh: string;
    appearanceZh: string;
    signal?: AbortSignal;
  },
): Promise<{ prompt_en: string } | { error: string }> {
  const styleZh = args.styleZh.trim();
  const appearanceZh = args.appearanceZh.trim();
  if (!styleZh && !appearanceZh) {
    return { prompt_en: "" };
  }

  const system = `你是插画向文生图提示词助手。
用户给出「本书画风」与「角色形象」两段中文描述。请合并为一段适合 DALL·E / 通义万相等自然语言文生图 API 的英文 prompt（完整句子或流畅短语，不要 SD tag 堆砌，不要用逗号分隔的 tag 列表）。
输出必须是单一 JSON 对象，不要 Markdown、不要代码围栏：
{ "prompt_en": string }
规则：
- 保留画风与角色外貌、服饰、姿态、光影氛围；
- 不要包含具体角色姓名或剧情剧透专用名词，可用「the character」等指代；
- 适合单人立绘 / 角色插画；
- 不要输出 negative 或排除项字段。`;

  const user = `本书画风：
${styleZh || "（空）"}

角色形象：
${appearanceZh || "（空）"}

请输出 JSON。`;

  try {
    const { text: raw } = await chatCompletionOnce({
      chat: cfg.chat,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      maxTokens: Math.min(cfg.chat.maxTokens, 2048),
      temperature: Math.min(cfg.chat.temperature, 0.4),
      signal: args.signal,
    });
    const stripped = stripJsonFence(raw.trim());
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripped) as unknown;
    } catch {
      return {
        error: formatPortraitTranslateError("模型返回无法解析为 JSON。"),
      };
    }
    if (!parsed || typeof parsed !== "object") {
      return { prompt_en: "" };
    }
    const pe = (parsed as Record<string, unknown>).prompt_en;
    const prompt_en =
      typeof pe === "string" ? pe.trim() : String(pe ?? "").trim();
    return { prompt_en };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: formatPortraitTranslateError(msg || "未知错误") };
  }
}

export async function adaptPortraitPromptForBackend(
  cfg: AIConfig,
  args: AdaptPortraitPromptArgs,
): Promise<AdaptedPortraitPrompt | { error: string }> {
  const family = getTxt2ImgPromptFamily(args.backend);
  const styleZh = args.styleZh.trim();
  const appearanceZh = mergeTxt2ImgZhGeneralBeforeSpecific(
    args.defaultPositivePrompt,
    args.appearanceZh,
  );
  let negativeZh = (args.negativeZh ?? "").trim();
  if (!negativeZh) {
    negativeZh = args.defaultNegativePrompt.trim();
  } else {
    negativeZh = mergeTxt2ImgZhGeneralBeforeSpecific(
      args.defaultNegativePrompt,
      negativeZh,
    );
  }

  if (family === "natural") {
    const tr = await runPortraitPromptZhToNatural(cfg, {
      styleZh,
      appearanceZh,
      signal: args.signal,
    });
    if ("error" in tr) return tr;
    const prompt = tr.prompt_en.trim();
    if (!prompt) {
      return {
        error: "请填写画风、角色形象之一（或在设置中填写通用正面描述）",
      };
    }
    return { family: "natural", prompt };
  }

  const tr = await runPortraitPromptZhToEn(cfg, {
    styleZh,
    promptZh: appearanceZh,
    negativeZh,
    signal: args.signal,
  });
  if ("error" in tr) return tr;

  const finalPrompt = [tr.style_en, tr.prompt_en]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(", ");
  if (!finalPrompt) {
    return {
      error: "请填写画风、角色形象之一（或在设置中填写通用正面描述）",
    };
  }
  return {
    family: "sd",
    prompt: finalPrompt,
    negativePrompt: tr.negative_en.trim(),
  };
}
