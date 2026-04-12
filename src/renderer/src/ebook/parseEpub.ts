import JSZip from "jszip";
import type { ColorTxtArtifacts } from "./ebookTypes";
import { escapeEbookMarkerPayload } from "./ebookInternalLinkMarkers";
import { yieldToUi } from "./yieldToUi";

/** 外链写入正文（与脚注+尾注块不同，避免与 EPUB 内链 `<<A:…>>` 重复） */
function appendExternalHttpLink(
  acc: { text: string },
  label: string,
  href: string,
): void {
  const l = label.replace(/\s+/g, " ").trim();
  acc.text += l.length > 0 ? `${l}（${href}）` : href;
}

function parseXml(doc: Document, selector: string, attr: string): string | null {
  const el = doc.querySelector(selector);
  const v = el?.getAttribute(attr);
  return v && v.trim() ? v.trim() : null;
}

/**
 * 将「当前 XHTML 在 ZIP 内的目录」为基准，解析 href 得到 ZIP 内 posix 路径。
 * 必须用章节所在目录（如 OEBPS/Text），不能用 OPF 目录；否则 ../Images/… 会错到包根下。
 */
function resolveInZip(htmlDirInZip: string, href: string): string {
  const pathOnly = href.split("#")[0]!.trim();
  const stack = htmlDirInZip.replace(/^\//, "").split("/").filter(Boolean);
  for (const seg of pathOnly.split("/")) {
    if (seg === "..") {
      if (stack.length > 0) stack.pop();
      continue;
    }
    if (seg && seg !== ".") stack.push(seg);
  }
  return stack.join("/");
}

/** ZIP 内路径 → 内链键用「仅文件名 + # + 片段」，与 EPUB 里 `href="part.xhtml#id"` 一致，避免冗长 `OEBPS/Text/…` */
function epubLinkKeyFromZipPath(zipPath: string): string {
  const norm = zipPath.replace(/\\/g, "/").trim();
  const seg = norm.split("/").pop();
  return seg && seg.length > 0 ? seg : norm;
}

/** 元素 `id` 属性 → 锚点键 `文件名#id` */
function makeEpubElementAnchorId(
  currentDocZipPath: string,
  idAttr: string,
): string {
  return `${epubLinkKeyFromZipPath(currentDocZipPath)}#${idAttr.trim()}`;
}

/** 有锚点 id 时返回 `<<ID:文件名#id>>`，否则 `""`（与 `<<A:…|目标>>` 成对） */
function anchorIdMarkerText(
  currentDocZipPath: string,
  rawId: string | null | undefined,
): string {
  const idAttr = rawId?.trim();
  if (!idAttr) return "";
  return `<<ID:${escapeEbookMarkerPayload(makeEpubElementAnchorId(currentDocZipPath, idAttr))}>>`;
}

/**
 * 内链 `a[href]` → `<<A:…|…>>` 目标串（`文件名#片段`）。
 * `http(s):`、`mailto:` 等返回 null（不输出 A 标记）。
 */
function resolveEpubInternalLinkTargetId(
  href: string,
  htmlDirInZip: string,
  currentDocZipPath: string,
): string | null {
  const h = href.trim();
  if (!h || /^https?:\/\//i.test(h) || /^mailto:/i.test(h) || /^tel:/i.test(h)) {
    return null;
  }
  const hashIdx = h.indexOf("#");
  const pathPart = hashIdx >= 0 ? h.slice(0, hashIdx).trim() : h.trim();
  const frag = hashIdx >= 0 ? h.slice(hashIdx + 1) : "";

  if (!pathPart) {
    if (hashIdx < 0) return null;
    return `${epubLinkKeyFromZipPath(currentDocZipPath)}#${frag}`;
  }
  const resolvedPath = resolveInZip(htmlDirInZip, pathPart);
  if (!frag) return null;
  return `${epubLinkKeyFromZipPath(resolvedPath)}#${frag}`;
}

/** ZIP 内路径大小写与打包工具不一致时仍能命中 */
function findZipFile(zip: JSZip, posixPath: string): JSZip.JSZipObject | null {
  const want = posixPath.replace(/\\/g, "/").replace(/^\/+/, "");
  const direct = zip.file(want);
  if (direct) return direct;
  const low = want.toLowerCase();
  for (const name of Object.keys(zip.files)) {
    const n = name.replace(/\\/g, "/").replace(/^\/+/, "");
    if (n.toLowerCase() === low) return zip.files[name] ?? null;
  }
  return null;
}

type EpubImageContext = {
  zip: JSZip;
  imagesFolderRel: string;
  imageWrites: Array<{ relativePath: string; data: ArrayBuffer }>;
  /** 输出相对路径（小写）是否已被占用（不同 zip 路径撞到同名文件时） */
  usedRelKeys: Set<string>;
  /** ZIP 内路径键 → 已导出的 `<<IMG:…>>` 相对路径；多处以同一文件为 src 时只落盘一次 */
  exportedImageByZipKey: Map<string, string>;
};

function getImgHref(el: Element): string {
  const src = el.getAttribute("src")?.trim();
  if (src) return src;
  const xlink = el.getAttributeNS("http://www.w3.org/1999/xlink", "href");
  if (xlink?.trim()) return xlink.trim();
  const href = el.getAttribute("href")?.trim();
  return href ?? "";
}

function safeImageFileBaseFromZipPath(zipPath: string): string {
  const seg = zipPath.replace(/\\/g, "/").split("/").pop() ?? "image.bin";
  const cleaned = seg
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "_")
    .replace(/^\.+/, "");
  return cleaned.length > 0 ? cleaned : "image.bin";
}

