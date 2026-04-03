<script setup lang="ts">
import IconButton from "./IconButton.vue";
import FontPicker from "./FontPicker.vue";
import MoreMenu from "./MoreMenu.vue";
import { icons } from "../icons";

/** 仅路径；阅读进度由 `file.meta` 提供（菜单侧由父组件合并） */
export type RecentFileItem = { path: string; progress?: number };

withDefaults(
  defineProps<{
    currentTheme: string;
    showSidebar: boolean;
    canIncreaseFont: boolean;
    canDecreaseFont: boolean;
    canIncreaseLineHeight: boolean;
    canDecreaseLineHeight: boolean;
    monacoFontFamily: string;
    /** Monaco 高级换行策略（wrappingStrategy: advanced）是否开启 */
    monacoAdvancedWrapping: boolean;
    /** Monaco 自定义语法着色是否开启 */
    monacoCustomHighlight: boolean;
    /** 是否在加载时过滤空行 */
    compressBlankLines: boolean;
    /** 是否将正文行首统一为两个全角空格（章节标题与空行除外） */
    leadIndentFullWidth: boolean;
    /** 当前是否处于全屏阅读（全屏浮动顶栏为 true，用于全屏按钮图标与提示） */
    inFullscreen?: boolean;
    /** 最近打开的文件（含阅读进度），最多 20 条 */
    recentFiles?: RecentFileItem[];
    /** 书钉是否已记录阅读位置 */
    pinActive?: boolean;
    /** 是否允许钉住（无文件、加载中或空文件时为 false） */
    canPin?: boolean;
    bookmarkActive?: boolean;
    canBookmark?: boolean;
  }>(),
  {
    inFullscreen: false,
    recentFiles: () => [],
    pinActive: false,
    canPin: true,
    bookmarkActive: false,
    canBookmark: true,
  },
);

const emit = defineEmits<{
  openFile: [];
  changeTheme: [theme: string];
  toggleSidebar: [];
  toggleFullscreen: [];
  setMonacoFont: [fontFamily: string];
  increaseFontSize: [];
  decreaseFontSize: [];
  increaseLineHeight: [];
  decreaseLineHeight: [];
  toggleCompressBlankLines: [];
  toggleLeadIndentFullWidth: [];
  toggleMonacoAdvancedWrapping: [];
  toggleMonacoCustomHighlight: [];
  toggleFind: [];
  openChapterRules: [];
  openGithub: [];
  checkForUpdates: [];
  openShortcuts: [];
  openSettings: [];
  openNewWindow: [];
  openAbout: [];
  quitApp: [];
  openRecentFile: [filePath: string];
  clearRecentFiles: [];
  pinClick: [];
  goBackFromPin: [];
  bookmarkClick: [];
}>();
</script>

