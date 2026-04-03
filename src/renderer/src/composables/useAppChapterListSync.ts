import { nextTick, ref } from "vue";

/**
 * 侧栏章节/文件列表「滚到当前项」的一拍同步（与 VirtualList scrollend 配合）。
 */
export function useAppChapterListSync() {
  /** 阅读器滚动换章时一拍为 true，章节列表平滑滚入 */
  const chapterListScrollSmooth = ref(false);
  /**
   * 为 true 时侧栏将章节列表滚到当前章（居中/滚入视口）。
   * 由 App 在「阅读器换章 / 恢复进度 / 全屏切换」等场景 pulse 一拍。
   */
  const shouldCenterChapterList = ref(false);

  /** 触发章节列表跟随当前章（smooth 仅阅读器滚动换章时为 true） */
  function pulseChapterListCenter(smooth: boolean) {
    chapterListScrollSmooth.value = smooth;
    shouldCenterChapterList.value = true;
    void nextTick(() => {
      chapterListScrollSmooth.value = false;
      shouldCenterChapterList.value = false;
    });
  }

  /** 为 true 时侧栏将文件列表滚到当前文件并居中（一拍后清除） */
  const shouldCenterFileList = ref(false);
  /** 从侧栏文件列表点开打开时置 true，openFilePath 内跳过本次文件列表居中 */
  const suppressFileListCenterAfterLoad = ref(false);

  function pulseFileListCenter() {
    shouldCenterFileList.value = true;
    void nextTick(() => {
      shouldCenterFileList.value = false;
    });
  }

  /** 为 true 时侧栏将书签列表滚到当前书签并居中（一拍后清除） */
  const shouldCenterBookmarkList = ref(false);

  function pulseBookmarkListCenter() {
    shouldCenterBookmarkList.value = true;
    void nextTick(() => {
      shouldCenterBookmarkList.value = false;
    });
  }

  return {
    chapterListScrollSmooth,
    shouldCenterChapterList,
    pulseChapterListCenter,
    shouldCenterFileList,
    suppressFileListCenterAfterLoad,
    pulseFileListCenter,
    shouldCenterBookmarkList,
    pulseBookmarkListCenter,
  };
}
