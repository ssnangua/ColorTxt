<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import IconButton from "./IconButton.vue";
import FontPicker from "./FontPicker.vue";
import MoreMenu from "./MoreMenu.vue";
import { icons } from "../icons";
import type { ShortcutBindingMap } from "../services/shortcutRegistry";
import { APP_CHROME_POPOVER_Z_INDEX } from "../utils/modalStack";

/** 仅路径；阅读进度由 `file.meta` 提供（菜单侧由父组件合并） */
export type RecentFileItem = { path: string; progress?: number };

const props = withDefaults(
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
    highlightTerms?: Array<{ text: string; color: string; colorIndex: number }>;
    highlightPreviewBg?: string;
    /** 与快捷键面板、按键处理一致，用于「更多」菜单旁展示的快捷键 */
    shortcutBindings: ShortcutBindingMap;
  }>(),
  {
    inFullscreen: false,
    recentFiles: () => [],
    pinActive: false,
    canPin: true,
    bookmarkActive: false,
    canBookmark: true,
    highlightTerms: () => [],
    highlightPreviewBg: "var(--reader-bg, var(--bg))",
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
  openColorScheme: [];
  openNewWindow: [];
  openAbout: [];
  quitApp: [];
  openRecentFile: [filePath: string];
  clearRecentFiles: [];
  pinClick: [];
  goBackFromPin: [];
  bookmarkClick: [];
  removeHighlightTerm: [text: string];
  /** 点击高亮词项：父组件应钉书钉（若未钉）并打开 Monaco 查找该词 */
  findHighlightTerm: [text: string];
}>();

const highlightMenuOpen = ref(false);
const highlightMenuRootEl = ref<HTMLElement | null>(null);
const highlightMenuBodyRef = ref<HTMLElement | null>(null);
/** 与 AppCustomSelect 一致：仅在实际出现纵向滚动条时加右侧内边距 */
const highlightMenuBodyHasScrollbar = ref(false);
let highlightMenuBodyResizeObserver: ResizeObserver | null = null;

const hasHighlightTerms = computed(() => props.highlightTerms.length > 0);

/** 须高于 ReaderMain `.hlFloatRoot`（5980），否则高亮笔尖会盖住顶栏菜单 */
const highlightPickerWrapStyle = computed(() =>
  highlightMenuOpen.value ? { zIndex: APP_CHROME_POPOVER_Z_INDEX } : {},
);

function updateHighlightMenuScrollbarFlag() {
  const el = highlightMenuBodyRef.value;
  if (!el) {
    highlightMenuBodyHasScrollbar.value = false;
    return;
  }
  highlightMenuBodyHasScrollbar.value = el.scrollHeight - el.clientHeight > 0.5;
}

function bindHighlightMenuBodyResizeObserver() {
  unbindHighlightMenuBodyResizeObserver();
  const el = highlightMenuBodyRef.value;
  if (!el) return;
  highlightMenuBodyResizeObserver = new ResizeObserver(() => {
    updateHighlightMenuScrollbarFlag();
  });
  highlightMenuBodyResizeObserver.observe(el);
}

function unbindHighlightMenuBodyResizeObserver() {
  highlightMenuBodyResizeObserver?.disconnect();
  highlightMenuBodyResizeObserver = null;
}

function toggleHighlightMenu() {
  highlightMenuOpen.value = !highlightMenuOpen.value;
}

function closeHighlightMenu() {
  highlightMenuOpen.value = false;
}

function onRemoveHighlightTermClick(ev: MouseEvent, text: string) {
  ev.preventDefault();
  ev.stopPropagation();
  emit("removeHighlightTerm", text);
}

function onHighlightItemClick(text: string) {
  emit("findHighlightTerm", text);
}

const onPointerDown = (ev: PointerEvent) => {
  if (!highlightMenuOpen.value) return;
  const root = highlightMenuRootEl.value;
  if (!root) return;
  const target = ev.target as Node | null;
  if (target && root.contains(target)) return;
  closeHighlightMenu();
};

watch(highlightMenuOpen, async (open) => {
  if (open) {
    await nextTick();
    updateHighlightMenuScrollbarFlag();
    bindHighlightMenuBodyResizeObserver();
    requestAnimationFrame(() => {
      updateHighlightMenuScrollbarFlag();
    });
  } else {
    unbindHighlightMenuBodyResizeObserver();
    highlightMenuBodyHasScrollbar.value = false;
  }
});

watch(
  () => props.highlightTerms.length,
  async () => {
    if (!highlightMenuOpen.value) return;
    await nextTick();
    updateHighlightMenuScrollbarFlag();
  },
);

