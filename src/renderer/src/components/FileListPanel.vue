<script setup lang="ts">
import { ref, watch, type ComponentPublicInstance } from "vue";
import AppContextMenu from "./AppContextMenu.vue";
import VirtualList from "./VirtualList.vue";
import { READER_SIDEBAR_ROW_STRIDE } from "../composables/useReaderSidebarLists";
import { fileHistoryKey } from "../stores/recentHistoryStore";

const props = withDefaults(
  defineProps<{
    files: Array<{
      name: string;
      path: string;
      size: number;
      progress?: number;
    }>;
    filesFiltered: Array<{
      name: string;
      path: string;
      size: number;
      progress?: number;
    }>;
    currentFilePath: string | null;
    fileFilterQuery: string;
    metaProgressMap?: Map<string, number>;
    liveReadingProgressPercent?: number;
  }>(),
  {
    metaProgressMap: () => new Map<string, number>(),
    liveReadingProgressPercent: undefined,
  },
);

function fileRowProgress(filePath: string): number | undefined {
  if (
    props.currentFilePath === filePath &&
    typeof props.liveReadingProgressPercent === "number"
  ) {
    return props.liveReadingProgressPercent;
  }
  return props.metaProgressMap.get(fileHistoryKey(filePath));
}

function isProgressComplete(progress: number | undefined): boolean {
  return typeof progress === "number" && progress >= 100;
}

const emit = defineEmits<{
  updateFileFilterQuery: [value: string];
  openFile: [filePath: string];
  clearFileList: [];
  removeFileList: [filePaths: string[]];
  bindListRef: [value: InstanceType<typeof VirtualList> | null];
}>();

function onBindListRef(value: Element | ComponentPublicInstance | null) {
  if (value && typeof value === "object" && "$el" in value) {
    emit("bindListRef", value as InstanceType<typeof VirtualList>);
    return;
  }
  emit("bindListRef", null);
}

const isEditingFileList = ref(false);
const selectedFilePaths = ref<string[]>([]);
const lastSelectedFilePath = ref<string | null>(null);
const fileContextMenuOpen = ref(false);
const fileContextMenuX = ref(0);
const fileContextMenuY = ref(0);
const fileContextMenuFilePath = ref<string | null>(null);
const fileContextMenuItems = [
  { id: "remove", label: "移除", type: "danger" as const },
  { id: "reveal", label: "在文件管理器中显示" },
];

watch(
  () => props.files,
  (nextFiles) => {
    if (selectedFilePaths.value.length === 0) return;
    const exists = new Set(nextFiles.map((f) => f.path));
    selectedFilePaths.value = selectedFilePaths.value.filter((p) =>
      exists.has(p),
    );
    if (
      lastSelectedFilePath.value &&
      !selectedFilePaths.value.includes(lastSelectedFilePath.value)
    ) {
      lastSelectedFilePath.value =
        selectedFilePaths.value.length > 0
          ? selectedFilePaths.value[selectedFilePaths.value.length - 1]
          : null;
    }
  },
);

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024)
    return `${(size / 1024).toFixed(1).replace(/\.0$/, "")} KB`;
  if (size < 1024 * 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
  }
  return `${(size / (1024 * 1024 * 1024)).toFixed(1).replace(/\.0$/, "")} GB`;
}

function formatFileReadProgress(progress: number) {
  return `${progress.toFixed(1).replace(/\.0$/, "")}%`;
}

function onFileItemClick(filePath: string, listIndex: number, ev: MouseEvent) {
  if (!isEditingFileList.value) {
    emit("openFile", filePath);
    return;
  }
  if (ev.shiftKey) {
    const anchor = lastSelectedFilePath.value;
    if (!anchor) {
      lastSelectedFilePath.value = filePath;
      if (!selectedFilePaths.value.includes(filePath)) {
        selectedFilePaths.value.push(filePath);
      }
      return;
    }
    const list = props.filesFiltered;
    const anchorIdx = list.findIndex((f) => f.path === anchor);
    const clickedIdx = listIndex;
    if (anchorIdx < 0 || clickedIdx < 0) {
      lastSelectedFilePath.value = filePath;
      if (!selectedFilePaths.value.includes(filePath)) {
        selectedFilePaths.value.push(filePath);
      }
      return;
    }
    const start = Math.min(anchorIdx, clickedIdx);
    const end = Math.max(anchorIdx, clickedIdx);
    const rangePaths = list.slice(start, end + 1).map((f) => f.path);
    selectedFilePaths.value = Array.from(
      new Set([...selectedFilePaths.value, ...rangePaths]),
    );
    lastSelectedFilePath.value = filePath;
    return;
  }
  const idx = selectedFilePaths.value.indexOf(filePath);
  if (idx >= 0) selectedFilePaths.value.splice(idx, 1);
  else selectedFilePaths.value.push(filePath);
  if (selectedFilePaths.value.includes(filePath)) {
    lastSelectedFilePath.value = filePath;
  } else {
    lastSelectedFilePath.value =
      selectedFilePaths.value.length > 0
        ? selectedFilePaths.value[selectedFilePaths.value.length - 1]
        : null;
  }
}

