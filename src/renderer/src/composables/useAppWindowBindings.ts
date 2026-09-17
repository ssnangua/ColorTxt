import { nextTick, onBeforeUnmount, onMounted, watch, type Ref } from "vue";
import type ReaderMain from "../components/ReaderMain.vue";
import { isSupportedBookPath } from "../ebook/ebookFormat";
import {
  collectFsPathsFromDataTransfer,
  dataTransferLikelyHasExternalFiles,
  DROP_ZONE_READER_SIDEBAR,
  isDragOverDropZone,
} from "../utils/dragDropFsPaths";
import { looksLikeZipBookPackCandidate } from "../utils/readerBookPack";
import { formatTextEncodingLabel } from "@shared/textEncodingDisplay";
import { appAlert } from "../services/appDialog";
import {
  bindAppShortcuts,
  EDIT_MODE_MONACO_DEFERRED_ACTIONS,
  READER_SCROLL_SHORTCUT_ACTIONS,
  VOICE_READ_SCROLL_BLOCKED_ACTIONS,
} from "../services/shortcutService";
import { hasModalOrEscBeforeModalLayer } from "../utils/modalStack";
import { shouldDeferShortcutForReaderSidebar } from "../utils/readerSidebarKeyboard";
import { useAppFileSession } from "./useAppFileSession";
import { useTxtStreamPipeline } from "./useTxtStreamPipeline";
import type { ShortcutBindingMap } from "../services/shortcutRegistry";

type FileSession = ReturnType<typeof useAppFileSession>;
type Stream = ReturnType<typeof useTxtStreamPipeline>;

/** 侧栏任意区域拖入均合并进文件列表，不显示阅读区「打开文件」蒙层 */
function isOverSidebarImportDropZone(ev: DragEvent): boolean {
  return isDragOverDropZone(ev, DROP_ZONE_READER_SIDEBAR);
}

/** 焦点是否在主阅读器 Monaco 编辑器内（用于编辑模式下判断是否让出冲突快捷键） */
function keyboardTargetInsideReaderMonacoEditor(
  ev: KeyboardEvent,
  readerRef: Ref<InstanceType<typeof ReaderMain> | null>,
): boolean {
  const t = ev.target;
  if (!(t instanceof Node)) return false;
  if (t instanceof Element && t.closest(".content--readerEdit")) return true;
  const root = readerRef.value?.getReaderEditorDomNode?.() ?? null;
  return Boolean(root && root.contains(t));
}

/** 焦点是否在 Monaco 查找栏内（查找/替换输入框 ↑↓ 浏览历史，勿交给阅读器滚行快捷键） */
function keyboardTargetInsideFindWidget(ev: KeyboardEvent): boolean {
  const t = ev.target;
  return t instanceof Element && !!t.closest(".find-widget");
}

