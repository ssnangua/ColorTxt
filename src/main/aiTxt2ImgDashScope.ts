import type { AITxt2ImgConfig } from "@shared/aiTypes";
import {
  usesDashScopeWan26ImageApi,
  usesDashScopeWanHighResSize,
} from "@shared/txt2ImgCloudModelPresets";
import {
  dashScopeWanxSizeString,
  resolveTxt2ImgSize,
  TXT2IMG_DEFAULT_CLOUD_MODEL,
} from "@shared/txt2ImgBackend";
import {
  bufferFromImageUrl,
  errorFromTxt2ImgCatch,
  normalizeTxt2ImgBase,
  requireTxt2ImgApiKey,
  sleepAbortable,
} from "./aiTxt2ImgShared";

const WANX_LEGACY_CREATE_PATH =
  "/api/v1/services/aigc/text2image/image-synthesis";
const WANX_V26_CREATE_PATH =
  "/api/v1/services/aigc/image-generation/generation";

function resolveWanxModel(txt2img: AITxt2ImgConfig): string {
  const m = txt2img.cloudModel.trim();
  return m || TXT2IMG_DEFAULT_CLOUD_MODEL.dashscope_wanx;
}

function wanxApiRoot(txt2img: AITxt2ImgConfig): string {
  const custom = normalizeTxt2ImgBase(txt2img.apiBaseUrl.trim());
  if (custom) return custom;
  return "https://dashscope.aliyuncs.com";
}

function mapDashScopeHighResSizeString(width: number, height: number): string {
  const w = Math.max(64, Math.floor(width) || 1280);
  const h = Math.max(64, Math.floor(height) || 1280);
  const ratio = w / h;
  if (ratio > 1.2) return "1696*960";
  if (ratio < 0.85) return "960*1696";
  if (ratio > 1.05) return "1472*1104";
  if (ratio < 0.95) return "1104*1472";
  return "1280*1280";
}

function resolveDashScopeSizeString(
  model: string,
  width: number,
  height: number,
): string {
  if (usesDashScopeWanHighResSize(model)) {
    return mapDashScopeHighResSizeString(width, height);
  }
  const size = resolveTxt2ImgSize("dashscope_wanx", width, height);
  return dashScopeWanxSizeString(size);
}

function buildDashScopeCreateRequest(
  model: string,
  prompt: string,
  size: string,
): { path: string; body: Record<string, unknown> } {
  if (usesDashScopeWan26ImageApi(model)) {
    return {
      path: WANX_V26_CREATE_PATH,
      body: {
        model,
        input: {
          messages: [
            {
              role: "user",
              content: [{ text: prompt.trim() }],
            },
          ],
        },
        parameters: {
          size,
          n: 1,
          watermark: false,
        },
      },
    };
  }
  return {
    path: WANX_LEGACY_CREATE_PATH,
    body: {
      model,
      input: { prompt: prompt.trim() },
      parameters: {
        size,
        n: 1,
      },
    },
  };
}

function extractTaskId(json: unknown): string {
  if (!json || typeof json !== "object") return "";
  const o = json as Record<string, unknown>;
  const out = o.output;
  if (out && typeof out === "object") {
    const taskId = (out as Record<string, unknown>).task_id;
    if (typeof taskId === "string" && taskId.trim()) return taskId.trim();
  }
  if (typeof o.task_id === "string" && o.task_id.trim()) return o.task_id.trim();
  return "";
}

function extractImageUrlFromTask(json: unknown): string {
  if (!json || typeof json !== "object") return "";
  const o = json as Record<string, unknown>;
  const out = o.output;
  if (!out || typeof out !== "object") return "";
  const outRec = out as Record<string, unknown>;

  const results = outRec.results;
  if (Array.isArray(results) && results[0] && typeof results[0] === "object") {
    const url = (results[0] as Record<string, unknown>).url;
    if (typeof url === "string" && url.trim()) return url.trim();
  }

  const choices = outRec.choices;
  if (Array.isArray(choices)) {
    for (const choice of choices) {
      if (!choice || typeof choice !== "object") continue;
      const message = (choice as Record<string, unknown>).message;
      if (!message || typeof message !== "object") continue;
      const content = (message as Record<string, unknown>).content;
      if (!Array.isArray(content)) continue;
      for (const part of content) {
        if (!part || typeof part !== "object") continue;
        const rec = part as Record<string, unknown>;
        const image = rec.image;
        if (typeof image === "string" && image.trim()) return image.trim();
        const url = rec.url;
        if (typeof url === "string" && url.trim()) return url.trim();
      }
    }
  }

  const taskStatus = outRec.task_status;
  if (taskStatus === "FAILED") {
    const msg = outRec.message;
    if (typeof msg === "string" && msg.trim()) throw new Error(msg.trim());
    throw new Error("通义万相任务失败");
  }
  return "";
}

export async function fetchDashScopeWanxImageBuffer(
  txt2img: AITxt2ImgConfig,
  prompt: string,
  signal?: AbortSignal,
): Promise<{ ok: true; buffer: Buffer } | { ok: false; error: string }> {
  const keyR = requireTxt2ImgApiKey(txt2img.apiKey, "通义万相");
  if (!keyR.ok) return keyR;

  const root = wanxApiRoot(txt2img);
  const model = resolveWanxModel(txt2img);
  const size = resolveDashScopeSizeString(
    model,
    txt2img.width,
    txt2img.height,
  );
  const { path, body } = buildDashScopeCreateRequest(model, prompt, size);
  const createUrl = `${root}${path}`;

  let taskId = "";
  try {
    const res = await fetch(createUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${keyR.key}`,
        "X-DashScope-Async": "enable",
      },
      body: JSON.stringify(body),
      signal,
    });
    const raw = await res.text().catch(() => "");
    if (!res.ok) {
      return {
        ok: false,
        error: `通义万相 HTTP ${res.status}: ${raw.slice(0, 400)}`,
      };
    }
    let json: unknown;
    try {
      json = JSON.parse(raw) as unknown;
    } catch {
      return { ok: false, error: "通义万相返回非 JSON" };
    }
    taskId = extractTaskId(json);
    if (!taskId) {
      return {
        ok: false,
        error: `通义万相未返回 task_id：${raw.slice(0, 300)}`,
      };
    }
  } catch (e) {
    return { ok: false, error: errorFromTxt2ImgCatch(e) };
  }

  const taskUrl = `${root}/api/v1/tasks/${encodeURIComponent(taskId)}`;

  for (let i = 0; i < 120; i++) {
    try {
      await sleepAbortable(800, signal);
    } catch (e) {
      return { ok: false, error: errorFromTxt2ImgCatch(e) };
    }
    try {
      const res = await fetch(taskUrl, {
        headers: { Authorization: `Bearer ${keyR.key}` },
        signal,
      });
      const raw = await res.text().catch(() => "");
      if (!res.ok) continue;
      let json: unknown;
      try {
        json = JSON.parse(raw) as unknown;
      } catch {
        continue;
      }
      let imgUrl = "";
      try {
        imgUrl = extractImageUrlFromTask(json);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false, error: `通义万相：${msg}` };
      }
      if (imgUrl) {
        const dl = await bufferFromImageUrl(imgUrl, signal);
        if (!dl.ok) return { ok: false, error: `通义万相：${dl.error}` };
        return dl;
      }
    } catch (e) {
      return { ok: false, error: errorFromTxt2ImgCatch(e) };
    }
  }

  return {
    ok: false,
    error: "通义万相在等待时间内未完成，请稍后重试或检查模型与配额。",
  };
}
