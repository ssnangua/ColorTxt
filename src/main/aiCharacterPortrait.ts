import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  AIChatEndpoint,
  AIConfig,
  AIIndexSearchHit,
  AITxt2ImgConfig,
  BookStyleInferResult,
  PortraitCharacterGender,
  PortraitExtractExcerpt,
  PortraitExtractResult,
} from "@shared/aiTypes";
import { chatCompletionOnce } from "./aiChat";
import { fetchTxt2ImgImageBuffer } from "./aiTxt2Img";
import { embedTexts } from "./aiEmbedding";
import { searchChunks } from "./aiVectorDb";
import {
  addTokenUsage,
  type AITokenUsageTotals,
  ZERO_TOKEN_USAGE,
} from "@shared/aiTokenUsage";

/** 与「文生图接口」报错区分，便于侧栏立绘生成排障 */
const PORTRAIT_TRANSLATE_ERR_PREFIX = "提示词译英（对话模型）";

export function formatPortraitTranslateError(detail: string): string {
  const d = (detail || "未知错误").trim();
  if (!d || d === "已停止") return d;
  if (d.startsWith(PORTRAIT_TRANSLATE_ERR_PREFIX)) return d;
  return `${PORTRAIT_TRANSLATE_ERR_PREFIX}：${d}`;
}

/** 与「对话模型译英」区分；`aiTxt2Img` 内已有「文生图…」前缀的不再叠加 */
function formatTxt2ImgStepError(detail: string): string {
  const d = (detail || "未知错误").trim();
  if (!d || d === "已停止") return d;
  if (
    d.startsWith("文生图") ||
    d.startsWith("ComfyUI") ||
    d.startsWith("txt2img.") ||
    d.startsWith("无法解码") ||
    d.startsWith("解码后的图片")
  ) {
    return d;
  }
  return `文生图接口（${d}）`;
}

function portraitSearchQueries(characterName: string): string[] {
  const n = characterName.trim();
  if (!n) return [];
  return [`${n} 外貌`, `${n} 容貌`, `${n} 身穿`, `${n} 长相`, n];
}

function bookStyleSearchQueries(fileTitle: string): string[] {
  const t = fileTitle.trim().slice(0, 40);
  return [
    "文笔 文风 叙事 描写",
    "画面感 氛围 色调",
    "场景 意象 镜头",
    ...(t ? [`${t} 封面 插画`] : []),
  ];
}

async function mergedRagHitsForPortrait(opts: {
  bookHash: string;
  aiConfig: AIConfig;
  queries: string[];
  topKPerQuery: number;
  spoilerMaxChapterIndex: number | null;
}): Promise<AIIndexSearchHit[]> {
  const { bookHash, aiConfig, queries, topKPerQuery, spoilerMaxChapterIndex } =
    opts;
  const embedding = aiConfig.embedding;
  const k = Math.min(12, Math.max(1, topKPerQuery));
  const bestByChunk = new Map<string, AIIndexSearchHit>();

  for (const q of queries) {
    const vectors = await embedTexts(
      embedding,
      [q.trim() || "."],
      undefined,
      aiConfig,
    );
    const vec = vectors[0];
    if (!vec) continue;
    const fetchN =
      spoilerMaxChapterIndex != null ? Math.min(200, Math.max(k * 12, 48)) : k;
    const hits = searchChunks(bookHash, vec, fetchN);
    let usable = hits;
    if (spoilerMaxChapterIndex != null) {
      usable = hits.filter((h) => h.chapterIndex <= spoilerMaxChapterIndex);
    }
    for (const h of usable.slice(0, k)) {
      const prev = bestByChunk.get(h.chunkId);
      if (!prev || h.distance < prev.distance) bestByChunk.set(h.chunkId, h);
    }
  }

  return [...bestByChunk.values()]
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 28);
}

const MAX_SNIPPET_CHARS = 900;
const MAX_COMBINED_CONTEXT = 14_000;

function buildRetrievalContext(hits: AIIndexSearchHit[]): string {
  const parts: string[] = [];
  let total = 0;
  for (const h of hits) {
    const header = `第 ${h.chapterIndex + 1} 章 · ${h.chapterTitle}\n`;
    const body =
      h.content.length > MAX_SNIPPET_CHARS
        ? `${h.content.slice(0, MAX_SNIPPET_CHARS)}…`
        : h.content;
    const piece = `${header}${body}\n\n`;
    if (total + piece.length > MAX_COMBINED_CONTEXT) break;
    parts.push(piece);
    total += piece.length;
  }
  return parts.join("").trim();
}