function enterEditFileListMode() {
  isEditingFileList.value = true;
  selectedFilePaths.value = [];
  lastSelectedFilePath.value = null;
}

function exitEditFileListMode() {
  isEditingFileList.value = false;
  selectedFilePaths.value = [];
  lastSelectedFilePath.value = null;
}

function onRemoveSelectedFileListItems() {
  const paths = selectedFilePaths.value;
  if (paths.length === 0) return;
  emit("removeFileList", paths.slice());
  selectedFilePaths.value = [];
  lastSelectedFilePath.value = null;
}

function closeFileContextMenu() {
  fileContextMenuOpen.value = false;
  fileContextMenuFilePath.value = null;
}

function onFileItemContextMenu(filePath: string, ev: MouseEvent) {
  ev.preventDefault();
  fileContextMenuFilePath.value = filePath;
  fileContextMenuX.value = ev.clientX;
  fileContextMenuY.value = ev.clientY;
  fileContextMenuOpen.value = true;
}

function onFileContextMenuSelect(actionId: string) {
  const filePath = fileContextMenuFilePath.value;
  if (!filePath) return;
  if (actionId === "remove") {
    emit("removeFileList", [filePath]);
  } else if (actionId === "reveal") {
    void window.colorTxt.showItemInFolder(filePath).catch(() => {});
  }
  closeFileContextMenu();
}
</script>

<template>
  <div class="sidebarListWrap">
    <div v-if="files.length === 0" class="empty">无文件</div>
    <template v-else>
      <div class="sidebarTabBody">
        <div class="fileFilterRow">
          <input
            :value="fileFilterQuery"
            class="fileFilterInput"
            type="search"
            spellcheck="false"
            autocomplete="off"
            placeholder="过滤文件名…"
            aria-label="过滤文件列表"
            @input="
              emit(
                'updateFileFilterQuery',
                ($event.target as HTMLInputElement).value,
              )
            "
          />
        </div>
        <div v-if="filesFiltered.length === 0" class="empty">无匹配文件</div>
        <div v-else class="sidebarListViewportPad">
          <VirtualList
            :ref="onBindListRef"
            class="sidebarList sidebarList--itemGap"
            :item-count="filesFiltered.length"
            :row-stride="READER_SIDEBAR_ROW_STRIDE"
            :overscan="10"
            :item-key="(i) => filesFiltered[i]?.path ?? i"
          >
            <template #default="{ index }">
              <button
                class="sidebarItem fileItem"
                :class="{
                  active: filesFiltered[index].path === currentFilePath,
                  'fileItem--last-selected':
                    isEditingFileList &&
                    lastSelectedFilePath === filesFiltered[index].path,
                }"
                :title="filesFiltered[index].path"
                @click="
                  onFileItemClick(filesFiltered[index].path, index, $event)
                "
                @contextmenu="
                  onFileItemContextMenu(filesFiltered[index].path, $event)
                "
              >
                <input
                  v-if="isEditingFileList"
                  class="fileItemCheckbox"
                  type="checkbox"
                  :checked="
                    selectedFilePaths.includes(filesFiltered[index].path)
                  "
                  tabindex="-1"
                  aria-hidden="true"
                />
                <span class="itemName">{{ filesFiltered[index].name }}</span>
                <span
                  v-if="
                    typeof fileRowProgress(filesFiltered[index].path) ===
                    'number'
                  "
                  class="itemMeta itemMeta--progress"
                  :class="{
                    'itemMeta--progress-complete': isProgressComplete(
                      fileRowProgress(filesFiltered[index].path),
                    ),
                  }"
                >
                  {{
                    formatFileReadProgress(
                      fileRowProgress(filesFiltered[index].path) as number,
                    )
                  }}
                </span>
                <span class="itemMeta">{{
                  formatFileSize(filesFiltered[index].size)
                }}</span>
              </button>
            </template>
          </VirtualList>
        </div>
      </div>
      <div class="sidebarTabFooter">
        <span v-if="isEditingFileList" class="sidebarTabFooterStat">
          已选中 {{ selectedFilePaths.length }} 个文件
        </span>
        <span v-else class="sidebarTabFooterStat"
          >共 {{ filesFiltered.length }} 个文件</span
        >
        <button
          v-if="!isEditingFileList"
          type="button"
          class="link sidebarTabFooterAction"
          @click="enterEditFileListMode"
        >
          编辑
        </button>
        <button
          v-if="!isEditingFileList"
          type="button"
          class="link hoverDanger sidebarTabFooterAction"
          :class="{
            'sidebarTabFooterAction--hidden': !!fileFilterQuery.trim(),
          }"
          :tabindex="fileFilterQuery.trim() ? -1 : 0"
          :aria-hidden="fileFilterQuery.trim() ? true : undefined"
          @click="emit('clearFileList')"
        >
          清空
        </button>
        <button
          v-if="isEditingFileList"
          type="button"
          class="link danger sidebarTabFooterAction"
          :disabled="selectedFilePaths.length === 0"
          @click="onRemoveSelectedFileListItems"
        >
          移除
        </button>
        <button
          v-if="isEditingFileList"
          type="button"
          class="link sidebarTabFooterAction"
          @click="exitEditFileListMode"
        >
          退出编辑
        </button>
      </div>
    </template>
    <AppContextMenu
      :open="fileContextMenuOpen"
      :x="fileContextMenuX"
      :y="fileContextMenuY"
      :items="fileContextMenuItems"
      :min-width="160"
      @close="closeFileContextMenu"
      @select="onFileContextMenuSelect"
    />
  </div>
