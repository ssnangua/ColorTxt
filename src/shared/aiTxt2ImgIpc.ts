/**
 * 主进程统一通道 `ai:txt2img` 的请求 / 响应类型（preload / renderer 与主进程对齐）。
 * 新增 A1111 查询类能力时在此扩展 `AiTxt2ImgOp` 与 `AiTxt2ImgInvokeResult`。
 */

export type AiTxt2ImgOp =
  | "listA1111Samplers"
  | "listA1111Upscalers"
  | "listA1111SdModels"
  | "testConnection";

export type AiTxt2ImgInvokeDraft = {
  op: AiTxt2ImgOp;
  /** WebUI 根地址，如 http://127.0.0.1:7860 */
  apiBaseUrl?: string;
  backend?: string;
  apiKey?: string;
  cloudModel?: string;
};

export type AiTxt2ImgInvokeResult =
  | { ok: true; op: "listA1111Samplers"; samplers: string[] }
  | { ok: true; op: "listA1111Upscalers"; upscalers: string[] }
  | { ok: true; op: "listA1111SdModels"; sdModels: string[] }
  | { ok: true; op: "testConnection" }
  | { ok: false; error: string };