async function appendImageLineFromHref(
  zip: JSZip,
  htmlDirInZip: string,
  href: string,
  ctx: EpubImageContext,
  out: string[],
): Promise<void> {
  const pathOnly = href.split("#")[0]!.trim();
  if (!pathOnly) return;
  if (/^https?:\/\//i.test(pathOnly) || /^data:/i.test(pathOnly)) return;
  const zipPath = resolveInZip(htmlDirInZip, pathOnly);
  const lowPath = zipPath.toLowerCase();
  if (!/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(lowPath)) return;

  const zipKey = zipPathCompareKey(zipPath);
  const already = ctx.exportedImageByZipKey.get(zipKey);
  if (already) {
    out.push(`<<IMG:${already}>>`);
    return;
  }

  const zf = findZipFile(zip, zipPath);
  if (!zf || zf.dir) return;
  const data = await zf.async("arraybuffer");
  if (data.byteLength === 0) return;

  const originalBase = safeImageFileBaseFromZipPath(zipPath);
  const dot = originalBase.lastIndexOf(".");
  const stem0 = dot > 0 ? originalBase.slice(0, dot) : originalBase;
  const ext0 = dot > 0 ? originalBase.slice(dot) : "";

  let rel = "";
  for (let n = 0; ; n += 1) {
    const fname = n === 0 ? originalBase : `${stem0}_${n}${ext0}`;
    const tryRel = `${ctx.imagesFolderRel}/${fname}`;
    if (!ctx.usedRelKeys.has(tryRel.toLowerCase())) {
      rel = tryRel;
      break;
    }
  }

  ctx.usedRelKeys.add(rel.toLowerCase());
  ctx.exportedImageByZipKey.set(zipKey, rel);
  ctx.imageWrites.push({ relativePath: rel, data });
  out.push(`<<IMG:${rel}>>`);
}

async function readZipUtf8(zip: JSZip, path: string): Promise<string | null> {
  const f = findZipFile(zip, path);
  if (!f) return null;
  return f.async("string");
}

function normalizeSpace(s: string): string {
  return s.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

/** 与 spine 解析出的 ZIP 内路径比对（大小写/斜杠统一） */
function zipPathCompareKey(posixPath: string): string {
  return posixPath.replace(/\\/g, "/").replace(/^\/+/, "").toLowerCase();
}

const EPUB_OPS = "http://www.idpf.org/2007/ops";

function getEpubTypeAttr(el: Element): string | null {
  const a =
    el.getAttribute("epub:type") || el.getAttributeNS(EPUB_OPS, "type");
  return a?.trim() ? a.trim() : null;
}

function epubTypeHas(el: Element, needle: string): boolean {
  const raw = getEpubTypeAttr(el);
  if (!raw) return false;
  const low = needle.toLowerCase();
  return raw.split(/\s+/).some((p) => p.toLowerCase() === low);
}

/** 正文中「第〇折/回/章…」类短标题（用于从 h1–h6 里挑出章节行，而非全书名） */
function looksChapterish(s: string): boolean {
  const t = normalizeSpace(s);
  if (t.length === 0 || t.length > 100) return false;
  if (/折/.test(t)) return true;
  if (/^(第[0-9０-９一二三四五六七八九十百千两]+)(折|回|章|卷|篇|幕|部|节)(?=\s|$|[\u4e00-\u9fff])/u.test(t))
    return true;
  return false;
}

/** 文档序第一个 `epub:type` 含给定 token 的元素（跳过 nav 内，避免目录） */
function firstEpubTypedPlainText(doc: Document, typeToken: string): string | null {
  const all = doc.getElementsByTagName("*");
  for (let i = 0; i < all.length; i++) {
    const el = all[i]!;
    if (el.closest("nav")) continue;
    if (!epubTypeHas(el, typeToken)) continue;
    const t = normalizeSpace(el.textContent ?? "");
    if (t.length > 0 && t.length <= 120) return t;
  }
  return null;
}

/** 正文内文档序第一个「章节感」标题（h1–h6） */
function firstChapterishHeadingPlain(doc: Document): string | null {
  const heads = doc.querySelectorAll("body h1, body h2, body h3, body h4, body h5, body h6");
  for (const h of heads) {
    const el = h as Element;
    if (el.closest("nav")) continue;
    const t = normalizeSpace(el.textContent ?? "");
    if (t.length > 0 && looksChapterish(t)) return t;
  }
  return null;
}

/**
 * 若 spine 章节把卷标写在 epub:title / doc-title 或单独的 h*，而按 body 子树未落到前部行，则补一行。
 * 不使用 `head > title`（常为全书/多章导航文案，易误插入「第n章」等）。
 */
function prependMissingChapterLead(doc: Document, out: string[]): void {
  const sample = out.slice(0, 25).join("\n");
  const missing = (line: string | null): line is string => {
    if (!line) return false;
    const t = normalizeSpace(line);
    if (t.length === 0 || t.length > 120) return false;
    return !sample.includes(t);
  };

  const epubTitle =
    firstEpubTypedPlainText(doc, "title") ??
    firstEpubTypedPlainText(doc, "doc-title");
  if (
    missing(epubTitle) &&
    epubTitle &&
    (looksChapterish(epubTitle) || /折/.test(epubTitle))
  ) {
    out.unshift(epubTitle);
    return;
  }

  const hLine = firstChapterishHeadingPlain(doc);
  if (missing(hLine)) {
    out.unshift(hLine!);
  }
}

/** 块级标签：出现则不应把整段 div 合成一行标题 */
const BLOCK_INNER =
  "p, h1, h2, h3, h4, h5, h6, blockquote, ul, ol, table, figure, section, article, aside, nav, header, footer, dl, pre, address";

function hasBlockStructureInside(el: Element): boolean {
  if (el.querySelector(BLOCK_INNER) !== null) return true;
  /** 仅含插图、无 p/h* 的容器若走「合成一行」分支会漏掉 img（textContent 为空） */
  if (el.querySelector("img, image") !== null) return true;
  /**
   * 含 `<a>` 时不能整段 textContent 合成一行：`<a id="…"></a>` 无文本，会漏掉 `<<ID:…>>`；
   * 有 href 的链接也会丢失 `<<A:…>>`。
   */
  if (el.querySelector("a[href], a[id], a[name]") !== null) return true;
  return false;
}

/** 在含块级子元素的容器内按 DOM 顺序输出，保留元素之间的文本节点（如 `</a> 第一折 <h3>`） */
async function emitFlowChildNodes(
  el: Element,
  out: string[],
  ctx: EpubImageContext,
  htmlDirInZip: string,
  currentDocZipPath: string,
): Promise<void> {
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = normalizeSpace(node.textContent ?? "");
      if (t) out.push(t);
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      await emitFlowBlock(node as Element, out, ctx, htmlDirInZip, currentDocZipPath);
    }
  }
}

