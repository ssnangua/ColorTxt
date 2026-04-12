import JSZip from "jszip";
import type { ColorTxtArtifacts } from "./ebookTypes";

function walkTextNodes(el: Element, acc: { text: string }): void {
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      acc.text += node.textContent ?? "";
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const child = node as Element;
    const tag = child.tagName.toLowerCase();
    if (tag === "a") {
      const href =
        child.getAttributeNS("http://www.w3.org/1999/xlink", "href") ||
        child.getAttribute("href") ||
        "";
      const label = (child.textContent ?? "").replace(/\s+/g, " ").trim();
      if (/^https?:\/\//i.test(href)) {
        acc.text += label.length > 0 ? `${label}（${href}）` : href;
      } else if (href.startsWith("#")) {
        if (label) acc.text += label;
      }
      continue;
    }
    if (tag === "empty-line") {
      acc.text += "\n";
      continue;
    }
    walkTextNodes(child, acc);
  }
}

function flushParagraph(el: Element, outLines: string[]): void {
  const acc = { text: "" };
  walkTextNodes(el, acc);
  const raw = acc.text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  if (raw) outLines.push(raw);
}

export async function convertFb2ToArtifacts(
  buffer: ArrayBuffer,
  isFbz: boolean,
  _bookStem: string,
): Promise<ColorTxtArtifacts> {
  let xmlText: string;

  if (isFbz) {
    const zip = await JSZip.loadAsync(buffer);
    const names = Object.keys(zip.files).filter(
      (n) => !zip.files[n]!.dir && n.toLowerCase().endsWith(".fb2"),
    );
    if (names.length === 0) throw new Error("FBZ 压缩包内未找到 .fb2 文件");
    const fb2Name = names.sort()[0]!;
    xmlText = (await zip.file(fb2Name)!.async("string")) as string;
  } else {
    xmlText = new TextDecoder("utf-8").decode(new Uint8Array(buffer));
  }

  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  const title =
    doc.querySelector("description > book-title")?.textContent?.trim() ||
    doc.querySelector("description > title")?.textContent?.trim();
  const body = doc.querySelector("body");
  if (!body) throw new Error("FB2 缺少 body");

  const outLines: string[] = [];
  if (title) {
    outLines.push(title, "");
  }

  for (const el of body.querySelectorAll("title, subtitle, p, v")) {
    const tag = el.tagName.toLowerCase();
    if (tag === "title" || tag === "subtitle") {
      const t = (el.textContent ?? "").replace(/\s+/g, " ").trim();
      if (t) outLines.push(t);
      continue;
    }
    if (tag === "p" || tag === "v") {
      flushParagraph(el, outLines);
    }
  }

  const utf8 = outLines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  return { utf8 };
}
