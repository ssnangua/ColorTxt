import type * as monaco from "monaco-editor";
import { chapterTitleForDisplay } from "../chapter";

/** 与 `setChapters` / 粘性滚动大纲一致的单条章节信息 */
export type ChapterStickyLine = { title: string; lineNumber: number };

/** 正文里章节标题行的装饰 class，需与样式中的选择器一致 */
export const CHAPTER_TITLE_LINE_CLASS = "chapterTitleLine";

const STICKY_NO_CLICK_STYLE_ID = "txtr-monaco-sticky-chapter-no-click";

/**
 * 禁止点击粘性章节条触发 Monaco 内部跳转（全局一次注入即可）。
 */
export function ensureStickyChapterBarClickDisabled(): void {
  if (document.getElementById(STICKY_NO_CLICK_STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STICKY_NO_CLICK_STYLE_ID;
  el.textContent = `
.monaco-editor .sticky-widget {
  pointer-events: none !important;
}
`;
  document.head.appendChild(el);
}

/**
 * 注册折叠区与文档符号，使粘性滚动按章节层级显示章节名。
 * `getChapters` 应在每次 `setChapters` 后返回最新快照。
 */
export function registerChapterStickyScrollProviders(
  monacoApi: typeof monaco,
  languageId: string,
  getChapters: () => ChapterStickyLine[],
): monaco.IDisposable {
  const disposables: monaco.IDisposable[] = [];

  disposables.push(
    monacoApi.languages.registerFoldingRangeProvider(languageId, {
      provideFoldingRanges(model) {
        const max = model.getLineCount();
        const sorted = getChapters()
          .filter((c) => c.lineNumber >= 1 && c.lineNumber <= max)
          .slice()
          .sort((a, b) => a.lineNumber - b.lineNumber);

        const ranges: monaco.languages.FoldingRange[] = [];
        for (let i = 0; i < sorted.length; i++) {
          const start = sorted[i].lineNumber;
          const nextStart = sorted[i + 1]?.lineNumber ?? max + 1;
          const end = Math.max(start, Math.min(max, nextStart - 1));
          if (end <= start) continue;
          ranges.push({
            start,
            end,
            kind: monacoApi.languages.FoldingRangeKind.Region,
          });
        }
        return ranges;
      },
    }),
  );

  disposables.push(
    monacoApi.languages.registerDocumentSymbolProvider(languageId, {
      provideDocumentSymbols(model) {
        const max = model.getLineCount();
        const sorted = getChapters()
          .filter((c) => c.lineNumber >= 1 && c.lineNumber <= max)
          .slice()
          .sort((a, b) => a.lineNumber - b.lineNumber);

        const symbols: monaco.languages.DocumentSymbol[] = [];
        for (let i = 0; i < sorted.length; i++) {
          const ch = sorted[i];
          const start = ch.lineNumber;
          const nextStart = sorted[i + 1]?.lineNumber ?? max + 1;
          const end = Math.max(start, Math.min(max, nextStart - 1));
          const range = new monacoApi.Range(
            start,
            1,
            end,
            model.getLineMaxColumn(end),
          );
          const selectionRange = new monacoApi.Range(
            start,
            1,
            start,
            model.getLineMaxColumn(start),
          );

          const name =
            chapterTitleForDisplay(ch.title) ||
            chapterTitleForDisplay(model.getLineContent(start)) ||
            `第 ${start} 行`;
          symbols.push({
            name,
            detail: "",
            kind: monacoApi.languages.SymbolKind.Namespace,
            range,
            selectionRange,
            tags: [],
            children: [],
          });
        }
        return symbols;
      },
    }),
  );

  return {
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
