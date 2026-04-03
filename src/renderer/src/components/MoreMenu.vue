<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import IconButton from "./IconButton.vue";
import { icons } from "../icons";

type RecentFileItem = { path: string; progress?: number };

withDefaults(
  defineProps<{
    recentFiles?: RecentFileItem[];
  }>(),
  { recentFiles: () => [] },
);

const emit = defineEmits<{
  toggleFind: [];
  openGithub: [];
  checkForUpdates: [];
  openShortcuts: [];
  openSettings: [];
  openNewWindow: [];
  openAbout: [];
  quitApp: [];
  openRecentFile: [filePath: string];
  clearRecentFiles: [];
}>();

const moreMenuOpen = ref(false);
const moreMenuRootEl = ref<HTMLElement | null>(null);
const recentSubOpen = ref(false);
const accelKey = computed(() =>
  /mac|iphone|ipad|ipod/i.test(navigator.platform || "") ? "Cmd" : "Ctrl",
);

function toggleMoreMenu() {
  moreMenuOpen.value = !moreMenuOpen.value;
}

function onDocPointerDown(ev: PointerEvent) {
  if (!moreMenuOpen.value) return;
  const root = moreMenuRootEl.value;
  if (!root) return;
  const t = ev.target as Node | null;
  if (t && root.contains(t)) return;
  moreMenuOpen.value = false;
}

function closeMoreMenu() {
  moreMenuOpen.value = false;
  recentSubOpen.value = false;
}

function basenameFromPath(filePath: string) {
  const p = filePath.replace(/\\/g, "/");
  const i = p.lastIndexOf("/");
  return i >= 0 ? p.slice(i + 1) : p;
}

function formatRecentLabel(filePath: string) {
  const base = basenameFromPath(filePath);
  return base.length > 36 ? `${base.slice(0, 33)}...` : base;
}

function formatRecentProgress(progress: number | undefined) {
  if (typeof progress !== "number") return "--";
  return `${progress.toFixed(1).replace(/\.0$/, "")}%`;
}

function isProgressComplete(progress: number | undefined): boolean {
  return typeof progress === "number" && progress >= 100;
}

function onOpenRecentFile(filePath: string) {
  closeMoreMenu();
  emit("openRecentFile", filePath);
}

function onClearRecentFiles() {
  closeMoreMenu();
  emit("clearRecentFiles");
}

function onToggleFind() {
  closeMoreMenu();
  emit("toggleFind");
}

function onOpenGithub() {
  closeMoreMenu();
  emit("openGithub");
}

function onCheckForUpdates() {
  closeMoreMenu();
  emit("checkForUpdates");
}

function onToggleDevTools() {
  closeMoreMenu();
  void window.colorTxt.toggleDevTools();
}

function onOpenAbout() {
  closeMoreMenu();
  emit("openAbout");
}

function onOpenShortcuts() {
  closeMoreMenu();
  emit("openShortcuts");
}

function onOpenSettings() {
  closeMoreMenu();
  emit("openSettings");
}

function onOpenNewWindow() {
  closeMoreMenu();
  emit("openNewWindow");
}

function onQuit() {
  closeMoreMenu();
  emit("quitApp");
}

onMounted(() => {
  document.addEventListener("pointerdown", onDocPointerDown, true);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onDocPointerDown, true);
});
</script>