function stripJsonFence(raw: string): string {
  let s = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/im.exec(s);
  if (fence?.[1]) s = fence[1].trim();
  return s;
}

function normalizePortraitGender(raw: unknown): PortraitCharacterGender {
  if (raw === "male" || raw === "female" || raw === "unknown") return raw;
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (s === "男" || s === "male" || s === "m") return "male";
  if (s === "女" || s === "female" || s === "f") return "female";
  if (s === "未知" || s === "不明" || s === "unknown") return "unknown";
  return "unknown";
}

function normalizeExtractFromParsed(
  parsed: unknown,
  hits: AIIndexSearchHit[],
): PortraitExtractResult {
  const fallbackQuote = (h: AIIndexSearchHit): string =>
    h.content.length > 480 ? `${h.content.slice(0, 480)}…` : h.content;

  if (!parsed || typeof parsed !== "object") {
    const excerpts: PortraitExtractExcerpt[] = hits.slice(0, 8).map((h) => ({
      chapterIndex: h.chapterIndex,
      chapterTitle: h.chapterTitle,
      quote: fallbackQuote(h),
    }));
    return {
      excerpts,
      appearance_zh: "（模型输出无法解析为 JSON，以下为检索片段摘要）",
      sd_prompt_zh: "单人，肖像，面部细节较多，柔和光线，杰作，最佳画质",
      negative_zh: "",
      confidence_note:
        "解析失败：请手动编辑中文 prompt；提交文生图时将自动译为英文。",
      gender: "unknown",
      age_text: "",
      identity_zh: "",
      bio_zh: "",
      relations_zh: "",
    };
  }

  const o = parsed as Record<string, unknown>;
  const rawEx = Array.isArray(o.excerpts) ? o.excerpts : [];
  const excerpts: PortraitExtractExcerpt[] = [];
  for (const row of rawEx.slice(0, 16)) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const chapterIndex =
      typeof r.chapterIndex === "number" && Number.isFinite(r.chapterIndex)
        ? Math.trunc(r.chapterIndex)
        : -1;
    const chapterTitle =
      typeof r.chapterTitle === "string" ? r.chapterTitle : "";
    const quote = typeof r.quote === "string" ? r.quote : "";
    if (chapterIndex < 0 || !quote.trim()) continue;
    excerpts.push({ chapterIndex, chapterTitle, quote: quote.trim() });
  }

  if (excerpts.length === 0 && hits.length > 0) {
    for (const h of hits.slice(0, 8)) {
      excerpts.push({
        chapterIndex: h.chapterIndex,
        chapterTitle: h.chapterTitle,
        quote: fallbackQuote(h),
      });
    }
  }

  const appearance_zh =
    typeof o.appearance_zh === "string"
      ? o.appearance_zh.trim()
      : String(o.appearance_zh ?? "").trim();

  const sd_prompt_zh_raw =
    typeof o.sd_prompt_zh === "string"
      ? o.sd_prompt_zh.trim()
      : String(o.sd_prompt_zh ?? "").trim();
  const legacy_sd_en =
    typeof o.sd_prompt_en === "string"
      ? o.sd_prompt_en.trim()
      : String(o.sd_prompt_en ?? "").trim();
  const sd_prompt_zh = sd_prompt_zh_raw || legacy_sd_en;

  const negative_zh_raw =
    typeof o.negative_zh === "string"
      ? o.negative_zh.trim()
      : String(o.negative_zh ?? "").trim();
  const legacy_neg_en =
    typeof o.negative_en === "string"
      ? o.negative_en.trim()
      : String(o.negative_en ?? "").trim();
  const negative_zh = negative_zh_raw || legacy_neg_en;

  const confidence_note =
    typeof o.confidence_note === "string"
      ? o.confidence_note.trim()
      : String(o.confidence_note ?? "").trim();

  const gender = normalizePortraitGender(o.gender);
  const age_text =
    typeof o.age_text === "string"
      ? o.age_text.trim()
      : String(o.age_text ?? "").trim();
  const identity_zh =
    typeof o.identity_zh === "string"
      ? o.identity_zh.trim()
      : String(o.identity_zh ?? "").trim();
  const bio_zh =
    typeof o.bio_zh === "string"
      ? o.bio_zh.trim()
      : String(o.bio_zh ?? "").trim();
  const relations_zh =
    typeof o.relations_zh === "string"
      ? o.relations_zh.trim()
      : String(o.relations_zh ?? "").trim();

  return {
    excerpts,
    appearance_zh:
      appearance_zh ||
      "（模型未给出中文外貌汇总，请依据摘录自行判断或重写 prompt。）",
    sd_prompt_zh:
      sd_prompt_zh || "单人，肖像，面部细节较多，柔和光线，杰作，最佳画质",
    negative_zh,
    confidence_note:
      confidence_note ||
      "请核对摘录是否确有原文依据；推断内容务必在画面构思中保守处理。",
    gender,
    age_text,
    identity_zh,
    bio_zh,
    relations_zh,
  };
}

