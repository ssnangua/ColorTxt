import type { ColorTxtArtifacts } from "./ebookTypes";
import { escapeEbookMarkerPayload } from "./ebookInternalLinkMarkers";
import { ChmArchive } from "./chm/chmArchive";
import { yieldToUi } from "./yieldToUi";

function extFromPath(p: string): string {
  const lower = p.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return ".jpg";
  if (lower.endsWith(".png")) return ".png";
  if (lower.endsWith(".gif")) return ".gif";
  if (lower.endsWith(".webp")) return ".webp";
  if (lower.endsWith(".bmp")) return ".bmp";
  if (lower.endsWith(".svg")) return ".svg";
  return "";
}

function resolveChmPath(currentPosix: string, href: string): string {
  const h = href.replace(/\\/g, "/").trim();
  if (!h || h.startsWith("#") || /^https?:\/\//i.test(h) || /^data:/i.test(h)) return "";
  const curDir = currentPosix.includes("/")
    ? currentPosix.slice(0, currentPosix.lastIndexOf("/"))
    : "";
  const raw = h.replace(/^\//, "");
  const parts = (curDir ? curDir.split("/") : []).concat(raw.split("/").filter(Boolean));
  const stack: string[] = [];
  for (const p of parts) {
    if (p === "." || p === "") continue;
    if (p === "..") {
      stack.pop();
      continue;
    }
    stack.push(p);
  }
  return stack.join("/");
}

function decodeBytesAsGbChinese(bytes: Uint8Array): string {
  for (const label of ["gb18030", "gbk"] as const) {
    try {
      return new TextDecoder(label, { fatal: false }).decode(bytes);
    } catch {
      /* 运行时不支持该编码标签时换下一个 */
    }
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

/**
 * 中文 CHM 的 .txt 多为 GBK/GB18030。用 UTF-8 宽松解码时，非法序列可能被凑成「合法」UTF-8，
 * 既不出现 \ufffd，汉字数也可能误判，整段仍会乱码。故先尝试 UTF-8 严格解码，失败再用国标。
 */
function decodeChmTxtBytes(bytes: Uint8Array): string {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(3));
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    /* 非合法 UTF-8，按中文电子书常见编码处理 */
  }
  return decodeBytesAsGbChinese(bytes);
}

/**
 * 不少中文 CHM 把章节做成 .txt，实为 document.write('...html...')。抽出引号内 HTML 再按 HTML 抽正文。
 */
function extractHtmlFromDocumentWriteJs(source: string): string | null {
  if (!/document\.write\s*\(/i.test(source)) return null;
  const parts: string[] = [];
  const s = source;
  let i = 0;
  while (i < s.length) {
    const low = s.slice(i).toLowerCase();
    const rel = low.indexOf("document.write");
    if (rel === -1) break;
    let p = i + rel + 14;
    while (p < s.length && /\s/.test(s[p]!)) p++;
    if (s[p] !== "(") {
      i = i + rel + 1;
      continue;
    }
    p++;
    while (p < s.length && /\s/.test(s[p]!)) p++;
    const q = s[p];
    if (q !== "'" && q !== '"') {
      i = i + rel + 1;
      continue;
    }
    p++;
    let frag = "";
    while (p < s.length) {
      const c = s[p]!;
      if (c === "\\") {
        p++;
        if (p < s.length) frag += s[p]!;
        p++;
        continue;
      }
      if (c === q) {
        p++;
        break;
      }
      frag += c;
      p++;
    }
    if (frag.trim()) parts.push(frag);
    i = p;
  }
  return parts.length > 0 ? parts.join("\n") : null;
}

type ImgCtx = {
  imagesFolderRel: string;
  imageWrites: Array<{ relativePath: string; data: ArrayBuffer }>;
  usedRelKeys: Set<string>;
};

function allocImageRel(ctx: ImgCtx, stem: string, ext: string): string {
  const safeStem = stem.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "_").replace(/^\.+/, "") || "image";
  const base = `${safeStem}${ext}`;
  let rel = "";
  const dot = base.lastIndexOf(".");
  const stem0 = dot > 0 ? base.slice(0, dot) : base;
  const ext0 = dot > 0 ? base.slice(dot) : "";
  for (let n = 0; ; n += 1) {
    const fname = n === 0 ? base : `${stem0}_${n}${ext0}`;
    const tryRel = `${ctx.imagesFolderRel}/${fname}`;
    if (!ctx.usedRelKeys.has(tryRel.toLowerCase())) {
      rel = tryRel;
      break;
    }
  }
  ctx.usedRelKeys.add(rel.toLowerCase());
  return rel;
}

function flushTextAcc(acc: string, out: string[]): void {
  const t = acc.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  if (t) out.push(t);
}

function walkChmHtmlNode(
  node: Node,
  topicPathPosix: string,
  chm: ChmArchive,
  ctx: ImgCtx,
  out: string[],
  acc: { text: string },
): void {
  if (node.nodeType === Node.TEXT_NODE) {
    acc.text += node.textContent ?? "";
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  if (tag === "script" || tag === "style" || tag === "noscript") return;
  if (tag === "br" || tag === "hr") {
    flushTextAcc(acc.text, out);
    acc.text = "";
    return;
  }
  if (tag === "img") {
    flushTextAcc(acc.text, out);
    acc.text = "";
    const src = el.getAttribute("src")?.trim();
    if (src) {
      const resolved = resolveChmPath(topicPathPosix, src);
      if (resolved) {
        const ent = chm.getEntry(resolved);
        if (ent && ent.length > 0) {
          try {
            const data = chm.readFile(ent);
            const ext = extFromPath(resolved) || ".bin";
            const rel = allocImageRel(ctx, resolved.replace(/\.[^./]+$/, "") || "img", ext);
            const copy = new Uint8Array(data.length);
            copy.set(data);
            ctx.imageWrites.push({ relativePath: rel, data: copy.buffer });
            out.push(`<<IMG:${escapeEbookMarkerPayload(rel)}>>`);
          } catch {
            /* skip */
          }
        }
      }
    }
    return;
  }
  if (
    tag === "p" ||
    tag === "div" ||
    tag === "li" ||
    tag === "tr" ||
    tag === "h1" ||
    tag === "h2" ||
    tag === "h3" ||
    tag === "h4" ||
    tag === "h5" ||
    tag === "h6" ||
    tag === "blockquote" ||
    tag === "section" ||
    tag === "article" ||
    tag === "header" ||
    tag === "footer" ||
    tag === "pre" ||
    tag === "table" ||
    tag === "ul" ||
    tag === "ol"
  ) {
    for (const c of el.childNodes) walkChmHtmlNode(c, topicPathPosix, chm, ctx, out, acc);
    flushTextAcc(acc.text, out);
    acc.text = "";
    return;
  }
  for (const c of el.childNodes) walkChmHtmlNode(c, topicPathPosix, chm, ctx, out, acc);
}

function htmlTopicToLines(
  html: string,
  topicPathPosix: string,
  chm: ChmArchive,
  ctx: ImgCtx,
  out: string[],
): void {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const body = doc.body;
  if (!body) return;

  const acc = { text: "" };
  for (const c of body.childNodes) {
    walkChmHtmlNode(c, topicPathPosix, chm, ctx, out, acc);
  }
  flushTextAcc(acc.text, out);
}

export async function convertChmToArtifacts(
  buffer: ArrayBuffer,
  outputBase: string,
): Promise<ColorTxtArtifacts> {
  const chm = new ChmArchive(buffer);
  const topics = chm.files
    .filter((f) => {
      if (f.name.startsWith("::")) return false;
      const posix = f.name.replace(/\\/g, "/").trim();
      return /^\/?txt\/.+\.txt$/i.test(posix);
    })
    .sort((a, b) =>
      a.name
        .replace(/\\/g, "/")
        .toLowerCase()
        .localeCompare(b.name.replace(/\\/g, "/").toLowerCase(), undefined, {
          sensitivity: "base",
        }),
    );

  if (topics.length === 0) {
    throw new Error("CHM 中未找到 txt 目录下的 .txt 正文文件。");
  }

  const imagesFolderRel = `${outputBase}.Images`;
  const ctx: ImgCtx = {
    imagesFolderRel,
    imageWrites: [],
    usedRelKeys: new Set<string>(),
  };

  const lines: string[] = [];

  for (const topic of topics) {
    await yieldToUi();
    const posix = topic.name.replace(/\\/g, "/");
    let bytes: Uint8Array;
    try {
      bytes = chm.readFile(topic);
    } catch {
      continue;
    }
    if (bytes.length === 0) continue;

    const text = decodeChmTxtBytes(bytes);
    const htmlFromJs = extractHtmlFromDocumentWriteJs(text);
    if (htmlFromJs !== null) {
      htmlTopicToLines(htmlFromJs, posix, chm, ctx, lines);
    } else {
      for (const line of text.split(/\r?\n/)) {
        const t = line.replace(/\u00a0/g, " ").trim();
        if (t) lines.push(t);
      }
    }
    lines.push("");
  }

  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  const utf8 = `${lines.join("\n")}\n`;
  const imgs = ctx.imageWrites;
  return {
    utf8,
    imageWrites: imgs.length > 0 ? imgs : undefined,
  };
}
