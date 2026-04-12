import {
  getDocument,
  GlobalWorkerOptions,
} from "pdfjs-dist/build/pdf.mjs";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { ColorTxtArtifacts } from "./ebookTypes";

let workerConfigured = false;

/** 与 package.json 中 pdfjs-dist 版本一致（用于 cMap CDN 路径） */
const PDFJS_DIST_VERSION = "5.6.205";

export async function convertPdfToArtifacts(
  buffer: ArrayBuffer,
): Promise<ColorTxtArtifacts> {
  if (!workerConfigured) {
    GlobalWorkerOptions.workerSrc = pdfjsWorker;
    workerConfigured = true;
  }

  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    cMapUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_DIST_VERSION}/cmaps/`,
    cMapPacked: true,
  });
  const doc = await loadingTask.promise;
  const lines: string[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    let chunk = "";
    for (const item of tc.items) {
      if (item && typeof item === "object" && "str" in item) {
        chunk += (item as { str: string }).str;
      }
    }
    const pageText = chunk.replace(/\s+/g, " ").trim();
    if (pageText.length > 0) {
      lines.push(pageText);
      lines.push("");
    }
  }

  await doc.destroy();

  const utf8 = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  return { utf8 };
}
