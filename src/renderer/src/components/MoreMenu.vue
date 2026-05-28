<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import IconButton from "./IconButton.vue";
import { icons } from "../icons";
import type { ShortcutBindingMap } from "../services/shortcutRegistry";
import { acceleratorToDisplayText } from "../services/shortcutUtils";

type RecentFileItem = { path: string; progress?: number };

const props = withDefaults(
  defineProps<{
    recentFiles?: RecentFileItem[];
    shortcutBindings: ShortcutBindingMap;
  }>(),
  { recentFiles: () => [] },
);

const isMacPlatform = computed(() =>
  /mac|iphone|ipad|ipod/i.test(navigator.platform || ""),
);

function bindingLabel(accel: string) {
  return acceleratorToDisplayText(accel, isMacPlatform.value);
}

const findShortcutLabel = computed(() =>
  bindingLabel(props.shortcutBindings.toggleFind),
);
const settingsShortcutLabel = computed(() =>
  bindingLabel(props.shortcutBindings.openSettings),
);
const newWindowShortcutLabel = computed(() =>
  bindingLabel(props.shortcutBindings.openNewWindow),
);
const colorSchemeShortcutLabel = computed(() =>
  bindingLabel(props.shortcutBindings.openColorScheme),
);

const emit = defineEmits<{
  toggleFind: [];
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
}>();

const moreMenuOpen = ref(false);
const moreMenuRootEl = ref<HTMLElement | null>(null);
const recentSubOpen = ref(false);

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

function onOpenColorScheme() {
  closeMoreMenu();
  emit("openColorScheme");
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
    <div
      v-if="moreMenuOpen"
      class="moreMenuHost appShellMenuPanel"
      role="menu"
      @click.stop
    >
      <button class="appShellMenuItem" role="menuitem" @click="onToggleFind">
        <span class="appShellMenuIconSlot" v-html="icons.find"></span>
        <span class="appShellMenuLabel">查找</span>
        <span class="appShellMenuShortcut">{{ findShortcutLabel }}</span>
      </button>
      <div class="appShellMenuDivider" role="separator"></div>
      <div
        class="appShellMenuSubWrap"
        @mouseenter="recentSubOpen = true"
        @mouseleave="recentSubOpen = false"
      >
        <button
          type="button"
          class="appShellMenuItem"
          role="menuitem"
          aria-haspopup="menu"
          :aria-expanded="recentSubOpen"
        >
          <span class="appShellMenuIconSlot" aria-hidden="true"></span>
          <span class="appShellMenuLabel">打开最近的文件</span>
          <span class="appShellMenuSubChevron">›</span>
        </button>
        <div
          v-show="recentSubOpen"
          class="appShellMenuFlyout appShellMenuFlyout--left moreMenuRecentFlyout"
          role="menu"
          @click.stop
        >
          <template v-if="recentFiles.length">
            <div class="appShellMenuFlyoutList">
              <button
                v-for="item in recentFiles"
                :key="item.path"
                type="button"
                class="appShellMenuFlyoutItem appShellMenuFlyoutItem--rowBetween"
                role="menuitem"
                :title="item.path"
                @click="onOpenRecentFile(item.path)"
              >
                <span class="appShellMenuFlyoutLabel">{{
                  formatRecentLabel(item.path)
                }}</span>
                <span
                  class="appShellMenuFlyoutMeta"
                  :class="{
                    'appShellMenuFlyoutMeta--complete': isProgressComplete(
                      item.progress,
                    ),
                  }"
                  >{{ formatRecentProgress(item.progress) }}</span
                >
              </button>
            </div>
            <div
              class="appShellMenuDivider moreMenuDividerTight"
              role="separator"
            ></div>
            <button
              type="button"
              class="appShellMenuFlyoutItem appShellMenuFlyoutAction"
              role="menuitem"
              @click="onClearRecentFiles"
            >
              <span class="appShellMenuFlyoutLabel">清除最近打开的文件</span>
            </button>
          </template>
          <div v-else class="appShellMenuFlyoutEmpty">暂无记录</div>
        </div>
      </div>
      <button class="appShellMenuItem" role="menuitem" @click="onOpenNewWindow">
        <span class="appShellMenuIconSlot" v-html="icons.newWindow"></span>
        <span class="appShellMenuLabel">新窗口</span>
        <span class="appShellMenuShortcut">{{ newWindowShortcutLabel }}</span>
      </button>
      <div class="appShellMenuDivider" role="separator"></div>
      <button class="appShellMenuItem" role="menuitem" @click="onOpenShortcuts">
        <span class="appShellMenuIconSlot" v-html="icons.shortcut"></span>
        <span class="appShellMenuLabel">快捷键</span>
      </button>
      <button class="appShellMenuItem" role="menuitem" @click="onOpenSettings">
        <span class="appShellMenuIconSlot" v-html="icons.setting"></span>
        <span class="appShellMenuLabel">设置</span>
        <span class="appShellMenuShortcut">{{ settingsShortcutLabel }}</span>
      </button>
      <button class="appShellMenuItem" role="menuitem" @click="onOpenColorScheme">
        <span
          class="appShellMenuIconSlot appShellMenuIconSlot--colorful"
          v-html="icons.palette"
        ></span>
        <span class="appShellMenuLabel">配色</span>
        <span class="appShellMenuShortcut">{{ colorSchemeShortcutLabel }}</span>
      </button>
      <button class="appShellMenuItem" role="menuitem" @click="onCheckForUpdates">
        <span class="appShellMenuIconSlot" v-html="icons.update"></span>
        <span class="appShellMenuLabel">检查更新</span>
      </button>
      <button class="appShellMenuItem" role="menuitem" @click="onToggleDevTools">
        <span class="appShellMenuIconSlot" v-html="icons.devTools"></span>
        <span class="appShellMenuLabel">开发者工具</span>
      </button>
      <button class="appShellMenuItem" role="menuitem" @click="onOpenGithub">
        <span
          class="appShellMenuIconSlot appShellMenuIconSlot--github"
          v-html="icons.github"
        ></span>
        <span class="appShellMenuLabel">GitHub</span>
      </button>
      <button class="appShellMenuItem" role="menuitem" @click="onOpenAbout">
        <span class="appShellMenuIconSlot" v-html="icons.info"></span>
        <span class="appShellMenuLabel">关于</span>
      </button>
      <button class="appShellMenuItem" role="menuitem" @click="onQuit">
        <span class="appShellMenuIconSlot" v-html="icons.quit"></span>
        <span class="appShellMenuLabel">退出</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.moreMenuWrap {
  position: relative;
}

.moreMenuHost {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 5000;
  min-width: 200px;
}

.moreMenuHost::before,
.moreMenuHost::after {
  content: "";
  position: absolute;
  width: 0;
  height: 0;
  pointer-events: none;
}

.moreMenuHost::before {
  top: -8px;
  right: 6px;
  border-left: 8px solid transparent;
  border-right: 8px solid transparent;
  border-bottom: 8px solid var(--border);
}

.moreMenuHost::after {
  top: -7px;
  right: 7px;
  border-left: 7px solid transparent;
  border-right: 7px solid transparent;
  border-bottom: 7px solid var(--bg);
}

.moreMenuRecentFlyout {
  min-width: 260px;
}

.moreMenuDividerTight {
  margin: 4px 0;
}
</style>