export function useAppWindowBindings(deps: {
  readerRef: Ref<InstanceType<typeof ReaderMain> | null>;
  stream: Stream;
  fileSession: FileSession;
  persistWindowUnloadState: () => void;
  persistFileListCache: () => void;
  persistSidebarWidth: () => void;
  isFullscreenView: Ref<boolean>;
  /** 全屏或极简：边缘感应 / 光标隐藏 / 指针记录 */
  chromeAutoHide: Ref<boolean>;
  showSidebar: Ref<boolean>;
  sidebarWidth: Ref<number>;
  /** 全屏时非 null，与 sidebarWidth 分离；拖拽只改此值 */
  fullscreenSidebarWidth: Ref<number | null>;
  resizingSidebar: Ref<boolean>;
  getSidebarMaxWidth: () => number;
  getSidebarMinWidth: () => number;
  clampSidebarWidthToViewport: () => void;
  updateFullscreenHeaderHover: (ev: MouseEvent) => void;
  updateFullscreenFooterHover: (ev: MouseEvent) => void;
  updateFullscreenSidebarHover: (ev: MouseEvent) => void;
  endSidebarResize: () => void;
  dismissFullscreenChromeForNativeExit: () => void;
  /** 极简 / 全屏 Esc：关蒙版后的查找栏、浮动栏、连按两次退出全屏 */
  handleReaderChromeEscape: (ev: KeyboardEvent) => boolean;
  /** chrome 自动隐藏时鼠标移动重置「空闲隐藏光标」计时 */
  bumpFullscreenCursorIdle: () => void;
  /** chrome 自动隐藏时记录指针坐标，供侧栏浮层关闭后判断是否应收起 */
  recordFullscreenPointer?: (ev: MouseEvent) => void;
  enterOrExitFullscreenView: () => Promise<void>;
  toggleMinimalistView: () => void;
  toggleTheme: () => void;
  pulseChapterListCenter: (smooth: boolean) => void;
  syncChaptersAfterViewportSettled: () => void | Promise<void>;
  currentTheme: Ref<string>;
  readerFontSize: Ref<number>;
  readerLineHeightMultiple: Ref<number>;
  readerLineSpacingPx: Ref<number>;
  readerLetterSpacingPx: Ref<number>;
  monacoFontFamily: Ref<string>;
  fileEncoding: Ref<string>;
  loading: Ref<boolean>;
  /** 打开文件流式读取进度 0–100；无总大小时为 null */
  loadingProgressPercent: Ref<number | null>;
  pendingRestorePhysicalLine: Ref<number | null>;
  pendingRestoreEditorViewState: Ref<unknown | null>;
  pendingRestoreViewportTopPhysicalLine: Ref<number | null>;
  pendingRestoreViewportAnchor: Ref<
    import("../reader/readerViewportAnchor").ReaderViewportRestoreAnchor | null
  >;
  compressBlankLines: Ref<boolean>;
  suppressFileListCenterAfterLoad: Ref<boolean>;
  suppressChapterListAutoScroll: Ref<boolean>;
  txtFiles: Ref<Array<{ name: string; path: string; size: number }>>;
  sidebarTab: Ref<import("../constants/readerSidebarTab").ReaderSidebarTab>;
  currentFile: Ref<string | null>;
  dirListScanning: Ref<boolean>;
  dirListCurrentName: Ref<string>;
  chapterRuleErrorText: Ref<string>;
  showChapterRulePanel: Ref<boolean>;
  increaseFontSize: () => void;
  decreaseFontSize: () => void;
  increaseLineHeight: () => void;
  decreaseLineHeight: () => void;
  increaseLetterSpacing: () => void;
  decreaseLetterSpacing: () => void;
  increaseParagraphSpacing: () => void;
  decreaseParagraphSpacing: () => void;
  increaseHorizontalInset: () => void;
  decreaseHorizontalInset: () => void;
  openNewWindow: () => void;
  openFileViaDialog: () => Promise<void>;
  pickTxtDirectory: () => Promise<void>;
  onBookmarkClick: () => void;
  skipNextThemeNativeIpc: Ref<boolean>;
  jumpToPrevChapter: () => void;
  jumpToNextChapter: () => void;
  openSettings: () => void;
  openColorScheme: () => void;
  openFindBook: () => void;
  enterStealthReader: () => void;
  /** 主窗口无书源面板；找书窗口内由对应快捷键处理 */
  openBookSource?: () => void;
  toggleFind: () => void;
  openSidebarSearch: () => void;
  openSidebarFiles: () => void;
  openSidebarChapters: () => void;
  openSidebarAiAssistant: () => void;
  /** 极简 / 全屏下快捷键唤出浮动侧栏（不改 `showSidebar`） */
  revealFullscreenSidebar: () => void;
  toggleReaderEdit: () => void;
  editSelectedText: () => void;
  scrollDownLine: () => void;
  scrollUpLine: () => void;
  scrollPageUp: () => void;
  scrollPageDown: () => void;
  shortcutBindings: Ref<ShortcutBindingMap>;
  activeStreamRequestId: Ref<number | null>;
  activeStreamFilePath: Ref<string | null>;
  /** 流结束并完成阅读进度同步后为 true，此前 persistFileMeta 不写盘 */
  readingProgressSynced: Ref<boolean>;
  /** 拖入阅读区时，在阅读区容器上显示「打开文件」局部蒙层 */
  readerDropOverlayVisible: Ref<boolean>;
  /** 主进程拦截关窗后由渲染进程决定是否 `proceedCloseWindow` */
  handleWindowCloseRequest: () => Promise<void>;
  /** 编辑模式：焦点在 Monaco 内时，仅滚屏/查找等冲突快捷键交给编辑器，其余窗口快捷键仍生效 */
  readerEditMode: Ref<boolean>;
  /** 语音朗读播放中：禁用窗口级页滚/章节跳转/查找快捷键 */
  voiceReadScrollLocked?: Ref<boolean>;
  /** 语音朗读进行中（含暂停）：空格暂停/播放，左右换行 */
  isVoiceReadActive?: Ref<boolean>;
  onVoiceReadTogglePlayPause?: () => void;
  onVoiceReadPlayPrevLine?: () => void;
  onVoiceReadPlayNextLine?: () => void;
}) {
  const unsubscribers: Array<() => void> = [];
  const flushChapterListAfterChromeLayoutMs = 50;

  function pulseChapterListAfterChromeLayout() {
    void nextTick(() => {
      requestAnimationFrame(() => {
        window.setTimeout(() => {
          deps.pulseChapterListCenter(false);
        }, flushChapterListAfterChromeLayoutMs);
      });
    });
  }

  /** 退出极简（或 chrome 自动隐藏）后侧栏回到文档流，VirtualList 高度变了，需再居中当前章 */
  watch(deps.chromeAutoHide, (hidden, wasHidden) => {
    if (!wasHidden || hidden) return;
    pulseChapterListAfterChromeLayout();
  });

  onMounted(async () => {
    deps.readerRef.value?.setTheme(deps.currentTheme.value);
    deps.readerRef.value?.setFontSize(deps.readerFontSize.value);
    deps.readerRef.value?.setLineHeightMultiple(
      deps.readerLineHeightMultiple.value,
    );
    deps.readerRef.value?.setLineSpacingPx(deps.readerLineSpacingPx.value);
    deps.readerRef.value?.setLetterSpacingPx(deps.readerLetterSpacingPx.value);
    deps.readerRef.value?.setFontFamily(deps.monacoFontFamily.value);

    const onFullscreenChange = (payload: { isFullscreen: boolean }) => {
      const inFs = payload.isFullscreen;
      deps.isFullscreenView.value = inFs;
      if (inFs) {
        void nextTick(() => {
          requestAnimationFrame(() => {
            deps.readerRef.value?.focusEditor?.();
            window.setTimeout(() => {
              deps.pulseChapterListCenter(false);
            }, flushChapterListAfterChromeLayoutMs);
          });
        });
        return;
      }
      deps.dismissFullscreenChromeForNativeExit();
      pulseChapterListAfterChromeLayout();
    };
    unsubscribers.push(window.colorTxt.onFullscreenChanged(onFullscreenChange));

    const onDocumentKeydownEscapeChrome = (ev: KeyboardEvent) => {
      deps.handleReaderChromeEscape(ev);
    };
    document.addEventListener("keydown", onDocumentKeydownEscapeChrome, true);
    unsubscribers.push(() =>
      document.removeEventListener(
        "keydown",
        onDocumentKeydownEscapeChrome,
        true,
      ),
    );

    unsubscribers.push(
      window.colorTxt.onThemeSync((theme) => {
        if (theme !== "vs" && theme !== "vs-dark") return;
        if (theme === deps.currentTheme.value) return;
        deps.skipNextThemeNativeIpc.value = true;
        deps.currentTheme.value = theme;
      }),
    );

    unsubscribers.push(
      bindAppShortcuts(
        {
          openSettings: deps.openSettings,
          openColorScheme: deps.openColorScheme,
          openFindBook: deps.openFindBook,
          enterStealthReader: deps.enterStealthReader,
          openBookSource: deps.openBookSource ?? (() => {}),
          toggleFullscreen: deps.enterOrExitFullscreenView,
          increaseFontSize: deps.increaseFontSize,
          decreaseFontSize: deps.decreaseFontSize,
          increaseLineHeight: deps.increaseLineHeight,
          decreaseLineHeight: deps.decreaseLineHeight,
          increaseLetterSpacing: deps.increaseLetterSpacing,
          decreaseLetterSpacing: deps.decreaseLetterSpacing,
          increaseParagraphSpacing: deps.increaseParagraphSpacing,
          decreaseParagraphSpacing: deps.decreaseParagraphSpacing,
          increaseHorizontalInset: deps.increaseHorizontalInset,
          decreaseHorizontalInset: deps.decreaseHorizontalInset,
          toggleSidebar: () => {
            if (deps.chromeAutoHide.value) {
              deps.revealFullscreenSidebar();
              return;
            }
            deps.showSidebar.value = !deps.showSidebar.value;
          },
          toggleMinimalistView: deps.toggleMinimalistView,
          toggleTheme: deps.toggleTheme,
          openNewWindow: deps.openNewWindow,
          openFile: deps.openFileViaDialog,
          pickTxtDirectory: deps.pickTxtDirectory,
          openChapterRules: () => {
            deps.chapterRuleErrorText.value = "";
            deps.showChapterRulePanel.value = true;
          },
          toggleBookmark: deps.onBookmarkClick,
          jumpToPrevChapter: deps.jumpToPrevChapter,
          jumpToNextChapter: deps.jumpToNextChapter,
          toggleFind: deps.toggleFind,
          openSidebarSearch: deps.openSidebarSearch,
          openSidebarFiles: deps.openSidebarFiles,
          openSidebarChapters: deps.openSidebarChapters,
          openSidebarAiAssistant: deps.openSidebarAiAssistant,
          toggleReaderEdit: deps.toggleReaderEdit,
          editSelectedText: deps.editSelectedText,
          scrollDownLine: deps.scrollDownLine,
          scrollUpLine: deps.scrollUpLine,
          scrollPageUp: deps.scrollPageUp,
          scrollPageDown: deps.scrollPageDown,
        },
        () => deps.shortcutBindings.value,
        undefined,
        (action, ev) => {
          if (shouldDeferShortcutForReaderSidebar(action, ev)) return true;
          if (
            hasModalOrEscBeforeModalLayer() &&
            READER_SCROLL_SHORTCUT_ACTIONS.has(action)
          ) {
            return true;
          }
          if (
            keyboardTargetInsideFindWidget(ev) &&
            (action === "scrollUpLine" || action === "scrollDownLine")
          ) {
            return true;
          }
          return (
            deps.readerEditMode.value &&
            keyboardTargetInsideReaderMonacoEditor(ev, deps.readerRef) &&
            EDIT_MODE_MONACO_DEFERRED_ACTIONS.has(action)
          );
        },
        (action) =>
          Boolean(deps.voiceReadScrollLocked?.value) &&
          VOICE_READ_SCROLL_BLOCKED_ACTIONS.has(action),
        {
          isActive: () =>
            Boolean(deps.isVoiceReadActive?.value) &&
            !hasModalOrEscBeforeModalLayer(),
          togglePlayPause: () => deps.onVoiceReadTogglePlayPause?.(),
          playPrevLine: () => deps.onVoiceReadPlayPrevLine?.(),
          playNextLine: () => deps.onVoiceReadPlayNextLine?.(),
        },
        true,
        () => deps.readerEditMode.value,
      ),
    );

    if (!window.colorTxt) {
      await appAlert(
        `preload 未注入（__COLORTXT_PRELOAD__=${String(
          (window as unknown as { __COLORTXT_PRELOAD__?: unknown })
            .__COLORTXT_PRELOAD__,
        )}）`,
      );
      return;
    }
    const globalShortcutResult = await window.colorTxt.setGlobalShortcut(
      deps.shortcutBindings.value.toggleAllWindowsVisibility,
    );
    if (!globalShortcutResult.ok) {
      await appAlert(globalShortcutResult.message || "系统级快捷键设置失败");
    }

    const streamMatchesCurrent = (payload: {
      filePath: string;
      sessionFilePath?: string;
    }) =>
      (payload.sessionFilePath ?? payload.filePath) === deps.currentFile.value;

    unsubscribers.push(
      window.colorTxt.onStreamStart((payload) => {
        if (!streamMatchesCurrent(payload)) return;
        deps.activeStreamRequestId.value = payload.requestId;
        deps.activeStreamFilePath.value = payload.filePath;
        deps.fileEncoding.value = formatTextEncodingLabel(
          payload.encoding || "-",
        );
        const total = payload.totalBytes;
        deps.loadingProgressPercent.value = total > 0 ? 0 : null;
      }),
      window.colorTxt.onStreamChunk((payload) => {
        if (!streamMatchesCurrent(payload)) return;
        if (
          deps.activeStreamRequestId.value == null ||
          payload.requestId !== deps.activeStreamRequestId.value ||
          payload.filePath !== deps.activeStreamFilePath.value
        ) {
          return;
        }
        deps.stream.processChunk(payload.text);
        const total = payload.totalBytes;
        if (total > 0) {
          deps.loadingProgressPercent.value = Math.min(
            100,
            Math.round((payload.readBytes / total) * 100),
          );
        }
      }),
      window.colorTxt.onStreamEnd((payload) => {
        void (async () => {
          if (!streamMatchesCurrent(payload)) return;
          if (
            deps.activeStreamRequestId.value == null ||
            payload.requestId !== deps.activeStreamRequestId.value ||
            payload.filePath !== deps.activeStreamFilePath.value
          ) {
            return;
          }
          deps.activeStreamRequestId.value = null;
          deps.activeStreamFilePath.value = null;
          await deps.stream.flushCarry();
          deps.loading.value = false;
          deps.loadingProgressPercent.value = null;
          const restoreVs = deps.pendingRestoreEditorViewState.value;
          deps.pendingRestoreEditorViewState.value = null;
          const restoreAnchorPhy =
            deps.pendingRestoreViewportTopPhysicalLine.value;
          deps.pendingRestoreViewportTopPhysicalLine.value = null;
          const restorePhys = deps.pendingRestorePhysicalLine.value;
          deps.pendingRestorePhysicalLine.value = null;
          const restoreViewportAnchor = deps.pendingRestoreViewportAnchor.value;
          deps.pendingRestoreViewportAnchor.value = null;
          const totalPhysical = Math.max(1, deps.stream.getPhysicalLineCount());

          const markReadingProgressSynced = () => {
            deps.readingProgressSynced.value = true;
          };

          const finishReadingSync = () => {
            deps.readerRef.value?.normalizeScrollAfterEmbeddedViewZones?.();
            deps.readerRef.value?.emitProbeLine();
            const runChapterSync = () => {
              void Promise.resolve(deps.syncChaptersAfterViewportSettled()).then(
                () => {
                  markReadingProgressSynced();
                },
              );
            };
            const ric = (
              globalThis as typeof globalThis & {
                requestIdleCallback?: (
                  cb: () => void,
                  opts?: { timeout: number },
                ) => number;
              }
            ).requestIdleCallback;
            if (typeof ric === "function") {
              ric(() => runChapterSync(), { timeout: 3000 });
            } else {
              window.setTimeout(runChapterSync, 0);
            }
          };

          if (
            restoreVs != null &&
            typeof restoreVs === "object" &&
            !Array.isArray(restoreVs) &&
            restoreAnchorPhy != null &&
            Number.isFinite(restoreAnchorPhy)
          ) {
            const anchor = Math.max(1, Math.floor(restoreAnchorPhy));
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                deps.readerRef.value?.restoreEditorViewState?.(restoreVs);
                void nextTick(() => {
                  const reader = deps.readerRef.value;
                  if (!reader?.getViewportTopLine || !reader.jumpToLine) {
                    finishReadingSync();
                    return;
                  }
                  const current = deps.stream.viewportDisplayLineToPhysicalLine(
                    reader.getViewportTopLine(),
                  );
                  if (current === anchor) {
                    finishReadingSync();
                    return;
                  }
                  if (anchor >= totalPhysical) {
                    reader.scrollToBottom?.(false);
                    void nextTick(finishReadingSync);
                    return;
                  }
                  let displayLine =
                    deps.stream.physicalLineToDisplayForReader(anchor);
                  const maxDisplay = Math.max(1, deps.stream.getLineCount());
                  displayLine = Math.min(Math.max(1, displayLine), maxDisplay);
                  if (displayLine <= 1) {
                    reader.jumpToLine?.(1, false);
                  } else {
                    reader.jumpToLine(displayLine, false);
                  }
                  void nextTick(finishReadingSync);
                });
              });
            });
            return;
          }

          if (restoreViewportAnchor != null) {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                const map = deps.stream.getDisplayLineToPhysicalLine();
                void Promise.resolve(
                  deps.readerRef.value?.restoreViewportToRestoreAnchor?.(
                    restoreViewportAnchor,
                    map.length > 0 ? [...map] : undefined,
                  ),
                ).then(() => {
                  void nextTick(() => {
                    deps.readerRef.value?.normalizeScrollAfterEmbeddedViewZones?.();
                    deps.readerRef.value?.emitProbeLine();
                    void Promise.resolve(
                      deps.syncChaptersAfterViewportSettled(),
                    ).then(() => {
                      markReadingProgressSynced();
                    });
                  });
                });
              });
            });
            return;
          }

          let jumpLine: number | null = null;
          if (restorePhys != null && restorePhys >= totalPhysical) {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                deps.readerRef.value?.scrollToBottom?.(false);
                void nextTick(() => {
                  deps.readerRef.value?.normalizeScrollAfterEmbeddedViewZones?.();
                  deps.readerRef.value?.emitProbeLine();
                  void Promise.resolve(
                    deps.syncChaptersAfterViewportSettled(),
                  ).then(() => {
                    markReadingProgressSynced();
                  });
                });
              });
            });
            return;
          }

          if (restorePhys != null) {
            jumpLine = deps.stream.physicalLineToBottomDisplayForReader(
              Math.min(restorePhys, totalPhysical),
            );
            const maxDisplay = Math.max(1, deps.stream.getLineCount());
            jumpLine = Math.min(Math.max(1, jumpLine), maxDisplay);
          }

          if (jumpLine != null) {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                const reader = deps.readerRef.value;
                if (reader) {
                  /** 篇首：用顶对齐 jumpToLine(1)；随后 nextTick 里 normalize 会把「篇首插图」时的 scrollTop≈top1 钳到 0。 */
                  if (jumpLine <= 1) {
                    reader.jumpToLine?.(1, false);
                  } else {
                    reader.scrollLineToBottom?.(jumpLine, false);
                  }
                }
                void nextTick(() => {
                  deps.readerRef.value?.normalizeScrollAfterEmbeddedViewZones?.();
                  deps.readerRef.value?.emitProbeLine();
                  void Promise.resolve(
                    deps.syncChaptersAfterViewportSettled(),
                  ).then(() => {
                    markReadingProgressSynced();
                  });
                });
              });
            });
          } else {
            void nextTick(() => {
              deps.readerRef.value?.normalizeScrollAfterEmbeddedViewZones?.();
              deps.readerRef.value?.emitProbeLine();
              void Promise.resolve(deps.syncChaptersAfterViewportSettled()).then(
                () => {
                  markReadingProgressSynced();
                },
              );
            });
          }
        })();
      }),
      window.colorTxt.onStreamError((e) => {
        if (!streamMatchesCurrent(e)) return;
        if (
          deps.activeStreamRequestId.value == null ||
          e.requestId !== deps.activeStreamRequestId.value ||
          e.filePath !== deps.activeStreamFilePath.value
        ) {
          return;
        }
        deps.activeStreamRequestId.value = null;
        deps.activeStreamFilePath.value = null;
        deps.loading.value = false;
        deps.loadingProgressPercent.value = null;
        deps.pendingRestorePhysicalLine.value = null;
        deps.pendingRestoreEditorViewState.value = null;
        deps.pendingRestoreViewportTopPhysicalLine.value = null;
        deps.pendingRestoreViewportAnchor.value = null;
        deps.suppressFileListCenterAfterLoad.value = false;
        deps.suppressChapterListAutoScroll.value = false;
        deps.readingProgressSynced.value = true;
        void appAlert(`读取失败：${e.message}`);
      }),
    );

    /** 非文件列表区域 drop：仅打开拖入列表中最外层第一个支持的文件（含彩读书包，同「打开文件」） */
    async function openFirstSupportedTopLevelPath(paths: string[]) {
      for (const p of paths) {
        try {
          const st = await window.colorTxt.stat(p);
          if (!st.isFile) continue;
          if (!isSupportedBookPath(p) && !looksLikeZipBookPackCandidate(p)) {
            continue;
          }
          await deps.fileSession.openFilePath(p);
          return;
        } catch {
          /* 跳过该路径 */
        }
      }
    }

    function clearReaderDropOverlay() {
      deps.readerDropOverlayVisible.value = false;
    }

    function syncReaderDropOverlayFromEvent(ev: DragEvent) {
      const dt = ev.dataTransfer;
      if (!dataTransferLikelyHasExternalFiles(dt)) {
        clearReaderDropOverlay();
        return;
      }
      if (isOverSidebarImportDropZone(ev)) {
        clearReaderDropOverlay();
        return;
      }
      /** 侧栏以外（含顶栏、底栏、阅读区等）在阅读区容器上提示「打开文件」 */
      deps.readerDropOverlayVisible.value = true;
    }

    const onDragOver = (ev: DragEvent) => {
      if (!dataTransferLikelyHasExternalFiles(ev.dataTransfer)) return;
      ev.preventDefault();
      if (ev.dataTransfer) ev.dataTransfer.dropEffect = "copy";
      syncReaderDropOverlayFromEvent(ev);
    };

    const onDragEnter = (ev: DragEvent) => {
      if (!dataTransferLikelyHasExternalFiles(ev.dataTransfer)) return;
      ev.preventDefault();
      syncReaderDropOverlayFromEvent(ev);
    };

    const onWindowDragLeave = (ev: DragEvent) => {
      if (!dataTransferLikelyHasExternalFiles(ev.dataTransfer)) return;
      const related = ev.relatedTarget;
      if (
        related instanceof Node &&
        document.documentElement.contains(related)
      ) {
        return;
      }
      clearReaderDropOverlay();
    };

    const onWindowDragEnd = () => {
      clearReaderDropOverlay();
    };

    const onDrop = (ev: DragEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      clearReaderDropOverlay();

      const paths = collectFsPathsFromDataTransfer(ev.dataTransfer);
      if (paths.length === 0) return;

      void openFirstSupportedTopLevelPath(paths);
    };

    window.addEventListener("dragover", onDragOver, true);
    window.addEventListener("dragenter", onDragEnter, true);
    window.addEventListener("dragleave", onWindowDragLeave, true);
    document.addEventListener("drop", onDrop, false);
    window.addEventListener("dragend", onWindowDragEnd, false);
    unsubscribers.push(() =>
      window.removeEventListener("dragover", onDragOver, true),
    );
    unsubscribers.push(() =>
      window.removeEventListener("dragenter", onDragEnter, true),
    );
    unsubscribers.push(() =>
      window.removeEventListener("dragleave", onWindowDragLeave, true),
    );
    unsubscribers.push(() =>
      document.removeEventListener("drop", onDrop, false),
    );
    unsubscribers.push(() =>
      window.removeEventListener("dragend", onWindowDragEnd, false),
    );

    const onMouseMove = (ev: MouseEvent) => {
      if (deps.resizingSidebar.value) {
        const next = Math.min(
          deps.getSidebarMaxWidth(),
          Math.max(deps.getSidebarMinWidth(), ev.clientX),
        );
        if (
          deps.isFullscreenView.value &&
          deps.fullscreenSidebarWidth.value != null
        ) {
          deps.fullscreenSidebarWidth.value = next;
        } else {
          deps.sidebarWidth.value = next;
        }
      }
      deps.updateFullscreenHeaderHover(ev);
      deps.updateFullscreenFooterHover(ev);
      deps.updateFullscreenSidebarHover(ev);
      if (deps.chromeAutoHide.value) {
        deps.recordFullscreenPointer?.(ev);
      }
      if (deps.chromeAutoHide.value && !deps.resizingSidebar.value) {
        deps.bumpFullscreenCursorIdle();
      }
    };
    const onResize = () => {
      deps.clampSidebarWidthToViewport();
    };
    window.addEventListener("resize", onResize);
    const onMouseUp = () => {
      const wasResizing = deps.resizingSidebar.value;
      deps.endSidebarResize();
      if (wasResizing) {
        deps.persistSidebarWidth();
      }
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    unsubscribers.push(() =>
      document.removeEventListener("mousemove", onMouseMove),
    );
    unsubscribers.push(() =>
      document.removeEventListener("mouseup", onMouseUp),
    );
    unsubscribers.push(() => window.removeEventListener("resize", onResize));

    const flushPersistence = () => {
      // 会话/文件列表/meta；界面设置仅在变更时落盘（设置确定、工具栏改字号等），
      // 避免关窗用本窗旧内存覆盖其它窗（如找书）已写入的 colorTxt.ui.settings。
      deps.persistWindowUnloadState();
    };
    window.addEventListener("pagehide", flushPersistence);
    unsubscribers.push(() =>
      window.removeEventListener("pagehide", flushPersistence),
    );
    // Electron/Windows 下个别关闭路径对 pagehide 不可靠，beforeunload 作兜底
    window.addEventListener("beforeunload", flushPersistence);
    unsubscribers.push(() =>
      window.removeEventListener("beforeunload", flushPersistence),
    );

    deps.clampSidebarWidthToViewport();
    await nextTick();

    unsubscribers.push(
      window.colorTxt.onOpenTxtFromShell((filePath) => {
        void deps.fileSession.openFilePath(filePath);
      }),
    );

    unsubscribers.push(
      window.colorTxt.onWindowRequestClose(() => {
        void deps.handleWindowCloseRequest();
      }),
    );

    const pendingShellTxt = await window.colorTxt.consumePendingOpenTxtPath();
    if (pendingShellTxt) {
      await deps.fileSession.openFilePath(pendingShellTxt);
    }

    // 文件列表独立持久化：始终恢复，和“恢复上次阅读会话”开关解耦
    deps.fileSession.restoreFileListFromSession();

    const shouldRestoreSession = await window.colorTxt.shouldRestoreSession();
    if (shouldRestoreSession) {
      await deps.fileSession.tryRestoreSession();
    }

    // 启动后自动刷新一次文件列表（静默，不弹提示）：并入新增文件、剔除已失效文件。
    // 不 await，避免大目录扫描拖慢启动；失败也不影响启动流程。
    void deps.fileSession.refreshFileListDirectories().catch(() => {});
  });

  onBeforeUnmount(() => {
    deps.persistWindowUnloadState();
    for (const u of unsubscribers) u();
  });
}
