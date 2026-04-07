import { nextTick, onBeforeUnmount, onMounted, type Ref } from "vue";
import type ReaderMain from "../components/ReaderMain.vue";
import { mergeTxtFileLists } from "../services/fileListService";
import { bindAppShortcuts } from "../services/shortcutService";
import { hasModalOnStack } from "../utils/modalStack";
import { useAppFileSession } from "./useAppFileSession";
import { useTxtStreamPipeline } from "./useTxtStreamPipeline";
import type { ShortcutBindingMap } from "../services/shortcutRegistry";

type FileSession = ReturnType<typeof useAppFileSession>;
type Stream = ReturnType<typeof useTxtStreamPipeline>;

export function useAppWindowBindings(deps: {
  readerRef: Ref<InstanceType<typeof ReaderMain> | null>;
  stream: Stream;
  fileSession: FileSession;
  persistWindowUnloadState: () => void;
  persistFileListCache: () => void;
  persistSettings: () => void;
  isFullscreenView: Ref<boolean>;
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
  /** 全屏下鼠标移动时重置「空闲隐藏光标」计时 */
  bumpFullscreenCursorIdle: () => void;
  enterOrExitFullscreenView: () => Promise<void>;
  pulseChapterListCenter: (smooth: boolean) => void;
  currentTheme: Ref<string>;
  readerFontSize: Ref<number>;
  readerLineHeightMultiple: Ref<number>;
  monacoFontFamily: Ref<string>;
  fileEncoding: Ref<string>;
  loading: Ref<boolean>;
  /** 打开文件流式读取进度 0–100；无总大小时为 null */
  loadingProgressPercent: Ref<number | null>;
  pendingRestorePhysicalLine: Ref<number | null>;
  pendingRestoreEditorViewState: Ref<unknown | null>;
  pendingRestoreViewportTopPhysicalLine: Ref<number | null>;
  compressBlankLines: Ref<boolean>;
  suppressFileListCenterAfterLoad: Ref<boolean>;
  txtFiles: Ref<Array<{ name: string; path: string; size: number }>>;
  sidebarTab: Ref<"files" | "chapters" | "bookmarks">;
  currentFile: Ref<string | null>;
  dirListScanning: Ref<boolean>;
  dirListCurrentName: Ref<string>;
  chapterRuleErrorText: Ref<string>;
  showChapterRulePanel: Ref<boolean>;
  increaseFontSize: () => void;
  decreaseFontSize: () => void;
  increaseLineHeight: () => void;
  decreaseLineHeight: () => void;
  openNewWindow: () => void;
  openFileViaDialog: () => Promise<void>;
  pickTxtDirectory: () => Promise<void>;
  onBookmarkClick: () => void;
  skipNextThemeNativeIpc: Ref<boolean>;
  jumpToPrevChapter: () => void;
  jumpToNextChapter: () => void;
  openSettings: () => void;
  openColorScheme: () => void;
  toggleFind: () => void;
  scrollDownLine: () => void;
  scrollUpLine: () => void;
  scrollPageUp: () => void;
  scrollPageDown: () => void;
  shortcutBindings: Ref<ShortcutBindingMap>;
  activeStreamRequestId: Ref<number | null>;
  activeStreamFilePath: Ref<string | null>;
  /** 流结束并完成阅读进度同步后为 true，此前 persistFileMeta 不写盘 */
  readingProgressSynced: Ref<boolean>;
}) {
  const unsubscribers: Array<() => void> = [];

  onMounted(async () => {
    deps.readerRef.value?.setTheme(deps.currentTheme.value);
    deps.readerRef.value?.setFontSize(deps.readerFontSize.value);
    deps.readerRef.value?.setLineHeightMultiple(
      deps.readerLineHeightMultiple.value,
    );
    deps.readerRef.value?.setFontFamily(deps.monacoFontFamily.value);

    const flushChapterListAfterFullscreenMs = 50;

    const onFullscreenChange = (payload: { isFullscreen: boolean }) => {
      const inFs = payload.isFullscreen;
      deps.isFullscreenView.value = inFs;
      if (inFs) {
        void nextTick(() => {
          requestAnimationFrame(() => {
            deps.readerRef.value?.focusEditor?.();
            window.setTimeout(() => {
              deps.pulseChapterListCenter(false);
            }, flushChapterListAfterFullscreenMs);
          });
        });
        return;
      }
      if (!inFs) {
        deps.dismissFullscreenChromeForNativeExit();
        void nextTick(() => {
          requestAnimationFrame(() => {
            window.setTimeout(() => {
              deps.pulseChapterListCenter(false);
            }, flushChapterListAfterFullscreenMs);
          });
        });
      }
    };
    unsubscribers.push(
      window.colorTxt.onFullscreenChanged(onFullscreenChange),
    );

    const onDocumentKeydownEscapeFullscreen = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      if (!deps.isFullscreenView.value) return;
      // 有模态时仅由 modalStack 的捕获监听 resolve 一次；此处再 resolve 会关两层
      if (hasModalOnStack()) return;
      ev.preventDefault();
      ev.stopPropagation();
      if (deps.readerRef.value?.isFindWidgetRevealed?.()) {
        deps.readerRef.value?.toggleFindWidget?.();
        return;
      }
      void window.colorTxt.setFullscreen(false).catch(() => {});
    };
    document.addEventListener(
      "keydown",
      onDocumentKeydownEscapeFullscreen,
      true,
    );
    unsubscribers.push(() =>
      document.removeEventListener(
        "keydown",
        onDocumentKeydownEscapeFullscreen,
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
          toggleFullscreen: deps.enterOrExitFullscreenView,
          increaseFontSize: deps.increaseFontSize,
          decreaseFontSize: deps.decreaseFontSize,
          increaseLineHeight: deps.increaseLineHeight,
          decreaseLineHeight: deps.decreaseLineHeight,
          toggleSidebar: () => {
            deps.showSidebar.value = !deps.showSidebar.value;
          },
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
          scrollDownLine: deps.scrollDownLine,
          scrollUpLine: deps.scrollUpLine,
          scrollPageUp: deps.scrollPageUp,
          scrollPageDown: deps.scrollPageDown,
        },
        () => deps.shortcutBindings.value,
        () => !hasModalOnStack(),
      ),
    );

    if (!window.colorTxt) {
      window.alert(
        `preload 未注入（__COLORTXT_PRELOAD__=${String(
          (window as unknown as { __COLORTXT_PRELOAD__?: unknown })
            .__COLORTXT_PRELOAD__,
        )}）`,
      );
    }
    const globalShortcutResult = await window.colorTxt.setGlobalShortcut(
      deps.shortcutBindings.value.toggleAllWindowsVisibility,
    );
    if (!globalShortcutResult.ok) {
      window.alert(globalShortcutResult.message || "系统级快捷键设置失败");
    }

    unsubscribers.push(
      window.colorTxt.onStreamStart((payload) => {
        if (payload.filePath !== deps.currentFile.value) return;
        deps.activeStreamRequestId.value = payload.requestId;
        deps.activeStreamFilePath.value = payload.filePath;
        deps.fileEncoding.value = payload.encoding || "-";
        const total = payload.totalBytes;
        deps.loadingProgressPercent.value = total > 0 ? 0 : null;
      }),
      window.colorTxt.onStreamChunk((payload) => {
        if (payload.filePath !== deps.currentFile.value) return;
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
        if (payload.filePath !== deps.currentFile.value) return;
        if (
          deps.activeStreamRequestId.value == null ||
          payload.requestId !== deps.activeStreamRequestId.value ||
          payload.filePath !== deps.activeStreamFilePath.value
        ) {
          return;
        }
        deps.activeStreamRequestId.value = null;
        deps.activeStreamFilePath.value = null;
        deps.stream.flushCarry();
        deps.loading.value = false;
        deps.loadingProgressPercent.value = null;
        const restoreVs = deps.pendingRestoreEditorViewState.value;
        deps.pendingRestoreEditorViewState.value = null;
        const restoreAnchorPhy = deps.pendingRestoreViewportTopPhysicalLine.value;
        deps.pendingRestoreViewportTopPhysicalLine.value = null;
        const restorePhys = deps.pendingRestorePhysicalLine.value;
        deps.pendingRestorePhysicalLine.value = null;
        const totalPhysical = Math.max(1, deps.stream.getPhysicalLineCount());

        const markReadingProgressSynced = () => {
          deps.readingProgressSynced.value = true;
        };

        const finishReadingSync = () => {
          deps.pulseChapterListCenter(false);
          markReadingProgressSynced();
          deps.readerRef.value?.emitProbeLine();
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
                let displayLine = deps.stream.physicalLineToDisplayForReader(
                  anchor,
                );
                const maxDisplay = Math.max(1, deps.stream.getLineCount());
                displayLine = Math.min(
                  Math.max(1, displayLine),
                  maxDisplay,
                );
                reader.jumpToLine(displayLine, false);
                void nextTick(finishReadingSync);
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
                deps.pulseChapterListCenter(false);
                markReadingProgressSynced();
                deps.readerRef.value?.emitProbeLine();
              });
            });
          });
          return;
        }

        if (restorePhys != null) {
          if (deps.compressBlankLines.value) {
            jumpLine = deps.stream.physicalLineToDisplayForReader(restorePhys);
          } else {
            jumpLine = Math.min(restorePhys, totalPhysical);
          }
          const maxDisplay = Math.max(1, deps.stream.getLineCount());
          jumpLine = Math.min(Math.max(1, jumpLine), maxDisplay);
        }

        if (jumpLine != null) {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              deps.readerRef.value?.scrollLineToBottom?.(jumpLine, false);
              void nextTick(() => {
                deps.pulseChapterListCenter(false);
                markReadingProgressSynced();
                deps.readerRef.value?.emitProbeLine();
              });
            });
          });
        } else {
          void nextTick(() => {
            markReadingProgressSynced();
            deps.readerRef.value?.emitProbeLine();
          });
        }
      }),
      window.colorTxt.onStreamError((e) => {
        if (e.filePath !== deps.currentFile.value) return;
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
        deps.suppressFileListCenterAfterLoad.value = false;
        deps.readingProgressSynced.value = true;
        window.alert(`读取失败：${e.message}`);
      }),
    );

    const onDragOver = (ev: DragEvent) => {
      ev.preventDefault();
      if (ev.dataTransfer) ev.dataTransfer.dropEffect = "copy";
    };
    const onDrop = (ev: DragEvent) => {
      ev.preventDefault();
      ev.stopPropagation();

      const dt = ev.dataTransfer;
      if (!dt) return;

      const file: File | undefined =
        dt.items?.[0]?.kind === "file"
          ? (dt.items[0].getAsFile() ?? undefined)
          : dt.files?.[0];

      if (!file) return;

      const filePath = window.colorTxt.getPathForFile(file);
      if (!filePath) {
        window.alert("拖放文件无法解析真实路径");
        return;
      }

      void (async () => {
        const fileStat = await window.colorTxt.stat(filePath);
        if (fileStat.isDirectory) {
          const unsub = deps.fileSession.subscribeDirListTxtScan();
          try {
            const dirResult =
              await window.colorTxt.listTxtFilesInDirectory(filePath);
            deps.txtFiles.value = mergeTxtFileLists(
              deps.txtFiles.value,
              dirResult.files,
            );
            deps.persistFileListCache();
            deps.sidebarTab.value = "files";
            deps.fileSession.centerFileListIfCurrentInList();
            if (
              !deps.currentFile.value ||
              !deps.txtFiles.value.some(
                (f) => f.path === deps.currentFile.value,
              )
            ) {
              deps.fileSession.scrollFileListsToIndex(0);
            }
          } finally {
            unsub();
            deps.dirListScanning.value = false;
            deps.dirListCurrentName.value = "";
          }
          return;
        }
        if (!fileStat.isFile) {
          window.alert("拖放目标不是有效文件或目录");
          return;
        }
        const name = file.name ?? "";
        if (name && !name.toLowerCase().endsWith(".txt")) {
          window.alert(`仅支持 .txt：${name}`);
          return;
        }
        void deps.fileSession.openFilePath(filePath);
      })();
    };

    document.addEventListener("dragover", onDragOver, true);
    document.addEventListener("drop", onDrop, true);
    unsubscribers.push(() =>
      document.removeEventListener("dragover", onDragOver, true),
    );
    unsubscribers.push(() =>
      document.removeEventListener("drop", onDrop, true),
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
      if (deps.isFullscreenView.value && !deps.resizingSidebar.value) {
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
        deps.persistSettings();
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
      deps.persistWindowUnloadState();
      deps.persistSettings();
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
  });

  onBeforeUnmount(() => {
    deps.persistWindowUnloadState();
    for (const u of unsubscribers) u();
  });
}