<template>
  <div ref="moreMenuRootEl" class="moreMenuWrap">
    <IconButton
      :icon-html="icons.more"
      :active="moreMenuOpen"
      :pressed="moreMenuOpen"
      title="更多"
      aria-label="更多"
      aria-haspopup="menu"
      :aria-expanded="moreMenuOpen"
      @click.stop="toggleMoreMenu"
    />
    <div v-if="moreMenuOpen" class="moreMenu" role="menu" @click.stop>
      <button class="moreMenuItem" role="menuitem" @click="onToggleFind">
        <span class="moreMenuIcon" v-html="icons.find"></span>
        <span class="moreMenuLabel">查找</span>
        <span class="moreMenuShortcut">{{ accelKey }}+F</span>
      </button>
      <div class="moreMenuDivider" role="separator"></div>
      <div
        class="moreMenuSubWrap"
        @mouseenter="recentSubOpen = true"
        @mouseleave="recentSubOpen = false"
      >
        <button
          type="button"
          class="moreMenuItem moreMenuItem--sub"
          role="menuitem"
          aria-haspopup="menu"
          :aria-expanded="recentSubOpen"
        >
          <span class="moreMenuIcon" aria-hidden="true"></span>
          <span class="moreMenuLabel">打开最近的文件</span>
          <span class="moreMenuSubChevron">›</span>
        </button>
        <div
          v-show="recentSubOpen"
          class="moreMenuFlyout"
          role="menu"
          @click.stop
        >
          <template v-if="recentFiles.length">
            <div class="moreMenuFlyoutList">
              <button
                v-for="item in recentFiles"
                :key="item.path"
                type="button"
                class="moreMenuFlyoutItem"
                role="menuitem"
                :title="item.path"
                @click="onOpenRecentFile(item.path)"
              >
                <span class="moreMenuFlyoutLabel">{{
                  formatRecentLabel(item.path)
                }}</span>
                <span
                  class="moreMenuFlyoutMeta"
                  :class="{
                    'moreMenuFlyoutMeta--complete': isProgressComplete(
                      item.progress,
                    ),
                  }"
                  >{{ formatRecentProgress(item.progress) }}</span
                >
              </button>
            </div>
            <div
              class="moreMenuDivider moreMenuDivider--tight"
              role="separator"
            ></div>
            <button
              type="button"
              class="moreMenuFlyoutItem moreMenuFlyoutAction"
              role="menuitem"
              @click="onClearRecentFiles"
            >
              <span class="moreMenuFlyoutLabel">清除最近打开的文件</span>
            </button>
          </template>
          <div v-else class="moreMenuFlyoutEmpty">暂无记录</div>
        </div>
      </div>
      <button class="moreMenuItem" role="menuitem" @click="onOpenNewWindow">
        <span class="moreMenuIcon" v-html="icons.newWindow"></span>
        <span class="moreMenuLabel">新窗口</span>
        <span class="moreMenuShortcut">{{ accelKey }}+Shift+N</span>
      </button>
      <div class="moreMenuDivider" role="separator"></div>
      <button class="moreMenuItem" role="menuitem" @click="onOpenShortcuts">
        <span class="moreMenuIcon" v-html="icons.shortcut"></span>
        <span class="moreMenuLabel">快捷键</span>
      </button>
      <button class="moreMenuItem" role="menuitem" @click="onOpenSettings">
        <span class="moreMenuIcon" v-html="icons.setting"></span>
        <span class="moreMenuLabel">设置</span>
        <span class="moreMenuShortcut">F5</span>
      </button>
      <button class="moreMenuItem" role="menuitem" @click="onCheckForUpdates">
        <span class="moreMenuIcon" v-html="icons.update"></span>
        <span class="moreMenuLabel">检查更新</span>
      </button>
      <button class="moreMenuItem" role="menuitem" @click="onToggleDevTools">
        <span class="moreMenuIcon" v-html="icons.devTools"></span>
        <span class="moreMenuLabel">开发者工具</span>
      </button>
      <button class="moreMenuItem" role="menuitem" @click="onOpenGithub">
        <span
          class="moreMenuIcon moreMenuIcon--github"
          v-html="icons.github"
        ></span>
        <span class="moreMenuLabel">GitHub</span>
      </button>
      <button class="moreMenuItem" role="menuitem" @click="onOpenAbout">
        <span class="moreMenuIcon" v-html="icons.info"></span>
        <span class="moreMenuLabel">关于</span>
      </button>
      <button class="moreMenuItem" role="menuitem" @click="onQuit">
        <span class="moreMenuIcon" v-html="icons.quit"></span>
        <span class="moreMenuLabel">退出</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.moreMenuWrap {
  position: relative;
}

.moreMenu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 5000;
  min-width: 200px;
  padding: 6px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.35);
}

.moreMenuItem {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--list-item-fg);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.moreMenuItem:hover {
  background: var(--list-item-bg-hover);
  color: var(--list-item-fg);
}

.moreMenuSubWrap {
  position: relative;
}

.moreMenuSubChevron {
  flex-shrink: 0;
  color: var(--muted);
  font-size: 14px;
  line-height: 1;
}

.moreMenuFlyout {
  position: absolute;
  top: -6px;
  right: 100%;
  min-width: 260px;
  max-height: 320px;
  overflow: hidden;
  padding: 6px;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.35);
  display: flex;
  flex-direction: column;
}

.moreMenuFlyoutList {
  overflow: auto;
  min-height: 0;
}

.moreMenuFlyoutItem {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--list-item-fg);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.moreMenuFlyoutItem:hover {
  background: var(--list-item-bg-hover);
}

.moreMenuFlyoutAction {
  flex-shrink: 0;
}

.moreMenuDivider--tight {
  margin: 6px 0;
}

.moreMenuFlyoutLabel {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.moreMenuFlyoutMeta {
  flex-shrink: 0;
  color: var(--warning);
  font-size: 12px;
}

.moreMenuFlyoutMeta--complete {
  color: var(--success);
}

.moreMenuFlyoutEmpty {
  padding: 8px 10px;
  color: var(--muted);
  font-size: 12px;
}

.moreMenuIcon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--icon-btn-fg);
}

.moreMenuIcon :deep(svg) {
  width: 16px;
  height: 16px;
  display: block;
}

.moreMenuIcon:not(.moreMenuIcon--github) :deep(path) {
  fill: currentColor;
}

.moreMenuIcon--github :deep(path) {
  fill: var(--icon-btn-fg);
}

.moreMenuLabel {
  flex: 1;
  min-width: 0;
}

.moreMenuShortcut {
  flex-shrink: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1;
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
    "Courier New", monospace;
}

.moreMenuDivider {
  height: 1px;
  margin: 6px 4px;
  background: var(--border);
}
</style>