function absorbChatUsage(
  acc: { usage: AITokenUsageTotals; available: boolean },
  part: AITokenUsageTotals | null | undefined,
): void {
  if (!part) return;
  acc.usage = addTokenUsage(acc.usage, part);
  acc.available = true;
}

function attachTokenUsage<T extends PortraitExtractResult | BookStyleInferResult>(
  result: T,
  acc: { usage: AITokenUsageTotals; available: boolean },
): T {
  if (!acc.available && acc.usage.totalTokens <= 0) return result;
  return {
    ...result,
    tokenUsage: acc.usage,
    tokenUsageAvailable: acc.available,
  };
}

async function callPortraitLlm(opts: {
  chat: AIChatEndpoint;
  characterName: string;
  retrievalContext: string;
  hits: AIIndexSearchHit[];
  signal?: AbortSignal;
}): Promise<PortraitExtractResult> {
  const { chat, characterName, retrievalContext, hits, signal } = opts;

  const system = `你是中文小说角色外貌分析与插画描述助手。
你必须只依据用户给出的「检索片段」总结外貌；不得编造书中未出现的细节。
若文本依据不足，须在 confidence_note 中说明哪些是推断、哪些缺乏原文。
输出必须是单一 JSON 对象，不要 Markdown、不要代码围栏，键如下：
{
  "excerpts": [ { "chapterIndex": number, "chapterTitle": string, "quote": string } ],
  "appearance_zh": string,
  "sd_prompt_zh": string,
  "negative_zh": string,
  "confidence_note": string,
  "gender": "male" | "female" | "unknown",
  "age_text": string,
  "identity_zh": string,
  "bio_zh": string,
  "relations_zh": string
}
excerpts 每条 quote 为原文节选（可稍缩短）；chapterIndex 从 0 起。
sd_prompt_zh：角色形象的中文自然语言描述（短语或短句，逗号或顿号分隔即可；面向读者编辑，勿写英文 tag）；用于后续文生图，可含外貌、服饰、姿态、光线等。
negative_zh：可选；一般填空字符串（通用排除项由应用设置提供）。
gender：依据原文能确定的生理性别；无法判断时用 unknown。
age_text：具体年龄数字或「少年」「中年」等描述；无任何依据时填空字符串。
identity_zh：故事中的组织归属、职业或社会地位；无依据时填空字符串。
bio_zh：人物简介（中文，可多条合并为一段）；无额外信息可与 appearance_zh 呼应但勿杜撰。
relations_zh：主要人物关系（中文）；无依据时填空字符串。`;

  const userMain = `角色名：「${characterName}」

以下是本书向量检索得到的片段（可能不完整或含有噪声）：

---
${retrievalContext || "（无检索结果）"}
---

请生成 JSON。`;

  const messages = [
    { role: "system" as const, content: system },
    { role: "user" as const, content: userMain },
  ];

  const usageAcc = { usage: ZERO_TOKEN_USAGE, available: false };

  const { text: raw, usage: usage1 } = await chatCompletionOnce({
    chat,
    messages,
    maxTokens: Math.min(chat.maxTokens, 4096),
    temperature: Math.min(chat.temperature, 0.6),
    signal,
  });
  absorbChatUsage(usageAcc, usage1);

  const stripped = stripJsonFence(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped) as unknown;
  } catch {
    const { text: raw2, usage: usage2 } = await chatCompletionOnce({
      chat,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `下列文本应为 JSON 但解析失败，请只输出修正后的合法 JSON（不要其它文字）：\n\n${stripped.slice(0, 12000)}`,
        },
      ],
      maxTokens: Math.min(chat.maxTokens, 4096),
      temperature: 0.2,
      signal,
    });
    absorbChatUsage(usageAcc, usage2);
    const stripped2 = stripJsonFence(raw2);
    try {
      parsed = JSON.parse(stripped2) as unknown;
    } catch {
      return attachTokenUsage(normalizeExtractFromParsed(null, hits), usageAcc);
    }
  }
  return attachTokenUsage(normalizeExtractFromParsed(parsed, hits), usageAcc);
}

