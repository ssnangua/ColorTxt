import type { AITxt2ImgConfig } from "@shared/aiTypes";
import {
  errorFromTxt2ImgCatch,
  escapeJsonStrInner,
  isFetchAborted,
  normalizeTxt2ImgBase,
  sleepAbortable,
} from "./aiTxt2ImgShared";

const COMFYUI_PROMPT_HTTP_PATH = "/prompt";

function extractFirstOutputImage(meta: unknown): {
  filename: string;
  subfolder: string;
  type: string;
} | null {
  if (!meta || typeof meta !== "object") return null;
  const outputs = (meta as Record<string, unknown>).outputs;
  if (!outputs || typeof outputs !== "object") return null;
  for (const nodeOut of Object.values(outputs as Record<string, unknown>)) {
    if (!nodeOut || typeof nodeOut !== "object") continue;
    const images = (nodeOut as Record<string, unknown>).images;
    if (!Array.isArray(images) || images.length === 0) continue;
    const im = images[0];
    if (!im || typeof im !== "object") continue;
    const fn = (im as Record<string, unknown>).filename;
    if (typeof fn !== "string" || !fn.trim()) continue;
    const subfolderRaw = (im as Record<string, unknown>).subfolder;
    const typeRaw = (im as Record<string, unknown>).type;
    return {
      filename: fn.trim(),
      subfolder:
        typeof subfolderRaw === "string" ? subfolderRaw.trim() : "",
      type:
        typeof typeRaw === "string" && typeRaw.trim()
          ? typeRaw.trim()
          : "output",
    };
  }
  return null;
}

export async function fetchComfyUIImageBuffer(
  txt2img: AITxt2ImgConfig,
  prompt: string,
  negativePrompt: string,
  signal?: AbortSignal,
): Promise<{ ok: true; buffer: Buffer } | { ok: false; error: string }> {
  const template = txt2img.comfyWorkflowJson.trim();
  if (!template) {
    return {
      ok: false,
      error:
        "ComfyUI 需在设置中粘贴「导出（API）」工作流 JSON，并在文本字段中使用 __PROMPT__、__NEGATIVE__ 等占位符。",
    };
  }

  const base = normalizeTxt2ImgBase(txt2img.apiBaseUrl.trim());
  if (!base) return { ok: false, error: "txt2img.apiBaseUrl 为空" };

  const seedNum =
    typeof txt2img.seed === "number" && Number.isFinite(txt2img.seed)
      ? txt2img.seed
      : -1;
  const resolvedSeed =
    seedNum >= 0 ? Math.floor(seedNum) : Math.floor(Math.random() * 2_147_483_647);

  let workflowStr = template
    .replace(/__PROMPT__/g, escapeJsonStrInner(prompt.trim()))
    .replace(/__NEGATIVE__/g, escapeJsonStrInner(negativePrompt.trim()))
    .replace(/__SEED__/g, String(resolvedSeed))
    .replace(/__WIDTH__/g, String(txt2img.width))
    .replace(/__HEIGHT__/g, String(txt2img.height))
    .replace(/__STEPS__/g, String(txt2img.steps))
    .replace(/__CFG__/g, String(txt2img.cfgScale));

  let workflow: unknown;
  try {
    workflow = JSON.parse(workflowStr) as unknown;
  } catch {
    return {
      ok: false,
      error:
        "ComfyUI 工作流 JSON 解析失败。请确认占位符替换后仍为合法 JSON（若 prompt 中含引号需放在 __PROMPT__ 占位处）。",
    };
  }

  const queueUrl = `${base}${COMFYUI_PROMPT_HTTP_PATH}`;
  const clientId = `colortxt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  let promptId: string;
  try {
    const qRes = await fetch(queueUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: workflow,
        client_id: clientId,
      }),
      signal,
    });
    const qRaw = await qRes.text().catch(() => "");
    if (!qRes.ok) {
      return {
        ok: false,
        error: `ComfyUI 队列 HTTP ${qRes.status}: ${qRaw.slice(0, 400)}`,
      };
    }
    let qJson: unknown;
    try {
      qJson = JSON.parse(qRaw) as unknown;
    } catch {
      return { ok: false, error: "ComfyUI 队列返回非 JSON" };
    }
    const pid =
      qJson &&
      typeof qJson === "object" &&
      typeof (qJson as Record<string, unknown>).prompt_id === "string"
        ? String((qJson as Record<string, unknown>).prompt_id).trim()
        : "";
    if (!pid) {
      return {
        ok: false,
        error: `ComfyUI 未返回 prompt_id：${qRaw.slice(0, 300)}`,
      };
    }
    promptId = pid;
  } catch (e) {
    return { ok: false, error: errorFromTxt2ImgCatch(e) };
  }

  const histUrl = `${base}/history/${encodeURIComponent(promptId)}`;
  let imageRef: { filename: string; subfolder: string; type: string } | null =
    null;

  for (let i = 0; i < 140; i++) {
    try {
      await sleepAbortable(450, signal);
    } catch (e) {
      return { ok: false, error: errorFromTxt2ImgCatch(e) };
    }
    try {
      const hRes = await fetch(histUrl, { signal });
      const hRaw = await hRes.text().catch(() => "");
      if (!hRes.ok) continue;
      let hJson: unknown;
      try {
        hJson = JSON.parse(hRaw) as unknown;
      } catch {
        continue;
      }
      const entry =
        hJson &&
        typeof hJson === "object" &&
        (hJson as Record<string, unknown>)[promptId];
      imageRef = extractFirstOutputImage(entry);
      if (imageRef) break;
      const status =
        entry &&
        typeof entry === "object" &&
        (entry as Record<string, unknown>).status;
      const completed =
        status &&
        typeof status === "object" &&
        (status as Record<string, unknown>).completed === false;
      if (completed === false) continue;
    } catch (e) {
      if (isFetchAborted(e)) {
        return { ok: false, error: "已停止" };
      }
    }
  }

  if (!imageRef) {
    return {
      ok: false,
      error:
        "ComfyUI 在等待时间内未完成或无图像输出。请检查工作流是否包含 SaveImage / Preview 等输出节点，或增大服务端超时。",
    };
  }

  const qs = new URLSearchParams({
    filename: imageRef.filename,
    subfolder: imageRef.subfolder,
    type: imageRef.type,
  });
  const viewUrl = `${base}/view?${qs.toString()}`;

  try {
    const vRes = await fetch(viewUrl, { signal });
    if (!vRes.ok) {
      const t = await vRes.text().catch(() => "");
      return {
        ok: false,
        error: `读取 ComfyUI 输出图 HTTP ${vRes.status}: ${t.slice(0, 200)}`,
      };
    }
    const arr = await vRes.arrayBuffer();
    const buf = Buffer.from(arr);
    if (buf.length < 32) return { ok: false, error: "ComfyUI 输出图过小" };
    return { ok: true, buffer: buf };
  } catch (e) {
    return { ok: false, error: errorFromTxt2ImgCatch(e) };
  }
}