</template>

<style scoped>
.sidebarListWrap {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.sidebarTabBody {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.fileFilterRow {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border);
  background: var(--bg);
}
.fileFilterInput {
  box-sizing: border-box;
  width: 100%;
}
.sidebarListViewportPad {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  /* 右侧由 .sidebar .virtualList-scroll.sidebarList 的 padding 控制列表与右缘间距 */
  padding: 6px 0 6px 6px;
  background: var(--bg);
}
.sidebarList {
  flex: 1 1 auto;
  min-height: 0;
  min-width: 0;
}
.sidebarList--itemGap :deep(.virtualList-row) {
  padding-bottom: 1px;
}
.sidebarItem {
  text-align: left;
  background: transparent;
  border: none;
  color: var(--list-item-fg);
  padding: 8px 10px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  gap: 8px;
  align-items: baseline;
}
.itemName {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.itemMeta {
  font-size: 12px;
  color: inherit;
  opacity: 0.65;
  white-space: nowrap;
}
.itemMeta--progress {
  color: var(--warning);
  opacity: 1;
}

.itemMeta--progress-complete {
  color: var(--success);
}
.sidebarItem:hover {
  color: var(--list-item-fg);
  background: var(--list-item-bg-hover);
}
.sidebarItem.active {
  color: var(--list-item-fg-active);
  background: var(--list-item-bg-active);
}
.empty {
  box-sizing: border-box;
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 10px 16px;
  font-size: 12px;
  color: var(--secondary);
}
.fileItem {
  align-items: center;
}
.fileItem--last-selected {
  box-shadow: inset 0 0 0 1px var(--accent);
}
.fileItemCheckbox {
  pointer-events: none;
  margin: 0;
  width: 14px;
  height: 14px;
}
.sidebarTabFooter {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  font-size: 12px;
  color: var(--muted);
  border-top: 1px solid var(--border);
  background: var(--bg);
  user-select: none;
}
.sidebarTabFooterStat {
  flex: 1;
  min-width: 0;
  text-align: left;
}
.sidebarTabFooterAction {
  flex-shrink: 0;
}
.sidebarTabFooterAction--hidden {
  visibility: hidden;
  pointer-events: none;
}
</style>
