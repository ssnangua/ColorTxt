import type * as monaco from "monaco-editor";
import { dirnameFs, joinFs } from "../ebook/pathUtils";

/** 整行匹配；路径内不得含 `>` */
export const READER_IMG_ANCHOR_LINE_RE = /^\s*<<IMG:([^>]+)>>\s*$/;

function joinUnderDir(dirAbs: string, relativePosix: string): string {
  let out = dirAbs;
  for (const seg of relativePosix.replace(/\\/g, "/").split("/").filter(Boolean)) {
    out = joinFs(out, seg);
  }
  return out;
}

function lineDeleteRange(
  monacoApi: typeof monaco,
  model: monaco.editor.ITextModel,
  line: number,
): monaco.Range {
  const lc = model.getLineCount();
  if (line < 1 || line > lc) {
    return new monacoApi.Range(1, 1, 1, 1);
  }
  if (lc === 1) {
    return new monacoApi.Range(1, 1, 1, model.getLineMaxColumn(1));
  }
  if (line < lc) {
    return new monacoApi.Range(line, 1, line + 1, 1);
  }
  const prev = line - 1;
  return new monacoApi.Range(
    prev,
    model.getLineMaxColumn(prev),
    line,
    model.getLineMaxColumn(line),
  );
}

/**
 * Monaco 将 `.view-zones` 容器宽设为 `max(scrollWidth, contentWidth)`（见 vscode `viewZones.ts` render），
 * 长行撑宽 scrollWidth 时 zone 比正文栏更宽；插图若 `width:100%` 再居中会相对正文右偏。
 * 将 zone 根节点限制为与正文同一 `contentWidth`。
 */
function syncReaderImageViewZoneBox(
  editor: monaco.editor.IStandaloneCodeEditor,
  dom: HTMLElement,
): void {
  const { contentWidth } = editor.getLayoutInfo();
  dom.style.width = `${Math.max(0, contentWidth - 14)}px`; // 14px 为 Monaco 滚动条宽度
}

/**
 * 删除 `<<IMG:…>>` 独占行并在对应位置插入 View Zone；相对路径相对 `dirname(convertedTxtAbsPath)`。
 */
export async function replaceImgAnchorLinesWithViewZones(
  monacoApi: typeof monaco,
  editor: monaco.editor.IStandaloneCodeEditor,
  convertedTxtAbsPath: string,
  options: {
    zoneHeightPx: number;
    onZonesChange?: (zoneIds: string[]) => void;
  },
): Promise<string[]> {
  const model = editor.getModel();
  if (!model) return [];
  const txtDir = dirnameFs(convertedTxtAbsPath.replace(/\\/g, "/"));

  const matches: { line: number; rel: string }[] = [];
  const lc0 = model.getLineCount();
  for (let L = 1; L <= lc0; L++) {
    const line = model.getLineContent(L);
    const m = line.match(READER_IMG_ANCHOR_LINE_RE);
    if (m?.[1]?.trim()) {
      matches.push({ line: L, rel: m[1].trim() });
    }
  }
  if (matches.length === 0) return [];

  function deletedBefore(row: number): number {
    return matches.filter((x) => x.line < row).length;
  }

  const edits = matches
    .slice()
    .sort((a, b) => b.line - a.line)
    .map((m) => ({
      range: lineDeleteRange(monacoApi, model, m.line),
      text: "",
    }));
  model.applyEdits(edits);

  const zoneSpecs: { afterLineNumber: number; absPath: string }[] = [];
  for (const m of matches.slice().sort((a, b) => a.line - b.line)) {
    const abs = joinUnderDir(txtDir, m.rel.replace(/\\/g, "/"));
    const afterLineNumber = Math.max(
      0,
      m.line - 1 - deletedBefore(m.line - 1),
    );
    zoneSpecs.push({ afterLineNumber, absPath: abs });
  }

  const withUrls = await Promise.all(
    zoneSpecs.map(async (z) => ({
      ...z,
      url: (await window.colorTxt.pathToReadableLocalUrl(z.absPath)) ?? "",
    })),
  );

  const zoneIds: string[] = [];
  let zoneOrdinal = 0;
  editor.changeViewZones((accessor) => {
    for (const z of withUrls) {
      if (!z.url) continue;
      const afterLineNumber = z.afterLineNumber;
      const afterColumn =
        afterLineNumber > 0
          ? model.getLineMaxColumn(afterLineNumber)
          : undefined;
      const dom = document.createElement("div");
      dom.className = "readerImageViewZone";
      /** 由 `ReaderMain` 在 window 捕获阶段读取并打开灯箱（Monaco 会拦截 View Zone 内直接绑定的事件） */
      dom.dataset.colortxtImgUrl = z.url;
      dom.style.boxSizing = "border-box";
      dom.style.height = `${options.zoneHeightPx}px`;
      dom.style.display = "block";
      dom.style.overflow = "hidden";
      dom.style.pointerEvents = "none";
      syncReaderImageViewZoneBox(editor, dom);
      /** 内层负责居中；勿对外层用 `contain: strict`，否则会破坏 img 命中测试与手型 */
      const frame = document.createElement("div");
      frame.className = "readerImageViewZoneFrame";
      const img = document.createElement("img");
      img.loading = "lazy";
      img.decoding = "async";
      img.draggable = false;
      img.alt = "";
      img.style.pointerEvents = "auto";
      img.src = z.url;
      frame.appendChild(img);
      dom.appendChild(frame);
      const id = accessor.addZone({
        afterLineNumber,
        afterColumn,
        ordinal: zoneOrdinal++,
        heightInPx: options.zoneHeightPx,
        domNode: dom,
        onDomNodeTop: () => {
          syncReaderImageViewZoneBox(editor, dom);
        },
      });
      zoneIds.push(id);
    }
  });
  options.onZonesChange?.(zoneIds);
  return zoneIds;
}

export function removeViewZonesById(
  editor: monaco.editor.IStandaloneCodeEditor,
  zoneIds: readonly string[],
): void {
  if (zoneIds.length === 0) return;
  editor.changeViewZones((accessor) => {
    for (const id of zoneIds) {
      accessor.removeZone(id);
    }
  });
}