function walkInlineNodes(
  parent: Node,
  acc: { text: string },
  htmlDirInZip: string,
  currentDocZipPath: string,
): void {
  for (const node of parent.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      acc.text += node.textContent ?? "";
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (tag === "br" || tag === "hr") {
      acc.text += " ";
      continue;
    }
    /** 注音/括注：不并入正文，避免「第一折」旁多出拼音或半角括号 */
    if (tag === "rt" || tag === "rp") {
      continue;
    }
    if (tag === "a") {
      const anchorKey =
        el.getAttribute("id")?.trim() || el.getAttribute("name")?.trim();
      const idMark = anchorIdMarkerText(currentDocZipPath, anchorKey);
      if (idMark) acc.text += idMark;
      const href = el.getAttribute("href")?.trim() ?? "";
      const label = (el.textContent ?? "").replace(/\s+/g, " ").trim();
      if (/^https?:\/\//i.test(href)) {
        appendExternalHttpLink(acc, label, href);
      } else {
        const tid = resolveEpubInternalLinkTargetId(
          href,
          htmlDirInZip,
          currentDocZipPath,
        );
        if (tid && label) {
          acc.text += `<<A:${escapeEbookMarkerPayload(label)}|${escapeEbookMarkerPayload(tid)}>>`;
        } else if (label) {
          acc.text += label;
        }
      }
      continue;
    }
    const epubNs = "http://www.idpf.org/2007/ops";
    const epubType =
      el.getAttribute("epub:type") || el.getAttributeNS(epubNs, "type");
    if (epubType === "noteref") {
      walkInlineNodes(el, acc, htmlDirInZip, currentDocZipPath);
      continue;
    }
    if (
      tag === "span" ||
      tag === "b" ||
      tag === "strong" ||
      tag === "i" ||
      tag === "em" ||
      tag === "u" ||
      tag === "small" ||
      tag === "sub" ||
      tag === "sup" ||
      tag === "code" ||
      tag === "kbd" ||
      tag === "s" ||
      tag === "strike" ||
      tag === "mark" ||
      tag === "cite" ||
      tag === "q" ||
      tag === "ruby" ||
      tag === "rb" ||
      tag === "rtc" ||
      tag === "rbc" ||
      tag === "font" ||
      tag === "big" ||
      tag === "tt" ||
      tag === "ins" ||
      tag === "del" ||
      tag === "bdi" ||
      tag === "bdo" ||
      tag === "data" ||
      tag === "time"
    ) {
      walkInlineNodes(el, acc, htmlDirInZip, currentDocZipPath);
    }
  }
}