onMounted(() => {
  document.addEventListener("pointerdown", onPointerDown, true);
});

onBeforeUnmount(() => {
  unbindHighlightMenuBodyResizeObserver();
  document.removeEventListener("pointerdown", onPointerDown, true);
});
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
        <div
          ref="highlightMenuRootEl"
          class="highlightPicker"
          :style="highlightPickerWrapStyle"
        >
          <IconButton
            :icon-html="icons.highlightMark"
            multicolor
            :active="hasHighlightTerms"
            :pressed="highlightMenuOpen"
            title="高亮词"
            aria-label="高亮词"
            @click.stop="toggleHighlightMenu"
          />
          <div
            v-if="highlightMenuOpen"
            class="highlightMenu"
            role="menu"
            @click.stop
          >
            <div
              ref="highlightMenuBodyRef"
              class="highlightMenuBody"
              :class="{
                'highlightMenuBody--scrollbarPad':
                  highlightMenuBodyHasScrollbar,
              }"
            >
              <div v-if="!hasHighlightTerms" class="highlightEmpty">
                当前文件暂无高亮词
              </div>
              <div v-else class="highlightList">
                <div
                  v-for="item in highlightTerms"
                  :key="`${item.colorIndex}-${item.text}`"
                  class="highlightItem"
                  role="menuitem"
                  tabindex="0"
                  :style="{
                    backgroundColor: highlightPreviewBg,
                    fontFamily: monacoFontFamily,
                  }"
                  @click="onHighlightItemClick(item.text)"
                  @keydown.enter.prevent="onHighlightItemClick(item.text)"
                >
                  <span
                    class="highlightText"
                    :style="{ color: item.color }"
                    :title="item.text"
                  >
                    {{ item.text }}
                  </span>
                  <button
                    type="button"
                    class="highlightRemoveBtn"
                    title="移除高亮词"
                    aria-label="移除高亮词"
                    @click="onRemoveHighlightTermClick($event, item.text)"
                  >
                    <span
                      class="highlightRemoveIcon"
                      v-html="icons.close"
                    ></span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
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
        :shortcut-bindings="shortcutBindings"
        @toggle-find="emit('toggleFind')"
        @open-github="emit('openGithub')"
        @check-for-updates="emit('checkForUpdates')"
        @open-shortcuts="emit('openShortcuts')"
        @open-settings="emit('openSettings')"
        @open-color-scheme="emit('openColorScheme')"
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

.highlightPicker {
  position: relative;
}

/* 弹层高于同块内笔尖按钮，避免 transform 子层与按钮层叠错乱 */
.highlightPicker > :deep(.iconBtn) {
  position: relative;
  z-index: 0;
}

.highlightMenu {
  position: absolute;
  top: 38px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2;
  min-width: 100px;
  max-width: 200px;
  overflow: visible;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 6px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
}

.highlightMenuBody {
  max-height: min(50vh, 420px);
  min-height: 0;
  overflow: auto;
  box-sizing: border-box;
}

/* 有纵向滚动条时与轨道留白；无条时不加此类（同 AppCustomSelect `.customSelectScroll--scrollbarPad`） */
.highlightMenuBody--scrollbarPad {
  padding-right: 6px;
}

.highlightMenu::before,
.highlightMenu::after {
  content: "";
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  pointer-events: none;
}

.highlightMenu::before {
  top: -8px;
  border-left: 8px solid transparent;
  border-right: 8px solid transparent;
  border-bottom: 8px solid var(--border);
}

.highlightMenu::after {
  top: -7px;
  border-left: 7px solid transparent;
  border-right: 7px solid transparent;
  border-bottom: 7px solid var(--bg);
}

.highlightList {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.highlightItem {
  border-radius: 6px;
  min-height: 34px;
  padding: 6px 4px 6px 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.highlightText {
  min-width: 0;
  flex: 1 1 auto;
  font-size: 16px;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.highlightRemoveBtn {
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--muted);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
}

.highlightItem:hover .highlightRemoveBtn,
.highlightItem:focus-within .highlightRemoveBtn {
  opacity: 1;
  pointer-events: auto;
}

.highlightRemoveBtn:hover {
  color: var(--danger);
}

.highlightRemoveIcon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.highlightRemoveIcon :deep(svg) {
  width: 9px;
  height: 9px;
  display: block;
}

.highlightRemoveIcon :deep(path) {
  fill: currentColor;
}

.highlightEmpty {
  color: var(--muted);
  font-size: 12px;
  padding: 8px 10px;
  text-align: center;
}

.toolbarDivider {
  width: 1px;
  height: 22px;
  background: var(--border);
  flex-shrink: 0;
  margin: 0 10px;
}
</style>
