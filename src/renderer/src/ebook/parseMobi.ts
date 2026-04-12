/**
 * MOBI → ColorTxt 正文与插图：基于 foliate-js 的 mobi.js 解析 PDB/MOBI6/KF8，
 * 再抽取为纯文本行与 <<IMG:…>>（与 EPUB 转换约定一致）。
 */
import { inflate } from "pako";
import { MOBI, isMOBI } from "./mobi/foliateMobi.js";
import { escapeEbookMarkerPayload } from "./ebookInternalLinkMarkers";
import { yieldToUi } from "./yieldToUi";
import type { ColorTxtArtifacts } from "./ebookTypes";

/** 与 PDB `slice` / `arrayBuffer` 接口兼容 */
class ArrayBufferMobiFile {
  constructor(private readonly buf: ArrayBuffer) {}

  slice(start: number, end?: number) {
    const lo = Math.max(0, start);
    const hi =
      end === undefined ? this.buf.byteLength : Math.min(this.buf.byteLength, end);
    const part = this.buf.slice(lo, hi);
    return {
      arrayBuffer: () => Promise.resolve(part),
    };
  }
}

type InnerMobi = {
  loadResource(index: number): Promise<ArrayBuffer>;
};

type OpenedMobiBook = {
  mobi: InnerMobi;
  sections: Array<{ createDocument?: () => Promise<Document> }>;
  metadata?: { title?: string };
  destroy?: () => void;
};

type MobiImageCtx = {
  imagesFolderRel: string;
  imageWrites: Array<{ relativePath: string; data: ArrayBuffer }>;
  usedRelKeys: Set<string>;
  exportedByKey: Map<string, string>;
  seq: number;
};

function normalizeSpace(s: string): string {
  return s.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function sniffImageExt(u8: Uint8Array): string {
  if (u8.length >= 2 && u8[0] === 0xff && u8[1] === 0xd8) return ".jpg";
  if (
    u8.length >= 8 &&
    u8[0] === 0x89 &&
    u8[1] === 0x50 &&
    u8[2] === 0x4e &&
    u8[3] === 0x47
  ) {
    return ".png";
  }
  if (u8.length >= 6 && u8[0] === 0x47 && u8[1] === 0x49 && u8[2] === 0x46) {
    return ".gif";
  }
  if (
    u8.length >= 12 &&
    u8[0] === 0x52 &&
    u8[1] === 0x49 &&
    u8[2] === 0x46 &&
    u8[8] === 0x57 &&
    u8[9] === 0x45 &&
    u8[10] === 0x42 &&
    u8[11] === 0x50
  ) {
    return ".webp";
  }
  return ".bin";
}

function asArrayBuffer(buf: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (buf instanceof ArrayBuffer) return buf;
  const u = buf;
  const out = new ArrayBuffer(u.byteLength);
  new Uint8Array(out).set(u);
  return out;
}

function isNonImageResourceMagic(u8: Uint8Array): boolean {
  if (u8.byteLength < 4) return false;
  const m = String.fromCharCode(u8[0]!, u8[1]!, u8[2]!, u8[3]!);
  return m === "FONT" || m === "VIDE" || m === "AUDI" || m === "RESC" || m === "PAGE";
}

/** recindex / kindle:embed 偶发指向非二进制图（如内嵌 HTML），避免当图片落盘 */
function looksLikeMarkupNotImage(u8: Uint8Array): boolean {
  const n = Math.min(64, u8.byteLength);
  let head = "";
  for (let i = 0; i < n; i++) head += String.fromCharCode(u8[i]!);
  const t = head.trimStart().toLowerCase();
  return (
    t.startsWith("<!doctype") ||
    t.startsWith("<?xml") ||
    t.startsWith("<html") ||
    t.startsWith("<body") ||
    t.startsWith("<div")
  );
}

async function pushImageFromBuffer(
  data: ArrayBuffer,
  dedupeKey: string,
  ctx: MobiImageCtx,
  out: string[],
): Promise<void> {
  if (data.byteLength === 0) return;
  const u8 = new Uint8Array(data);
  if (isNonImageResourceMagic(u8)) return;
  if (looksLikeMarkupNotImage(u8)) return;

  const existing = ctx.exportedByKey.get(dedupeKey);
  if (existing) {
    out.push(`<<IMG:${escapeEbookMarkerPayload(existing)}>>`);
    return;
  }

  const ext = sniffImageExt(u8);
  let rel = "";
  for (let n = ctx.seq; ; n += 1) {
    const fname = `img_${n}${ext}`;
    const tryRel = `${ctx.imagesFolderRel}/${fname}`;
    if (!ctx.usedRelKeys.has(tryRel.toLowerCase())) {
      rel = tryRel;
      ctx.seq = n + 1;
      break;
    }
  }
  ctx.usedRelKeys.add(rel.toLowerCase());
  ctx.exportedByKey.set(dedupeKey, rel);
  ctx.imageWrites.push({ relativePath: rel, data });
  out.push(`<<IMG:${escapeEbookMarkerPayload(rel)}>>`);
}

async function handleMobiImageElement(
  el: Element,
  out: string[],
  ctx: MobiImageCtx,
  innerMobi: InnerMobi,
): Promise<void> {
  const recindex = el.getAttribute("recindex")?.trim();
  const src = el.getAttribute("src")?.trim() ?? "";

  let buf: ArrayBuffer | null = null;
  let dedupeKey = "";

  if (recindex && /^\d+$/.test(recindex)) {
    dedupeKey = `rec:${recindex}`;
    try {
      buf = asArrayBuffer(await innerMobi.loadResource(Number(recindex) - 1));
    } catch {
      buf = null;
    }
  } else if (/^kindle:/i.test(src)) {
    const km = src.match(/^kindle:(flow|embed):(\w+)/i);
    if (!km) return;
    if (km[1]!.toLowerCase() === "flow") return;
    const id = parseInt(km[2]!, 32);
    if (!Number.isFinite(id)) return;
    dedupeKey = `kid:${id}`;
    try {
      buf = asArrayBuffer(await innerMobi.loadResource(id - 1));
    } catch {
      buf = null;
    }
  }

  if (!buf) return;
  await pushImageFromBuffer(buf, dedupeKey, ctx, out);
}

async function flushParagraph(acc: { text: string }, out: string[]): Promise<void> {
  const raw = normalizeSpace(acc.text);
  acc.text = "";
  if (raw.length > 0) out.push(raw);
}

async function walkMobiBlock(
  el: Element,
  out: string[],
  acc: { text: string },
  ctx: MobiImageCtx,
  innerMobi: InnerMobi,
): Promise<void> {
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      acc.text += node.textContent ?? "";
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const child = node as Element;
    const tag = child.tagName.toLowerCase();
    if (tag === "script" || tag === "style" || tag === "noscript") continue;

    if (tag === "img" || tag === "image") {
      await flushParagraph(acc, out);
      await handleMobiImageElement(child, out, ctx, innerMobi);
      continue;
    }
    if (tag === "br" || tag === "hr") {
      acc.text += " ";
      continue;
    }
    if (tag === "a") {
      const href = child.getAttribute("href")?.trim() ?? "";
      const label = normalizeSpace(child.textContent ?? "");
      if (/^https?:\/\//i.test(href)) {
        await flushParagraph(acc, out);
        out.push(label.length > 0 ? `${label}（${href}）` : href);
      } else if (label.length > 0) {
        acc.text += label;
      }
      continue;
    }

    if (
      tag === "p" ||
      tag === "h1" ||
      tag === "h2" ||
      tag === "h3" ||
      tag === "h4" ||
      tag === "h5" ||
      tag === "h6" ||
      tag === "blockquote" ||
      tag === "li" ||
      tag === "dd" ||
      tag === "dt"
    ) {
      await flushParagraph(acc, out);
      await walkMobiBlock(child, out, acc, ctx, innerMobi);
      await flushParagraph(acc, out);
      continue;
    }

    if (
      tag === "div" ||
      tag === "section" ||
      tag === "article" ||
      tag === "center" ||
      tag === "span" ||
      tag === "table" ||
      tag === "tbody" ||
      tag === "tr" ||
      tag === "td" ||
      tag === "th" ||
      tag === "font" ||
      tag === "b" ||
      tag === "strong" ||
      tag === "i" ||
      tag === "em"
    ) {
      await walkMobiBlock(child, out, acc, ctx, innerMobi);
      continue;
    }

    await walkMobiBlock(child, out, acc, ctx, innerMobi);
  }
}