async function paragraphToLines(
  p: Element,
  out: string[],
  ctx: EpubImageContext,
  htmlDirInZip: string,
  currentDocZipPath: string,
): Promise<void> {
  const acc = { text: "" };
  const idAttr = p.getAttribute("id")?.trim();
  const idMark = anchorIdMarkerText(currentDocZipPath, idAttr);
  if (idMark) acc.text += idMark;

  function flushTextLines() {
    const raw = normalizeSpace(acc.text);
    acc.text = "";
    if (raw.trim().length > 0) out.push(raw);
  }

  async function visit(node: Node): Promise<void> {
    if (node.nodeType === Node.TEXT_NODE) {
      acc.text += node.textContent ?? "";
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (tag === "img" || tag === "image") {
      flushTextLines();
      const href = getImgHref(el);
      if (href) {
        await appendImageLineFromHref(
          ctx.zip,
          htmlDirInZip,
          href,
          ctx,
          out,
        );
      }
      return;
    }
    if (tag === "br" || tag === "hr") {
      acc.text += " ";
      return;
    }
    if (tag === "a") {
      const anchorKey =
        el.getAttribute("id")?.trim() || el.getAttribute("name")?.trim();
      const idMarkA = anchorIdMarkerText(currentDocZipPath, anchorKey);
      if (idMarkA) acc.text += idMarkA;
      const href = el.getAttribute("href")?.trim() ?? "";
      const label = (el.textContent ?? "").replace(/\s+/g, " ").trim();
      if (/^https?:\/\//i.test(href)) {
        appendExternalHttpLink(acc, label, href);
      } else {
        const tid = resolveEpubInternalLinkTargetId(
          href,
          htmlDirInZip,
          currentDocZipPath,
        );
        if (tid && label) {
          acc.text += `<<A:${escapeEbookMarkerPayload(label)}|${escapeEbookMarkerPayload(tid)}>>`;
        } else if (label) {
          acc.text += label;
        }
      }
      return;
    }
    const epubNs = "http://www.idpf.org/2007/ops";
    const epubType =
      el.getAttribute("epub:type") || el.getAttributeNS(epubNs, "type");
    if (epubType === "noteref") {
      walkInlineNodes(el, acc, htmlDirInZip, currentDocZipPath);
      return;
    }
    const nestedImg = el.querySelector("img, image");
    if (!nestedImg) {
      walkInlineNodes(el, acc, htmlDirInZip, currentDocZipPath);
      return;
    }
    for (const c of el.childNodes) {
      await visit(c);
    }
  }

  for (const c of p.childNodes) {
    await visit(c);
  }
  flushTextLines();
}

async function emitFigure(
  fig: Element,
  out: string[],
  ctx: EpubImageContext,
  htmlDirInZip: string,
  currentDocZipPath: string,
): Promise<void> {
  const figId = anchorIdMarkerText(currentDocZipPath, fig.getAttribute("id"));
  if (figId) out.push(figId);
  const cap = fig.querySelector("figcaption");
  if (cap) {
    await paragraphToLines(cap, out, ctx, htmlDirInZip, currentDocZipPath);
  }
  for (const img of fig.querySelectorAll("img, image")) {
    if (cap?.contains(img)) continue;
    const href = getImgHref(img as Element);
    if (href) {
      await appendImageLineFromHref(ctx.zip, htmlDirInZip, href, ctx, out);
    }
  }
}

/** 仅行内/短语级子树：按段落逻辑走 childNodes，避免 `body` 下裸 `<span>` 被 `children` 遍历漏掉 */
const EMIT_AS_INLINE_PARAGRAPH =
  "a, span, b, strong, i, em, u, small, cite, kbd, code, mark, abbr, dfn, q, s, strike, sub, sup";

async function emitFlowBlock(
  el: Element,
  out: string[],
  ctx: EpubImageContext,
  htmlDirInZip: string,
  currentDocZipPath: string,
): Promise<void> {
  const tag = el.tagName.toLowerCase();

  if (tag === "script" || tag === "style" || tag === "noscript") {
    return;
  }

  if (el.matches(EMIT_AS_INLINE_PARAGRAPH)) {
    await paragraphToLines(el, out, ctx, htmlDirInZip, currentDocZipPath);
    return;
  }

  if (tag === "figure") {
    await emitFigure(el, out, ctx, htmlDirInZip, currentDocZipPath);
    return;
  }

  if (tag === "ul" || tag === "ol") {
    const listId = anchorIdMarkerText(currentDocZipPath, el.getAttribute("id"));
    if (listId) out.push(listId);
    for (const li of el.querySelectorAll(":scope > li")) {
      await paragraphToLines(li, out, ctx, htmlDirInZip, currentDocZipPath);
    }
    return;
  }

  if (tag === "p" || tag === "blockquote") {
    await paragraphToLines(el, out, ctx, htmlDirInZip, currentDocZipPath);
    return;
  }

  if (/^h[1-6]$/.test(tag)) {
    await paragraphToLines(el, out, ctx, htmlDirInZip, currentDocZipPath);
    return;
  }

  if (tag === "img" || tag === "image") {
    const href = getImgHref(el);
    if (href) {
      await appendImageLineFromHref(ctx.zip, htmlDirInZip, href, ctx, out);
    }
    return;
  }

  if (
    tag === "div" ||
    tag === "section" ||
    tag === "article" ||
    tag === "header" ||
    tag === "aside" ||
    tag === "nav" ||
    tag === "main" ||
    tag === "footer"
  ) {
    const wrapId = anchorIdMarkerText(currentDocZipPath, el.getAttribute("id"));
    if (!hasBlockStructureInside(el)) {
      let t = normalizeSpace(el.textContent ?? "");
      if (wrapId) t = t ? wrapId + t : wrapId;
      if (t) out.push(t);
      return;
    }
    if (wrapId) out.push(wrapId);
    await emitFlowChildNodes(el, out, ctx, htmlDirInZip, currentDocZipPath);
    return;
  }

  if (tag === "table" || tag === "dl" || tag === "pre" || tag === "address") {
    const blockId = anchorIdMarkerText(currentDocZipPath, el.getAttribute("id"));
    if (el.querySelector("img, image")) {
      if (blockId) out.push(blockId);
      await emitFlowChildNodes(el, out, ctx, htmlDirInZip, currentDocZipPath);
      return;
    }
    let t = normalizeSpace(el.textContent ?? "");
    if (blockId) t = t ? blockId + t : blockId;
    if (t) out.push(t);
    return;
  }

  /** 未知标签且无元素子节点：整段 textContent 作为一行（含 svg:text、带命名空间的章节标签等） */
  if (el.childElementCount === 0) {
    const leafId = anchorIdMarkerText(currentDocZipPath, el.getAttribute("id"));
    let t = normalizeSpace(el.textContent ?? "");
    if (leafId) t = t ? leafId + t : leafId;
    if (t) out.push(t);
    return;
  }

  await emitFlowChildNodes(el, out, ctx, htmlDirInZip, currentDocZipPath);
}

async function xhtmlToLines(
  html: string,
  htmlDirInZip: string,
  ctx: EpubImageContext,
  currentDocZipPath: string,
): Promise<string[]> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "application/xhtml+xml");
  const body = doc.querySelector("body");
  if (!body) return [];
  const out: string[] = [];
  const bodyIdMark = anchorIdMarkerText(currentDocZipPath, body.getAttribute("id"));
  if (bodyIdMark) out.push(bodyIdMark);
  for (const child of body.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      const t = normalizeSpace(child.textContent ?? "");
      if (t) out.push(t);
      continue;
    }
    if (child.nodeType === Node.ELEMENT_NODE) {
      await emitFlowBlock(
        child as Element,
        out,
        ctx,
        htmlDirInZip,
        currentDocZipPath,
      );
    }
  }
  if (out.length === 0 && body.textContent?.trim()) {
    out.push(normalizeSpace(body.textContent));
  }
  prependMissingChapterLead(doc, out);
  return out;
}