<template>
  <header class="header">
    <button class="btn primary" size="large" @click="$emit('openFile')">
      打开文件
    </button>
    <div class="themePicker">
      <div class="headerQuickRow">
        <IconButton
          v-if="pinActive"
          :icon-html="icons.back"
          title="回到之前记住的位置"
          aria-label="回到之前记住的位置"
          @click="emit('goBackFromPin')"
        />
        <IconButton
          :icon-html="pinActive ? icons.pinActive : icons.pin"
          :active="pinActive"
          :pressed="pinActive"
          :title="pinActive ? '清除书钉' : '书钉：记住当前的位置'"
          :aria-label="pinActive ? '清除书钉' : '书钉：记住当前的位置'"
          :disabled="!pinActive && !canPin"
          @click="emit('pinClick')"
        />
        <IconButton
          :icon-html="bookmarkActive ? icons.bookmarkActive : icons.bookmark"
          :active="bookmarkActive"
          :pressed="bookmarkActive"
          :title="bookmarkActive ? '移除书签' : '添加书签'"
          :aria-label="bookmarkActive ? '移除书签' : '添加书签'"
          :disabled="!bookmarkActive && !canBookmark"
          @click="emit('bookmarkClick')"
        />
        <span class="toolbarDivider" aria-hidden="true"></span>
        <FontPicker
          :monaco-font-family="monacoFontFamily"
          @set-monaco-font="(fontFamily) => emit('setMonacoFont', fontFamily)"
        />
        <IconButton
          :icon-html="icons.fontSizeDown"
          title="减小字号"
          aria-label="减小字号"
          :disabled="!canDecreaseFont"
          @click="emit('decreaseFontSize')"
        />
        <IconButton
          :icon-html="icons.fontSizeUp"
          title="加大字号"
          aria-label="加大字号"
          :disabled="!canIncreaseFont"
          @click="emit('increaseFontSize')"
        />
        <IconButton
          :icon-html="icons.lineHeightDown"
          title="减小行高"
          aria-label="减小行高"
          :disabled="!canDecreaseLineHeight"
          @click="emit('decreaseLineHeight')"
        />
        <IconButton
          :icon-html="icons.lineHeightUp"
          title="加大行高"
          aria-label="加大行高"
          :disabled="!canIncreaseLineHeight"
          @click="emit('increaseLineHeight')"
        />
        <span class="toolbarDivider" aria-hidden="true"></span>
        <IconButton
          :icon-html="icons.compress"
          :active="compressBlankLines"
          :pressed="compressBlankLines"
          title="压缩空行"
          aria-label="压缩空行"
          @click="emit('toggleCompressBlankLines')"
        />
        <IconButton
          :icon-html="icons.indent"
          :active="leadIndentFullWidth"
          :pressed="leadIndentFullWidth"
          title="行首缩进"
          aria-label="行首缩进"
          @click="emit('toggleLeadIndentFullWidth')"
        />
      </div>
      <IconButton
        :icon-html="icons.advancedWrapping"
        :active="monacoAdvancedWrapping"
        :pressed="monacoAdvancedWrapping"
        title="高级换行策略
开启可以优化换行效果，但对性能影响较大。"
        aria-label="高级换行策略"
        @click="$emit('toggleMonacoAdvancedWrapping')"
      />
      <IconButton
        :icon-html="icons.palette"
        multicolor
        :active="monacoCustomHighlight"
        :pressed="monacoCustomHighlight"
        title="内容上色"
        @click="$emit('toggleMonacoCustomHighlight')"
      />
      <span class="toolbarDivider" aria-hidden="true"></span>
      <IconButton
        :icon-html="icons.regExp"
        title="章节匹配规则"
        @click="$emit('openChapterRules')"
      />
      <IconButton
        :icon-html="currentTheme === 'vs' ? icons.light : icons.dark"
        :title="
          currentTheme === 'vs'
            ? '当前亮色，点击切换暗色'
            : '当前暗色，点击切换亮色'
        "
        @click="$emit('changeTheme', currentTheme === 'vs' ? 'vs-dark' : 'vs')"
      />
      <IconButton
        v-if="!inFullscreen"
        :icon-html="icons.sidebar"
        :active="showSidebar"
        :pressed="showSidebar"
        title="切换侧边栏"
        @click="$emit('toggleSidebar')"
      />
      <IconButton
        :icon-html="
          inFullscreen ? icons.leaveFullscreen : icons.enterFullscreen
        "
        :title="inFullscreen ? '退出全屏' : '全屏阅读'"
        @click="$emit('toggleFullscreen')"
      />
      <MoreMenu
        :recent-files="recentFiles"
        @toggle-find="emit('toggleFind')"
        @open-github="emit('openGithub')"
        @check-for-updates="emit('checkForUpdates')"
        @open-shortcuts="emit('openShortcuts')"
        @open-settings="emit('openSettings')"
        @open-new-window="emit('openNewWindow')"
        @open-about="emit('openAbout')"
        @quit-app="emit('quitApp')"
        @open-recent-file="(filePath) => emit('openRecentFile', filePath)"
        @clear-recent-files="emit('clearRecentFiles')"
      />
    </div>
  </header>
</template>

<style scoped>
.header {
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  display: flex;
  flex-shrink: 0;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  padding: 10px;
  min-height: 0;
  overflow: visible;
}

.themePicker {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
  flex-shrink: 0;
  margin-left: auto;
}

.headerQuickRow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.toolbarDivider {
  width: 1px;
  height: 22px;
  background: var(--border);
  flex-shrink: 0;
  margin: 0 10px;
}
</style>