export type PortraitTranslateSdArgs = {
  /** 本书画风前缀（中文）；空则 style_en 为空 */
  styleZh?: string;
  promptZh: string;
  negativeZh: string;
  signal?: AbortSignal;
};

function normalizeTranslatedSd(parsed: unknown): {
  style_en: string;
  prompt_en: string;
  negative_en: string;
} {
  if (!parsed || typeof parsed !== "object") {
    return { style_en: "", prompt_en: "", negative_en: "" };
  }
  const o = parsed as Record<string, unknown>;
  const style_en =
    typeof o.style_en === "string"
      ? o.style_en.trim()
      : String(o.style_en ?? "").trim();
  const prompt_en =
    typeof o.prompt_en === "string"
      ? o.prompt_en.trim()
      : String(o.prompt_en ?? "").trim();
  const negative_en =
    typeof o.negative_en === "string"
      ? o.negative_en.trim()
      : String(o.negative_en ?? "").trim();
  return { style_en, prompt_en, negative_en };
}

/**
 * 将侧栏编辑的中文 SD 提示词（画风前缀 + 角色正面 + 负面）译为英文 tag，供 WebUI / ComfyUI 调用。
 */
export async function runPortraitPromptZhToEn(
  cfg: AIConfig,
  args: PortraitTranslateSdArgs,
): Promise<
  | { style_en: string; prompt_en: string; negative_en: string }
  | { error: string }
> {
  const styleZh = (args.styleZh ?? "").trim();
  const promptZh = args.promptZh.trim();
  const negativeZh = args.negativeZh.trim();
  if (!styleZh && !promptZh && !negativeZh) {
    return { style_en: "", prompt_en: "", negative_en: "" };
  }

  const system = `你是 Stable Diffusion 提示词翻译与整理助手。
用户给出三段中文输入（画风前缀、角色主体正面、负面），多为逗号或顿号分隔的短语。请分别整理为适合 SD 1.x 的英文 short tags（英文逗号分隔）；保留已有英文单词与技术名词。
输出必须是单一 JSON 对象，不要 Markdown、不要代码围栏，键如下：
{ "style_en": string, "prompt_en": string, "negative_en": string }
规则：
- 某一栏在用户输入中为空或仅为空白时，对应输出必须为空字符串。
- style_en：全局画风、光影、色调、媒介感等前缀 tag；不要包含具体角色名或剧情专用名词。
- prompt_en：角色与画面主体内容。
- negative_en：负面 tag；可为空。
- 不要堆砌重复近义词。`;

  const user = `画风前缀（中文）：
${styleZh || "（空）"}

角色正面提示词（中文）：
${promptZh || "（空）"}

负面提示词（中文）：
${negativeZh || "（空）"}

请输出 JSON。`;

  const messages = [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];

  try {
    const { text: raw } = await chatCompletionOnce({
      chat: cfg.chat,
      messages,
      maxTokens: Math.min(cfg.chat.maxTokens, 2048),
      temperature: Math.min(cfg.chat.temperature, 0.35),
      signal: args.signal,
    });
    const stripped = stripJsonFence(raw.trim());
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripped) as unknown;
    } catch {
      const { text: raw2 } = await chatCompletionOnce({
        chat: cfg.chat,
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: `下列应为 JSON 但解析失败，请只输出修正后的合法 JSON（不要其它文字）：\n\n${stripped.slice(0, 8000)}`,
          },
        ],
        maxTokens: Math.min(cfg.chat.maxTokens, 2048),
        temperature: 0.15,
        signal: args.signal,
      });
      const s2 = stripJsonFence(raw2.trim());
      try {
        parsed = JSON.parse(s2) as unknown;
      } catch {
        return {
          error: formatPortraitTranslateError("模型返回无法解析为 JSON。"),
        };
      }
    }
    return normalizeTranslatedSd(parsed);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: formatPortraitTranslateError(msg || "未知错误") };
  }
}

export type PortraitExtractArgs = {
  bookHash: string;
  characterName: string;
  spoilerSafe: boolean;
  activeChapterIdx: number;
  signal?: AbortSignal;
};

