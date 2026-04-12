import type { ColorTxtArtifacts } from "./ebookTypes";
import {
  isEbookFilePath,
  fileStemFromPath,
  ebookSourceFileBaseForOutput,
} from "./ebookFormat";
import { convertEpubToArtifacts, tryConvertZipAsEpub } from "./parseEpub";
import { convertFb2ToArtifacts } from "./parseFb2";
import { convertPdfToArtifacts } from "./parsePdf";
import { convertMobiToArtifacts } from "./parseMobi";
import { dirnameFs, joinFs } from "./pathUtils";
import { yieldToUi } from "./yieldToUi";

/** 计算 `{basename}.txt` 绝对路径（basename 为源文件名含扩展名，如 `abc.epub.txt`）。 */
export function resolveConvertedTxtOutputPaths(params: {
  sourceBookPath: string;
  /** 空字符串：与源书同目录 */
  ebookConvertOutputDir: string;
}): { convertedTxtPath: string; outputBase: string } {
  const outputBase = ebookSourceFileBaseForOutput(params.sourceBookPath);
  const sourceNorm = params.sourceBookPath.replace(/\\/g, "/");
  const outDir =
    params.ebookConvertOutputDir.trim().length > 0
      ? params.ebookConvertOutputDir.trim()
      : dirnameFs(sourceNorm);
  const convertedTxtPath = joinFs(outDir, `${outputBase}.txt`);
  return { convertedTxtPath, outputBase };
}

function normPath(p: string): string {
  return p.replace(/\\/g, "/").trim().toLowerCase();
}

function userDataDirForLookup(): string {
  try {
    return window.colorTxt.getUserDataPath().trim();
  } catch {
    return "";
  }
}

/**
 * 在 app userData 与源书所在目录查找 `{basename}.txt`（按此顺序），返回首个存在的文件路径。
 */
async function findExistingConvertedTxtInUserDataOrSourceDir(params: {
  outputBase: string;
  sourceBookPath: string;
}): Promise<string | null> {
  const sourceNorm = params.sourceBookPath.replace(/\\/g, "/").trim();
  const besideSource = joinFs(
    dirnameFs(sourceNorm),
    `${params.outputBase}.txt`,
  );
  const ud = userDataDirForLookup();
  const inUserData = ud ? joinFs(ud, `${params.outputBase}.txt`) : "";

  const candidates: string[] = [];
  if (inUserData) candidates.push(inUserData);
  candidates.push(besideSource);

  const seen = new Set<string>();
  for (const p of candidates) {
    const key = normPath(p);
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      const st = await window.colorTxt.stat(p);
      if (st.isFile) return p;
    } catch {
      continue;
    }
  }
  return null;
}

async function readBookAsArrayBuffer(absSource: string): Promise<ArrayBuffer> {
  const buf = await window.colorTxt.readFileAsArrayBuffer(absSource);
  await yieldToUi();
  return buf;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    const sub = bytes.subarray(i, Math.min(i + chunk, bytes.length));
    binary += String.fromCharCode(...sub);
  }
  return btoa(binary);
}

export async function convertBookBufferToArtifacts(
  absSource: string,
  buffer: ArrayBuffer,
): Promise<ColorTxtArtifacts> {
  const lower = absSource.toLowerCase();
  const stem = fileStemFromPath(absSource);
  const outputBase = ebookSourceFileBaseForOutput(absSource);

  if (lower.endsWith(".epub")) {
    return convertEpubToArtifacts(buffer, outputBase);
  }

  if (lower.endsWith(".azw3")) {
    const zipEpub = await tryConvertZipAsEpub(buffer, outputBase);
    if (zipEpub) return zipEpub;
    throw new Error("该 AZW3 不是 KF8 ZIP 封装，暂无法转换。");
  }

  if (lower.endsWith(".mobi")) {
    const zipEpub = await tryConvertZipAsEpub(buffer, outputBase);
    if (zipEpub) return zipEpub;
    return convertMobiToArtifacts(buffer, outputBase);
  }

  if (lower.endsWith(".fb2")) {
    return convertFb2ToArtifacts(buffer, false, stem);
  }
  if (lower.endsWith(".fbz")) {
    return convertFb2ToArtifacts(buffer, true, stem);
  }
  if (lower.endsWith(".pdf")) {
    return convertPdfToArtifacts(buffer);
  }

  throw new Error("不支持的电子书格式。");
}

function joinUnderDir(dirAbs: string, relativePosix: string): string {
  let out = dirAbs;
  for (const seg of relativePosix.replace(/\\/g, "/").split("/").filter(Boolean)) {
    out = joinFs(out, seg);
  }
  return out;
}