async function mobiBodyToLines(
  body: HTMLElement,
  ctx: MobiImageCtx,
  innerMobi: InnerMobi,
): Promise<string[]> {
  const out: string[] = [];
  const acc = { text: "" };
  await walkMobiBlock(body, out, acc, ctx, innerMobi);
  await flushParagraph(acc, out);
  return out;
}

function unzlibForMobi(data: Uint8Array): Uint8Array {
  try {
    return inflate(data);
  } catch {
    try {
      return inflate(data, { windowBits: 15 });
    } catch {
      return inflate(data, { raw: true });
    }
  }
}

export async function convertMobiToArtifacts(
  buffer: ArrayBuffer,
  outputBase: string,
): Promise<ColorTxtArtifacts> {
  const file = new ArrayBufferMobiFile(buffer);
  if (!(await isMOBI(file))) {
    throw new Error("不是有效的 MOBI（BOOKMOBI）文件。");
  }

  const mobi = new MOBI({ unzlib: unzlibForMobi });
  const book = (await mobi.open(file)) as OpenedMobiBook;
  const innerMobi = book.mobi;

  const imagesFolderRel = `${outputBase}.Images`;
  const ctx: MobiImageCtx = {
    imagesFolderRel,
    imageWrites: [],
    usedRelKeys: new Set(),
    exportedByKey: new Map(),
    seq: 0,
  };

  const lines: string[] = [];

  try {
    const title = book.metadata?.title?.trim();
    if (title) {
      lines.push(title, "");
    }

    for (const sec of book.sections) {
      if (!sec || typeof sec.createDocument !== "function") continue;
      let doc: Document;
      try {
        doc = await sec.createDocument();
      } catch {
        continue;
      }
      const perr = doc.querySelector("parsererror");
      if (perr) continue;
      const body = doc.querySelector("body");
      if (!body) continue;

      const chunk = await mobiBodyToLines(body, ctx, innerMobi);
      for (const ln of chunk) {
        if (ln.trim().length > 0) lines.push(ln);
      }
      lines.push("");
      await yieldToUi();
    }

    const utf8 = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
    const out: ColorTxtArtifacts = { utf8 };
    if (ctx.imageWrites.length > 0) {
      out.imageWrites = ctx.imageWrites;
    }
    return out;
  } finally {
    try {
      book.destroy?.();
    } catch {
      // ignore
    }
  }
}