/**
 * RAG 多查询合并 + 单次 LLM JSON（阅读侧栏「角色」与内置技能说明共用此入口）。
 */
export type BookStyleInferArgs = {
  bookHash: string;
  fileTitle: string;
  spoilerSafe: boolean;
  activeChapterIdx: number;
  signal?: AbortSignal;
};

function normalizeStyleFromParsed(parsed: unknown): BookStyleInferResult {
  if (!parsed || typeof parsed !== "object") {
    return {
      style_sd_prefix_zh: "戏剧性光影，氛围感强，小说插画风格",
      note_zh: "模型未返回合法 JSON，以上为保守默认中文前缀，请自行修改。",
    };
  }
  const o = parsed as Record<string, unknown>;
  const prefixZh =
    typeof o.style_sd_prefix_zh === "string" ? o.style_sd_prefix_zh.trim() : "";
  const legacyEn =
    typeof o.style_sd_prefix_en === "string" ? o.style_sd_prefix_en.trim() : "";
  const note = typeof o.note_zh === "string" ? o.note_zh.trim() : "";
  return {
    style_sd_prefix_zh:
      prefixZh || legacyEn || "戏剧性光影，氛围感强，小说插画风格",
    note_zh:
      note || "（模型未给出中文说明）若正文依据不足，请勿过度依赖此前缀。",
  };
}

async function callBookStyleLlm(opts: {
  chat: AIChatEndpoint;
  retrievalContext: string;
  fileTitle: string;
  signal?: AbortSignal;
}): Promise<BookStyleInferResult> {
  const system = `你是中文小说编辑与 Stable Diffusion 画风归纳助手。
仅依据用户给出的「正文摘录」归纳文字阅读时联想到的视觉风格（色调、光影、写实度、媒介感等）；勿编造摘录未出现的设定。
输出必须是单一 JSON 对象，不要 Markdown，键如下：
{ "style_sd_prefix_zh": string, "note_zh": string }
style_sd_prefix_zh：中文短语描述画面风格与媒介感，逗号或顿号分隔即可（面向读者编辑，勿写英文 tag）；长度适中，适合作为加在角色 prompt 之前的画风前缀；不要包含具体角色名或剧情专用名词。
note_zh：一两句中文，说明依据是否充分、是否为推断。`;

  const user = `书名（仅供参考）：${opts.fileTitle.trim() || "（未知）"}

以下是向量检索得到的正文片段（可能不完整）：

---
${opts.retrievalContext || "（无）"}
---

请输出 JSON。`;

  const usageAcc = { usage: ZERO_TOKEN_USAGE, available: false };

  const { text: raw, usage: usage1 } = await chatCompletionOnce({
    chat: opts.chat,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    maxTokens: Math.min(opts.chat.maxTokens, 2048),
    temperature: Math.min(opts.chat.temperature, 0.55),
    signal: opts.signal,
  });
  absorbChatUsage(usageAcc, usage1);

  const stripped = stripJsonFence(raw.trim());
  try {
    return attachTokenUsage(
      normalizeStyleFromParsed(JSON.parse(stripped) as unknown),
      usageAcc,
    );
  } catch {
    const { text: raw2, usage: usage2 } = await chatCompletionOnce({
      chat: opts.chat,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `下列应为 JSON 但解析失败，请只输出修正后的合法 JSON：\n\n${stripped.slice(0, 8000)}`,
        },
      ],
      maxTokens: Math.min(opts.chat.maxTokens, 2048),
      temperature: 0.2,
      signal: opts.signal,
    });
    absorbChatUsage(usageAcc, usage2);
    const s2 = stripJsonFence(raw2.trim());
    try {
      return attachTokenUsage(
        normalizeStyleFromParsed(JSON.parse(s2) as unknown),
        usageAcc,
      );
    } catch {
      return attachTokenUsage(normalizeStyleFromParsed(null), usageAcc);
    }
  }
}

/**
 * RAG + LLM 推断本书画风中文前缀（侧栏「角色」与二期增强）。
 */