/** 与解析器约定一致：`{basename}.txt` 旁为 `{basename}.Images/` */
function imagesDirAbsBesideConvertedTxt(convertedTxtPath: string): string {
  const txtNorm = convertedTxtPath.replace(/\\/g, "/").trim();
  const dir = dirnameFs(txtNorm);
  const file =
    txtNorm.includes("/") ? txtNorm.slice(txtNorm.lastIndexOf("/") + 1) : txtNorm;
  if (!/\.txt$/i.test(file)) {
    throw new Error(`unexpected converted txt path: ${convertedTxtPath}`);
  }
  const outputBase = file.slice(0, -".txt".length);
  return joinFs(dir, `${outputBase}.Images`);
}

/** 与 `readerImageViewZones` 中单行插图锚一致（trim 后匹配） */
const READER_IMG_LINE_AFTER_TRIM = /^<<IMG:[^>]+>>$/;

/**
 * 电子书转出的正文：每一行纯文本先 trim，再在行首加两个全角空格；空行与 `<<IMG:…>>` 独占行不改。
 */
function indentConvertedTxtPlainLines(utf8: string): string {
  const indent = "\u3000\u3000";
  const lines = utf8.replace(/\r\n/g, "\n").split("\n");
  return lines
    .map((line) => {
      const t = line.trim();
      if (t.length === 0) return "";
      if (READER_IMG_LINE_AFTER_TRIM.test(t)) return t;
      return indent + t;
    })
    .join("\n");
}

export async function writeEbookConversionArtifacts(params: {
  convertedTxtPath: string;
  artifacts: ColorTxtArtifacts;
}): Promise<void> {
  const utf8Out = indentConvertedTxtPlainLines(params.artifacts.utf8);
  await window.colorTxt.writeUtf8File(params.convertedTxtPath, utf8Out);
  const imgs = params.artifacts.imageWrites;
  const imagesAbs = imagesDirAbsBesideConvertedTxt(params.convertedTxtPath);
  if (!imgs?.length) {
    await window.colorTxt.removePath(imagesAbs);
    return;
  }
  const txtNorm = params.convertedTxtPath.replace(/\\/g, "/");
  const dir = dirnameFs(txtNorm);
  await window.colorTxt.removePath(imagesAbs);
  for (const w of imgs) {
    const abs = joinUnderDir(dir, w.relativePath);
    await window.colorTxt.writeBinaryFile(abs, arrayBufferToBase64(w.data));
  }
}

/**
 * 若需转换则写入 `{basename}.txt`；仅当解析到插图时写入图片文件（写入时按需创建 `{basename}.Images/`），无插图则只移除残留插图目录。
 */
export async function ensureEbookColorTxt(params: {
  sourceBookPath: string;
  ebookConvertOutputDir: string;
  sourceMtimeMs: number;
  existingConvertedPath?: string | undefined;
  existingSourceMtimeMs?: number | undefined;
}): Promise<{ colorTxtPath: string; didConvert: boolean }> {
  const absSource = params.sourceBookPath.trim();
  if (!isEbookFilePath(absSource)) {
    return { colorTxtPath: absSource, didConvert: false };
  }

  const { convertedTxtPath, outputBase } = resolveConvertedTxtOutputPaths({
    sourceBookPath: absSource,
    ebookConvertOutputDir: params.ebookConvertOutputDir,
  });

  const cacheOk =
    params.existingConvertedPath &&
    normPath(params.existingConvertedPath) === normPath(convertedTxtPath) &&
    params.existingSourceMtimeMs === params.sourceMtimeMs;

  if (cacheOk) {
    try {
      const st = await window.colorTxt.stat(params.existingConvertedPath!);
      if (st.isFile) {
        return { colorTxtPath: params.existingConvertedPath!, didConvert: false };
      }
    } catch {
      // 记录路径失效：若源文件未改，再在 userData / 源目录找同名 .txt
    }
  }

  const mtimeStable =
    typeof params.existingSourceMtimeMs === "number" &&
    params.existingSourceMtimeMs === params.sourceMtimeMs;
  const hadPriorConvert = Boolean(params.existingConvertedPath?.trim());

  if (mtimeStable && hadPriorConvert) {
    const found = await findExistingConvertedTxtInUserDataOrSourceDir({
      outputBase,
      sourceBookPath: absSource,
    });
    if (found) {
      return { colorTxtPath: found, didConvert: false };
    }
  }

  await yieldToUi();
  const buf = await readBookAsArrayBuffer(absSource);
  const artifacts = await convertBookBufferToArtifacts(absSource, buf);
  await writeEbookConversionArtifacts({ convertedTxtPath, artifacts });
  return { colorTxtPath: convertedTxtPath, didConvert: true };
}