export async function convertLoadedEpubZip(
  zip: JSZip,
  outputBase: string,
): Promise<ColorTxtArtifacts> {
  const containerXml = await readZipUtf8(zip, "META-INF/container.xml");
  if (!containerXml) throw new Error("EPUB 缺少 META-INF/container.xml");

  const cDoc = new DOMParser().parseFromString(containerXml, "application/xml");
  const fullPath =
    parseXml(cDoc, "rootfile", "full-path") ??
    parseXml(cDoc, "n\\:rootfile", "full-path");
  if (!fullPath) throw new Error("EPUB container 未找到 OPF 路径");

  const opfPath = fullPath.replace(/^\//, "").replace(/\\/g, "/");
  const opfDir = opfPath.includes("/")
    ? opfPath.slice(0, opfPath.lastIndexOf("/"))
    : "";

  const opfXml = await readZipUtf8(zip, opfPath);
  if (!opfXml) throw new Error("无法读取 OPF 文件");

  const opfDoc = new DOMParser().parseFromString(opfXml, "application/xml");

  type ManifestEntry = { href: string; media: string; properties: string };
  const manifestById = new Map<string, ManifestEntry>();
  for (const item of opfDoc.querySelectorAll("manifest > item")) {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    if (!id || !href) continue;
    manifestById.set(id, {
      href,
      media: (item.getAttribute("media-type") ?? "").toLowerCase(),
      properties: (item.getAttribute("properties") ?? "").toLowerCase(),
    });
  }

  const spineIds: string[] = [];
  for (const item of opfDoc.querySelectorAll("spine > itemref")) {
    const idref = item.getAttribute("idref");
    if (idref) spineIds.push(idref);
  }

  await yieldToUi();

  const imagesFolderRel = `${outputBase}.Images`;
  const imageCtx: EpubImageContext = {
    zip,
    imagesFolderRel,
    imageWrites: [],
    usedRelKeys: new Set(),
    exportedImageByZipKey: new Map(),
  };

  const lines: string[] = [];

  for (const id of spineIds) {
    const entry = manifestById.get(id);
    if (!entry) continue;
    const { href, media } = entry;
    if (media.startsWith("image/")) continue;

    const zipPath = resolveInZip(opfDir, href);
    const lower = href.toLowerCase();
    const isHtml =
      lower.endsWith(".xhtml") ||
      lower.endsWith(".html") ||
      lower.endsWith(".htm");
    if (!isHtml) continue;

    const raw = await readZipUtf8(zip, zipPath);
    if (!raw) continue;

    const htmlDirInZip = zipPath.includes("/")
      ? zipPath.slice(0, zipPath.lastIndexOf("/"))
      : "";

    const chunk = await xhtmlToLines(raw, htmlDirInZip, imageCtx, zipPath);
    for (const ln of chunk) {
      if (ln.trim().length > 0) lines.push(ln);
    }
    lines.push("");
    await yieldToUi();
  }

  const utf8 = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  const out: ColorTxtArtifacts = { utf8 };
  if (imageCtx.imageWrites.length > 0) {
    out.imageWrites = imageCtx.imageWrites;
  }
  return out;
}

export async function convertEpubToArtifacts(
  buffer: ArrayBuffer,
  outputBase: string,
): Promise<ColorTxtArtifacts> {
  const zip = await JSZip.loadAsync(buffer);
  await yieldToUi();
  return convertLoadedEpubZip(zip, outputBase);
}

export async function tryConvertZipAsEpub(
  buffer: ArrayBuffer,
  outputBase: string,
): Promise<ColorTxtArtifacts | null> {
  try {
    const zip = await JSZip.loadAsync(buffer);
    if (!findZipFile(zip, "META-INF/container.xml")) return null;
    await yieldToUi();
    return await convertLoadedEpubZip(zip, outputBase);
  } catch {
    return null;
  }
}