export async function runBookStyleInference(
  cfg: AIConfig,
  args: BookStyleInferArgs,
): Promise<BookStyleInferResult | { error: string }> {
  if (!args.bookHash.trim()) return { error: "无效 bookHash" };
  if (!cfg.embeddingEnabled) {
    return { error: "请先在「向量模型」中启用向量索引并构建本书索引。" };
  }

  const spoilerMaxChapterIndex =
    args.spoilerSafe && args.activeChapterIdx >= 0
      ? args.activeChapterIdx
      : null;

  const queries = bookStyleSearchQueries(args.fileTitle);
  let hits: AIIndexSearchHit[];
  try {
    hits = await mergedRagHitsForPortrait({
      bookHash: args.bookHash.trim(),
      aiConfig: cfg,
      queries,
      topKPerQuery: cfg.ragTopK,
      spoilerMaxChapterIndex,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: msg || "向量检索失败" };
  }

  const retrievalContext = buildRetrievalContext(hits);
  if (!retrievalContext && spoilerMaxChapterIndex != null) {
    return {
      error:
        "防剧透：检索片段均在当前阅读章节之后，已全部过滤。请关闭防剧透或推进进度后再试。",
    };
  }
  if (!retrievalContext) {
    return {
      error: "未检索到可用于推断画风的正文片段，请确认本书已完成向量索引。",
    };
  }

  try {
    return await callBookStyleLlm({
      chat: cfg.chat,
      retrievalContext,
      fileTitle: args.fileTitle,
      signal: args.signal,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: msg || "推断画风失败" };
  }
}

export async function runCharacterPortraitExtract(
  cfg: AIConfig,
  args: PortraitExtractArgs,
): Promise<PortraitExtractResult | { error: string }> {
  const name = args.characterName.trim();
  if (!name) return { error: "请输入角色名" };
  if (!args.bookHash.trim())
    return { error: "当前书籍未就绪（缺少 bookHash）" };

  if (!cfg.embeddingEnabled) {
    return { error: "请先在「向量模型」中启用向量索引并构建本书索引。" };
  }

  const spoilerMaxChapterIndex =
    args.spoilerSafe && args.activeChapterIdx >= 0
      ? args.activeChapterIdx
      : null;

  const queries = portraitSearchQueries(name);
  if (queries.length === 0) return { error: "角色名无效" };

  let hits: AIIndexSearchHit[];
  try {
    hits = await mergedRagHitsForPortrait({
      bookHash: args.bookHash.trim(),
      aiConfig: cfg,
      queries,
      topKPerQuery: cfg.ragTopK,
      spoilerMaxChapterIndex,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: msg || "向量检索失败" };
  }

  const retrievalContext = buildRetrievalContext(hits);
  if (!retrievalContext && spoilerMaxChapterIndex != null) {
    return {
      error:
        "防剧透：检索到的片段均在当前阅读章节之后，已全部过滤，请关闭防剧透或推进阅读进度后再试。",
    };
  }
  if (!retrievalContext) {
    return {
      error:
        "未检索到与角色相关的正文片段，请确认本书已完成向量索引且角色名正确。",
    };
  }

  try {
    return await callPortraitLlm({
      chat: cfg.chat,
      characterName: name,
      retrievalContext,
      hits,
      signal: args.signal,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: msg || "生成摘录与 prompt 失败" };
  }
}

export type Txt2ImgToPathArgs = {
  txt2img: AITxt2ImgConfig;
  prompt: string;
  negativePrompt: string;
  outputPathAbsolute: string;
  /** 中止时中断文生图 fetch 与云端/ComfyUI 轮询 */
  signal?: AbortSignal;
};

/** 文生图并直接写入绝对路径（prompt 已由 adaptPortraitPromptForBackend 适配） */
export async function runTxt2ImgToAbsolutePath(
  opts: Txt2ImgToPathArgs,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { txt2img, prompt, negativePrompt, outputPathAbsolute, signal } = opts;
  if (!txt2img.enabled) {
    return {
      ok: false,
      error: "请先在设置 → 角色卡中启用文生图。",
    };
  }
  const out = path.resolve(outputPathAbsolute.trim());
  if (!path.isAbsolute(out)) {
    return { ok: false, error: "输出路径须为绝对路径" };
  }

  if (signal?.aborted) {
    return { ok: false, error: "已停止" };
  }

  const img = await fetchTxt2ImgImageBuffer(
    txt2img,
    prompt.trim(),
    negativePrompt.trim(),
    signal,
  );
  if (!img.ok) {
    return { ok: false, error: formatTxt2ImgStepError(img.error) };
  }

  try {
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, img.buffer);
    return { ok: true };
  } catch (e) {
    const w = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: `保存立绘文件：${w || "未知错误"}`,
    };
  }
}
